# CS-D1u review: the staff case-document door on the tus rail, and J-64 (R1.64 part 4, PR #3698)

**Verdict: Ship after fixes (Changes).** Two Majors (Must), both small to fix. Commit reviewed: `d3510ea38c13767f7c7cb0a16dae7bbbc5f51747` on `claude/runtime-csd1u-staff-door`; own diff `git diff 1eb38ec76 d3510ea38` (#3303 and #3640 are reviewed separately). Reviewer: an independent session that did not build it. There is no `concept.md`; the bar is the PR body (Lead 4's shape on #3277), the CS-D1 and PF-F2 rows, STANDARDS, and EXPERIENCE §1 and §6. **Journey score: 8 / 10, pass** (`journey-test-reviewer-2026-11-25.md`).

## Findings, worst first
1. **Major (Must): a refused file's bytes stay in FilesPort, and the screen says "Nothing was stored."** The rail calls `files.put` (`rail.ts:183`) before the transaction that runs `onComplete` (`:189`). This door refuses inside `onComplete`: the damaged-PDF check (`staff-door.ts:71`) and the access re-check (`:65-67`). When it refuses, `plat_file` rolls back, but the bytes and their `.meta` stay under `front-office-files/<firm>/case-documents/<person>/<upload id>`, and so does the staging copy. Probe B (damaged PDF: 400, `plat_file` 0, bytes on disk) and probe C (role ended mid-upload: 404, bytes on disk) show it. No row names those bytes, so no scan, erasure, export or cleanup will ever find them. On the multipart route the same damaged PDF writes nothing (CS-D1t's rule). DW5 and J-64 W4 check only rows; W4's "no stored file" holds only because the PF-F4 refusal comes before `put`. Fix (rail, same stack): give doors a check that runs before `put` (the PR's own follow-up), or remove the key when the finish transaction throws with no `plat_file` row. Add "no FilesPort bytes" to DW5.
2. **Major (Must, BIC-13 / EXPERIENCE §1 line 27): a staff member who may not add documents gets "This upload is no longer on the server. Start it again."** Who this hits: someone signed in as Read only, or a sign-in linked to no case user. The Add button shows for every signed-in staff member. `authorize` returns null, the rail answers a bare `404 Not found` (`rail.ts:150`), and the client turns every 404 into the expired-upload words (`resumable-upload.ts:43`). The person is told to retry something that can never work. The same mapping hides the door's own 404 words: "You can no longer add documents to this case. Nothing was stored." (`staff-door.ts:67`) and "That person is not on this case." Fix: for a sign-in with no key or no case user, answer 403 in words, for example "Your role cannot add documents to cases. Nothing was stored." The person is not the case, so a 403 leaks nothing, and the client already shows a 403's text body. Or let `refusalWords` show a 404's plain-text body when it is not "Not found". A test on screen should cover the Read-only path.
3. **Minor (declared, Lead question): pypdf runs inside the rail's 5 s transaction. A sound PDF that reads slowly can never be stored on the rail, and the words promise a retry.** Probe A: a sound 12.8 MB PDF with 80k pages. On the rail it got PATCH 500 after 8.5 s (P2028), "Try again in a moment; what you sent so far is kept", and every HEAD retry failed the same way. The multipart route stored the same file (201, 8.6 s). pypdf alone takes 5.6 s on a 9.6 MB, 60k-page file. Real letters are far smaller, so I accept the PR's recommendation. The pre-`put` check from finding 1 fixes this too.
4. **Minor: keyboard focus drops to `<body>` twice.** It happens after the inline sign-in card closes, and after an upload finishes: the button is `disabled={busy}` while uploading (`other-documents.tsx:43`, `:48`). A keyboard user tabs about 40 times to get back. Fix: use `aria-disabled` while busy, and put focus back on the Add button after sign-in.
5. **Minor: a refusal is announced twice.** The `role="status"` span (sr-only) and the `role="alert"` paragraph carry the same words (`other-documents.tsx:45-46`). Fix: leave the status empty when the phase is failed.
6. **Minor (D16): two of the door's rules have no test that fails without them.** First, the door's own firm check (`staff-door.ts:52`): DW2's refusal comes from `Runtime.reach` (the text is "No such case."), so removing the line turns nothing red. Second, the access re-check in `onComplete` (`:65-67`): it works (probe C), but no named test covers it.
7. **Minor (D14): the list words differ from the line lists on the same panel.** A current file has no marker, and a replaced one shows "· replaced" with no date (`other-documents.tsx:38`). The line lists show "· current" and "replaced <date>" (`checklist.tsx:224`).
8. **Minor: a failed commit can leave a file in DOCS.** The `try` that removes the DOCS file now sits inside the transaction callback (`case-documents.ts:309-317`), so a commit that fails after the callback returns leaves the file on disk. This applies to the rail's finish and to the multipart route. Before, the `try` enclosed `$transaction`. It is rare.
9. **Minor (process):** the check and J-64 use :4463 and :4464, outside the runtime lane's 4430–4439 (`WAY-OF-WORKING.md:18`). J-64 has no axe, no keyboard path and no 1024 px width, which journey-test step 3 asks for. My walk covered them (below).

