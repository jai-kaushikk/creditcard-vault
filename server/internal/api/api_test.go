package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/auth"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/rules"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/store"
)

const secret = "test-secret-that-is-at-least-32-characters-long"

var (
	sealedMsg = map[string]string{"epk": strings.Repeat("e", 44), "nonce": strings.Repeat("n", 32), "box": "ciphertext"}
	key       = strings.Repeat("k", 44)
)

type harness struct {
	t     *testing.T
	h     http.Handler
	clock time.Time
	store store.Store
}

// setup runs against Postgres when TEST_DATABASE_URL is set (CI does), else in memory.
func setup(t *testing.T) *harness {
	t.Helper()
	hs := &harness{t: t, clock: time.Date(2026, 10, 19, 10, 0, 0, 0, time.UTC)}
	now := func() time.Time { return hs.clock }
	var relay store.Relay
	if url := os.Getenv("TEST_DATABASE_URL"); url != "" {
		pg, err := store.OpenPg(context.Background(), url)
		if err != nil {
			t.Fatal(err)
		}
		if err := pg.Migrate(context.Background()); err != nil {
			t.Fatal(err)
		}
		if _, err := pg.Pool.Exec(context.Background(), `truncate relay_messages, transaction_events, transactions, invites, friendships, accounts`); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(pg.Close)
		hs.store, relay = pg, store.NewPgRelay(pg, now)
	} else {
		hs.store = store.NewMemory()
	}
	hs.h = New(Deps{
		Store: hs.store, Mailbox: relay, Secret: secret, Now: now,
		// The fake verifier treats the token as "sub|email".
		VerifyGoogle: func(_ context.Context, token string) (auth.GoogleIdentity, error) {
			sub, email, ok := strings.Cut(token, "|")
			if !ok {
				return auth.GoogleIdentity{}, errors.New("bad token")
			}
			name := strings.ToUpper(sub[:1]) + sub[1:] + " Test"
			return auth.GoogleIdentity{Sub: sub, Email: email, Name: &name}, nil
		},
	})
	return hs
}

func (hs *harness) tick(d time.Duration) { hs.clock = hs.clock.Add(d) }

type resp struct {
	status int
	raw    []byte
}

// obj decodes the body as a JSON object; list as an array.
func (r resp) obj() map[string]any {
	var m map[string]any
	_ = json.Unmarshal(r.raw, &m)
	return m
}

func (hs *harness) do(method, url, token string, body any) resp {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, url, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	hs.h.ServeHTTP(rec, req)
	return resp{rec.Code, rec.Body.Bytes()}
}

type person struct {
	hs               *harness
	id, email, token string
}

func (hs *harness) signIn(sub, email string) *person {
	hs.t.Helper()
	r := hs.do("POST", "/v1/auth/google", "", map[string]string{"idToken": sub + "|" + email, "publicKey": key})
	if r.status != 200 {
		hs.t.Fatalf("sign in: %d %s", r.status, r.raw)
	}
	o := r.obj()
	return &person{hs: hs, id: o["userId"].(string), email: email, token: o["token"].(string)}
}

func (p *person) call(method, url string, body any) resp { return p.hs.do(method, url, p.token, body) }

// befriend: x asks, y accepts.
func (hs *harness) befriend(x, y *person) {
	hs.t.Helper()
	if r := x.call("POST", "/v1/friends/requests", map[string]string{"email": y.email}); r.status != 201 {
		hs.t.Fatalf("request: %d %s", r.status, r.raw)
	}
	if r := y.call("POST", "/v1/friends/"+x.id+"/accept", map[string]string{}); r.status != 200 {
		hs.t.Fatalf("accept: %d %s", r.status, r.raw)
	}
}

func eq[T comparable](t *testing.T, what string, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s: got %v, want %v", what, got, want)
	}
}

func ask(b *person, lenderID, key string, amount int64) resp {
	return b.call("POST", "/v1/transactions", map[string]any{
		"lenderId": lenderID, "amountMinor": amount, "currency": "INR", "merchant": "Shop", "cardRef": "c", "idempotencyKey": key,
	})
}

func messages(r resp) []map[string]any {
	var out []map[string]any
	for _, m := range r.obj()["messages"].([]any) {
		out = append(out, m.(map[string]any))
	}
	return out
}

func friendStates(r resp) []string {
	var out []string
	for _, f := range r.obj()["friends"].([]any) {
		out = append(out, f.(map[string]any)["state"].(string))
	}
	return out
}

