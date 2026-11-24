# J-20 / R1.20 break report: Invite people sends one batch (PR #3370)

Tested commit `479291e52364f6ef0cfdcaa517892c096d7889a7`. I ran an isolated copy `br20` on :4470 with `PLATFORM_IDENTITY=local`, then stopped it and dropped its database.
Sign-ins went through the API (`session/local`). user-O was made an Admin with the Owner's role change, which gave one Owner, one Admin and one Case Manager.
I used curl, a Python threading probe and Playwright scripts (Chromium 1.64). They are in the breaker's scratch area and are not committed.
Paths are relative to `prototype/studio/`. Scope: the batch route as the form now uses it, the name kept as `display_name`, P-727 seats and the form's send logic.

## Findings

**M1 (Major): rows stay editable while Send is in flight, and the answer then applies to what the person typed after Send.**
`send()` takes a snapshot of the rows (`const form = rows`, web/src/modules/platform/staff/invite-panel.tsx:46). The rows are then matched back to the answer by `n` (:56).
While the request runs, the Email and Name inputs, Remove and "+ Add another person" all stay enabled. Only Send is disabled (:66, :76, :90). Reproduced by delaying the batch 2.5 s with `page.route`:
1. *An edit is lost and the old address is invited.* Row 1 is `ui-a@…` and row 2 another new address. Click Send, then change row 1 to `ui-a2@…` and type a name on row 2.
   Result: the toast says "2 invitations sent." and the panel closes. `ui-a@…` has an invitation (a seat and a live 72-hour link), `ui-a2@…` has none, and row 2 went out without the name.
   Nothing tells the person that their correction was dropped.
2. *Words about one email end up on another.* Row 1 is `second.representative@…` (already staff). Click Send, then change it to a fresh `ui-f@…`.
   Result: row 1 shows `ui-f@…` with "This person is already on your firm's staff." and `aria-invalid="true"`. Those words were about the old address.
3. *A row added mid-send is thrown away.* One row, click Send, add row 2 and type `ui-d3@…`.
   Result: every row in the snapshot was sent, so `sent === form.length` (:62) closes the panel. The typed row is discarded without the "Discard the people you typed?" confirm, and `ui-d3@…` is never invited.
Expected: the form is locked while sending (fieldset disabled), or the answer is applied only to rows that have not changed since Send.
Note: the per-row loop this PR replaced had the same snapshot shape. The rewrite keeps the gap rather than introducing it.

**m1 (Minor): the form can be left with zero rows.**
Steps: row 1 is a new address and row 2 an existing staff email. Click Send and, while it runs, click "Remove person 2".
Actual: row 1 is invited and leaves the form. The removed row was flagged, so `flagged = 1` and the panel stays open (:61) with no rows at all.
The panel says "Not everyone was invited. 1 person was not invited. Fix the row below" (there is no row below) and shows a button reading "Send 0 invitations".
Clicking that button posts `rows: []` and gets 422 ROWS_COUNT ("Send 1 to 50 people in one form"). Scratch screenshot: s2-zero-rows.png. The cause is M1, but this state can only arise because the panel keeps no floor of one row.

**m2 (Minor): the form allows 51 rows. The refusal holds, but the form gives no warning beforehand.**
Steps: add 51 rows. The button reads "Send 51 invitations" and the seat warning counts all 51. Click Send.
Actual: one call, 422, and "Nothing was sent. Send 1 to 50 people in one form (rows)." All 51 rows are kept. Removing one and sending again works.
Nothing is broken, but "+ Add another person" has no cap at 50 (:90), and the person only learns the limit after Send.

**m3 (Minor): the batch accepts names that cannot be seen or that spill onto the page, and they now persist into the staff record and headers.**
Batch names were greeting-only before this PR. They are now kept as `display_name` and used at accept (api/src/platform/identity/session/service.ts:135).
- `"⠀"` and `"⠀⠀⠀"` (braille blank) were stored. After accept, Team lists `nm-braille@…` with an empty, unclickable name link, and `/platform/me` returns `displayName: "⠀"`.
  `VISIBLE` (api/src/platform/identity/batch-invite.ts:29) strips `\p{Z}`, `\p{Cf}`, `\p{M}` and the Hangul fillers, but not U+2800.
