package auth

import (
	"crypto/rand"
	"encoding/base64"
	"sync"
	"time"

	"github.com/ofterm/ofterm/internal/model"
)

const ticketTTL = 30 * time.Second

type ticket struct {
	Spec      model.TicketAuthorizedSession
	ExpiresAt time.Time
}

// Manager issues the short-lived, single-use tickets used to authorize
// terminal WebSocket upgrades. There is no application password: fnOS gateway
// mode trusts X-Trim-* from the Unix listener, and direct dev mode uses the
// process user.
type Manager struct {
	mu      sync.Mutex
	tickets map[string]ticket
}

func New() *Manager {
	return &Manager{tickets: map[string]ticket{}}
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (m *Manager) NewTicket(spec model.TicketAuthorizedSession) (string, time.Time, error) {
	token, err := randomToken()
	if err != nil {
		return "", time.Time{}, err
	}
	exp := time.Now().Add(ticketTTL)
	m.mu.Lock()
	m.tickets[token] = ticket{Spec: spec, ExpiresAt: exp}
	m.mu.Unlock()
	return token, exp, nil
}

func (m *Manager) ConsumeTicket(token string) (model.TicketAuthorizedSession, bool) {
	m.mu.Lock()
	t, ok := m.tickets[token]
	if ok {
		delete(m.tickets, token)
	}
	m.mu.Unlock()
	if !ok || time.Now().After(t.ExpiresAt) {
		return model.TicketAuthorizedSession{}, false
	}
	return t.Spec, true
}

func (m *Manager) Cleanup() {
	now := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, t := range m.tickets {
		if now.After(t.ExpiresAt) {
			delete(m.tickets, k)
		}
	}
}
