package sessions

import (
	"context"
	"mcp-studio/internal/agent/localapi"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/queue"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/wire"
	"net/http"
	"strings"
	"time"
)

type uploader interface {
	Upload(context.Context, pairing.Grant, wire.RecordUploadInput) (wire.RecordOperationReceipt, error)
}
type projectReader interface {
	Project(context.Context, pairing.Grant, string) error
}

func (e *Engine) queueStore() *queue.Queue { q, _ := e.config.Queue.(*queue.Queue); return q }
func (e *Engine) upload(s pairing.Session, operation, pid string) error {
	q := e.queueStore()
	upload, ok := e.config.Platform.(uploader)
	if q == nil || !ok {
		return nil
	}
	ctx, cancel := context.WithTimeout(e.background, 30*time.Second)
	defer cancel()
	_, err := q.Retry(ctx, s.UserID, pid, operation, func(ctx context.Context, in wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
		return upload.Upload(ctx, s.Grant, in)
	})
	if err == nil {
		e.markRecorded(s.UserID, operation)
	}
	return err
}
func queueState(row queue.State) agentwire.AgentQueueState {
	return agentwire.AgentQueueState{OperationID: row.Input.OperationID, ProjectID: row.Input.ProjectID, ConnectionID: row.Input.ConnectionID, InputJSON: encode(row.Input), Status: uploadStatus(row), Bytes: int(row.Bytes), CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339Nano), Stale: row.Stale, LossRisk: row.LossRisk, Persisted: row.Persisted, Error: row.Error}
}
func storedRun(row queue.State) agentwire.AgentRunState {
	return agentwire.AgentRunState{RunID: row.Input.Snapshot.RunID, RecordID: row.Input.TargetID, OperationID: row.Input.OperationID, UserID: row.Input.UserID, ProjectID: row.Input.ProjectID, ConnectionID: row.Input.ConnectionID, TabID: row.Input.Snapshot.TabID, Status: row.Input.Snapshot.RunStatus, SnapshotJSON: encode(row.Input.Snapshot), Diagnostic: row.Error, UploadStatus: uploadStatus(row), Persisted: row.Persisted, LossRisk: row.LossRisk}
}
func (e *Engine) queueRoutes(w http.ResponseWriter, r *http.Request, s pairing.Session) bool {
	if !strings.HasPrefix(r.URL.Path, "/v1/queue") && !strings.HasPrefix(r.URL.Path, "/v1/operations/") && r.URL.Path != "/v1/retention" {
		return false
	}
	q := e.queueStore()
	if q == nil {
		localapi.Fail(w, 503, "queue_unavailable")
		return true
	}
	if strings.HasPrefix(r.URL.Path, "/v1/operations/") && r.Method == "GET" {
		op := strings.TrimPrefix(r.URL.Path, "/v1/operations/")
		row, err := q.Get(r.Context(), s.UserID, op)
		if err == nil {
			_, err = e.privateAuthority(r.Context(), s, row.Input.ProjectID, row.Input.ConnectionID)
		}
		respond(w, queueState(row), err, 200)
		return true
	}
	if r.URL.Path == "/v1/retention" && r.Method == "POST" {
		var in agentwire.AgentRetentionInput
		if !localapi.Decode(w, r, &in) {
			return true
		}
		err := q.SetRetentionForUser(s.UserID, in.Mode)
		respond(w, agentwire.AgentAccepted{Ok: err == nil}, err, 200)
		return true
	}
	if r.URL.Path == "/v1/queue" && r.Method == "GET" {
		pid := r.URL.Query().Get("projectId")
		project, ok := e.config.Platform.(projectReader)
		if !ok {
			localapi.Fail(w, 503, "authority_unavailable")
			return true
		}
		if err := project.Project(r.Context(), s.Grant, pid); err != nil {
			respond(w, nil, err, 200)
			return true
		}
		rows, err := q.List(r.Context(), s.UserID, pid)
		items := []agentwire.AgentQueueState{}
		for _, row := range rows {
			items = append(items, queueState(row))
		}
		respond(w, agentwire.AgentQueuePage{Items: items}, err, 200)
		return true
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		localapi.Fail(w, 404, "not_found")
		return true
	}
	operation := parts[2]
	pid := r.URL.Query().Get("projectId")
	if len(parts) == 4 && parts[3] == "retry" && r.Method == "POST" {
		var in agentwire.AgentProjectInput
		if !localapi.Decode(w, r, &in) {
			return true
		}
		pid = in.ProjectID
	}
	row, err := q.Get(r.Context(), s.UserID, operation)
	if err == nil && row.Input.ProjectID != pid {
		localapi.Fail(w, 404, "not_found")
		return true
	}
	if err == nil {
		_, err = e.privateAuthority(r.Context(), s, pid, row.Input.ConnectionID)
	}
	if err != nil {
		respond(w, nil, err, 200)
		return true
	}
	if len(parts) == 4 && parts[3] == "retry" && r.Method == "POST" {
		err = e.upload(s, operation, pid)
		row, getErr := q.Get(r.Context(), s.UserID, operation)
		if err == nil {
			err = getErr
		}
		respond(w, queueState(row), err, 200)
		return true
	}
	if len(parts) == 3 && r.Method == "DELETE" {
		err = q.Discard(r.Context(), s.UserID, pid, operation)
		respond(w, agentwire.AgentAccepted{Ok: err == nil}, err, 200)
		return true
	}
	localapi.Fail(w, 404, "not_found")
	return true
}

func uploadStatus(row queue.State) string {
	if row.Status == "failed" && row.Error == "platform_identity_expired" {
		return "paused"
	}
	return row.Status
}
