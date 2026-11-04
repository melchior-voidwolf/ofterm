package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/user"
	"strconv"
	"strings"

	"github.com/ofterm/ofterm/internal/auth"
	"github.com/ofterm/ofterm/internal/config"
	"github.com/ofterm/ofterm/internal/gateway"
	"github.com/ofterm/ofterm/internal/model"
	"github.com/ofterm/ofterm/internal/store"
	"github.com/ofterm/ofterm/internal/term"
	"github.com/ofterm/ofterm/internal/web"
)

const (
	csrfHeader  = "X-Requested-With"
	csrfValue   = "OFTerm"
	requestLimit = 2 << 20
)

type Server struct {
	cfg   config.Config
	store *store.Store
	auth  *auth.Manager
	term  *term.Manager
	log   *slog.Logger
}

func New(cfg config.Config, st *store.Store, am *auth.Manager, tm *term.Manager, log *slog.Logger) *Server {
	return &Server{cfg: cfg, store: st, auth: am, term: tm, log: log}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/v1/health", s.handleHealth)
	mux.HandleFunc("GET /api/v1/me", s.handleMe)

	mux.HandleFunc("GET /api/v1/settings", s.handleGetSettings)
	mux.HandleFunc("PUT /api/v1/settings", s.handlePutSettings)


	mux.HandleFunc("GET /api/v1/commands", s.handleListCommands)
	mux.HandleFunc("POST /api/v1/commands", s.handleCreateCommand)
	mux.HandleFunc("PUT /api/v1/commands/{id}", s.handleUpdateCommand)
	mux.HandleFunc("DELETE /api/v1/commands/{id}", s.handleDeleteCommand)

	mux.HandleFunc("POST /api/v1/tickets", s.handleCreateTicket)
	mux.HandleFunc("GET /ws/terminal", s.handleTerminalWS)

	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "unknown API route")
	})
	mux.Handle("/", web.Handler())

	base := s.cfg.BasePath
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if base != "" && base != "/" {
			p := r.URL.Path
			if p == base {
				target := base + "/"
				if r.URL.RawQuery != "" {
					target += "?" + r.URL.RawQuery
				}
				http.Redirect(w, r, target, http.StatusPermanentRedirect)
				return
			}
			if strings.HasPrefix(p, base+"/") {
				p = strings.TrimPrefix(p, base)
				if p == "" {
					p = "/"
				}
				r.URL.Path = p
			}
		}
		s.securityHeaders(w)
		if isMutation(r.Method) {
			if r.Header.Get(csrfHeader) != csrfValue {
				writeError(w, http.StatusForbidden, "csrf", "missing request header")
				return
			}
			if origin := r.Header.Get("Origin"); origin != "" && !originAllowed(origin, r.Host) {
				writeError(w, http.StatusForbidden, "origin", "origin not allowed")
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
	return handler
}

func (s *Server) securityHeaders(w http.ResponseWriter) {
	ancestors := s.cfg.FrameAncestors
	if ancestors == "" {
		ancestors = "'self'"
	}
	w.Header().Set("Content-Security-Policy",
		"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "+
			"img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; "+
			"frame-ancestors "+ancestors+"; base-uri 'self'; form-action 'self'")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Permissions-Policy", "clipboard-read=(), clipboard-write=(self), camera=(), microphone=(), geolocation=()")
}

func (s *Server) identity(r *http.Request) (model.Identity, bool) {
	ci, _ := gateway.FromContext(r.Context())
	if ci.Kind == "gateway" {
		if ci.PeerOK && !s.cfg.TrustUnixAll && ci.PeerUID != 0 && ci.PeerUID != uint32(os.Geteuid()) {
			return identityForUID(ci.PeerUID, false, true), true
		}
		uid := strings.TrimSpace(r.Header.Get("X-Trim-Userid"))
		username := strings.TrimSpace(r.Header.Get("X-Trim-Username"))
		admin := strings.EqualFold(r.Header.Get("X-Trim-Isadmin"), "true") || r.Header.Get("X-Trim-Isadmin") == "1"
		if uid == "" {
			// fnOS owns access control; if the gateway did not forward an
			// identity, fall back to the process user rather than blocking.
			if u, err := user.Current(); err == nil {
				uid = u.Uid
				if username == "" {
					username = u.Username
				}
				admin = true
			}
		}
		return model.Identity{UID: uid, Username: username, IsAdmin: admin, Gateway: true}, true
	}
	u, err := user.Current()
	if err != nil {
		return model.Identity{UID: "unknown", Username: "unknown", IsAdmin: true}, true
	}
	return model.Identity{UID: u.Uid, Username: u.Username, IsAdmin: true}, true
}


func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"name":    "ofterm",
		"version": s.cfg.Version,
		"mode":    s.cfg.Mode,
	})
}

func identityForUID(uid uint32, admin, gatewayUser bool) model.Identity {
	id := strconv.FormatUint(uint64(uid), 10)
	name := id
	if u, err := user.LookupId(id); err == nil {
		name = u.Username
	}
	return model.Identity{UID: id, Username: name, IsAdmin: admin, Gateway: gatewayUser}
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	id, _ := s.identity(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"authenticated": true,
		"gateway":       id.Gateway,
		"mode":          s.cfg.Mode,
		"version":       s.cfg.Version,
		"uid":           id.UID,
		"username":      id.Username,
		"isAdmin":       id.IsAdmin,
	})
}

func isMutation(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func originAllowed(origin, host string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	if strings.EqualFold(u.Host, host) {
		return true
	}
	h := u.Hostname()
	return h == "localhost" || h == "127.0.0.1" || h == "::1"
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, requestLimit)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "bad_json", err.Error())
		return false
	}
	return true
}



