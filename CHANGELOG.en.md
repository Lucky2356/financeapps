# Changelog (English edition)

This is the English edition of [CHANGELOG.md](CHANGELOG.md). It covers the
releases the in-app “What's new” window shows, and the English interface reads
its release notes from here. The Russian CHANGELOG.md is the source of truth:
every release is written there first, then translated here with the same
version, date and sections.

## [2.8.0] — 2026-10-27

🌍 A complete English version: every screen, message, category and example is in English. Plus a big review: what you record no longer disappears on restart, backups come back in full, and sync no longer stalls on one damaged record.

### Added
- **The whole app in English.** Before, the shell was in English and the
  rest only where we had got to it. Now English covers:
  - error messages from data, sync and the service (the service returns
    codes, and the app translates them into the screen language);
  - default categories of a new install, the example data, profile names,
    the Sheet tab and its templates, investment sectors;
  - the window title, screen reader labels and hints;
  - security names, in Latin script as the exchange writes them.
- Russian and English devices on the same data understand each other:
  “Переводы” and “Transfers”, “Импорт расходов” and “Imported expenses” are
  one category, with no duplicates.
- An e2e guard: not a single Russian string on 23 screens of the English
  version.

### Fixed — data
- **What you record survives a restart.** Some values were accepted and then
  silently dropped together with their record on the next launch: a
  transaction with a tag longer than 40 characters, a goal of 0, a template
  of 0, a statement category longer than 100 characters, a long account or
  debt name. Now such values are trimmed or rejected with a clear error, and
  the whole record is validated before it is saved.
- **“Undo clear”, restoring the local copy and restoring from a file** lost
  the entire profile because of one damaged row. Now only that row is
  dropped.
- A template switched back on after a pause no longer backfills payments for
  the whole paused period.
- Deleting a goal no longer rewrites the net worth history of past months.
- A subscription created from the detected ones goes to the account it was
  paid from, not the first one in the list.
- The Sheet wizard no longer replaces amounts you already typed with averages
  when the screen reloads its data while the window is open.

### Fixed — sync
- One record on the server that could not be opened no longer stops all your
  other changes from being sent.
- Polling again while connecting a device (when the answer got lost on the
  way) gets the same answer, not “code not found”.
- “Server storage is full” is shown as such, not as “no connection”.
- Syncing no longer switches the open profile to the one open on your other
  device — after “Merge” your records no longer seemed to vanish into
  another profile.

### Changed
- CSV exports of transactions and reports in Russian use “;” and a decimal
  comma, so Excel opens them in columns.
- Amounts with kopecks/cents now work in debt payments and purchase splits.
- Home and other screens show placeholders while loading, not “0 ₽” with
  Russian headings.
- The year-over-year comparison without data shows “—”, not “+100 %”.
- Percentages use a decimal comma in Russian; on a phone it is clear that
  the tab row scrolls.
- The trial amount in the price watch is in your main currency; today's
  payment east of Greenwich is no longer “tomorrow”.

## [2.7.7] — 2026-10-23

🛡️ A big review: sync no longer loses changes made on another device, “Merge” brings over all profiles, money adds up correctly across currency changes, transfers and debts, and without the exchange your portfolio is no longer valued at made-up prices.

### Fixed — sync and data
- **A change from another device could be lost.** If a write on this device
  landed right while it was merging with the server, the other device's
  change was overwritten — on the server and on every other device. Both
  races are closed.
- **“Merge” lost every profile except the open one,** and the merge threw
  away the plan, notes, portfolio, family members, Sheet, cashback, trips and
  more. Now all profiles and all sections come across, and category rules
  point to categories that exist. If your own records could not be added,
  the screen shows an error and offers to retry or save them to a file,
  instead of silently reloading.
- “Save a copy and replace” saves each profile to its own file.
- A hung request to the service no longer leaves device connection spinning
  forever: after 30 s it says “no connection”.
- “Load” from the sync folder always answered “the file doesn't look like a
  backup” — fixed.
- Service: request size is limited before sign-in, and the secret's length
  is checked.

