# PF-17 part 4, PR B (console sign-in, session, Firms; R1.93): independent review, 24 Nov

Reviewer: a fresh context that did not build it. Head: `30ce5f7606f8dfc55acfc7aab484d96a2a2c0abc` (#3489, stacked on A `bdab2d27c`). Diff `git diff bdab2d27c...HEAD -- studio/` (8 files, +535). Against concept r2 §4a-§4c, §5, §6 B1-B3/B7-B9, BR-1 to BR-4; `design/console-r1.html`; STANDARDS, EXPERIENCE (§7 UXL), QUALITY. The journey-test report is the "Journey test" section below (one file, as briefed).

**Verdict: Block** (skill scale: Ship after fixes). One open Major, a small fix. Everything else is sound or Minor.

## What I ran (isolated copy `rvb` :4453, never :4400)
* `web-fresh.sh build` OK; `tsc -p web` exit 0.
* `check_pf17_console_browser.ts 4453 xr_studio_rvb`: **20/20, twice**.
* `j_93.ts rvb 4453`: **23/24**. All four W2 lines pass: the screen row reads `… Team (Sample) Active … 1 24 Nov, 11:29 UTC`, and the API values match the database per firm. The only failure is W4's screen line (PR C).
* My own Playwright walk at 1440, 1024, 1024 at 200 % (512 CSS px, scale 2) and 375. I signed in as `ops.sample@…` and as `support.sample@…`, keyboard only. I also stubbed `STAND_IN_OFF`, `/me` 500, firms 403/500, a network drop and a slow answer, and spied on which token each request carries.
* Copy stopped. `scan-logs.ts var/isolated-logs/rvb-api.log` gave "0 finding(s) — ok" (exit 0, 1 322 lines, no error lines).
* My runs overwrote three committed screenshots. I restored them with `git checkout`.

## Findings
**Major**
1. **Every filter or search change unmounts the whole page, so focus is lost and typed characters are dropped.** Cause: `firms-page.tsx:32` returns the "Loading the firms…" paragraph whenever there is no data for the *current* query key, and `:24` keys the query by filter without `placeholderData`. So each chip press or debounced keystroke swaps the heading, the search box and the chips out for one line of text.
   * Evidence (walk, 0 ms and 300 ms latency): Enter on the Held chip leaves `document.activeElement` = BODY. Typing "sam", pausing 350 ms, then typing "ple" leaves the box at **"sam"** with focus on BODY.
   * This breaks EXPERIENCE §2.12 [M] (keyboard path for every task) and §4 [M] (loading = skeletons; concept §4 "loading skeleton rows").
   * B9 checks only the URL after Enter (`check_pf17_console_browser.ts:173-178`), so it stays green.
   * **Fix:**
     * Keep the early return for the first answer only, which keeps j_93 W2's "heading arrives with rows" timing.
     * Add `placeholderData: keepPreviousData` (or skeleton rows inside the table box) so the header, search and chips stay mounted.
     * Make B9 assert that focus stays on the chip and that typing across a pause keeps every character.

**Minor**
2. **Field errors are not shown on the field.**
   * `?health=X` and any search over 100 characters (API `q.max(100)`, reachable by typing) show only "Not available · Some fields need a change." No field is named, and **Retry** re-sends the same refused query (`firms-page.tsx:46-47`).
   * The API answers `fields.health: "This is not one of the allowed choices."`. Concept §6 B3 says "the API's field error shown", and EXPERIENCE §2.10 [M] says errors go on the field.
   * The B3 regex `/highlighted|fields|change/` (`:134`) accepts the generic words.
   * **Fix:** show `problem.fields` messages (search ones under the box). Offer "Show all firms" instead of Retry on a 422. Set `maxLength={100}` on the search (§2.8, prevent errors). Tighten B3 to the field message.
3. **The sign-in card does not say why the session ended.** Concept §4a: "any 401 ends it and the sign-in card says why (TOKEN_EXPIRED, SESSION_REVOKED…)". The code keeps the code (`session.ts:17`) but always shows "Your session ended. Sign in again." (`contract.ts:39`, `frame.tsx:35`). **Fix:** use one sentence for an expired session and one for "ended by a Platform Owner", and test both in B8.
4. **A `/me` failure that is not a 401 shows the sign-in card to a signed-in person** (`frame.tsx:67`). In the walk, a stubbed 500 showed the card with no reason while the token stayed stored. Concept §4 says "error with Retry". **Fix:** for non-401 errors, show a Notice with Retry.
5. **A blank email is sent to the server, and the card answers "No ExpatReady staff member signs in with that work email."** The input is never marked: `Field … error={null}` (`frame.tsx:37`) and `aria-invalid` is null. **Fix:** check for blank in code ("Enter your work email") and put the server's words on the field through `Field error`.
6. **The 375 px primary is undersized (UXL-09, P-795).** "Sign in" measures 36 px at 375 px. **Fix:** `className="max-sm:h-11"`, as `firm-profile-page.tsx:163` does.
7. **Some notes and edge states show the wrong words.**
   * The `complete:false` note shows the API's own sentence ("…narrow the list with q…", `firms.ts:163`, a parameter name on the page). The concept's §4c copy is "Some firms' figures were not worked out on this filter; narrow the search." No browser check covers that note.
   * `?page=99` shows "No firms match. Clear the search or pick All." over "2 firms", with no pager (`firms-page.tsx:52,67-71`).
   * **Fix:** use the concept's copy in `contract.ts` and add a B2b case for it. On a page past the end, offer "Go to page 1".
8. **The tests are weaker than the rules they name.**
   * B7 (BR-2) still passes if `systemApi` sent the firm token: the server answers 403, and `frame.tsx:67` shows the card anyway. My request spy confirms today's code sends **no** request at all, so the rule holds; the test just would not catch a regression.
   * **Fix:** in B7, assert that no `/api/system` request carries an Authorization header, and the reverse for the firm side.
9. **Small things.**
   * `document.title` stays "Product Studio" on console pages (WCAG 2.4.2). Fix: "Firms · ExpatReady console".
   * Focus lands on BODY after sign-in. Fix: focus the h1.
   * The comments in `frame.tsx:2` and `routes.tsx` say "Support comes with PR C". That is a status line (STANDARDS §7) that goes stale once PR C lands.

## What is sound
* **Session (§4a).** Our own key `xr-system-session` {token, expiresAt} (ms), with an in-memory fallback. The expiry timer ends the session by itself (B8). A 401 ends it only if the token is still the current one (`session.ts:71`, so a late answer cannot end a newer session). Sign out and every session change drop `["sys", …]`. A new tab signs in again. A double-click sends 1 request.
* **BR-2 wall, by request spy.** A firm token alone on `/system/firms` sends no API request. Our token alone on `/platform/licences` sends none. The console sends only OURS, only to `/api/system`.
* **Sign-in.** `STAND_IN_OFF` shows the concept's exact sentence. An unknown email shows the server's words and keeps no session.
* **Frame (§4b).** "ExpatReady console" title, a key-gated menu (Support sees Firms through `system/firm:read`), the name, and Sign out set apart. No "?", no trial banner, no workspace tabs.
  * It uses `area="outside"` + `useWhere` rather than a new "console" area. The place line still reads "ExpatReady console › Firms", so this is not a finding.
  * The menu column stopping at the content height is the shared Frame's (the firm frame does the same).
* **Firms (§4c)** matches the board.
  * All nine columns. Health shows shape, word and reasons (UXL-14). "over" is in words; storage has its "as of"; plan state uses the concept's words.
  * Failed jobs follow BR-4: "N+"/"0+" with the concept's note, and "Not known" with its own note (B2b). BR-3: shown, not judged.
  * BR-1: a stubbed 403 shows the API's sentence, never an empty list.
  * Retry recovers from a 500. One request per view (counted), and sign-in to Firms takes 100-200 ms.
* **Screen sizes and accessibility.** axe 0 at 375, 512 (200 %), 1024 and 1440 and on the card. No sideways page scroll. The table scrolls in a focusable `role=region` box labelled "Firms" with a visible cut edge (UXL-10). Focus rings are visible. Chips use `aria-pressed`.
* **Module card.** One invariant plus a row file. No API or migration change.

## D1-D20 (independent reviewer, browser and script evidence)
D1 4 (SA-2-14 columns, B1-B3/B7-B9 green; #2, #3) · D2 N/A (read only; rows equal the API and the DB, j_93 W2) · D3 4 (shared Frame, Table, Notice, `problemOf`; words shared with the test) · D4 N/A · D5 4 (reload, double-click, late 401, expiry; #4) · D6 N/A · D7 N/A (no AI) · D8 4 (place line, menu; tab title #9) · D9 4 (sign-in to Firms in one step) · D10 4 (plain words; #2, #3, #7) · D11 3 (#1, #4) · D12 4 (matches `console-r1.html`) · D13 3 (axe 0, no sideways scroll, but #1 breaks the keyboard path; #6) · D14 4 · D15 5 (100-200 ms, one request per view) · D16 4 (red first, 20/20 twice; #1 B9, #2 B3, #8 B7 too loose) · D17 simulated only · D18 4 (UTC said, storage "as of", Sample, capped note) · D19 Partly (W2 closed; W4 is PR C) · D20 simulated only.

## UXL-01..14 (1440 and 375 px; 1024 as well)
01 Met (one filled button per view) · 02 Met · 03 Met · 04 Met · 05 Met (search, menu, Sign out top right) · 06 Met (5 chips) · 07 N/A (no long ids) · 08 Met (Sign out last, set apart) · 09 **Partly** (#6; chips 32 px, Sign out 32 px ≥ 24) · 10 Met · 11 Met (the menu becomes top links at 375) · 12 **Partly** (#1: text instead of skeletons, the whole page swapped) · 13 **Partly** (#2: >100 characters refused without words; search and email are trimmed) · 14 Met (shape and word; not bilingual). BIC-01..20: N/A (internal console, concept §4b). Retrofit: the team's names (Firms, Support) are kept (concept §2).

## Journey test (reviewer role; skill journey-test)
| Journey | Result |
|---|---|
| Platform Owner signs in by email and reads both firms' health, plan, failed jobs and last sign-in | held (B1, B2, j_93 W2 against the DB) |
| Support member signs in and sees Firms only through `system/firm:read` | held (name "Support (Sample)", menu "Firms") |
| Narrow by Held, by search, by keyboard | works, but focus is lost and typed characters drop (#1) |
| Empty, error, no key, queue down, capped read | held, except field errors (#2) |
| Session expiry, 401, sign out, new tab, reload, double-click | held; the reason is not said (#3) |
| Wrong session both ways (BR-2) | held (request spy) |

**Score: 8/10, pass** (no criterion at 0):
* task completed 1
* next step obvious 1
* plain words ½ (#2, #3, #5)
* feedback and state ½ (#1, #4)
* correct data 1
* error recovery ½ (422 Retry, `?page=99`)
* accessibility and screen sizes ½ (#1, #6)
* speed 1
* visual quality 1
* trust and sources 1

Raise it with #1 first, then #2 and #3.

**Could not check:** a real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder). A real Cognito server (STAND_IN_OFF was stubbed). A firm past 50 rows or a real 10 000-row cap (the cap was stubbed, as in B2b). A staff member without `system/firm:read` (no Sample one exists; the 403 was stubbed). `graph.mjs` (G3 276, G6 24) does not see module routes or prefixed `systemApi` calls: it lists `GET /system/me` and `POST /system/session/local` as unused although this page and its check use both. That is a tool gap, not this PR's.

**List to fix for Approve:** #1. #2-#9 are Minor: fix them now or record them on the row.

Reviewer: Block 30ce5f7606f8dfc55acfc7aab484d96a2a2c0abc