- `"A"` followed by 99 × U+0301 (100 code points, under the limit) was stored. The combining marks rise out of the header's Name cell in Team, and on Profile they run up through the breadcrumb and the top bar (scratch h1-zalgo-header-1024.png).
- Persian `محمد‌رضا` (with ZWNJ) and the emoji `👨‍👩` (with ZWJ) are refused with INVALID_NAME, because `\p{Cf}` covers U+200C and U+200D. Real non-English names cannot be given.
The single invite's `displayNameOf` has the same three gaps, so these are shared, not new. The batch is a new way to store such names.

**m4 (Minor): the form now refuses names of 101-120 characters, which the single invite allowed.**
The form used to send `displayName`, which allows up to 120 characters (api/src/platform/identity/service.ts:98). It now sends the batch `name`, which allows 100 (batch-invite.ts:37).
A name of 101-120 characters typed into Invite people is now refused with "1 to 100 characters". The same person invited through the single route keeps it. The comment says "nameOf's rule is within displayNameOf's" (batch-invite.ts:8), but this narrowing is not called out anywhere.

**m5 (Minor): after a keyboard Send that flags rows, focus moves to the panel container.**
Keyboard only, at 1024 px and at 720 px (200 % of 1440): rows 2 and 3 were flagged (already staff, no seat). Send becomes disabled while busy, so focus falls to the dialog `DIV`.
The Notice is a live region (1 found), so a screen reader hears the summary. A keyboard user, though, starts again from the top of the panel instead of at the first flagged row.

## What held
- **Who can call the batch.** No token gives 401 NOT_SIGNED_IN. A Case Manager gets 403 MISSING_PERMISSION (agent/staff:manage). Only OWNER and ADMIN hold the key.
- **Roles beyond the inviter's keys.** For an Admin's batch, CASE_OFFICER and `READ_ONLY+CASE_MANAGER` are flagged ROLE_BEYOND_OWN_KEYS, and `OWNER` and `OWNER+READ_ONLY` are flagged OWNER_BY_SINGLE_INVITE with the Owner-only words.
  ADMIN, BILLING_FINANCE and READ_ONLY went through, which is within the Admin's keys. Nothing beyond the inviter's keys was stored.
- **Control and bidi characters.** RLO, LRI/PDI, RLM, ALM, NUL, NEL, TAB, LS, BOM, soft hyphen, tag characters, invisible times, the Mongolian vowel separator, a lone surrogate, a number, an object, and 101 characters were each INVALID_NAME, and none was stored.
  Spaces, fillers and combining-only names became "no name" (NULL). Leading and trailing NBSP or U+3000 was trimmed. `<img onerror>` is stored as text and React escapes it in Team. The DB check was never hit.
- **Seats under races.** I ran 12 rounds of two batches by two people, a third batch and a single invite at once, with 3, 0 and 9 seats free. The invitations made always equalled the free seats, and used equalled the limit afterwards (free 3 → 3 made, free 0 → 0, free 9 → 9).
  The single invite got 409 when it lost. Batches that fitted only partly took their remaining seats in row order (B: 2 sent, 1 OVER_SEAT_LIMIT).
- **Flagged rows use no seat.** In every round, the ALREADY_STAFF, INVALID_EMAIL and ROLE_BEYOND_OWN_KEYS rows were never invited and never counted. Only valid rows were marked OVER_SEAT_LIMIT.
- **Double send.** A double click on Send gives 1 batch call, and so does Enter, Enter, Space.
- **Row mapping, with no edits in flight.** Flagged rows keep their own words. INVALID_NAME shows under Name and every other flag under Email (J-20 W1 and my keyboard run agree).
- **401 and 428 mid-send (both faked on the batch with `page.route`).** In both cases the panel shows "Nothing was sent" with the server's words and keeps the row and the name.
  The batch itself never asks for a step-up (Owner rows are flagged rather than stepped up), so the missing Confirm-it's-you dialog is not a gap. I did not trigger a real 428; j_20's own check covers it.
- **Accept with a batch name.** Accept gives `platform_staff.display_name` the stored name. The audit line `after.displayName` holds it.
- **Layout.** At 1024 px and 720 px (200 %), the panel and the flagged rows do not scroll sideways (panel scrollWidth equals clientWidth, and the document has no horizontal overflow). No page errors.

Verdict: Changes
