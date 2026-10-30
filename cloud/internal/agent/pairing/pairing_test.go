package pairing

import (
	"context"
	"testing"
	"time"
)

func TestOneTimeLocalApprovalBindingAndExpiry(t *testing.T) {
	now := time.Unix(1700000000, 0)
	m := New(func() time.Time { return now })
	grant := Grant{Token: "platform-only", UserID: "u", DeviceID: "d", Origin: "https://work.example", ExpiresAt: now.Add(15 * time.Minute)}
	ch, code, err := m.Challenge(grant, []string{"execute"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = m.Confirm(ch.ChallengeID, code, grant.Origin, "d"); err == nil {
		t.Fatal("web code bypassed local approval")
	}
	if err = m.Approve(context.Background(), ch.ChallengeID, func(context.Context, Prompt) (bool, error) { return true, nil }); err != nil {
		t.Fatal(err)
	}
	if _, err = m.Confirm(ch.ChallengeID, code, "https://evil.example", "d"); err == nil {
		t.Fatal("wrong origin")
	}
	session, err := m.Confirm(ch.ChallengeID, code, grant.Origin, "d")
	if err != nil {
		t.Fatal(err)
	}
	if session.ChannelToken == grant.Token {
		t.Fatal("credential reuse")
	}
	if _, err = m.Confirm(ch.ChallengeID, code, grant.Origin, "d"); err == nil {
		t.Fatal("replay")
	}
	if _, err = m.Authenticate(session.ChannelToken, grant.Origin, "d"); err != nil {
		t.Fatal(err)
	}
	now = now.Add(15 * time.Minute)
	if _, err = m.Authenticate(session.ChannelToken, grant.Origin, "d"); err == nil {
		t.Fatal("expired channel")
	}
}
func TestDeniedAndExpiredChallenge(t *testing.T) {
	now := time.Now()
	m := New(func() time.Time { return now })
	g := Grant{Token: "p", UserID: "u", DeviceID: "d", Origin: "https://w", ExpiresAt: now.Add(time.Hour)}
	c, code, _ := m.Challenge(g, nil)
	m.Approve(context.Background(), c.ChallengeID, func(context.Context, Prompt) (bool, error) { return false, nil })
	if _, err := m.Confirm(c.ChallengeID, code, g.Origin, g.DeviceID); err == nil {
		t.Fatal("denied")
	}
	c, code, _ = m.Challenge(g, nil)
	m.Approve(context.Background(), c.ChallengeID, func(context.Context, Prompt) (bool, error) { return true, nil })
	now = now.Add(time.Minute)
	if _, err := m.Confirm(c.ChallengeID, code, g.Origin, g.DeviceID); err == nil {
		t.Fatal("expired")
	}
}
