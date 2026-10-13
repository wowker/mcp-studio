// Code generated from contracts/platform/openapi.json. DO NOT EDIT.
package wire

type TeamRole string
type ProjectRole string
type User struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Verified bool   `json:"verified"`
}
type Team struct {
	ID   string   `json:"id"`
	Name string   `json:"name"`
	Role TeamRole `json:"role"`
}
type Session struct {
	User      User   `json:"user"`
	Teams     []Team `json:"teams"`
	Csrf      string `json:"csrf"`
	ExpiresAt string `json:"expiresAt"`
}
type Project struct {
	ID          string `json:"id"`
	TeamID      string `json:"teamId"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Role        string `json:"role"`
	CanManage   bool   `json:"canManage"`
	CanTakeover bool   `json:"canTakeover"`
	CanRead     bool   `json:"canRead"`
}
type Member struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	Name        string   `json:"name"`
	TeamRole    TeamRole `json:"teamRole"`
	ProjectRole string   `json:"projectRole"`
}
type Invitation struct {
	ID          string      `json:"id"`
	ProjectID   string      `json:"projectId"`
	Email       string      `json:"email"`
	TeamRole    TeamRole    `json:"teamRole"`
	ProjectRole ProjectRole `json:"projectRole"`
	Status      string      `json:"status"`
	ExpiresAt   string      `json:"expiresAt"`
	Delivery    string      `json:"delivery"`
}
type InviteEntry struct {
	ID          string `json:"id"`
	ProjectName string `json:"projectName"`
	EmailHint   string `json:"emailHint"`
	Status      string `json:"status"`
	ExpiresAt   string `json:"expiresAt"`
}
type Audit struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	ActorID   string `json:"actorId"`
	Action    string `json:"action"`
	Reason    string `json:"reason"`
	CreatedAt string `json:"createdAt"`
}
type Health struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}
type Bootstrap struct {
	Initialized    bool `json:"initialized"`
	MailConfigured bool `json:"mailConfigured"`
}
type Accepted struct {
	Ok bool `json:"ok"`
}
type Error struct {
	Error struct {
		Code string `json:"code"`
	} `json:"error"`
}
type InitializeRequest struct {
	Credential string `json:"credential"`
	Email      string `json:"email"`
	Name       string `json:"name"`
	Password   string `json:"password"`
	TeamName   string `json:"teamName"`
}
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}
type ProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}
type TakeoverRequest struct {
	Confirmed bool   `json:"confirmed"`
	Reason    string `json:"reason"`
}
type InviteRequest struct {
	Email       string      `json:"email"`
	TeamRole    TeamRole    `json:"teamRole"`
	ProjectRole ProjectRole `json:"projectRole"`
	Days        int         `json:"days"`
}
type RegisterRequest struct {
	Token    string `json:"token"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}
type TokenRequest struct {
	Token string `json:"token"`
}
type EmailRequest struct {
	Email string `json:"email"`
}
type PasswordResetRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}
type MemberRequest struct {
	Role ProjectRole `json:"role"`
}
type TeamMemberRequest struct {
	Role TeamRole `json:"role"`
}
type ConfigEntry struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}
type ConnectionInput struct {
	Name            string        `json:"name"`
	Transport       string        `json:"transport"`
	Channel         string        `json:"channel"`
	Endpoint        string        `json:"endpoint"`
	Command         string        `json:"command"`
	Args            []string      `json:"args"`
	Cwd             string        `json:"cwd"`
	Headers         []ConfigEntry `json:"headers"`
	Env             []ConfigEntry `json:"env"`
	TimeoutMs       int           `json:"timeoutMs"`
	EnvironmentID   string        `json:"environmentId"`
	AuthMode        string        `json:"authMode"`
	AuthReferenceID string        `json:"authReferenceId"`
	OauthClientID   string        `json:"oauthClientId"`
	OauthScopes     []string      `json:"oauthScopes"`
}
type Connection struct {
	ID              string        `json:"id"`
	ProjectID       string        `json:"projectId"`
	Version         int           `json:"version"`
	Etag            string        `json:"etag"`
	Name            string        `json:"name"`
	Transport       string        `json:"transport"`
	Channel         string        `json:"channel"`
	Endpoint        string        `json:"endpoint"`
	Command         string        `json:"command"`
	Args            []string      `json:"args"`
	Cwd             string        `json:"cwd"`
	Headers         []ConfigEntry `json:"headers"`
	Env             []ConfigEntry `json:"env"`
	TimeoutMs       int           `json:"timeoutMs"`
	EnvironmentID   string        `json:"environmentId"`
	AuthMode        string        `json:"authMode"`
	AuthReferenceID string        `json:"authReferenceId"`
	OauthClientID   string        `json:"oauthClientId"`
	OauthScopes     []string      `json:"oauthScopes"`
}
type EnvironmentInput struct {
	Name string `json:"name"`
}
type Environment struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	Version   int    `json:"version"`
	Etag      string `json:"etag"`
	Name      string `json:"name"`
}
type VariableInput struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	Sensitive     bool   `json:"sensitive"`
	Required      bool   `json:"required"`
	ValueJSON     string `json:"valueJSON"`
	EnvironmentID string `json:"environmentId"`
	ConnectionID  string `json:"connectionId"`
}
type Variable struct {
	ID            string `json:"id"`
	ProjectID     string `json:"projectId"`
	Version       int    `json:"version"`
	Etag          string `json:"etag"`
	Name          string `json:"name"`
	Type          string `json:"type"`
	Sensitive     bool   `json:"sensitive"`
	Required      bool   `json:"required"`
	ValueJSON     string `json:"valueJSON"`
	EnvironmentID string `json:"environmentId"`
	ConnectionID  string `json:"connectionId"`
}
type ConnectionAccessRequest struct {
	Version       int    `json:"version"`
	EnvironmentID string `json:"environmentId"`
}
type ConnectionAccess struct {
	UserID        string `json:"userId"`
	ProjectID     string `json:"projectId"`
	ConnectionID  string `json:"connectionId"`
	Version       int    `json:"version"`
	EnvironmentID string `json:"environmentId"`
}
