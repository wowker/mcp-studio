//go:build !local

package platform

import (
	"context"
	"mcp-studio/internal/wire"
	"reflect"
	"testing"
)

func TestV01A01NewProjectHasNoContentAndCreatorIsMaintainer(t *testing.T) {
	a, mail := testApp(t)
	s, cookie := owner(t, a, mail)
	// A populated sibling guards against accidentally returning another project's content.
	sibling := createProject(t, a, s, cookie, "Populated sibling")
	siblingBase := "/api/v1/projects/" + sibling.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", siblingBase+"/connections", httpConfiguration("Existing server"), s, cookie, ""), 200)
	configurationData[wire.Environment](t, configurationRequest(t, a, "POST", siblingBase+"/environments", wire.EnvironmentInput{Name: "Existing environment"}, s, cookie, ""), 200)
	for _, kind := range []string{"history", "saved"} {
		input := frozenUpload(t, s.User.ID, sibling.ID, conn, kind, "project")
		configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", siblingBase+"/record-uploads", input, s, cookie, ""), 200)
	}

	project := createProject(t, a, s, cookie, "Empty project")
	base := "/api/v1/projects/" + project.ID
	if project.Role != "maintainer" || !project.CanRead || !project.CanManage {
		t.Fatalf("creator did not receive maintainer access: %+v", project)
	}
	members := configurationData[[]wire.Member](t, configurationRequest(t, a, "GET", base+"/members", nil, s, cookie, ""), 200)
	if len(members) != 1 || members[0].ID != s.User.ID || members[0].ProjectRole != "maintainer" {
		t.Fatalf("new project membership is not exactly the creator maintainer: %+v", members)
	}
	connections := configurationData[[]wire.Connection](t, configurationRequest(t, a, "GET", base+"/connections", nil, s, cookie, ""), 200)
	environments := configurationData[[]wire.Environment](t, configurationRequest(t, a, "GET", base+"/environments", nil, s, cookie, ""), 200)
	if len(connections) != 0 || len(environments) != 0 {
		t.Fatalf("new project contains configuration: connections=%+v environments=%+v", connections, environments)
	}
	for _, kind := range []string{"history", "saved"} {
		t.Run(kind+"_empty", func(t *testing.T) {
			page := configurationData[wire.RecordPage](t, configurationRequest(t, a, "GET", base+"/records?kind="+kind, nil, s, cookie, ""), 200)
			if len(page.Items) != 0 || page.NextCursor != "" {
				t.Fatalf("new project has %s content: %+v", kind, page)
			}
		})
	}
	var persistedContent int
	err := a.DB.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM connections WHERE project_id=$1)+(SELECT count(*) FROM environments WHERE project_id=$1)+(SELECT count(*) FROM variables WHERE project_id=$1)+(SELECT count(*) FROM records WHERE project_id=$1)+(SELECT count(*) FROM record_operations WHERE project_id=$1)`, project.ID).Scan(&persistedContent)
	if err != nil || persistedContent != 0 {
		t.Fatalf("new project persisted content count=%d err=%v", persistedContent, err)
	}
}

func TestV01A28SharedHistoryAndPublishedSavedAttributionSurvivesRemoval(t *testing.T) {
	for _, scope := range []string{"project", "team"} {
		t.Run(scope, func(t *testing.T) {
			a, mail := testApp(t)
			ownerSession, ownerCookie := owner(t, a, mail)
			project := createProject(t, a, ownerSession, ownerCookie, "Attribution")
			base := "/api/v1/projects/" + project.ID
			uid := addUser(t, a, "contributor@example.test", ownerSession.Teams[0].ID, "member")
			if _, err := a.DB.Exec(context.Background(), `UPDATE users SET name='Original contributor' WHERE id=$1`, uid); err != nil {
				t.Fatal(err)
			}
			configurationData[wire.Accepted](t, configurationRequest(t, a, "PATCH", base+"/members/"+uid, wire.MemberRequest{Role: "maintainer"}, ownerSession, ownerCookie, ""), 200)
			contributor, contributorCookie := login(t, a, "contributor@example.test")
			conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("Shared source"), contributor, contributorCookie, ""), 200)
			historyInput := frozenUpload(t, uid, project.ID, conn, "history", "project")
			configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", historyInput, contributor, contributorCookie, ""), 200)
			history := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+historyInput.TargetID, nil, contributor, contributorCookie, ""), 200)
			savedInput := frozenUpload(t, uid, project.ID, conn, "saved", "private")
			savedInput.SourceRunID, savedInput.Snapshot = history.Snapshot.RunID, history.Snapshot
			freezeUpload(t, &savedInput)
			configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", savedInput, contributor, contributorCookie, ""), 200)
			private := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+savedInput.TargetID, nil, contributor, contributorCookie, ""), 200)
			publish := frozenRevision(t, uid, project.ID, private, "metadata")
			publish.Metadata.Visibility = "project"
			freezeRevision(t, &publish)
			configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/records/"+private.ID+"/revisions", publish, contributor, contributorCookie, private.Etag), 200)
			saved := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+private.ID, nil, ownerSession, ownerCookie, ""), 200)
			for _, record := range []wire.Record{history, saved} {
				if record.OwnerID != uid || record.OwnerName != "Original contributor" || record.Metadata.Visibility != "project" {
					t.Fatalf("shared fixture lacks original attribution: %+v", record)
				}
			}

			removal := base + "/members/" + uid
			if scope == "team" {
				removal = "/api/v1/teams/" + ownerSession.Teams[0].ID + "/members/" + uid
			}
			configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", removal, nil, ownerSession, ownerCookie, ""), 200)
			configurationData[wire.Accepted](t, configurationRequest(t, a, "GET", base+"/members", nil, contributor, contributorCookie, ""), 403)
			for _, before := range []wire.Record{history, saved} {
				t.Run(before.Kind+"_retained", func(t *testing.T) {
					after := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+before.ID, nil, ownerSession, ownerCookie, ""), 200)
					if after.OwnerID != uid || after.OwnerName != "Original contributor" || !reflect.DeepEqual(after, before) {
						t.Fatalf("%s removal changed shared content/attribution: before=%+v after=%+v", scope, before, after)
					}
					listed := configurationData[wire.RecordPage](t, configurationRequest(t, a, "GET", base+"/records?kind="+before.Kind, nil, ownerSession, ownerCookie, ""), 200)
					if len(listed.Items) != 1 || listed.Items[0].ID != before.ID || listed.Items[0].OwnerID != uid || listed.Items[0].OwnerName != "Original contributor" {
						t.Fatalf("shared record list lost original attribution: %+v", listed)
					}
				})
			}
		})
	}
}
