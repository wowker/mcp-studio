package main

import (
	"encoding/json"
	"io"
	"mcp-studio/internal/agent/lifecycle"
	"os"
	"runtime"
	"runtime/debug"
)

// Injected only by the candidate builder; no production support is implied.
var version = "development"
var revision = "unknown"

func execute(o options, output io.Writer) error {
	if o.Version || o.Diagnose {
		cgo := "unknown"
		if info, ok := debug.ReadBuildInfo(); ok {
			for _, s := range info.Settings {
				if s.Key == "CGO_ENABLED" {
					cgo = s.Value
				}
			}
		}
		return json.NewEncoder(output).Encode(struct {
			Version      string `json:"version"`
			Revision     string `json:"revision"`
			OS           string `json:"os"`
			Arch         string `json:"arch"`
			Go           string `json:"go"`
			CGO          string `json:"cgo"`
			Support      string `json:"support"`
			Vault        string `json:"vault"`
			Confirmation string `json:"confirmation"`
		}{version, revision, runtime.GOOS, runtime.GOARCH, runtime.Version(), cgo, "pending-native-validation", "not-probed", "native-terminal-required"})
	}
	action, prefix := "", ""
	if o.InstallPrefix != "" {
		action, prefix = "install", o.InstallPrefix
	}
	if o.UpgradePrefix != "" {
		action, prefix = "upgrade", o.UpgradePrefix
	}
	if o.UninstallPrefix != "" {
		action, prefix = "uninstall", o.UninstallPrefix
	}
	if action != "" {
		source, err := os.Executable()
		if err != nil {
			return err
		}
		return lifecycle.Apply(action, prefix, o.Directory, source)
	}
	source, err := os.Executable()
	if err != nil {
		return err
	}
	guard, err := lifecycle.GuardRuntime(source, o.Directory)
	if err != nil {
		return err
	}
	if guard != nil {
		defer guard.Close()
	}
	return run(o)
}
