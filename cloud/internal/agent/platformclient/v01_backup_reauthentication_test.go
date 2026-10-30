package platformclient

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBackupReauthenticationFailurePreservesRetryAndErrorIdentity(t *testing.T) {
	for _, operation := range []string{"create", "restore"} {
		t.Run(operation, func(t *testing.T) {
			path := "/api/v1/projects/p/connections/c/credential-backups"
			if operation == "restore" {
				path += "/backup/restore"
			}
			attempts, accepted, validations := 0, 0, 0
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "Bearer fixture-grant" {
					t.Error("backup request mixed platform cookie and Agent grant")
				}
				if r.URL.Path == "/api/v1/agent/session" {
					validations++
					json.NewEncoder(w).Encode(map[string]any{"data": wire.AgentSession{UserID: "u", DeviceID: "d", Origin: "https://work.example", ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339)}})
					return
				}
				if r.Method != http.MethodPost || r.URL.Path != path {
					t.Error("unexpected operation: retry must only forward the same backup route")
					w.WriteHeader(404)
					return
				}
				attempts++
				var in struct {
					Password string `json:"password"`
				}
				if json.NewDecoder(r.Body).Decode(&in) != nil {
					t.Error("invalid backup request")
				}
				if in.Password != "correct-fixture-password" {
					w.WriteHeader(403)
					json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": "reauthentication_failed", "message": "fixture-sensitive-detail"}})
					return
				}
				accepted++
				json.NewEncoder(w).Encode(map[string]any{"data": wire.CredentialBackup{ID: "backup", Kind: "oauth", SourceDigest: strings.Repeat("f", 64), Version: 1}})
			}))
			defer upstream.Close()
			client, err := New("https://work.example", upstream.Client())
			if err != nil {
				t.Fatal(err)
			}
			client.BaseURL = upstream.URL
			grant := pairing.Grant{Token: "fixture-grant", UserID: "u", DeviceID: "d", Origin: client.Origin}
			input := func(password string) any {
				if operation == "restore" {
					return wire.CredentialBackupRestoreInput{Confirmed: true, Password: password}
				}
				return wire.CredentialBackupInput{Confirmed: true, Password: password, Kind: "oauth", ValueJSON: `{"accessToken":"fixture-oauth-secret"}`, SourceDigest: strings.Repeat("f", 64)}
			}
			var result wire.CredentialBackup
			err = client.Forward(context.Background(), grant, http.MethodPost, path, input("wrong-fixture-password"), &result)
			if err == nil || err.Error() != "reauthentication_failed" {
				t.Fatalf("wrong password must preserve the reauthentication failure, got %v", err)
			}
			if accepted != 0 || result.ID != "" {
				t.Fatal("a rejected backup acquired a success fact")
			}
			if err = client.Forward(context.Background(), grant, http.MethodPost, path, input("correct-fixture-password"), &result); err != nil {
				t.Fatal(err)
			}
			if attempts != 2 || accepted != 1 || validations != 2 || result.ID != "backup" || result.Kind != "oauth" || result.Version != 1 {
				t.Fatalf("backup retry crossed identity/operation boundary: attempts=%d accepted=%d validations=%d result=%+v", attempts, accepted, validations, result)
			}
		})
	}
}

func TestBackupForbiddenResponsesRetainPermissionBoundary(t *testing.T) {
	for _, tc := range []struct {
		name, method, path, response string
		denyGrant                    bool
	}{
		{"create_permission", "POST", "/api/v1/projects/p/connections/c/credential-backups", `{"error":{"code":"project_access_denied"}}`, false},
		{"restore_permission", "POST", "/api/v1/projects/p/connections/c/credential-backups/backup/restore", `{"error":{"code":"forbidden"}}`, false},
		{"unknown_secret", "POST", "/api/v1/projects/p/connections/c/credential-backups", `{"error":{"code":"fixture-sensitive-detail"}}`, false},
		{"malformed", "POST", "/api/v1/projects/p/connections/c/credential-backups", `{"error":{"code":7}}`, false},
		{"invalid_json", "POST", "/api/v1/projects/p/connections/c/credential-backups", `{"error":`, false},
		{"oversize", "POST", "/api/v1/projects/p/connections/c/credential-backups", `{"error":{"code":"reauthentication_failed"}}` + strings.Repeat(" ", 4097), false},
		{"metadata_get", "GET", "/api/v1/projects/p/connections/c/credential-backups", `{"error":{"code":"reauthentication_failed"}}`, false},
		{"non_backup_post", "POST", "/api/v1/projects/p/connections/c/session-access", `{"error":{"code":"reauthentication_failed"}}`, false},
		{"grant_denied_before_backup", "POST", "/api/v1/projects/p/connections/c/credential-backups", `{"error":{"code":"reauthentication_failed"}}`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			backupCalls := 0
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/api/v1/agent/session" && !tc.denyGrant {
					json.NewEncoder(w).Encode(map[string]any{"data": wire.AgentSession{UserID: "u", DeviceID: "d", Origin: "https://work.example", ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339)}})
					return
				}
				if r.URL.Path != "/api/v1/agent/session" {
					backupCalls++
				}
				w.WriteHeader(403)
				w.Write([]byte(tc.response))
			}))
			defer upstream.Close()
			client, err := New("https://work.example", upstream.Client())
			if err != nil {
				t.Fatal(err)
			}
			client.BaseURL = upstream.URL
			grant := pairing.Grant{Token: "fixture-grant", UserID: "u", DeviceID: "d", Origin: client.Origin}
			var result wire.CredentialBackup
			err = client.Forward(context.Background(), grant, tc.method, tc.path, wire.CredentialBackupInput{Confirmed: true, Password: "fixture-password"}, &result)
			if err == nil || err.Error() != "project_permission_revoked" || result.ID != "" {
				t.Fatalf("forbidden response crossed permission/privacy boundary: %v", err)
			}
			if tc.denyGrant && backupCalls != 0 {
				t.Fatal("a revoked grant reached the backup endpoint")
			}
		})
	}
}

func TestBackupUnauthenticatedResponseKeepsIdentityExpired(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agent/session" {
			json.NewEncoder(w).Encode(map[string]any{"data": wire.AgentSession{UserID: "u", DeviceID: "d", Origin: "https://work.example", ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339)}})
			return
		}
		w.WriteHeader(401)
		w.Write([]byte(`{"error":{"code":"reauthentication_failed"}}`))
	}))
	defer upstream.Close()
	client, err := New("https://work.example", upstream.Client())
	if err != nil {
		t.Fatal(err)
	}
	client.BaseURL = upstream.URL
	err = client.Forward(context.Background(), pairing.Grant{Token: "fixture-grant", UserID: "u", DeviceID: "d", Origin: client.Origin}, "POST", "/api/v1/projects/p/connections/c/credential-backups", wire.CredentialBackupInput{Confirmed: true, Password: "fixture-password"}, nil)
	if err == nil || err.Error() != "platform_identity_expired" {
		t.Fatalf("backup HTTP401 must remain an expired identity, got %v", err)
	}
}
