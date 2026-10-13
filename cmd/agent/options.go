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
	Origin, Listen, Directory, DeviceID string
	AllowInsecureLoopback, Memory       bool
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
	if err := f.Parse(args); err != nil {
		return o, err
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
