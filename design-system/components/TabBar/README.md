# TabBar

The app's main navigation: a floating liquid-glass pill that content scrolls under, on both iOS and Android.

- The consumer provides `active` and `onChange`; `items` defaults to Vault, Friends, Ledger, Settings (each `id` picks its icon).
- Float it `space-4` above the bottom safe area with `space-4` side insets. Pad the scroll view's bottom so the last row can clear it.
- Material: `glass-fill` + `blur-glass` (saturate 180%), a `glass-stroke` rim, a `glass-highlight` top edge, `shadow-glass`. The selected tab is a `glass-tint` lens with `vault` text and icon; the others are `ink-muted`.
- iOS 26+: use the system tab bar (`.tabViewStyle` / UITabBar), which renders Liquid Glass natively, and keep these colours. Android 12+: `RenderEffect.createBlurEffect` behind the bar. Older Android, or Reduce Transparency: a solid `surface-raised` pill with the same shape and shadow.
- Labels always show. Icons are never the only label.
