package auth

import (
	"testing"

	"github.com/ofterm/ofterm/internal/model"
)

func TestTicketIsSingleUse(t *testing.T) {
	m := New()
	spec := model.TicketAuthorizedSession{Cols: 80, Rows: 24, UID: "1000", Listener: "gateway"}
	token, _, err := m.NewTicket(spec)
	if err != nil {
		t.Fatal(err)
	}
	got, ok := m.ConsumeTicket(token)
	if !ok {
		t.Fatal("ticket should be valid")
	}
	if got.UID != "1000" || got.Cols != 80 {
		t.Fatalf("unexpected spec: %+v", got)
	}
	if _, ok := m.ConsumeTicket(token); ok {
		t.Fatal("ticket must not be reusable")
	}
}

func TestUnknownTicketRejected(t *testing.T) {
	m := New()
	if _, ok := m.ConsumeTicket("missing"); ok {
		t.Fatal("unknown ticket must be rejected")
	}
}
