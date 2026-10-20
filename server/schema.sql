-- CardVault keeps accounts (Google email, name and photo, so friends can find
-- each other), friendships and transactions. Card numbers, CVVs and OTPs never
-- reach this database in readable form. The one place they pass through is
-- relay_messages: sealed (end-to-end encrypted) card shares and OTPs waiting
-- for delivery, deleted when fetched and expired after minutes to a day.

create table if not exists accounts (
  id          text primary key,              -- usr_… derived from a hash of the Google subject
  email_hash  text unique not null,          -- HMAC of the lower-cased email, for friend lookup
  public_key  text not null,                 -- X25519 key the phone made; shares are sealed to it
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);
-- Added after launch; filled in on each Google sign-in.
alter table accounts add column if not exists email text;
alter table accounts add column if not exists name text;
alter table accounts add column if not exists photo_url text;
create unique index if not exists accounts_email on accounts (lower(email));

create table if not exists friendships (       -- one row per pair, user_a < user_b
  user_a        text not null references accounts(id),
  user_b        text not null references accounts(id),
  requested_by  text not null references accounts(id),
  status        text not null check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b on friendships (user_b);

create table if not exists invites (           -- "add me on CardVault" links
  code        text primary key,
  from_id     text not null references accounts(id),
  created_at  timestamptz not null,
  expires_at  timestamptz not null
);
create index if not exists invites_from on invites (from_id, expires_at desc);

create table if not exists transactions (
  id               text primary key,
  kind             text not null check (kind in ('card_payment', 'repayment')),
  lender_id        text not null references accounts(id),
  borrower_id      text not null references accounts(id),
  amount_minor     bigint not null check (amount_minor > 0),
  currency         char(3) not null default 'INR',
  merchant         text,
  category         text,
  card_ref         text,                     -- random id from the owner's phone; not the number or last 4
  method           text,
  created_by       text not null references accounts(id),
  status           text not null check (status in ('pending', 'confirmed', 'expired', 'disputed', 'settled')),
  requested_at     timestamptz not null default now(),
  otp_shared_at    timestamptz,
  borrower_result  text,
  lender_evidence  text,
  confirmed_at     timestamptz,
  idempotency_key  text unique not null
);
create index if not exists transactions_lender on transactions (lender_id, requested_at desc);
create index if not exists transactions_borrower on transactions (borrower_id, requested_at desc);

create table if not exists transaction_events (   -- append-only audit trail
  id              bigserial primary key,
  transaction_id  text not null references transactions(id),
  actor           text not null,
  type            text not null,
  at              timestamptz not null default now(),
  meta            jsonb not null default '{}'
);
create index if not exists transaction_events_txn on transaction_events (transaction_id, at);

create table if not exists relay_messages (     -- sealed, short-lived, deleted on delivery
  id          uuid primary key,
  to_id       text not null,
  from_id     text not null,
  kind        text not null check (kind in ('card_share', 'card_unshare', 'otp')),
  txn_id      text,
  payload     jsonb not null,                 -- {epk, nonce, box}: ciphertext only the recipient can open
  sent_at     timestamptz not null,
  expires_at  timestamptz not null
);
create index if not exists relay_messages_to on relay_messages (to_id, expires_at);
