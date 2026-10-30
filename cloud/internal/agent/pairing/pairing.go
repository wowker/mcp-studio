// Package pairing separates platform grants from local, one-time approval and channel credentials.
package pairing

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"sync"
	"time"
)

var ErrRejected = errors.New("pairing_rejected")

type Grant struct {
	Token, UserID, DeviceID, Origin string
	ExpiresAt                       time.Time
}
type Challenge struct {
	ChallengeID  string    `json:"challengeId"`
	ExpiresAt    time.Time `json:"expiresAt"`
	DeviceID     string    `json:"deviceId"`
	UserID       string    `json:"userId"`
	Origin       string    `json:"origin"`
	State        string    `json:"state"`
	Capabilities []string  `json:"capabilities"`
}
type Session struct {
	PairingID    string    `json:"pairingId"`
	ChannelToken string    `json:"channelToken"`
	UserID       string    `json:"userId"`
	DeviceID     string    `json:"deviceId"`
	Origin       string    `json:"origin"`
	ExpiresAt    time.Time `json:"expiresAt"`
	Capabilities []string  `json:"capabilities"`
	Grant        Grant     `json:"-"`
}
type Prompt struct {
	Challenge        Challenge
	Code             string
	Command          string
	Args             []string
	Cwd              string
	EnvironmentNames []string
}
type ConfirmLocal func(context.Context, Prompt) (bool, error)
type pending struct {
	challenge        Challenge
	code             string
	grant            Grant
	approved, denied bool
}
type Manager struct {
	mu       sync.Mutex
	now      func() time.Time
	pending  map[string]*pending
	sessions map[string]Session
}

func New(now func() time.Time) *Manager {
	if now == nil {
		now = time.Now
	}
	return &Manager{now: now, pending: map[string]*pending{}, sessions: map[string]Session{}}
}
func Random() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("CSPRNG unavailable")
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func (m *Manager) Challenge(g Grant, caps []string) (Challenge, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if g.Token == "" || g.UserID == "" || g.DeviceID == "" || g.Origin == "" || !m.now().Before(g.ExpiresAt) {
		return Challenge{}, "", ErrRejected
	}
	for id, p := range m.pending {
		if !m.now().Before(p.challenge.ExpiresAt) {
			delete(m.pending, id)
		}
	}
	if len(m.pending) >= 32 {
		return Challenge{}, "", ErrRejected
	}
	c := Challenge{Random(), m.now().Add(time.Minute), g.DeviceID, g.UserID, g.Origin, "pending", append([]string{}, caps...)}
	code := Random()
	m.pending[c.ChallengeID] = &pending{challenge: c, code: code, grant: g}
	return c, code, nil
}
func (m *Manager) Approve(ctx context.Context, id string, confirm ConfirmLocal) error {
	m.mu.Lock()
	p := m.pending[id]
	if p == nil || !m.now().Before(p.challenge.ExpiresAt) || confirm == nil {
		m.mu.Unlock()
		return ErrRejected
	}
	prompt := Prompt{Challenge: p.challenge, Code: p.code}
	m.mu.Unlock()
	approved, err := confirm(ctx, prompt)
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.pending[id] != p || !m.now().Before(p.challenge.ExpiresAt) {
		return ErrRejected
	}
	p.approved = approved && err == nil
	p.denied = !p.approved
	if p.denied {
		return ErrRejected
	}
	return nil
}
func (m *Manager) Confirm(id, code, origin, device string) (Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.pending[id]
	if p == nil || p.denied || !p.approved || !m.now().Before(p.challenge.ExpiresAt) || !m.now().Before(p.grant.ExpiresAt) || p.grant.Origin != origin || p.grant.DeviceID != device || subtle.ConstantTimeCompare([]byte(p.code), []byte(code)) != 1 {
		return Session{}, ErrRejected
	}
	delete(m.pending, id)
	expires := m.now().Add(15 * time.Minute)
	if p.grant.ExpiresAt.Before(expires) {
		expires = p.grant.ExpiresAt
	}
	s := Session{Random(), Random(), p.grant.UserID, device, origin, expires, p.challenge.Capabilities, p.grant}
	m.sessions[s.ChannelToken] = s
	return s, nil
}
func (m *Manager) Authenticate(token, origin, device string) (Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[token]
	if !ok || s.Origin != origin || s.DeviceID != device || !m.now().Before(s.ExpiresAt) {
		return Session{}, ErrRejected
	}
	return s, nil
}
func (m *Manager) Revoke(token, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[token]
	if !ok || s.PairingID != id {
		return ErrRejected
	}
	delete(m.sessions, token)
	return nil
}
