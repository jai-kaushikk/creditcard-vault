package api

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/auth"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/rules"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/store"
)

// profile is what friends (and people with a pending request) see of each other.
type profile struct {
	ID        string  `json:"id"`
	Email     *string `json:"email"`
	Name      *string `json:"name"`
	Photo     *string `json:"photo"`
	PublicKey string  `json:"publicKey"`
}

func profileOf(a store.Account) profile {
	return profile{ID: a.ID, Email: a.Email, Name: a.Name, Photo: a.Photo, PublicKey: a.PublicKey}
}

func (s *server) iso() string { return rules.ISO(s.Now()) }

func (s *server) areFriends(r *http.Request, x, y string) (bool, error) {
	f, err := s.Store.Friendship(r.Context(), x, y)
	return f != nil && f.Status == "accepted", err
}

func (s *server) requireFriend(r *http.Request, me, other, what string) error {
	ok, err := s.areFriends(r, me, other)
	if err != nil {
		return err
	}
	if !ok {
		return rules.Fail(403, "You can only %s friends on CardVault.", what)
	}
	return nil
}

func (s *server) befriend(r *http.Request, x, y, requestedBy string, prev *store.Friendship) error {
	a, b := store.Pair(x, y)
	at := s.iso()
	f := store.Friendship{A: a, B: b, RequestedBy: requestedBy, Status: "accepted", CreatedAt: at, AcceptedAt: &at}
	if prev != nil {
		f.RequestedBy, f.CreatedAt = prev.RequestedBy, prev.CreatedAt
	}
	return s.Store.SaveFriendship(r.Context(), f)
}

// stateWith says where the caller stands with someone: friend, incoming, outgoing or none.
func stateOf(f *store.Friendship, me string) string {
	switch {
	case f == nil:
		return "none"
	case f.Status == "accepted":
		return "friend"
	case f.RequestedBy == me:
		return "outgoing"
	default:
		return "incoming"
	}
}

func (s *server) me(r *http.Request) (int, any, error) {
	a, err := s.Store.AccountByID(r.Context(), userID(r))
	if err != nil || a == nil {
		return 0, nil, err
	}
	return 200, map[string]any{"id": a.ID, "email": a.Email, "name": a.Name, "photo": a.Photo}, nil
}

func (s *server) friends(r *http.Request) (int, any, error) {
	me := userID(r)
	links, err := s.Store.FriendshipsOf(r.Context(), me)
	if err != nil {
		return 0, nil, err
	}
	other := func(f store.Friendship) string {
		if f.A == me {
			return f.B
		}
		return f.A
	}
	ids := make([]string, len(links))
	for i, f := range links {
		ids[i] = other(f)
	}
	accounts, err := s.Store.AccountsByIDs(r.Context(), ids)
	if err != nil {
		return 0, nil, err
	}
	people := map[string]store.Account{}
	for _, a := range accounts {
		people[a.ID] = a
	}
	type row struct {
		profile
		State string `json:"state"`
		Since string `json:"since"`
	}
	out := []row{}
	for _, f := range links {
		a, ok := people[other(f)]
		if !ok || a.Status != "active" {
			continue
		}
		since := f.CreatedAt
		if f.AcceptedAt != nil {
			since = *f.AcceptedAt
		}
		out = append(out, row{profile: profileOf(a), State: stateOf(&f, me), Since: since})
	}
	return 200, map[string]any{"friends": out}, nil
}

