package wire

import (
	"encoding/json"
	"testing"
)

// B15: platform.gen.go is generated from contracts/platform/openapi.json and is
// shared by the Go platform and the TypeScript client. These assertions pin the
// wire field names so a generator drift breaks the build instead of silently
// renaming a field for one side only.

func roundTrip(t *testing.T, raw string, target any) map[string]json.RawMessage {
	t.Helper()
	if err := json.Unmarshal([]byte(raw), target); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}
	encoded, err := json.Marshal(target)
	if err != nil {
		t.Fatalf("encode %s: %v", raw, err)
	}
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &generic); err != nil {
		t.Fatalf("re-decode %s: %v", encoded, err)
	}
	return generic
}

func requireKeys(t *testing.T, encoded map[string]json.RawMessage, keys ...string) {
	t.Helper()
	for _, key := range keys {
		if _, ok := encoded[key]; !ok {
			t.Errorf("wire field %q missing; generated tags drifted from the contract", key)
		}
	}
}

func TestHealthContractJSONTags(t *testing.T) {
	var health Health
	encoded := roundTrip(t, `{"status":"ok","version":"0.1.0"}`, &health)
	requireKeys(t, encoded, "status", "version")
	if health.Status != "ok" || health.Version != "0.1.0" {
		t.Errorf("Health decoded to %+v", health)
	}
}

func TestBootstrapContractJSONTags(t *testing.T) {
	var bootstrap Bootstrap
	encoded := roundTrip(t, `{"initialized":true,"mailConfigured":false}`, &bootstrap)
	requireKeys(t, encoded, "initialized", "mailConfigured")
	if !bootstrap.Initialized || bootstrap.MailConfigured {
		t.Errorf("Bootstrap decoded to %+v", bootstrap)
	}
}

func TestErrorEnvelopeShape(t *testing.T) {
	var failure Error
	encoded := roundTrip(t, `{"error":{"code":"forbidden"}}`, &failure)
	requireKeys(t, encoded, "error")
	if failure.Error.Code != "forbidden" {
		t.Errorf("Error code decoded to %q", failure.Error.Code)
	}
}

func TestProjectContractJSONTags(t *testing.T) {
	var project Project
	encoded := roundTrip(t, `{"id":"p1","teamId":"t1","name":"Personal","description":"",
		"role":"owner","canManage":true,"canTakeover":false,"canRead":true}`, &project)
	requireKeys(t, encoded, "id", "teamId", "name", "description", "role", "canManage", "canTakeover", "canRead")
	if !project.CanManage || project.CanTakeover || !project.CanRead {
		t.Errorf("Project capability flags decoded to %+v", project)
	}
}

func TestSessionNestedContractJSONTags(t *testing.T) {
	var session Session
	encoded := roundTrip(t, `{"user":{"id":"u1","email":"a@b.c","name":"A","verified":true},
		"teams":[{"id":"t1","name":"Local","role":"owner"}],
		"csrf":"token","expiresAt":"2026-01-01T00:00:00Z"}`, &session)
	requireKeys(t, encoded, "user", "teams", "csrf", "expiresAt")
	if session.User.ID != "u1" || session.Teams[0].Role != TeamRole("owner") || session.Csrf != "token" {
		t.Errorf("Session decoded to %+v", session)
	}
}

func TestInvitationContractJSONTags(t *testing.T) {
	var invitation Invitation
	encoded := roundTrip(t, `{"id":"i1","projectId":"p1","email":"a@b.c","teamRole":"member",
		"projectRole":"viewer","status":"pending","expiresAt":"2026-01-01T00:00:00Z",
		"delivery":"mail"}`, &invitation)
	requireKeys(t, encoded, "id", "projectId", "email", "teamRole", "projectRole",
		"status", "expiresAt", "delivery")
	if invitation.TeamRole != TeamRole("member") || invitation.ProjectRole != ProjectRole("viewer") {
		t.Errorf("Invitation roles decoded to %+v", invitation)
	}
}
