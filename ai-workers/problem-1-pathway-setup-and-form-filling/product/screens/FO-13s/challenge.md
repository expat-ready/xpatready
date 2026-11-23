# FO-13s part 1: fresh challenge (the Identity check panel, R1.110)

Written 19 Nov 2026 by a fresh challenger that did not draft `concept.md` (screen-concept skill, section B). The brief (`design/lead-b-briefs/FO-13s.md` Part B, branch `lead-b-front-office`) wins over the concept.

Read: the concept; the brief; on `claude/runtime-fo13i-expiry` (37df3f0be, PR #2305, open): `api/src/front-office/compliance/identity/{service,routes}.ts`, `retainers/service.ts` 495-515 (send warning), `web/src/modules/front-office/sales/{lead-page,prospect-page,contract}.tsx`, `web/src/components/ui/controls.tsx`, `web/src/modules/platform/session.ts`, the FO-13i and PF-3 role-key migrations, EXPERIENCE §6 BIC-04/11/13/18/19/20, FO-13i `review.md`. `ai-workers/tools/freshness.sh` does not run in this cloud copy (`code/README-copies.md` missing). No team source is relied on here: none is marked Unverified.

## Verdict
**Build after these changes.** The panel is the right size and shape and the rules sit on the server. Four Majors: the brief's prospect mount, the `requestId` life cycle, the client calls the current helpers cannot make, and the error summary. None needs an API change.

## Objections

### Blocker
None.

### Major
**M1. The prospect page is left out, but the brief names it.** *Needed for the proof.*
* What breaks: the brief says "on the lead and prospect page". The concept mounts on `lead-page.tsx` only and asks the founder (Q1) whether to defer the prospect page. A retainer belongs to a prospect (`fo_retainer.prospectId`). The person who sends it works from the prospect page (`prospect-page.tsx`), where Engage takes them. There they would not see the check or the missing-check sentence (BR-9). That gap is the journey the brief asks the panel to close.
* Example: a lead is engaged, so `go(/front-office/prospects/<id>)` runs. The RCIC is now on the prospect, and the panel is one page behind them.
* Evidence: brief Part B, first bullet. `lead-page.tsx` sends you to the prospect page on Engage success. `contract.ts:71`: the prospect carries `person: { id, name } | null`. Confidence: high on the brief's words. The words "one mount line" next to them make the brief ambiguous, so this is a question for the Lead, not the founder.
* Fix: mount the same panel on `prospect-page.tsx` when `p.person` is set (an Individual prospect). That is one more line. Name it in the touch list and drop Q1. A corporate prospect's signatory has no person page. Say that in one line as *Not built* (it waits for a person or contact view).

**M2. The `requestId` life cycle is unclear, and a duplicate check can never be removed.** *Needed for the proof.*
* What breaks: BR-7 says "A Save makes one requestId. A retry after a lost answer reuses it … a new Save makes a new one". The panel has only one button. If each click makes a new id, a click after a lost answer (timeout, closed connection) stores a second check. A check is insert-only, with no edit and no delete (BR-1), so the duplicate stays in the compliance record and the audit.
* Example: Save → the network drops after the insert → the person clicks Save check again → two identical rows.
* Evidence: `service.ts` `record()`: replay returns the saved row for the same id. The same id with other details gives 409 `REQUEST_REUSED` "This request was already used with other details. Start a new Save." The concept does not say how the screen shows a 409. Confidence: high.
* Fix: make the id once when the panel opens. Keep it through every Save in that panel: a field error stores nothing, so reusing it is safe. Make a new one only after a success or when the panel is reopened. On 409 `REQUEST_REUSED`, make a new id and show the server's sentence in the panel. Test: a mocked lost answer followed by a second Save gives one row (row count by API).

**M3. The current client helper cannot upload or open the copy.** *Needed for the proof.*
* What breaks: (a) `staffApi` (`platform/session.ts:69`) sends JSON only (`init.json`) and has no `body`, so the multipart Save has no path that keeps the 401 handling (end the session, sign-in card). (b) `GET identity-copies/:token` needs `@PermissionKeys("agent/document:show")`, which means the bearer token. An "Open copy" plain link or `window.open(url)` sends no `Authorization` header and gets 401. Under `staffApi`'s rule, a 401 for the current token ends the session.
* Evidence: `routes.ts` 34-49. `session.ts` 69-86. Other modules download by fetch → blob → `URL.createObjectURL` (`runtime/documents-drawer.tsx:155`). Confidence: high.
* Fix: in the concept, write (1) let `staffApi` take a `FormData` body: a few lines in the shared file, named in the PR, which leaves out `content-type` so the browser sets the boundary. Or write a local helper in `compliance/identity/` that reuses `staffToken`, `endSession` and `problemOf`, and choose one. (2) Open copy = `POST …/copy/download-link`, then fetch the `url` with the bearer, then a blob saved as `identity-copy.<ext>`, then revoke the object URL. A 410 shows "This download link has expired. Open the check again." J-110's "download bytes = uploaded" then compares sha256.

**M4. Errors show under the field only. BIC-13 also asks for the summary at the top.** *Needed for the proof.*
* What breaks: BIC-13 asks for "Inline on the field and in a summary at the top ('There is a problem') with the same words and links". The concept has only the field text and focus on the first field. Other errors have no field: 409 `NOT_ACTIVE` or `REQUEST_REUSED`, 500 `NOT_SAVED` with the "copy … can never be opened" sentence, and the database's 400 naming a constraint. The concept gives them no home.
* Evidence: EXPERIENCE §6 BIC-13. `service.ts` (the catch block's `problem(...)` calls have no `fields`). Confidence: high.
* Fix: put a danger `Notice` at the top of the panel body (the Engage panel already does this). For a field error it says "There is a problem" with the same sentence and a link that focuses the field. Otherwise it shows the server's `detail`. Keep what was typed and the chosen file.

### Minor
**m1. Name is ticked by default in Corroborated details.** Pre-ticking an attestation lets a check be saved that says the name was corroborated when nobody looked. The record cannot be corrected except by a new check (BR-1), and the audit line counts the details. Fix: nothing ticked. BR-6's error ("Name at least one corroborated detail") then teaches. Confidence: medium (judgment). *Needed for the proof.*

**m2. The roles in BR-8's test and the persona do not exist.** The concept says "an assistant without `document:show`". The sample roles are OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER (they hold record and document:show), READ_ONLY (show and document:show, no record) and BILLING_FINANCE (show only) (migrations `20261114015002` lines 731-735 and 970-975, and `20261118140000`). Fix: test BILLING_FINANCE (no Record, no Open copy, a reason line for each) and READ_ONLY (Open copy, no Record). Say "a staff member who holds the key" in §1. *Needed for the proof.*

**m3. Stored codes show as codes.** `IN_PERSON`, `DRIVERS_LICENCE` and `HOME_ADDRESS` need plain words (EXPERIENCE §5, as `words()` does on the lead page). The country stays a 2-letter code with its name in `title`. The concept's columns do not say this. *Needed for the proof.*

**m4. Dates shift by one day.** `documentExpiry` is `YYYY-MM-DD`. `new Date("2027-03-01")` is UTC midnight and shows 28 Feb in the Americas. Fix: show the string as a date without converting it from UTC (or format it in UTC). Show `checkedAt` in the firm's zone, as the lead page's time helpers do. The screen has no expiry check of its own: the server's firm-zone rule is the only one (BR-4). *Needed for the proof.*

**m5. Optional fields are not marked.** BIC-04 asks staff pages to say "(optional)" in words. Document type, country, last 4, expiry, copy and the note (except for Other) are all optional. The concept does not mark them. *Needed for the proof.*

**m6. The `<name>` fallback differs from the server's.** The lead page uses "(no name)". The send warning uses `nameOf(...) || "the signer"` (`retainers/service.ts:508, 660`). With no name, the panel would read "No identity check is recorded for (no name)." Fix: use "this person" or the server's fallback. The point is that the sentence matches the warning word for word (BR-9). *Needed for the proof.*

**m7. Order of work.** §2 calls #2305 data that is already there, but #2305 is still open (not merged at 19 Nov), and #2268 (open) edits `lead-page.tsx`. Definition of ready: start from origin/main only after both merge. Otherwise BR-4's test fails on 400, or the mount line conflicts. *Needed for the proof.*

**m8. The empty-state line for a viewer who may not record.** "Record a check before the retainer is sent." is an instruction a BILLING_FINANCE or READ_ONLY viewer cannot follow. Fix: without the record key, show BR-8's reason line in its place (BIC-18: "read-only says why"). *Needed for the proof.*

**m9. Size risk.** A panel, a form, a contract, a browser check and J-110 with retainer setup add up to close to the 800-line cap. Reuse `tests/check_fo13i_identity.ts`'s setup, which already makes a send answer the warning, instead of writing new retainer fixtures. *Needed for the proof.*

## What is sound
* Scope matches the brief: one panel, no API change, no Conflict check and no Complaints list. No gold-plating found.
* Every business rule is the server's, and the screen only shows it. BR-1 (insert-only) to BR-6 match `parse()` and `record()`, and the order of refusals fits: fields, then 422 expiry, then 413/415 copy, then "a copy needs a document".
* P-735 is respected. BR-4 calls the rule the firm's own, and no text in §4 or §5 cites the Code for the expiry. Keep it that way in the test names and the PR body.
* BR-2: last 4 only, with a hint that never asks for the full number. This mirrors DW1 and the refusal of an unknown `documentNumber`.
* BR-9 reuses the server's exact warning sentence. That ties the panel to the send step the brief names.
* The panel pattern (side Panel as Engage, one outline header button, one primary button in the footer) fits BIC-11 and BIC-19. Loading, error, saving and saved states are all drawn (BIC-18).
* The 10 MB client pre-check uses the server's words, so a large upload is not wasted. The copy is checked by content on the server.
* The J-test's retainer send through the API is named as scaffolding (P-33), honestly.

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| List | `fo_identity_check` (+ `platform_staff.displayName`) | `GET people/:personId/identity-checks` (prospect:show and person visible) | Newest first. Person visibility as for leads (404 otherwise) | browser: rows after a Save. J-110 step 2 |
| Empty sentence | none (count 0) | the same GET | BR-9 = `retainers/service.ts:508` | browser BR-9 pass and fail. J-110 send warning before and after |
| Record form | `fo_identity_check`, audit line, `IDENTITY_CHECKED` event | `POST people/:personId/identity-checks` multipart, `requestId` per panel (M2) | BR-2 to BR-7. 422 `documentExpiry` (P-735) | browser BR-3, BR-4 (today and yesterday), BR-5 (.txt as .pdf → 415). J-110 expired → row count unchanged |
| Copy upload | FilesPort `identity/<person>/<requestId>.<ext>` + sha256 | the same POST, field `copy` | ≤10 MB, PDF/JPEG/PNG by content | browser 415, client 10 MB pre-check |
| Open copy | the same key | `POST identity-checks/:id/copy/download-link` → `GET identity-copies/:token` with bearer (M3) | document:show. 410 when expired | J-110 sha256 of the download = the upload. BR-8 BILLING_FINANCE sees no Open copy |
| Keys | `platform_role_permission` (sample) | `GET platform/me` keys | BR-8 | browser: BILLING_FINANCE, READ_ONLY, CASE_OFFICER |
| Mounts | none | none | lead page and Individual prospect page (M1) | browser: panel present on both |

No migration and no API change. Shared web code touched: possibly `platform/session.ts` (M3 (1)), named in the PR.

## Questions for the founder
None. Q1 in the concept is answered by the brief (M1), and the Lead settles it, not the founder.

## Lead response
Builder's response, for Lead B to approve (P-223 (4)). Every Major is taken into the build:
* M1: the panel is mounted on the prospect page too, when the prospect has a person.
* M2: one `requestId` per panel opening. It is kept across retries and renewed only after a success or a `REQUEST_REUSED`.
* M3: a local multipart helper with the bearer token and the same handling of a 401. Open copy fetches the bytes with the token and saves them under the server's file name. `session.ts` is unchanged.
* M4: an error summary at the top of the panel, and focus on the first field in error.

Minors:
* m1: nothing ticked.
* m2: tested with BILLING_FINANCE and READ_ONLY.
* m3: plain words.
* m4: the expiry is shown as the stored date string.
* m5: "(optional)" on each optional field.
* m6: the fallback is "the signer", as on the server.
* m7: the PR stays a draft until #2305 (Part A) is merged. #2268 has not merged yet: the mount is one line and is merged when it lands.
* m8: the reason line replaces the instruction.
* m9: 519 lines in all.

## Agreement

## Build discoveries
* The focus move after a refusal must run after the re-render that enables the form again: an effect, not `setTimeout(0)` (caught by the browser check).
