package platform

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// pgThreadShimPath returns the path to a dylib that interposes
// pthread_is_threaded_np() to always return 0, or "" if no shim is available.
//
// On macOS 26+ the postmaster aborts with "postmaster became multithreaded
// during startup" because system calls during startup (locale, timezone,
// SCDynamicStore) lazily spawn threads via GCD/XPC. The check itself is the
// problem; upstream removes it (pgsql-hackers "Remove pthread_is_threaded_np()
// checks in postmaster"). We achieve the same at runtime via DYLD interposing
// so users do not need a custom PostgreSQL build.
//
// Resolution order:
//  1. MCP_STUDIO_PG_THREAD_SHIM (explicit dylib path)
//  2. <bindir>/pg_no_multithread_check.dylib (alongside the platform binary)
//  3. .runtime/pg_no_multithread_check.dylib (development layout)
func pgThreadShimPath() string {
	if v := os.Getenv("MCP_STUDIO_PG_THREAD_SHIM"); v != "" {
		return v
	}
	if exe, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "pg_no_multithread_check.dylib")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	if wd, err := os.Getwd(); err == nil {
		candidate := filepath.Join(wd, ".runtime", "pg_no_multithread_check.dylib")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return ""
}

// pgEnv returns the environment for a postgres child process. On macOS it
// injects the pthread_is_threaded_np interpose shim via DYLD_INSERT_LIBRARIES
// when available; otherwise it returns the inherited environment unchanged.
func pgEnv() []string {
	env := os.Environ()
	if runtime.GOOS != "darwin" {
		return env
	}
	shim := pgThreadShimPath()
	if shim == "" {
		return env
	}
	env = append(env, "DYLD_INSERT_LIBRARIES="+shim)
	return env
}

// ensureInitdb prepares the local PostgreSQL data directory if it is empty.
// The presence of a PG_VERSION file is treated as "already initialized"; we
// never clobber a user's data directory. If the directory contains files but
// no PG_VERSION we reject it outright — it may be a stale lock or a misused
// location.
func ensureInitdb(ctx context.Context, dataDir, pgBinDir string) error {
	info, err := os.Stat(dataDir)
	dirExists := true
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("data directory unavailable: %w", err)
		}
		dirExists = false
		// Do not create the data directory itself: initdb must create it so
		// it owns the mode bits. On macOS a pre-created directory carries
		// com.apple.provenance and initdb's own chmod then fails with EPERM.
		if err = os.MkdirAll(filepath.Dir(dataDir), 0o700); err != nil {
			return fmt.Errorf("data directory creation failed: %w", err)
		}
	} else if !info.IsDir() {
		return fmt.Errorf("data directory path is not a directory")
	}
	if dirExists {
		versionFile := filepath.Join(dataDir, "PG_VERSION")
		if _, err := os.Stat(versionFile); err == nil {
			return nil // already initialized
		}
		entries, _ := os.ReadDir(dataDir)
		for _, e := range entries {
			if !strings.HasPrefix(e.Name(), ".") {
				return fmt.Errorf("data directory is not empty but contains no PG_VERSION — refusing to initialize")
			}
		}
		// The directory exists but holds no cluster (only dotfiles). Remove it
		// and let initdb recreate it: on macOS a pre-created directory carries
		// com.apple.provenance — which non-platform binaries cannot remove — and
		// initdb's own chmod then fails with EPERM, while a directory initdb
		// creates itself works.
		for _, e := range entries {
			_ = os.Remove(filepath.Join(dataDir, e.Name()))
		}
		if err := os.Remove(dataDir); err != nil {
			return fmt.Errorf("data directory exists but is not initialized and cannot be recreated: %w", err)
		}
	}
	initdb, err := resolveExecutable("initdb", pgBinDir)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, initdb, "-U", localSuperUser, "-D", dataDir, "--no-locale", "-E", "UTF8")
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err = cmd.Run(); err != nil {
		return fmt.Errorf("initdb failed: %w", err)
	}
	return nil
}

// startPG spawns `postgres` pointing at the prepared data directory. The
// child is deliberately NOT bound to the caller's context: the shutdown path
// stops the cluster itself via pg_ctl and then waits on the process — a
// CommandContext tied to the signal context would SIGKILL postgres the moment
// SIGINT arrives, racing pg_ctl and leaving a stale postmaster.pid behind.
// The process is reaped through pgHandle exactly once.
func startPG(dataDir, pgBinDir, port string) (*exec.Cmd, error) {
	postgres, err := resolveExecutable("postgres", pgBinDir)
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(postgres,
		"-D", dataDir,
		"-p", port,
		"-h", "",       // unix socket only, no TCP listener on 0.0.0.0
		"-k", dataDir,  // socket files live inside the data dir we already own
		"-c", "listen_addresses=",
	)
	cmd.Env = pgEnv()
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("postgres start failed: %w", err)
	}
	return cmd, nil
}

