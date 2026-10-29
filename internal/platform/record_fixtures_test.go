package platform

import (
	"encoding/json"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/wire"
	"testing"
)

// 上传夹具同时被云服务版（!local）与单机版（local）测试使用，
// 因此放在无构建标签的共享测试文件中。

func frozenUpload(t *testing.T, userID, projectID string, c wire.Connection, kind, visibility string) wire.RecordUploadInput {
	t.Helper()
	run := id()
	input := wire.RecordUploadInput{ContractVersion: "1.2.0", UserID: userID, ProjectID: projectID, ConnectionID: c.ID, OperationID: id(), TargetKind: kind, TargetID: id(), ResponsibleEndpoint: "browser", Snapshot: wire.ExecutionSnapshot{UserID: userID, ProjectID: projectID, ConnectionID: c.ID, TabID: id(), RunID: run, ToolName: "fixture", ConfigurationVersion: c.Version, ToolDefinitionVersion: "v1", Executor: "browser", CredentialSource: "none", RequestJSON: `{"n":0}`, InputSchemaJSON: `{"type":"object","properties":{"n":{"type":"number"}}}`, ResponseJSON: `{"result":{"content":[]}}`, ProtocolJSON: `null`, StartedAt: "2026-10-13T00:00:00Z", FinishedAt: "2026-10-13T00:00:01Z", RunStatus: "succeeded", RemoteOutcome: "known", ResultKind: "success", ResponseRetention: "full", SchemaValid: true, Redactions: []wire.RedactionMarker{}}, Metadata: wire.RecordMetadata{Name: "Fixture", Visibility: visibility, ContentKind: "request-response", Completeness: "complete"}}
	freezeUpload(t, &input)
	return input
}

func freezeUpload(t *testing.T, input *wire.RecordUploadInput) {
	t.Helper()
	b, _ := json.Marshal(input)
	sum, err := recording.Digest(string(b))
	if err != nil {
		t.Fatal(err)
	}
	input.FrozenDigest = sum
}

func httpConfiguration(name string) wire.ConnectionInput {
	return wire.ConnectionInput{Name: name, Transport: "streamable-http", Channel: "browser", Endpoint: "http://localhost:9123/mcp?workspace=demo", Args: []string{}, Headers: []wire.ConfigEntry{}, Env: []wire.ConfigEntry{}, TimeoutMs: 30000, AuthMode: "none", OauthScopes: []string{}}
}
