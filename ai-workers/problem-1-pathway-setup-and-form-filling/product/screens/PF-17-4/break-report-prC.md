# PF-17 part 4, PR C: break report (24 Nov)

## Round 2 (head `3c703b985`, 24 Nov): verdict **Approve**

I re-ran every round-1 attack against the delta.
* Isolated copy `brkc2` on :4475, after `web-fresh.sh build`, never :4400. Seeded the same way: the four extra staff roles and 67 tickets.
* New attacks: a 409 on a slow server (1.2 s), the last ticket in a filter replied to, row clicks on cells and links, a drag-select inside a row, escaped hostile ids, and the past-end and empty-filter buttons by keyboard.

**Blockers: none. Majors: none.** Both Majors are fixed:
* **M1 fixed.** Closed under the panel, then Send gives "This ticket was closed while you were writing. Your reply was not sent."
  * The header and the row turn Closed, the box goes and the closed notice shows. Nothing is stored.
  * On the slow server the box is read-only and Send is disabled until the refetch lands.
* **M2 fixed.** After a reply under New, and under All when the ticket moves to page 2, Escape focuses the first listed row's button.
  * When the replied ticket was the last one in the filter, focus goes to the h1. A panel opened from the address goes to the first row.
  * A ticket still listed gets its own row back.

The fixed Minors:
* **m1 fixed.** A no-space subject wraps: `h2` right edge 311 px against the Close button at 327 px (375 px wide), and 256 against 272 at 320. No overflow in the dialog.
* **m2 fixed.** `?page=3`, `?page=99999` and `?status=CLOSED&page=2` show "No tickets on this page. Go to page 1". An empty filter shows "Show every ticket".
* **m4 fixed (busy part).** Text typed during a 1.5 s send is refused (the box is read-only). A double-click still stores one message.
* **m5 fixed (announcement part).** The `role=status` says "Reply sent. The ticket is now waiting on the firm." A later 422 clears it.
* **m6 fixed.** The closed words now match the API (BD-1).
* **m7 fixed (the parts claimed).**
  * `?ticket=../../firms` and `x/../../../firms` are sent escaped (`..%2F..%2Ffirms`) and give "No such support ticket"; no `/api/system/firms` call.
  * The message bodies and the reply box have `dir="auto"`.
  * A click on any non-link cell opens the ticket, and the firm link still filters.
  * Field names now show as labels ("Status:", "Page:", "Reply:").

**Still held:**
* The keys: Billing gets the no-key sentence, the Auditor gets the read-only words.
* The planes, unchanged on the API.
* A revoked session on Send stores nothing and shows the card.
* No page-level sideways scroll at 1440, 1024, 375 or 320.
* axe found 0 issues on the list and the panel at all four widths.
* `window.__xss` was never set.
* `scan-logs.ts brkc2-api.log`: 0 findings in 968 lines; no 5xx and no tokens (warn lines are only 401/403/404/409/422).

**New Minor (does not block):**
* **r2-1. A drag-select inside a row opens the ticket.** A whole-row click now opens the panel, so selecting a raiser's name or a page path to copy it opens the panel on mouse-up, and the selection is lost.
  * Repro: drag across the Page cell of row 5. `?ticket=` is set.
  * Where: the row's `onClick`, `support-page.tsx` (the `data-ticket-row` `<tr>`).
  * Fix: return early when `getSelection()?.toString()` is non-empty.

**Accepted follow-ups (not re-raised):**
* m3: focus after Clear firm, Clear filters and the last Next. The new "Go to page 1" and "Show every ticket" buttons also leave focus on `<body>`; they belong to the same follow-up.
* m4: the draft is still lost on Back, reload or session end.
* m5: focus after Send still lands on the dialog container.
* m7: no counter on the reply box, and "Clear firm: this firm".

---

# Round 1 (head `67aece028`)

Breaker, did not build it. Branch `claude/runtime-pf17-support-page` at `67aece028`, PR #3517. Scope (P-26): concept r2 §4d, §4e, BR-1, BR-5 to BR-7, B4-B6. Not built (not findings): internal notes, assignment, priority, firm detail, country/contact/recent tickets in the panel.