## Checked and holding
* **The bridge.** `platform_staff.actor_id` is unique, and only the seed writes it. Firm A's staff cannot reach firm B's case: `reach` refuses with 404 through `firmOfActor`, and the door's firm check stands behind it. Another firm's HEAD and PATCH get 404 (DW2, W3). Read only and unlinked sign-ins get 404 (DW3). The door is stricter than the multipart route, which trusts `x-actor`. It never reaches a case the multipart route could not.
* **`onComplete` re-checks access with the uploader's own staff id**, kept at creation, against live grants in the rail's transaction. With the role ended, nothing is written (probe C). With the role back, a HEAD finishes it.
* **The multipart route is unchanged.** Its refusal words are identical, and the privacy rule (no effect for staff, as before) stays. The audit line now sits inside the transaction, which is an improvement. DW8, c64 48/48 and c65 74/74 pass.
* **One current file per type, under a race:** six finishes in parallel give 6 versions and 1 current, in 0.6 s (probe D). A repeated finish gives the same file and no second version (DW6, W2).

## Scorecard (D1–D20)
D1 4 (every PR claim holds; finding 2) · D2 3 (finding 1) · D3 5 (one `caseUploadTarget` and `storeVersion` for both routes; `CASE_KINDS` moved unchanged) · D4 N/A · D5 3 (resume works; findings 2, 3) · D6 4 (audit names `staff:<id>`, inside the transaction) · D7 N/A · D8 4 · D9 4 · D10 3 (finding 2) · D11 4 (paused, resumed, uploaded and listed all show) · D12 4 · D13 4 (axe 0, no sideways scroll; findings 4, 5) · D14 4 (finding 7) · D15 4 (small PDF about 0.6 s; first view of the case page 0.6–1.2 s, unchanged) · D16 3 (finding 6) · D17, D20 simulated only · D18 4 (uploader and Sample label shown) · D19 4 (R1.64 can be walked end to end by screens).

## BIC (EXPERIENCE §6)
BIC-11 Met: Add is a secondary button, with no primary in the block (`w1-1440-paused.png`). BIC-13 **Not met** for the 404 paths (finding 2), Met for PF-F4 and damaged-file words (`w4-refused-1440.png`). BIC-18 Met: paused, resumed, uploaded and refused all show, and the sign-in says why. BIC-19 Met at 1440 and 1024 px. BIC-20 **Partly**: the keyboard path completes, but focus is lost (finding 4); 720 px at 2x (200 % zoom) and 400 px have no sideways scroll; axe 0. BIC-01 to 10, 12, 14 to 17: N/A (no question, value, review or signing step).

## What I ran (isolated copies, never :4400; US$0)
| Run | Result |
|---|---|
| `check_csd1u_staff_door.ts` 4463 | exit 0, 23/23 |
| `journeys/j_64.ts` j64 4464 | exit 0, 11/11 (its screenshots restored to the committed ones) |
| `check_c64_storage_api.ts` 4438 | 48/48 |
| `check_c65_documents_api.ts` 4436, fresh copy | 74/74 |
| `check_c65_document_rules.ts` | 45/45 |
| `graph.mjs --check` | G1 0, G2 0, G4 0, G5 0; G3 only lists `POST /runtime/cases/:id/documents`, an old helper-path gap |
| reviewer probes A–D and walk (scratch, deleted) | as cited above; axe at 1024 px (idle, sign-in, listed, refused), at 720 px 2x and at 400 px: 0 violations |

**Not checked:** a real screen reader; 1280 and 375 px UXL screenshots; the full CI; deactivated staff (`status`) between creation and finish; the S3 rail (off by design). D17 and D20 stay with the founder.

Verdict: Changes d3510ea38c13767f7c7cb0a16dae7bbbc5f51747

## Round 2 (diff-only, cba94bbb)

**Verdict: Changes.** One Major (Must), in the journey script only, and a two-line fix. The rail change and the product code close every round-1 Must. Commit reviewed: `cba94bbbe5926f683f47114fcfda786a96dd4ac4`. Diff read: `git diff 710f5e3c5 cba94bbbe`, the fixes after the round-1 records. Reviewer: the same independent session role (not the builder). **Journey score: 9.5 / 10, pass** (round 2 in `journey-test-reviewer-2026-11-25.md`).

