# StatusBadge

The state of a transaction or a share, as a word plus a glyph — colour is never the only signal.

| status | means | colours |
| --- | --- | --- |
| `pending` ○ | OTP shared, bank result not in yet | `brass-ink` on `brass-soft` |
| `confirmed` ● | payment succeeded, both ledgers updated | `lent` on `lent-soft` |
| `settled` ✓ | paid back, marked by both people | `vault` on `vault-soft` |
| `disputed` ! | one side reported a problem — admin queue | `danger` on `danger-soft` |
| `expired` – | OTP timed out or declined; nothing recorded | `ink-muted` on `surface-sunken` |
| `shared` ↗ | a card currently shared with someone | `vault` on `vault-soft` |

The consumer provides `status`; `children` overrides the word only for a more specific one ("Shared · 6 days left").
