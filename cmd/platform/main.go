package main

import (
	"context"
	"encoding/base64"
	"errors"
	"log"
	"mcp-studio/internal/infrastructure"
	"mcp-studio/internal/platform"
	"mcp-studio/migrations"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}
func duration(key string, fallback time.Duration) (time.Duration, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil || d <= 0 {
		return 0, errors.New("invalid session duration configuration")
	}
	return d, nil
}
func positiveInteger(key string, fallback int64) (int64, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n <= 0 {
		return 0, errors.New("invalid record storage configuration")
	}
	return n, nil
}
func recordStorageConfig() (int64, int, int, time.Duration, error) {
	limit, err := positiveInteger("MCP_STUDIO_RECORD_CAPACITY_BYTES", 5<<30)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	days, err := positiveInteger("MCP_STUDIO_HISTORY_RETENTION_DAYS", 90)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	max, err := positiveInteger("MCP_STUDIO_MAX_HISTORY_RETENTION_DAYS", 90)
	if err != nil || days > max || max > 365000 {
		return 0, 0, 0, 0, errors.New("invalid record retention configuration")
	}
	interval, err := duration("MCP_STUDIO_RECORD_SWEEP_INTERVAL", time.Hour)
	if err != nil {
		return 0, 0, 0, 0, errors.New("invalid record sweep interval")
	}
	return limit, int(days), int(max), interval, nil
}
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
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	origin := os.Getenv("MCP_STUDIO_ORIGIN")
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || u.User != nil {
		return errors.New("exact origin configuration required")
	}
	listen := os.Getenv("MCP_STUDIO_LISTEN")
	if listen == "" {
		listen = "127.0.0.1:8080"
	}
	allow, _ := strconv.ParseBool(os.Getenv("MCP_STUDIO_ALLOW_INSECURE_LOOPBACK"))
	host, _, err := net.SplitHostPort(listen)
	if err != nil {
		return errors.New("invalid listen configuration")
	}
	ip := net.ParseIP(host)
	if u.Scheme != "https" && !(allow && u.Scheme == "http" && (u.Hostname() == "localhost" || net.ParseIP(u.Hostname()) != nil && net.ParseIP(u.Hostname()).IsLoopback()) && (host == "localhost" || ip != nil && ip.IsLoopback())) {
		return errors.New("HTTPS required; insecure mode restricted to loopback")
	}
	idle, err := duration("MCP_STUDIO_SESSION_IDLE", 8*time.Hour)
	if err != nil {
		return err
	}
	absolute, err := duration("MCP_STUDIO_SESSION_ABSOLUTE", 24*time.Hour)
	if err != nil {
		return err
	}
	limit, days, maxDays, sweepInterval, err := recordStorageConfig()
	if err != nil {
		return err
	}
	key, err := backupKey()
	if err != nil {
		return err
	}
	databaseURL, err := infrastructure.Secret("MCP_STUDIO_DATABASE_URL")
	if err != nil {
		return err
	}
	initial, err := infrastructure.Secret("MCP_STUDIO_INIT_CREDENTIAL")
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
	cfg := platform.Config{BackupKey: key, Origin: origin, StaticDir: os.Getenv("MCP_STUDIO_STATIC_DIR"), BootstrapCredential: initial, CookieSecure: u.Scheme == "https", Idle: idle, Absolute: absolute, RecordCapacityBytes: limit, HistoryRetentionDays: days, MaxHistoryRetentionDays: maxDays}
	a := &platform.App{DB: db, Now: time.Now, Config: cfg}
	if addr := os.Getenv("MCP_STUDIO_SMTP_ADDRESS"); addr != "" {
		a.Mail = infrastructure.SMTP{Address: addr, From: os.Getenv("MCP_STUDIO_SMTP_FROM"), Username: os.Getenv("MCP_STUDIO_SMTP_USERNAME"), Password: smtpPassword, AllowInsecureLoopback: allow}
	}
	// The job is cancellable and joined before the database pool closes. Errors
	// expose no stored content, credentials or database connection strings.
	jobCtx, cancelJob := context.WithCancel(ctx)
	jobDone := make(chan struct{})
	go func() {
		defer close(jobDone)
		ticker := time.NewTicker(sweepInterval)
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