### Round-1 findings
| Finding | Status | Evidence |
|---|---|---|
| Review 1 / B3 (Major): bytes kept after a refusal | **Closed** | The door's `check()` runs after PF-F4 and before `FilesPort.put`, outside the transaction (`rail.ts:188-191`). A 4xx after `put` removes the key and the staging copy (`:210`). DW5 (damaged PDF) and DW9 (role ended mid-upload) now also check "no stored bytes, no staging copy". In check_pff2 the "CS-D1u rail" checks cover a check that returns 4xx, a check that returns 5xx (copy kept), maxBytes at finish, onComplete 4xx after `put` (key removed), and a non-refusal failure (kept, then swept). |
| Review 3 / B1 (Major): pypdf inside the 5 s transaction | **Closed** | pypdf runs in `check()` (`staff-door.ts:81-89`). DW11: a sound 10.4 MB PDF of 90,000 pages is stored, 204 in 7.9 s. Before, it got a 500 that looped forever. |
| B2 (Major): over 20 MB taken | **Closed** | `maxBytes: MAX_DOCUMENT_BYTES` (`staff-door.ts`), checked at creation (`rail.ts:152`) and at the finish (`:184`). DW10: 20 MB + 1 byte gets 413 in words; exactly 20 MB opens. |
| Review 2 / B4 (Major): "no longer on the server" for a person who may not upload | **Closed** | `uploaderOf` answers 403 in words: NO_RIGHT or NO_CASE_USER (`staff-door.ts:37-46`). `refusalWords` shows a door's own plain-text 404 (`resumable-upload.ts:43`). DW3 and DW9 pass. J-64 W6 shows the Read-only words on screen (it passed in my runs with a delay added; see R2-1). |
| B5 (Minor): latin1 "repair" of correct names | **Closed** | The rail's name is kept (`staff-door.ts:87`). DW12 passes. |
| B6 (Minor): any linked case user accepted | **Closed** | Only a runtime case user with case duty is accepted (`staff-door.ts:43`). DW3 B6 (client login) gets 403. |
| Review 6 (Minor): no test that turns red for the firm check or the finish re-check | **Closed** | DW3 "door's firm check" (a sample-solo session bridged to a sample-firm user gets 404) and DW9. |
| Review 4 / B8 (Minor): focus to `<body>` | **Closed in product** | `aria-disabled` while busy, and focus goes back to Add after sign-in and after the upload ends (`other-documents.tsx:28-31, 36, 54`). The decision panel takes focus only when the sign-in happened inside that panel (`case-decision.tsx:100-112`). check_csc1s_decision_browser: 52/52. J-64 W6 focus checks pass (with the delay). |
| Review 5 (Minor): a refusal said twice | **Closed** | The status stays empty when failed (`other-documents.tsx:58`). J-64 W4 checks it. |
| Review 7 / B9 (Minor): list words, no fold | **Closed** | "· current" and "· replaced <date>". Earlier versions fold behind "N earlier versions" (FoldOut). J-64 W5 checks it. |
| Review 8 (Minor): DOCS file kept after a failed commit | **Partly closed** | Closed for the multipart route (`case-documents.ts:285-287`). Still open on the rail finish: `staff-door.ts:93` calls `storeVersion` inside the rail's transaction, and if that commit fails the DOCS file stays; a retry writes a new one. Rare. Carry it as a follow-up (R2-4). |
| Review 9 (Minor): ports, axe, keyboard, 1024 px | **Closed** | Ports are 4433 and 4434. W6 adds 1024 px, keyboard, axe, and the Read-only words. |
| B7 (closed case still takes uploads), B10 (reload drops the upload silently) | **Carried** | Follow-ups, as agreed. Both gaps were already on the multipart route. |

