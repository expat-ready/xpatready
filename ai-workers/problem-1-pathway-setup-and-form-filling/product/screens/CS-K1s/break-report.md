# CS-K1s break report: Clients list, client page, "Open a case?" (R1.72, QA-593)

**Breaker:** fresh Opus 5.5, 20 Nov 2026. **Commit tested:** `47debd8cbf5caa8fc772a24f2eb85a1dae442f26` (checked with `git rev-parse HEAD` before the copy started). While I worked, the builder committed `3d4787466` on the same branch. It changes only `tests/check_bk4a.ts` (1 line), so the app is identical and every finding below also applies to `3d4787466`.
**Copy:** `zsh studio/tools/isolated.sh csk1s_break 4445 start --ttl 60 PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500`. The web bundle was rebuilt by the script and the copy is now stopped. Live AI off, US$0. My scripts were Playwright and fetch, kept in the session scratchpad (`brk/*.ts`, screenshots in `brk/shots/`). No code was edited.
**Scope:** brief `design/build-lead-c-briefs/CS-K1s.md` (Build items 1–4), with the PR body's deviations 1–7 accepted as stated.

## Verdict: **Block** on `47debd8c` (one Major)

## Major

**M1. In the solo firm, or whenever the browser's simulated person belongs to another firm, "Open the case" opens the case and then lands on "This case could not be opened · No such case".**
- **What happens:** the card posts with the staff session (bearer token). It then calls `nav('/cases/<id>')` (`web/src/runtime/clients.tsx:205`). But `/cases/*` (`RuntimeApp`) reads the case as the browser's *simulated* person (`xr-actor`), not as the signed-in staff member. In a fresh browser that person becomes the Case officer `user-O`, who belongs to `sample-firm`.
- **Steps (fresh browser, no person chosen):**
  1. Sign in as `sample-solo` / `user-S` (Solo representative).
  2. Open `/clients`, open a won client, and press "Open the case".
- **Expected:** you land on the new case (Build 3, DW3: "lands on it"). The caller asked specifically: "the case lands on a page the person can actually see".
- **Actual:**
  - One case is made (DB count 1). The URL becomes `/cases/<id>`, and the page shows the toast "Case C-2026-00002 opened" next to the danger notice "This case could not be opened · No such case". A second toast says "Now: Case officer (simulated)" (screenshot `brk/shots/b1-solo-landed.png`).
  - The API agrees: `GET /api/runtime/cases/<id>` returns 404 for `x-actor: user-O` and `user-R`, and 200 only for `user-S` and `user-P`.
- **Same root cause, other paths:**
  - (a) A `sample-firm` staff member whose picker last showed "Solo representative" opens a firm A case and also lands on "No such case" (`brk/shots/b1b-a-staff-solo-person.png`).
  - (b) The client page's case links (`clients.tsx:176`) lead a solo staff member to the same 404.
  - (c) In the same frame, the new "Clients" entry lists the solo firm's clients while its "Cases" neighbour lists `sample-firm`'s cases (as `user-O`). Two firms appear side by side under one menu.
- **Why Major, not Minor:** one of the two seeded firms can never see the result of its click without knowing to change "Acting as". The page tells them the case does not exist, and a retry is refused with `OFFER_USED`. No data is wrong (exactly one case, in the right firm), so it is not a Blocker.
- **Missing test:** the suite never sees this because every tab pre-sets `xr-actor` to a person of the same firm (`tests/check_csk1s_clients_browser.ts`, `tab(token, actor = "user-O")`; DW5 sets `user-S`). A fail test needs a fresh browser signed in as `sample-solo`.

## Minor
- **m1. Focus goes to `<body>` after a 409.** When `OFFER_USED` disables the button (`clients.tsx:228`, `disabled={done}`), the keyboard focus that was on it is lost (measured: `document.activeElement` = `BODY`). The `role="alert"` is still announced. After a successful keyboard open, focus is also on `BODY` on the case page.
- **m2. Clients made while the list is open are left out, and the count is wrong.**
  - Steps: open `/clients?q=Bulkz` (55 matches), add 5 more matching clients, then press "Show more".
  - Result: 55 rows, each once (good), but it reads "55 of 55 clients shown" and "Show more" disappears. The 5 new clients (60 in total) only appear after a reload. Page 1 and `total` are never re-read (`clients.tsx:114`, `:140`).
