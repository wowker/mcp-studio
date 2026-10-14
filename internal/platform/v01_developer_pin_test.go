package platform

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/wire"
	"net/http"
	"reflect"
	"testing"
	"time"
)

// A38 / D03: replacing maintainer-only authorization with execution permission
// or record ownership must not let a Developer pin or unpin shared history.
func TestV01A38DeveloperDirectPinAndUnpinDeniedWithoutMutation(t *testing.T) {
	a, mail := testApp(t)
	ownerSession, ownerCookie := owner(t, a, mail)
	project := createProject(t, a, ownerSession, ownerCookie, "A38 pin authorization")
	base := "/api/v1/projects/" + project.ID

	maintainerID := addUser(t, a, "pin-maintainer@example.test", project.TeamID, "member")
	developerID := addUser(t, a, "pin-developer@example.test", project.TeamID, "member")
	for _, member := range []struct{ uid, role string }{{maintainerID, "maintainer"}, {developerID, "developer"}} {
		configurationData[wire.Accepted](t, configurationRequest(t, a, "PATCH", base+"/members/"+member.uid, wire.MemberRequest{Role: wire.ProjectRole(member.role)}, ownerSession, ownerCookie, ""), 200)
	}
	maintainer, maintainerCookie := login(t, a, "pin-maintainer@example.test")
	developer, developerCookie := login(t, a, "pin-developer@example.test")
	for _, member := range []struct {
		session wire.Session
		cookie  *http.Cookie
		role    string
	}{{maintainer, maintainerCookie, "maintainer"}, {developer, developerCookie, "developer"}} {
		current := configurationData[wire.Project](t, configurationRequest(t, a, "GET", base, nil, member.session, member.cookie, ""), 200)
		if current.Role != member.role || !current.CanRead || len(member.session.Teams) != 1 || member.session.Teams[0].Role != "member" {
			t.Fatalf("fixture must use live project membership and ordinary team member: project=%+v teams=%+v", current, member.session.Teams)
		}
	}
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("A38 shared history"), maintainer, maintainerCookie, ""), 200)

	// Advancing the fixture clock makes an accidental updated_at write observable.
	now := a.Now()
	a.Now = func() time.Time { return now }
	persistedState := func(t *testing.T, recordID string) string {
		t.Helper()
		var state string
		err := a.DB.QueryRow(context.Background(), `SELECT jsonb_build_object(
			'record',(SELECT to_jsonb(r) FROM records r WHERE r.project_id=$1 AND r.id=$2),
			'audits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM audits a WHERE a.project_id=$1),
			'revisionAudits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM record_revision_audits a WHERE a.project_id=$1)
		)::text`, project.ID, recordID).Scan(&state)
		if err != nil {
			t.Fatal(err)
		}
		return state
	}

	for _, source := range []struct {
		name    string
		session wire.Session
		cookie  *http.Cookie
	}{{"developer_owns_history", developer, developerCookie}, {"another_member_owns_history", maintainer, maintainerCookie}} {
		t.Run(source.name, func(t *testing.T) {
			input := frozenUpload(t, source.session.User.ID, project.ID, conn, "history", "project")
			receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, source.session, source.cookie, ""), 200)
			path := base + "/records/" + receipt.RecordID
			current := configurationData[wire.Record](t, configurationRequest(t, a, "GET", path, nil, developer, developerCookie, ""), 200)
			if current.ID != input.TargetID || current.OwnerID != source.session.User.ID || current.Kind != "history" || current.Metadata.Visibility != "project" || current.Pinned || current.Version != 1 {
				t.Fatalf("fixture must be real uploaded, readable, unpinned shared history: %+v", current)
			}

			denyDeveloper := func(t *testing.T, pinned bool) {
				t.Helper()
				before := persistedState(t, current.ID)
				now = now.Add(time.Minute)
				w := configurationRequest(t, a, "PATCH", path+"/pin", wire.RecordPinInput{Pinned: pinned}, developer, developerCookie, current.Etag)
				if w.Code != http.StatusForbidden {
					t.Fatalf("Developer direct pin=%t status=%d want=403: %s", pinned, w.Code, w.Body.String())
				}
				var failure wire.Error
				if err := json.Unmarshal(w.Body.Bytes(), &failure); err != nil || failure.Error.Code != "forbidden" {
					t.Fatalf("denial must be project authorization, got %s err=%v", w.Body.String(), err)
				}
				after := configurationData[wire.Record](t, configurationRequest(t, a, "GET", path, nil, developer, developerCookie, ""), 200)
				if !reflect.DeepEqual(after, current) {
					t.Fatalf("denied pin=%t changed record/state/etag/version/updatedAt: before=%+v after=%+v", pinned, current, after)
				}
				if afterState := persistedState(t, current.ID); afterState != before {
					t.Fatalf("denied pin=%t mutated persisted record or project audits: before=%s after=%s", pinned, before, afterState)
				}
				t.Logf("Developer direct PATCH pin=%t: 403 forbidden; record, etag, version, updatedAt and audits unchanged", pinned)
			}
			setByMaintainer := func(t *testing.T, pinned bool, auditCount int) {
				t.Helper()
				previous := current
				now = now.Add(time.Minute)
				w := configurationRequest(t, a, "PATCH", path+"/pin", wire.RecordPinInput{Pinned: pinned}, maintainer, maintainerCookie, previous.Etag)
				current = configurationData[wire.Record](t, w, 200)
				if current.Pinned != pinned || current.Version != previous.Version+1 || current.Etag == previous.Etag || current.Etag != w.Header().Get("ETag") || current.UpdatedAt != now.UTC().Format(time.RFC3339Nano) || current.OwnerID != previous.OwnerID {
					t.Fatalf("Maintainer pin=%t did not conditionally update history: before=%+v after=%+v", pinned, previous, current)
				}
				var total, byMaintainer int
				err := a.DB.QueryRow(context.Background(), `SELECT count(*),count(*) FILTER(WHERE actor_id=$3) FROM audits WHERE project_id=$1 AND target_id=$2 AND action='record.pin'`, project.ID, current.ID, maintainerID).Scan(&total, &byMaintainer)
				if err != nil || total != auditCount || byMaintainer != auditCount {
					t.Fatalf("pin audit must belong only to successful Maintainer updates: total=%d maintainer=%d want=%d err=%v", total, byMaintainer, auditCount, err)
				}
				t.Logf("ordinary team member with live Maintainer role PATCH pin=%t: 200; version and audit advance", pinned)
			}

			denyDeveloper(t, true)
			setByMaintainer(t, true, 1)
			denyDeveloper(t, false)
			setByMaintainer(t, false, 2)
		})
	}
}
