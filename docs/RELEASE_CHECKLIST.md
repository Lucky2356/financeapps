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

## What the automated tests do not cover

Every e2e scenario runs against the static shell in Chromium. Nothing exercises the
built Tauri app, so four things ship unverified by CI: the filesystem plugin, the
native dialogs, the updater, and the CSP as WebView2 actually enforces it. A break in
any of them looks exactly like a green build.

Closing that properly means driving the packaged app from a Windows runner — worth it
for a wider audience, not for this one. Until then it is a known risk paid down by
hand: after installing a release, open the app once and check the four seams.

- Import a CSV — the file dialog opens and the rows land.
- Export a backup — the save dialog opens and the file appears where it was put.
- Open the releases link from settings — the browser opens on the pinned URL.
- Check for updates — the answer is "you are up to date", not an error.

Five minutes, and it covers precisely what the suite cannot reach.

## Version bump

Four files must agree: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
and the `financial-assistant` entry in `src-tauri/Cargo.lock`. Regenerate `package-lock.json`
with `npm install --package-lock-only`, add the CHANGELOG section, commit, then
`git tag -a vX.Y.Z` and push the tag.

This no longer rests on remembering. `scripts/verify-release-version.mjs` reads all four
and refuses a disagreement; `npm run test` runs it against the repository on every pull
request, and the release workflow runs it again with the tag before the build starts —
`node scripts/verify-release-version.mjs vX.Y.Z` is the same check you can run by hand.
The reason it is a gate: `latest.json` takes its version from the tag and the app takes
its own from `package.json`, so a forgotten bump publishes green and then offers every
PC and phone the same update forever, since installing it changes nothing.

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
