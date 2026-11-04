package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/ofterm/ofterm/internal/model"
)

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	id, _ := s.identity(r)
	settings, err := s.store.GetSettings(id.UID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	id, _ := s.identity(r)
	current, err := s.store.GetSettings(id.UID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings", err.Error())
		return
	}
	var in model.Settings
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.ThemeID == "" {
		in.ThemeID = current.ThemeID
	}
	if in.FontFamily == "" {
		in.FontFamily = current.FontFamily
	}
	if in.FontSize < 8 || in.FontSize > 48 {
		in.FontSize = current.FontSize
	}
	if in.FontWeight < 100 || in.FontWeight > 900 {
		in.FontWeight = current.FontWeight
	}
	if in.FontWeightBold < 100 || in.FontWeightBold > 900 {
		in.FontWeightBold = current.FontWeightBold
	}
	if in.LineHeight < 0.8 || in.LineHeight > 3 {
		in.LineHeight = current.LineHeight
	}
	if in.Scrollback < 100 || in.Scrollback > 1_000_000 {
		in.Scrollback = current.Scrollback
	}
	if in.LetterSpacing < -10 || in.LetterSpacing > 20 {
		in.LetterSpacing = current.LetterSpacing
	}
	if in.TabStyle != "iterm2" && in.TabStyle != "fnos" {
		in.TabStyle = current.TabStyle
	}
	if in.Language != "auto" && in.Language != "zh-CN" && in.Language != "en-US" {
		in.Language = current.Language
	}
	if len(in.FontFamily) > 256 {
		in.FontFamily = current.FontFamily
	}
	if len(in.CustomThemes) > 64 {
		in.CustomThemes = current.CustomThemes
	}
	if in.GraceSeconds < 0 || in.GraceSeconds > 3600 {
		in.GraceSeconds = current.GraceSeconds
	}
	if in.CursorStyle != "block" && in.CursorStyle != "bar" && in.CursorStyle != "underline" {
		in.CursorStyle = current.CursorStyle
	}
	if in.UITheme != "system" && in.UITheme != "light" && in.UITheme != "dark" {
		in.UITheme = current.UITheme
	}
	if err := s.store.SaveSettings(id.UID, in); err != nil {
		writeError(w, http.StatusInternalServerError, "settings", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, in)
}

func (s *Server) handleListCommands(w http.ResponseWriter, r *http.Request) {
	id, _ := s.identity(r)
	cmds, err := s.store.ListCommands(id.UID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "commands", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"commands": cmds})
}

type commandInput struct {
	Name        string `json:"name"`
	Code        string `json:"code"`
	Shortcut    string `json:"shortcut"`
	AutoExecute bool   `json:"autoExecute"`
}

func (s *Server) handleCreateCommand(w http.ResponseWriter, r *http.Request) {
	id, _ := s.identity(r)
	var in commandInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.Code) == "" {
		writeError(w, http.StatusBadRequest, "invalid_command", "name and code are required")
		return
	}
	now := time.Now().Unix()
	c := model.Command{ID: newID("cmd"), Name: in.Name, Code: in.Code, Shortcut: in.Shortcut, AutoExecute: in.AutoExecute, CreatedAt: now, UpdatedAt: now}
	if err := s.store.SaveCommand(id.UID, c); err != nil {
		writeError(w, http.StatusInternalServerError, "commands", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) handleUpdateCommand(w http.ResponseWriter, r *http.Request) {
	id, _ := s.identity(r)
	var in commandInput
	if !decodeJSON(w, r, &in) {
		return
	}
	cmd := model.Command{ID: r.PathValue("id"), Name: in.Name, Code: in.Code, Shortcut: in.Shortcut, AutoExecute: in.AutoExecute, UpdatedAt: time.Now().Unix()}
	if err := s.store.SaveCommand(id.UID, cmd); err != nil {
		writeError(w, http.StatusInternalServerError, "commands", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cmd)
}

func (s *Server) handleDeleteCommand(w http.ResponseWriter, r *http.Request) {
	id, _ := s.identity(r)
	if err := s.store.DeleteCommand(id.UID, r.PathValue("id")); err != nil {
		writeError(w, http.StatusInternalServerError, "commands", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func newID(prefix string) string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return prefix + "-" + time.Now().Format("20060102150405")
	}
	return prefix + "-" + hex.EncodeToString(b)
}
