package agentwire

import (
	"encoding/json"
	"testing"
)

// B15: agent.gen.go is generated from contracts/agent/openapi.json and is shared
// by the Agent process and the platform. These assertions pin the field names
// the pairing / run / queue handshake depends on.

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

func TestAgentStatusContractJSONTags(t *testing.T) {
	var status AgentStatus
	encoded := roundTrip(t, `{"contractVersion":"v1","deviceId":"d1","state":"paired",
		"capabilities":["run"],"vaultAvailable":true,"queueRetention":"7d"}`, &status)
	requireKeys(t, encoded, "contractVersion", "deviceId", "state",
		"capabilities", "vaultAvailable", "queueRetention")
	if status.ContractVersion != "v1" || !status.VaultAvailable || len(status.Capabilities) != 1 {
		t.Errorf("AgentStatus decoded to %+v", status)
	}
}

func TestAgentPairContractJSONTags(t *testing.T) {
	var pair AgentPair
	encoded := roundTrip(t, `{"pairingId":"pid","channelToken":"secret-scope-token",
		"userId":"u1","deviceId":"d1","origin":"http://127.0.0.1:45455",
		"expiresAt":"2026-01-01T00:00:00Z","capabilities":["run"]}`, &pair)
	requireKeys(t, encoded, "pairingId", "channelToken", "userId", "deviceId",
		"origin", "expiresAt", "capabilities")
	if pair.ChannelToken != "secret-scope-token" || pair.UserID != "u1" {
		t.Errorf("AgentPair decoded to %+v", pair)
	}
}

func TestAgentConnectInputContractJSONTags(t *testing.T) {
	var input AgentConnectInput
	encoded := roundTrip(t, `{"projectId":"p1","connectionId":"c1","version":3,
		"environmentId":"e1"}`, &input)
	requireKeys(t, encoded, "projectId", "connectionId", "version", "environmentId")
	if input.Version != 3 || input.ConnectionID != "c1" {
		t.Errorf("AgentConnectInput decoded to %+v", input)
	}
}

func TestAgentErrorEnvelopeShape(t *testing.T) {
	var failure AgentError
	encoded := roundTrip(t, `{"error":{"code":"unauthorized"}}`, &failure)
	requireKeys(t, encoded, "error")
	if failure.Error.Code != "unauthorized" {
		t.Errorf("AgentError code decoded to %q", failure.Error.Code)
	}
}

func TestAgentChallengeContractJSONTags(t *testing.T) {
	var challenge AgentChallenge
	encoded := roundTrip(t, `{"challengeId":"ch1","expiresAt":"2026-01-01T00:00:00Z",
		"deviceId":"d1","userId":"u1","origin":"http://127.0.0.1:45455",
		"state":"pending","capabilities":["run"]}`, &challenge)
	requireKeys(t, encoded, "challengeId", "expiresAt", "deviceId", "userId",
		"origin", "state", "capabilities")
	if challenge.ChallengeID != "ch1" || challenge.Origin != "http://127.0.0.1:45455" {
		t.Errorf("AgentChallenge decoded to %+v", challenge)
	}
}
