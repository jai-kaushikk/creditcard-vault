// Package api is CardVault's HTTP API. It stores transactions, friendships and
// accounts, and relays sealed card shares and OTPs it can't read. It also
// serves the exported web app from the same origin.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/auth"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/rules"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/store"
)

type Deps struct {
	Store        store.Store
	Mailbox      store.Relay // defaults to an in-memory relay
	VerifyGoogle auth.VerifyGoogle
	// Secret signs sessions and keys the email/subject hashes. Keep it secret and stable.
	Secret string
	Now    func() time.Time
	Logger *slog.Logger // nil: no request logs
	// WebDir holds the exported web app. Served when it has an index.html.
	WebDir string
	// AndroidCertSHA256 lets invite links open the Android app directly (App Links).
	AndroidCertSHA256 []string
}

const (
	androidPackage     = "app.cardvault"
	bodyLimit          = 32 << 10
	inviteDays         = 14
	maxPendingRequests = 50
)

type server struct {
	Deps
	search *limiter
}

type ctxKey struct{}

func userID(r *http.Request) string { return r.Context().Value(ctxKey{}).(string) }

// handler returns a status and a JSON body, or an error.
type handler func(r *http.Request) (int, any, error)

// badRequest is a body that failed validation.
type badRequest struct{ msg string }

func (b badRequest) Error() string { return b.msg }

func New(d Deps) http.Handler {
	if d.Now == nil {
		d.Now = time.Now
	}
	if d.Mailbox == nil {
		d.Mailbox = store.NewMailbox(d.Now)
	}
	s := &server{Deps: d, search: newLimiter(30, time.Minute, d.Now)}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", s.json(func(*http.Request) (int, any, error) { return 200, map[string]bool{"ok": true}, nil }))
	mux.HandleFunc("GET /.well-known/assetlinks.json", s.assetLinks)
	mux.HandleFunc("GET /v1/invites/{code}", s.json(s.peekInvite))
	mux.HandleFunc("POST /v1/auth/google", s.json(s.signIn))

	authed := func(pattern string, h handler) { mux.HandleFunc(pattern, s.json(s.auth(h))) }
	authed("GET /v1/me", s.me)
	authed("GET /v1/friends", s.friends)
	authed("POST /v1/friends/requests", s.requestFriend)
	authed("POST /v1/friends/{id}/accept", s.acceptFriend)
	authed("DELETE /v1/friends/{id}", s.removeFriend)
	authed("POST /v1/users/search", s.searchUsers)
	authed("GET /v1/users/{id}", s.user)
	authed("POST /v1/invites", s.createInvite)
	authed("POST /v1/invites/{code}/accept", s.acceptInvite)
	authed("GET /v1/transactions", s.listTxns)
	authed("POST /v1/transactions", s.requestOTP)
	authed("POST /v1/transactions/{id}/otp", s.shareOTP)
	authed("POST /v1/transactions/{id}/decline", s.decline)
	authed("POST /v1/transactions/{id}/result", s.borrowerResult)
	authed("POST /v1/transactions/{id}/evidence", s.lenderEvidence)
	authed("POST /v1/transactions/{id}/dispute", s.dispute)
	authed("POST /v1/repayments", s.repay)
	authed("POST /v1/repayments/{id}/confirm", s.confirmRepayment)
	authed("POST /v1/mailbox", s.send)
	authed("GET /v1/mailbox", s.inbox)

	// Everything else: the web app, or a JSON 404.
	mux.Handle("/", newWeb(d.WebDir, d.Logger))

	return s.middleware(mux)
}

