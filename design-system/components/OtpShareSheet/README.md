# OtpShareSheet

The bottom sheet the card owner sees when a friend paying with their card triggers an OTP — the heart of the app.

States, in order:

1. **request** — the OTP arrived on the owner's phone and matches an open request from the friend. Shows the OTP (`otp` style, split 3+3), a countdown (`brass` bar, default 180s), merchant/amount/card, and two choices: **Share OTP with Rahul** (primary) or **Decline** (quiet).
2. **shared** — the OTP went to the friend, end-to-end encrypted. Nothing is recorded yet: "Waiting for the bank to confirm the payment." One way out: **Report a problem**.
3. **success** — the friend's app reported success (and, on Android, the bank's debit SMS matched). The amount is written to both ledgers: lent on the owner's, owed on the friend's.

The consumer provides `requester`, `merchant`, `minor`, `cardName`, `cardLast4`, `otp`, `expiresIn` (ticked by the app), and the callbacks. Show it over a `scrim`. The sheet is strong glass (`glass-fill-strong`, `blur-sheet`, `glass-stroke` rim) so the card beneath shows through softly. Text on it stays at 4.5:1 because the fill is at least 88% opaque. Never show the OTP in a push notification body, and never let the sheet auto-share.
