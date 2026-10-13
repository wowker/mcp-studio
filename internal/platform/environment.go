package platform

import (
	"context"
	"mcp-studio/internal/configuration"
	"mcp-studio/internal/wire"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (a *App) environmentRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/projects/{projectId}/environments", a.listEnvironments)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/environments", a.saveEnvironment)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/environments/{environmentId}", a.getEnvironment)
	mux.HandleFunc("PATCH /api/v1/projects/{projectId}/environments/{environmentId}", a.saveEnvironment)
	mux.HandleFunc("DELETE /api/v1/projects/{projectId}/environments/{environmentId}", a.deleteEnvironment)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/variables", a.listVariables)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/variables", a.saveVariable)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/variables/{variableId}", a.getVariable)
	mux.HandleFunc("PATCH /api/v1/projects/{projectId}/variables/{variableId}", a.saveVariable)
	mux.HandleFunc("DELETE /api/v1/projects/{projectId}/variables/{variableId}", a.deleteVariable)
}

const environmentColumns = `id,project_id,version,name`

func scanEnvironment(row pgx.Row) (wire.Environment, error) {
	var item wire.Environment
	err := row.Scan(&item.ID, &item.ProjectID, &item.Version, &item.Name)
	item.Etag = configurationETag(item.ID, item.Version)
	return item, err
}
func environmentValue(ctx context.Context, q queryRower, projectID, environmentID string) (wire.Environment, error) {
	return scanEnvironment(q.QueryRow(ctx, `SELECT `+environmentColumns+` FROM environments WHERE project_id=$1 AND id=$2`, projectID, environmentID))
}
func (a *App) listEnvironments(w http.ResponseWriter, r *http.Request) {
	tx, _, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	rows, err := tx.Query(r.Context(), `SELECT `+environmentColumns+` FROM environments WHERE project_id=$1 ORDER BY name_key,id`, r.PathValue("projectId"))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	items := []wire.Environment{}
	for rows.Next() {
		item, err := scanEnvironment(rows)
		if err != nil {
			rows.Close()
			configurationFailure(w, err)
			return
		}
		items = append(items, item)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, items, "")
}
func (a *App) getEnvironment(w http.ResponseWriter, r *http.Request) {
	tx, _, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	item, err := environmentValue(r.Context(), tx, r.PathValue("projectId"), r.PathValue("environmentId"))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, item, item.Etag)
}
func (a *App) saveEnvironment(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, true, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	eid := r.PathValue("environmentId")
	version := 1
	if eid != "" {
		old, err := environmentValue(ctx, tx, pid, eid)
		if err != nil {
			configurationFailure(w, err)
			return
		}
		if !configurationMatch(w, r, eid, old.Version) {
			return
		}
		version = old.Version + 1
	} else {
		eid = id()
	}
	var input wire.EnvironmentInput
	if !decode(w, r, &input) {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len(input.Name) > 120 || strings.ContainsAny(input.Name, "\x00\r\n") {
		fail(w, 400, "invalid_name")
		return
	}
	var err error
	if r.Method == "POST" {
		_, err = tx.Exec(ctx, `INSERT INTO environments(id,project_id,name,name_key,version) VALUES($1,$2,$3,$4,$5)`, eid, pid, input.Name, canonical(input.Name), version)
	} else {
		_, err = tx.Exec(ctx, `UPDATE environments SET name=$3,name_key=$4,version=$5 WHERE project_id=$1 AND id=$2`, pid, eid, input.Name, canonical(input.Name), version)
	}
	if err != nil {
		configurationFailure(w, err)
		return
	}
	action := "environment.updated"
	if r.Method == "POST" {
		action = "environment.created"
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, action, eid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	item, err := environmentValue(ctx, tx, pid, eid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, item, item.Etag)
}
func (a *App) deleteEnvironment(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, true, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	eid := r.PathValue("environmentId")
	old, err := environmentValue(ctx, tx, pid, eid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if !configurationMatch(w, r, eid, old.Version) {
		return
	}
	if _, err = tx.Exec(ctx, `DELETE FROM environments WHERE project_id=$1 AND id=$2`, pid, eid); err != nil {
		configurationFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "environment.deleted", eid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, wire.Accepted{Ok: true}, "")
}

const variableColumns = `id,project_id,version,name,type,sensitive,required,value_json,COALESCE(environment_id,''),COALESCE(connection_id,'')`

func scanVariable(row pgx.Row) (wire.Variable, error) {
	var item wire.Variable
	err := row.Scan(&item.ID, &item.ProjectID, &item.Version, &item.Name, &item.Type, &item.Sensitive, &item.Required, &item.ValueJSON, &item.EnvironmentID, &item.ConnectionID)
	item.Etag = configurationETag(item.ID, item.Version)
	return item, err
}
func variableValue(ctx context.Context, q queryRower, projectID, variableID string) (wire.Variable, error) {
	return scanVariable(q.QueryRow(ctx, `SELECT `+variableColumns+` FROM variables WHERE project_id=$1 AND id=$2`, projectID, variableID))
}
func loadConfigurationVariables(ctx context.Context, q configurationQuerier, projectID string) ([]wire.Variable, error) {
	rows, err := q.Query(ctx, `SELECT `+variableColumns+` FROM variables WHERE project_id=$1 ORDER BY name,id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []wire.Variable{}
	for rows.Next() {
		item, err := scanVariable(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (a *App) listVariables(w http.ResponseWriter, r *http.Request) {
	tx, _, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	items, err := loadConfigurationVariables(r.Context(), tx, r.PathValue("projectId"))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, items, "")
}
func (a *App) getVariable(w http.ResponseWriter, r *http.Request) {
	tx, _, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	item, err := variableValue(r.Context(), tx, r.PathValue("projectId"), r.PathValue("variableId"))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, item, item.Etag)
}
func (a *App) saveVariable(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, true, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	vid := r.PathValue("variableId")
	version := 1
	if vid != "" {
		old, err := variableValue(ctx, tx, pid, vid)
		if err != nil {
			configurationFailure(w, err)
			return
		}
		if !configurationMatch(w, r, vid, old.Version) {
			return
		}
		version = old.Version + 1
	} else {
		vid = id()
	}
	var input wire.VariableInput
	if !decode(w, r, &input) {
		return
	}
	if code := configuration.ValidateVariable(input); code != "" {
		fail(w, 400, code)
		return
	}
	if !configurationReference(ctx, tx, "environments", pid, input.EnvironmentID) || !configurationReference(ctx, tx, "connections", pid, input.ConnectionID) {
		fail(w, 400, "invalid_scope")
		return
	}
	var err error
	if r.Method == "POST" {
		_, err = tx.Exec(ctx, `INSERT INTO variables(id,project_id,environment_id,connection_id,name,type,sensitive,required,value_json,version) VALUES($1,$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7,$8,$9,$10)`, vid, pid, input.EnvironmentID, input.ConnectionID, input.Name, input.Type, input.Sensitive, input.Required, input.ValueJSON, version)
	} else {
		_, err = tx.Exec(ctx, `UPDATE variables SET environment_id=NULLIF($3,''),connection_id=NULLIF($4,''),name=$5,type=$6,sensitive=$7,required=$8,value_json=$9,version=$10 WHERE project_id=$1 AND id=$2`, pid, vid, input.EnvironmentID, input.ConnectionID, input.Name, input.Type, input.Sensitive, input.Required, input.ValueJSON, version)
	}
	if err != nil {
		configurationFailure(w, err)
		return
	}
	action := "variable.updated"
	if r.Method == "POST" {
		action = "variable.created"
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, action, vid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	item, err := variableValue(ctx, tx, pid, vid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, item, item.Etag)
}
func (a *App) deleteVariable(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, true, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	vid := r.PathValue("variableId")
	old, err := variableValue(ctx, tx, pid, vid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if !configurationMatch(w, r, vid, old.Version) {
		return
	}
	if _, err = tx.Exec(ctx, `DELETE FROM variables WHERE project_id=$1 AND id=$2`, pid, vid); err != nil {
		configurationFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "variable.deleted", vid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, wire.Accepted{Ok: true}, "")
}
