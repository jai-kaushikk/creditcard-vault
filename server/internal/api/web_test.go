package api

import (
	"context"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/auth"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/store"
)

func TestServesTheWebAppNextToTheAPI(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "web")
	must := func(err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	must(os.MkdirAll(filepath.Join(dir, "_expo/static/js/web"), 0o755))
	must(os.WriteFile(filepath.Join(dir, "index.html"), []byte(`<!doctype html><div id="root"></div>`), 0o644))
	must(os.WriteFile(filepath.Join(dir, "_expo/static/js/web/[id]-abc.js"), []byte("console.log(1)"), 0o644))
	must(os.WriteFile(filepath.Join(base, "cv-secret.txt"), []byte("outside"), 0o644))

	h := New(Deps{
		Store: store.NewMemory(), Secret: secret, WebDir: dir, AndroidCertSHA256: []string{"AA:BB"},
		VerifyGoogle: func(context.Context, string) (auth.GoogleIdentity, error) { panic("unused") },
	})
	get := func(url string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", url, nil))
		return rec
	}

	home := get("/")
	eq(t, "home", home.Code, 200)
	eq(t, "html", strings.HasPrefix(home.Header().Get("Content-Type"), "text/html"), true)
	eq(t, "csp", strings.Contains(home.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'"), true)
	eq(t, "no-cache", home.Header().Get("Cache-Control"), "no-cache")
	eq(t, "nosniff", home.Header().Get("X-Content-Type-Options"), "nosniff")

	// Client-side routes fall back to index.html.
	route := get("/card/abc?x=1")
	eq(t, "route", route.Code, 200)
	eq(t, "same page", route.Body.String(), home.Body.String())

	js := get("/_expo/static/js/web/%5Bid%5D-abc.js")
	eq(t, "js", js.Code, 200)
	eq(t, "js type", strings.Contains(js.Header().Get("Content-Type"), "javascript"), true)
	eq(t, "immutable", strings.Contains(js.Header().Get("Cache-Control"), "immutable"), true)

	eq(t, "missing file", get("/missing.js").Code, 404)
	for _, url := range []string{"/..%2fcv-secret.txt", "/%2e%2e/cv-secret.txt", "/../cv-secret.txt", "/_expo/../../cv-secret.txt"} {
		rec := get(url)
		if rec.Code == 200 || strings.Contains(rec.Body.String(), "outside") {
			t.Fatalf("%s escaped the web folder: %d %s", url, rec.Code, rec.Body.String())
		}
	}

	// The API keeps its JSON 404s and auth.
	api := get("/v1/nope")
	eq(t, "api 404", api.Code, 404)
	eq(t, "api json", strings.Contains(api.Body.String(), `"error":"Not found"`), true)
	eq(t, "auth", get("/v1/transactions").Code, 401)

	// Android App Links: the app's package and signing key, as JSON.
	links := get("/.well-known/assetlinks.json")
	eq(t, "links type", strings.HasPrefix(links.Header().Get("Content-Type"), "application/json"), true)
	eq(t, "links body", strings.Contains(links.Body.String(), `"package_name":"app.cardvault","sha256_cert_fingerprints":["AA:BB"]`), true)
}
