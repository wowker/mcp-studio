package main

import (
	"bytes"
	"mcp-studio/internal/agent/pairing"
	"strconv"
	"strings"
	"testing"
)

func TestNativeConfirmationQuotesEveryUntrustedTerminalValue(t *testing.T) {
	p := pairing.Prompt{Challenge: pairing.Challenge{Origin: "https://work.example/\x1b[2J", UserID: "user\x1b[H", DeviceID: "device\x1b[31m", Capabilities: []string{"stdio\x1b[2J"}}, Command: "/tmp/bin/\x1b[2Jprogram", Cwd: "/tmp/\x1b[Hdirectory", Args: []string{"literal ; $(echo untouched)", "line\nbreak", "\x1b[1mvalue"}, EnvironmentNames: []string{"NAME\x1b[2J"}}
	var output bytes.Buffer
	writeConfirmationPrompt(&output, p)
	text := output.String()
	if strings.ContainsRune(text, '\x1b') {
		t.Fatal("raw terminal escape reached local approval")
	}
	for _, value := range []string{p.Challenge.Origin, p.Challenge.UserID, p.Challenge.DeviceID, p.Command, p.Cwd, p.Args[0], p.Args[1], p.Args[2], p.EnvironmentNames[0]} {
		if !strings.Contains(text, strconv.Quote(value)) {
			t.Fatalf("source value lost instead of safely quoted: %q", value)
		}
	}
	if p.Args[1] != "line\nbreak" || p.Command != "/tmp/bin/\x1b[2Jprogram" {
		t.Fatal("display modified actual execution input")
	}
}
