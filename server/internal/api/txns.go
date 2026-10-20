package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jai-kaushikk/creditcard-vault/server/internal/rules"
	"github.com/jai-kaushikk/creditcard-vault/server/internal/store"
)

func newTxnID() string {
	var b [6]byte
	_, _ = rand.Read(b[:])
	return "txn_" + hex.EncodeToString(b[:])
}

func (s *server) event(r *http.Request, txnID, actor, typ string) error {
	return s.Store.AddEvent(r.Context(), store.TxnEvent{TxnID: txnID, Actor: actor, Type: typ, At: s.iso()})
}

// loadTxn reads a transaction the caller is part of, applying time-based rules.
func (s *server) loadTxn(r *http.Request) (rules.Txn, error) {
	me := userID(r)
	t, err := s.Store.TxnByID(r.Context(), r.PathValue("id"))
	if err != nil {
		return rules.Txn{}, err
	}
	if t == nil || (t.LenderID != me && t.BorrowerID != me) {
		return rules.Txn{}, rules.Fail(404, "No such transaction.")
	}
	settled := rules.Settle(*t, s.Now())
	if settled.Status != t.Status {
		if _, err := s.Store.UpdateTxn(r.Context(), settled); err != nil {
			return rules.Txn{}, err
		}
		if err := s.event(r, t.ID, "system", settled.Status); err != nil {
			return rules.Txn{}, err
		}
	}
	return settled, nil
}

// save writes a transition and its audit events.
func (s *server) save(r *http.Request, before, after rules.Txn, typ string) (int, any, error) {
	saved, err := s.Store.UpdateTxn(r.Context(), after)
	if err != nil {
		return 0, nil, err
	}
	if err := s.event(r, after.ID, userID(r), typ); err != nil {
		return 0, nil, err
	}
	if after.Status != before.Status {
		if err := s.event(r, after.ID, "system", after.Status); err != nil {
			return 0, nil, err
		}
	}
	return 200, saved, nil
}

// transition loads a transaction, applies a rule to it and saves the result.
func (s *server) transition(r *http.Request, typ string, rule func(rules.Txn) (rules.Txn, error)) (int, any, error) {
	t, err := s.loadTxn(r)
	if err != nil {
		return 0, nil, err
	}
	next, err := rule(t)
	if err != nil {
		return 0, nil, err
	}
	return s.save(r, t, next, typ)
}

func (s *server) listTxns(r *http.Request) (int, any, error) {
	rows, err := s.Store.TxnsFor(r.Context(), userID(r))
	if err != nil {
		return 0, nil, err
	}
	out := make([]rules.Txn, 0, len(rows))
	for _, t := range rows {
		settled := rules.Settle(t, s.Now())
		if settled.Status != t.Status {
			if _, err := s.Store.UpdateTxn(r.Context(), settled); err != nil {
				return 0, nil, err
			}
		}
		out = append(out, settled)
	}
	return 200, map[string]any{"transactions": out}, nil
}

func (s *server) requestOTP(r *http.Request) (int, any, error) {
	var b struct {
		LenderID       *string      `json:"lenderId"`
		AmountMinor    *json.Number `json:"amountMinor"`
		Currency       *string      `json:"currency"`
		Merchant       *string      `json:"merchant"`
		CardRef        *string      `json:"cardRef"`
		IdempotencyKey *string      `json:"idempotencyKey"`
	}
	if err := decode(r, &b); err != nil {
		return 0, nil, err
	}
	amt, err := amount(b.AmountMinor)
	if err := firstErr(id("lenderId", b.LenderID), err, currency(b.Currency), str("merchant", b.Merchant, 1, 80),
		id("cardRef", b.CardRef), id("idempotencyKey", b.IdempotencyKey)); err != nil {
		return 0, nil, err
	}
	me := userID(r)
	existing, err := s.Store.TxnByIdempotencyKey(r.Context(), *b.IdempotencyKey)
	if err != nil {
		return 0, nil, err
	}
	if existing != nil {
		if existing.BorrowerID != me {
			return 0, nil, rules.Fail(409, "Duplicate request.")
		}
		return 200, existing, nil
	}
	if *b.LenderID == me {
		return 0, nil, rules.Fail(400, "You can’t request an OTP from yourself.")
	}
	lender, err := s.Store.AccountByID(r.Context(), *b.LenderID)
	if err != nil {
		return 0, nil, err
	}
	if lender == nil || lender.Status != "active" {
		return 0, nil, rules.Fail(404, "That card’s owner isn’t on CardVault.")
	}
	if err := s.requireFriend(r, me, *b.LenderID, "ask for OTPs from"); err != nil {
		return 0, nil, err
	}
	recent, err := s.Store.CountRecentRequests(r.Context(), *b.LenderID, s.Now().Add(-time.Hour))
	if err != nil {
		return 0, nil, err
	}
	if recent >= rules.MaxRequestsPerLenderPerHour {
		return 0, nil, rules.Fail(429, "Too many OTP requests for this card owner right now. Try again later.")
	}
	merchant := strings.TrimSpace(*b.Merchant)
	t := rules.Txn{
		ID: newTxnID(), Kind: rules.CardPayment, LenderID: *b.LenderID, BorrowerID: me, AmountMinor: amt, Currency: *b.Currency,
		Merchant: &merchant, CardRef: b.CardRef, CreatedBy: me, Status: rules.Pending, RequestedAt: s.iso(), IdempotencyKey: *b.IdempotencyKey,
	}
	saved, err := s.Store.InsertTxn(r.Context(), t)
	if err != nil {
		return 0, nil, err
	}
	if err := s.Store.AddEvent(r.Context(), store.TxnEvent{TxnID: t.ID, Actor: me, Type: "requested", At: t.RequestedAt}); err != nil {
		return 0, nil, err
	}
	return 201, saved, nil
}