### Fixed — money
- **Changing your main currency** recalculates goals, limits, the plan and
  the net worth history. Before, 90,000 ₽ in a goal was read as $90,000.
- **Editing one half of a transfer** changes the other half too — the
  difference no longer vanishes from your net worth.
- **A loan payment made in advance** is no longer subtracted a second time in
  “Safe to spend”, “Until payday” and the forecast.
- **An overdue unconfirmed scheduled payment** stays in the forecast instead
  of disappearing until its next due date.
- Limit rollover no longer takes the limit from a month where it did not
  exist.
- A foreign-currency account's history correctly accounts for goal top-ups.
- A foreign-currency account's negative balance before archiving is settled
  with an amount in its own currency.

### Fixed — investments
- **Without a connection to the exchange, the portfolio was valued at
  made-up prices** (VTB at 0.02 ₽) and those were saved. Now the last real
  prices stay.
- Portfolio work no longer holds up recording transactions while the
  exchange is silent, and a sale recorded during a price update is no longer
  undone.
- Profit in the portfolio header no longer includes bond accrued interest —
  same as in the rows.

### Fixed — import and reports
- “1 234,56 руб.” in a statement was read as 123,456.
- Category rules also work for statements with a category column; loading
  the same statement again no longer doubles it.
- Reports for periods older than two years no longer show zeros.

### Changed
- Months on the income and expense chart are spelled out, percentages in
  Russian use a decimal comma, and long tile labels on a phone are no longer
  cut off.
- Next.js 16.4.3 and zod 4.6.7 — fresh vulnerabilities closed.

## [2.7.6] — 2026-10-21

🔗 “Merge” when connecting a device no longer hangs for half a minute when the exchange doesn't respond.

### Fixed
- **“Merge with the other device's data”** starts with a backup, and the
  backup used to revalue the investment portfolio against the exchange. If
  MOEX didn't respond, the button silently hung for up to half a minute. Now
  the portfolio goes into the backup with the last known prices, and the
  connection proceeds right away. “Save a copy and replace”, manual backup
  export and scheduled backups got faster too; quotes refresh the next time
  you open Investments.

### Internal
- Test: a backup exports and restores while the exchange is silent; in the
  e2e “Merge” test the exchange is unreachable for the second device.
- CI keeps traces and page snapshots of failed e2e tests.

## [2.7.5] — 2026-10-15

🧭 The Transactions filters are back where they belong, and on a phone card headings and chart labels are no longer covered by anything.

### Changed
- **The Transactions filters are back where they belong** — in the
  Transactions card, under “List / Calendar”. In 2.7.4 they were moved into a
  separate card at the top of the screen, although only the filter button
  was meant to move. The new first row — Transactions, the filter button,
  “All categories” — and the even field edges stayed. As before 2.7.4, the
  calendar shows the month without the list filters.

### Fixed
- **“Balance history” on Accounts:** on a phone the “All money” and
  “12 mo.” pickers sat on top of the heading, and the first digits of the
  axis labels were cut off by the edge (“) k ₽”). Now the heading has its own
  row, the pickers the next one, and the axis is wider.
- **“Compare months” in Analytics:** on a narrow phone the month picker
  covered the heading — fixed the same way.
- **The Filters panel near the bottom of a phone screen** opened downwards —
  under the bottom navigation bar. Now, if there is no room below, it opens
  upwards.

### Internal
- Guard `e2e/no-overlap.spec.ts`: on all main screens at 360 and 412 px,
  every card heading is unobstructed and chart axis labels are not cut off
  by the edge.

## [2.7.4] — 2026-10-15

📱 Transactions on a phone is more compact and no longer slides sideways, “Safe to spend” remembers last month, “Until payday” supports several paydays, the Sheet gets a chart and templates — and seven fixes, including password changes on the service and cp1251 statements.

### Added
- **“Until payday” — several paydays.** You can pick several days of the
  month (advance and salary, “last day of the month”), a day of the week or
  “every day”. The forecast runs to the nearest payday. From your history the
  app guesses both the advance and the salary if they arrive regularly. The
  old setting — a single day — keeps working.
