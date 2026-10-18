# Button

One primary button per screen, for the thing the screen is for; everything else is secondary or quiet.

- **primary** — `vault` fill, `on-vault` label. "Share OTP with Rahul", "Share card", "Add card".
- **secondary** (default) — `surface-raised` with a `line-strong` border. "Remind", "Settle up".
- **quiet** — text only in `vault`. "Decline", "Not now".
- **danger** — `danger` text with a `line-strong` border. Only for destroying or revoking: "Delete card", "Stop sharing", "Report a problem".
- **glass** — a liquid-glass pill (`glass-fill`, `blur-glass`, `shadow-glass`) for controls that float over content: back, card camera, filter. Never in a form or a sheet; never for the primary action.
- `size="sm"` (36px) inside rows and tiles; default 48px everywhere a thumb lands. `block` in sheets and sticky footers.

The consumer provides the label (verb first, sentence case, name the person when there is one) and `onClick`. Never put an amount alone on a button — "Settle ₹3,150 with Rahul", not "₹3,150".
