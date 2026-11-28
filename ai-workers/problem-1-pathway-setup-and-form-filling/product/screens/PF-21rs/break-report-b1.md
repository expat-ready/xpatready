# PF-21rs B1 — break report (PR #3818, head 0a4e2c0ec)

Scope: "Data requests to us" `/system/privacy/requests` and `/:id` (`requests-page.tsx`, `request-page.tsx`, `requests.ts`) over `/api/system/register/requests`, plus the breach page fix (change dialogs open on a fresh read). Not findings: "Hold this person", holds pages, "Send to every firm", no idempotent create for requests (challenge m3: runtime gap, Not built). The API checking neither person nor firm is concept M4's logged runtime gap.
Setup: isolated copy `pf21rsk` on :4439 (AI_LIVE=off, local identities; never :4400; stopped after). Platform Owner, Support (seeded), an Auditor added by SQL, a firm Owner's token (`representative@sample-firm`). Playwright, Chromium headless shell 1243, axe-core. Paths below are under `prototype/studio/web/src/modules/system/privacy/`.

## Verdict
**Fix first.** One Blocker in the breach-page fix (it brings back the stale overwrite that Break M1 had closed), two Majors on the request page, six Minors. The request pages themselves hold well on roles, dates, text, widths and the Toronto maths.

## Blocker
**B1. "Change the decision" opens with the decision from before the fresh read, and the stale check now passes, so a colleague's decision is overwritten without a word. This is a regression.**
* Repro: breach decided "No notice". Tab A opens the breach page. The API (a colleague) changes it to "Notify firms" with its why. Tab A clicks "Change the decision". The card behind now shows the fresh decision, but the dialog has **"No notice" pre-checked**. Type a Why and a reason, then "Record the decision": the page says "Decision recorded." and the server holds `NO_NOTICE`, "Sample: still no risk". The colleague's decision is gone and no stale notice appeared.
* Cause: `opening()` calls the `open` closure built when the button was clicked. That closure runs `setChoice(b.decision …)` with the **old** `b` (`breach-page.tsx:140`), while `seenAt` is set from the fresh read (`:95`), so `unchanged()` sees no change. Before this PR, `unchanged()` compared with `one.data` and returned STALE in this exact case. That was the A2 Break M1 guard ("a stale page never overwrites"); this PR undid it for Decide.
* Expected: after the fresh read, the dialog takes its values from that read (choice from `r.data.decision`), or STALE when the fresh read differs from what the page showed. Edit does it right (see Held).

## Major
**M1. Request moves have no stale check: a move from a page that is out of date goes through from a status the person never saw.**
* Repro: open one request in tabs A and B (Pending). A: "Start work" → In progress. B, still showing Pending: "Put on hold" → 200, Held. A, still showing In progress: "Mark completed" with what was done → 200. A completed a request a colleague had just put on hold and never saw the hold. Steps: Pending→In progress→Held→Completed.
* The same PR adds a fresh-read check to the breach dialogs. `request-page.tsx:25-32` posts with no read first and no version. Expected: read the request before the move and refuse (and reload) when its status differs from what the page shows, as `unchanged()` does on breaches.

**M2. "Log a request" takes a typed firm id. An id that is not a firm is stored with no warning.**
* Repro (UI or API): Firm id `11111111-1111-4111-8111-111111111111` plus any person id → 201. The list and the request show "Firm 1111…1111" on a register kept for years. `requests-page.tsx:47` is a plain text input, though `record-breach.tsx:22` already has the firm picker that challenge M4 asked for ("the firm picker plus Person record id"; concept §4b "firms picked from the list"). The API not checking the firm is the logged runtime gap; choosing a raw id field is the screen's choice.

