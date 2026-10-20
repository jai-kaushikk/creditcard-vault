package store

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/rules"
)

// Memory is for local development and tests. Data is lost on restart.
type Memory struct {
	mu          sync.Mutex
	accounts    map[string]Account
	friendships map[string]Friendship
	invites     map[string]Invite
	txns        map[string]rules.Txn
	Events      []TxnEvent
}

func NewMemory() *Memory {
	return &Memory{
		accounts:    map[string]Account{},
		friendships: map[string]Friendship{},
		invites:     map[string]Invite{},
		txns:        map[string]rules.Txn{},
	}
}

func pairKey(x, y string) string {
	a, b := Pair(x, y)
	return a + "|" + b
}

func (m *Memory) UpsertAccount(_ context.Context, a NewAccount) (Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	next, ok := m.accounts[a.ID]
	if !ok {
		next = Account{Status: "active", CreatedAt: rules.ISO(time.Now())}
	}
	next.ID, next.EmailHash, next.PublicKey = a.ID, a.EmailHash, a.PublicKey
	next.Email, next.Name, next.Photo = a.Email, a.Name, a.Photo
	m.accounts[a.ID] = next
	return next, nil
}

func (m *Memory) AccountByID(_ context.Context, id string) (*Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a, ok := m.accounts[id]; ok {
		return &a, nil
	}
	return nil, nil
}

func (m *Memory) AccountsByIDs(_ context.Context, ids []string) ([]Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []Account{}
	for _, id := range ids {
		if a, ok := m.accounts[id]; ok {
			out = append(out, a)
		}
	}
	return out, nil
}

func (m *Memory) AccountByEmailHash(_ context.Context, hash string) (*Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, a := range m.accounts {
		if a.EmailHash == hash {
			return &a, nil
		}
	}
	return nil, nil
}

func (m *Memory) SearchAccounts(_ context.Context, q string, limit int) ([]Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []Account{}
	for _, a := range m.accounts {
		if a.Status == "active" && Matches(a, q) {
			out = append(out, a)
		}
	}
	sort.Slice(out, func(i, j int) bool { return deref(out[i].Name) < deref(out[j].Name) })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// Matches is the search rule both stores follow.
func Matches(a Account, q string) bool {
	if strings.HasPrefix(strings.ToLower(deref(a.Email)), q) {
		return true
	}
	for _, w := range strings.Fields(strings.ToLower(deref(a.Name))) {
		if strings.HasPrefix(w, q) {
			return true
		}
	}
	return strings.HasPrefix(strings.ToLower(deref(a.Name)), q)
}

func (m *Memory) Friendship(_ context.Context, x, y string) (*Friendship, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if f, ok := m.friendships[pairKey(x, y)]; ok {
		return &f, nil
	}
	return nil, nil
}

func (m *Memory) FriendshipsOf(_ context.Context, userID string) ([]Friendship, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []Friendship{}
	for _, f := range m.friendships {
		if f.A == userID || f.B == userID {
			out = append(out, f)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt < out[j].CreatedAt })
	return out, nil
}

func (m *Memory) SaveFriendship(_ context.Context, f Friendship) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.friendships[f.A+"|"+f.B] = f
	return nil
}

func (m *Memory) DeleteFriendship(_ context.Context, x, y string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.friendships, pairKey(x, y))
	return nil
}

func (m *Memory) AddInvite(_ context.Context, i Invite) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.invites[i.Code] = i
	return nil
}

func (m *Memory) InviteByCode(_ context.Context, code string) (*Invite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if i, ok := m.invites[code]; ok {
		return &i, nil
	}
	return nil, nil
}

func (m *Memory) LatestInviteFrom(_ context.Context, userID string) (*Invite, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var best *Invite
	for _, i := range m.invites {
		if i.FromID == userID && (best == nil || i.ExpiresAt > best.ExpiresAt) {
			i := i
			best = &i
		}
	}
	return best, nil
}

func (m *Memory) InsertTxn(_ context.Context, t rules.Txn) (rules.Txn, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.txns[t.ID] = t
	return t, nil
}

func (m *Memory) TxnByID(_ context.Context, id string) (*rules.Txn, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if t, ok := m.txns[id]; ok {
		return &t, nil
	}
	return nil, nil
}

func (m *Memory) TxnByIdempotencyKey(_ context.Context, key string) (*rules.Txn, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, t := range m.txns {
		if t.IdempotencyKey == key {
			return &t, nil
		}
	}
	return nil, nil
}

func (m *Memory) UpdateTxn(_ context.Context, t rules.Txn) (rules.Txn, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.txns[t.ID] = t
	return t, nil
}

func (m *Memory) TxnsFor(_ context.Context, userID string) ([]rules.Txn, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []rules.Txn{}
	for _, t := range m.txns {
		if t.LenderID == userID || t.BorrowerID == userID {
			out = append(out, t)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].RequestedAt > out[j].RequestedAt })
	return out, nil
}

func (m *Memory) CountRecentRequests(_ context.Context, lenderID string, since time.Time) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, cutoff := 0, rules.ISO(since)
	for _, t := range m.txns {
		if t.Kind == rules.CardPayment && t.LenderID == lenderID && t.RequestedAt >= cutoff {
			n++
		}
	}
	return n, nil
}

func (m *Memory) AddEvent(_ context.Context, e TxnEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Events = append(m.Events, e)
	return nil
}

// AllTxns is for tests that check what the store holds.
func (m *Memory) AllTxns() []rules.Txn {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]rules.Txn, 0, len(m.txns))
	for _, t := range m.txns {
		out = append(out, t)
	}
	return out
}

func (m *Memory) Close() {}
