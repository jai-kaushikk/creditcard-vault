package store

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/rules"
)

// Sealed messages between phones (card shares, OTPs). The server can't read
// them; each is deleted on delivery or when it expires. In production they sit
// in the relay_messages table, so a scaled-to-zero or redeployed server doesn't
// lose them; the in-memory Mailbox is for dev and tests.

type Sealed struct {
	Epk   string `json:"epk"`
	Nonce string `json:"nonce"`
	Box   string `json:"box"`
}

type MailMessage struct {
	ID, From, To, Kind string
	TxnID              *string
	Payload            Sealed
	SentAt             string
	ExpiresAt          time.Time
}

type OutgoingMail struct {
	From, To, Kind string
	TxnID          *string
	Payload        Sealed
}

type Relay interface {
	Send(ctx context.Context, m OutgoingMail) (MailMessage, error)
	// Drain returns and removes everything waiting for this user, oldest first.
	Drain(ctx context.Context, userID string) ([]MailMessage, error)
}

var TTL = map[string]time.Duration{
	"otp":          5 * time.Minute,
	"card_share":   24 * time.Hour,
	"card_unshare": 7 * 24 * time.Hour,
}

const maxPerInbox = 200

// NewUUID returns a random (version 4) UUID.
func NewUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func newMessage(m OutgoingMail, now time.Time) MailMessage {
	return MailMessage{ID: NewUUID(), From: m.From, To: m.To, Kind: m.Kind, TxnID: m.TxnID, Payload: m.Payload,
		SentAt: rules.ISO(now), ExpiresAt: now.Add(TTL[m.Kind])}
}

type Mailbox struct {
	mu    sync.Mutex
	boxes map[string][]MailMessage
	now   func() time.Time
}

func NewMailbox(now func() time.Time) *Mailbox {
	return &Mailbox{boxes: map[string][]MailMessage{}, now: now}
}

func (b *Mailbox) live(userID string) []MailMessage {
	t := b.now()
	out := []MailMessage{}
	for _, m := range b.boxes[userID] {
		if m.ExpiresAt.After(t) {
			out = append(out, m)
		}
	}
	return out
}

func (b *Mailbox) Send(_ context.Context, msg OutgoingMail) (MailMessage, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	m := newMessage(msg, b.now())
	box := append(b.live(msg.To), m)
	if len(box) > maxPerInbox {
		box = box[len(box)-maxPerInbox:]
	}
	b.boxes[msg.To] = box
	return m, nil
}

func (b *Mailbox) Drain(_ context.Context, userID string) ([]MailMessage, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	box := b.live(userID)
	delete(b.boxes, userID)
	return box, nil
}

// PgRelay keeps sealed messages in Postgres: deleted on delivery, expired ones swept on every read.
type PgRelay struct {
	db  *Pg
	now func() time.Time
}

func NewPgRelay(db *Pg, now func() time.Time) *PgRelay { return &PgRelay{db: db, now: now} }

func (r *PgRelay) Send(ctx context.Context, msg OutgoingMail) (MailMessage, error) {
	m := newMessage(msg, r.now())
	payload, _ := json.Marshal(m.Payload)
	_, err := r.db.Pool.Exec(ctx,
		`insert into relay_messages (id, to_id, from_id, kind, txn_id, payload, sent_at, expires_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
		m.ID, m.To, m.From, m.Kind, m.TxnID, string(payload), rules.ParseISO(m.SentAt), m.ExpiresAt)
	return m, err
}

func (r *PgRelay) Drain(ctx context.Context, userID string) ([]MailMessage, error) {
	if _, err := r.db.Pool.Exec(ctx, `delete from relay_messages where expires_at <= $1`, r.now()); err != nil {
		return nil, err
	}
	rows, err := r.db.Pool.Query(ctx,
		`delete from relay_messages where to_id = $1 returning id::text, from_id, to_id, kind, txn_id, payload, sent_at, expires_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MailMessage{}
	for rows.Next() {
		var m MailMessage
		var payload []byte
		var sent time.Time
		if err := rows.Scan(&m.ID, &m.From, &m.To, &m.Kind, &m.TxnID, &payload, &sent, &m.ExpiresAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(payload, &m.Payload); err != nil {
			return nil, err
		}
		m.SentAt = rules.ISO(sent)
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SentAt < out[j].SentAt })
	return out, rows.Err()
}
