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
* **One notice per firm:** two tabs sending X at once gave one 201 and one 409 ALREADY_NOTIFIED (on X's row, next to its Sent line): 1 notice and 2 outbox rows (Owner, Admin). Five parallel API sends to Y: one 201, four 409s, 1 stored. Enter pressed three times on Send: 1 stored.
* **Deciding during a send** (8 races of "No notice" against a send): either the send got 409 NOT_DECIDED_TO_NOTIFY and nothing was stored, or the decision got 409 DECISION_KEPT with 1 notice. There was never a notice under "No notice". A stale send after "No notice" shows the API's words on the row.
* **Firms:** no active Owner or Admin → NO_RECIPIENTS words on the row, the send still offered, "Notices owed" (challenge m5). Removing a notified firm by the API → 409 NOTIFIED_FIRM_KEPT, still listed after a reload. An unsent firm can be removed and leaves the page. In Edit, a notified firm shows "notified" with no Remove.
* **The decision is fixed once a notice is sent:** no Decide or Change button, "Fixed once a notice is sent.", DECISION_KEPT for a stale tab.
* **Words:** a tampered file (one word changed) and a deleted file each show R0's note "The words sent could not be read back…", to the Owner and the Auditor; other notices are unaffected. The words stay as sent after the description is edited. `<img onerror>`, `<script>` and planted "IGNORE ALL PREVIOUS INSTRUCTIONS" show as text and nothing runs; `{{firm_name}}` is not filled in; U+202E is refused under its field.
* **Ids:** `x`, `' OR 1=1--`, an all-zero uuid and a 3,000-character id → "No such breach.", no Retry, a link back. An upper-case id opens the breach.
* **Roles:** the Auditor reads the notices and words, sees the read-only line, has only "Sign out"; its PATCH and send by the API → 403. Support sees the API's 403 words and no data. A firm Owner's token → 403 on the read and the send.
* **Keyboard:** Decide is 8 Tabs from the top. The dialog opens on the first radio; the order is radio, Why, reason, Cancel, Record. Enter in the reason box submits, and the focus returns to "Change the decision". Send opens on the reason box. "Words sent" opens with Enter.
* **Widths and budget:**
  * The usual breach with dialogs open, at 1024, 400, 1440 at 200 % and 1024 at 200 %: axe 0 serious, no sideways scroll (ordinary names), the buttons reachable.
  * 120 firms, 100 notified: GET one 211-284 ms (160 KB). First view 1,189 ms cold, 465 ms warm, with 2 calls (`/me` and the breach), not one per row. A send with its reload: 421 ms.
* **Reload and Back:** reload mid-dialog, or Back and Forward, stores nothing. The page comes back clean, with no dialog stuck open and no scroll lock.
* **History:** Recorded, each decision change, "Changed: affected firms" and each "Notice sent to <firm>", each with our staff member's name.

## Round 2 (diff only: `git diff 074eaaa..c9cd9ef`, the same change as `89c0c9010` on main)
**Verdict: Changes** `c9cd9ef38ab705a0b400f069b1443b1e7bc0259a`: M2 and M3 are fixed; M1 is still a Major. I used a fresh `rsbrk` copy on :4438 (stopped after, US$0).
* **M1 open.** Two tabs opened Edit on a breach naming X. Tab 1 added Y and saved. Tab 2's first save was refused ("…nothing was saved… try again.") and the dialog stayed open on the old form.
  * Tab 2's second save in the same dialog got 200, and **Y was dropped**.
  * Cause: `unchanged()` compares the fresh read with `one.data`, which the refusal had refreshed, while the form kept its snapshot.
  * Judgment: once fixed, the read-before-write guard is enough for A2 if the PATCH's missing version stays a listed runtime row. A change landing between the read and the PATCH is lost only on the same field: I forced Y in that window while Root cause changed, and both were kept.
* **Fixed:**
  * M2: Confirm starts empty, the alert's words are shown apart, and they are refused when unchanged or with spaces around them. The alert's words minus their final period are accepted: a deliberate copy, not a finding.
  * M3: the words box is a named, focusable region; Tab reaches it and PageDown scrolls it. With every "Words sent" open, axe found 0 serious at all five widths, 520-character and 4,000-character breaches.
  * m1: a missing Why shows under Why with `aria-invalid`. m2: a send's 422 reloads the page. m5: `?recorded` leaves the address.
* **Still Minor:**
  * m3: the page, the send button and History wrap, but the Send confirmation still scrolled sideways by 1,276-1,420 px.
  * n1: Decide's refusals left the focus on the dialog box, not on the refused field.

## Round 3 (diff only: `git diff 89c0c9010..155d6722d`, PR #3579)
**Verdict: Approve** `155d6722d6d32c5499abb6b08d42a8a6e270f902`: no open Blocker or Major. M1's retry, m3 and n1 are fixed; one new Minor (r3-1). I used a fresh `rsbrk` copy on :4438 (stopped after, US$0).
* **M1 fixed (the two-tab sequence, repeated Save included).** Tab 1 added Y and saved. Tab 2 changed Containment and pressed Save twice.
  * Edit closes on the first press; the second press finds no button. The page says "This breach was changed by someone else since you opened it: nothing was saved…", and the focus is on "Edit the record".
  * Stored: X and Y, with Containment unchanged. Edit reopens on the latest record (2 firms, empty Containment), and saving the containment then keeps X and Y.
* **m3 fixed.** The Send confirmation for the 200-character unbroken name does not scroll sideways at 1024, 400, 1440 at 200 % or 1024 at 200 %. The page does not either, the button can be reached, and axe found 0 serious.
* **n1 fixed.** Decide with nothing given puts the focus on the refused reason box; with no Why, on Why.
* **r3-1 (Minor, new). Reopening Edit before the page's re-read arrives brings the stale form back, and then it saves.**
  * Did: tab 2's save was refused as stale. I delayed the page's re-read by 3 s, reopened Edit at once, then saved after the re-read had arrived.
  * The form had opened on the old copy (1 firm). The guard compared the fresh read with the now-fresh `one.data` and passed: 200 "Saved.", and **Y was dropped**.
  * On an ordinary connection the window is the re-read's ~50-300 ms, so it needs a slow network and a quick reopen: Minor. Fix: let the guard compare against the `updatedAt` the form opened with (`record-breach.tsx:65` `draftOf`), not `one.data`; or keep Edit disabled until the re-read lands. The PATCH version (runtime row) would close this too.
* m4 and m6 stay as listed; m1, m2 and m5 still hold.
