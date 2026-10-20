package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jai-kaushikk/creditcard-vault/server"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/rules"
)

// Pg is the production store.
type Pg struct {
	Pool *pgxpool.Pool
}

func OpenPg(ctx context.Context, url string) (*Pg, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 10
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &Pg{Pool: pool}, nil
}

// Migrate runs schema.sql. Without arguments pgx uses the simple protocol, so one call runs every statement.
func (p *Pg) Migrate(ctx context.Context) error {
	_, err := p.Pool.Exec(ctx, server.Schema)
	return err
}

func (p *Pg) Close() { p.Pool.Close() }

func isoPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := rules.ISO(*t)
	return &s
}

func timePtr(s *string) *time.Time {
	if s == nil {
		return nil
	}
	t := rules.ParseISO(*s)
	return &t
}

const accountCols = `id, email_hash, email, name, photo_url, public_key, status, created_at`

func scanAccount(row pgx.Row) (*Account, error) {
	var a Account
	var created time.Time
	err := row.Scan(&a.ID, &a.EmailHash, &a.Email, &a.Name, &a.Photo, &a.PublicKey, &a.Status, &created)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	a.CreatedAt = rules.ISO(created)
	return &a, nil
}

func (p *Pg) UpsertAccount(ctx context.Context, a NewAccount) (Account, error) {
	got, err := scanAccount(p.Pool.QueryRow(ctx,
		`insert into accounts (id, email_hash, email, name, photo_url, public_key) values ($1, $2, $3, $4, $5, $6)
		 on conflict (id) do update set email_hash = excluded.email_hash, email = excluded.email, name = excluded.name,
		   photo_url = excluded.photo_url, public_key = excluded.public_key
		 returning `+accountCols,
		a.ID, a.EmailHash, a.Email, a.Name, a.Photo, a.PublicKey))
	if err != nil {
		return Account{}, err
	}
	return *got, nil
}

func (p *Pg) AccountByID(ctx context.Context, id string) (*Account, error) {
	return scanAccount(p.Pool.QueryRow(ctx, `select `+accountCols+` from accounts where id = $1`, id))
}