func (s *server) shareOTP(r *http.Request) (int, any, error) {
	var b struct {
		Payload *sealedBody `json:"payload"`
	}
	if err := decode(r, &b); err != nil {
		return 0, nil, err
	}
	payload, err := sealed(b.Payload)
	if err != nil {
		return 0, nil, err
	}
	me := userID(r)
	t, err := s.loadTxn(r)
	if err != nil {
		return 0, nil, err
	}
	next, err := rules.ShareOTP(t, me, s.Now())
	if err != nil {
		return 0, nil, err
	}
	if _, err := s.Mailbox.Send(r.Context(), store.OutgoingMail{From: me, To: t.BorrowerID, Kind: "otp", TxnID: &t.ID, Payload: payload}); err != nil {
		return 0, nil, err
	}
	return s.save(r, t, next, "otp_shared")
}

func (s *server) decline(r *http.Request) (int, any, error) {
	return s.transition(r, "declined", func(t rules.Txn) (rules.Txn, error) { return rules.Decline(t, userID(r)) })
}

func (s *server) borrowerResult(r *http.Request) (int, any, error) {
	var b struct {
		Outcome *string `json:"outcome"`
	}
	if err := decode(r, &b); err != nil {
		return 0, nil, err
	}
	if err := oneOf("outcome", b.Outcome, "success", "failed"); err != nil {
		return 0, nil, err
	}
	return s.transition(r, "result_"+*b.Outcome, func(t rules.Txn) (rules.Txn, error) {
		return rules.BorrowerResult(t, userID(r), *b.Outcome, s.Now())
	})
}

func (s *server) lenderEvidence(r *http.Request) (int, any, error) {
	var b struct {
		Evidence *string `json:"evidence"`
	}
	if err := decode(r, &b); err != nil {
		return 0, nil, err
	}
	if err := oneOf("evidence", b.Evidence, "sms_match", "manual", "objected"); err != nil {
		return 0, nil, err
	}
	return s.transition(r, "evidence_"+*b.Evidence, func(t rules.Txn) (rules.Txn, error) {
		return rules.LenderEvidence(t, userID(r), *b.Evidence, s.Now())
	})
}

func (s *server) dispute(r *http.Request) (int, any, error) {
	var b struct {
		Reason *string `json:"reason"`
	}
	// The reason is optional, and so is the body.
	if err := decode(r, &b); err != nil && err != errNoBody {
		return 0, nil, err
	}
	if err := optStr("reason", b.Reason, 500); err != nil {
		return 0, nil, err
	}
	return s.transition(r, "disputed_by_user", func(t rules.Txn) (rules.Txn, error) { return rules.Dispute(t, userID(r)) })
}

