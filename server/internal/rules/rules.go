// Package rules holds how a transaction moves between states. Pure functions,
// so the rules are the same whichever store is behind them, and easy to test.
package rules

import (
	"fmt"
	"time"
)

const (
	CardPayment = "card_payment"
	Repayment   = "repayment"

	Pending   = "pending"
	Confirmed = "confirmed"
	Expired   = "expired"
	Disputed  = "disputed"
	Settled   = "settled"
)

const (
	OTPTTL = 3 * time.Minute
	// A borrower's "it went through" stands if the lender hasn't objected in a day.
	AutoConfirm                 = 24 * time.Hour
	MaxAmountMinor              = 10_00_000_00 // ₹10,00,000
	MaxRequestsPerLenderPerHour = 6
)

// Txn is one ledger row. Times are ISO-8601 strings in UTC with milliseconds,
// the same shape the app has always received.
type Txn struct {
	ID             string  `json:"id"`
	Kind           string  `json:"kind"`
	LenderID       string  `json:"lenderId"`
	BorrowerID     string  `json:"borrowerId"`
	AmountMinor    int64   `json:"amountMinor"`
	Currency       string  `json:"currency"`
	Merchant       *string `json:"merchant"`
	Category       *string `json:"category"`
	CardRef        *string `json:"cardRef"`
	Method         *string `json:"method"`
	CreatedBy      string  `json:"createdBy"`
	Status         string  `json:"status"`
	RequestedAt    string  `json:"requestedAt"`
	OtpSharedAt    *string `json:"otpSharedAt"`
	BorrowerResult *string `json:"borrowerResult"`
	LenderEvidence *string `json:"lenderEvidence"`
	ConfirmedAt    *string `json:"confirmedAt"`
	IdempotencyKey string  `json:"idempotencyKey"`
}

// Error is a refusal the caller should see, with its HTTP status.
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

func Fail(status int, format string, args ...any) *Error {
	return &Error{Status: status, Message: fmt.Sprintf(format, args...)}
}

// ISO formats a time the way JavaScript's toISOString does.
func ISO(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// ParseISO reads a time written by ISO (or any RFC 3339 time).
func ParseISO(s string) time.Time {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return time.Time{}
	}
	return t
}

func ptr(s string) *string        { return &s }
func is(p *string, v string) bool { return p != nil && *p == v }

// Settle applies time-based transitions, whenever a row is read.
func Settle(t Txn, now time.Time) Txn {
	if t.Kind != CardPayment || t.Status != Pending {
		return t
	}
	if t.OtpSharedAt == nil && now.Sub(ParseISO(t.RequestedAt)) > OTPTTL {
		t.Status = Expired
		return t
	}
	if is(t.BorrowerResult, "success") && t.LenderEvidence == nil && t.OtpSharedAt != nil && now.Sub(ParseISO(*t.OtpSharedAt)) > AutoConfirm {
		t.Status = Confirmed
		t.ConfirmedAt = ptr(ISO(now))
	}
	return t
}

func requirePending(t Txn) error {
	if t.Status != Pending {
		return Fail(409, "This transaction is already %s.", t.Status)
	}
	return nil
}

func ShareOTP(t Txn, actor string, now time.Time) (Txn, error) {
	if t.LenderID != actor {
		return t, Fail(403, "Only the card owner can share the OTP.")
	}
	if err := requirePending(t); err != nil {
		return t, err
	}
	if t.OtpSharedAt != nil {
		return t, Fail(409, "The OTP was already shared.")
	}
	t.OtpSharedAt = ptr(ISO(now))
	return t, nil
}

func Decline(t Txn, actor string) (Txn, error) {
	if t.LenderID != actor {
		return t, Fail(403, "Only the card owner can decline.")
	}
	if err := requirePending(t); err != nil {
		return t, err
	}
	t.Status = Expired
	return t, nil
}

func BorrowerResult(t Txn, actor, outcome string, now time.Time) (Txn, error) {
	if t.BorrowerID != actor {
		return t, Fail(403, "Only the person who paid can report the result.")
	}
	if err := requirePending(t); err != nil {
		return t, err
	}
	if t.OtpSharedAt == nil {
		return t, Fail(409, "No OTP has been shared yet.")
	}
	t.BorrowerResult = ptr(outcome)
	return resolve(t, now), nil
}

func LenderEvidence(t Txn, actor, evidence string, now time.Time) (Txn, error) {
	if t.LenderID != actor {
		return t, Fail(403, "Only the card owner can confirm the charge.")
	}
	if err := requirePending(t); err != nil {
		return t, err
	}
	if t.OtpSharedAt == nil {
		return t, Fail(409, "No OTP has been shared yet.")
	}
	t.LenderEvidence = ptr(evidence)
	return resolve(t, now), nil
}

// resolve decides the outcome once both sides (or one) have spoken.
func resolve(t Txn, now time.Time) Txn {
	charged := is(t.LenderEvidence, "sms_match") || is(t.LenderEvidence, "manual")
	objected := is(t.LenderEvidence, "objected")
	switch {
	case is(t.BorrowerResult, "success") && charged:
		t.Status = Confirmed
		t.ConfirmedAt = ptr(ISO(now))
	case is(t.BorrowerResult, "success") && objected:
		t.Status = Disputed
	case is(t.BorrowerResult, "failed") && charged:
		t.Status = Disputed
	case is(t.BorrowerResult, "failed"):
		t.Status = Expired
	case objected && t.BorrowerResult == nil:
		t.Status = Expired
	}
	return t
}

func Dispute(t Txn, actor string) (Txn, error) {
	if t.LenderID != actor && t.BorrowerID != actor {
		return t, Fail(403, "Not your transaction.")
	}
	if t.Status == Expired {
		return t, Fail(409, "Nothing was recorded for this transaction.")
	}
	t.Status = Disputed
	return t, nil
}

func ConfirmRepayment(t Txn, actor string, now time.Time) (Txn, error) {
	if t.Kind != Repayment {
		return t, Fail(400, "Not a repayment.")
	}
	if t.LenderID != actor && t.BorrowerID != actor {
		return t, Fail(403, "Not your repayment.")
	}
	if t.CreatedBy == actor {
		return t, Fail(403, "The other person confirms a repayment you recorded.")
	}
	if err := requirePending(t); err != nil {
		return t, err
	}
	t.Status = Confirmed
	t.ConfirmedAt = ptr(ISO(now))
	return t, nil
}
