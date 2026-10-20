# CardVault

A card wallet for friends who lend each other their credit cards. Cards stay encrypted on your phone. You share a card with a friend, approve each payment by sending them the OTP from the app, and every successful payment lands in both ledgers: lent on yours, owed on theirs.

## Download the Android app

**[Latest APK → Releases](https://github.com/jai-kaushikk/creditcard-vault/releases/latest)**

Every push builds a fresh APK in GitHub Actions and attaches it to a release. On your phone: open the release, download `CardVault-….apk`, open it, and allow "Install unknown apps" for your browser when Android asks.

## Use it in a browser (iPhone, desktop)

**[cardvault-api-420358690991.asia-south1.run.app](https://cardvault-api-420358690991.asia-south1.run.app)**

A temporary stand-in until the iOS app is on TestFlight. On an iPhone, open it in Safari and use **Share → Add to Home Screen**. It talks to the same server as the Android app, so friends on Android and on the web can share cards and OTPs with each other.

The browser version is weaker than the app: cards are encrypted with a key the browser won't export (WebCrypto, kept in IndexedDB), but there's no fingerprint or Face ID lock and screenshots aren't blocked. Use it only on your own device. Clearing the site's data in the browser deletes the cards.

For Google sign-in to work there, the web OAuth client needs `https://cardvault-api-420358690991.asia-south1.run.app` under **Authorized JavaScript origins**.

## What needs setting up

What works depends on two settings baked into the build (see [Setup](#setup)):

| | Without setup | With Google sign-in | With Google sign-in + server |
| --- | --- | --- | --- |
| Encrypted card vault, biometric lock, card reveal | ✓ | ✓ | ✓ |
| Demo data to explore every screen | ✓ | ✓ | ✓ |
| Sign in with Google | – | ✓ | ✓ |
| Add friends, share cards, OTP requests, shared ledger | demo only | demo only | ✓ |

## Repository

```
app/            Expo (React Native) app for Android, iOS and the web
server/         API: stores transactions only; relays sealed card shares and OTPs. Also serves the web app
design-system/  CardVault design system: tokens, components, product and architecture specs
.github/        CI: tests, then the server + web deploy and the APK build and release
```

## Setup

### 1. Google sign-in (Google Cloud Console)

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) and set up the **OAuth consent screen** (External; add yourself and friends as test users while in testing).
2. **Credentials → Create credentials → OAuth client ID → Web application.** Copy its client ID (`….apps.googleusercontent.com`).
3. **Create credentials → OAuth client ID → Android** with
   - package name `app.cardvault`
   - SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (the key the CI builds are signed with until you add your own; see step 4).
4. In this repo: **Settings → Secrets and variables → Actions → Variables → New repository variable** `GOOGLE_WEB_CLIENT_ID` = the web client ID from step 2.
5. Re-run the workflow (**Actions → Test and build APK → Run workflow**). The new APK shows "Continue with Google".

### 2. The server (needed for friends, sharing and OTPs between phones)

**On Google Cloud (set up for this repo):** CI deploys `server/` to Cloud Run (`cardvault-api`, Mumbai) with Cloud SQL Postgres, signing in to GCP with Workload Identity Federation: no service-account keys exist. The deploy runs on every push, and the APK is built against the deployed URL automatically. The GCP identifiers live at the top of `.github/workflows/android.yml`; the database URL and session secret live in Secret Manager (`cardvault-database-url`, `cardvault-session-secret`).

**Anywhere else:** run the Docker image on any host that gives you HTTPS (Render, Railway, Fly.io…) with:

| Env var | Value |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (tables are created on start) |
| `GOOGLE_WEB_CLIENT_ID` | the same web client ID as above |
| `SESSION_SECRET` | 32+ random characters; keep it stable (it also keys the email hashes) |

Then add the repository variable `CARDVAULT_API_URL` = your server's `https://…` URL and re-run the workflow.

Local run: `cd server && npm ci && STORE=memory GOOGLE_WEB_CLIENT_ID=… SESSION_SECRET=… npm run dev`.

### 3. Your own signing key (before the Play Store)

CI signs with the standard React Native debug key so Google sign-in has a stable SHA-1. For a real release, create a keystore and add these repository **secrets**: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Then add that key's SHA-1 to the Android OAuth client too.

## How it works

1. **Add a card.** The number, expiry and optional CVV are stored in the Android Keystore / iOS Keychain-backed secure store on that phone only.
2. **Share it.** The card is encrypted on your phone to your friend's public key (X25519 + XSalsa20-Poly1305, `tweetnacl`) and relayed once by the server, which can't read it.
3. **Friend pays.** They copy the details at checkout and tap *Ask for the OTP* with the amount and merchant. You get the request, type or paste the OTP your bank texted you, and it goes to them sealed, shown once.
4. **Recorded only on success.** They report the result and you confirm the charge. Then the transaction is *confirmed*: +lent for you, −owed for them. If you disagree, it becomes *disputed*. If nobody shares an OTP within 3 minutes, it *expires* and nothing is recorded.
5. **Settle up** by recording a repayment (UPI, cash…). The other person confirms it.

The server's database holds `transactions`, an append-only `transaction_events` audit log, and a minimal `accounts` table (an id derived from a hash of the Google account, an email hash for friend lookup, and the public key). No names, card data, OTPs or balances. Sealed card shares and OTPs wait in `relay_messages` as ciphertext only the recipient's phone can open, and are deleted when fetched or when they expire.

## Development

```bash
cd app && npm ci
npm run typecheck && npx expo lint && npm test
npx expo prebuild --platform android   # generates android/ (git-ignored)

cd server && npm ci && npm run typecheck && npm test   # TEST_DATABASE_URL=… to run against Postgres
```

## Known limits in this version

- **Android only for downloads.** The same code builds for iOS, but installing it needs an Apple developer account (TestFlight / EAS). Until then iPhones use the browser version.
- **OTP entry is manual:** the owner pastes or types it. Reading the bank SMS automatically (Android SMS User Consent) is a next step. iOS doesn't allow it at all.
- **Updates arrive by polling** every few seconds while the app is open. There are no push notifications yet.
- The admin dashboard is designed (`design-system/03-admin.md`) but not built yet.

## Privacy

Card details never leave the phone unencrypted, and the server can't read them. OTPs and card shares are end-to-end encrypted and kept only until delivered: at most 5 minutes for OTPs and 24 hours for shares.

**Before launch:** most card-issuer terms make the cardholder liable for, and often prohibit, letting someone else use their card or sharing an OTP. Get legal review for each market.
