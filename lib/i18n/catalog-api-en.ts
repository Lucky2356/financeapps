// Словарь направления «api» — английский. Подгружается вместе с основным
// английским (loadLocale в catalog.ts).

import type { Messages } from "@/lib/i18n/catalog";

export const en: Messages = {
  // Суммы и общие отказы записи
  "api.money.range":
    "The amount must be greater than zero and less than {max} billion — otherwise it's a typo, not money.",
  "api.amount.positive": "The amount must be greater than zero.",
  "api.name.tooShort": "The name is too short",
  "api.month.invalid": "Invalid month.",
  "api.year.invalid": "Invalid year.",
  // Счета, операции, переводы
  "api.account.insufficient": "Not enough money in the account.",
  "api.account.notFound": "There's no such account.",
  "api.account.pick": "Choose an account.",
  "api.account.pickActive": "Choose an existing active account.",
  "api.ledger.pickAccountCategory": "Choose an existing account and category.",
  "api.split.minParts": "A split needs at least two parts.",
  "api.split.partInvalid": "Each part needs a category and an amount greater than zero.",
  "api.reconcile.bankNumber": "The bank balance must be a number.",
  "api.transfer.oneGone": "One of the transactions no longer exists.",
  "api.transfer.shape": "A transfer is a charge from one account and a deposit into another.",
  "api.transfer.alreadyLinked": "This transaction is already part of a transfer.",
  "api.transfer.sameAccount": "A transfer is between two different accounts.",
  "api.transfer.amountMismatch": "The charge and deposit amounts don't match.",
  "api.transfer.pickAccounts": "Choose existing active accounts for the transfer.",
  "api.transfer.distinct": "The source and destination accounts must be different.",
  "api.tx.notFound": "Transaction not found — it may have been deleted already.",
  "api.tx.restoreFailed": "Couldn't restore the transaction.",
  "api.tx.restoreOrphan":
    "This transaction's account or category has been deleted — it can't be restored.",
  "api.trash.gone": "This is no longer in the trash.",
  // Категории и правила
  "api.category.pick": "Choose a category.",
  "api.category.pickExisting": "Choose an existing category.",
  "api.category.notFound": "Category not found.",
  "api.category.duplicate": "A category with this name already exists.",
  "api.category.builtIn":
    "A default category can't be deleted — you can rename it, recolor it or change its icon.",
  "api.category.inUse":
    "Can't delete the category: {count} {n:transaction is|transactions are} linked to it.",
  "api.rule.needTextAndCategory": "Enter the text and a category for the rule.",
  // Лимиты, план, цели, долги
  "api.budget.pickExpenseCategory": "Choose an expense category.",
  "api.budget.limitRange": "Enter a limit of zero or more.",
  "api.plan.monthFormat": "Enter the month as YYYY-MM.",
  "api.plan.amountRange": "Enter an amount of zero or more.",
  "api.goal.notEnough": "The goal holds less money than you're withdrawing.",
  "api.goal.notFound": "Goal not found.",
  "api.debt.notFound": "There's no such debt.",
  "api.debt.settled": "This debt is already paid off.",
  "api.debt.pickAccount": "Choose the account you're paying from.",
  "api.debt.noCategory": "There's no expense category to record the payment under.",
  // Инвестиции
  "api.inv.lotPositive": "Enter a quantity and price greater than zero.",
  "api.inv.quantityPositive": "Enter a quantity greater than zero.",
  "api.inv.pricePositive": "Enter an average price greater than zero.",
  "api.inv.sellTooMuch": "The portfolio holds {quantity} {ticker}; you can't sell more.",
  // Кэшбэк, поездки, вычеты, семья
  "api.cashback.pickCard": "Choose a card.",
  "api.cashback.percentRange": "The percentage must be from 0.1 to 100.",
  "api.cashback.limit": "The limit is an amount in rubles, or leave it empty.",
  "api.trip.name": "Name the trip.",
  "api.trip.dates": "Enter the trip dates.",
  "api.trip.endsBeforeStart": "The trip ends before it starts.",
  "api.trip.budget": "The budget is an amount, or zero.",
  "api.deduction.tax": "The tax is an amount in rubles, or leave it empty.",
  "api.family.nameRequired": "What's the member's name?",
  "api.family.duplicate": "There's already a member with this name.",
  "api.family.notFound": "There's no such member.",
  "api.family.dateFormat": "The date must be YYYY-MM-DD.",
  "api.family.pickWho": "Choose who paid whom.",
  "api.family.unknownAction": "Unknown family action.",
  // Таблица и листы
  "api.sheet.monthFormat": "The month must be in YYYY-MM format.",
  "api.sheet.unknownColumnKind": "Unknown column type.",
  "api.sheet.columnName": "The column needs a name.",
  "api.sheet.noColumn": "There's no such column.",
  "api.sheet.goalNumber": "The goal amount must be a number.",
  "api.sheet.nothingToUndo": "Nothing to undo.",
  "api.sheet.nothingToImport": "Nothing to import.",
  "api.sheet.unknownAction": "Unknown sheet action: {action}",
  "api.sheets.name": "The sheet needs a name.",
  "api.sheets.notFound": "There's no such sheet — it may have been deleted on another device.",
  "api.sheets.budgetOnly": "This action is for the budget sheet.",
  "api.sheets.mainUndeletable": "The main sheet can't be deleted — but it can be cleared.",
  "api.sheets.unknownAction": "Unknown sheets action: {action}",
  // Данные, профили, копии
  "api.backup.notBackup":
    "This file doesn't look like an app backup — choose a file saved with “Download a copy”.",
  "api.backup.noSuchCopy": "There's no such copy on this device.",
  "api.clear.noCopy": "There's no copy from before the data was cleared: it's kept for a week.",
  "api.profile.unreadable":
    "Couldn't read the profile “{name}”. Nothing was erased — save a backup and try again.",
  "api.profile.lastOne": "You can't delete the last profile",
  "api.data.newerVersion":
    "The data was saved by a newer version of the app (format {version}). Update the app — an older version can't open it.",
  "api.data.unreadable":
    "Couldn't read the saved data. It hasn't been touched and a copy was set aside — restore from a backup in Settings.",
  "api.data.noCollection": "There's no such section in the data: {name}",
  "api.merge.unreadableProfile": "Couldn't read the entries of the profile “{name}” to merge.",
  "api.merge.unreadable": "Couldn't read the entries to merge.",
  // Фото чеков
  "api.photo.unreadable": "Couldn't read the photo.",
  "api.photo.unreadableRetake": "Couldn't read the photo. Try taking it again.",
  "api.photo.tooLarge": "The photo is too large even after compression.",
  // Поля форм (lib/validations.ts)
  "api.validation.amountPositive": "Enter an amount greater than zero",
  "api.validation.amountNonNegative": "The amount can't be negative",
  "api.validation.category": "Choose a category",
  "api.validation.account": "Choose an account",
  "api.validation.date": "Enter a date",
  "api.validation.fromAccount": "Choose the account to transfer from",
  "api.validation.toAccount": "Choose the account to transfer to",
  "api.validation.name": "Enter a name",
  "api.validation.nextDate": "Enter the next date",
  "api.validation.quantityPositive": "The quantity must be greater than zero",
  "api.validation.pricePositive": "The average price must be greater than zero",
  "api.validation.importTooLarge": "The file is too large to import.",
  "api.validation.color": "Invalid color format",
  // Хранилище
  "api.storage.locked": "The data is locked — enter the password.",
  "api.storage.aborted": "The write was cancelled.",
  "api.storage.rosterUnreadable":
    "Couldn't tell whose data to open: this device's list of people couldn't be read.",
  // Пароль, шкатулка, код восстановления
  "api.vault.exists": "An account has already been set up on this device.",
  "api.vault.passwordSet": "A password is already set — it can only be changed.",
  "api.vault.ownRecords":
    "This device already has its own entries. Connecting will replace them with data from the other device.",
  "api.vault.ownRecordsServer":
    "This device already has its own entries. Connecting to an account on the server will replace the key, and nothing will be able to read them. Export a backup (Data → Backup), clear the data in Settings and connect again — the data will arrive from the server.",
  "api.vault.passwordToConnect": "Enter the app password to connect the device.",
  "api.vault.noPasswordToLock":
    "No password is set — there's nothing to lock with. Set a password first.",
  "api.vault.sealMismatch":
    "Couldn't encrypt the data: what was read back didn't match the original. Nothing was changed — please report this and don't delete anything yourself.",
  "api.vault.passwordSendFailed": "Couldn't send the new password to the service.",
  "api.vault.sharedAccount":
    "“{name}” is already using this same account on this computer. Two people under one name would share data: the service can't tell people at one computer apart. Create a separate account on the service.",
  "api.vault.wrongSecret": "That doesn't work — check the password or recovery code.",
  "api.vault.recoveryWordCount": "The recovery code should have {need} words, but it has {got}.",
  "api.vault.unknownWord": "The word “{word}” isn't in the word list — check how it's spelled.",
  "api.vault.setPassword": "Set a password.",
  "api.vault.setNewPassword": "Set a new password.",
  "api.vault.unknownServerFormat": "The data from the server came in an unknown format.",
  "api.vault.cantDecrypt": "Couldn't read the data — wrong key, or the file is damaged.",
  // Синхронизация
  "api.sync.offline": "No connection to the server.",
  "api.sync.lostLink":
    "The server no longer recognises this device: it was disconnected on another device, or the data on the server was erased. Your entries here are intact — tap “Reconnect” in the “Sync” section.",
  "api.sync.listFailed": "The service won't return the list.",
  "api.sync.pullFailed": "The service won't return the data.",
  "api.sync.pushFailed": "The service won't accept the write.",
  "api.sync.contention": "Couldn't send: other devices are writing at the same time.",
  "api.sync.notEnabled": "Sync isn't turned on on this device.",
  "api.sync.enableFirst": "Turn on sync on this device first.",
  // Синхронизация через папку
  "api.folder.noFile":
    "There's no sync file in the folder. Export the data from another device first.",
  "api.folder.empty": "The sync file contains no data.",
  "api.folder.needPassword": "Set a password for sync.",
  "api.folder.corrupt": "The sync file is damaged.",
  "api.folder.unknownFormat": "Unknown sync file format.",
  "api.folder.wrongPassword": "Wrong password, or the file is damaged.",
  // Подключение устройства по коду
  "api.pair.thisDeviceCode":
    "This code is for connecting THIS device. On the new device, open “Connect to another device” — it will appear there.",
  "api.pair.notCodeNew": "This isn't a connection code. Show the QR code on the new device.",
  "api.pair.notCodeFirst": "This isn't a connection code. Show a new one on the first device.",
  "api.pair.otherService":
    "The new device is connecting to a different service ({theirs}), and this one to {ours}. Choose the same service on the new device.",
  "api.pair.scanOnOld":
    "This QR code is shown by a new device. Scan it on the one that already has the data: Settings → Sync → “Scan the new device's QR code”.",
  "api.pair.oldVersion":
    "This code is from an old version of the app. Update the app on the first device and show a new code.",
  "api.pair.unreadable": "The code from the new device can't be read. Show a new one on it.",
  "api.pair.wrongDevice": "The code doesn't fit this device. Show a new one on the first device.",
  // Учётная запись на службе — запасные фразы приложения
  "api.link.unreachable": "Couldn't reach the service at {address}.",
  "api.link.notService":
    "Something other than the service answers at {address} (code {status}). Check the address and the Caddy proxy settings.",
  "api.link.codeRejected": "The code didn't work.",
  "api.link.noLogin": "The service didn't give a login name for this code.",
  "api.link.passwordMismatch":
    "The password doesn't match the data on this device. Enter the one that opens it.",
  "api.link.registerFailed": "Couldn't create the account.",
  "api.link.badLogin": "Wrong login name or password.",
  "api.link.noSession": "The service didn't let you in: it didn't answer the sign-in.",
  "api.link.inviteOnly":
    "The sync service doesn't accept new members without an invitation. Ask whoever runs the service to open sign-up or give you an invitation.",
  "api.link.enableFailed": "Couldn't turn on sync.",
  "api.link.outdatedPairing":
    "The sync service hasn't been updated to version 2.0 yet. Update it on the server (git pull and restart) — or connect with a login name and password.",
  "api.link.noPairData": "The service didn't return the connection data.",
  "api.link.outdatedRequest":
    "The sync service hasn't been updated yet: this device can't show a code. Scan the code from another device's screen or paste the link.",
  "api.link.requestFailed": "The service didn't open the connection.",
  "api.link.joinFailed": "Connection failed.",
  "api.link.noPairCode": "The service didn't issue a pairing code.",
  "api.link.noDevices": "The service didn't return the device list.",
  "api.link.primaryFailed": "Couldn't make the device primary.",
  "api.link.renameFailed": "Couldn't rename the device.",
  "api.link.removeFailed": "Couldn't remove the device.",
  "api.link.passwordRejected": "The service didn't accept the new password.",
  "api.link.notLinked": "This device isn't connected to the service.",
  // Отказы службы по коду (поле «code» ответа, см. refusal в server/src/auth.ts)
  "api.server.unknown_login":
    "There's no account with this name on this server. Check the name or create a new account.",
  "api.server.bad_vault": "Invalid key vault.",
  "api.server.invite_not_found": "Invitation not found.",
  "api.server.invite_used": "The invitation has already been used.",
  "api.server.login_taken": "This name is already taken.",
  "api.server.login_too_short": "The login name is shorter than three characters.",
  "api.server.login_too_long": "The login name is longer than 64 characters.",
  "api.server.login_bad_chars": "The login name contains invalid characters.",
  "api.server.no_secret": "The sign-in secret is missing.",
  "api.server.bad_secret": "Invalid sign-in secret.",
  "api.server.bad_current_secret": "Invalid previous sign-in secret.",
  "api.server.bad_credentials": "Wrong login name or password.",
  "api.server.auth_required": "Sign-in required.",
  "api.server.admin_required": "An admin pass is required.",
  "api.server.vault_keyless":
    "This account on the service has no password sign-in — there's nothing to change on the service.",
  "api.server.vault_stale_password":
    "The previous password doesn't match the service — it seems it was already changed from another device.",
  "api.server.vault_recovery_mismatch":
    "The recovery code on this device isn't the one on the service.",
  "api.server.vault_race":
    "The password on the service was just changed from another device — try again.",
  "api.server.device_name_empty": "The device name is empty.",
  "api.server.device_not_found": "You have no such device.",
  "api.server.primary_only_named":
    "Other devices can only be removed from the primary one — “{name}”.",
  "api.server.primary_only": "Other devices can only be removed from the primary one.",
  "api.server.primary_assign_only": "Only the current primary device can assign a new one.",
  "api.server.bad_address": "Invalid address.",
  "api.server.request_too_large": "The request is too large.",
  "api.server.body_not_json": "The request body isn't JSON.",
  "api.server.body_not_object": "The request body isn't a JSON object.",
  "api.server.too_many_attempts": "Too many attempts. Wait a minute.",
  "api.server.too_many_signups": "Too many new accounts from this address. Try again later.",
  "api.server.no_route": "No such endpoint.",
  "api.server.internal": "Internal error.",
  "api.server.slot_missing": "The slot isn't specified.",
  "api.server.slot_name_too_long": "The slot name is too long.",
  "api.server.bad_known_version": "Invalid remembered version.",
  "api.server.bad_version": "Invalid version.",
  "api.server.no_body": "There's no data to write.",
  "api.server.bad_version_time": "Invalid version time.",
  "api.server.quota_slots":
    "This service allows {limit} {limit:book|books} per person, and you already have {used}.",
  "api.server.quota_bytes":
    "Not enough space on the service: {limit} MiB is allowed, and this write would bring it to {after} MiB.",
  "api.server.pairing_too_large": "The pairing package is too large.",
  "api.server.too_many_codes": "Too many codes in a row. Wait five minutes.",
  "api.server.code_not_found": "Code not found. It lasts five minutes — ask for a new one.",
  "api.server.code_used": "This code has already been used. Ask for a new one on the first device.",
  "api.server.code_used_short": "This code has already been used.",
  "api.server.code_expired": "The code has expired. It lasts five minutes — ask for a new one.",
  "api.server.request_not_found":
    "The code from the new device wasn't found. Show a new one on it.",
  "api.server.request_expired": "The code on the new device has expired. Show a new one on it.",
  "api.server.request_answered":
    "This code has already been answered. Show a new one on the new device.",
  "api.copy.partlyUnreadable":
    "Part of the copy could not be read, so those profiles were not restored. The copy is still there — please report this without deleting anything.",
  "api.save.rejected":
    "Not saved: a value is not allowed (too long, empty or out of range) — field {where}. Correct it and save again.",
  "api.ai.noKey": "No API key is set for the selected AI provider.",
  "api.ai.noDescription": "Enter a description of the transaction.",
  "api.ai.noQuestion": "Enter a question.",
  "api.ai.noAnswerRephrase": "The assistant gave no answer. Try rephrasing.",
  "api.ai.notEnoughData": "Not enough data for an analysis.",
  "api.ai.noAnswerRetry": "The assistant gave no answer. Please try again.",
  "api.profile.notFound": "Profile not found.",
  "api.recurring.notFound": "Recurring transaction not found.",
  "api.inv.tickerRequired": "Enter the security's ticker.",
  "api.inv.securityNotFound": "This security is not in the exchange directory."
};