**How it was run.** App = `prototype/studio`. `web-fresh.sh build`, then isolated copy `brkc` on :4469 (`AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`, never :4400). Playwright from node (chromium 1243) plus `fetch` for the API. Scripts and screenshots stayed in the session scratchpad (not committed).
* Seeded with SQL: Billing, Auditor, Content publisher and a second Support member.
* 66 tickets: 60 bulk (paging); `<script>`/`onerror` in the body; a 4 000-character body with no spaces; Arabic + CJK + flag + U+202E; one closed; one in firm B; one "race" ticket that I closed with SQL while the panel was open.
* Copy stopped at the end and the log scanned.

**Verdict: Changes.** Two Majors, both small fixes in `support-page.tsx`. No Blocker. The planes, the keys and the rendering of hostile text all held.

## Major

**M1. A ticket closed while the panel is open: the 409 shows, but the composer stays live and the header still says "New" (BR-7: "409 shown in the panel, composer read-only").**
* Repro: as support.sample, open `?ticket=<open id>` and type a reply. Close the ticket underneath (`update platform_support_ticket set status='CLOSED'`). Click Send reply.
* Actual: "A closed ticket takes no new message: raise a new ticket instead." The header still reads "Sample immigration firm · Team (Sample) · New · 14 min old". The textarea is editable and Send stays enabled, so it can be pressed again for the same 409. The closed notice (`data-reply-closed`) never appears, and the queue row is not refreshed.
* The API's sentence is written for the firm ("raise a new ticket") and tells our staff something they cannot do.
* Where: `support-page.tsx:30`. The catch only sets the error. The ticket and the queue are refetched only on success (`:28-29`).
* Fix: on a 409, `invalidateQueries` for `["sys","ticket",id]` and `["sys","queue"]`. The panel then re-renders the closed notice in place of the form. Show our own words ("The firm closed this ticket while you were writing; your reply was not sent"). Add the race as a B5 fail case.

**M2. After a reply, closing the panel drops focus to `<body>` whenever the ticket leaves the list. In the main workflow, that is every reply.**
* Repro 1: on `?status=OPEN`, focus a row, press Enter, type, Tab to Send reply, Enter. The ticket becomes "Waiting on firm" and its row leaves the New list. Press Escape: `activeElement` is BODY.
* Repro 2: under All with more than 50 waiting tickets, reply to row 2. The server moves the ticket below the waiting ones, onto page 2. Escape gives BODY again.
* Escape without a reply returns focus to the row correctly (held).
* Where: `support-page.tsx:109`. `returnFocus={() => opener.current}` returns a detached button. The shared `Panel`'s own contract (`controls.tsx:104-106`) says to pass "the next one when that row left the list".
* A keyboard or screen-reader user working the "New" or "Waiting on us" queue must Tab from the top after every ticket (WCAG 2.4.3, B9c).
* Fix: remember the row's index when the panel opens. On close, focus the opener if `isConnected`. Otherwise focus the row now at that index, or the h1 when the list is empty. Add to B9c: reply under New, Escape, assert `activeElement` is a row button.

## Minor

* **m1. Unbroken text in the subject runs out of the panel.** A 4 000-character body with no spaces makes an 80-character "WWW…" title. The `h2` is 1 498 px wide in a 375/560 px panel (dialog `scrollWidth - clientWidth` = 1 148 at 375, 963 at 1024). The title runs off-screen and is painted across the Close ×; the hit-test still reaches the button.
  * The message bodies wrap correctly (`:44`).
  * Fix: pass the title with `[overflow-wrap:anywhere]` (or `break-words min-w-0`) at the panel's title. The list's subject button already has it (`:94`).
* **m2. A page past the end says "No tickets here. Pick All to see every ticket."** This is the PR B m2 that was fixed on Firms. Repro: `?page=3` and `?page=99999` with 66 tickets, and `?status=CLOSED&page=2`. All is already pressed, and there is no paging and no way back except a chip (`:91`, `:105`). Fix: Firms' "No tickets on this page. Go to page 1".
* **m3. Focus drops to `<body>` after "Clear firm", "Clear filters", Next on the last page, and Escape on a panel opened from the address.** The control unmounts or becomes disabled, or there is no opener (`:84`, `:88`, `:108`, `:109`). This is the same family as PR B r2-2. Fix: focus the h1, or the remaining chip or button.
* **m4. A reply draft is lost without warning.**
  * Browser Back, reload, or our session ending (revoked, or the timer) while typing all lose the reply. After signing in again, `?ticket=` reopens the panel with an empty box.
  * Text typed while a send is in flight is wiped: the textarea stays editable while `busy`, and success calls `setBody("")` (`:28`). I typed "typed while sending" during a 1.5 s send, and it was gone.
  * Fix: make the textarea `readOnly` while busy. Pass `confirmClose` when the box has text. Keep the draft per ticket in `sessionStorage` until it is sent.
