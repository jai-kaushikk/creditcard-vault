// Package store keeps accounts, friendships, invites and transactions, in
// Postgres in production and in memory for tests and local runs.
package store

import (
	"context"
	"time"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/rules"
)

// Account is who someone is (from Google) and the key their phone seals messages to.
type Account struct {
	ID        string
	EmailHash string
	// Email, Name and Photo are nil only for accounts that haven't signed in since emails were stored.
	Email     *string
	Name      *string
	Photo     *string
	PublicKey string
	Status    string // active | suspended
	CreatedAt string
}

// NewAccount is what a sign-in writes; status and creation time are kept from before.
type NewAccount struct {
	ID, EmailHash, PublicKey string
	Email, Name, Photo       *string
}

// Friendship is one row per pair of people, A sorting before B. Declining or unfriending deletes it.
type Friendship struct {
	A, B        string
	RequestedBy string
	Status      string // pending | accepted
	CreatedAt   string
	AcceptedAt  *string
}

type Invite struct {
	Code, FromID, CreatedAt, ExpiresAt string
}

type TxnEvent struct {
	TxnID, Actor, Type, At string
	Meta                   map[string]any
}

// Pair orders two account ids the way friendships are stored.
func Pair(x, y string) (string, string) {
	if x < y {
		return x, y
	}
	return y, x
}

type Store interface {
	UpsertAccount(ctx context.Context, a NewAccount) (Account, error)
	AccountByID(ctx context.Context, id string) (*Account, error)
	AccountsByIDs(ctx context.Context, ids []string) ([]Account, error)
	AccountByEmailHash(ctx context.Context, hash string) (*Account, error)
	// SearchAccounts finds active accounts whose email, or any word of whose name, starts with q (lower-case).
	SearchAccounts(ctx context.Context, q string, limit int) ([]Account, error)
	Friendship(ctx context.Context, x, y string) (*Friendship, error)
	FriendshipsOf(ctx context.Context, userID string) ([]Friendship, error)
	SaveFriendship(ctx context.Context, f Friendship) error
	DeleteFriendship(ctx context.Context, x, y string) error
	AddInvite(ctx context.Context, i Invite) error
	InviteByCode(ctx context.Context, code string) (*Invite, error)
	LatestInviteFrom(ctx context.Context, userID string) (*Invite, error)
	InsertTxn(ctx context.Context, t rules.Txn) (rules.Txn, error)
	TxnByID(ctx context.Context, id string) (*rules.Txn, error)
	TxnByIdempotencyKey(ctx context.Context, key string) (*rules.Txn, error)
	UpdateTxn(ctx context.Context, t rules.Txn) (rules.Txn, error)
	TxnsFor(ctx context.Context, userID string) ([]rules.Txn, error)
	CountRecentRequests(ctx context.Context, lenderID string, since time.Time) (int, error)
	AddEvent(ctx context.Context, e TxnEvent) error
	Close()
}
