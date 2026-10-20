// Command server runs the CardVault API (and the web app) on $PORT.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/api"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/auth"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/store"
)

// Until a release keystore exists, CI signs APKs with the standard React Native debug key.
const debugKeySHA256 = "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"

func main() {
	// Cloud Logging reads "severity" and "message".
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
		switch a.Key {
		case slog.LevelKey:
			a.Key = "severity"
		case slog.MessageKey:
			a.Key = "message"
		}
		return a
	}}))
	if err := run(log); err != nil {
		log.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func run(log *slog.Logger) error {
	clientID := os.Getenv("GOOGLE_WEB_CLIENT_ID")
	if clientID == "" {
		return errors.New("set GOOGLE_WEB_CLIENT_ID")
	}
	secret := os.Getenv("SESSION_SECRET")
	if len(secret) < 32 {
		return errors.New("SESSION_SECRET must be at least 32 characters")
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var st store.Store
	var relay store.Relay
	if os.Getenv("STORE") == "memory" {
		log.Warn("STORE=memory: data is lost on restart. Use DATABASE_URL in production.")
		st = store.NewMemory()
	} else {
		url := os.Getenv("DATABASE_URL")
		if url == "" {
			return errors.New("set DATABASE_URL (or STORE=memory)")
		}
		pg, err := store.OpenPg(ctx, url)
		if err != nil {
			return err
		}
		if err := pg.Migrate(ctx); err != nil {
			return err
		}
		st, relay = pg, store.NewPgRelay(pg, time.Now)
	}
	defer st.Close()

	var certs []string
	for _, c := range strings.Split(env("ANDROID_CERT_SHA256", debugKeySHA256), ",") {
		if c = strings.TrimSpace(c); c != "" {
			certs = append(certs, c)
		}
	}
	srv := &http.Server{
		Addr: ":" + env("PORT", "8080"),
		Handler: api.New(api.Deps{
			Store: st, Mailbox: relay, VerifyGoogle: auth.GoogleVerifier(clientID), Secret: secret,
			Logger: log, WebDir: env("WEB_DIR", "web"), AndroidCertSHA256: certs,
		}),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	log.Info("listening", "addr", srv.Addr)
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdown)
	}
}
