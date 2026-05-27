# Release Checklist

## Preflight

- Confirm `.env` is present locally and secrets are not committed.
- Run `npm ci` after dependency changes.
- Run `npm run db:generate`.
- Run `npm run db:deploy` against the target database.
- Run `npm run db:seed` only for demo or fresh MVP environments.

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run build:static
npm audit
```

## Runtime Checks

- Open `/api/health` and confirm `ok: true`, `database: "ok"` and `seeded: true`.
- Open `/` and verify dashboard metrics, charts and recommendations render.
- Open `/transactions` and add, edit and delete a test operation.
- Open `/import` and verify CSV preview, backup export and backup restore.
- Open `/investments` and verify the disclaimer, watchlist, portfolio, sector structure and market refresh.

## Web Deploy

- Set `NEXT_PUBLIC_APP_PLATFORM=web`.
- Set `NEXT_PUBLIC_API_MODE=cloud`.
- Set `NEXT_PUBLIC_API_BASE_URL=/api` or the deployed API URL.
- Run database migrations before routing traffic to the new build.

## Android Shell

- Run `npm run build:static`.
- Run `npm run cap:sync`.
- Build APK from Android Studio or Gradle.
- Use cloud API mode for production Android until local sync is implemented.

## Windows Desktop Shell

- Run `npm run build:static`.
- Run `npm run tauri:build`.
- Find installers in `src-tauri/target/release/bundle/`.
- Use cloud mode for server-backed data or local mode for the prepared local storage shell.

## Security

- Do not store banking logins or passwords.
- Do not add screen scraping for banking data.
- Future banking tokens must use encrypted storage or OS keychain facilities.
- Investment text must stay analytical and educational, with the disclaimer visible.