- **Sheet:** a “Total by month” chart above the table (tapping a bar takes
  you to that month); highlighting of spending above usual (“34% above
  usual” — against the median of past months); templates for a new sheet —
  “Family budget”, “Renovation”, “Holiday”, “From scratch”.

### Changed
- **“Safe to spend today” takes last month's result into account.** What was
  left over is added to this month's budget, and an overspend is
  subtracted; in “How it adds up” it is a separate line.
- **Transactions on a phone:** filters and search are the first card on the
  screen, in an even grid with one right edge; the button for rarely used
  settings is in the heading row. Transaction cards are almost half as tall:
  the paperclip and bin sit in one row with the amount, and the date is not
  repeated under the day heading. The day heading is brighter and sticks to
  the top while you scroll through that day.
- **Sheet:** help opens by itself only the first time; months are
  abbreviated consistently (Jan … Nov Dec); the month result is called
  “Total” everywhere; a negative Total is red digits with a red line; the
  floating “+” on desktop no longer covers the Total column.

### Fixed
- **The screen slid sideways on a phone** as your finger moved: the window
  stretched to the widest content. Now the shell clips it.
- **Password changes and resets did not reach the sync service** — the old
  password still let a new device in. Now the new password goes to the
  service right away or, without a connection, at the first opportunity.
- **Restoring the service from a backup** is now noticed by the device even
  if other devices have written further: fresh records are not lost.
- **A debt payment restored from the trash together with its account** did
  not reduce the debt; a debt and a payment restored one after the other
  were deducted twice. Now the result is the same in any order.
- **cp1251 statements in the Windows and Android apps** came out as
  gibberish — now they read the same as in the browser.
- **Words with numbers:** “1 days” and wrong Russian plural forms — now “1
  day” and the right form for every number across the app.
- **English mode:** dates, amounts and percentages were formatted the Russian
  way, and currency and sector names were in Russian.

### Internal
- Sync service: `PUT /auth/vault` replaces the vault and sign-in secret after
  a password change; history of the last 64 versions of each cell
  (`book_versions`) and an `ancestor: known | unknown` answer to
  `GET /vault/<cell>?knownVersion=&knownAt=`. Old apps and the old service
  work as before.
- Guards: `e2e/no-sideways.spec.ts` (the screen doesn't slide sideways on a
  real phone touch), `e2e/ledger-phone.spec.ts` (Transactions cards and
  filters), `e2e/sheet-2-8.spec.ts`.

## [2.7.3] — 2026-10-12

📊 A friendlier Sheet — “Total” always in view, pasting from Excel without losses — and seventeen fixes: sync, foreign-currency debts, dates and statement import.

### Changed
- **“Total” in the Sheet is always in view.** In a 1280 px window the items
  filled the whole width, and Total — the reason you keep the sheet at all —
  slid off the right edge. Now it is pinned to the edge, and the items scroll
  under it.
- The Sheet is shorter at the top: the “Large / Compact” switch moved under
  “More” and no longer takes a row of its own.
- Column labels don't repeat the name: “To savings” under “To savings” and
  “Income” under “Income” are gone. Balance and the opening cushion have no
  “Total” and “Average” — adding up balances across months makes no sense.

### Fixed
- **Pasting from Excel into the Sheet overwrote neighbouring cells.** A
  single cell “1500,50” was split at the comma: 1500 into the cell, 50 into
  the next column over whatever was there. A block from Excel wiped the cell
  below it (Excel adds a line break at the end), and an empty cell in the
  middle of a column shifted every number below it a month earlier. The same
  in a free sheet.
- **Bringing a table over from Excel:** amounts like “1 234,00р.” and
  “500 руб.” ended up in the notes; a table with the latest month on top gave
  false mismatches with the file's Total; a comma-separated file fell apart
  if a comment contained “;”; the date “15.13.2026” created month 13, and
  “01.08.26” wasn't understood.
- **Formulas:** “=SUM(1, 2)” gave 1.2 instead of 3; half a kopeck was rounded
  differently from Excel (1.005 → 1.00, −0.125 → −0.12).
