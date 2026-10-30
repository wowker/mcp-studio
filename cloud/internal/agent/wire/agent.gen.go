// Code generated from contracts/agent/openapi.json. DO NOT EDIT.
package agentwire

type AgentAccepted struct {
	Ok bool `json:"ok"`
}
type AgentError struct {
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}
type AgentStatus struct {
	ContractVersion string   `json:"contractVersion"`
	DeviceID        string   `json:"deviceId"`
	State           string   `json:"state"`
	Capabilities    []string `json:"capabilities"`
	VaultAvailable  bool     `json:"vaultAvailable"`
	QueueRetention  string   `json:"queueRetention"`
}
type AgentChallengeInput struct {
	PlatformProof   string `json:"platformProof"`
	DeviceID        string `json:"deviceId"`
	ContractVersion string `json:"contractVersion"`
}
type AgentChallenge struct {
	ChallengeID  string   `json:"challengeId"`
	ExpiresAt    string   `json:"expiresAt"`
	DeviceID     string   `json:"deviceId"`
	UserID       string   `json:"userId"`
	Origin       string   `json:"origin"`
	State        string   `json:"state"`
	Capabilities []string `json:"capabilities"`
}
type AgentPairInput struct {
	ChallengeID string `json:"challengeId"`
	Code        string `json:"code"`
}
type AgentPair struct {
	PairingID    string   `json:"pairingId"`
	ChannelToken string   `json:"channelToken"`
	UserID       string   `json:"userId"`
	DeviceID     string   `json:"deviceId"`
	Origin       string   `json:"origin"`
	ExpiresAt    string   `json:"expiresAt"`
	Capabilities []string `json:"capabilities"`
}
type AgentConnectInput struct {
	ProjectID     string `json:"projectId"`
	ConnectionID  string `json:"connectionId"`
	Version       int    `json:"version"`
	EnvironmentID string `json:"environmentId"`
}
type AgentConnectionState struct {
	ProjectID     string `json:"projectId"`
	ConnectionID  string `json:"connectionId"`
	UserID        string `json:"userId"`
	Version       int    `json:"version"`
	EnvironmentID string `json:"environmentId"`
	Status        string `json:"status"`
	Diagnostic    string `json:"diagnostic"`
	ServerName    string `json:"serverName"`
	ServerVersion string `json:"serverVersion"`
}
type AgentTools struct {
	ToolsJSON string `json:"toolsJSON"`
}
type AgentRunInput struct {
	ProjectID     string `json:"projectId"`
	ConnectionID  string `json:"connectionId"`
	TabID         string `json:"tabId"`
	ToolName      string `json:"toolName"`
	ArgumentsJSON string `json:"argumentsJSON"`
	Version       int    `json:"version"`
	EnvironmentID string `json:"environmentId"`
}
type AgentRunState struct {
	RunID        string `json:"runId"`
	RecordID     string `json:"recordId"`
	OperationID  string `json:"operationId"`
	UserID       string `json:"userId"`
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	TabID        string `json:"tabId"`
	Status       string `json:"status"`
	SnapshotJSON string `json:"snapshotJSON"`
	Diagnostic   string `json:"diagnostic"`
	UploadStatus string `json:"uploadStatus"`
	Persisted    bool   `json:"persisted"`
	LossRisk     bool   `json:"lossRisk"`
}
type AgentQueueState struct {
	OperationID  string `json:"operationId"`
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	InputJSON    string `json:"inputJSON"`
	Status       string `json:"status"`
	Bytes        int    `json:"bytes"`
	CreatedAt    string `json:"createdAt"`
	Stale        bool   `json:"stale"`
	LossRisk     bool   `json:"lossRisk"`
	Persisted    bool   `json:"persisted"`
	Error        string `json:"error"`
}
type AgentQueuePage struct {
	Items []AgentQueueState `json:"items"`
}
type AgentProjectInput struct {
	ProjectID string `json:"projectId"`
}
type AgentRetentionInput struct {
	Mode string `json:"mode"`
}
type AgentCredentialInput struct {
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	Kind         string `json:"kind"`
	ReferenceID  string `json:"referenceId"`
	ValueJSON    string `json:"valueJSON"`
	Retention    string `json:"retention"`
}
type AgentCredentialScope struct {
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	Kind         string `json:"kind"`
	ReferenceID  string `json:"referenceId"`
}
type AgentCredentialRevealInput struct {
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	Kind         string `json:"kind"`
	ReferenceID  string `json:"referenceId"`
	Confirmed    bool   `json:"confirmed"`
}
type AgentCredentialState struct {
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	Kind         string `json:"kind"`
	ReferenceID  string `json:"referenceId"`
	Present      bool   `json:"present"`
	Location     string `json:"location"`
	Status       string `json:"status"`
	ExpiresAt    string `json:"expiresAt"`
	Diagnostic   string `json:"diagnostic"`
}
type AgentSecret struct {
	ValueJSON string `json:"valueJSON"`
}
type AgentOAuthInput struct {
	ProjectID     string `json:"projectId"`
	ConnectionID  string `json:"connectionId"`
	Version       int    `json:"version"`
	EnvironmentID string `json:"environmentId"`
}
type AgentOAuthStart struct {
	AttemptID        string `json:"attemptId"`
	AuthorizationUrl string `json:"authorizationUrl"`
	ExpiresAt        string `json:"expiresAt"`
}
type AgentOAuthState struct {
	AttemptID  string `json:"attemptId"`
	Status     string `json:"status"`
	Saved      bool   `json:"saved"`
	Diagnostic string `json:"diagnostic"`
}
type AgentOAuthSaveInput struct {
	Retention string `json:"retention"`
}
type AgentBackupInput struct {
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	Kind         string `json:"kind"`
	ReferenceID  string `json:"referenceId"`
	Password     string `json:"password"`
	Confirmed    bool   `json:"confirmed"`
}
type AgentBackupRestoreInput struct {
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	BackupID     string `json:"backupId"`
	Password     string `json:"password"`
	Confirmed    bool   `json:"confirmed"`
	Retention    string `json:"retention"`
}
type AgentBackupDeleteInput struct {
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	BackupID     string `json:"backupId"`
}
type AgentBackups struct {
	BackupsJSON string `json:"backupsJSON"`
}
type AgentEnvironmentPreview struct {
	ProjectID     string `json:"projectId"`
	ConnectionID  string `json:"connectionId"`
	EnvironmentID string `json:"environmentId"`
	Valid         bool   `json:"valid"`
	Diagnostic    string `json:"diagnostic"`
	PreviewJSON   string `json:"previewJSON"`
}
