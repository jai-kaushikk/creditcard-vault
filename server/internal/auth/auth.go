// Package auth checks Google ID tokens, issues CardVault sessions, and derives
// the ids and hashes the database keys on. The derivations must never change:
// existing accounts and sessions depend on them.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/golang-jwt/jwt/v5"
)

type GoogleIdentity struct {
	Sub, Email    string
	Name, Picture *string
}

type VerifyGoogle func(ctx context.Context, idToken string) (GoogleIdentity, error)

// GoogleVerifier checks a Google ID token was issued to our web client and the email is verified.
func GoogleVerifier(webClientID string) VerifyGoogle {
	keys := oidc.NewRemoteKeySet(context.Background(), "https://www.googleapis.com/oauth2/v3/certs")
	// Google uses both spellings of its issuer; checked below.
	v := oidc.NewVerifier("https://accounts.google.com", keys, &oidc.Config{ClientID: webClientID, SkipIssuerCheck: true})
	return func(ctx context.Context, raw string) (GoogleIdentity, error) {
		tok, err := v.Verify(ctx, raw)
		if err != nil {
			return GoogleIdentity{}, err
		}
		if tok.Issuer != "https://accounts.google.com" && tok.Issuer != "accounts.google.com" {
			return GoogleIdentity{}, fmt.Errorf("unexpected issuer %q", tok.Issuer)
		}
		var c struct {
			Email         string `json:"email"`
			EmailVerified any    `json:"email_verified"`
			Name          string `json:"name"`
			Picture       string `json:"picture"`
		}
		if err := tok.Claims(&c); err != nil {
			return GoogleIdentity{}, err
		}
		if c.Email == "" || (c.EmailVerified != true && c.EmailVerified != "true") {
			return GoogleIdentity{}, errors.New("Google account email is not verified")
		}
		id := GoogleIdentity{Sub: tok.Subject, Email: c.Email}
		if c.Name != "" {
			id.Name = &c.Name
		}
		if c.Picture != "" {
			id.Picture = &c.Picture
		}
		return id, nil
	}
}

func mac(secret, msg string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(msg))
	return hex.EncodeToString(h.Sum(nil))
}

func AccountID(googleSub, secret string) string { return "usr_" + mac(secret, "sub:"+googleSub)[:16] }

func EmailHash(email, secret string) string {
	return mac(secret, "email:"+strings.ToLower(strings.TrimSpace(email)))
}

const (
	issuer      = "cardvault"
	sessionDays = 30
)

func key(secret string) []byte {
	k := sha256.Sum256([]byte("jwt:" + secret))
	return k[:]
}

func IssueSession(userID, secret string, now time.Time) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   userID,
		Issuer:    issuer,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(sessionDays * 24 * time.Hour)),
	}).SignedString(key(secret))
}

// ReadSession returns the account id in a session token that's valid at now.
func ReadSession(token, secret string, now time.Time) (string, error) {
	claims := jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(token, &claims, func(*jwt.Token) (any, error) { return key(secret), nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(issuer), jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(func() time.Time { return now }))
	if err != nil {
		return "", err
	}
	if claims.Subject == "" {
		return "", errors.New("no subject")
	}
	return claims.Subject, nil
}
