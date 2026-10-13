package platform

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

func bearerRequest(t *testing.T, a *App, method, path, bearer string, body any) (int, json.RawMessage) {
	t.Helper()
	b, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, strings.NewReader(string(b)))
	r.Header.Set("Origin", a.Config.Origin)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+bearer)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	var e struct {
		Data json.RawMessage `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &e)
	return w.Code, e.Data
}
func TestAgentProofExchangeBindingReplayExpiryAndRevocation(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	status, b, _ := request(t, a, "POST", "/api/v1/agent/proofs", map[string]any{"deviceId": "device-A"}, &s, c)
	requireStatus(t, status, 200)
	var proof struct{ Proof string }
	json.Unmarshal(b, &proof)
	status, _ = bearerRequest(t, a, "POST", "/api/v1/agent/exchange", proof.Proof, map[string]any{"deviceId": "device-B"})
	requireStatus(t, status, 401)
	status, b = bearerRequest(t, a, "POST", "/api/v1/agent/exchange", proof.Proof, map[string]any{"deviceId": "device-A"})
	requireStatus(t, status, 200)
	var grant struct{ Token string }
	json.Unmarshal(b, &grant)
	status, _ = bearerRequest(t, a, "POST", "/api/v1/agent/exchange", proof.Proof, map[string]any{"deviceId": "device-A"})
	requireStatus(t, status, 401)
	status, _ = bearerRequest(t, a, "GET", "/api/v1/agent/session", grant.Token, nil)
	requireStatus(t, status, 200)
	status, _ = bearerRequest(t, a, "GET", "/api/v1/projects", grant.Token, nil)
	requireStatus(t, status, 403)
	status, _, _ = request(t, a, "DELETE", "/api/v1/agent/devices/device-A", nil, &s, c)
	requireStatus(t, status, 200)
	status, _ = bearerRequest(t, a, "GET", "/api/v1/agent/session", grant.Token, nil)
	requireStatus(t, status, 401)
	status, b, _ = request(t, a, "POST", "/api/v1/agent/proofs", map[string]any{"deviceId": "device-A"}, &s, c)
	requireStatus(t, status, 200)
	json.Unmarshal(b, &proof)
	now := a.Now()
	a.Now = func() time.Time { return now.Add(61 * time.Second) }
	status, _ = bearerRequest(t, a, "POST", "/api/v1/agent/exchange", proof.Proof, map[string]any{"deviceId": "device-A"})
	requireStatus(t, status, 401)
	var count int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM agent_grants`).Scan(&count)
	if count != 0 {
		t.Fatal("revoked grants remain")
	}
}

