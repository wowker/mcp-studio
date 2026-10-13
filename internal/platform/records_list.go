package platform

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mcp-studio/internal/wire"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

type recordCursor struct {
	UserID, ProjectID, Filters, CreatedAt, ID string
	HighWater                                 int64
}

func (a *App) cursorKey() []byte {
	a.recordCursorOnce.Do(func() {
		if _, err := rand.Read(a.recordCursorSecret[:]); err != nil {
			panic("random source unavailable")
		}
	})
	return a.recordCursorSecret[:]
}
func (a *App) encodeRecordCursor(cursor recordCursor) string {
	body, _ := json.Marshal(cursor)
	mac := hmac.New(sha256.New, a.cursorKey())
	mac.Write(body)
	return base64.RawURLEncoding.EncodeToString(body) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
func (a *App) decodeRecordCursor(raw string) (recordCursor, bool) {
	var cursor recordCursor
	if len(raw) > 4096 {
		return cursor, false
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 2 {
		return cursor, false
	}
	body, e1 := base64.RawURLEncoding.DecodeString(parts[0])
	sum, e2 := base64.RawURLEncoding.DecodeString(parts[1])
	if e1 != nil || e2 != nil {
		return cursor, false
	}
	mac := hmac.New(sha256.New, a.cursorKey())
	mac.Write(body)
	if !hmac.Equal(mac.Sum(nil), sum) || json.Unmarshal(body, &cursor) != nil || cursor.HighWater < 0 {
		return cursor, false
	}
	return cursor, true
}

func (a *App) listRecords(w http.ResponseWriter, r *http.Request) {
	tx, u, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	query := r.URL.Query()
	allowed := map[string]bool{}
	for _, key := range []string{"kind", "connectionId", "toolName", "visibility", "status", "search", "environmentId", "ownerId", "from", "to", "contentKind", "cursor", "limit"} {
		allowed[key] = true
	}
	for key, values := range query {
		if !allowed[key] || len(values) != 1 {
			fail(w, 400, "invalid_filter")
			return
		}
	}
	limit := 50
	if value := query.Get("limit"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 100 {
			fail(w, 400, "invalid_limit")
			return
		}
		limit = n
	}
	query.Set("limit", strconv.Itoa(limit))
	kind := query.Get("kind")
	if kind == "" {
		kind = "history"
		query.Set("kind", kind)
	}
	if !oneOf(kind, "history", "saved") {
		fail(w, 400, "invalid_filter")
		return
	}
	for key, values := range map[string][]string{"visibility": {"private", "project"}, "status": {"succeeded", "failed", "cancelled", "idle"}, "contentKind": {"request", "request-response"}} {
		if value := query.Get(key); value != "" && !oneOf(value, values...) {
			fail(w, 400, "invalid_filter")
			return
		}
	}
	for _, key := range []string{"toolName", "search", "connectionId", "ownerId", "environmentId"} {
		if len(query.Get(key)) > 256 {
			fail(w, 400, "invalid_filter")
			return
		}
	}
	for _, key := range []string{"from", "to"} {
		if value := query.Get(key); value != "" {
			if _, err := time.Parse(time.RFC3339Nano, value); err != nil {
				fail(w, 400, "invalid_filter")
				return
			}
		}
	}
	rawCursor := query.Get("cursor")
	query.Del("cursor")
	filterHash := digest(query.Encode())
	cursor := recordCursor{UserID: u.ID, ProjectID: pid, Filters: filterHash}
	if rawCursor != "" {
		parsed, ok := a.decodeRecordCursor(rawCursor)
		if !ok || parsed.UserID != u.ID || parsed.ProjectID != pid || parsed.Filters != filterHash {
			fail(w, 400, "invalid_cursor")
			return
		}
		cursor = parsed
		if _, err := time.Parse(time.RFC3339Nano, cursor.CreatedAt); err != nil || !validRecordID(cursor.ID) {
			fail(w, 400, "invalid_cursor")
			return
		}
	} else {
		if err := tx.QueryRow(ctx, `SELECT COALESCE(max(sequence),0) FROM records WHERE project_id=$1`, pid).Scan(&cursor.HighWater); err != nil {
			configurationFailure(w, err)
			return
		}
	}
	args := []any{pid, u.ID, kind, cursor.HighWater}
	clauses := []string{`r.archived_at IS NULL`, `r.project_id=$1`, `(r.visibility='project' OR r.owner_id=$2)`, `r.kind=$3`, `r.sequence<=$4`}
	add := func(expression string, value any) {
		args = append(args, value)
		clauses = append(clauses, fmt.Sprintf(expression, len(args)))
	}
	columns := map[string]string{"connectionId": "r.connection_id", "ownerId": "r.owner_id", "visibility": "r.visibility", "toolName": "r.body->'snapshot'->>'toolName'", "status": "r.body->'snapshot'->>'runStatus'", "environmentId": "r.body->'snapshot'->>'environmentId'", "contentKind": "r.body->'metadata'->>'contentKind'"}
	keys := make([]string, 0, len(columns))
	for key := range columns {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if value := query.Get(key); value != "" {
			add(columns[key]+"=$%d", value)
		}
	}
	if search := query.Get("search"); search != "" {
		add(`position(lower($%d) in lower((r.body->'metadata'->>'name')||' '||(r.body->'metadata'->>'note')||' '||(r.body->'snapshot'->>'toolName')))>0`, search)
	}
	for key, op := range map[string]string{"from": ">=", "to": "<="} {
		if value := query.Get(key); value != "" {
			add("r.created_at"+op+"$%d::timestamptz", value)
		}
	}
	if rawCursor != "" {
		args = append(args, cursor.CreatedAt, cursor.ID)
		clauses = append(clauses, fmt.Sprintf("(r.created_at,r.id)<($%d::timestamptz,$%d)", len(args)-1, len(args)))
	}
	args = append(args, limit+1)
	rows, err := tx.Query(ctx, `SELECT `+recordColumns+` FROM records r JOIN users u ON u.id=r.owner_id WHERE `+strings.Join(clauses, " AND ")+fmt.Sprintf(" ORDER BY r.created_at DESC,r.id DESC LIMIT $%d", len(args)), args...)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	items := []wire.Record{}
	for rows.Next() {
		item, err := scanRecord(rows)
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
	page := wire.RecordPage{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		last := page.Items[limit-1]
		cursor.CreatedAt = last.CreatedAt
		cursor.ID = last.ID
		page.NextCursor = a.encodeRecordCursor(cursor)
	}
	configurationCommit(w, r, tx, page, "")
}
