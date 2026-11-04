package web

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// The production build copies the Vite output into dist/. The committed
// directory only contains .keep so the Go build always succeeds.
//
//go:embed all:dist
var embedded embed.FS

func Handler() http.Handler {
	sub, err := fs.Sub(embedded, "dist")
	if err != nil {
		return http.HandlerFunc(placeholder)
	}
	files := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(sub, p); err != nil {
			// Missing hashed assets must 404, not return index.html.
			if strings.Contains(path.Base(p), ".") {
				http.NotFound(w, r)
				return
			}
			// SPA fallback for client-side paths.
			index, err := fs.ReadFile(sub, "index.html")
			if err != nil {
				placeholder(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			_, _ = w.Write(index)
			return
		}
		if strings.HasPrefix(p, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}

func placeholder(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte(`<!doctype html><html><head><meta charset="utf-8"><title>OFTerm</title></head>
<body style="font-family:sans-serif;padding:40px"><h1>OFTerm</h1>
<p>The web UI has not been built yet. Run <code>npm ci &amp;&amp; npm run build</code> in <code>src/frontend</code>.</p></body></html>`))
}