func testGrant(t *testing.T, a *App, s wire.Session, c *http.Cookie, device string) string {
	t.Helper()
	status, b, _ := request(t, a, "POST", "/api/v1/agent/proofs", wire.AgentProofRequest{DeviceID: device}, &s, c)
	requireStatus(t, status, 200)
	var proof wire.AgentProof
	json.Unmarshal(b, &proof)
	status, b = bearerRequest(t, a, "POST", "/api/v1/agent/exchange", proof.Proof, wire.AgentProofRequest{DeviceID: device})
	requireStatus(t, status, 200)
	var grant wire.AgentGrant
	json.Unmarshal(b, &grant)
	if grant.Token == "" {
		t.Fatal("empty grant")
	}
	return grant.Token
}
func TestAgentGrantHistoryOwnershipReceiptAndCurrentRole(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "agent-history")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("agent"), s, c, ""), 200)
	grant := testGrant(t, a, s, c, "device")
	input := frozenUpload(t, s.User.ID, p.ID, conn, "history", "private")
	input.ResponsibleEndpoint = "agent"
	input.Snapshot.Executor = "agent"
	freezeUpload(t, &input)
	status, _, _ := request(t, a, "POST", base+"/record-uploads", input, &s, c)
	requireStatus(t, status, 403)
	status, b := bearerRequest(t, a, "POST", base+"/record-uploads", grant, input)
	requireStatus(t, status, 200)
	var receipt wire.RecordOperationReceipt
	json.Unmarshal(b, &receipt)
	status, b = bearerRequest(t, a, "POST", base+"/record-uploads", grant, input)
	requireStatus(t, status, 200)
	var repeated wire.RecordOperationReceipt
	json.Unmarshal(b, &repeated)
	if !reflect.DeepEqual(receipt, repeated) {
		t.Fatal("lost-receipt retry changed acknowledgement")
	}
	spoof := frozenUpload(t, s.User.ID, p.ID, conn, "saved", "private")
	spoof.ResponsibleEndpoint = "agent"
	spoof.Snapshot.Executor = "agent"
	freezeUpload(t, &spoof)
	status, _ = bearerRequest(t, a, "POST", base+"/record-uploads", grant, spoof)
	requireStatus(t, status, 403)
	spoof = frozenUpload(t, s.User.ID, p.ID, conn, "history", "private")
	status, _ = bearerRequest(t, a, "POST", base+"/record-uploads", grant, spoof)
	requireStatus(t, status, 403)
	status, _ = bearerRequest(t, a, "PATCH", base+"/connections/"+conn.ID, grant, httpConfiguration("changed"))
	requireStatus(t, status, 403)
	for _, path := range []string{"/connections", "/variables", "/environments", "/record-redaction-policy", "/record-capacity", "/record-operations/" + input.OperationID, "/records/" + input.TargetID} {
		status, _ = bearerRequest(t, a, "GET", base+path, grant, nil)
		requireStatus(t, status, 200)
	}
	ctx := context.Background()
	a.DB.Exec(ctx, `UPDATE project_members SET role='viewer' WHERE project_id=$1 AND user_id=$2`, p.ID, s.User.ID)
	status, _ = bearerRequest(t, a, "POST", base+"/record-uploads", grant, input)
	requireStatus(t, status, 403)
	a.DB.Exec(ctx, `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, s.User.ID)
	status, _ = bearerRequest(t, a, "GET", base+"/connections", grant, nil)
	requireStatus(t, status, 403)
}
func TestAgentGrantOriginParentLogoutDeadlineAndHashStorage(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	grant := testGrant(t, a, s, c, "device")
	ctx := context.Background()
	var stored string
	a.DB.QueryRow(ctx, `SELECT digest FROM agent_grants`).Scan(&stored)
	if stored == grant || stored != digest(grant) {
		t.Fatal("grant not stored hashed")
	}
	r := httptest.NewRequest("GET", "/api/v1/agent/session", nil)
	r.Header.Set("Authorization", "Bearer "+grant)
	r.Header.Set("Origin", "https://evil.example.test")
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	requireStatus(t, w.Code, 403)
	now := a.Now()
	a.Now = func() time.Time { return now.Add(901 * time.Second) }
	status, _ := bearerRequest(t, a, "GET", "/api/v1/agent/session", grant, nil)
	requireStatus(t, status, 401)
	a.Now = func() time.Time { return now }
	a.DB.Exec(ctx, `UPDATE sessions SET last_seen=$1 WHERE digest=$2`, now.Add(-9*time.Hour), digest(c.Value))
	status, _ = bearerRequest(t, a, "GET", "/api/v1/agent/session", grant, nil)
	requireStatus(t, status, 401)
	a.DB.Exec(ctx, `UPDATE sessions SET last_seen=$1 WHERE digest=$2`, now, digest(c.Value))
	status, _, _ = request(t, a, "POST", "/api/v1/logout", nil, &s, c)
	requireStatus(t, status, 200)
	status, _ = bearerRequest(t, a, "GET", "/api/v1/agent/session", grant, nil)
	requireStatus(t, status, 401)
	var n int
	a.DB.QueryRow(ctx, `SELECT count(*) FROM agent_grants`).Scan(&n)
	if n != 0 {
		t.Fatal("logout grant survived")
	}
}
func TestAgentProofConcurrentExchangeOneWinner(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	status, b, _ := request(t, a, "POST", "/api/v1/agent/proofs", wire.AgentProofRequest{DeviceID: "device"}, &s, c)
	requireStatus(t, status, 200)
	var proof wire.AgentProof
	json.Unmarshal(b, &proof)
	statuses := make(chan int, 8)
	for i := 0; i < 8; i++ {
		go func() {
			status, _ := bearerRequest(t, a, "POST", "/api/v1/agent/exchange", proof.Proof, wire.AgentProofRequest{DeviceID: "device"})
			statuses <- status
		}()
	}
	winners := 0
	for i := 0; i < 8; i++ {
		status := <-statuses
		if status == 200 {
			winners++
		} else if status != 401 {
			t.Fatalf("unexpected %d", status)
		}
	}
	if winners != 1 {
		t.Fatalf("one-time proof winners %d", winners)
	}
}
func TestAgentPasswordResetRevokesProofsAndGrants(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	grant := testGrant(t, a, s, c, "device")
	status, b, _ := request(t, a, "POST", "/api/v1/agent/proofs", wire.AgentProofRequest{DeviceID: "device"}, &s, c)
	requireStatus(t, status, 200)
	var p wire.AgentProof
	json.Unmarshal(b, &p)
	if err := a.emailToken(context.Background(), s.User.ID, s.User.Email, "reset"); err != nil {
		t.Fatal(err)
	}
	hash, err := passwordHash("replacement-password-123")
	if err != nil {
		t.Fatal(err)
	}
	if err = a.consume(context.Background(), m.lastCode(), "reset", hash); err != nil {
		t.Fatal(err)
	}
	status, _ = bearerRequest(t, a, "GET", "/api/v1/agent/session", grant, nil)
	requireStatus(t, status, 401)
	status, _ = bearerRequest(t, a, "POST", "/api/v1/agent/exchange", p.Proof, wire.AgentProofRequest{DeviceID: "device"})
	requireStatus(t, status, 401)
}
func TestAgentProofCookieCSRFAndExchangeCookieOriginRejected(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	status, _, _ := request(t, a, "POST", "/api/v1/agent/proofs", wire.AgentProofRequest{DeviceID: "device"}, nil, c)
	requireStatus(t, status, 403)
	status, _, _ = request(t, a, "POST", "/api/v1/agent/proofs", wire.AgentProofRequest{DeviceID: ""}, &s, c)
	requireStatus(t, status, 400)
	status, b, _ := request(t, a, "POST", "/api/v1/agent/proofs", wire.AgentProofRequest{DeviceID: "device"}, &s, c)
	requireStatus(t, status, 200)
	var proof wire.AgentProof
	json.Unmarshal(b, &proof)
	payload, _ := json.Marshal(wire.AgentProofRequest{DeviceID: "device"})
	r := httptest.NewRequest("POST", "/api/v1/agent/exchange", strings.NewReader(string(payload)))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+proof.Proof)
	r.Header.Set("Origin", "https://evil.example.test")
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	requireStatus(t, w.Code, 403)
	r = httptest.NewRequest("POST", "/api/v1/agent/exchange", strings.NewReader(string(payload)))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+proof.Proof)
	r.Header.Set("Origin", a.Config.Origin)
	r.AddCookie(c)
	w = httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	requireStatus(t, w.Code, 403)
	status, _ = bearerRequest(t, a, "POST", "/api/v1/agent/exchange", proof.Proof, wire.AgentProofRequest{DeviceID: "device"})
	requireStatus(t, status, 200)
}
func TestAgentGrantBoundedByParentAbsoluteDeadline(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	now := a.Now()
	a.DB.Exec(context.Background(), `UPDATE sessions SET created_at=$1 WHERE digest=$2`, now.Add(-a.Config.Absolute+3*time.Minute), digest(c.Value))
	grant := testGrant(t, a, s, c, "device")
	status, b := bearerRequest(t, a, "GET", "/api/v1/agent/session", grant, nil)
	requireStatus(t, status, 200)
	var pub wire.AgentSession
	json.Unmarshal(b, &pub)
	expiry, err := time.Parse(time.RFC3339, pub.ExpiresAt)
	if err != nil || !expiry.Equal(now.Add(3*time.Minute)) {
		t.Fatal("grant outlived parent", pub.ExpiresAt, err)
	}
	a.Now = func() time.Time { return now.Add(3 * time.Minute) }
	status, _ = bearerRequest(t, a, "GET", "/api/v1/agent/session", grant, nil)
	requireStatus(t, status, 401)
}
func TestAgentExchangeRejectsBrowserFetchWithoutCookie(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	status, b, _ := request(t, a, "POST", "/api/v1/agent/proofs", wire.AgentProofRequest{DeviceID: "device"}, &s, c)
	requireStatus(t, status, 200)
	var proof wire.AgentProof
	json.Unmarshal(b, &proof)
	payload, _ := json.Marshal(wire.AgentProofRequest{DeviceID: "device"})
	r := httptest.NewRequest("POST", "/api/v1/agent/exchange", strings.NewReader(string(payload)))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", a.Config.Origin)
	r.Header.Set("Authorization", "Bearer "+proof.Proof)
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	r.Header.Set("Sec-Fetch-Mode", "cors")
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	requireStatus(t, w.Code, 403)
	status, _ = bearerRequest(t, a, "POST", "/api/v1/agent/exchange", proof.Proof, wire.AgentProofRequest{DeviceID: "device"})
	requireStatus(t, status, 200)
}
