package main

import (
	"errors"
	"flag"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
)

type options struct {
	Origin, Listen, Directory, DeviceID           string
	AllowInsecureLoopback, Memory                 bool
	Version, Diagnose                             bool
	InstallPrefix, UpgradePrefix, UninstallPrefix string
}

func parseOptions(args []string) (options, error) {
	var o options
	f := flag.NewFlagSet("agent", flag.ContinueOnError)
	f.SetOutput(io.Discard)
	f.StringVar(&o.Origin, "origin", "", "exact HTTPS workbench Origin")
	f.StringVar(&o.Listen, "listen", "127.0.0.1:45455", "literal IPv4 loopback address")
	f.StringVar(&o.Directory, "state-dir", "", "absolute local Agent state directory")
	f.StringVar(&o.DeviceID, "device-id", "", "optional stable device identity")
	f.BoolVar(&o.AllowInsecureLoopback, "allow-insecure-loopback", false, "explicit local development HTTP Origin only")
	f.BoolVar(&o.Memory, "memory-only", false, "explicit volatile queue mode; pending records are lost when Agent exits")
	f.BoolVar(&o.Version, "version", false, "print build version without initializing state")
	f.BoolVar(&o.Diagnose, "diagnose", false, "print safe offline build diagnostics")
	f.StringVar(&o.InstallPrefix, "install-prefix", "", "new dedicated private installation directory")
	f.StringVar(&o.UpgradePrefix, "upgrade-prefix", "", "managed installation directory to upgrade")
	f.StringVar(&o.UninstallPrefix, "uninstall-prefix", "", "managed installation directory to uninstall")
	if err := f.Parse(args); err != nil || f.NArg() != 0 {
		return o, errors.New("invalid_agent_arguments")
	}
	modes := 0
	for _, set := range []bool{o.Version, o.Diagnose, o.InstallPrefix != "", o.UpgradePrefix != "", o.UninstallPrefix != ""} {
		if set {
			modes++
		}
	}
	if modes > 1 {
		return o, errors.New("one_agent_mode_required")
	}
	if o.Version || o.Diagnose {
		return o, nil
	}
	if modes == 1 {
		if o.Directory == "" || !filepath.IsAbs(o.Directory) {
			return o, errors.New("explicit_absolute_state_directory_required")
		}
		return o, nil
	}
	u, err := url.Parse(o.Origin)
	if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Scheme != "https" && !(o.AllowInsecureLoopback && u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost")) {
		return o, errors.New("exact_https_origin_required")
	}
	host, port, err := net.SplitHostPort(o.Listen)
	if err != nil || host != "127.0.0.1" || port == "" || port == "0" {
		return o, errors.New("literal_loopback_required")
	}
	if o.Directory == "" {
		root, err := os.UserConfigDir()
		if err != nil {
			return o, err
		}
		o.Directory = filepath.Join(root, "mcp-studio-agent")
	}
	if !filepath.IsAbs(o.Directory) {
		return o, errors.New("absolute_state_directory_required")
	}
	return o, nil
}
