package sessions

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/vault"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBackupCurrentVersionResponseAndRestoreCredentialContract(t *testing.T) {
	version := 0
	conflict := false
	expected := []int{}
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		write := func(value any) { json.NewEncoder(w).Encode(map[string]any{"data": value}) }
		switch r.URL.Path {
		case "/api/v1/agent/session":
			write(wire.AgentSession{UserID: "u", DeviceID: "d", Origin: "https://work.example", ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339)})
		case "/api/v1/projects/p/connections/c":
			write(wire.Connection{ID: "c", ProjectID: "p", Version: 1})
		case "/api/v1/projects/p/variables":
			write([]wire.Variable{})
		case "/api/v1/projects/p/environments":
			write([]wire.Environment{})
		case "/api/v1/projects/p/record-redaction-policy":
			write(wire.RecordRedactionPolicy{ProjectID: "p"})
		case "/api/v1/projects/p/record-capacity":
			write(wire.RecordCapacity{ProjectID: "p"})
		case "/api/v1/projects/p/connections/c/session-access":
			write(wire.ConnectionAccess{UserID: "u", ProjectID: "p", ConnectionID: "c", Version: 1})
		case "/api/v1/projects/p/connections/c/credential-backups":
			if r.Method == "GET" {
				rows := []wire.CredentialBackup{}
				if version > 0 {
					rows = append(rows, wire.CredentialBackup{ID: "backup", Kind: "token", Version: version})
				}
				write(rows)
				return
			}
			var in wire.CredentialBackupInput
			json.NewDecoder(r.Body).Decode(&in)
			expected = append(expected, in.ExpectedVersion)
			if conflict {
				version++
				conflict = false
			}
			if in.ExpectedVersion != version {
				w.WriteHeader(409)
				return
			}
			version++
			write(wire.CredentialBackup{ID: "backup", Kind: "token", Version: version})
		case "/api/v1/projects/p/connections/c/credential-backups/backup/restore":
			write(wire.CredentialBackupSecret{Kind: "token", ValueJSON: `"restored-token"`})
		default:
			t.Error("unexpected route", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer up.Close()
	client, _ := platformclient.New("https://work.example", up.Client())
	client.BaseURL = up.URL
	store, err := vault.NewStore(t.TempDir(), "device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	store.Save(context.Background(), vault.Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "token"}, vault.Value{ValueJSON: `"local-token"`}, "session")
	e := New(Config{Platform: client, Vault: store})
	defer e.Close()
	s := pairing.Session{UserID: "u", Grant: pairing.Grant{Token: "private-grant", UserID: "u", DeviceID: "d", Origin: "https://work.example"}}
	send := func(path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "http://127.0.0.1"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		e.ServeAuthenticated(w, r, s)
		return w
	}
	body := `{"projectId":"p","connectionId":"c","kind":"token","referenceId":"","password":"test-password","confirmed":true}`
	for n := 1; n <= 2; n++ {
		w := send("/v1/credentials/backup", body)
		if w.Code != 200 {
			t.Errorf("backup %d: %d %s", n, w.Code, w.Body.String())
		}
		var envelope struct {
			Data agentwire.AgentBackups `json:"data"`
		}
		json.Unmarshal(w.Body.Bytes(), &envelope)
		var rows []wire.CredentialBackup
		if json.Unmarshal([]byte(envelope.Data.BackupsJSON), &rows) != nil || len(rows) != 1 || rows[0].Version != n {
			t.Errorf("backup contract %s", w.Body.String())
		}
	}
	if len(expected) != 2 || expected[0] != 0 || expected[1] != 1 {
		t.Error("versions", expected)
	}
	conflict = true
	if w := send("/v1/credentials/backup", body); w.Code != 409 {
		t.Fatal("concurrent revision silently overwritten", w.Code, w.Body.String())
	}
	w := send("/v1/credentials/restore", `{"projectId":"p","connectionId":"c","backupId":"backup","password":"test-password","confirmed":true,"retention":"session"}`)
	var result struct {
		Data agentwire.AgentCredentialState `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != 200 || !result.Data.Present || result.Data.Status != "saved" || result.Data.Kind != "token" || result.Data.ProjectID != "p" || strings.Contains(w.Body.String(), "restored-token") {
		t.Fatal("restore contract", w.Code, w.Body.String())
	}
}
