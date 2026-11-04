package model

import "encoding/json"

// Identity is the trusted caller identity for a request.
type Identity struct {
	UID      string `json:"uid"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"isAdmin"`
	Gateway  bool   `json:"gateway"`
}

// Settings is the per-user application configuration. Terminal font and
// colour settings live here; the frontend may extend this with defaults.
type Settings struct {
	UITheme        string        `json:"uiTheme"` // system | light | dark
	Language       string        `json:"language"` // auto | zh-CN | en-US
	ThemeID        string        `json:"themeId"`
	FontFamily     string        `json:"fontFamily"`
	FontSize       int           `json:"fontSize"`
	FontWeight     int           `json:"fontWeight"`
	FontWeightBold int           `json:"fontWeightBold"`
	LineHeight     float64       `json:"lineHeight"`
	LetterSpacing  int           `json:"letterSpacing"`
	CursorStyle    string        `json:"cursorStyle"`
	CursorBlink    bool          `json:"cursorBlink"`
	Scrollback     int           `json:"scrollback"`
	GraceSeconds   int           `json:"graceSeconds"`
	TabStyle       string        `json:"tabStyle"`
	CustomThemes   []CustomTheme `json:"customThemes,omitempty"`
}

// CustomTheme is an imported .itermcolors palette. Colors is opaque to the
// backend and is persisted as provided by the frontend.
type CustomTheme struct {
	ID     string          `json:"id"`
	Name   string          `json:"name"`
	Colors json.RawMessage `json:"colors"`
}

func DefaultSettings() Settings {
	return Settings{
		UITheme:        "system",
		Language:       "auto",
		ThemeID:        "material-design-colors",
		FontFamily:     `Monaco, Menlo, "SF Mono", "DejaVu Sans Mono", "JetBrains Mono", monospace`,
		FontSize:       12,
		FontWeight:     400,
		FontWeightBold: 700,
		LineHeight:     1,
		LetterSpacing:  0,
		CursorStyle:    "block",
		CursorBlink:    false,
		Scrollback:     1000,
		GraceSeconds:   15,
		TabStyle:       "iterm2",
	}
}

// Command is a saved snippet.
type Command struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Code        string `json:"code"`
	Shortcut    string `json:"shortcut,omitempty"`
	AutoExecute bool   `json:"autoExecute"`
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
}

// TicketAuthorizedSession is the pending session specification bound to a
// one-time WebSocket ticket.
type TicketAuthorizedSession struct {
	Cols     int    `json:"cols"`
	Rows     int    `json:"rows"`
	UID      string `json:"uid"`
	Username string `json:"username"`
	IsAdmin      bool   `json:"isAdmin"`
	GraceSeconds int    `json:"graceSeconds"`
	Listener     string `json:"listener"`
	Origin   string `json:"origin"`
}
