package localapi

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/agent/pairing"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type testPlatform struct{}

func (testPlatform) Exchange(ctx context.Context, proof, device string) (pairing.Grant, error) {
	return pairing.Grant{Token: "platform-private", UserID: "u", DeviceID: device, Origin: "https://work.example", ExpiresAt: time.Now().Add(time.Hour)}, nil
}
func (testPlatform) Validate(context.Context, pairing.Grant) error { return nil }
func TestLoopbackHostOriginStrictJSONAndNoWebApproval(t *testing.T) {
	h, err := New(Config{Origin: "https://work.example", Host: "127.0.0.1:4317", DeviceID: "d", Platform: testPlatform{}, Confirm: func(context.Context, pairing.Prompt) (bool, error) { return true, nil }})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		host, origin, body string
		headers            map[string]string
		want               int
	}{{"evil.example:4317", "https://work.example", "", nil, 403}, {"127.0.0.1:4317", "https://work.example.evil", "", nil, 403}, {"127.0.0.1:4317", "https://work.example", "", map[string]string{"X-Forwarded-Host": "127.0.0.1:4317"}, 403}, {"127.0.0.1:4317", "https://work.example", "", map[string]string{"Cookie": "platform=secret"}, 403}, {"127.0.0.1:4317", "https://work.example", `{"platformProof":"p","deviceId":"d","contractVersion":"1.0.0","approved":true}`, nil, 400}, {"127.0.0.1:4317", "https://work.example", `{"platformProof":"p","platformProof":"p","deviceId":"d","contractVersion":"1.0.0"}`, nil, 400}} {
		r := httptest.NewRequest("POST", "http://127.0.0.1:4317/v1/pairing/challenges", strings.NewReader(tc.body))
		r.Host = tc.host
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Content-Type", "application/json")
		for k, v := range tc.headers {
			r.Header.Set(k, v)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.want {
			t.Errorf("%+v got %d %s", tc, w.Code, w.Body.String())
		}
	}
}
func TestPublicStatusNeverReturnsGrantsAndProtectedNeedsChannel(t *testing.T) {
	h, _ := New(Config{Origin: "https://work.example", Host: "127.0.0.1:4317", DeviceID: "d", Platform: testPlatform{}})
	r := httptest.NewRequest("GET", "http://127.0.0.1:4317/v1/status", nil)
	r.Header.Set("Origin", "https://work.example")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || strings.Contains(w.Body.String(), "Token") {
		t.Fatal(w.Body.String())
	}
	var v map[string]any
	if json.Unmarshal(w.Body.Bytes(), &v) != nil {
		t.Fatal("json")
	}
	r = httptest.NewRequest("GET", "http://127.0.0.1:4317/v1/queue?projectId=p", nil)
	r.Header.Set("Origin", "https://work.example")
	r.Header.Set("Authorization", "Bearer platform-private")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal(w.Code)
	}
}
func TestStrictDecodeRejectsMissingRequiredField(t *testing.T) {
	r := httptest.NewRequest("POST", "http://127.0.0.1", strings.NewReader(`{"projectId":"p"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	var in struct {
		ProjectID    string `json:"projectId"`
		ConnectionID string `json:"connectionId"`
	}
	if Decode(w, r, &in) {
		t.Fatal("missing required field accepted")
	}
}
