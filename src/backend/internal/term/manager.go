package term

import (
	"errors"
	"sync"
	"time"
)

var (
	ErrTooManySessions = errors.New("too many sessions")
	ErrSessionNotFound = errors.New("session not found")
)

type Manager struct {
	mu        sync.Mutex
	sessions  map[string]*Session
	max       int
	maxPerUID int
	grace     time.Duration
}

func NewManager(grace time.Duration) *Manager {
	return &Manager{
		sessions:  map[string]*Session{},
		max:       64,
		maxPerUID: 8,
		grace:     grace,
	}
}

func (m *Manager) Grace() time.Duration { return m.grace }

func (m *Manager) add(s *Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.sessions) >= m.max {
		return ErrTooManySessions
	}
	perUID := 0
	for _, existing := range m.sessions {
		if existing.UID == s.UID {
			perUID++
		}
	}
	if perUID >= m.maxPerUID {
		return ErrTooManySessions
	}
	m.sessions[s.ID] = s
	return nil
}

func (m *Manager) remove(id string) {
	m.mu.Lock()
	delete(m.sessions, id)
	m.mu.Unlock()
}

func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	return s, ok
}

func (m *Manager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sessions)
}

func (m *Manager) Shutdown() {
	m.mu.Lock()
	sessions := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.mu.Unlock()
	for _, s := range sessions {
		s.Kill("server shutdown")
	}
}
