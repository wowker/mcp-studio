//go:build local

package platform

import (
	"context"
	"fmt"
	"log"
	"mcp-studio/internal/infrastructure"
	"mcp-studio/migrations"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// RunLocal starts the single-binary local edition: locate or bootstrap a
// per-user PostgreSQL cluster, run the shared migrations, seed the single
// local user/team/project, then serve HTTP on the chosen loopback port until
// SIGINT or SIGTERM.
//
// The call sites are listed in the plan document — this implementation sits
// behind the `local` build tag so it can peacefully coexist with the cloud
// edition entry in entry.go.
func RunLocal(options Options) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	settings, err := loadSettings(options.Defaults)
	if err != nil {
		return err
	}

	dataDir, err := localDataDir()
	if err != nil {
		return fmt.Errorf("data directory resolution failed: %w", err)
	}
	pgBinDir := localPGBinDir()
	pgPort := localPGPort()
	listen := settings.Listen
	origin := settings.Origin

	if err = ensureInitdb(ctx, dataDir, pgBinDir); err != nil {
		return fmt.Errorf("embedded postgres init failed: %w", err)
	}

	pg, err := startCluster(ctx, dataDir, pgBinDir, pgPort)
	if err != nil {
		return fmt.Errorf("embedded postgres start failed: %w", err)
	}
	started := true
	defer func() {
		if started {
			pg.kill()
		}
	}()

	if err = ensureRoleAndDB(ctx, localSuperURL(pgPort, dataDir)); err != nil {
		return fmt.Errorf("embedded postgres role/db setup failed: %w", err)
	}

	db, err := infrastructure.LocalDatabase(ctx, localRoleURL(pgPort, dataDir))
	if err != nil {
		return fmt.Errorf("embedded postgres connection failed: %w", err)
	}
	defer db.Close()

	if err = migrations.Apply(ctx, db); err != nil {
		return fmt.Errorf("migrations failed: %w", err)
	}

	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("subject init transaction failed: %w", err)
	}
	subject, teams, err := ensureLocalSubject(ctx, tx)
	if err != nil {
		tx.Rollback(ctx)
		return fmt.Errorf("local subject init failed: %w", err)
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("local subject commit failed: %w", err)
	}

	cfg := Config{
		Origin:                origin,
		StaticDir:             settings.StaticDir,
		CookieSecure:          false,
		Idle:                  settings.SessionIdle,
		Absolute:              settings.SessionAbsolute,
		RecordCapacityBytes:   settings.RecordCapacityBytes,
		HistoryRetentionDays:  settings.HistoryRetentionDays,
		MaxHistoryRetentionDays: settings.MaxHistoryRetentionDays,
	}
	a := &App{DB: db, Now: time.Now, Config: cfg}
	a.initLocalSubject(subject, teams)

	// Record sweep background job — cancellable before database pool closes.
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

	server := &http.Server{
		Addr:              listen,
		Handler:           a.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}
	errCh := make(chan error, 1)
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()
	log.Printf("mcp-studio local edition listening on %s", listen)

	select {
	case <-ctx.Done():
		// Close HTTP first so in-flight handlers drain, then ask pg_ctl to
		// shut down cleanly — superuser inside the data dir owns the data, so
		// we want graceful shutdown before the OS process dies.
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		_ = server.Shutdown(shutdownCtx)
		shutdownCancel()
		started = false
		if stopErr := stopPG(context.Background(), pgBinDir, pgPort, localSuperUser, dataDir); stopErr != nil {
			log.Printf("pg_ctl stop reported: %v", stopErr)
		} else {
			if waitErr := pg.wait(); waitErr != nil {
				log.Printf("postgres wait reported: %v", waitErr)
			}
		}
		return nil
	case err := <-errCh:
		started = false
		_ = stopPG(context.Background(), pgBinDir, pgPort, localSuperUser, dataDir)
		return fmt.Errorf("platform listener failed: %w", err)
	}
}
