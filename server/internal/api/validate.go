package api

import (
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/rules"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/store"
)

// Body checks, mirroring the JSON schemas the TypeScript server enforced.

func firstErr(errs ...error) error {
	for _, e := range errs {
		if e != nil {
			return e
		}
	}
	return nil
}

func str(name string, v *string, min, max int) error {
	if v == nil {
		return badRequest{fmt.Sprintf("body must have required property '%s'", name)}
	}
	if n := utf8.RuneCountInString(*v); n < min || n > max {
		return badRequest{fmt.Sprintf("body/%s must be %d to %d characters", name, min, max)}
	}
	return nil
}

func optStr(name string, v *string, max int) error {
	if v == nil {
		return nil
	}
	return str(name, v, 0, max)
}

func id(name string, v *string) error { return str(name, v, 1, 64) }

func oneOf(name string, v *string, allowed ...string) error {
	if v == nil {
		return badRequest{fmt.Sprintf("body must have required property '%s'", name)}
	}
	if !slices.Contains(allowed, *v) {
		return badRequest{fmt.Sprintf("body/%s must be one of %v", name, allowed)}
	}
	return nil
}

var currencyRe = regexp.MustCompile(`^[A-Z]{3}$`)

func currency(v *string) error {
	if err := str("currency", v, 3, 3); err != nil {
		return err
	}
	if !currencyRe.MatchString(*v) {
		return badRequest{"body/currency must be a 3-letter code like INR"}
	}
	return nil
}

// amount accepts a whole number of minor units (paise) within the cap.
func amount(v *json.Number) (int64, error) {
	if v == nil {
		return 0, badRequest{"body must have required property 'amountMinor'"}
	}
	n, err := v.Int64()
	if err != nil || n < 1 || n > rules.MaxAmountMinor {
		return 0, badRequest{fmt.Sprintf("body/amountMinor must be a whole number from 1 to %d", rules.MaxAmountMinor)}
	}
	return n, nil
}

type sealedBody struct {
	Epk   *string `json:"epk"`
	Nonce *string `json:"nonce"`
	Box   *string `json:"box"`
}

func sealed(v *sealedBody) (store.Sealed, error) {
	if v == nil {
		return store.Sealed{}, badRequest{"body must have required property 'payload'"}
	}
	if err := firstErr(str("payload/epk", v.Epk, 0, 64), str("payload/nonce", v.Nonce, 0, 64), str("payload/box", v.Box, 0, 8192)); err != nil {
		return store.Sealed{}, err
	}
	return store.Sealed{Epk: *v.Epk, Nonce: *v.Nonce, Box: *v.Box}, nil
}

// limiter allows n calls per window per key (per server instance; enough to slow down scraping).
type limiter struct {
	mu     sync.Mutex
	n      int
	window time.Duration
	now    func() time.Time
	hits   map[string][]time.Time
}

func newLimiter(n int, window time.Duration, now func() time.Time) *limiter {
	return &limiter{n: n, window: window, now: now, hits: map[string][]time.Time{}}
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	t := l.now()
	recent := l.hits[key][:0]
	for _, h := range l.hits[key] {
		if t.Sub(h) < l.window {
			recent = append(recent, h)
		}
	}
	if len(recent) >= l.n {
		l.hits[key] = recent
		return false
	}
	l.hits[key] = append(recent, t)
	return true
}
