# Release Checklist

## Preflight

- Run `npm ci` after dependency changes.
- Confirm no secrets are committed: the updater key (`financeapps-updater.key`) and the
  Android keystore (`*.jks`, `src-tauri/gen/android/keystore.properties`) stay out of git.

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run test:coverage
npm run build:static
npm audit --omit=dev
```

## Runtime Checks

- Open `/` and verify dashboard metrics, charts and recommendations render.
- Open `/transactions` and add, edit and delete a test operation.
- Open `/import` and verify CSV preview, backup export and backup restore.
- Try restoring an invalid JSON backup and verify the app rejects it without replacing local data.
- Open `/investments` and verify the disclaimer, watchlist, portfolio, sector structure and market refresh.

## Version bump

Four files must agree: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
and the `financial-assistant` entry in `src-tauri/Cargo.lock`. Regenerate `package-lock.json`
with `npm install --package-lock-only`, add the CHANGELOG section, commit, then
`git tag -a vX.Y.Z` and push the tag.

## Windows

- Run `npm run tauri:build`; installers land in `src-tauri/target/release/bundle/`.
- For release automation, run the `Windows Desktop Release` workflow manually or push a `v*` tag —
  it publishes the GitHub Release with the signed installer and `latest.json`.
- After installing the NSIS package, follow the smoke test in `docs/DESKTOP_LOCAL_MODE.md`.

## Android

Nothing to do by hand. The same `v*` tag builds and attaches the APK: the
`Build Android APK` job signs it with the keystore held in GitHub secrets,
refuses to publish if the certificate is not the one already on the phone, and
checks that the manifest's links actually resolve. See `docs/ANDROID.md`,
«Сборка в GitHub Actions», for the four secrets it reads.

Building locally is still possible and unchanged (`npm run android:build`), but
it is now the fallback, not the route.

- After the workflow finishes, install the APK on a phone and check: the header
  clears the status bar, the bottom bar clears the gesture area, a backup
  exported on the PC restores here, and a backup exported here restores on the PC.

## Security

- Do not store banking logins or passwords.
- Do not add screen scraping for banking data.
- Future banking tokens must use encrypted storage or OS keychain facilities.
- Investment text must stay analytical and educational, with the disclaimer visible.