func TestRequiresAValidSession(t *testing.T) {
	hs := setup(t)
	eq(t, "no token", hs.do("GET", "/v1/transactions", "", nil).status, 401)
	eq(t, "bad token", hs.do("GET", "/v1/transactions", "nope", nil).status, 401)
	eq(t, "bad google token", hs.do("POST", "/v1/auth/google", "", map[string]string{"idToken": "garbage", "publicKey": key}).status, 401)
	eq(t, "short key", hs.do("POST", "/v1/auth/google", "", map[string]string{"idToken": "a|a@x.com", "publicKey": "short"}).status, 400)
	eq(t, "no body", hs.do("POST", "/v1/auth/google", "", nil).status, 400)
}

func TestFullFlow(t *testing.T) {
	hs := setup(t)
	aarav := hs.signIn("g-aarav", "Aarav@Example.com")
	rahul := hs.signIn("g-rahul", "rahul@example.com")
	hs.befriend(rahul, aarav)

	// Card share goes through the mailbox once and is gone after delivery.
	eq(t, "share", aarav.call("POST", "/v1/mailbox", map[string]any{"to": rahul.id, "kind": "card_share", "payload": sealedMsg}).status, 201)
	inbox := messages(rahul.call("GET", "/v1/mailbox", nil))
	eq(t, "inbox", len(inbox), 1)
	eq(t, "from", inbox[0]["from"].(string), aarav.id)
	eq(t, "drained", len(messages(rahul.call("GET", "/v1/mailbox", nil))), 0)

	// Rahul asks Aarav for an OTP; retrying with the same key returns the same row.
	body := map[string]any{"lenderId": aarav.id, "amountMinor": 240000, "currency": "INR", "merchant": " Amazon ", "cardRef": "crd_1", "idempotencyKey": "idem-1"}
	req := rahul.call("POST", "/v1/transactions", body)
	eq(t, "request", req.status, 201)
	txn := req.obj()
	id := txn["id"].(string)
	eq(t, "status", txn["status"].(string), "pending")
	eq(t, "merchant trimmed", txn["merchant"].(string), "Amazon")
	eq(t, "nulls stay null", txn["otpSharedAt"], any(nil))
	eq(t, "same row", rahul.call("POST", "/v1/transactions", body).obj()["id"].(string), id)

	// Only the owner can share the OTP; it reaches the borrower sealed.
	eq(t, "borrower can't share", rahul.call("POST", "/v1/transactions/"+id+"/otp", map[string]any{"payload": sealedMsg}).status, 403)
	eq(t, "owner shares", aarav.call("POST", "/v1/transactions/"+id+"/otp", map[string]any{"payload": sealedMsg}).status, 200)
	otp := messages(rahul.call("GET", "/v1/mailbox", nil))
	eq(t, "otp kind", otp[0]["kind"].(string), "otp")
	eq(t, "otp txn", otp[0]["txnId"].(string), id)

	// Success from the borrower alone keeps it pending; the owner's confirmation records it.
	eq(t, "still pending", rahul.call("POST", "/v1/transactions/"+id+"/result", map[string]string{"outcome": "success"}).obj()["status"].(string), "pending")
	eq(t, "confirmed", aarav.call("POST", "/v1/transactions/"+id+"/evidence", map[string]string{"evidence": "manual"}).obj()["status"].(string), "confirmed")

	// Both see the same row.
	first := func(p *person) string {
		return p.call("GET", "/v1/transactions", nil).obj()["transactions"].([]any)[0].(map[string]any)["id"].(string)
	}
	eq(t, "aarav sees it", first(aarav), id)
	eq(t, "rahul sees it", first(rahul), id)

	// Rahul records paying back; he can't confirm his own record, Aarav can.
	rep := rahul.call("POST", "/v1/repayments", map[string]any{
		"counterpartyId": aarav.id, "role": "payer", "amountMinor": 240000, "currency": "INR", "method": "UPI", "idempotencyKey": "idem-2",
	}).obj()
	eq(t, "lender", rep["lenderId"].(string), aarav.id)
	eq(t, "borrower", rep["borrowerId"].(string), rahul.id)
	eq(t, "own confirm", rahul.call("POST", "/v1/repayments/"+rep["id"].(string)+"/confirm", map[string]string{}).status, 403)
	eq(t, "other confirms", aarav.call("POST", "/v1/repayments/"+rep["id"].(string)+"/confirm", map[string]string{}).obj()["status"].(string), "confirmed")

	// The audit trail recorded each step; the database never saw the sealed payloads.
	want := "requested,otp_shared,result_success,evidence_manual,confirmed"
	switch st := hs.store.(type) {
	case *store.Memory:
		var types []string
		for _, e := range st.Events {
			if e.TxnID == id {
				types = append(types, e.Type)
			}
		}
		eq(t, "events", strings.Join(types, ","), want)
		dump, _ := json.Marshal(st.AllTxns())
		eq(t, "no ciphertext", strings.Contains(string(dump), "ciphertext"), false)
	case *store.Pg:
		var types string
		_ = st.Pool.QueryRow(context.Background(), `select string_agg(type, ',' order by id) from transaction_events where transaction_id = $1`, id).Scan(&types)
		eq(t, "events", types, want)
		var dump string
		_ = st.Pool.QueryRow(context.Background(), `select coalesce(json_agg(t)::text, '') from transactions t`).Scan(&dump)
		eq(t, "no ciphertext", strings.Contains(dump, "ciphertext"), false)
	}
}