// middleware adds security headers, a body limit, panic recovery and request logs.
func (s *server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := s.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Strict-Transport-Security", "max-age=31536000")
		r.Body = http.MaxBytesReader(w, r.Body, bodyLimit)
		defer func() {
			if p := recover(); p != nil {
				if s.Logger != nil {
					s.Logger.Error("panic", "err", p, "path", r.URL.Path)
				}
				writeJSON(rec, 500, errBody("Something went wrong on our side."))
			}
			// The path only: query strings never reach the logs.
			if s.Logger != nil {
				s.Logger.Info("request", "method", r.Method, "path", r.URL.Path, "status", rec.status, "ms", s.Now().Sub(start).Milliseconds())
			}
		}()
		next.ServeHTTP(rec, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func errBody(msg string) map[string]string { return map[string]string{"error": msg} }

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// json turns a handler's result or error into a response.
func (s *server) json(h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status, body, err := h(r)
		if err == nil {
			writeJSON(w, status, body)
			return
		}
		var rule *rules.Error
		var bad badRequest
		var tooBig *http.MaxBytesError
		switch {
		case errors.As(err, &rule):
			writeJSON(w, rule.Status, errBody(rule.Message))
		case errors.As(err, &bad):
			writeJSON(w, 400, errBody(bad.msg))
		case errors.As(err, &tooBig):
			writeJSON(w, 413, errBody("Request body is too large."))
		default:
			if s.Logger != nil {
				s.Logger.Error("request failed", "path", r.URL.Path, "err", err)
			}
			writeJSON(w, 500, errBody("Something went wrong on our side."))
		}
	}
}

func (s *server) auth(h handler) handler {
	return func(r *http.Request) (int, any, error) {
		token, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		id, err := auth.ReadSession(token, s.Secret, s.Now())
		if err != nil {
			return 0, nil, rules.Fail(401, "Sign in again.")
		}
		a, err := s.Store.AccountByID(r.Context(), id)
		if err != nil {
			return 0, nil, err
		}
		if a == nil {
			return 0, nil, rules.Fail(401, "Sign in again.")
		}
		if a.Status != "active" {
			return 0, nil, rules.Fail(403, "This account is suspended.")
		}
		return h(r.WithContext(context.WithValue(r.Context(), ctxKey{}, id)))
	}
}

var errNoBody = badRequest{"body is required"}

// decode reads a JSON body into v. A missing body returns errNoBody.
func decode(r *http.Request, v any) error {
	err := json.NewDecoder(r.Body).Decode(v)
	var tooBig *http.MaxBytesError
	switch {
	case err == nil:
		return nil
	case errors.As(err, &tooBig):
		return err
	case errors.Is(err, io.EOF):
		return errNoBody
	default:
		return badRequest{"body must be valid JSON of the right shape"}
	}
}

func (s *server) assetLinks(w http.ResponseWriter, _ *http.Request) {
	certs := s.AndroidCertSHA256
	if certs == nil {
		certs = []string{}
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	writeJSON(w, 200, []any{map[string]any{
		"relation": []string{"delegate_permission/common.handle_all_urls"},
		"target":   map[string]any{"namespace": "android_app", "package_name": androidPackage, "sha256_cert_fingerprints": certs},
	}})
}

func (s *server) signIn(r *http.Request) (int, any, error) {
	var b struct {
		IDToken   *string `json:"idToken"`
		PublicKey *string `json:"publicKey"`
	}
	if err := decode(r, &b); err != nil {
		return 0, nil, err
	}
	if err := firstErr(str("idToken", b.IDToken, 1, 4096), str("publicKey", b.PublicKey, 40, 64)); err != nil {
		return 0, nil, err
	}
	who, err := s.VerifyGoogle(r.Context(), *b.IDToken)
	if err != nil {
		return 0, nil, rules.Fail(401, "Google sign-in could not be verified.")
	}
	id := auth.AccountID(who.Sub, s.Secret)
	email := strings.ToLower(strings.TrimSpace(who.Email))
	var name *string
	if who.Name != nil && strings.TrimSpace(*who.Name) != "" {
		n := strings.TrimSpace(*who.Name)
		name = &n
	}
	if _, err := s.Store.UpsertAccount(r.Context(), store.NewAccount{
		ID: id, EmailHash: auth.EmailHash(who.Email, s.Secret), Email: &email, Name: name, Photo: who.Picture, PublicKey: *b.PublicKey,
	}); err != nil {
		return 0, nil, err
	}
	token, err := auth.IssueSession(id, s.Secret, s.Now())
	if err != nil {
		return 0, nil, err
	}
	return 200, map[string]string{"token": token, "userId": id}, nil
}
