CardVault is a card wallet for friends who lend each other their credit cards. Cards live encrypted on your phone; you share a card with a friend, approve each payment by sharing the OTP from the app, and every successful payment lands in both of your ledgers: lent on yours, owed on theirs. The same system dresses the iOS app, the Android app and the admin web dashboard.

## Content fundamentals

- **Talk like a friend who's careful with money.** Plain, warm and exact. "Rahul owes you ₹2,400", never "Outstanding receivable: INR 2400.00".
- **Name the person, the amount and the card** in every money moment: "Share OTP with Rahul", "₹2,400 at Amazon on HDFC Millennia ••4821".
- **Second person, sentence case, no exclamation marks, no emoji.** Buttons start with a verb: "Share card", "Settle up", "Remind", "Mark as paid".
- **Say what did and didn't happen.** "Nothing is recorded until the payment succeeds." "Card details are encrypted to Rahul's phone. Our servers never store them."
- **Owing a friend is not an error.** Never use alarm words or `danger` for a debt. Reserve "failed", "blocked" and red for real failures.
- Money: integer minor units in code, `₹` with Indian grouping (₹1,20,000) for INR. Short forms (₹18.6L) only in the admin dashboard.
- Cards are always `•••• 4821` or `••4821` in text. Never print a full number, CVV or OTP in a notification, a log, an analytics event or a screenshot.

## Visual foundations

**Colour.** The ground is warm paper (`surface`) in light and near-black green in dark, with `surface-raised` for sheets and groups and `surface-sunken` for wells. `vault` green is the brand and the primary action (`on-vault` for its label); `brass` is the vault-hardware accent: the card chip, the OTP countdown and cover blocks, as a fill only. Money has its own pair, chosen to stay distinct for colour-blind users: `lent` blue for money owed to you, `owe` orange for money you owe. Each comes with a `-soft` tint and is always paired with a sign (+ / −) and words ("owes you" / "you owe"). `danger` is only for destructive actions and disputes. Text is `ink`, or `ink-muted` for metadata. Every text token holds 4.5:1 on the grounds its note names, in both themes.

**Card faces.** `card-onyx`, `card-jade`, `card-brass` and `card-slate` are the same in both themes, with `on-card` / `on-card-muted` text and `card-tag` for the "Shared with" pill. The user picks one when adding a card; we never reproduce a bank's art or a network's logo.

**Type.** Schibsted Grotesk for everything (`display-xl` 40, `display` 32, `title` 20, `headline` 17, `body` 15, `label` 13, `caption` 12). IBM Plex Mono only for `card-number` (groups of four) and `otp` (split 3 + 3). Amounts use the sans with tabular numerals. Both are hosted Google faces (`components/bundle.css` imports them); bundle them in the apps.

**Space and shape.** A 4px base: `space-1` to `space-7` (4, 8, 12, 16, 24, 32, 48). Mobile screens use a `space-4` gutter, sheets `space-5`. Use `radius-md` (12) for buttons, panels and card faces (the ISO card corner at 320px), `radius-lg` (20) for sheet tops and admin tiles, `radius-sm` (6) for small controls and the chip, and `radius-pill` for badges, avatars and chips.

**Glass (Liquid Glass style, iOS and Android).** Chrome is glass and content is solid. The navigation and controls that float over content are translucent glass: the `TabBar` pill, nav and back buttons (`Button variant="glass"`), the Face ID chip and bottom sheets. Lists, balance cards, ledger rows and card faces are never glass, so money and card numbers always sit on an opaque ground. The recipe is `glass-fill` with `backdrop-filter: blur(var(--blur-glass)) saturate(180%)`, a 1px `glass-stroke` rim, an inset 1px `glass-highlight` along the top edge, and `shadow-glass`. Sheets and menus use `glass-fill-strong` with `blur-sheet`. A selected or pressed state is a `glass-tint` lens with `vault` text. Fills are at least 72% opaque, so `ink` and `ink-muted` keep 4.5:1 whatever scrolls beneath. On iOS 26+ use the system Liquid Glass materials (tab bar, `.glassEffect()`) with these colours. On Android 12+ use `RenderEffect` blur; on older Android, or with Reduce Transparency on, fall back to solid `surface-raised` with the same shape and shadow.

**Elevation.** Flat by default; rows and sections are separated by `line`. Shadows belong to card faces (`shadow-card`), glass chrome (`shadow-glass`) and bottom sheets (`shadow-sheet`, over `scrim`).

**Controls.** Touch targets are at least 44px (buttons 48, small 36 inside a 44 row). Control edges use `line-strong` (3:1). Focus is a solid 2px `focus` ring, offset 2px, on every surface and card face. Disabled is 45% opacity and never the only signal.

**Motion.** Short and physical: cards slide up 200ms ease-out when revealed, sheets rise 240ms. The OTP countdown bar runs linear. Respect Reduce Motion: cross-fade instead.

## Security UX rules

- Unlock the app with Face ID / fingerprint / device PIN on open and after 60 seconds in the background. Reveal a full card number only after a fresh biometric check, and re-mask it after 30 seconds.
- Block screenshots and screen recording (`FLAG_SECURE`; iOS blurs on capture) on card detail, share and OTP screens, and blur the app-switcher snapshot.
- OTP push notifications say "Rahul needs an OTP for ₹2,400 at Amazon" and nothing more. The OTP shows only inside the unlocked app.
- Every share and every OTP is an explicit tap by the owner. Never auto-share.

## Iconography

Line icons, 1.75px stroke, round caps and joins, on a 24px grid at 20 or 24px, in `currentColor`. Use Lucide in the apps; no brand icon set has been drawn yet. No emoji, and no network or bank logos: networks are set as words on the card face. There is no CardVault logo yet, so set the name in Schibsted Grotesk 700.

## Using this system

Components ship in `components/bundle.js` as `window.CardVault` (React 18) with `components/bundle.css`. They are the web reference for the admin dashboard and the spec for the native apps. Rebuild them in React Native (or SwiftUI / Compose) with the same tokens, names and states. The sections below cover the product flows, the data architecture and the admin dashboard.
