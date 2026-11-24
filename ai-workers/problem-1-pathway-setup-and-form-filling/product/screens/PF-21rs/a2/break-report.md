# PF-21rs A2 — break report (fresh breaker, 24 Nov)

**Verdict: Changes** `074eaaae3afd0041a7b41b50d86e87c97e08507d` (local branch `local/pf21rs-a2`; A2's diff `ed99467dd..074eaaa`): no Blocker, three Majors (M1-M3), six Minors.

Scope: the breach page `/system/privacy/breaches/:id`: Edit the record and Confirm the record (PATCH of what changed), Decide, Notices to firms (one confirmed send per firm, the words as sent), History (`a2/build-notes.md`). "Send to every firm", requests and holds, and A1's list and dialog are not findings. I ran an isolated copy `rsbrk` on :4438 (AI_LIVE=off, local identities; stopped after, US$0) with Playwright, Chromium (/opt/pw-browsers/chromium) and axe-core. I added an Auditor and about 135 Sample firms by SQL: X (Owner + Admin), Y, a firm whose only Owner is SUSPENDED, Arabic, Japanese, a 200-character name with no spaces, and 120 scale firms. Paths are under `prototype/studio/web/src/modules/system/privacy/`.

## Major
**M1. When two sessions save the same breach, the later one silently wins: it drops an affected firm or overturns a decision.** This breaks STANDARDS §4 [M]: "Optimistic concurrency (version column; stale save → 409 with what changed)".
* Edit: two tabs open "Edit the record" on a breach naming X. Tab 1 adds Y and a containment and saves (200). Tab 2, still showing the old record, adds another firm and saves (200).
  * Stored: X and tab 2's firm. **Y is gone**; no warning, no 409.
  * `changeBody` (`contract.ts:180`) sends the whole `affectedFirms` list from the page's copy (`record-breach.tsx:19` `draftOf`), so firms that were added elsewhere are removed.
  * A dropped firm is never offered a notice, and the status can read "Recorded".
* Decide: tab A records "Notify firms" with why. Tab B, still showing "Decide", records "No notice" (200) over it. Only History shows both.
* The API has no version on PATCH (`api/src/platform/register/breaches/service.ts:179-196`), so the fix is shared:
  * runtime: PATCH takes `updatedAt` (or a version) and answers 409 when it is stale;
  * A2: sends the `updatedAt` it read, and on that 409 shows the API's words and reloads.

**M2. "Confirm the record" fills the box with the alert draft's internal instruction and accepts it unchanged. Those words then go to the firm and can never be withdrawn.**
* Did: drafted a breach from an `audit_chain_break` alert naming X. I opened "Confirm the record", typed only a reason and confirmed (RECORDED). Then I decided "Notify firms" and sent to X (201).
* Expected: the screen asks for the description firms will read (the dialog's own lead line is "Confirm the description firms will read"). Either the box starts empty, or the unchanged draft text is refused.
* Actual: X's notice reads "What happened: Draft from an alert (audit_chain_break, rule BR-5): the activity log's hash chain did not verify. Write the description firms will read, then confirm; nothing has been sent."
  * `draftOf` (`record-breach.tsx:19`) pre-fills `b.description`, and `changeBody` always sends it on confirm.
  * The send confirmation does not show the words, so nothing catches the mistake before it goes out.

**M3. Opening "Words sent" gives an axe serious violation (`scrollable-region-focusable`) at 1024 and 400 px, with an ordinary description.**
* STANDARDS §7 [M] requires axe-core on every screen state, and row W6 requires 0 serious.
* Did: a breach with a 520-character notice; opened each "Words sent" summary and ran axe.
* Results:
  * 1440: 0 serious; the `<pre>` is 324 px tall in a 320 px box.
  * 1024: serious, 2 nodes (344 in 320).
  * 400: serious, 2 nodes (464 in 320).
  * The 4000-character breach: serious at every width, 1440 and 200 % included.
* The `<pre>` is `max-h-80 overflow-auto`, with no tabindex and no name (`breach-page.tsx:59`). Chromium lets Tab land on it, but browsers that do not make scroll boxes focusable do not.
* The builder's W6 axe run checks the page with every summary closed (`check_pf21rs_browser.ts`), so it never sees this state.

## Minor
* **m1. A missing "Why" in Decide shows as a bare "This is required." under the audit reason, not under Why.**
  * Did: chose Notify firms, left Why empty, gave a reason.
  * The words appear in the box at the foot of the dialog. Why gets no `aria-invalid` and keeps no focus; the reason box keeps the focus.
  * Cause: `fieldErrors` knows only the record form's fields (`contract.ts:99`), so `decisionReason`, `decision` and `body` all go to `other`. The `errors.decisionReason` and `errors.body` slots (`breach-page.tsx:149`, `:151`) are never filled.
* **m2. After a refusal in a dialog, the page is not read again.** This goes against the concept §4 rule "409 words + reload".
  * A stale tab's Decide after another tab sent a notice gets 409 DECISION_KEPT in the dialog. After Cancel, the page still offers "Change the decision" and shows X as not sent.
  * A send to a firm removed in another session gets 422 "This breach does not name that firm." After Cancel, Y is still listed with "Send notice to Y" (`breach-page.tsx:144`, `:154-160`: reload runs only on success or a send's 409).
* **m3. Long firm names with no spaces push the page sideways.**
  * The "Send notice to <firm>" button is 1,298-1,438 px wide: the page scrolls sideways 655-931 px at 1024, at 400 and at 200 % zoom (`breach-page.tsx:65`, no `overflow-wrap`).
  * The confirmation's title cuts the firm's name, and the dialog scrolls sideways by 1,276-1,420 px (`:154`).
  * The History line "Notice sent to <firm>" does not wrap: 1,083 px sideways at 400 (`:135`).
  * The concept asks that long names wrap. A1's list does.
* **m4. A failed load shows the list's words and no Retry.**
  * A connection reset on the breach read shows "Could not load the breaches. Please try again." with no Retry button. Retry appears only for an API error other than 403 or 404 (`breach-page.tsx:82`).
  * A 500 shows the words "500".
* **m5. `?recorded=1` stays in the address.** After the decision ("No notice"), a reload shows "Recorded. Next: decide whether firms are told." right under "Nothing is owed." (`breach-page.tsx:75`).
* **m6. Decide and Send have no discard guard, and Send gives the focus back to the heading.**
  * Escape with a typed Why closes the dialog and drops the text; the record form asks first.
  * After Send or Cancel, the focus goes to the heading "Notices to firms", not to the firm's row. With 120 firms, getting back to the next firm takes many Tabs.
  * The focus is never lost to `<body>`.

## What held
* **One notice per firm.**
  * Two tabs sending X at the same moment: one 201 and one 409 ALREADY_NOTIFIED, shown on X's row next to its Sent line.
  * 1 notice, and 2 outbox rows (Owner and Admin).
  * 5 sends to Y in parallel by the API: one 201 and four 409s; 1 stored.
  * Enter pressed three times on Send: 1 stored.
* **Deciding during a send:** I raced "No notice" against a send 8 times. Each time either the send got 409 NOT_DECIDED_TO_NOTIFY with nothing stored, or the decision got 409 DECISION_KEPT with 1 notice. There was never a notice under "No notice". A stale send after "No notice" shows the API's words on the row.
* **Firms that cannot receive a notice or must stay named.**
  * A firm with no active Owner or Admin gets NO_RECIPIENTS words on its row. Its send stays offered, and the status stays "Notices owed" (challenge m5).
  * Removing a notified firm by the API gets 409 NOTIFIED_FIRM_KEPT. After a reload it is still listed.
  * Removing an unsent firm works, and the firm leaves the page.
  * In Edit, a notified firm shows "notified" with no Remove button.
* **The decision is fixed once a notice is sent:** no Decide or Change button, "Fixed once a notice is sent.", and DECISION_KEPT for a stale tab.
* **Words.**
  * A tampered stored file (one word changed) and a deleted file each show the R0 note "The words sent could not be read back…", for the Owner and for the Auditor. Other notices are unaffected.
  * The words stay as sent after the description is edited.
  * `<img onerror>`, `<script>` and planted "IGNORE ALL PREVIOUS INSTRUCTIONS" text in a description show as text: no element is created and nothing runs. `{{firm_name}}` is not filled in. A U+202E inside the text is refused under its field.
* **Ids.** `x`, `' OR 1=1--`, an all-zero uuid, and a 3,000-character id all show "No such breach." with no Retry and a link back. An upper-case id opens the breach.
* **Roles.**
  * Auditor: reads the notices and words, sees the read-only line, and has only the "Sign out" button. Auditor PATCH and send by the API: 403.
  * Support: sees the API's 403 words and no data.
  * Firm Owner's token: 403 on the read and the send.
* **Keyboard.**
  * Decide is 8 Tabs from the top. The dialog opens on the first radio, and the order is radio, Why, reason, Cancel, Record.
  * Enter in the reason box submits. The focus returns to "Change the decision".
  * Send opens on the reason box. "Words sent" opens with Enter.
* **Widths and budget.**
  * The usual breach, with dialogs open, at 1024, 400, 1440 at 200 % and 1024 at 200 %: axe 0 serious and no sideways scroll (with ordinary names); the dialogs' buttons can be reached.
  * 120 firms with 100 notified: GET one takes 211-284 ms (160 KB).
  * First view: 1,189 ms cold and 465 ms warm, with 2 calls (`/me` and the breach), not one per row.
  * A send including its reload: 421 ms.
* **Reload and Back.** Reload mid-dialog, or Back and Forward, stores nothing. The page comes back clean, with no dialog stuck open and no scroll lock.
* **History:** Recorded, each decision change, "Changed: affected firms" and each "Notice sent to <firm>", each with our staff member's name.
