# Desktop Local Mode

The Windows desktop build now defaults to local-first mode:

```bash
npm run build:static
npm run tauri:build
```

`build:static` sets:

```env
NEXT_PUBLIC_APP_PLATFORM=desktop
NEXT_PUBLIC_DESKTOP_DATA_MODE=local
NEXT_PUBLIC_API_MODE=local
NEXT_OUTPUT=export
```

In this mode the packaged Tauri app does not require PostgreSQL or a running Next.js server for core personal-finance workflows.

## Local Storage

Desktop local mode uses IndexedDB through `LocalApiClient`:

- accounts;
- transactions;
- transaction search, pagination, and account-to-account transfers;
- budgets;
- goals;
- recurring transactions;
- settings;
- investment watchlist, portfolio positions, market refresh, and risk analysis using the bundled mock market provider;
- CSV import with duplicate skipping and last-import undo;
- JSON backup and restore with local-state schema validation;
- basic dashboard, forecast, and import reference data.

The local database is stored inside the WebView profile managed by Tauri. Use the app backup feature before reinstalling, resetting app data, or testing destructive flows. Restore accepts only compatible local-mode backup JSON; malformed or incompatible files are rejected before replacing the current state.

## Current Limits

- Investment market data is still mock-oriented; real MOEX ISS integration remains a separate feature.
- Dashboard and analytics are computed locally, but deeper reports are still planned.
- SQLite is still a future hardening step if the app needs external database files, easier migration tooling, or direct inspection outside the WebView.

## Recommended Manual Smoke Test

After installing the NSIS package:

1. Open the app.
2. Create one account with a starting balance.
3. Create one expense and one income transaction.
4. Create a transfer between two accounts and verify both balances changed.
5. Search transactions by description, account, or category.
6. Add a budget limit for a category.
7. Add a saving goal.
8. Add a recurring transaction and materialize it when due.
9. Export a backup JSON.
10. Import a small CSV file, import it again, and verify duplicates are skipped.
11. Use "Undo last import" and verify imported rows are removed and balances are restored.
12. Open Investments, refresh market data, add one watchlist item, add one portfolio position, and remove it.
13. Close and reopen the app; local data should still be present.
