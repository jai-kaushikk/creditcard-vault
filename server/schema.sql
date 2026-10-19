-- CardVault keeps transactions only. Card numbers, CVVs, OTPs, names and
-- balances never reach this database.

create table if not exists accounts (
  id          text primary key,              -- usr_… derived from a hash of the Google subject
  email_hash  text unique not null,          -- HMAC of the lower-cased email, for friend lookup
  public_key  text not null,                 -- X25519 key the phone made; shares are sealed to it
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

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