- **A free sheet calculated phone numbers and dates:** “+7 912 345-67-89”
  showed up as the number 7 912 189, “2026-08-01” as 2017. Now they are text.
- **Sheet export to Excel:** an item with “;” in its name shifted all columns
  to the right, and a note starting with “=” ran in Excel as a formula.
- Sheet wizard: two items with the same name wrote both amounts into one
  column. In the help, the “current month” was always “Sep 2026”.
- **Restoring the sync service from an old backup erased fresh records on
  all devices.** Now the device notices the rollback and sends its data back.
  Restoring from a backup file is no longer rolled back by the very first
  sync, and a deleted profile doesn't come back from the server.
- **Connecting to an account on a device where the book was started before
  the lock erased it.** Now you are asked what to do with your records
  instead.
- **Debts and templates in another currency** were counted as roubles in the
  forecast, “Until payday”, “Safe to spend today” and the weekly amount: a
  $500 payment counted as 500 ₽. Now the exchange rate is applied.
- **Deleting a debt overpayment** gave the debt back the whole payment, not
  the part that was taken off, and the debt grew. A transfer is restored from
  the trash entirely or not at all — half a transfer no longer loses money.
- **“Safe to spend today”** counted this month's income recorded ahead of
  time, but not expenses: rent recorded for the 25th didn't make it into the
  budget.
- **Dates west of Moscow:** a template's next run and a goal's deadline
  shifted a day earlier (a salary could be posted twice), and a transaction's
  day was shown and re-saved as the previous date.
- **Statement import:** dates with a time (“01.08.2026 14:35”) mixed up day
  and month or were lost, “01.08.26” gave the year 1926, amounts in
  parentheses “(1 200,00)” were read as income, and cp1251 files came out as
  gibberish. The duplicate filter dropped genuinely identical purchases and
  ignored kopecks.
- **Quick add:** in “5.09 1200 coffee” the wrong amount was picked.
- **The tax refund file:** a category with “;” shifted the columns, text
  with “=” ran as a formula, and the header was in Russian even in English
  mode.
- Zero is no longer shown as “-0 ₽”.
- Sync service: a non-object request body gave 500 instead of 400, and the
  book limit could be bypassed by adding “receiptPhoto_” to the name.

## [2.7.2] — 2026-10-08

🖥️ A window that fits your screen — from a laptop to 4K, saving on a large book 4–6 times faster, and eleven fixes.

### Changed
- **Saving on a large book is 4–6 times faster.** The book is encrypted as a
  whole on every save, and the ciphertext was converted to text one
  character per byte — with twenty thousand transactions that was ~0.7 s on
  every save, longer than the encryption itself. Now one save on such a book
  takes ~0.1 s, and with fifty thousand ~0.45 s instead of 2.6 s.

### Fixed
- **The app window didn't fit a laptop screen.** The window opened at
  1280×820 on any monitor, and a 1920×1080 laptop at 125–150 % scaling or a
  1366×768 screen has less room — the bottom of the window with its buttons
  went under the taskbar. Now the window checks the screen at launch: on a
  small one it opens maximized, on a medium one it shrinks and centres, on a
  large one it stays as before. The remembered size is checked too: a window
  stretched on a 4K monitor no longer spills over the edges on a laptop, and
  a window left on a disconnected monitor comes back onto the screen. On a
  screen smaller than the minimum window size, the minimum shrinks to the
  screen. The window no longer flashes at its old size — it appears already
  in place.
- **On Full HD and wider monitors the Overview tiles took two thirds of the
  row.** From a 1536 px window the tile grid became six columns, while every
  screen has four tiles — two columns on the right stood empty. Now it is
  four in a row on any monitor.
- **Table columns were jammed together.** In an amount breakdown (Plan vs
  actual and other screens) a long account name merged with the description
  next to it: “Larisa Groceries”. Columns now have spacing — in all tables in
  the desktop layout.
