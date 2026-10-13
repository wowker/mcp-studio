package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"mcp-studio/internal/agent/pairing"
	"os"
	"runtime"
	"strings"
	"sync"
)

// confirmTerminal always uses the native controlling terminal, never an HTTP request or piped stdin.
func confirmTerminal() pairing.ConfirmLocal {
	var mu sync.Mutex
	return func(ctx context.Context, p pairing.Prompt) (bool, error) {
		mu.Lock()
		defer mu.Unlock()
		path := "/dev/tty"
		if runtime.GOOS == "windows" {
			path = "CONIN$"
		}
		terminal, err := os.OpenFile(path, os.O_RDWR, 0)
		if err != nil {
			return false, fmt.Errorf("native_confirmation_unavailable")
		}
		defer terminal.Close()
		var output io.Writer = terminal
		if runtime.GOOS == "windows" {
			out, err := os.OpenFile("CONOUT$", os.O_WRONLY, 0)
			if err != nil {
				return false, fmt.Errorf("native_confirmation_unavailable")
			}
			defer out.Close()
			output = out
		}
		writeConfirmationPrompt(output, p)
		line := make(chan string, 1)
		go func() { text, _ := bufio.NewReader(terminal).ReadString('\n'); line <- text }()
		select {
		case <-ctx.Done():
			return false, ctx.Err()
		case text := <-line:
			return strings.TrimSpace(text) == "approve", nil
		}
	}
}

func writeConfirmationPrompt(output io.Writer, p pairing.Prompt) {
	fmt.Fprintf(output, "\nMCP Studio Agent local approval\nWorkbench Origin: %q\nPlatform user: %q\nDevice: %q\nCapabilities: %q\n", p.Challenge.Origin, p.Challenge.UserID, p.Challenge.DeviceID, p.Challenge.Capabilities)
	if p.Code != "" {
		fmt.Fprintf(output, "One-time pairing code (60 seconds): %q\n", p.Code)
	}
	if p.Command != "" {
		fmt.Fprintf(output, "Program: %q\nArguments: %q\nDirectory: %q\nEnvironment variable names: %q\n", p.Command, p.Args, p.Cwd, p.EnvironmentNames)
	}
	fmt.Fprint(output, "Type approve to allow, anything else to deny: ")
}