- **m3. A search too long for the server leaves no easy way out.**
  - Steps: open `/clients?q=<450 characters>`.
  - Result: "The search could not be run · Keep the search to 200 characters". "Try again" repeats the same request and there is no "Clear search". The box holds all 450 characters even though it has `maxLength={200}` (`clients.tsx:126`, `:129`).
  - With 201–400 characters the server cuts to 200 without saying so (`contracts/runtime.ts:49`: `max(400, "…200 characters")`, pre-existing).
- **m4. A control character typed in the search is kept and echoed.** For `\u0007\u0001ab`, the address and the "… shown for "␇␁ab"" line keep the control characters (the server drops them and matches "ab"). This is cosmetic only.
- **m5. Long names fill the breadcrumb.** At 200 % zoom (720 CSS px) a 152-character name wraps to 4 lines in the header crumb and pushes the Back row to about 250 px high (`brk/shots/h-Exp-zoom.png`). There is no sideways scroll.
- **m6. The `NO_CASE_USER` refusal can be repeated.** A `CASE_OFFICER`-role staff member with no case user sees the button, and every press answers "Your sign-in is not linked to a case user yet…". The button stays on, so it can be pressed again with the same answer. The words are right and no case is made.

## What I tried and what held
| Attack | Result |
|---|---|
| Double / mashed clicks: 5 synchronous `el.click()` + Enter on the button | **Held:** 1 POST, 1 case (`sending` ref) |
| 12 parallel `open-case` POSTs from two firm A sessions | **Held:** one 201, eleven 409 `OFFER_USED`, 1 case |
| Two browser tabs pressing at once | **Held:** one lands; the other shows `OFFER_USED` words in `role="alert"`, button off, the new case listed below (`b3-loser.png`) |
| Undo convert (withdrawn) | **Held:** read gives `WITHDRAWN` + server words; POST 409 `OFFER_WITHDRAWN`, no case. Re-convert reopens the offer on the same client (one client per prospect) |
| Used offer | **Held:** read gives `USED`; the card is gone after Back (cache invalidated) and the case is listed |
| Changed offer | A real `CHANGED` could not be made: the DB link check refuses a kind change. Covered by the suite's routed 409 and FO-8's unchanged in-transaction re-check. Not re-proved |
| Other firm (A↔B), offer / client / open-case | **Held:** 404 "No such client" on page and API, no name shown |
| Roles | **Held:** READ_ONLY sees the card, "Ask someone who can open cases.", no button, POST 403. No role: no "Clients" entry, `/clients` and `/clients/:id` show the no-access page, API 403. No session: sign-in card (the menu shows, deviation 5) |
| Session ended mid-click: second sign-in elsewhere | **Held:** "Signed in elsewhere", 0 cases |
| Session expired in storage mid-click | **Held:** sign-in card, 0 cases |
| Garbage token | **Held:** 401 `TOKEN_REFUSED` |
| Reload while the POST is in flight | **Held:** no ghost or second case; the card is back and can still be used |
| Odd ids: `abc`, NUL, U+202E prefix, 3000 / 5000 chars, SQL text, the other firm's id | **Held:** 404 page or "No such client"; `/<id>/extra` gives "Page not found"; an upper-case UUID resolves to the same client (harmless) |
| Search `%`, `_`, `\`, `%%%_`, SQL text, blanks, NUL | **Held:** taken literally, "No client matches …"; a blank or NUL-only search lists all |
| Hostile names: 150-char word, 199×"W", Persian/Arabic RTL, emoji ZWJ + flag, CJK, `<img onerror>` | **Held:** shown as text, no dialog or script, `overflow-wrap:anywhere`, no sideways scroll at 1024 px, 1440 px and 200 % zoom; axe clean (0 violations) on the card pages tried |
| U+202E, zero-width and padded names | **Held:** refused by the DB check `case_client_display_name_check`, so they never reach the screen |
| Name outside 2–120 characters | **Held:** a 1-char name gives "Not set" plus the blocked sentence and no button. A 152-char name is shown cut to 120, exactly what the opening pre-fills |
| Offer read leaks | **Held:** only `combination{id,label}`, `principalName`, `representative{staffId,name}`, `wonVia`, `prospectNumber`. No e-mail, phone or residence; another firm's client is 404; strict schema |
| Keyboard only | **Held:** "Clients" entry, search, row links and "Open the case" are all reachable by Tab (8 Tabs from page load), and Enter opens and lands |

## Not findings (out of this row)
- FO-8 never makes a client for a prospect whose name holds an emoji ZWJ, U+202E or a zero-width character. The poll logs "3 won prospect(s) not taken in" on every pass. This is a pre-existing FO-8 behaviour, so it is noted for the area owner, not for this row.
- `/clients/%2e%2e` is turned into `/` by the browser.

## Re-check on 43d6ad78 (20 Nov 2026)

**Commit tested:** `43d6ad78df1d4687a04a65e3b2c7ac3a6dc8b342` (`git rev-parse HEAD`). I read only `git diff 47debd8c..43d6ad78` (`api/src/clients.ts`, `web/src/runtime/clients.tsx`, the suite, and the one-line `check_bk4a.ts` from `3d4787466`).
**Copy:** web rebuilt with `npx vite build web`, then a fresh isolated copy `csk1s_break` on :4445 with the same flags. The bundle carries `viewer_actor_id`. The copy is stopped again. No code edits, US$0.

### Verdict: **Approve** on `43d6ad78`
M1 is fixed on every path I reproduced. No Blocker or Major remains. Two Minors are left, listed below.

### M1: fixed
| Re-run | Result |
|---|---|
| Fresh browser, `sample-solo` / `user-S`, "Open the case" | Lands on C-2026-00001 and shows the case. The person becomes `user-S`, and the notice says "Now: Solo representative (simulated)…". 1 case (`shots2/r1-solo-fresh.png`) |
| Same fresh browser, case link on the client page | Shows the case, as `user-S` |
| `sample-firm` sign-in (`user-R`) with the picker on Solo representative, "Open the case" | Lands on the case as `user-R`; the notice says "Now: Representative (simulated)". 1 case |
| Same setup, case link by click, by keyboard Enter, and by Ctrl-click into a new tab | Each one shows the case, as `user-R` |
| 5 synchronous clicks (regression check) | 1 POST, 1 case, lands on it |

### What changed: break-it pass
- **Staff with a null `actor_id`** (CASE_MANAGER, signed in by e-mail): the client read gives `viewer_actor_id: null`. "Open the case" answers `NO_CASE_USER`, the button turns off, the alert takes focus, and no case is made. Held.
- **Staff with a made-up actor id** (`brk-co-…`, CASE_OFFICER): Enter on the button gives `NO_CASE_USER`, the button turns off, and focus moves to the alert (m1 and m6 fixed). The person is not switched (the `isFirmStaff` guard). Held.
- **A firm A staff row carrying a client's simulated id** (`user-P`, which the DB accepts): `actAs` switches nothing (`isFirmStaff`). Another firm's staff id (`user-S`) or `user-O` is refused by the DB's `platform_staff_actor_id_key`. Held.
- **m1 fixed:** with `OFFER_USED` from another tab, the button turns off and focus moves to the alert (`data-offer-refusal="OFFER_USED"`).
- **m3 fixed:** `?q=<450 x>` is cut to 200 characters in both the box and the address. It then shows "No client matches…" with Clear search, instead of an error with no exit.
- **m4 fixed:** for `?q=␇␁Mixed`, the box and the address both hold `Mixed`, and the line reads "1 of 1 client shown for "Mixed"". A search of control characters only clears the search.
- **m2 partly fixed:** add 5 clients while the list of 55 is on screen, then press "Show more". The count now reads truthfully "55 of 60". But the 5 new clients (newest first, so they belong on page 1) are still not shown, and "Show more" goes away, so only a reload reaches them. Minor (r2).
- **The person switch is not confined to one tab:** `actAs` writes to the shared `localStorage` person, so other tabs of the same browser also change person. This is how BK-4a works ("one current person"), and the switch is announced, so it is not a finding.

### Minors still open on 43d6ad78
- **r1. A staff member with no simulated case person still lands on "No such case".** This covers an `actor_id` that is null or not a simulated firm person.
  - Steps: such a staff member (here CASE_MANAGER, or the `brk-co-…` CASE_OFFICER), with the browser's person on another firm's (Solo representative), clicks a case link on the client page.
  - Result: "This case could not be opened · No such case" (`shots2/r3-null-link.png`, `r4-link.png`), from `clients.tsx` `actAs`, which does nothing when there is no firm-staff id.
  - Why Minor: such staff cannot open cases (`NO_CASE_USER`), and the case pages only know simulated people. With the default person (Case officer of the same firm) the link works.
- **r2. Clients made while the list is open stay unreachable without a reload** (the remainder of m2, above). **m5** (the long-name breadcrumb at 200 % zoom) is left as is, as stated.