- **Transactions on a foreign-currency account showed a ₽ sign** —
  “100 ₽ (9 000 ₽)” instead of “$100 (9 000 ₽)”. The currency was taken from
  the page's empty placeholder rather than the loaded data.
- **A month note in Plan vs actual could overwrite a newer one.** If the note
  was changed on another device, the field showed the old one, and a tap
  without editing wrote it over the new one. On a phone, deleting the open
  month took you to the first month instead of the current one.
- **A few more places didn't refresh after changes:** “Compare with
  Transactions” and the actual amount in a cell's row in the Sheet, the
  account list for “Default account” in Settings, goal and dividend
  milestones in the forecast calendar, and detected recurring charges in
  Subscriptions.
- **The Sheet in the English interface:** the cell dialog on a phone wrote
  numbers the Russian way, and a new goal got a Russian name.
- **“Create” in the new account dialog (and any other save) could hang for
  seconds right after launch.** The net worth snapshot the app takes on
  every load waited for the Moscow Exchange inside the write queue — and all
  writes stood behind it until the exchange answered. Now quotes for the
  snapshot are fetched before the queue, and inside it the snapshot is only
  calculated and saved.
- **Some cards didn't refresh after sync or your own edits** — until you
  switched screens: dividends, the sales and tax log, security signals
  (Investments), the rates update date (Accounts), the AI assistant switch,
  and the theme and density chosen on another device. Now they reread the
  data whenever it changes. For example, “Received” in upcoming payouts shows
  up in the dividends card right away.
- **Debts: the “Auto-pay category” list had items without names.** The
  dialog asked the category directory for a field it doesn't return.

### Internal
- Fitting the window to the monitor lives in `src-tauri/src/window_fit.rs`:
  pure arithmetic without Tauri, with tests for typical screens (1366×768,
  1920×1080 at 100/125/150 %, 4K at 150/200 %, a second monitor on the left,
  a window from 4K on a laptop): `rustc --edition 2021 --test
  src-tauri/src/window_fit.rs`. The window-state plugin no longer restores
  the window itself or touches its visibility — `open_main_window` in
  `lib.rs` does that.
- Fetching quotes for the net worth snapshot outside the write queue (see
  “Fixed”) also removed a flaky `e2e/sync-qr.spec.ts` failure in CI, where
  requests to the exchange go out for real. The empty names in “Auto-pay
  category” surfaced once the response type was inferred from the path
  instead of being written by hand in the dialog.
- e2e: layout checks now include a 1093×540 laptop (1366×768 at 125 %), the
  narrowest window 960×640, 4K at 150 % and a maximized Full HD window.
- `LocalApiClient` is split into sections: 6181 lines became 1973. The client
  keeps document storage (cache, write queue, trash, backups, profiles) and
  request routing; section calculations are pure functions of the document
  in `lib/api/local/` (`state`, `money`, `ledger`, `budgets`, `goals`,
  `debts`, `recurring`, `investments`, `plan`, `overview`, `categories`,
  `settings`, `family`, `sample`). Dependencies between them go one way, with
  no cycles.
- The move was mechanical: the bodies of all 81 moved methods match the old
  ones up to whitespace and line breaks, except for `this.` before calls.
  Methods with noun names got a suffix so they don't clash with variables
  inside functions: `accounts` → `accountsPage`, `rates` → `ratesOf`,
  `backup` → `backupDocument` and so on.
- Routes are “path → handler” tables instead of `if (pathname === …)`
  chains: reads in `lib/api/local/reads.ts`, writes and deletes in
  `lib/api/local/writes.ts`, storage work in the client itself. A write
  handler only edits the document and answers; the client saves, once, and
  only if the handler didn't throw.
- The read response type is inferred from the path (`lib/api/routes.ts`):
  `apiClient.get("/accounts")` and `useApiPageData` return exactly what the
  handler returns, and an unknown path doesn't compile. About 500 explicit
  `<T>` in screens and tests are gone, and casts in the client went from 68
  to 4: one each in read and write routing and one in the document copy.
  Writes have their path checked, but the response type is still named by
  the caller: one path does different things depending on the `action`
  field.
