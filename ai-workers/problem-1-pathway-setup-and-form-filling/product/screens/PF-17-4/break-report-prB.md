# PF-17 part 4, PR B: break report (24 Nov)

Breaker, did not build it. Branch `claude/runtime-pf17-screens` at `30ce5f760`. PR #3489. Scope (P-26): concept r2 §4a-§4c, BR-1 to BR-4, B1-B3 and B7-B9. Support, the ticket panel and B4-B6 are PR C: **N/A here**.

**How it was run.** App = `prototype/studio`.
* `web-fresh.sh build`, then an isolated copy `brkb` on :4455 (`AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`). Never :4400.
* Playwright from node (chromium 1243). Scripts are in the session scratchpad, not committed.
* Seeded with SQL:
  * Content publisher (Sample): a role with no keys. Billing ops (Sample). One staff member with no roles.
  * 120 Sample bulk firms.
  * Three hostile names: a 260-character name with no spaces, `<img src=x onerror=alert(1)> Sample "firm" & co`, and Arabic + CJK + a flag emoji.
  * That makes 125 firms in all.
* Copy stopped; log scanned at the end.

**Verdict: Changes.** One Major (search, chips and paging remove the page under the user's focus), five Minors. No Blocker. The two planes held every way I tried.

## Major

**M1. Every new query swaps the whole page for "Loading the firms…".** The search box, the chips and the paging buttons unmount, so:
* **Focus goes to `<body>`.**
* **Typed keys after a 300 ms pause are lost.**

Where: `firms-page.tsx:269` (the query key changes with `?q/health/page`, and there is no previous data) and `:277` (`if (!d && !list.isError) return <p …>Loading…`). The early return was meant for the first load only.

* **Repro 1 (search):** signed in as ops.sample, `/system/firms`. Focus the search box. Type `bulk`, wait 450 ms, type ` firm 01`.
  * Expected: the box reads `bulk firm 01` and focus stays in it.
  * Actual: the box reads `bulk`, `document.activeElement` is BODY, and no h1 shows mid-way (`{"tag":"BODY","h1":false,"loading":true}`).
  * Same with no added latency on the local copy.
* **Repro 2 (keyboard):** focus the "Needs attention" chip and press Enter. Focus is BODY. Then focus Next and press Enter: focus is BODY again. The keyboard user must Tab from the brand link again after every chip, page or search (B9).
* Screen readers hear the page vanish and come back. The h1 "Firms" and the table flash out on every keystroke pause.
* **Fix:** keep the old answer while the new one loads (`placeholderData: keepPreviousData` on the list query). Show "Loading…" only when there has never been an answer, or mark the table `aria-busy`. Never unmount the search box or the chips. Add to B9: type, pause, type again; assert the value and `activeElement`; the same after a chip and after Next.

## Minor

**m1. A refused address shows only "Some fields need a change."** The API's field words are dropped, and Retry repeats the same 422.
* Repro: `?health=X`, `?health=held`, `?page=0`, `?page=-3`, `?page=1e3`, `?q=`(101+ chars), or typing 120 characters in the search box.
* The API answers `fields: {health: "This is not one of the allowed choices.", page: …}`. The page shows "Not available · Some fields need a change. · Retry". Nothing is highlighted and nothing says which part is wrong. A long typed search wipes the table with no reason given.
* Concept §6 B3: "the API's field error shown". The test only matches `/highlighted|fields|change/` (`check_pf17_console_browser.ts:134`).
* Where: `firms-page.tsx:291-292` shows `error.message` only.
* Fix: list `problem.fields`, e.g. "Search: …" / "Page: …". Offer "Show all firms" (clear the address) instead of Retry on a 422. Cap the search box at 100 characters (`maxLength`), as the API does.

**m2. A page past the end says "No firms match" and "Page 4 of 3".**
* Repro: `?page=4` (125 firms) shows "No firms match. Clear the search or pick All. Previous · Page 4 of 3 · 125 firms".
* `?page=99999` shows "Page 99999 of 3", and Previous walks back one page at a time. With 2 firms, `?page=5` shows "No firms match" and "2 firms", with no paging at all.
* The API answers `firms: [], total: 125`, which is right. The page's words are wrong.
* Where: `firms-page.tsx:275, 297, 312-316`.
* Fix: when `d.page > pages`, say "There is no page N; there are M." with a link to the last page (or page 1). Do not show the empty-filter words.

**m3. The search box keeps old text when the address loses `?q`.**
* Repro: type `solo` (`?q=solo`, 1 row), then click "Firms" in the side menu (or the brand). The address is `/system/firms` and 50 rows show, but the box still reads "solo".
* Where: `firms-page.tsx:270` reads `q` from the address once.
* Fix: sync the box from `params.get("q")` when the address changes (not while typing).

**m4. The sign-in card never says why the session ended.**
* Concept §4a: "the sign-in card says why (`TOKEN_EXPIRED`, `SESSION_REVOKED`, …)". `ended` holds the code, but the card always shows the one sentence "Your session ended. Sign in again." (`contract.ts:39`, `frame.tsx:206`).
* Repro: run `update plat_system_staff set sessions_ended_at = now()…` for billing.sample, then click a chip. The card shows the same words as a clock expiry.
* Related: a firm token in `xr-system-session` gets `/me` 403 `FIRM_SESSION_REFUSED`. The card then shows no words at all (`frame.tsx:238` passes null for non-401). The firm side shows its own refusal sentence in the same case.
* Related: a corrupted key (`"abc"`, `null`, `{"token":5}`) in a tab that never signed in shows "Your session ended" (`session.ts:133`).
* Fix: map the code to words (expired, ended by a Platform Owner, not one of our staff's sessions) and show the API's `detail` for a 403 on `/me`. Treat an unreadable key as signed out, not ended.

**m5. A staff member without `system/firm:read` gets a working-looking page.**
* The words are the API's: "Your roles do not include the permission this needs (system/firm:read)." So BR-1 holds.
* Around them are the subheading "Every firm's health, plan and usage…", a live search box, the five chips, a Retry that re-sends the 403, and an empty 192 px side menu (`frame.tsx:219` renders the `<nav>` with no links).
* Repro: sign in as content.sample (screenshot taken in the scratchpad, `content-publisher.png`). `/system` also lands here (`routes.tsx:7`).
* Fix: on 403, show the h1 and the API's sentence only, with no Retry, no search and no chips. Omit the menu column when no section is allowed.

## What held
* **Planes (BR-2, B7):**
  * The firm token in `xr-system-session`, and in `xr-staff-session` alone, both give the console's card with no rows. The only call is `/api/system/me` with that token, answered 403.
  * Our token in `xr-staff-session` gives the firm's card: "An ExpatReady staff session works only in the staff console". Our token in `xr-system-session` on `/platform/team`, `/home` and `/platform/support` is never sent.
  * Both keys in one tab: every `/api/system/*` call carried ours, every `/api/platform/*` call carried the firm's, with zero crossings over 4 pages.
  * Forged or junk values in the key: no page error.
* **Session end:**
  * Expiry during a 5 s in-flight request gives the card, focus on its heading, storage cleared, and the late answer never rendered.
  * A server revocation gives a 401, then the card, with storage cleared. Signing in again works.
  * Sign out clears storage and rows.
  * Known limit, not a finding: a tab opened by `window.open` copies sessionStorage and keeps working after Sign out elsewhere. The stand-in token stays valid to its expiry. Ending it on the server is PF-4s's (§4a "Not built here").
* **Leftover data:** ops (50 rows), then Sign out, then content publisher in the same tab. Rows sampled every 50 ms: 0 ever shown. Support then sees 50.
* **Address bar:** `<script>`, 5 000 characters, CJK, emoji, a broken `%E0%A4%A`, `%00%0a`, and a 5 000-character `?health` / `?page`. None gave a blank page or a page error. Every case shows rows, the empty words or the error notice (m1).
* **Paging:** 125 firms read as 50/50/25, "Page n of 3 · 125 firms", 125 unique ids. `?q=bulk&page=3` gave 20 rows, `?health=ATTENTION&page=3` gave 23 of 123. Both agree with the API.
* **Hostile and long names:** the `<img onerror>` name renders as text (0 `<img>` in the table). The 260-character name wraps: 506×137 px at 1440, and 160 px wide at 375 inside the table's own scroll box.
* **Widths:** no sideways page scroll at 320, 375, 1024, or 720 CSS px at device scale 2 (1440 at 200 %). The table scrolls in its box (`overflow-x: auto`).
* **Accessibility:** axe WCAG 2.2 A/AA gave 0 violations at 1440 and 375 and on the sign-in card. The Tab order is logical and every control is named (brand, Sign out, Firms, crumb, search via sr-only label, chips with `aria-pressed`, the focusable table region, Next). No keyboard trap.
* **Sign-in card:** an empty or unknown email shows the server's sentence. `" OPS.Sample@…"` signs in (trimmed; the case is the API's).
* **Personal data:** `scan-logs.ts var/isolated-logs/brkb-api.log` found 0 in 1 441 lines. A grep found no email addresses and no tokens, including after a sign-in attempt with a private-looking Gmail address.
