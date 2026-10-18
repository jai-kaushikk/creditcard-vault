# AmountText

Money, in the ledger's two colours: `lent` (blue, "+", owed to you) and `owe` (orange, "−", you owe).

- The consumer provides `minor` (integer paise/cents — never floats), `currency` (default INR, Indian digit grouping) and `direction` from the **viewer's** side: the same transaction is `lent` on the owner's phone and `owe` on the friend's.
- Sizes: `sm` 15px in rows, `md` 20px in balance cards, `lg` 32px on a ledger header, `xl` 40px for the one hero number.
- Every amount carries words for screen readers ("₹2,400 owed to you"). Where a visible label already says "owes you", pass `signed={false}`.
- Blue/orange were chosen over green/red so colour-blind users can tell them apart, and the sign + label carry the meaning anyway. Never use `danger` for money you owe — owing a friend is not an error.
