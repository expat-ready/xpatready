# PF-21rs A2 (R1.86): the breach's page `/system/privacy/breaches/:id`: independent review, 24 Nov

**Commit reviewed:** `074eaaae3afd0041a7b41b50d86e87c97e08507d` (local branch `local/pf21rs-a2`, not pushed, by the tech lead's instruction). I reviewed only the diff `ed99467dd..074eaaa`: 13 files, +378 −30; the web part is `breach-page.tsx` (169 new lines), `contract.ts` +63, `record-breach.tsx` and `breaches-page.tsx`.
**Read:** concept r2 §3 (BR-2 to BR-4, BR-7), §4 "A breach", §5, §6 (R0, W4); challenge m5, m8, m9; board r1 §3-§4; `a2/build-notes.md`; `a1/review.md` and `a1/break-report.md`; the BACKLOG row (W4, W5, W6); `register/breaches/service.ts` on main. Requests, holds and "Send to every firm" are Not built here (part B, concept 6b), so they are not findings.

**Verdict: Rework (Block).** There is 1 Major: axe-core finds a serious violation in the "Words sent" state at 1024 and 400 px. The fix is one line, plus one more line in the check. There are 8 Minors.

## What I ran (copy `rsrev` on :4437, never :4400; AI_LIVE=off; US$0)
* `check_pf21rs_browser.ts 4437 xr_studio_rsrev`: **37/37**, run twice on the same copy. `j_86.ts j86 4436` on its own copy: **27/28**. Only W10 fails, and the tech lead moved it to R1.87. W6 passes, with its subject and "no second send" lines. I restored both sets of screenshots with `git checkout` and removed the untracked J-86 W6 file the run wrote.
* `tsc -p web --noEmit`: exit 0. `scan-logs.ts` on `rsrev-api.log`: 398 lines, 0 findings. `graph.mjs`: G1 0, G2 0. Its G3 still lists the breach routes `GET :id`, `PATCH`, `:id/notices` and `from-alert` as untested with no web use. That is the tool's blind spot: it does not follow `systemApi()` paths or the check's `${BREACHES}` constant. My walk and both checks do call these routes.
* My own Playwright walk (Chromium /opt/pw-browsers/chromium, zone IST) at 1440, 1024, 1024 at 200 % (512 CSS px, DPR 2) and 400, as the Platform Owner (signed in on the card), Support, an Auditor added by SQL and a firm Owner's token: keyboard only through Decide → Send; two tabs; a stale Decide and Edit; NO_RECIPIENTS; a tampered stored message; long and Arabic text; a draft from an alert. Scripts and screenshots are in the session scratchpad (`shots/`).

## Concept fit (held, with evidence)
* **Header (§4, board §3):** calculated status as word plus shape; "n of m sent"; recorded by our staff member's name; "Kept 7 years; never deleted" with no end date (BR-4, m4); one next step per status (`contract.ts` `NEXT_STEP`); "Edit the record", or "Confirm the record" (filled) on a draft. There is no delete anywhere.
* **Decision (BR-2, BR-7):** Decide offers Notify firms or No notice, with Why; the reason is never pre-filled; nothing chosen gives the API's refusals and stores nothing; once a notice is sent the card says "Fixed once a notice is sent." and no button is left; a stale "Change the decision" gets the API's DECISION_KEPT words.
* **Notices (BR-2, BR-3, m5, m8, QA-757):**
  * One row per named or notified firm. Firm C, never named, is never listed (check and my walk).
  * Send sits behind the §5 confirmation, one firm at a time. Escape sends nothing, and an empty reason gets the guard's words under the field.
  * A sent row shows `<time datetime>` equal to `plat_breach_notice.sent_at`, "2 people (Admin, Owner)", the sender, the subject, and "Words sent" equal to the API's text. "Sent: cannot be sent again."
  * A second tab's send gets 409 ALREADY_NOTIFIED words on that row, and the reload shows a single notice. A firm with no Owner or Admin gets the NO_RECIPIENTS words on its row and stays "Notices owed".
  * A tampered stored message shows R0's note, never words rebuilt from today's record.
* **Edit / Confirm (one shared form, M5):**
  * Only what changed is sent: containment, root cause, and a cleared root cause becoming NULL in the DB. A category ticked then unticked sends nothing.
  * With no change you get "Change at least one field.". There is no discovery time.
  * A notified firm shows "notified" instead of Remove, and a stale removal gets NOTIFIED_FIRM_KEPT words.
  * A draft is confirmed to RECORDED and then reads "Decision owed".
* **History:** newest first, in words ("Decision: Not decided → Notify firms", "Changed: root cause", "Confirmed (no longer a draft)", "Notice sent to <firm>"), each with our staff member's name.
* **Roles (BR-8, W5):** the Auditor reads the page and the words, sees only "Sign out" as a button and the read-only line, and gets 403 on an API send; Support sees the API's 403 words and no data; a firm token gets the card's refusal and 403 from the API; an unknown or non-uuid id gives "No such breach." and Back to Breaches.
* **List links** to the page by keyboard. "Record the breach" opens the new page with "Recorded. Next: decide whether firms are told." (board §2).

## Standards [M] (both files): met except as listed
* **Met:** team frame, crumb, tab title and tokens; dialogs for every change; loading, error with Retry (not on 403 or 404), read-only and busy states; status by word and shape; one filled button per view; one browser request per view (names and words joined on the server, one words read per notice, m9); server authorisation; reason on the audit line (28 lines with my reasons); zod contract with no React; comments say why; 180-230 ms to open the page, 90 ms to send.
* **Not met:** STANDARDS §6 "[M] axe-core on every screen state" and row W6 (issue 1, Major); EXPERIENCE §1 #10 status tooltip (issue 6); EXPERIENCE §1 #14 long names wrap (issue 3).

## D1-D20 (1-5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | BR-2 to BR-4, BR-7, m5, m8 as written; Confirm accepts the draft's own words (issue 4) |
| D2 Data integrity | 5 | One notice per firm under two tabs; PATCH carries only changes; DB equals the screen |
| D3 Reuse | 5 | A1's form serves Edit and Confirm; shared Dialog and Notice |
| D4 Rule integrity | 4 | Every rule is the API's; the browser shows no row-level 409 test (issue 7) |
| D5 Stability, recovery | 4 | 409s on the row; a stale Decide does not reload the page (issue 2) |
| D6 Governance | 5 | Reason never pre-filled; words as sent; no delete; "Kept 7 years" |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 4 | Crumb and header; every breach is titled "A breach" in the crumb and tab (issue 8) |
| D9 Flow | 5 | Record → page → Decide → Send, with one next step named at each status |
| D10 Language | 4 | §5 copy exact; "(confirm the record first.)" (issue 8) |
| D11 Feedback | 4 | Done lines and row errors; arrival after recording is not announced (issue 5) |
| D12 Visual | 4 | Matches board §3; History overflows with long names (issue 3) |
| D13 Accessibility | 3 | Keyboard path works; axe serious with the words open (issue 1); focus after a refusal (issue 5) |
| D14 Team look | 5 | Same frame as Firms and Breaches |
| D15 Speed | 5 | Open 180-230 ms; send 90 ms; record → page 220-320 ms |
| D16 Testability | 4 | 15 new lines with pass and fail; gaps in issue 7 |
| D17 First-use | simulated only | No intended user walked it |
| D18 Provenance | 5 | Words from the store; R0's note when they cannot be read; Sample and "Unconfirmed: no counsel" |
| D19 Capability closure | 4 | j_86 27/28 (W10 is R1.87's) |
| D20 Pain solved | simulated only | |

**BIC-01-BIC-20:** N/A for every check (concept §4c: this is the console, not a case screen, outside EXPERIENCE §6's scope). BIC-13, -14 and -20's content is covered under the standards above.

## Issues
1. **Major (Must): with "Words sent" open, axe-core reports `scrollable-region-focusable` (serious) at 1024 and 400 px**, even on a short notice like the check's own W4 notice.
   * Cause: the `<pre max-h-80 overflow-auto>` scrolls (scrollHeight 344 and 504 against a box of 320) but cannot take focus and has no name (`breach-page.tsx:59`).
   * With a long description it fails at 1440 too. Chromium lets Tab reach the box; other engines may not.
   * The check misses it because its W6 scan runs with every `<details>` closed (`check_pf21rs_browser.ts:276-279`). The open state is exactly what QA-757 and W4 exist for.
   * Fix: give the `<pre>` `tabIndex={0}`, `role="region"` and `aria-label={`Words sent to ${name}`}` (or drop `max-h`), and scan axe with the words open at the three widths.
2. **Minor (Should): a stale Decide does not reload the page.** `onOpenChange={setDeciding}` (`:142`) refreshes nothing after the DECISION_KEPT 409, so the page behind keeps offering "Change the decision" and shows stale notices. Concept §4: "conflict: words + reload". Fix: reload on close, or on a 409, as the Send and Edit dialogs do.
3. **Minor (Should): History lines do not wrap** (`:135`, no `[overflow-wrap:anywhere]`). A 108-character firm name gives a 426 px sideways page scroll at 400 and 314 px at 1024 at 200 % (walk `06-long-400x1.png`). The notice rows do wrap. Fix: add the class to the `<li>`.
4. **Minor (Should): "Confirm the record" pre-fills the alert draft's internal words** ("Draft from an alert (audit_chain_break, rule BR-5)… Write the description firms will read, then confirm") and accepts them unchanged.
   * I confirmed one as is: it became RECORDED with those words, which a Send would then put in the firms' notice (`record-breach.tsx:19`).
   * The board says Confirm "asks for the description firms will read". PF-21c's m2 refinement required the description for exactly this reason.
   * No screen creates drafts today ("Open a draft" is Not built), so the exposure is low.
   * Fix: start the box empty, with the draft's words shown above it, or refuse an unchanged description in the browser.
5. **Minor (Should): focus and announcements.**
   * After "Record the breach" the new page opens with the focus on `<body>`, and the "Recorded…" line is already in its `role=status` box when it mounts (`:75`, `:104`), so a screen reader may say nothing.
   * After a refusal in Decide or Send, the focus sits on the dialog box, not the refused field (`ChangeDialog`, `:33-36`). A1's form moves it to the field.
   * Fix: focus the `h1` on arrival, as A1's `takeArrival` does, and focus the first `[aria-invalid]` field after a refusal.
6. **Minor (Should): the header status has no tooltip** (`:96`). EXPERIENCE §1 #10 [M]. `STATUS_WORDS[...].hint` exists and the list uses it. Fix: `title={s.hint}`.
7. **Minor (Should): test gaps.**
   * W6's keyboard line covers only Record (`:329`). The concept says "record → decide → send", and I walked that path by keyboard by hand: it works.
   * No browser line shows a 409 on a firm's row. `:233` is an API send followed by a reload.
   * A1-2's focus-after-record assertion was dropped (`:157`) and nothing replaces it.
   * Fix: one keyboard line for Decide and Send, and one two-tab line.
8. **Minor (Could): words.**
   * "Not decided (confirm the record first.)" has the stop inside the brackets (`:119`).
   * The crumb and tab title say "A breach" for every breach; board §3's crumb is "Discovered 24 Nov 2026, 07:10" (`:168`).

## What I could not check
A real screen reader; Safari or Firefox keyboard reach into the words box; an intended user's unaided walk (D17 and D20 stay with the founder); a missing stored file, as opposed to a changed hash (R0's test covers it); a 200-firm breach on this page.

Reviewer: Block 074eaaae3afd0041a7b41b50d86e87c97e08507d

**Verdict: Block** (commit `074eaaae3afd0041a7b41b50d86e87c97e08507d`). To fix: issue 1, the Major (`breach-page.tsx:59`, and the check's W6 scan at `check_pf21rs_browser.ts:276-279`). Issues 2-8 are Minors: fix them in this PR or record them on the row.

## Round 2 (head `c9cd9ef38ab705a0b400f069b1443b1e7bc0259a`; diff `074eaaa..c9cd9ef` only; the current verdict)
**Ran (copy `rsrev` on :4437, stopped after):** `check_pf21rs_browser.ts` **39/39** twice (screenshots restored with `git checkout`); `tsc -p web --noEmit` exit 0; my own probes in Chromium at 1440, 1024, 1024 at 200 % and 400.
**Re-checked:**
* **Issue 1 (Major): fixed.** The `<pre>` takes focus with the name "Words sent to <firm>". With every "Words sent" open, axe finds 0 serious and there is no sideways scroll at all four widths, on a 1,000-character notice with a 108-character firm name. The check's W6 scan now opens the words.
* **Issue 2: fixed for Decide.** A Decide over another tab's decision stores nothing (DB keeps NOTIFY_FIRMS), closes, says `COPY.stale`, and the page shows "Change the decision".
* **Issue 3: fixed.** History wraps (`[overflow-wrap:anywhere]`), and so does the Send button.
* **Issue 4 / breaker M2: fixed.** Confirm starts empty with the alert's words shown apart. The alert words, with or without a trailing space, are refused under "What happened", the focus goes to the box, and the breach stays DRAFT.
* **Issue 5: half fixed.** After recording, the focus is on the `h1` and `?recorded` leaves the address, so a reload does not repeat the line. Still open (Minor): after a refused Decide or Send the focus is on the dialog box, not the refused field. "Why" now gets `aria-invalid` (breaker m1).
* **Issue 6: fixed.** The header status has `title` (e.g. "Recorded; decide whether the affected firms are told.").
* **Issue 8: half fixed.** "(confirm the record first)" is right now; the "A breach" crumb stays, listed in the PR.
* **Issue 7 is still open (Minor)**, as listed in the PR.

**New, Major (Must): breaker M1 is not closed. A retry after the stale refusal overwrites the other tab's change** (`breach-page.tsx:84-87`, `record-breach.tsx:65`, `:79`).
* Probe:
  1. Opened Edit on a breach naming X.
  2. Another tab (an API PATCH) added firm Y and a containment.
  3. In the open dialog: wrote a root cause and pressed Save. I got `COPY.stale` ("… The page now shows the latest; try again."), and nothing was stored. This is correct.
  4. The dialog stays open, still holding the old firms (1) and an empty containment. I pressed Save again, as the words invite.
  5. Result: 200, and the DB holds **1 firm (Y removed) and containment NULL**. The other tab's change is silently undone.
* Cause:
  * `unchanged()` compares the fresh read with `one.data`, which `reload()` has just refreshed, so the second try passes.
  * The form's values are seeded only on opening (`record-breach.tsx:65`), and `changeBody` diffs them against the new breach, so every field the other person changed is sent back.
* Fix: on STALE, close the Edit dialog as Decide does, or re-seed the form from the fresh breach and say what changed. Keep the guard's base as the `updatedAt` seen when the dialog opened, not `one.data`.
* Test: add one fail line to the M1 check (`check_pf21rs_browser.ts:247`) where a second Save after the stale words leaves the other change in the DB.

Reviewer: Block c9cd9ef38ab705a0b400f069b1443b1e7bc0259a

**Verdict: Block** (commit `c9cd9ef38ab705a0b400f069b1443b1e7bc0259a`). To fix: the new Major (the stale Edit retry). The rest of round 1's Major and Minors are fixed except Minor 5's refusal focus, Minor 7 and the crumb, which stay Minor as listed in the PR.
