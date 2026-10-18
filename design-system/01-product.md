# Product and flows

Two people appear in every flow: the **owner** (whose card it is) and the **borrower** (the friend paying with it). The same person can be the owner of one card and the borrower of another.

## Navigation (mobile)

Four tabs: **Vault** (cards and the overall balance), **Friends** (one `BalanceCard` per friend), **Ledger** (all transactions, filterable by friend and card), **Settings** (lock, devices, sharing defaults, export). Requests and OTPs arrive as bottom sheets over whatever screen is open.

## 1 · Add a card

1. Scan the card with the camera (on-device OCR) or type the number. The number is Luhn-checked and the network detected.
2. Enter the expiry, an optional CVV and a nickname, and pick a face (`card-onyx` … `card-slate`).
3. Saved encrypted on the phone. Nothing leaves the device. The Vault shows it as a `CreditCard`.

## 2 · Share a card with a friend

1. Card → **Share** → pick a friend (contacts already on CardVault, or invite by link).
2. Set the terms: a **limit per payment**, an **access end date**, and whether to **include CVV**. "Ask me for every OTP" is always on and cannot be turned off, so the owner approves every payment.
3. **Share with Rahul.** The card is encrypted on the owner's phone to Rahul's public key and relayed once. Rahul sees it in his Vault with a "From Aarav" tag.
4. **Stop sharing** deletes Rahul's copy on his next sync and blocks new OTP requests at once. Say plainly that a friend who already saw the number could have written it down.

## 3 · Pay with a friend's card → OTP → ledger

1. **Borrower** at checkout: Vault → the shared card → **Copy details**, then pays on the merchant site. When the bank asks for an OTP, he taps **Request OTP** and enters the amount and merchant (prefilled from the clipboard or the last request).
2. The server creates the transaction as `pending` and pushes to the owner: "Rahul needs an OTP for ₹2,400 at Amazon."
3. **Owner** receives the bank SMS. On Android the app reads it, with one-tap consent, through the SMS User Consent API. On iOS the owner pastes it, or an optional Shortcuts automation forwards OTP messages to the app. The `OtpShareSheet` (state **request**) shows the OTP, the amount and a 3-minute countdown.
4. **Share OTP with Rahul**: encrypted to Rahul's phone, shown to him once, then deleted. Sheet state **shared**. **Decline** or a timeout marks it `expired`, and nothing is recorded.
5. **Result.** Rahul taps "Payment went through" or "It failed". On Android the owner's app also matches the bank's debit SMS (amount and merchant). The transaction becomes `confirmed` only when the payment succeeded:
   - borrower says success **and** (the owner's SMS matches **or** the owner confirms), or
   - borrower says success and the owner doesn't object within 24 hours.
   - If the two sides disagree, it becomes `disputed` and goes to the admin queue.
6. **Recorded.** On confirm, the single transaction row reads as `+₹2,400 lent` on the owner's ledger and `−₹2,400 owed` on the borrower's. Sheet state **success**.

## 4 · Settle up

- From a friend's ledger: **Mark as paid** (full or partial amount, e.g. after a UPI transfer). This creates a repayment transaction that the other person confirms with one tap. Fully repaid card payments turn `settled`.
- **Remind** sends a gentle push: "Aarav reminded you about ₹3,150." Once a day at most.

## States

| status | set when | shown as |
| --- | --- | --- |
| `pending` | OTP requested or shared, result not in | ○ Pending |
| `confirmed` | payment succeeded, per the rule above | ● Confirmed |
| `expired` | declined, timed out (3 min) or failed | – Expired (hidden after 24 h) |
| `disputed` | the two sides disagree, or either reports a problem | ! Disputed |
| `settled` | fully repaid and confirmed by both | ✓ Settled |

## Empty and edge states

- No cards yet: "Your cards stay on this phone. Add one to start." plus **Add card**.
- A request above the share's limit is blocked on the borrower's side before it reaches the owner: "Above Aarav's ₹5,000 limit for this card."
- The owner's phone is offline: the request waits 3 minutes, then expires. The borrower is told to retry or pay another way.
- A new phone: cards don't sync. Offer an encrypted backup file protected by a passphrase, which the user keeps; it is never uploaded to us. Ledgers re-download from the server.
