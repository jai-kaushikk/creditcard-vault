# CreditCard

The card face — the one physical-looking object in the app, and the only thing with a shadow (`shadow-card`).

- The consumer provides `nickname` (the user's own name for it: "HDFC Millennia"), `network`, `last4`, `expiry`, `face`, and for sharing `sharedWith` (owner view) or `sharedBy` (friend's view).
- Masked by default: `•••• •••• •••• 4821`. Pass `revealed` + `number` only right after a successful biometric prompt, and re-mask after 30 seconds or when the app backgrounds. The number comes from the device vault, never the network.
- Faces (`card-onyx`, `card-jade`, `card-brass`, `card-slate`) are the same in both themes. The user picks one when adding a card; it is not the bank's art.
- Networks are set as words ("Visa", "RuPay"), never redrawn logos.
- 320px wide on phones (ISO ratio 1.586, `radius-md` corners); `compact` (240px) in pickers and share sheets.
- Do not put amounts, balances or CVV on the face.
