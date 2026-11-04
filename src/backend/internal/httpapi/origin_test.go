package httpapi

import (
	"net/http/httptest"
	"testing"
)

func TestOriginAllowed(t *testing.T) {
	s := &Server{}

	same := httptest.NewRequest("POST", "http://nas.local/app/ofterm/api/v1/tickets", nil)
	same.Host = "nas.local"
	same.Header.Set("Origin", "http://nas.local")
	if !s.originAllowed(same) {
		t.Fatal("same-origin request should pass")
	}

	forwarded := httptest.NewRequest("POST", "http://127.0.0.1:5122/api/v1/tickets", nil)
	forwarded.Host = "127.0.0.1:5122"
	forwarded.Header.Set("Origin", "https://remote.example.com")
	forwarded.Header.Set("X-Forwarded-Host", "remote.example.com")
	if !s.originAllowed(forwarded) {
		t.Fatal("forwarded public host should pass")
	}

	directMismatch := httptest.NewRequest("POST", "http://nas.local/api/v1/tickets", nil)
	directMismatch.Host = "nas.local"
	directMismatch.Header.Set("Origin", "https://evil.example.com")
	if s.originAllowed(directMismatch) {
		t.Fatal("direct-mode origin mismatch must be rejected")
	}
}
