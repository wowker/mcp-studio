package main

import (
	"context"
	"errors"
	"fmt"
	"mcp-studio/internal/agent/localapi"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/process"
	"mcp-studio/internal/agent/queue"
	"mcp-studio/internal/agent/sessions"
	"mcp-studio/internal/agent/vault"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func main() {
	options, err := parseOptions(os.Args[1:])
	if err == nil {
		err = run(options)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "MCP Studio Agent:", err)
		os.Exit(1)
	}
}
func run(o options) error {
	if info, err := os.Lstat(o.Directory); err == nil && (info.Mode()&os.ModeSymlink != 0 || !info.IsDir()) {
		return errors.New("unsafe_state_directory")
	}
	if err := os.MkdirAll(o.Directory, 0700); err != nil {
		return errors.New("state_directory_unavailable")
	}
	lock, err := process.Lock(filepath.Join(o.Directory, "agent.lock"))
	if err != nil {
		return err
	}
	defer lock.Close()
	device, err := deviceIdentity(o.Directory, o.DeviceID)
	if err != nil {
		return err
	}
	keys := vault.NewSystemMasterStore()
	dataDirectory := filepath.Join(o.Directory, "data")
	store, err := vault.NewStore(dataDirectory, device, keys)
	if err != nil {
		return err
	}
	defer store.Close()
	q, err := queue.New(dataDirectory, device, keys)
	if err != nil {
		return err
	}
	defer q.Close()
	if o.Memory {
		if err = q.SetRetention("memory"); err != nil {
			return err
		}
		fmt.Fprintln(os.Stderr, "Volatile queue selected: pending Agent records are lost when the Agent stops.")
	}
	var platform *platformclient.Client
	if o.AllowInsecureLoopback && strings.HasPrefix(o.Origin, "http://") {
		platform, err = platformclient.NewInsecureLoopback(o.Origin, nil)
	} else {
		platform, err = platformclient.New(o.Origin, nil)
	}
	if err != nil {
		return err
	}
	confirmation := confirmTerminal()
	engine := sessions.New(sessions.Config{Platform: platform, Queue: q, Vault: store, Confirm: confirmation})
	defer engine.Close()
	mode := "encrypted"
	if o.Memory {
		mode = "memory"
	}
	api, err := localapi.New(localapi.Config{Origin: o.Origin, Host: o.Listen, DeviceID: device, AllowInsecureLoopback: o.AllowInsecureLoopback, Platform: platform, Confirm: confirmation, Engine: engine, IsVaultAvailable: store.Available, QueueMode: q.Mode, QueueRetention: mode})
	if err != nil {
		return err
	}
	listener, err := localapi.Listen(o.Listen)
	if err != nil {
		return errors.New("loopback_listener_unavailable")
	}
	defer listener.Close()
	server := &http.Server{Handler: api, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16384}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	result := make(chan error, 1)
	go func() { result <- server.Serve(listener) }()
	fmt.Fprintln(os.Stderr, "MCP Studio Agent listening on", o.Listen, "for", o.Origin)
	select {
	case err := <-result:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return errors.New("agent_server_stopped")
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
		return nil
	}
}
func deviceIdentity(directory, requested string) (string, error) {
	path := filepath.Join(directory, "device-id")
	if info, err := os.Lstat(path); err == nil && info.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("unsafe_device_identity")
	}
	raw, err := os.ReadFile(path)
	if err == nil {
		device := strings.TrimSpace(string(raw))
		if !vault.ValidID(device) || requested != "" && requested != device {
			return "", errors.New("device_identity_mismatch")
		}
		return device, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", errors.New("device_identity_unavailable")
	}
	device := requested
	if device == "" {
		device = pairing.Random()
	}
	if !vault.ValidID(device) {
		return "", errors.New("invalid_device_identity")
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", errors.New("device_identity_unavailable")
	}
	_, err = f.WriteString(device + "\n")
	if err == nil {
		err = f.Sync()
	}
	f.Close()
	if err != nil {
		return "", errors.New("device_identity_unavailable")
	}
	return device, nil
}