func (p *Pg) AccountsByIDs(ctx context.Context, ids []string) ([]Account, error) {
	out := []Account{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := p.Pool.Query(ctx, `select `+accountCols+` from accounts where id = any($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		a, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

func (p *Pg) AccountByEmailHash(ctx context.Context, hash string) (*Account, error) {
	return scanAccount(p.Pool.QueryRow(ctx, `select `+accountCols+` from accounts where email_hash = $1`, hash))
}

func (p *Pg) SearchAccounts(ctx context.Context, q string, limit int) ([]Account, error) {
	like := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q) + "%"
	rows, err := p.Pool.Query(ctx,
		`select `+accountCols+` from accounts
		 where status = 'active' and (lower(email) like $1 or lower(name) like $1 or lower(name) like '% ' || $1)
		 order by name nulls last limit $2`, like, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Account{}
	for rows.Next() {
		a, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

const friendshipCols = `user_a, user_b, requested_by, status, created_at, accepted_at`

func scanFriendship(row pgx.Row) (*Friendship, error) {
	var f Friendship
	var created time.Time
	var accepted *time.Time
	err := row.Scan(&f.A, &f.B, &f.RequestedBy, &f.Status, &created, &accepted)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	f.CreatedAt, f.AcceptedAt = rules.ISO(created), isoPtr(accepted)
	return &f, nil
}

func (p *Pg) Friendship(ctx context.Context, x, y string) (*Friendship, error) {
	a, b := Pair(x, y)
	return scanFriendship(p.Pool.QueryRow(ctx, `select `+friendshipCols+` from friendships where user_a = $1 and user_b = $2`, a, b))
}

func (p *Pg) FriendshipsOf(ctx context.Context, userID string) ([]Friendship, error) {
	rows, err := p.Pool.Query(ctx, `select `+friendshipCols+` from friendships where user_a = $1 or user_b = $1 order by created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Friendship{}
	for rows.Next() {
		f, err := scanFriendship(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *f)
	}
	return out, rows.Err()
}

func (p *Pg) SaveFriendship(ctx context.Context, f Friendship) error {
	_, err := p.Pool.Exec(ctx,
		`insert into friendships (user_a, user_b, requested_by, status, created_at, accepted_at) values ($1, $2, $3, $4, $5, $6)
		 on conflict (user_a, user_b) do update set requested_by = excluded.requested_by, status = excluded.status,
		   created_at = excluded.created_at, accepted_at = excluded.accepted_at`,
		f.A, f.B, f.RequestedBy, f.Status, rules.ParseISO(f.CreatedAt), timePtr(f.AcceptedAt))
	return err
}

func (p *Pg) DeleteFriendship(ctx context.Context, x, y string) error {
	a, b := Pair(x, y)
	_, err := p.Pool.Exec(ctx, `delete from friendships where user_a = $1 and user_b = $2`, a, b)
	return err
}

func scanInvite(row pgx.Row) (*Invite, error) {
	var i Invite
	var created, expires time.Time
	err := row.Scan(&i.Code, &i.FromID, &created, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	i.CreatedAt, i.ExpiresAt = rules.ISO(created), rules.ISO(expires)
	return &i, nil
}

func (p *Pg) AddInvite(ctx context.Context, i Invite) error {
	_, err := p.Pool.Exec(ctx, `insert into invites (code, from_id, created_at, expires_at) values ($1, $2, $3, $4)`,
		i.Code, i.FromID, rules.ParseISO(i.CreatedAt), rules.ParseISO(i.ExpiresAt))
	return err
}

func (p *Pg) InviteByCode(ctx context.Context, code string) (*Invite, error) {
	return scanInvite(p.Pool.QueryRow(ctx, `select code, from_id, created_at, expires_at from invites where code = $1`, code))
}

func (p *Pg) LatestInviteFrom(ctx context.Context, userID string) (*Invite, error) {
	return scanInvite(p.Pool.QueryRow(ctx,
		`select code, from_id, created_at, expires_at from invites where from_id = $1 order by expires_at desc limit 1`, userID))
}

const txnCols = `id, kind, lender_id, borrower_id, amount_minor, currency, merchant, category, card_ref, method,
  created_by, status, requested_at, otp_shared_at, borrower_result, lender_evidence, confirmed_at, idempotency_key`

func scanTxn(row pgx.Row) (*rules.Txn, error) {
	var t rules.Txn
	var requested time.Time
	var otp, confirmed *time.Time
	err := row.Scan(&t.ID, &t.Kind, &t.LenderID, &t.BorrowerID, &t.AmountMinor, &t.Currency, &t.Merchant, &t.Category, &t.CardRef,
		&t.Method, &t.CreatedBy, &t.Status, &requested, &otp, &t.BorrowerResult, &t.LenderEvidence, &confirmed, &t.IdempotencyKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.RequestedAt, t.OtpSharedAt, t.ConfirmedAt = rules.ISO(requested), isoPtr(otp), isoPtr(confirmed)
	return &t, nil
}

func (p *Pg) InsertTxn(ctx context.Context, t rules.Txn) (rules.Txn, error) {
	got, err := scanTxn(p.Pool.QueryRow(ctx,
		`insert into transactions (`+txnCols+`)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning `+txnCols,
		t.ID, t.Kind, t.LenderID, t.BorrowerID, t.AmountMinor, t.Currency, t.Merchant, t.Category, t.CardRef, t.Method,
		t.CreatedBy, t.Status, rules.ParseISO(t.RequestedAt), timePtr(t.OtpSharedAt), t.BorrowerResult, t.LenderEvidence,
		timePtr(t.ConfirmedAt), t.IdempotencyKey))
	if err != nil {
		return rules.Txn{}, err
	}
	return *got, nil
}

func (p *Pg) TxnByID(ctx context.Context, id string) (*rules.Txn, error) {
	return scanTxn(p.Pool.QueryRow(ctx, `select `+txnCols+` from transactions where id = $1`, id))
}

func (p *Pg) TxnByIdempotencyKey(ctx context.Context, key string) (*rules.Txn, error) {
	return scanTxn(p.Pool.QueryRow(ctx, `select `+txnCols+` from transactions where idempotency_key = $1`, key))
}

func (p *Pg) UpdateTxn(ctx context.Context, t rules.Txn) (rules.Txn, error) {
	got, err := scanTxn(p.Pool.QueryRow(ctx,
		`update transactions set status = $2, otp_shared_at = $3, borrower_result = $4, lender_evidence = $5, confirmed_at = $6
		 where id = $1 returning `+txnCols,
		t.ID, t.Status, timePtr(t.OtpSharedAt), t.BorrowerResult, t.LenderEvidence, timePtr(t.ConfirmedAt)))
	if err != nil {
		return rules.Txn{}, err
	}
	if got == nil {
		return rules.Txn{}, errors.New("transaction vanished during update")
	}
	return *got, nil
}

func (p *Pg) TxnsFor(ctx context.Context, userID string) ([]rules.Txn, error) {
	rows, err := p.Pool.Query(ctx,
		`select `+txnCols+` from transactions where lender_id = $1 or borrower_id = $1 order by requested_at desc limit 500`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []rules.Txn{}
	for rows.Next() {
		t, err := scanTxn(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

func (p *Pg) CountRecentRequests(ctx context.Context, lenderID string, since time.Time) (int, error) {
	var n int
	err := p.Pool.QueryRow(ctx,
		`select count(*)::int from transactions where kind = 'card_payment' and lender_id = $1 and requested_at >= $2`,
		lenderID, since).Scan(&n)
	return n, err
}

func (p *Pg) AddEvent(ctx context.Context, e TxnEvent) error {
	meta := e.Meta
	if meta == nil {
		meta = map[string]any{}
	}
	b, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	_, err = p.Pool.Exec(ctx, `insert into transaction_events (transaction_id, actor, type, at, meta) values ($1, $2, $3, $4, $5)`,
		e.TxnID, e.Actor, e.Type, rules.ParseISO(e.At), string(b))
	return err
}
