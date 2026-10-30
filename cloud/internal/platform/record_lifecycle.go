package platform

import (
	"context"
	"mcp-studio/internal/wire"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

const defaultRecordCapacityBytes int64 = 5 << 30
const privateArchiveDuration = 30 * 24 * time.Hour

func (a *App) recordLimit() int64 {
	if a.Config.RecordCapacityBytes > 0 {
		return a.Config.RecordCapacityBytes
	}
	return defaultRecordCapacityBytes
}
func (a *App) retentionDefaults() (int, int) {
	days, max := a.Config.HistoryRetentionDays, a.Config.MaxHistoryRetentionDays
	if days <= 0 {
		days = 90
	}
	if max <= 0 {
		max = 90
	}
	return days, max
}

// A logical byte is one byte of the database's UTF-8 JSON representation of
// a persisted row plus 128 bytes per row. General audit timestamps are
// normalized to UTC with six fractional digits so byte counts are stable. This includes all identity columns,
// metadata, schema, protocol, request and response strings, operation receipts,
// revision audits, record-domain audits and deletion markers. Archives continue
// to count. It is an admission budget, not PostgreSQL physical disk usage.
func (a *App) recordCapacity(ctx context.Context, q queryRower, pid string) (wire.RecordCapacity, error) {
	days, max := a.retentionDefaults()
	result := wire.RecordCapacity{ProjectID: pid, MaxHistoryRetentionDays: max, LimitBytes: int(a.recordLimit()), HistoryRetentionDays: days, Version: 1}
	err := q.QueryRow(ctx, `SELECT COALESCE((SELECT history_retention_days FROM record_retention_policies WHERE project_id=$1),$2),COALESCE((SELECT version FROM record_retention_policies WHERE project_id=$1),1),
 (SELECT COALESCE(sum(n),0) FROM (
 SELECT octet_length(row_to_json(r)::text)::bigint+128 n FROM records r WHERE project_id=$1
 UNION ALL SELECT octet_length(row_to_json(o)::text)::bigint+128 FROM record_operations o WHERE project_id=$1
 UNION ALL SELECT octet_length(row_to_json(v)::text)::bigint+128 FROM record_revision_audits v WHERE project_id=$1
 UNION ALL SELECT octet_length(jsonb_set(to_jsonb(a),'{created_at}',to_jsonb(to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::text)::bigint+128 FROM audits a WHERE project_id=$1 AND action LIKE 'record.%'
 UNION ALL SELECT octet_length(row_to_json(t)::text)::bigint+128 FROM record_tombstones t WHERE project_id=$1
 ) bytes),
 (SELECT COALESCE(sum(n),0) FROM (
 SELECT octet_length(row_to_json(r)::text)::bigint+128 n FROM records r WHERE project_id=$1 AND archived_at IS NOT NULL
 UNION ALL SELECT octet_length(row_to_json(o)::text)::bigint+128 FROM record_operations o JOIN records r ON r.id=o.target_id WHERE o.project_id=$1 AND r.archived_at IS NOT NULL
 UNION ALL SELECT octet_length(row_to_json(v)::text)::bigint+128 FROM record_revision_audits v JOIN records r ON r.id=v.record_id WHERE v.project_id=$1 AND r.archived_at IS NOT NULL
 UNION ALL SELECT octet_length(jsonb_set(to_jsonb(a),'{created_at}',to_jsonb(to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::text)::bigint+128 FROM audits a JOIN records r ON r.id=a.target_id WHERE a.project_id=$1 AND a.action LIKE 'record.%' AND r.archived_at IS NOT NULL
 ) bytes)`, pid, days).Scan(&result.HistoryRetentionDays, &result.Version, &result.UsedBytes, &result.ArchivedBytes)
	if result.HistoryRetentionDays > max {
		result.HistoryRetentionDays = max
	}
	result.NearLimit = result.UsedBytes >= result.LimitBytes-result.LimitBytes/10
	result.Etag = configurationETag("retention:"+pid, result.Version)
	return result, err
}
func (a *App) checkRecordCapacity(w http.ResponseWriter, r *http.Request, tx pgx.Tx, admission bool) bool {
	c, err := a.recordCapacity(r.Context(), tx, r.PathValue("projectId"))
	if err != nil {
		configurationFailure(w, err)
		return false
	}
	if c.UsedBytes > c.LimitBytes || admission && c.UsedBytes == c.LimitBytes {
		fail(w, 409, "capacity_full")
		return false
	}
	return true
}
func (a *App) getRecordCapacity(w http.ResponseWriter, r *http.Request) {
	tx, _, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	c, err := a.recordCapacity(r.Context(), tx, r.PathValue("projectId"))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, c, c.Etag)
}
func (a *App) updateRecordRetention(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, true, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	old, err := a.recordCapacity(ctx, tx, pid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if !configurationMatch(w, r, "retention:"+pid, old.Version) {
		return
	}
	var input wire.RecordRetentionInput
	if !decode(w, r, &input) {
		return
	}
	_, max := a.retentionDefaults()
	if input.HistoryRetentionDays < 1 || input.HistoryRetentionDays > max {
		fail(w, 400, "invalid_retention")
		return
	}
	if _, err = tx.Exec(ctx, `INSERT INTO record_retention_policies VALUES($1,$2,$3) ON CONFLICT(project_id) DO UPDATE SET history_retention_days=excluded.history_retention_days,version=excluded.version`, pid, input.HistoryRetentionDays, old.Version+1); err != nil {
		configurationFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "record.retention", pid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	c, err := a.recordCapacity(ctx, tx, pid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, c, c.Etag)
}

// Call only inside the same team lock as membership writes. Repeated removals
// never extend an existing archive's deletion deadline.
func (a *App) archivePrivateRecords(ctx context.Context, tx pgx.Tx, pid, uid string) error {
	_, err := tx.Exec(ctx, `UPDATE records SET archived_at=$3 WHERE project_id=$1 AND owner_id=$2 AND visibility='private' AND archived_at IS NULL`, pid, uid, a.Now())
	return err
}
func (a *App) restorePrivateRecords(ctx context.Context, tx pgx.Tx, pid, uid string) error {
	if err := a.clearRecords(ctx, tx, `project_id=$1 AND owner_id=$2 AND archived_at IS NOT NULL AND archived_at<=$3`, pid, uid, a.Now().Add(-privateArchiveDuration)); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE records SET archived_at=NULL WHERE project_id=$1 AND owner_id=$2 AND archived_at>$3`, pid, uid, a.Now().Add(-privateArchiveDuration))
	return err
}
func (a *App) clearRecords(ctx context.Context, tx pgx.Tx, predicate string, args ...any) error {
	// The caller controls SQL; no user input enters predicate. Delete bodies and
	// revision reasons, retain only idempotency receipts and identity tombstones.
	rows, err := tx.Query(ctx, `SELECT id FROM records WHERE `+predicate, args...)
	if err != nil {
		return err
	}
	ids := []string{}
	for rows.Next() {
		var rid string
		if err = rows.Scan(&rid); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, rid)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	if _, err = tx.Exec(ctx, `INSERT INTO record_tombstones SELECT id,project_id,owner_id,connection_id,run_id,kind,$2 FROM records WHERE id=ANY($1) ON CONFLICT(id) DO NOTHING`, ids, a.Now()); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM record_revision_audits WHERE record_id=ANY($1)`, ids); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `DELETE FROM records WHERE id=ANY($1)`, ids)
	return err
}