func TestDisputeAndExpiry(t *testing.T) {
	hs := setup(t)
	a, b := hs.signIn("a", "a@x.com"), hs.signIn("b", "b@x.com")
	hs.befriend(a, b)

	t1 := ask(b, a.id, "k1", 1000).obj()["id"].(string)
	a.call("POST", "/v1/transactions/"+t1+"/otp", map[string]any{"payload": sealedMsg})
	a.call("POST", "/v1/transactions/"+t1+"/evidence", map[string]string{"evidence": "sms_match"})
	eq(t, "disputed", b.call("POST", "/v1/transactions/"+t1+"/result", map[string]string{"outcome": "failed"}).obj()["status"].(string), "disputed")

	t2 := ask(b, a.id, "k2", 1000).obj()["id"].(string)
	hs.tick(rules.OTPTTL + time.Millisecond)
	for _, row := range b.call("GET", "/v1/transactions", nil).obj()["transactions"].([]any) {
		if row.(map[string]any)["id"] == t2 {
			eq(t, "expired", row.(map[string]any)["status"].(string), "expired")
		}
	}
	eq(t, "too late", a.call("POST", "/v1/transactions/"+t2+"/otp", map[string]any{"payload": sealedMsg}).status, 409)

	// An outsider can't see or touch either transaction.
	c := hs.signIn("c", "c@x.com")
	eq(t, "outsider", c.call("POST", "/v1/transactions/"+t1+"/dispute", map[string]string{}).status, 404)
	// The reason is optional and so is the body.
	eq(t, "dispute without body", a.call("POST", "/v1/transactions/"+t1+"/dispute", nil).status, 200)
}

func TestBorrowerSuccessStandsAfterADay(t *testing.T) {
	hs := setup(t)
	a, b := hs.signIn("a", "a@x.com"), hs.signIn("b", "b@x.com")
	hs.befriend(a, b)
	id := ask(b, a.id, "k", 5000).obj()["id"].(string)
	a.call("POST", "/v1/transactions/"+id+"/otp", map[string]any{"payload": sealedMsg})
	b.call("POST", "/v1/transactions/"+id+"/result", map[string]string{"outcome": "success"})
	hs.tick(rules.AutoConfirm + time.Millisecond)
	row := a.call("GET", "/v1/transactions", nil).obj()["transactions"].([]any)[0].(map[string]any)
	eq(t, "confirmed", row["status"].(string), "confirmed")
}

func TestLimits(t *testing.T) {
	hs := setup(t)
	a, b := hs.signIn("a", "a@x.com"), hs.signIn("b", "b@x.com")
	hs.befriend(a, b)
	for i := range rules.MaxRequestsPerLenderPerHour {
		eq(t, fmt.Sprintf("request %d", i), ask(b, a.id, fmt.Sprintf("v%d", i), 1000).status, 201)
	}
	eq(t, "velocity", ask(b, a.id, "v6", 1000).status, 429)
	eq(t, "amount cap", ask(b, a.id, "big", rules.MaxAmountMinor+1).status, 400)
	eq(t, "self", ask(b, b.id, "self", 1000).status, 400)
	eq(t, "fractional amount", b.call("POST", "/v1/transactions", map[string]any{
		"lenderId": a.id, "amountMinor": 10.5, "currency": "INR", "merchant": "Shop", "cardRef": "c", "idempotencyKey": "frac",
	}).status, 400)
	eq(t, "bad currency", b.call("POST", "/v1/transactions", map[string]any{
		"lenderId": a.id, "amountMinor": 100, "currency": "inr", "merchant": "Shop", "cardRef": "c", "idempotencyKey": "cur",
	}).status, 400)
	eq(t, "body limit", b.call("POST", "/v1/mailbox", map[string]any{"to": a.id, "kind": "card_share", "payload": map[string]string{
		"epk": "e", "nonce": "n", "box": strings.Repeat("x", 40<<10),
	}}).status, 413)
}