* **m5. A sent reply is not announced, and focus lands on the dialog container.** Send disables itself while busy, so focus falls back to the dialog `DIV`. No `role=status` says "Reply sent". Fix: announce it and move focus back to the textarea.
* **m6. The closed-ticket words are untrue.** "The firm can reopen it by writing again" (`contract.ts:126`, concept §5 copy). The API refuses any message on a closed ticket ("raise a new ticket instead"; `support.ts:59, 211`), and a trigger makes CLOSED final. The text is the concept's own, so this goes to `challenge.md` rather than being changed silently. Suggest: "This ticket is closed. The firm can raise a new one."
* **m7. Small things.**
  * The ticket id goes into the path unencoded (`:21`, `:27`): `?ticket=../../firms` makes the panel GET `/api/system/firms`, which then shows "Could not load the support queue". There is no harm (the server checks for a UUID, and it is the same token and plane). Use `encodeURIComponent`.
  * `?firm=<UPPERCASE uuid>` or a firm with no row on the page shows "Clear firm: this firm".
  * `?status=` (empty) presses no chip.
  * There is no `maxlength`/counter for the 5 000-character limit: the API's 422 comes only after Send.
  * Message bodies have no `dir="auto"`, so Arabic aligns left.
  * Only the subject opens a ticket (concept §4d: "Whole row opens the ticket").

## What held

* **Keys (BR-1).**
  * Billing: Support is hidden in the nav. `/system/support?ticket=…` shows only the h1 and the API's sentence "(system/support:list)", and makes no ticket call.
  * Content publisher: the same, with an empty nav.
  * Auditor: reads the queue and the ticket, has no composer, and sees "You can read this ticket. Replying needs the support manage key."
  * API: Billing and publisher get 403 on list, one and reply. Auditor gets 403 on reply. No token gives 401.
* **Planes (BR-2).** A firm token at all three routes gets 403 `firm-session-refused`. Our token at `/api/support/tickets` gets 403. A firm token planted in `xr-system-session` gives "Could not check who is signed in" after only a `/me` call, and no ticket call.
* **Ids.** Bad id and unknown UUID give "Not available · No such support ticket." An uppercase id resolves. A closed ticket shows its thread and the closed notice, with no form.
* **Replies.**
  * A double-click, and a forced second click during a 1.5 s send, store exactly one message. (Two parallel API POSTs store two: that is part 2's API, not this page.)
  * Blank gives "body: write what you need help with…" with `aria-invalid`. 6 000 characters gives "body: at most 5000 characters". `<script>`/RTL/HTML in a reply is stored and shown as text.
  * The header turns "Waiting on firm" after a reply. The queue refetches and the row moves, in the server's order (BR-6).
  * A revoked session on Send stores nothing and shows the card with the reason.
* **Addresses.**
  * `?status=open`, `?status=<script>`, `?firm=abc`, `?page=0|abc|100000` and `?x=1` show the API's field words with "Clear filters".
  * The h1 and chips are never blank, with no page error and no console error beyond the expected 4xx.
* **List.** Rows match the API order exactly (50 on page 1, 16 on page 2). Firm name and plan ("Team (Sample)") show on every row and in the panel header (BR-5).
  * Enter on a chip or a firm link keeps focus on it (no PR B M1 repeat).
  * Escape returns focus to the opening row.
  * Back closes the panel and focus lands on the row.
* **Rendering.** `window.__xss` is never set by the list or the panel. Long bodies wrap.
  * No page-level sideways scroll at 320, 375, 1024, 1440 or 200 %. At 320/375 the panel is one full-width pane, and Send reply is 44 px tall.
  * axe found 0 issues on the list and the panel at 1440, 1024, 375 and 320.
* **Data in the browser.** The ticket answer carries only its own firm: id, key, name, plan, the raiser's display name, and messages. The only email in any `/api/system` answer is the signed-in staff member's own (`/me`). There is no `localStorage`.
* **Log.** `scan-logs.ts brkc-api.log`: 0 findings in 1 270 lines. There are no 5xx and no tokens. The warn lines are only the expected 401/403/404/409/422.
