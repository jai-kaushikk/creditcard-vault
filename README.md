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
server/         Go API: accounts, friendships and transactions; relays sealed card shares and OTPs. Also serves the web app
design-system/  CardVault design system: tokens, components, product and architecture specs
.github/        CI: tests, then the server + web deploy and the APK build and release
```

## Setup

### 1. Google sign-in (Google Cloud Console)

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) and set up the **OAuth consent screen** (External; add yourself and friends as test users while in testing).
2. **Clients → Create client → Web application.** Add the web app's address under **Authorized JavaScript origins**. Copy its client ID (`….apps.googleusercontent.com`). Both the Android app and the web app use this one.
3. **Create credentials → OAuth client ID → Android** with
   - package name `app.cardvault`
   - SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (the key the CI builds are signed with until you add your own; see section 3).
4. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` at the top of `.github/workflows/android.yml` to the web client ID from step 2.
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

Local run: `cd server && STORE=memory GOOGLE_WEB_CLIENT_ID=… SESSION_SECRET=… WEB_DIR=../app/dist go run ./cmd/server`.

### 3. Play Store bundle (private)

The public APK stays signed with the standard React Native debug key, so testers' installs keep updating and Google sign-in keeps its SHA-1. For the Play Store, CI also builds an **Android App Bundle (.aab)** signed with your own **upload key**, and puts it in a **private** Cloud Storage bucket, never in the public release:

1. Once, in Google Cloud Shell: `curl -fsSLO https://raw.githubusercontent.com/jai-kaushikk/creditcard-vault/claude/exciting-edison-pqekky/scripts/setup-play-signing.sh && bash setup-play-signing.sh` (read it first; it's short). It generates the upload key in your project's Secret Manager, gives CI read access to just that key, and creates the private bucket `project-1ca83d7c-09d0-46ec-800-cardvault-releases`.
2. Every build after that drops `CardVault-<version>-build<N>.aab` in the bucket. Download it from Cloud Console → Cloud Storage → that bucket.
3. In Play Console, upload it to a testing track and keep **Play App Signing** on (the default). Google then signs installs with its own app signing key: add that key's SHA-1 (Play Console → Test and release → App integrity) to a new Android OAuth client for `app.cardvault`, or Google sign-in fails for Play installs.

## How it works

1. **Add a card.** The number, expiry and optional CVV are stored in the Android Keystore / iOS Keychain-backed secure store on that phone only.
2. **Share it.** The card is encrypted on your phone to your friend's public key (X25519 + XSalsa20-Poly1305, `tweetnacl`) and relayed once by the server, which can't read it.
3. **Friend pays.** They copy the details at checkout and tap *Ask for the OTP* with the amount and merchant. You get the request, type or paste the OTP your bank texted you, and it goes to them sealed, shown once.
4. **Recorded only on success.** They report the result and you confirm the charge. Then the transaction is *confirmed*: +lent for you, −owed for them. If you disagree, it becomes *disputed*. If nobody shares an OTP within 3 minutes, it *expires* and nothing is recorded.
5. **Settle up** by recording a repayment (UPI, cash…). The other person confirms it.

**Friends** connect both ways, and live on the server so the app and the web version see the same list. Find someone already on CardVault by typing their name or email (suggestions appear as you type; strangers' emails are partly hidden), send a request and they accept it, or share your invite link (`…/invite/<code>`, valid 14 days). On Android with the app installed the link opens the app; otherwise it offers the APK download or the web version. Cards and OTP requests only go between accepted friends, and the server enforces that.

**Notifications:** OTP requests, OTPs arriving, friend requests and recorded payments show as a banner in the app, in the bell list, and as system notifications while the app is open or recently backgrounded.

The server's database holds `accounts` (your Google email, name and photo, so friends can find and recognise you, plus your phone's public key), `friendships` (requests and accepted friends), `invites` (invite link codes, 14 days), `transactions` and an append-only `transaction_events` audit log. No card data, OTPs or balances. Sealed card shares and OTPs wait in `relay_messages` as ciphertext only the recipient's phone can open, and are deleted when fetched or when they expire.

## Development

```bash
cd app && npm ci
npm run typecheck && npx expo lint && npm test
npx expo prebuild --platform android   # generates android/ (git-ignored)

cd server && go vet ./... && go test ./...   # TEST_DATABASE_URL=… (and -p 1) to run against Postgres
```

## Known limits in this version

- **Android only for downloads.** The same code builds for iOS, but installing it needs an Apple developer account (TestFlight / EAS). Until then iPhones use the browser version.
- **OTP entry is paste-based:** the owner copies the bank SMS and CardVault picks out the OTP and checks the amount (on Android it fills in as soon as you come back to the app). Reading the SMS with one tap (Android SMS User Consent) is a next step. iOS doesn't allow it at all.
- **Notifications need the app running:** updates arrive by polling (every 4 s in front, 20 s in the background). Once Android closes the app, nothing arrives until it's opened. Real push needs Firebase Cloud Messaging, which is the next step.
- The admin dashboard is designed (`design-system/03-admin.md`) but not built yet.

## Privacy

Card details never leave the phone unencrypted, and the server can't read them. OTPs and card shares are end-to-end encrypted and kept only until delivered: at most 5 minutes for OTPs and 24 hours for shares.

**Before launch:** most card-issuer terms make the cardholder liable for, and often prohibit, letting someone else use their card or sharing an OTP. Get legal review for each market.
