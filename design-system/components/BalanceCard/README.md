# BalanceCard

A friend and the net between you, with one action.

- The consumer provides `name` and `netMinor` (positive: they owe you; negative: you owe them; 0: all settled) and `onAction`.
- The action follows the direction: "Remind" when they owe you, "Settle up" when you owe them, none when even. Override with `actionLabel`.
- The net is computed on the device from the ledger; the server never stores balances.