// requestFriend sends a friend request, by email or (from search) by account id.
// The email goes in the body, never in a URL that request logs record.
func (s *server) requestFriend(r *http.Request) (int, any, error) {
	var b struct {
		Email *string `json:"email"`
		ID    *string `json:"id"`
	}
	if err := decode(r, &b); err != nil {
		return 0, nil, err
	}
	me := userID(r)
	var to *store.Account
	var err error
	switch {
	case b.ID != nil:
		if err := id("id", b.ID); err != nil {
			return 0, nil, err
		}
		to, err = s.Store.AccountByID(r.Context(), *b.ID)
	default:
		if err := str("email", b.Email, 3, 320); err != nil {
			return 0, nil, err
		}
		to, err = s.Store.AccountByEmailHash(r.Context(), auth.EmailHash(*b.Email, s.Secret))
	}
	if err != nil {
		return 0, nil, err
	}
	if to == nil || to.Status != "active" {
		return 404, errBody("Nobody with that email is on CardVault yet. Send them an invite link instead."), nil
	}
	if to.ID == me {
		return 0, nil, rules.Fail(400, "That’s you.")
	}
	prev, err := s.Store.Friendship(r.Context(), me, to.ID)
	if err != nil {
		return 0, nil, err
	}
	reply := func(status int, state string) (int, any, error) {
		return status, map[string]any{"state": state, "friend": profileOf(*to)}, nil
	}
	switch {
	case prev != nil && prev.Status == "accepted":
		return reply(200, "friend")
	case prev != nil && prev.RequestedBy == to.ID:
		// They already asked us: asking back accepts.
		if err := s.befriend(r, me, to.ID, to.ID, prev); err != nil {
			return 0, nil, err
		}
		return reply(200, "friend")
	case prev != nil:
		return reply(200, "outgoing")
	}
	links, err := s.Store.FriendshipsOf(r.Context(), me)
	if err != nil {
		return 0, nil, err
	}
	pending := 0
	for _, f := range links {
		if f.Status == "pending" && f.RequestedBy == me {
			pending++
		}
	}
	if pending >= maxPendingRequests {
		return 0, nil, rules.Fail(429, "You have a lot of requests waiting. Wait for some to be answered.")
	}
	a, c := store.Pair(me, to.ID)
	if err := s.Store.SaveFriendship(r.Context(), store.Friendship{A: a, B: c, RequestedBy: me, Status: "pending", CreatedAt: s.iso()}); err != nil {
		return 0, nil, err
	}
	return reply(201, "outgoing")
}

func (s *server) acceptFriend(r *http.Request) (int, any, error) {
	me, them := userID(r), r.PathValue("id")
	prev, err := s.Store.Friendship(r.Context(), me, them)
	if err != nil {
		return 0, nil, err
	}
	if prev == nil || prev.RequestedBy == me {
		return 0, nil, rules.Fail(404, "No friend request from them.")
	}
	if prev.Status != "accepted" {
		if err := s.befriend(r, me, them, prev.RequestedBy, prev); err != nil {
			return 0, nil, err
		}
	}
	return 200, map[string]string{"state": "friend"}, nil
}

// removeFriend declines a request, cancels one you sent, or unfriends.
func (s *server) removeFriend(r *http.Request) (int, any, error) {
	if err := s.Store.DeleteFriendship(r.Context(), userID(r), r.PathValue("id")); err != nil {
		return 0, nil, err
	}
	return 200, map[string]bool{"ok": true}, nil
}

// maskEmail shows enough of a stranger's email to tell two people apart: "ra•••@gmail.com".
func maskEmail(email *string) *string {
	if email == nil {
		return nil
	}
	local, domain, ok := strings.Cut(*email, "@")
	if !ok {
		return nil
	}
	keep := 2
	if utf8.RuneCountInString(local) <= 2 {
		keep = 1
	}
	m := string([]rune(local)[:keep]) + "•••@" + domain
	return &m
}

// searchUsers suggests people on CardVault as you type a name or email. Strangers'
// emails come back masked; the request is then sent by account id.
func (s *server) searchUsers(r *http.Request) (int, any, error) {
	var b struct {
		Q *string `json:"q"`
	}
	if err := decode(r, &b); err != nil {
		return 0, nil, err
	}
	if err := str("q", b.Q, 1, 100); err != nil {
		return 0, nil, err
	}
	me := userID(r)
	q := strings.ToLower(strings.TrimSpace(*b.Q))
	type hit struct {
		ID    string  `json:"id"`
		Name  *string `json:"name"`
		Email *string `json:"email"`
		Photo *string `json:"photo"`
		State string  `json:"state"`
	}
	out := []hit{}
	if utf8.RuneCountInString(q) < 2 {
		return 200, map[string]any{"users": out}, nil
	}
	if !s.search.allow(me) {
		return 0, nil, rules.Fail(429, "Too many searches. Wait a minute and try again.")
	}
	found, err := s.Store.SearchAccounts(r.Context(), q, 9)
	if err != nil {
		return 0, nil, err
	}
	for _, a := range found {
		if a.ID == me || len(out) == 8 {
			continue
		}
		f, err := s.Store.Friendship(r.Context(), me, a.ID)
		if err != nil {
			return 0, nil, err
		}
		h := hit{ID: a.ID, Name: a.Name, Email: maskEmail(a.Email), Photo: a.Photo, State: stateOf(f, me)}
		if h.State != "none" {
			h.Email = a.Email
		}
		out = append(out, h)
	}
	return 200, map[string]any{"users": out}, nil
}