func TestRelayedMessagesExpire(t *testing.T) {
	hs := setup(t)
	a, b := hs.signIn("a", "a@x.com"), hs.signIn("b", "b@x.com")
	hs.befriend(a, b)
	a.call("POST", "/v1/mailbox", map[string]any{"to": b.id, "kind": "card_share", "payload": sealedMsg})
	id := ask(b, a.id, "k", 1000).obj()["id"].(string)
	a.call("POST", "/v1/transactions/"+id+"/otp", map[string]any{"payload": sealedMsg})
	hs.tick(6 * time.Minute) // the OTP's 5 minutes are up; the card share's 24 hours aren't
	msgs := messages(b.call("GET", "/v1/mailbox", nil))
	eq(t, "count", len(msgs), 1)
	eq(t, "kind", msgs[0]["kind"].(string), "card_share")
	eq(t, "drained", len(messages(b.call("GET", "/v1/mailbox", nil))), 0)
}

func TestFriendRequestsGoBothWaysAndGateSharing(t *testing.T) {
	hs := setup(t)
	a, b, c := hs.signIn("asha", "Asha@X.com"), hs.signIn("bilal", "bilal@x.com"), hs.signIn("chen", "chen@x.com")

	// Strangers can't share cards or ask for OTPs.
	eq(t, "share to stranger", a.call("POST", "/v1/mailbox", map[string]any{"to": b.id, "kind": "card_share", "payload": sealedMsg}).status, 403)
	n := 0
	askA := func() int { n++; return ask(b, a.id, fmt.Sprintf("k%d", n), 1000).status }
	eq(t, "ask stranger", askA(), 403)

	// Unknown emails get a 404 that suggests an invite; your own email is refused.
	eq(t, "unknown", a.call("POST", "/v1/friends/requests", map[string]string{"email": "nobody@x.com"}).status, 404)
	eq(t, "self", a.call("POST", "/v1/friends/requests", map[string]string{"email": "asha@x.com"}).status, 400)

	// Asha asks Bilal (case-insensitive). Each side sees it from their end, with names and emails.
	sent := a.call("POST", "/v1/friends/requests", map[string]string{"email": "BILAL@x.com"})
	eq(t, "sent", sent.status, 201)
	eq(t, "name", sent.obj()["friend"].(map[string]any)["name"].(string), "Bilal Test")
	eq(t, "asha's view", strings.Join(friendStates(a.call("GET", "/v1/friends", nil)), ","), "outgoing")
	incoming := b.call("GET", "/v1/friends", nil).obj()["friends"].([]any)[0].(map[string]any)
	eq(t, "bilal's view", incoming["state"].(string), "incoming")
	eq(t, "email", incoming["email"].(string), "asha@x.com")

	// Still not friends until Bilal accepts; Asha can't accept her own request.
	eq(t, "pending", askA(), 403)
	eq(t, "own accept", a.call("POST", "/v1/friends/"+b.id+"/accept", map[string]string{}).status, 404)
	eq(t, "accept", b.call("POST", "/v1/friends/"+a.id+"/accept", map[string]string{}).status, 200)
	eq(t, "friends", strings.Join(friendStates(a.call("GET", "/v1/friends", nil)), ","), "friend")
	eq(t, "ask friend", askA(), 201)

	// Asking someone who already asked you accepts it; asking by id (from search) works too.
	c.call("POST", "/v1/friends/requests", map[string]string{"id": a.id})
	eq(t, "mutual", a.call("POST", "/v1/friends/requests", map[string]string{"email": "chen@x.com"}).obj()["state"].(string), "friend")

	// Unfriending closes the door again, but a stop-sharing message still gets through.
	eq(t, "unfriend", b.call("DELETE", "/v1/friends/"+a.id, nil).status, 200)
	eq(t, "after unfriend", askA(), 403)
	eq(t, "unshare", a.call("POST", "/v1/mailbox", map[string]any{"to": b.id, "kind": "card_unshare", "payload": sealedMsg}).status, 201)
	// Profiles are only visible to people you're connected with.
	eq(t, "stranger profile", b.call("GET", "/v1/users/"+c.id, nil).status, 404)
	eq(t, "friend profile", a.call("GET", "/v1/users/"+c.id, nil).obj()["email"].(string), "chen@x.com")
}