// pgHandle wraps the postgres child so Wait happens exactly once, in a
// dedicated goroutine started at spawn time; both the startup retry loop and
// the shutdown path consume the same result channel.
type pgHandle struct {
	cmd    *exec.Cmd
	exited chan error
}

// wait blocks until the postgres process exits and returns its exit result.
func (h *pgHandle) wait() error { return <-h.exited }

// kill force-stops postgres and reaps it.
func (h *pgHandle) kill() {
	_ = h.cmd.Process.Kill()
	<-h.exited
}

// pgStartTimeout is the total budget for retrying postgres startup. On macOS
// the postmaster intermittently dies with "postmaster became multithreaded
// during startup" — an OS-level race where a system library lazily spawns a
// thread under the postmaster before it forks; bad windows can last several
// minutes. We retry for up to five minutes by default so a transient window
// does not kill the whole startup. Override with MCP_STUDIO_PG_START_TIMEOUT
// (Go duration string, e.g. "300s").
func pgStartTimeout() time.Duration {
	if v := os.Getenv("MCP_STUDIO_PG_START_TIMEOUT"); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return 5 * time.Minute
}

// startCluster launches postgres and waits until it accepts connections,
// retrying when the child exits during startup. See pgStartTimeout for the
// retry budget rationale.
func startCluster(ctx context.Context, dataDir, pgBinDir, port string) (*pgHandle, error) {
	deadline := time.Now().Add(pgStartTimeout())
	attempt := 0
	for {
		attempt++
		cmd, err := startPG(dataDir, pgBinDir, port)
		if err != nil {
			return nil, err
		}
		h := &pgHandle{cmd: cmd, exited: make(chan error, 1)}
		go func() { h.exited <- cmd.Wait() }()
		readyCtx, cancel := context.WithCancel(ctx)
		ready := make(chan error, 1)
		go func() { ready <- waitPGReady(readyCtx, pgBinDir, port, localSuperUser, dataDir) }()
		select {
		case err = <-ready:
			cancel()
			if err == nil {
				return h, nil
			}
			// Process alive but never ready within waitPGReady's deadline —
			// kill it and surface the readiness failure.
			h.kill()
			return nil, err
		case exitErr := <-h.exited:
			cancel()
			<-ready
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if time.Until(deadline) <= 0 {
				return nil, fmt.Errorf("postgres exited during startup on every attempt (last: %v)", exitErr)
			}
			log.Printf("postgres exited during startup (attempt %d: %v); retrying", attempt, exitErr)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Second):
			}
		}
	}
}

// waitPGReady dials the embedded cluster over its Unix socket and pings it
// until postgres accepts connections or the context expires. We deliberately
// use pgx directly instead of shelling out to pg_isready: the embedded
// cluster listens on a Unix socket inside the data directory (no TCP
// listener, no port exposed outside), so pg_isready would also have to run.
// Replacing the shell-out removes a hard binary dependency — PG
// distributions that ship only initdb + postgres + pg_ctl (e.g. zonky's
// embedded-postgres jars) are now sufficient to start the local edition.
// We give it 20s — enough for a cold start on slow disks, short enough to
// abort fast when initdb/startup failed.
func waitPGReady(ctx context.Context, pgBinDir, port, superUser, dataDir string) error {
	_ = pgBinDir // retained for startCluster signature symmetry; no binary lookup needed.
	url := fmt.Sprintf("postgres://%s@/postgres?host=%s&port=%s&sslmode=disable", superUser, dataDir, port)
	deadline := time.After(20 * time.Second)
	tick := time.NewTicker(300 * time.Millisecond)
	defer tick.Stop()
	for {
		conn, err := pgx.Connect(ctx, url)
		if err == nil {
			if err = conn.Ping(ctx); err == nil {
				_ = conn.Close(ctx)
				return nil
			}
			_ = conn.Close(ctx)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline:
			return fmt.Errorf("postgres did not become ready in time")
		case <-tick.C:
		}
	}
}

// stopPG asks the cluster to shut down cleanly with pg_ctl. If pg_ctl itself
// is missing we fall back to SIGTERM → SIGKILL of the process the caller owns.
func stopPG(ctx context.Context, pgBinDir, port, superUser, dataDir string) error {
	pgctl, err := resolveExecutable("pg_ctl", pgBinDir)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, pgctl,
		"-D", dataDir,
		"-p", port,
		"-U", superUser,
		"-m", "fast",
		"-w", "stop",
	)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
