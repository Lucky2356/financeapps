# Desktop: подпись и авто-обновление (D4)

Сейчас в приложении реализован **ручной путь обновления**: Настройки → «Проверить
обновления» открывает страницу релизов GitHub, откуда можно скачать свежий
установщик. Полные «бесшумная» авто-установка и снятие предупреждения SmartScreen
требуют секретов, которые принадлежат владельцу проекта. Ниже — что нужно сделать,
чтобы их включить.

## 1. Code signing (убрать предупреждение SmartScreen)

Неподписанный `.exe` вызывает предупреждение Windows SmartScreen. Чтобы его убрать:

1. Приобрести сертификат для подписи кода (OV или, лучше, EV — EV сразу снимает
   предупреждение SmartScreen). Поставщики: DigiCert, Sectigo, GlobalSign и др.
2. Добавить в `tauri.conf.json` секцию `bundle.windows.certificateThumbprint`
   (или использовать переменные окружения подписи) и подписать установщик в
   release-workflow через `signtool`/встроенную поддержку Tauri.
3. Хранить сертификат/пароль как секреты GitHub Actions, не в репозитории.

Без сертификата подпись невозможна — это платный артефакт, выдаваемый владельцу.

## 2. Авто-обновление (Tauri Updater)

1. Сгенерировать пару ключей апдейтера:
   ```
   npx tauri signer generate -w ~/.tauri/financeapps.key
   ```
   Публичный ключ можно коммитить, приватный — **только** секрет.
2. В `tauri.conf.json` включить плагин updater:
   ```jsonc
   "plugins": {
     "updater": {
       "pubkey": "<ПУБЛИЧНЫЙ_КЛЮЧ>",
       "endpoints": ["https://github.com/Lucky2356/financeapps/releases/latest/download/latest.json"]
     }
   },
   "bundle": { "createUpdaterArtifacts": true }
   ```
   и установить плагины: `npm i @tauri-apps/plugin-updater @tauri-apps/plugin-process`
   + `cargo add tauri-plugin-updater` в `src-tauri`, зарегистрировать в `lib.rs`.
3. В release-workflow ([desktop-release.yml](../.github/workflows/desktop-release.yml))
   передать приватный ключ как env при сборке:
   ```yaml
   env:
     TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
     TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
   ```
   Tauri тогда сгенерирует `latest.json` + `.sig` и приложит их к релизу
   (шаг публикации уже использует `softprops/action-gh-release`).
4. В приложении добавить проверку через `@tauri-apps/plugin-updater` (check →
   downloadAndInstall) — кнопку «Проверить обновления» можно переключить с
   открытия страницы релизов на встроенную установку.

> Плагин updater намеренно не добавлен в сборку, пока нет ключей: без корректного
> `pubkey`/подписи это сломало бы `tauri build`. После генерации ключей включение —
> по шагам выше.