func TestSearchSuggestsPeopleOnCardVault(t *testing.T) {
	hs := setup(t)
	a := hs.signIn("asha", "asha.rao@gmail.com")
	b := hs.signIn("bilal", "bilal.khan@gmail.com")
	hs.signIn("bina", "bina@yahoo.com")
	search := func(q string) []map[string]any {
		r := a.call("POST", "/v1/users/search", map[string]string{"q": q})
		eq(t, "search "+q, r.status, 200)
		var out []map[string]any
		for _, u := range r.obj()["users"].([]any) {
			out = append(out, u.(map[string]any))
		}
		return out
	}

	// By the start of a name or an email; never yourself; one letter is too short to search.
	eq(t, "bi", len(search("bi")), 2)
	eq(t, "any word of the name", len(search("Test")), 2)
	eq(t, "bilal.k", len(search("bilal.k")), 1)
	eq(t, "self", len(search("asha")), 0)
	eq(t, "one letter", len(search("b")), 0)
	eq(t, "no wildcards", len(search("%%")), 0)

	// Strangers' emails are masked; the request goes by id.
	hit := search("bilal")[0]
	eq(t, "masked", hit["email"].(string), "bi•••@gmail.com")
	eq(t, "state", hit["state"].(string), "none")
	eq(t, "request by id", a.call("POST", "/v1/friends/requests", map[string]string{"id": hit["id"].(string)}).status, 201)
	hit = search("bilal")[0]
	eq(t, "now outgoing", hit["state"].(string), "outgoing")
	eq(t, "full email once connected", hit["email"].(string), "bilal.khan@gmail.com")
	eq(t, "bilal sees it", strings.Join(friendStates(b.call("GET", "/v1/friends", nil)), ","), "incoming")

	// Searching is rate limited per person.
	limited := false
	for range 40 {
		if a.call("POST", "/v1/users/search", map[string]string{"q": "bi"}).status == 429 {
			limited = true
			break
		}
	}
	eq(t, "rate limited", limited, true)
}

func TestInviteLinks(t *testing.T) {
	hs := setup(t)
	a, b := hs.signIn("asha", "asha@x.com"), hs.signIn("bilal", "bilal@x.com")

	code := a.call("POST", "/v1/invites", map[string]string{}).obj()["code"].(string)
	eq(t, "code length", len(code), 12)
	eq(t, "same while fresh", a.call("POST", "/v1/invites", map[string]string{}).obj()["code"].(string), code)

	// Anyone with the link sees whose it is, without signing in, and nothing more.
	peek := hs.do("GET", "/v1/invites/"+code, "", nil)
	eq(t, "peek", peek.status, 200)
	eq(t, "name", peek.obj()["name"].(string), "Asha")
	_, hasEmail := peek.obj()["email"]
	eq(t, "no email", hasEmail, false)
	eq(t, "unknown code", hs.do("GET", "/v1/invites/nope", "", nil).status, 404)

	eq(t, "own link", a.call("POST", "/v1/invites/"+code+"/accept", map[string]string{}).status, 400)
	eq(t, "joined", b.call("POST", "/v1/invites/"+code+"/accept", map[string]string{}).obj()["state"].(string), "friend")
	eq(t, "friends", strings.Join(friendStates(a.call("GET", "/v1/friends", nil)), ","), "friend")

	hs.tick(15 * 24 * time.Hour)
	eq(t, "expired", hs.do("GET", "/v1/invites/"+code, "", nil).status, 404)
	if a.call("POST", "/v1/invites", map[string]string{}).obj()["code"].(string) == code {
		t.Fatal("an expired invite code was reused")
	}
}

func TestUnknownRoutes(t *testing.T) {
	hs := setup(t)
	r := hs.do("GET", "/v1/nope", "", nil)
	eq(t, "status", r.status, 404)
	eq(t, "body", r.obj()["error"].(string), "Not found")
	eq(t, "health", hs.do("GET", "/health", "", nil).obj()["ok"].(bool), true)
}
