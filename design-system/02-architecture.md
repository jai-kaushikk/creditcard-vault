# Architecture and data

**Rule: the server's database holds transactions. Everything else (cards, CVVs, OTPs, nicknames, friends' display names, balances) lives on the user's phone.**

## Where each thing lives

| data | where | how |
| --- | --- | --- |
| Card number, expiry, CVV, nickname, face | owner's phone (and the borrower's phone while shared) | `expo-secure-store` (iOS Keychain / Android Keystore), this-device-only, behind the app's biometric lock |
| OTP | owner's phone, then the borrower's phone for one view | never written to disk; end-to-end encrypted in transit |
| Shared-card payload, OTP in transit | PostgreSQL `relay_messages`, ciphertext only | sealed to the recipient's public key; 5-minute TTL for OTPs, 24-hour for card shares; deleted on delivery |
| Transactions and their events | **PostgreSQL** | the only business data on the server |
| Account identity | PostgreSQL `accounts` | an id derived from the Google account, the Google email, name and photo (so friends can find and recognise each other), an HMAC of the email for lookup, the public key |
| Friendships, invite links | PostgreSQL `friendships`, `invites` | two-way: a request by email that the other person accepts, or an invite link (14 days) the other person opens. Sharing and OTP requests are refused between non-friends |
| Balances | phones | computed locally from transactions |

## Sign-in

Google Sign-In on the phone; the server verifies the Google ID token against its web client ID and issues its own session token. Friends find each other by the email they use with Google, or by an invite link that opens the app (Android App Links via `/.well-known/assetlinks.json`) or, without it, offers the APK or the web version. People already on CardVault can also be found by name or email prefix (`POST /v1/users/search`, rate-limited, strangers' emails masked). The implemented schema and API live in `server/` (Go: `schema.sql`, `internal/api`).

## Clients

- **iOS + Android:** one React Native (Expo) codebase with native modules for the Keychain/Keystore, biometrics, `FLAG_SECURE`, the camera card scanner and the Android SMS User Consent API. iOS does not let apps read SMS, so there the OTP is pasted, or forwarded by an optional Shortcuts automation.
- **Keys:** each device creates an X25519 key pair on first launch and registers the public key. Shares and OTPs use libsodium sealed boxes. A friend's key fingerprint can be checked in person (QR) to rule out a swapped key.
- **Admin:** a Next.js web app on its own domain, behind SSO with 2FA. It reads only through the admin API.

## Database (PostgreSQL)

```sql
create table accounts (
  id            uuid primary key,
  email_hash    text unique not null,       -- HMAC(lower-cased Google email), for friend lookup
  email         text,                       -- Google email, name and photo, shown to friends
  name          text,
  photo_url     text,
  public_key    bytea not null,
  status        text not null default 'active',  -- active | suspended
  created_at    timestamptz not null default now()
);

create table transactions (
  id               uuid primary key,
  kind             text not null,          -- card_payment | repayment
  lender_id        uuid not null references accounts(id),  -- card owner / who is owed
  borrower_id      uuid not null references accounts(id),
  amount_minor     bigint not null check (amount_minor > 0),
  currency         char(3) not null default 'INR',
  merchant         text,                   -- as typed by the borrower
  category         text,
  card_ref         text,                   -- random id the owner's phone made; not the number, not the last 4
  status           text not null,          -- pending | confirmed | expired | disputed | settled
  borrower_result  text,                   -- success | failed
  lender_evidence  text,                   -- sms_match | manual | none
  requested_at     timestamptz not null default now(),
  otp_shared_at    timestamptz,
  confirmed_at     timestamptz,
  settled_at       timestamptz,
  idempotency_key  text unique not null
);

create table transaction_events (          -- append-only audit trail
  id             bigserial primary key,
  transaction_id uuid not null references transactions(id),
  actor          text not null,            -- account id, 'system' or 'admin:<id>'
  type           text not null,            -- requested | otp_shared | result | confirmed | disputed | resolved | settled
  at             timestamptz not null default now(),
  meta           jsonb not null default '{}'
);
```

## API (mobile)

| call | does |
| --- | --- |
| `POST /v1/transactions` | the borrower requests an OTP: lender, `card_ref`, amount, merchant. Creates a `pending` row and pushes to the lender |
| `POST /v1/transactions/:id/otp` | the lender sends the sealed OTP. Relayed to the borrower, never stored; sets `otp_shared_at` |
| `POST /v1/transactions/:id/result` | the borrower reports success or failure; the lender reports `sms_match` or confirms. The server applies the confirm rule |
| `POST /v1/transactions/:id/dispute` | either side flags a problem |
| `POST /v1/repayments` | records a repayment (kind `repayment`); the other side confirms |
| `GET /v1/transactions?since=` | ledger sync: every row where the caller is lender or borrower |
| `POST /v1/shares` | relays a sealed card share to a friend's mailbox |

All calls require a signed device session. Writes carry an idempotency key. Rate limits: 6 OTP requests per lender per hour by default.

## Security baseline

- TLS with certificate pinning; no secrets in logs or crash reports, and a scrubber drops anything that looks like a PAN or OTP.
- Root/jailbreak detection warns the user; Play Integrity / App Attest gate sign-in.
- Server-side, admin reads go through a separate role that has no write access to `transactions` except `status` via the resolve endpoint, which is audited.

## Decide before building

- **Card and bank rules.** Most issuer terms and card network rules make the cardholder liable for, and often prohibit, letting someone else use their card or sharing an OTP. Get legal review in each market you launch in. Consider an issuer-supported path (add-on or virtual cards) as the long-term model.
- **Storing CVV and full numbers.** This is on-device only, like a password manager, but app-store reviewers and regulators may still ask. Keep CVV optional and off by default when sharing.
- **Data protection.** Emails, names, friend lists and transaction history are personal data. Plan for consent, export and deletion requests (deletion anonymises the account and keeps the other party's ledger intact).
