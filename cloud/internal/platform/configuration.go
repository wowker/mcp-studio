package platform

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mcp-studio/internal/configuration"
	"mcp-studio/internal/wire"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type configurationQuerier interface {
	queryRower
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// Content operations serialize with membership changes and recheck the real
// project role after acquiring the same team lock used by membership writes.
func (a *App) configurationTx(w http.ResponseWriter, r *http.Request, write bool, execute bool) (pgx.Tx, wire.User, projectAccess, bool) {
	u, ok := a.require(w, r, true)
	if !ok {
		return nil, u, projectAccess{}, false
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		dbFailure(w, err)
		return nil, u, projectAccess{}, false
	}
	if agentFrom(r) != nil {
		if _, err := a.agentValue(ctx, tx, bearer(r)); err != nil {
			tx.Rollback(ctx)
			fail(w, 401, "agent_session_expired")
			return nil, u, projectAccess{}, false
		}
	}
	scope, err := projectScope(ctx, tx, r.PathValue("projectId"), u.ID)
	if err != nil {
		tx.Rollback(ctx)
		configurationFailure(w, err)
		return nil, u, scope, false
	}
	if err = lockTeamTx(ctx, tx, scope.teamID); err != nil {
		tx.Rollback(ctx)
		dbFailure(w, err)
		return nil, u, scope, false
	}
	scope, err = projectScope(ctx, tx, r.PathValue("projectId"), u.ID)
	if err != nil {
		tx.Rollback(ctx)
		configurationFailure(w, err)
		return nil, u, scope, false
	}
	if !scope.canRead() || (write && scope.projectRole != "maintainer") || (execute && scope.projectRole != "maintainer" && scope.projectRole != "developer") {
		tx.Rollback(ctx)
		fail(w, 403, "forbidden")
		return nil, u, scope, false
	}
	return tx, u, scope, true
}

func configurationFailure(w http.ResponseWriter, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "not_found")
		return
	}
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		switch pg.Code {
		case "23505":
			fail(w, 409, "duplicate_name")
			return
		case "23503":
			fail(w, 409, "object_in_use")
			return
		}
	}
	dbFailure(w, err)
}
func configurationETag(objectID string, version int) string {
	return `"` + digest(fmt.Sprintf("%s:%d", objectID, version)) + `"`
}
func configurationMatch(w http.ResponseWriter, r *http.Request, objectID string, version int) bool {
	match := r.Header.Get("If-Match")
	if match == "" {
		fail(w, 428, "if_match_required")
		return false
	}
	if match != configurationETag(objectID, version) {
		fail(w, 409, "version_conflict")
		return false
	}
	return true
}
func configurationCommit(w http.ResponseWriter, r *http.Request, tx pgx.Tx, value any, etag string) {
	if err := tx.Commit(r.Context()); err != nil {
		configurationFailure(w, err)
		return
	}
	if etag != "" {
		w.Header().Set("ETag", etag)
	}
	success(w, value)
}
func (a *App) configurationRoutes(mux *http.ServeMux) {
	a.environmentRoutes(mux)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/connections/{connectionId}/session-access", a.authorizeConnection)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/connections", a.listConnections)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/connections", a.saveConnection)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/connections/{connectionId}", a.getConnection)
	mux.HandleFunc("PATCH /api/v1/projects/{projectId}/connections/{connectionId}", a.saveConnection)
	mux.HandleFunc("DELETE /api/v1/projects/{projectId}/connections/{connectionId}", a.deleteConnection)
}

const connectionColumns = `id,project_id,version,body`

func scanConnection(row pgx.Row) (wire.Connection, error) {
	var result wire.Connection
	var body []byte
	if err := row.Scan(&result.ID, &result.ProjectID, &result.Version, &body); err != nil {
		return result, err
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return result, err
	}
	result.Etag = configurationETag(result.ID, result.Version)
	return result, nil
}
func connectionValue(ctx context.Context, q queryRower, projectID, connectionID string) (wire.Connection, error) {
	return scanConnection(q.QueryRow(ctx, `SELECT `+connectionColumns+` FROM connections WHERE project_id=$1 AND id=$2`, projectID, connectionID))
}
func (a *App) listConnections(w http.ResponseWriter, r *http.Request) {
	tx, _, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	rows, err := tx.Query(r.Context(), `SELECT `+connectionColumns+` FROM connections WHERE project_id=$1 ORDER BY id`, r.PathValue("projectId"))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	result := []wire.Connection{}
	for rows.Next() {
		item, err := scanConnection(rows)
		if err != nil {
			rows.Close()
			configurationFailure(w, err)
			return
		}
		result = append(result, item)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, result, "")
}
func (a *App) getConnection(w http.ResponseWriter, r *http.Request) {
	tx, _, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	item, err := connectionValue(r.Context(), tx, r.PathValue("projectId"), r.PathValue("connectionId"))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, item, item.Etag)
}
func configurationReference(ctx context.Context, q queryRower, table, projectID, referenceID string) bool {
	if referenceID == "" {
		return true
	}
	var found string
	return q.QueryRow(ctx, `SELECT id FROM `+table+` WHERE project_id=$1 AND id=$2`, projectID, referenceID).Scan(&found) == nil
}
func (a *App) saveConnection(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, true, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	cid := r.PathValue("connectionId")
	version := 1
	if cid != "" {
		old, err := connectionValue(ctx, tx, pid, cid)
		if err != nil {
			configurationFailure(w, err)
			return
		}
		if !configurationMatch(w, r, cid, old.Version) {
			return
		}
		version = old.Version + 1
	} else {
		cid = id()
	}
	var input wire.ConnectionInput
	if !decode(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if code := configuration.ValidateConnection(input); code != "" {
		fail(w, 400, code)
		return
	}
	if !configurationReference(ctx, tx, "environments", pid, input.EnvironmentID) || !configurationReference(ctx, tx, "variables", pid, input.AuthReferenceID) {
		fail(w, 400, "invalid_scope")
		return
	}
	if code := a.validateConnectionReferences(ctx, tx, pid, cid, input); code != "" {
		fail(w, 400, code)
		return
	}
	if code := configurationAuthReference(ctx, tx, pid, cid, input); code != "" {
		fail(w, 400, code)
		return
	}
	body, err := json.Marshal(input)
	if err != nil {
		fail(w, 400, "invalid_input")
		return
	}
	if r.Method == "POST" {
		_, err = tx.Exec(ctx, `INSERT INTO connections(id,project_id,environment_id,body,version) VALUES($1,$2,NULLIF($3,''),$4,$5)`, cid, pid, input.EnvironmentID, body, version)
	} else {
		_, err = tx.Exec(ctx, `UPDATE connections SET environment_id=NULLIF($3,''),body=$4,version=$5 WHERE project_id=$1 AND id=$2`, pid, cid, input.EnvironmentID, body, version)
	}
	if err != nil {
		configurationFailure(w, err)
		return
	}
	action := "connection.updated"
	if r.Method == "POST" {
		action = "connection.created"
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, action, cid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	item, err := connectionValue(ctx, tx, pid, cid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, item, item.Etag)
}
func (a *App) deleteConnection(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, true, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	cid := r.PathValue("connectionId")
	old, err := connectionValue(ctx, tx, pid, cid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if !configurationMatch(w, r, cid, old.Version) {
		return
	}
	if _, err = tx.Exec(ctx, `DELETE FROM connections WHERE project_id=$1 AND id=$2`, pid, cid); err != nil {
		configurationFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "connection.deleted", cid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, wire.Accepted{Ok: true}, "")
}
