package api

import (
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Serves the exported web app (app/dist, copied to server/web at build time)
// from the same origin as the API, so the browser needs no CORS and the app
// can use window.location.origin as its API URL.

var contentTypes = map[string]string{
	".html":        "text/html; charset=utf-8",
	".js":          "text/javascript; charset=utf-8",
	".json":        "application/json; charset=utf-8",
	".css":         "text/css; charset=utf-8",
	".ico":         "image/x-icon",
	".png":         "image/png",
	".jpg":         "image/jpeg",
	".svg":         "image/svg+xml",
	".ttf":         "font/ttf",
	".woff":        "font/woff",
	".woff2":       "font/woff2",
	".webmanifest": "application/manifest+json",
}

// Google Identity Services needs its script, styles, iframe and endpoints.
const gsi = "https://accounts.google.com/gsi/"

var CSP = strings.Join([]string{
	"default-src 'self'",
	"script-src 'self' " + gsi + "client",
	// react-native-web writes component styles into <style> tags at runtime.
	"style-src 'self' 'unsafe-inline' " + gsi + "style",
	"frame-src " + gsi,
	"connect-src 'self' " + gsi,
	"img-src 'self' data: blob: https://*.googleusercontent.com",
	"font-src 'self' data:",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'self'",
	"frame-ancestors 'none'",
}, "; ")

type web struct {
	root  string // "" when there's no web build
	index string
}

func newWeb(dir string, log *slog.Logger) *web {
	if dir == "" {
		return &web{}
	}
	root, err := filepath.Abs(dir)
	index := filepath.Join(root, "index.html")
	if _, statErr := os.Stat(index); err != nil || statErr != nil {
		if log != nil {
			log.Info("no web build; serving the API only", "dir", dir)
		}
		return &web{}
	}
	return &web{root: root, index: index}
}

func notFound(w http.ResponseWriter) { writeJSON(w, 404, errBody("Not found")) }

func (wb *web) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Path
	if wb.root == "" || (r.Method != http.MethodGet && r.Method != http.MethodHead) || p == "/v1" || strings.HasPrefix(p, "/v1/") {
		notFound(w)
		return
	}
	if strings.ContainsRune(p, 0) {
		writeJSON(w, 400, errBody("Bad path"))
		return
	}
	// Cleaning "/"+path can't climb above the root; the prefix check is a second guard.
	clean := path.Clean("/" + p)
	file := filepath.Join(wb.root, filepath.FromSlash(clean))
	if file != wb.root && !strings.HasPrefix(file, wb.root+string(filepath.Separator)) {
		notFound(w)
		return
	}
	if info, err := os.Stat(file); err == nil && info.Mode().IsRegular() {
		wb.send(w, file, clean)
		return
	}
	// A missing file is a 404; anything else is a client-side route.
	if path.Ext(clean) != "" {
		notFound(w)
		return
	}
	wb.send(w, wb.index, "/index.html")
}

func (wb *web) send(w http.ResponseWriter, file, urlPath string) {
	body, err := os.ReadFile(file)
	if err != nil {
		notFound(w)
		return
	}
	h := w.Header()
	typ, ok := contentTypes[strings.ToLower(filepath.Ext(file))]
	if !ok {
		typ = "application/octet-stream"
	}
	h.Set("Content-Type", typ)
	// Hashed build output can be cached forever; everything else is revalidated.
	if strings.HasPrefix(urlPath, "/_expo/static/") || strings.HasPrefix(urlPath, "/assets/") {
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		h.Set("Cache-Control", "no-cache")
	}
	if strings.HasPrefix(typ, "text/html") {
		h.Set("Content-Security-Policy", CSP)
		// The Google sign-in popup has to be able to talk back to this window.
		h.Set("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
		h.Set("X-Frame-Options", "DENY")
	}
	_, _ = w.Write(body)
}
