# LedgerRow

One transaction in a ledger list: who, where, which card, how much, and its state.

- The consumer provides `name` (the other person), `merchant`, `cardLast4`, `minor`, `direction` from the viewer's side, `status` and a pre-formatted `time`.
- Wrap rows in a `div.cv-ledger` with `role="list"` (a `surface-raised` group with `radius-md`).
- Newest first; group by day with a `caption`-style header. Tapping a row opens its detail (amount, card, OTP time, both confirmations, dispute action).
- Rows only appear once the bank confirmed the payment (or as `pending` for the few minutes before); expired requests are hidden after 24 hours.
