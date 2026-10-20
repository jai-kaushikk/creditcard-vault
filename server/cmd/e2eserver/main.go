//go:build e2e

// Command e2eserver runs the real API in memory with a fake Google verifier
// that trusts the unsigned payload of test ID tokens, for browser tests on a
// developer machine. It's behind the e2e build tag so it's never built by
// default, and never shipped.
//
//	go run -tags e2e ./cmd/e2eserver -web ../app/dist -port 8095
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"log"
	"net/http"
	"strings"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/api"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/auth"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/store"
)

func main() {
	webDir := flag.String("web", "", "exported web app")
	port := flag.String("port", "8095", "port on 127.0.0.1")
	flag.Parse()
	h := api.New(api.Deps{
		Store:  store.NewMemory(),
		Secret: "local-test-secret-that-is-at-least-32-chars",
		WebDir: *webDir,
		VerifyGoogle: func(_ context.Context, token string) (auth.GoogleIdentity, error) {
			parts := strings.Split(token, ".")
			if len(parts) != 3 {
				return auth.GoogleIdentity{}, errors.New("bad token")
			}
			raw, err := base64.RawURLEncoding.DecodeString(parts[1])
			if err != nil {
				return auth.GoogleIdentity{}, err
			}
			var p struct{ Sub, Email, Name string }
			if err := json.Unmarshal(raw, &p); err != nil {
				return auth.GoogleIdentity{}, err
			}
			return auth.GoogleIdentity{Sub: p.Sub, Email: p.Email, Name: &p.Name}, nil
		},
	})
	log.Printf("ready on 127.0.0.1:%s", *port)
	log.Fatal(http.ListenAndServe("127.0.0.1:"+*port, h))
}