- The guard `tests/every-screen-refreshes.test.ts` searched for the
  substring `apiClient.get` and missed calls split across two lines — twelve
  places read the book past it that way. Now the search doesn't depend on
  line breaks, and that is checked by a separate case. Six places subscribe
  to changes (see “Fixed”), six are listed as “read on demand” with a
  reason: dialogs that read when opened, the quotes chart and the target
  allocation form.
- Two more tests that checked nothing came to light along the way: comparing
  item edit stamps (`undefined` with `undefined`) and the screen walk in
  `tests/read-paths.test.ts`, which listed 16 paths out of 46 — now it walks
  the tables in full.
- The wording guard (`tests/plain-words.test.ts`) also looks into the new
  modules: user-facing error text moved there together with the code.
- README: numbers checked against the code — schema version 19; 1464 unit
  tests, 85 for the service, 290 E2E.
- The write response type is inferred from the path too — and from the
  `action` field in the body. Paths that do different things depending on
  `action` are described by action tables (`byAction`) instead of branches
  inside the handler; the sheets, family, cashback, trips and portfolio
  modules expose their actions as tables. 140 explicit `post<T>`/`put<T>`
  are gone.
- Large screens are split into modules with the same behaviour:
  `budget-sheet` (1873 lines → 376), `settings-form` (1394 → 164),
  `plan-fact-view` (1356 → 165), `transaction-manager` (1279 → 173). State
  and effects moved into hooks, large chunks of markup into their own
  components.
- Seven suppressions of the hook dependency check (`exhaustive-deps`) were
  replaced with `useEffectEvent`.
- The screen refresh guard counts a subscription only for
  `onDataChanged`/`useDataVersion`: `useApiPageData` is responsible for its
  own request, not a neighbouring one — that is how the places from “Fixed”
  slipped through.
- The package is called `financeapps`; CONTRIBUTING records the rule about
  the language of comments.

## [2.7.1] — 2026-10-04

🐞 Switches in Settings switch again.

### Fixed
- **The “Loli voice assistant”, “Expenses from bank notifications” and
  “Evening reminder to log spending” switches didn't change on screen:** the
  tap was saved, but the switch stayed where it was — it looked as if it
  didn't work. Now the settings section redraws on any change, and no switch
  will “stick” again.
- **Loli:** if she isn't installed or is signed with someone else's key, the
  switch is greyed out with the reason next to it (and whose signature was
  found). Once the link is on, the summary for Loli and the expenses she
  sends refresh right away, not after the next edit in Transactions.
- A month without income: Loli no longer says “budget used up” — the
  assistant simply has nothing to calculate “safe to spend today” from.

## [2.7.0] — 2026-10-03

🎙️ Loli integration: expenses spoken to Loli land here, and Loli answers money questions using the numbers here.

### Added
- **Expenses from Loli.** “Loli, I spent 850 on groceries” — the expense
  appears in Suggestions on Home and is recorded with one tap. Turn on
  “Record straight away” and it goes straight into Transactions. Edit or
  cancel the expense in Loli and the same transaction changes, and anything
  sent twice is not doubled. The category is matched by name (“Cafes and
  restaurants” → “Restaurants”), income by description (“salary came in” →
  “Salary”).
- **Loli answers money questions:** “how much can I spend today?”, “will I
  make it to payday?”, “how much is left for groceries?”, “how much money do
  I have?”. Loli gets only totals — not a single transaction, description or
  shop. You can choose not to share the summary.
- Works on Android only, offline, and only with the genuine Loli (her
  signature is checked). Turn it on in Settings → “Loli voice assistant”;
  the link is off by default.

## [2.6.1] — 2026-10-03

🐞 Rent is no longer recorded twice on two devices, debts and their payments add up, and the app is faster on a large book and has animations.

### Fixed
- **Deleted a debt payment — the debt is back.** Before, the money returned
  to the account but the debt stayed reduced. Restore a payment from the
  trash or change its amount, and the debt changes with it.
- **Auto-pay on a debt in another currency** (for example, a dollar loan paid
  from a rouble card) is charged at the exchange rate, not as the same
  number.
