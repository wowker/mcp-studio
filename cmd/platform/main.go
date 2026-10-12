package main

import (
	"context"
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
	db, err := infrastructure.Database(ctx, os.Getenv("MCP_STUDIO_DATABASE_URL"))
	if err != nil {
		return err
	}
	defer db.Close()
	if err = migrations.Apply(ctx, db); err != nil {
		return errors.New("database migration failed")
	}
	cfg := platform.Config{Origin: origin, StaticDir: os.Getenv("MCP_STUDIO_STATIC_DIR"), BootstrapCredential: os.Getenv("MCP_STUDIO_INIT_CREDENTIAL"), CookieSecure: u.Scheme == "https", Idle: idle, Absolute: absolute}
	a := &platform.App{DB: db, Now: time.Now, Config: cfg}
	if addr := os.Getenv("MCP_STUDIO_SMTP_ADDRESS"); addr != "" {
		a.Mail = infrastructure.SMTP{Address: addr, From: os.Getenv("MCP_STUDIO_SMTP_FROM"), Username: os.Getenv("MCP_STUDIO_SMTP_USERNAME"), Password: os.Getenv("MCP_STUDIO_SMTP_PASSWORD"), AllowInsecureLoopback: allow}
	}
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
