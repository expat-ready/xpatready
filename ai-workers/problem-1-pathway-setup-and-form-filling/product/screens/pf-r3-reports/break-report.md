# PF-R3 break report: the firm's Reports page (R1.79 part 4)

- **Build:** PR #3864 (draft), branch `claude/runtime-pfr3`, commit b6b117848.
- **Scope used (P-26):** concept-draft r2 (branch `claude/runtime-pfr3-concept`, approved on #3849): BR-1 to BR-8, §4 layout, §6 tests. Its §6b "Not built" items are not findings: XLSX, scheduled reports, saved views, drill-through and the overdue-by-person list.
- **Copy:** an isolated copy `brk3` on :4793 (`isolated.sh … --ttl 90 AI_LIVE=off PLATFORM_IDENTITY=local`), stopped afterwards. The demo on :4400 was never used.
- **Seed:** Sample firms, plus one staff member for each of Read-only, Billing / Finance, Case Manager (display name `=HYPERLINK("http://x.invalid","Click")`), Admin, and one with no role. Also 217 open cases on 212 stage names, including `=HYPERLINK(…)`, `+SUM(1,2)`, `@cmd`, `-2+3`, a tab, a leading space or no-break space before `=`, a line break with quotes, French/Chinese/Arabic text and a 288-character name. Also 210 issued, overdue CAD and USD invoices for 210 clients, one of them named `=cmd|' /C calc'!A0`.
- **Tools:** API calls with curl; browser runs with Playwright (Chromium) at 375, 720, 1024 and 1440 px.
- Screenshots are in the session scratchpad and are not committed. Every finding below has a file:line or a step that reproduces it.

## Findings

### M1 · Major: a `person` id from outside the firm shows "Everyone" and "Whole firm" over figures counted for nobody
- **Did:** signed in as the Owner and opened `/platform/reports?person=00000000-0000-4000-8000-000000000000`. Then the same with another firm's staff id (`user-S` of sample-solo).
- **Expected:** the person is dropped (as BR-3 drops it for a Case Officer), or the page says the person is not in this firm.
- **Actual:**
  - The page sends `staffId` to `/query` and the server counts that person's records, so every card comes back empty: "No open cases in this period", "No invoices in this period", and Overdue ageing empty.
  - At the same time the Person picker shows "Everyone" (no option matches) and every card's badge says "Whole firm".
  - On the plain URL the same firm shows 200 stage rows, CAD 11,989.58 / USD 11,990.78 billed and two ageing rows.
- **Why it matters:** a stale or edited link makes the firm look empty, and BR-1's badge says the opposite of what was counted.
- **Where:** `contract.ts:45` keeps any 36-character uuid-shaped value without checking it against `people`. `reports-page.tsx:90` turns an unmatched id into `personName = null`, so `scopeWords` falls back to "Whole firm". `ports/metrics.ts` checks only that the value is a uuid, so the server also accepts a person who is not in the firm.

### M2 · Major: export ignores AG-14-26's PII masking, and nothing records this as a departure
- **Context:** the row and BR-7 cite AG-14-26: "Export SHALL be … PII-masked unless the caller holds `agent/report:reveal-pii` (unmasked export separately audited) … audited (actor, scope, filter, row count, masked flag)".
- **Actual:**
  - `POST /export` writes names unmasked. As the Owner, `{"metric":"reports.sales.per_person"}` returned staff display names in clear. `reports.money.overdue_by_client` writes client names whenever the viewer may open them.
  - The door exports **any** registered LIST metric, not only "the shown table" (BR-7). Neither of these two tables is on a seeded dashboard, so they can only be reached by a hand-made request.
  - The `agent/report:reveal-pii` key is not in the catalogue, and the audit line has no masked flag.
- **Not recorded:** the concept's §6b and challenge Q2 deal with "async" and "never widens", but say nothing about masking.
- **Where:** `export.ts:41-44`, `export.ts:53-58`, `routes.ts:77-79` (only `kind === "LIST"` is checked).

### Minor
- **m1 · The table on screen and the exported file can differ.**
  - Did: on the Owner dashboard I switched Client type to Corporate (with `/query` slowed to 3 s) and pressed Export CSV on "Open cases by stage" straight away.
  - Actual: `keepPreviousData` keeps the old All table (200 bars) on screen with a live Export button. The request carries `clientType: CORPORATE`, the file and the audit line hold 0 rows, and the page still says "Downloaded … recorded in the activity log".
  - Where: `reports-page.tsx:55`, `:87`.
- **m2 · Each click is another export.** No in-flight guard: three quick clicks gave 3 requests, 3 downloads and 3 `report.exported` lines (audit count 11 → 14). Where: `reports-page.tsx:60`, `:92`.
- **m3 · An empty table exports a file with no header row.**
  - `POST /export` on a 0-row table (Corporate, or a person with no cases) answers 200 with a body of only the BOM and CRLF (`"﻿\r\n"`), and writes an audit line saying "0 rows".
  - Columns are derived from the rows, so the "header words are the table's own" (BR-7) disappear.
  - The UI hides the button when a table is empty, but m1 reaches this case anyway.
  - Where: `export.ts:34-44`.
- **m4 · Negative amounts would come out as text.**
  - The shared writer prefixes every cell that starts with `-`: `csvOf([{currency:"CAD",net:"-120.00",n:-3}])` gives `CAD,'-120.00,'-3`. That breaks BR-7's "amounts exactly as answered" and turns numbers into text in a spreadsheet.
  - It is latent today: every registered money LIST is `greatest(0,…)`, `due > 0` or tax ≥ 0, so no current table carries a negative amount.
  - Where: `audit/csv.ts:6`.
- **m5 · An odd value in the address breaks the whole page.**
  - `?from=2026-02-30` and `?person=------------------------------------` both pass the page's regex, and the server answers 422.
  - The page then shows "Reports could not be shown: not a real date" (or "the person is a staff id"), with every card stuck on a loading skeleton and the From box blank.
  - A from > to pair falls back to the month instead, so the page is inconsistent about which bad values it recovers from.
  - Where: `contract.ts:41-45`.
- **m6 · Typing a From after the To does nothing visible.**
  - Did: typed From 2026-12-15 while To was 2026-11-30.
  - Actual: the address keeps `from=2026-12-15&to=2026-11-30`, while the boxes and figures silently go back to the whole of November. No message appears. Typing To before From does the same.
  - Where: `contract.ts:44`, `reports-page.tsx:113`.
- **m7 · An extra query with an open range on first load.**
  - With `?from=2026-11-05` and no `to`, the first `/query` goes out as `{"from":"2026-11-05"}`, before `period` arrives. A second query follows with `to=2026-11-30`.
  - Until the second answer, the open-ended figures can show.
  - Where: `reports-page.tsx:84-87`.
- **m8 · An empty state gives the wrong reason.**
  - With fees billed at CAD 11,989.58 / USD 11,990.78 and no payments yet, "Fees collected" reads "No invoices in this period", one card below the billed figures.
  - The empty text says why, but gives the wrong why: it should say no payments in this period.
  - Where: `contract.ts:78` (every `reports.money.fees*` key).
- **m9 · 200-row bar list, and small targets at 375 px.**
  - "Open cases by stage" draws all 200 bars: the card is 4,894 px tall at 375 px and has no internal scroll.
  - Export CSV is 32 px tall and the (i) buttons are 20 × 20 px, under the concept §4c's 44 px targets.
  - There is no sideways scroll at 375, 720, 1024 or 1440 px (that part held).
  - Where: `reports-page.tsx:24`, `:42-45`, `:60`.
- **m10 · The file name leaves out client type and person.**
  - `fileNameOf` uses the dates only. So an All export and a Corporate export, or two people's exports, get the same `reports-case-load-2026-11.csv`.
  - Overdue ageing is named after the month even though "The date range does not apply".
  - Where: `export.ts:46-51`.
- **m11 · Billing / Finance's "Whole firm" badge appears over Individual-only money.**
  - Billing / Finance lands with Client type = Individual (BR-3's recorded departure), but every money card says "Whole firm".
  - So corporate clients' fees are left out under a firm-wide label.
  - Where: `contract.ts:47-48`, `:65-69`.
- **m12 · Tests the concept promised are missing.** The concept §6 promises export and filters tests in `tests/check_pfr1_reports.ts`, but that file is not in the diff. The door's new rules are tested only through the browser check.

## What held
- **Permissions:**
  - `people` is answered only to view.all holders (Owner, Admin, Case Manager); it is absent for Case Officer, Read-only and Billing / Finance.
  - `canExport` is false for those three. Their `POST /export` gets 403 `MISSING_PERMISSION`, including with a forged body (`canExport`, `scope`, `keys`), and writes no line.
  - A staff member with no role gets 403 on filters, layout, query and export, and the page shows the "no report permission" notice.
  - `firmId` in the body is 422 (strict schema); export is walled to the caller's firm.
- **Withheld and unavailable:** a Case Manager exporting `tax_collected` or `overdue_by_client` gets 403 `WITHHELD` with no line. An UNAVAILABLE read (table renamed in the copy) gives 503 with no line, and the UI shows "could not be counted… nothing was exported".
- **Formula injection:**
  - Stage names starting with `=`, `+`, `-` or `@` are written with a leading `'`. Leading tab, space or no-break space is trimmed and then guarded. Quotes and line breaks follow RFC 4180.
  - The staff name `=HYPERLINK(…)` in `per_person` is guarded too. React escapes it in the Person list.
- **Audit line:** metric, scope, rows and filters only; no figures, no names (`detail` checked in `audit_event`). It is written before the file.
- **Money:** CAD and USD sit apart on every tile and table row; ageing has one row per currency; the "more clients" rows are per currency; nothing is ever summed.
- **Address:**
  - An unknown `dashboard` (`__proto__`, `OWNER`) falls back to the role's default. An odd `clientType` (`foo`, `corporate`) falls back to All.
  - From > to falls back to the month. A huge range (0001-01-01 to 9999-12-31) answers.
- **Large firm:** 212 stage names give 199 rows plus "13 more stages", and the file holds 200 rows (`X-Export-Rows: 200`). The 7-metric query takes 34-56 ms and export 22 ms.
- **Other states:** empty, "Not counted yet" and "Not in your access" read as BR-6 says. Keyboard alone reaches the filters, every (i) and Export CSV, and Enter downloads the file.

Note: `screenshots/owner-1440.png` changed in the working tree at 16:25 UTC. This report did not write it: another run of `check_pfr3_reports_browser.ts` did. Nothing is committed.

## Round 2: diff b6b117848..2af419e (26 Nov)
- **Copy:** `brk3b` on :4794, same seed as round 1, plus stage names `-5.00` and `1234567890123.45`. Stopped afterwards; :4400 never used.
- **Accepted from round 1:** M2 (AG-14-26 says "not masked"; reveal-pii withdrawn, AG7-D10), m10 (left as is) and m12 (the checks are in the browser check). None of these is re-raised.

### R2-M1 · Major: a person id in capitals brings back M1
- **Do:** as the Owner, open `?person=9D1F827B-…` (a real colleague's id, upper case).
- **Expected:** the same as the lower-case id: that person picked, and "<Name>'s work" on the cards.
- **Actual:** the query sends `staffId` and the cards hold that person's (empty) figures. The Person picker says "Everyone" and every card's badge says "Whole firm". The lower-case id gives "<Name>'s work".
- **Cause:** `contract.ts:50` compares the ids in lower case but keeps the address's own spelling. `reports-page.tsx:111` (`p.id === f.staffId`) and the Select's `value` (`:148`) then compare exactly, so neither finds the person.

### R2-M2 · Major: an impossible month or day in the address crashes the page
- **Do:** open `?from=2026-13-01`, `?to=2026-11-32`, or day `00` / month `00`.
- **Actual:** "This page could not be shown", with `RangeError: Invalid time value` in the console. Reloading crashes again until the address is edited.
- **Cause:** `contract.ts:41` (`isDay`) calls `toISOString()` on an Invalid Date, which throws. The server's own date check tests `Date.parse` first. `2026-02-30` is handled; months 13 and 00 and days 32 and 00 are not.

### Minor
- **r2-m1 · The (i) words run off the screen.**
  - "What this counts" opens 256 px wide from the button's left edge (`reports-page.tsx:29`, `left-0 w-64`). In the right-hand cards it runs past the viewport by 91 px at 375, 67 px at 640 (about 200 % zoom) and 63 px at 1440.
  - The text is cut off and the page scrolls sideways while it is open (screenshot `r2-tip-375.png`).
  - Clicking the words to select them closes the tip, because the button loses focus (`onBlur`, `:27`).
- **r2-m2 · Cards that will never load still look like they are loading.**
  - With From after To, the To field shows its message (held), but every card shows a loading skeleton and the grid stays `aria-busy="true"` with nothing being asked.
  - If the new query fails (a forced 500), the notice shows, but the cards stay skeletons forever.
  - Where: `reports-page.tsx:109-110`.
- **r2-m3 · A blocked export press gets no feedback.**
  - The guard holds: a double-click plus a third click sent 1 request and gave 1 download, and a later press works.
  - But the button is neither disabled nor marked busy during the export. Pressing a second table's Export while the first runs is silently ignored.
  - Where: `reports-page.tsx:74`, `:115-117`.
- **r2-m4 · The CSV writer decides by the shape of the value, not the column.**
  - Any text that looks like an amount is written raw: a stage named `-5.00` becomes the number −5 in a spreadsheet. That is not an injection, but the text changes type.
  - A negative value that is a number (not a string) is still written as `'-3`.
  - This is latent: no registered table has negative counts or days today.
  - Where: `export.ts:49`.
- **r2-m5 · Still small at 375 px.** Export CSV and "Show all 200" are 32 px tall. m9 was fixed only for the (i), now 24 px, and Retry.

### What held in round 2
- **Person check:** an outside id is dropped ("Everyone", no `staffId` sent). A Case Officer's and Billing / Finance's own id in the address are dropped ("You", no `staffId`).
- **Billing / Finance:** lands on All. Read-only stays on Individual and the Case Officer dashboard.
- **Waits:** no query goes out before the filter context arrives.
- **Stale answer:** for the 3 s a query was held, no old figures and no Export were shown, and the new answer then drew. Retry keeps its figure while it refetches.
- **Month picker:** the firm's month and the 11 before it. Choosing a month writes the address and the current month leaves it clean. Custom shows From and To, a full month outside the list shows Custom, a reload keeps the choice, and the arrow keys change the month.
- **Range checks:** From after To shows the field message and asks nothing; `2026-02-30` falls back to the month.
- **Toggletip:** Enter opens it and Escape and a second press close it. axe finds 0 serious with it open or closed, at 375, 640, 1024 and 1440 px.
- **CSV:** text cells are still guarded (`'=HYPERLINK…`, `'+SUM`, `'-2+3`, `'@cmd`). Headings are written as the page shows them; amounts are raw (`CAD,0.00,3415.43,…`). An empty table gives 422 `NOTHING_TO_EXPORT` with no audit line, and WITHHELD still wins over empty (403).
- **Bar list:** 15 bars, then "Show all 200", by keyboard too. "No payments in this period" is shown for Fees collected.
- **Errors:** no page error in any run except R2-M2.