// user is a friend's (or requester's) profile; strangers get a 404.
func (s *server) user(r *http.Request) (int, any, error) {
	f, err := s.Store.Friendship(r.Context(), userID(r), r.PathValue("id"))
	if err != nil {
		return 0, nil, err
	}
	var a *store.Account
	if f != nil {
		if a, err = s.Store.AccountByID(r.Context(), r.PathValue("id")); err != nil {
			return 0, nil, err
		}
	}
	if a == nil {
		return 404, errBody("Not found"), nil
	}
	return 200, profileOf(*a), nil
}

// createInvite returns your current invite link code, or a new one once the last is about to expire.
func (s *server) createInvite(r *http.Request) (int, any, error) {
	me := userID(r)
	last, err := s.Store.LatestInviteFrom(r.Context(), me)
	if err != nil {
		return 0, nil, err
	}
	if last != nil && rules.ParseISO(last.ExpiresAt).Sub(s.Now()) > 24*time.Hour {
		return 200, map[string]string{"code": last.Code, "expiresAt": last.ExpiresAt}, nil
	}
	var raw [9]byte
	_, _ = rand.Read(raw[:])
	inv := store.Invite{
		Code:      base64.RawURLEncoding.EncodeToString(raw[:]),
		FromID:    me,
		CreatedAt: s.iso(),
		ExpiresAt: rules.ISO(s.Now().Add(inviteDays * 24 * time.Hour)),
	}
	if err := s.Store.AddInvite(r.Context(), inv); err != nil {
		return 0, nil, err
	}
	return 200, map[string]string{"code": inv.Code, "expiresAt": inv.ExpiresAt}, nil
}

// liveInvite finds an unexpired invite and the active account it's from.
func (s *server) liveInvite(r *http.Request, code string) (*store.Invite, *store.Account, error) {
	inv, err := s.Store.InviteByCode(r.Context(), code)
	if err != nil || inv == nil || !rules.ParseISO(inv.ExpiresAt).After(s.Now()) {
		return nil, nil, err
	}
	from, err := s.Store.AccountByID(r.Context(), inv.FromID)
	if err != nil || from == nil || from.Status != "active" {
		return nil, nil, err
	}
	return inv, from, nil
}

// peekInvite is public, so the invite page can say who it's from before anyone signs in.
func (s *server) peekInvite(r *http.Request) (int, any, error) {
	inv, from, err := s.liveInvite(r, r.PathValue("code"))
	if err != nil {
		return 0, nil, err
	}
	if from == nil {
		return 404, errBody("This invite has expired. Ask for a new link."), nil
	}
	name := "A friend"
	if from.Name != nil {
		name, _, _ = strings.Cut(*from.Name, " ")
	}
	return 200, map[string]any{"name": name, "photo": from.Photo, "expiresAt": inv.ExpiresAt}, nil
}

// acceptInvite: opening someone's invite link and tapping Add means both sides have said yes.
func (s *server) acceptInvite(r *http.Request) (int, any, error) {
	me := userID(r)
	_, from, err := s.liveInvite(r, r.PathValue("code"))
	if err != nil {
		return 0, nil, err
	}
	if from == nil {
		return 0, nil, rules.Fail(404, "This invite has expired. Ask for a new link.")
	}
	if from.ID == me {
		return 0, nil, rules.Fail(400, "That’s your own invite link.")
	}
	prev, err := s.Store.Friendship(r.Context(), me, from.ID)
	if err != nil {
		return 0, nil, err
	}
	if prev == nil || prev.Status != "accepted" {
		if err := s.befriend(r, me, from.ID, from.ID, prev); err != nil {
			return 0, nil, err
		}
	}
	return 200, map[string]any{"state": "friend", "friend": profileOf(*from)}, nil
}
