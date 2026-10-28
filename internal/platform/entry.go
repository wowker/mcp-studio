package platform

import (
	"context"
	"encoding/base64"
	"errors"
	"log"
	"mcp-studio/internal/infrastructure"
	"mcp-studio/migrations"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func backupKey() ([]byte, error) {
	raw, err := infrastructure.Secret("MCP_STUDIO_BACKUP_KEY")
	if err != nil {
		return nil, err
	}
	if raw == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || len(key) != 32 {
		return nil, errors.New("invalid backup key configuration")
	}
	return key, nil
}

// Run loads the layered deployment configuration and serves the cloud platform
// until the process is interrupted. Edition shells stay free of domain logic;
// startup sequencing lives here.
func Run(options Options) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	settings, err := loadSettings(options.Defaults)
	if err != nil {
		return err
	}
	origin := settings.Origin
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || u.User != nil {
		return errors.New("exact origin configuration required")
	}
	listen := settings.Listen
	allow := settings.AllowInsecure(CurrentEdition)
	host, _, err := net.SplitHostPort(listen)
	if err != nil {
		return errors.New("invalid listen configuration")
	}
	ip := net.ParseIP(host)
	if u.Scheme != "https" && !(allow && u.Scheme == "http" && (u.Hostname() == "localhost" || net.ParseIP(u.Hostname()) != nil && net.ParseIP(u.Hostname()).IsLoopback()) && (host == "localhost" || ip != nil && ip.IsLoopback())) {
		return errors.New("HTTPS required; insecure mode restricted to loopback")
	}
	var initial string
	if PolicyFor(CurrentEdition).ReadBootstrapCredential {
		initial, err = infrastructure.Secret("MCP_STUDIO_INIT_CREDENTIAL")
		if err != nil {
			return err
		}
	}
	key, err := backupKey()
	if err != nil {
		return err
	}
	databaseURL, err := infrastructure.Secret("MCP_STUDIO_DATABASE_URL")
	if err != nil {
		return err
	}
	smtpPassword, err := infrastructure.Secret("MCP_STUDIO_SMTP_PASSWORD")
	if err != nil {
		return err
	}
	db, err := infrastructure.Database(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	if err = migrations.Apply(ctx, db); err != nil {
		return errors.New("database migration failed")
	}
	cfg := Config{BackupKey: key, Origin: origin, StaticDir: settings.StaticDir, BootstrapCredential: initial, CookieSecure: u.Scheme == "https", Idle: settings.SessionIdle, Absolute: settings.SessionAbsolute, RecordCapacityBytes: settings.RecordCapacityBytes, HistoryRetentionDays: settings.HistoryRetentionDays, MaxHistoryRetentionDays: settings.MaxHistoryRetentionDays}
	a := &App{DB: db, Now: time.Now, Config: cfg}
	if settings.SMTPAddress != "" {
		a.Mail = infrastructure.SMTP{Address: settings.SMTPAddress, From: settings.SMTPFrom, Username: settings.SMTPUsername, Password: smtpPassword, AllowInsecureLoopback: allow}
	}
	// The job is cancellable and joined before the database pool closes. Errors
	// expose no stored content, credentials or database connection strings.
	jobCtx, cancelJob := context.WithCancel(ctx)
	jobDone := make(chan struct{})
	go func() {
		defer close(jobDone)
		ticker := time.NewTicker(settings.RecordSweepInterval)
		defer ticker.Stop()
		for {
			if err := a.Sweep(jobCtx); err != nil && jobCtx.Err() == nil {
				log.Print("record lifecycle cleanup failed")
			}
			select {
			case <-jobCtx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	defer func() { cancelJob(); <-jobDone }()
	server := &http.Server{Addr: listen, Handler: a.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10}
	errCh := make(chan error, 1)
	go func() { errCh <- server.ListenAndServe() }()
	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	case err = <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return errors.New("platform listener failed")
	}
}