## Minor
* **m1. A refused move leaves the page stale.** After B's 409 "The request is already in that status; nothing was changed." (the API's own words, correctly shown), Cancel leaves B on "Pending" with "Start work" and "Put on hold", which fail again. Concept §4 states: "conflict (409 words on the row + reload)". `request-page.tsx:31` does not invalidate the cache.
* **m2. Focus is lost after a move.** Keyboard only at 400 px: "Start work" → Enter → note → "Start work" → the move is saved, and `document.activeElement` is BODY. The returnFocus target (`:97`) is the first move button, which re-renders with new keys when the status changes. The `role=status` line is announced, but the next Tab starts from the top of the page.
* **m3. Firm id without a person id (or the other way round) gives "This is not in the expected format." under the empty field.** `logBody` always sends both (`requests.ts:69`), so the API's own words "Name the firm and its person together, or neither." can never show. Focus does go to the field.
* **m4. The move dialog has no discard guard.** Up to 2,000 characters typed in "What was done", then Escape or the overlay → lost with no confirm (`request-page.tsx:35` has no `guard`; "Log a request" asks "Discard your unsaved changes?").
* **m5. The person record id is shown only as `0b09…e7a5`, with the full id in a `title`.** Keyboard, touch and 375 px readers cannot see or copy it, and the concept sends people to paste that id into the hold dialog's Advanced (`request-page.tsx:81`).
* **m6. "46320 days late"** for a request received 1 Jan 1900 (the API's lower bound): no thousands separator (`requests.ts:46-50`). Cosmetic.
* Observation, not counted: from Toronto midnight until the 07:20 daily check, a request past its target shows "1 day late" in red next to "○ Pending". This follows BR-5 (only the check sets Overdue), but it reads as a contradiction.

## Held
* **Roles:** Auditor and Support (no key) on the list and on one request by address → "Not available: Your roles do not include the permission this needs (system/compliance:dsr-manage).", no table, no Retry, no "Requests to us" menu link. A firm token: 403 FIRM_SESSION_REFUSED on list, read, log and move by API; in the console it gets the frame's refusal and no data. Signed out → sign-in card.
* **Double submits:** double-clicking "Log the request", Enter pressed twice in a field, and double-clicking a move's submit each saved once. Four concurrent API moves → one 200 and three 409 SAME_STATUS, with one step.
* **Refused moves in the API's words:** MOVE_REFUSED (Held from Completed), SAME_STATUS, Overdue by hand (422 under status), blank or whitespace "What was done" → "This is required." under the field, with focus moved there. Completed shows "nothing more can be changed".
* **Dates:** future → "The day received cannot be in the future." (the picker's `max` is Toronto's today); 1899-12-31 → "A date from the year 1900."; an empty date → field error. 1900-01-01 is accepted and shows Overdue at once.
* **Toronto maths** (browser clock fixed, five browser time zones: Tokyo, Kiritimati, Toronto, Pago Pago, UTC): target 26 Nov shows "in 1 day" at 25 Nov 23:00 Toronto, "today" at 26 Nov 22:30 Toronto (27 Nov in Tokyo), and "1 day late" at 27 Nov 00:01 Toronto. "Received on" defaults to Toronto's day in every zone.
* **Text:** control characters (BEL) and bidi marks in the email are refused under the field; 201 characters → "at most 200". A 200-character name with no spaces, a 320-character email, and 2,000-character notes and actions wrap at 375 / 400 / 1024 with no sideways page scroll. Arabic, CJK and accented names render. `<script>`/`<img onerror>` in a note shows as text.
* **Widths and a11y:** axe (WCAG 2.2 A/AA) found 0 violations on the list, a long request, a completed request, and the Log dialog at 375 / 400 / 1024. The table scrolls inside its box. Keyboard: "Log a request" is reached by Tab, the dialog opens on Type, and refusals move focus to the field.
* **Status chips:** All / Pending / In progress / Completed / Overdue / Held filter on the server, use `aria-pressed`, a word plus a shape (never colour alone), and show "No request has this status." when empty.
* **Breach fix, Edit:** after the description changed elsewhere, "Edit the record" opened on the fresh words. Three rapid clicks → one GET and one dialog. Decide after a notice was sent elsewhere opens anyway (the button vanishes behind it), and submit shows the API's "Notices were sent, so the decision … stay as they are." (409 words, nothing changed).

Screenshots (scratchpad, not committed): `breach-decide-stale.png`, `twotabs-b.png`, `long-375.png`, `list-375.png`, `keys-400.png`.
