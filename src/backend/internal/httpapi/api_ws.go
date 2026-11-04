package httpapi

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"

	"github.com/ofterm/ofterm/internal/gateway"
	"github.com/ofterm/ofterm/internal/model"
	"github.com/ofterm/ofterm/internal/term"
)

func (s *Server) handleCreateTicket(w http.ResponseWriter, r *http.Request) {
	id, ok := s.identity(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	var req struct {
		Cols         int `json:"cols"`
		Rows         int `json:"rows"`
		GraceSeconds int `json:"graceSeconds"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	ci, _ := gateway.FromContext(r.Context())
	spec := model.TicketAuthorizedSession{
		Cols:         req.Cols,
		Rows:         req.Rows,
		GraceSeconds: req.GraceSeconds,
		UID:          id.UID,
		Username: id.Username,
		IsAdmin:  id.IsAdmin,
		Listener: ci.Kind,
		Origin:   r.Header.Get("Origin"),
	}
	token, exp, err := s.auth.NewTicket(spec)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "ticket", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ticket":    token,
		"expiresAt": exp.Unix(),
	})
}

func wsProtocolToken(r *http.Request, prefix string) string {
	raw := r.Header.Get("Sec-WebSocket-Protocol")
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, prefix+".") {
			return strings.TrimPrefix(part, prefix+".")
		}
	}
	return ""
}

func (s *Server) handleTerminalWS(w http.ResponseWriter, r *http.Request) {
	id, ok := s.identity(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	if !s.originAllowed(r) {
		writeError(w, http.StatusForbidden, "origin", "origin not allowed")
		return
	}
	ci, _ := gateway.FromContext(r.Context())
	s.log.Info("terminal websocket request",
		"host", r.Host,
		"origin", r.Header.Get("Origin"),
		"listener", ci.Kind,
		"has_ticket", r.URL.Query().Get("ticket") != "" || wsProtocolToken(r, "ticket") != "",
	)

	var sess *term.Session
	var sub *term.Subscriber
	var replay []term.Frame
	resumed := false

	sessionID := wsProtocolToken(r, "session")
	if sessionID == "" {
		sessionID = r.URL.Query().Get("sessionId")
	}
	if sessionID != "" {
		existing, found := s.term.Get(sessionID)
		if !found {
			writeError(w, http.StatusNotFound, "session_not_found", "session has ended")
			return
		}
		if existing.UID != id.UID {
			writeError(w, http.StatusForbidden, "forbidden", "session belongs to another user")
			return
		}
		token := wsProtocolToken(r, "resume")
		if token == "" {
			token = r.URL.Query().Get("resumeToken")
		}
		if subtle.ConstantTimeCompare([]byte(existing.ResumeToken), []byte(token)) != 1 {
			writeError(w, http.StatusForbidden, "invalid_resume", "invalid resume token")
			return
		}
		lastSeqRaw := wsProtocolToken(r, "seq")
		if lastSeqRaw == "" {
			lastSeqRaw = r.URL.Query().Get("lastSeq")
		}
		lastSeq, _ := strconv.ParseUint(lastSeqRaw, 10, 64)
		var err error
		sub, replay, err = existing.Attach(lastSeq)
		if err != nil {
			existing.Kill("resume failed")
			writeError(w, http.StatusGone, "resume_failed", err.Error())
			return
		}
		sess = existing
		resumed = true
	} else {
		ticket := wsProtocolToken(r, "ticket")
		if ticket == "" {
			ticket = r.URL.Query().Get("ticket")
		}
		spec, ok := s.auth.ConsumeTicket(ticket)
		if !ok {
			writeError(w, http.StatusUnauthorized, "invalid_ticket", "ticket is invalid or expired")
			return
		}
		if spec.UID != id.UID {
			writeError(w, http.StatusForbidden, "forbidden", "ticket belongs to another user")
			return
		}
		ci, _ := gateway.FromContext(r.Context())
		if spec.Listener != ci.Kind {
			writeError(w, http.StatusForbidden, "listener_mismatch", "ticket was issued for another listener")
			return
		}
		if spec.Origin != "" && r.Header.Get("Origin") != "" && spec.Origin != r.Header.Get("Origin") {
			writeError(w, http.StatusForbidden, "origin_mismatch", "ticket origin mismatch")
			return
		}
		var runAs *term.RunAs
		if id.Gateway {
			runAs = &term.RunAs{UID: id.UID, Username: spec.Username}
		}
		var err error
		grace := time.Duration(spec.GraceSeconds) * time.Second
		if spec.GraceSeconds < 0 || spec.GraceSeconds > 3600 {
			grace = s.term.Grace()
		}
		sess, err = s.term.CreateLocal(id.UID, runAs, spec.Cols, spec.Rows, "", grace)
		if err != nil {
			s.writeTermError(w, err)
			return
		}
		sub, replay, err = sess.Attach(0)
		if err != nil {
			sess.Kill("attach failed")
			writeError(w, http.StatusInternalServerError, "attach_failed", err.Error())
			return
		}
		s.store.Audit(id.UID, "session.start", sess.ID)
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // validated by wsOriginAllowed above
		Subprotocols:       []string{"ofterm"},
	})
	if err != nil {
		s.log.Warn("terminal websocket accept failed", "error", err)
		sub.Close()
		sess.Kill("websocket accept failed")
		return
	}
	defer conn.CloseNow()
	conn.SetReadLimit(maxFrameBytes)

	startSeq := uint64(0)
	if resumed {
		startSeq = lastSeqFromQuery(r)
	}
	if err := writeWS(conn, term.EncodeControl(term.OpReady,
		term.ReadyPayload(sess.ID, sess.ResumeToken, sess.Kind, sess.Cols, sess.Rows, startSeq, resumed))); err != nil {
		sub.Close()
		sess.Detach(sub, false)
		return
	}
	for _, f := range replay {
		if err := writeWS(conn, term.EncodeData(f.Seq, f.Data)); err != nil {
			sub.Close()
			sess.Detach(sub, false)
			return
		}
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	writeDone := make(chan struct{})
	go func() {
		defer close(writeDone)
		writeLoop(conn, sub)
	}()

	intentional := false
readLoop:
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			status := websocket.CloseStatus(err)
			intentional = intentional || status == websocket.StatusNormalClosure || status == websocket.StatusGoingAway
			break
		}
		if typ != websocket.MessageBinary || len(data) == 0 {
			continue
		}
		switch data[0] {
		case term.OpData:
			if _, err := sess.Write(data[1:]); err != nil {
				intentional = true
				break readLoop
			}
		case term.OpResize:
			if cols, rows, ok := term.DecodeResize(data[1:]); ok {
				_ = sess.Resize(cols, rows)
			}
		case term.OpPing:
			sub.SendControl(term.OpPong, nil)
		case term.OpAck:
		case term.OpClose:
			intentional = true
			break readLoop
		}
	}
	cancel()
	sub.Close()
	_ = conn.Close(websocket.StatusNormalClosure, "")
	<-writeDone
	sess.Detach(sub, intentional)
}

func writeLoop(conn *websocket.Conn, sub *term.Subscriber) {
	for {
		select {
		case f := <-sub.Frames:
			if err := writeWS(conn, term.EncodeData(f.Seq, f.Data)); err != nil {
				return
			}
		case c := <-sub.Control:
			if err := writeWS(conn, term.EncodeControl(c.Opcode, c.Payload)); err != nil {
				return
			}
		case <-sub.Done:
			// Drain a pending EXIT/ERROR control message before closing.
			for {
				select {
				case c := <-sub.Control:
					_ = writeWS(conn, term.EncodeControl(c.Opcode, c.Payload))
				default:
					_ = conn.Close(websocket.StatusNormalClosure, "")
					return
				}
			}
		}
	}
}

func writeWS(conn *websocket.Conn, data []byte) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return conn.Write(ctx, websocket.MessageBinary, data)
}

func lastSeqFromQuery(r *http.Request) uint64 {
	v, _ := strconv.ParseUint(r.URL.Query().Get("lastSeq"), 10, 64)
	return v
}


func (s *Server) writeTermError(w http.ResponseWriter, err error) {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "too many"):
		writeError(w, http.StatusTooManyRequests, "too_many_sessions", msg)
	case strings.Contains(msg, "shell"):
		writeError(w, http.StatusBadRequest, "invalid_shell", msg)
	default:
		writeError(w, http.StatusInternalServerError, "terminal", msg)
	}
}

const maxFrameBytes = 1 << 20
