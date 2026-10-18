# Admin dashboard

A web app for the CardVault team to watch transaction health, resolve disputes and stop abuse. It sees **only what the database holds**: transactions, their events and pseudonymous accounts. It has no screen, column or export for card data or OTPs, because the server never has them.

## Pages

| page | shows | actions |
| --- | --- | --- |
| **Overview** | `StatTile` row (transactions today, value recorded, OTP-share → success rate, open disputes), live recent transactions, open risk flags | jump to any queue |
| **Transactions** | `DataTable` of every transaction, filterable by status, kind, amount range, date and account | open the detail with its full event timeline |
| **Disputes** | queue of `disputed` rows with both sides' claims and evidence type (`sms_match` / manual) | resolve as confirmed, expired or settled, with a required note |
| **Risk flags** | rule hits: velocity (OTP requests per hour), amount over the review line, a new friend pair with a large first payment, repeated disagreements | dismiss, suspend an account, lower a user's limits |
| **Users** | accounts by id: status, created date, counts as lender and borrower, dispute rate | suspend or reinstate; reveal the phone hash match only with a stated reason |
| **Audit log** | every admin action and system transition (`transaction_events`), dense table | export |

## Rules

- IDs show as `usr_…` / `txn_…` in `mono`. Amounts are right-aligned, with lakh/crore short forms in tiles and full values in tables.
- Every status uses `StatusBadge` with its word. Deltas use arrows and words; colour is never the only signal.
- Roles: **viewer** (read), **support** (resolve disputes), **risk** (flags, suspensions), **admin** (roles, settings). Sign-in uses SSO with 2FA, sessions last 12 hours, and access is limited by IP allow-list.
- Every write needs a reason and lands in the audit log. Bulk actions need a second admin's approval.
- Same tokens and both themes as the apps. `surface` for the page, `surface-raised` panels with a `line` border, `radius-lg` tiles, `radius-md` tables. The page is 1280px+ with a 232px sidebar.