func (s *server) repay(r *http.Request) (int, any, error) {
	var b struct {
		CounterpartyID *string      `json:"counterpartyId"`
		Role           *string      `json:"role"`
		AmountMinor    *json.Number `json:"amountMinor"`
		Currency       *string      `json:"currency"`
		Method         *string      `json:"method"`
		IdempotencyKey *string      `json:"idempotencyKey"`
	}
	if err := decode(r, &b); err != nil {
		return 0, nil, err
	}
	amt, err := amount(b.AmountMinor)
	if err := firstErr(id("counterpartyId", b.CounterpartyID), oneOf("role", b.Role, "payer", "payee"), err, currency(b.Currency),
		str("method", b.Method, 0, 40), id("idempotencyKey", b.IdempotencyKey)); err != nil {
		return 0, nil, err
	}
	me := userID(r)
	existing, err := s.Store.TxnByIdempotencyKey(r.Context(), *b.IdempotencyKey)
	if err != nil {
		return 0, nil, err
	}
	if existing != nil {
		return 200, existing, nil
	}
	if *b.CounterpartyID == me {
		return 0, nil, rules.Fail(400, "You can’t repay yourself.")
	}
	other, err := s.Store.AccountByID(r.Context(), *b.CounterpartyID)
	if err != nil {
		return 0, nil, err
	}
	if other == nil {
		return 0, nil, rules.Fail(404, "No such friend.")
	}
	if err := s.requireFriend(r, me, other.ID, "settle up with"); err != nil {
		return 0, nil, err
	}
	lender, borrower := other.ID, me
	if *b.Role == "payee" {
		lender, borrower = me, other.ID
	}
	t := rules.Txn{
		ID: newTxnID(), Kind: rules.Repayment, LenderID: lender, BorrowerID: borrower, AmountMinor: amt, Currency: *b.Currency,
		Method: b.Method, CreatedBy: me, Status: rules.Pending, RequestedAt: s.iso(), IdempotencyKey: *b.IdempotencyKey,
	}
	saved, err := s.Store.InsertTxn(r.Context(), t)
	if err != nil {
		return 0, nil, err
	}
	if err := s.Store.AddEvent(r.Context(), store.TxnEvent{TxnID: t.ID, Actor: me, Type: "repayment_recorded", At: t.RequestedAt}); err != nil {
		return 0, nil, err
	}
	return 201, saved, nil
}

func (s *server) confirmRepayment(r *http.Request) (int, any, error) {
	return s.transition(r, "repayment_confirmed", func(t rules.Txn) (rules.Txn, error) {
		return rules.ConfirmRepayment(t, userID(r), s.Now())
	})
}

func (s *server) send(r *http.Request) (int, any, error) {
	var b struct {
		To      *string     `json:"to"`
		Kind    *string     `json:"kind"`
		Payload *sealedBody `json:"payload"`
	}
	if err := decode(r, &b); err != nil {
		return 0, nil, err
	}
	payload, err := sealed(b.Payload)
	if err := firstErr(id("to", b.To), oneOf("kind", b.Kind, "card_share", "card_unshare"), err); err != nil {
		return 0, nil, err
	}
	me := userID(r)
	if *b.To == me {
		return 0, nil, rules.Fail(400, "That’s you.")
	}
	to, err := s.Store.AccountByID(r.Context(), *b.To)
	if err != nil {
		return 0, nil, err
	}
	if to == nil {
		return 0, nil, rules.Fail(404, "No such friend.")
	}
	// Stopping a share always gets through, even after unfriending.
	if *b.Kind == "card_share" {
		if err := s.requireFriend(r, me, to.ID, "share cards with"); err != nil {
			return 0, nil, err
		}
	}
	m, err := s.Mailbox.Send(r.Context(), store.OutgoingMail{From: me, To: to.ID, Kind: *b.Kind, Payload: payload})
	if err != nil {
		return 0, nil, err
	}
	return 201, map[string]string{"id": m.ID}, nil
}

func (s *server) inbox(r *http.Request) (int, any, error) {
	msgs, err := s.Mailbox.Drain(r.Context(), userID(r))
	if err != nil {
		return 0, nil, err
	}
	type out struct {
		ID      string       `json:"id"`
		From    string       `json:"from"`
		Kind    string       `json:"kind"`
		TxnID   *string      `json:"txnId"`
		Payload store.Sealed `json:"payload"`
		SentAt  string       `json:"sentAt"`
	}
	list := make([]out, 0, len(msgs))
	for _, m := range msgs {
		list = append(list, out{ID: m.ID, From: m.From, Kind: m.Kind, TxnID: m.TxnID, Payload: m.Payload, SentAt: m.SentAt})
	}
	return 200, map[string]any{"messages": list}, nil
}
