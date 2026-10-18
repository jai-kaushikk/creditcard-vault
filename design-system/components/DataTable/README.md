# DataTable

The admin dashboard's table for transactions, disputes, users and the audit log.

- The consumer provides `columns` (`key`, `label`, `align: 'right'` for numbers and money, `mono` for IDs, optional `render`) and `rows`. `dense` for the audit log.
- IDs are pseudonymous (`usr_8f2a…`, `txn_…`) in `mono`. Amounts right-aligned with tabular numerals. Status uses `StatusBadge`.
- There is no column for card numbers, OTPs or card nicknames because the server never has them.