// Sweep is restart-safe and uses the authoritative clock. No cleanup endpoint
// is exposed. It serializes each team's cleanup with uploads and membership.
func (a *App) Sweep(ctx context.Context) error {
	rows, err := a.DB.Query(ctx, `SELECT id FROM teams ORDER BY id`)
	if err != nil {
		return err
	}
	teams := []string{}
	for rows.Next() {
		var tid string
		if err = rows.Scan(&tid); err != nil {
			rows.Close()
			return err
		}
		teams = append(teams, tid)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	for _, tid := range teams {
		if err = a.sweepTeam(ctx, tid); err != nil {
			return err
		}
	}
	return nil
}
func (a *App) sweepTeam(ctx context.Context, tid string) error {
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = lockTeamTx(ctx, tx, tid); err != nil {
		return err
	}
	days, max := a.retentionDefaults()
	err = a.clearRecords(ctx, tx, `project_id IN(SELECT id FROM projects WHERE team_id=$1) AND ((archived_at IS NOT NULL AND archived_at<=$2) OR (archived_at IS NULL AND kind='history' AND NOT pinned AND created_at<=($3::timestamptz - (LEAST(COALESCE((SELECT history_retention_days FROM record_retention_policies p WHERE p.project_id=records.project_id),$4),$5)*interval '1 day'))))`, tid, a.Now().Add(-privateArchiveDuration), a.Now(), days, max)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