### New findings, worst first
1. **R2-1 Major (Must): J-64 W6 fails as committed on this Linux Chromium: 2 of 2 runs failed.** It timed out at `j_64.ts:206`: `Promise.all([p6.waitForEvent("filechooser"), p6.keyboard.press("Enter")])` saw no file chooser in 30 s. The product side is in place: focus was on the Add button, the token was present, and the sign-in card had closed (probe screenshot in the scratchpad). The same walk passes 16/16 when a 150 ms wait comes between arming the waiter and pressing Enter. In that run, the unchanged Read-only step (`:220`, same pattern) then failed once (`roWords` null). So this is a test race: `keyboard.press` lands before the file-chooser interception is armed, and `locator.click()` in W1 hides the race with its actionability wait. CI walks journeys on Linux Chromium (`item-proof.yml`, `walks.yml`), so the PR's proof for review 2 and 4 is not reliable. Fix: arm the waiter, give the page a frame, then press, at both lines. For example, `const w = p6.waitForEvent("filechooser"); await add6.press("Enter"); await w`. Then run it twice.
2. **R2-2 Minor: while an upload is busy, the Add button looks enabled and a press does nothing.** `aria-disabled` has no style. The Button's `disabled:` classes do not match it (`w5-pixel7-paused.png` shows a normal button next to "Upload paused"). The status words do say what is happening. Fix: add `aria-disabled:opacity-50 aria-disabled:cursor-not-allowed`, or the team Button's own disabled look.
3. **R2-3 Minor (rail, follow-up): the expiry sweep can retire a key that a finish is committing right now.** `sweep` reads `plat_file` in its own transaction (`rail.ts:250`). Take a finish whose PATCH started just before 24 h, is past `files.put`, and has not yet committed. The sweep sees no row, and `files.delete` writes the PF-Fd tombstone. Then the finish commits a SCANNING `plat_file` row that names retired, absent bytes. The window is milliseconds and it needs the 24 h boundary. Fix: skip ids in `this.#finishing`, or delete only keys of uploads expired more than an hour. When the sweep runs before `put`, it is safe: deleting an absent key retires nothing.
4. **R2-4 Minor: review 8 is still open on the rail finish** (see the table). Fix: give `storeVersion` the plan from `check`, and remove `plan.abs` when the rail's finish throws, for example through an `onFailed` hook or the door's own try.
5. **R2-5 Nit (rail): if `store.remove` fails after a 4xx (the error is swallowed at `rail.ts:210`), a later HEAD runs the finish again.** The second `put` meets the retired key and answers 409 "This file is already stored.", which is wrong. Rare. Logging the swallowed error would make it visible.

### Regression questions asked in the brief
* **Can deleting a key after a 4xx remove another upload's bytes, or an older version's?** No. The key is `case-documents/<person>/<upload id>`, and the upload id is unique (`staff-door.ts` keyOf). Document versions live in DOCS under their own ids, not under this key. A 4xx means the transaction rolled back, so no row names the key. A second process finishing the same upload gets P2002 and returns the first file (`:207-208`). The theoretical case: one process refuses in onComplete and another succeeds on the same upload. That needs two API tasks, and the rail is off there (`off`, M1 of #3640).
* **Does a retired key refuse a retry forever?** Not on any reachable path. After a 4xx, the staging copy is removed, so a retry gets 404 and a new upload gets a new id and key. After a 5xx, nothing is deleted. `put` of the same bytes on a live key is idempotent (`front-office/files.ts:45`), so the retry stores. The exception is R2-5.
* **Does the expiry sweep race a finish in flight?** Only in the narrow window of R2-3.
* **The decision panel's focus change.** The `focusin` tracker ignores `<body>`, so when the card unmounts the last place stays "inside". Signing in on the decision panel's own card (`case-decision.tsx:128`, inside `root`) still moves focus to its heading. Signing in on the Documents card leaves focus with the Documents panel. check_csc1s 52/52. That suite has no named focus check, so the m1 behaviour rests on code reading plus J-64 W6.

### What I ran (isolated copies, never :4400; Postgres 127.0.0.1:54329; US$0)
| Run | Result |
|---|---|
| `check_pff2_uploads.ts` | exit 0, 52/52 |
| `check_csd1u_staff_door.ts` 4433 | exit 0, 30/30 |
| `check_csc1s_decision_browser.cjs` 4435 (the lane's port in place of its header's 4491) | exit 0, 52/52 |
| `journeys/j_64.ts` j64 4434, as committed, twice | **exit 1 both times**: 12 PASS, then a TimeoutError at `:206` (R2-1) |
| a scratchpad copy of j_64 with a 150 ms wait before W6's Enter, twice | 16/16 once; 15/16 once (the unchanged `:220` raced) |

The screenshots j_64 rewrote are restored with `git checkout`. Someone else changed `break-report.md` in this worktree during the review (not this reviewer). I left it as found.

**#3640, commit 38ddab45 (the rail part: `rail.ts`, `doors.ts`, `check_pff2_uploads.ts`, identical at this head):** no Blocker or Major. Minors R2-3 and R2-5 are follow-ups. My verdict on that commit is **Approve** for #3640. R2-1 is in `j_64.ts`, not in that commit.

Verdict: Changes cba94bbbe5926f683f47114fcfda786a96dd4ac4