- **Rent is not recorded twice on two devices.** Scheduled payments and
  auto-payments are written after the first check with the server (no longer
  than 10 seconds): a phone opened after the computer no longer records the
  same rent again.
- **A scheduled payment remembers its template:** rent charged while you are
  on holiday doesn't go into the trip budget, and “will I make it to payday”
  doesn't count it twice.
- **Two identical coffees in one morning:** statement import and bank
  notification suggestions no longer take the second identical purchase for
  a repeat of the first.
- The monthly report shows large expenses from foreign-currency accounts at
  the exchange rate.

### Changed
- **Faster on a large book:** recording a transaction is about 5 times
  faster, Transactions, Limits, Home and “Safe to spend” 2–5 times, “It's a
  transfer?” dozens of times. The app loads less code at launch: the English
  dictionary, “What's new” and charts load only when needed.
- **Animations:** amounts on Home, in Accounts, “Safe to spend” and goals
  glide to the new value and briefly change colour (up — green, down — red);
  a just-recorded transaction is highlighted in Transactions; the details of
  “Safe to spend” and “until payday” expand smoothly; a reached goal gets a
  green bar and a “Goal reached” mark; the “+” button responds to taps. The
  system “reduce motion” setting turns all of it off.

## [2.6.0] — 2026-10-03

✨ “It's a transfer?”, bank reconciliation, year in review, balance history, month comparison, “will I make it to payday”, shared family goals, more detailed subscriptions and a monthly PDF report.

> ⚠️ The data format has been updated (19): older versions of the app will ask
> to be updated. Update all devices that sync with each other.

### New
- **“It's a transfer?”** (Transactions): pairs of “left one of your accounts
  — arrived on another” for the same amount on the same or the next day are
  linked into a transfer with one button — and stop counting as income and
  expense. This fixes the doubling after importing a bank statement.
- **Bank reconciliation** (Accounts → the scales next to an account): the
  balance from the bank, the difference and the latest transactions; if
  nothing turns up, the difference is recorded as one transaction.
- **Year in review** (Reports): earned, spent, saved, top categories, best and
  worst month, biggest expense, growth of money and cushion, compared with
  last year.
- **Balance history** (Accounts): a chart at the end of each month — all
  money, the cushion or one account.
- **Compare months** (Analytics): two months side by side by category.
- **Will I make it to payday** (Home): days to payday, money on cards,
  payments before it and how much you can spend per day; payday comes from
  your history or is set by you.
- **Shared family goals** (Goals): who topped up, members' shares (equal or
  custom), who is behind their share.
- **More detailed subscriptions:** how much you paid over the year, “price
  went up”, “Turn off” with a hint of how much it will save.
- **Monthly report (PDF)** (Reports): one page — totals, plan vs actual by
  category, large expenses.

### Fixed
- **A sync conflict with nothing to choose no longer appears.** If only
  service stamps differ, or it is a service record without a single field
  you entered (for example, a Sheet month), the merge decides by itself and
  loses nothing. Such empty conflicts (“Record”, “Mismatch: 0”) accumulated
  earlier disappear on their own.
- **Clear names in the conflict dialog:** each section has its own name
  (“Sheet month”, “Trip”, “Family member”…), an account, category and member
  are shown by name rather than by number; service fields (column, order,
  sheet) are hidden. The dialog title is no longer repeated twice.

## [2.5.2] — 2026-10-03

🐞 More fixes: a trip doesn't count debt payments, old transfers are deleted in full, and cashback isn't earned on paying off a loan.

### Fixed
- **Trip:** a debt payment and a transfer between your own accounts no longer
  get the trip tag or count towards its spending.
- **Transfers recorded before 1.10** (only a tag in the description) are also
  deleted and restored from the trash in full.
- **“What if”:** only debts with a minimum payment are subtracted
  separately; paying off a credit card without one stays a regular expense
  instead of disappearing.
- **Bank notifications:** a rouble expense is not recorded to a
  foreign-currency account.
- **Cashback:** paying off a loan with a card doesn't count as a purchase.
