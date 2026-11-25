# FO-13i review: the client identity check API (no screen)

Reviewer (did not build it), 16 Nov 2026, Opus 5.5, effort high (P-605). Branch `claude/compassionate-einstein-jl1bgi` at **`29d6dd498`**, PR #2011, against the brief `design/lead-b-briefs/FO-13i.md` on `main` (the brief wins). The diff was read against merge base `d66bcfd2d`. API only: there is no concept, no screen, no browser walk, so items (2), (3), (6) and the BIC scorecard are N/A. The journey part is the suite's API journeys (`journey-test-reviewer-2026-11-16.md`, **8/10**). Port :4400 was not used. Each scratch database on :54329 was dropped after its run.

**Verdict: Ship after fixes.** 4 Major, 0 Blocker (see the end).

## What I ran (on 29d6dd498)
* `tests/check_fo13i_identity.ts`: **22 passed, 0 failed** (8 s).
* Neighbours, all green: fo5_retainers 243/0 · pf6b_permission_rules 29/0 · pf6r_roles_read 17/0 · fo13_compliance_schema 76/0 · features_registry 27/0 · case_feed 39/39 · fo7a 123/0 · pf19a 94/0 · fo1a 124/0 · fo1b 80/0 · pf25 68/0 · a24 28/0 · c617 23/0 · csc1_close 55/0.
* Red, and caused by this PR: **check_pf3_platform_schema 74/1** and **check_pf12_walls 99/1**. Both checks pass on the merge base.
* Probes, using a scratch copy of the suite's setup with "everyone sees all" off: notes, a company signatory, a polyglot file, double submit, 11 MB. I also read the breaker's `break-report.md` and confirmed its B2 and B3 myself.
* Graph: G1 0 · G2 0. G3 lists the four new routes as having no test. The suite does call all four, but it builds them as relative paths (`people/${id}/…`), which the graph does not parse. This is a tool limit, not a gap.

## Brief, line by line
| Brief item | Result | Evidence |
|---|---|---|
| DW1 last 4 only, full number 400, `XX` 400 | Met | suite DW1 (3 cases). `documentNumber` → 400 naming it |
| DW2 s. 24(2)(a) details stored and listed, unknown detail 400 | Met | suite DW2. The list is newest first and names who checked |
| DW3 copy in one insert, update refused, link lifetime, firm B, no `document:show`, renamed text 415 | Met | service.ts:127-138. Suite DW3 (7 cases), including the failed-insert answer `copyReferenced: false` |
| DW4 warning on send, send still 200, on the audit line; none with a check | Met for the warning itself. **Gap M4** | retainers/service.ts:503-513. Suite DW4 |
| DW5 403 without the key, 404 for an unseen person | Met. **Gap M4** | suite DW5 |
| DW6 nothing secret in logs, outbox or audit; migration in a parallel world | Met for FO-13i's own suite. **M1, M2:** the migration turns two other suites red | suite DW6. My probes' log lines carry code and constraint only |
| Touch list | Kept exactly | 8 files, 517/6 lines (under 800, P-610) |
| Insert-only; copy key and sha256 in the same insert | Met | no update path; trigger refusal tested |
| Never in a log, email or event | Met | payload is ids, method, details, `copyKept`. The audit line on send says "the signer" plus `signerPersonId`, never the name |
| Warning, never a block | Met | computed outside the send transaction. A stale warning in a race is harmless |
| Migration: 4 roles (Sample), catalogue NONE/GENERAL, own folder, later stamp, rollback | Met | `20261116200000` is later than `20261116030000` (newest on `origin/main`). PF-6b's catalogue rules pass |
| Module card | Updated, 34 lines | MODULE.md |

## Builder's choices
1. **List gated on `agent/prospect:show` plus person visibility.** Accept. All six roles hold the key, and visibility narrows it. The brief names no read key.
2. **Person visibility.** Accept the shape: it reuses `visibilityOf`/`sees`, and an inactive owner counts as Unassigned, as in `sales/leads.ts`. **But it is incomplete:** it leaves out company contacts (M4).
3. **The "if possible" source.** Settled. Lead B read s. 24(2)(a) at source on 16 Nov 2026 (PR comment, quoted in the PR body: "seeking corroboration of the information if possible"). One small leftover: the comment at retainers/service.ts:503 still says "the row's words" (m6).
4. **Unknown fields refused 400.** Accept. This is the safer reading for a full `documentNumber`, and the tests show it.
5. **ISO 3166-1 hard-coded.** Accept: 249 distinct codes, and no new dependency (STANDARDS §1 gate).

## D1-D20 (1-5; API share only)
D1 4 (every DW line has a test; M4 misses the company-signer case) · D2 4 (insert-only, checks mirrored; double submit duplicates, m4) · D3 5 (reuses FilesPort, FileLinks, `visibilityOf`, problem()) · D4 N/A · D5 3 (a fixable note gives 500 and leaves an orphan copy, M3) · D6 4 (audit line per check, sha256, the checker's name) · D7 N/A (no AI) · D8-D10 N/A (no screen) · D11 3 (Problem Details with `fields` everywhere except M3 and multer's own refusals, m3) · D12-D14 N/A · D15 5 (about 4 queries a call, no per-row requests) · D16 3 (each rule's test fails when the rule is removed: last4, visibility, warning and unknown field all checked by reasoning; but CI is red, M1/M2) · D17, D20 simulated only (no intended user; no screen) · D18 4 (Code cited with quote and date, Sample labels, "Unconfirmed: no counsel") · D19 3 (send → warning → record fails for a company signer, M4).

## BIC-01-BIC-20 (EXPERIENCE §6)
All N/A: an API row with no screen, on the front office. The panel's scorecard belongs to FO-13s.

## STANDARDS [M] lines touched
Personal data never logged: met. Server authorisation, deny by default: met (every route carries `@PermissionKeys`, firm and person checked in the service). Uploads checked by type and size, stored outside the web root, never rendered (attachment, nosniff, CSP sandbox): met. Migrations preserve records with a recorded rollback: met. **Problem Details with field-level messages (STANDARDS line 40): not met for M3.** A rule's test fails when the rule is removed: met.

## Issues, ranked
**M1 Major (Must). The migration turns `check_pf3_platform_schema` red.** "starter roles' keys per role equal SA-06 Appendix C" now gives OWNER 232, ADMIN 214, CASE_MANAGER 146, CASE_OFFICER 100. The suite states the rule itself (`tests/check_pf3_platform_schema.ts:80-82`, P-601, Lead B on #1753): "A row that adds keys extends this list". **Fix:** add `"agent/identity-check:"` to `ADDED_BY_LATER_ROWS`. The file is outside the touch list, so ask in a PR comment (P-605) and paste the green line.

**M2 Major (Must). The migration turns `check_pf12_walls` red.** "applies on the demo-data copy and changes no row" fails on `platform_permission_key` and `platform_role_permission`. Its demo copy applies every later migration and expects no row change (`tests/check_pf12_walls.ts:162-168`). **Fix:** have PF-12's count compare across its own migration only (apply PF-12, compare, then apply the later ones), or exclude rows that later rows add by name. This is also outside the touch list: same PR comment. The PR's "Checks" section still says "results to follow". Before asking for the label, the brief asks for pasted result lines from every suite of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database.

**M3 Major (Must). A note with a line break, a tab, or only invisible characters answers 500 "The check was not saved. Try again."** With a copy attached, each retry leaves a stored copy that no record names. My probe: `"Seen at the office\nby the officer"`, `"Seen\tat office"` and `"​"` all gave 500 `NOT_SAVED`, logged as `constraint=fo_identity_check_method_detail_check` (breaker B2 found the same). Cause: the class at `service.ts:68` lets `\t \n \r` through, and there is no visible-character rule. The database's `fo_compliance_text_ok` (FO-13 migration lines 124-127) refuses U+0001-U+001F and needs one visible character. **Fix:** mirror `fo_compliance_text_ok` in `parse()`. Return 400 naming `methodDetail` (or fold line breaks to spaces before checking), count length in code points, and add a DW1 fail case.

**M4 Major (Must). The send warning can name a signer the sender cannot record or read.** Setup: "everyone sees all" off; a Case Officer owns a CORPORATE prospect; its SIGNATORY contact has no lead. Send warns "No identity check is recorded for …", but `POST`/`GET people/<signatory>/identity-checks` give **404 / 404** for that owner (my probe; breaker B3). Cause: `IdentityChecks.person()` (`service.ts:105-115`) counts only the person's leads and the prospect's subject and primary contact. **Fix:** also make a person visible when the reader owns a prospect whose `subjectCompanyId` has this person as a current contact (`fo_company_contact`, `validTo` null). Add a DW5 case.

m1 Minor (Should). Spaced, full-width, zero-width or soft-hyphen spellings of a full number pass `looksLikeNumber` (`service.ts:44`; breaker B1, my probe `AB 123 4567` → 201). The service mirrors FO-13's own table rule exactly, and the canonical forms are held, so for this row I rate it Minor, not the breaker's Major. Fold NFKC and strip separators and format characters before the test, and tell FO-13's owner about `fo_compliance_no_document_number`.
m2 Minor (Should). The multer interceptor has no `fields`/`fieldSize`/`parts` limits (`routes.ts:22`; B4: +659 MB in one request).
m3 Minor (Should). Multer's own refusals (over 20 MB, two files, wrong field name) are not in the problem() shape (B5).
m4 Minor. A double submit makes permanent duplicate checks (probe: 201, 201). FO-13s can guard the button. No idempotency is in the brief.
m5 Minor. Graph G3 cannot see the suite's relative route paths (tool limit; noted only).
m6 Minor. retainers/service.ts:503: cite the Code's s. 24(2)(a) "if possible" (now read at source by Lead B) instead of "the row's words".

## What I could not check
I did not boot the real app (the suite mounts the two features with PF-4's guard). The QA lane's `check_r16_permission_sweep` needs a running copy and was not run. There was no CI run to read, because the PR is a draft. The legal reading is **Unconfirmed: no counsel**.

**Verdict: Block** (open Majors, so no `review: approved` for 29d6dd498). To fix: **M1** pf3 later-keys list · **M2** pf12 demo-copy count · **M3** note control and visible-character rule → 400 · **M4** company contacts in person visibility. Minors m1-m6 at the builder's choice.

## Re-review: 29d6dd498 → 89c2b5f (P-277, the diff only)
Reviewer, 16 Nov 2026. I read `git diff 29d6dd498 89c2b5f70` (commits 197b010 and 89c2b5f: 5 code and test files, plus the records).

**Runs on 89c2b5f:** check_fo13i_identity **25/0** · check_pf3_platform_schema **75/0** · check_pf12_walls **100/0** · check_fo5_retainers **243/0**.

**The new tests fail on the old code for the right reason.** I put the new `check_fo13i_identity.ts` in a scratch worktree at 29d6dd498 and got 16/9:
* B-1: every spelled-out number answers 201.
* B-2: `[500,500,500,500,500]`.
* B-3: the warning names "Signatory Sample", then list, record and RO answer `404,404,404`.

The other 5 failures are knock-ons: on the old code the B-1 notes were stored, so the later `rows(PR)` counts are off.

| Finding | Status | Evidence |
|---|---|---|
| M1 pf3 later-keys list | Closed | `agent/identity-check:` added to `ADDED_BY_LATER_ROWS`, as the suite's own rule says; 75/0 |
| M2 pf12 "changes no row" | Closed | PF-12's migration is applied and compared alone, then the later ones (`check_pf12_walls.ts:167-170`); the check still covers PF-12; 100/0 |
| M3 note gave 500 | Closed | `oneLine()` mirrors `fo_compliance_text_ok` before the copy is stored (`service.ts:53-54, 79`). My probes give 400 naming `methodDetail` for newline, tab and `U+200B`. Suite: no new file on disk. A remaining database check refusal is now 400, never "Try again" |
| M4 company signatory 404 | Closed | `person()` also counts current contacts of a company prospect the reader owns, and a retainer signer whose retainer the reader represents or owns (`service.ts:126-135`). My no-lead signatory probe now gives 201 and list 200; a reader with neither still gets 404 (suite) |
| m1 spelled numbers | Closed | NFKC fold, digits of any script, hidden characters dropped; 12 spellings → 400 (suite) |
| m2 multipart limits | Closed | `fields 20, fieldSize 2048, parts 21` (`routes.ts:23`); 500 four-byte characters fit in 2048 bytes |
| m6 source comment | Closed | `retainers/service.ts:503-505` cites s. 24(2)(a) with date; "Unconfirmed: no counsel" |
| m3, m4, m5 | Open, Minor | unchanged (multer's raw refusals; double submit; graph tool) |

**New, Minor (Should), not blocking:**
* **n1.** The note now refuses any 6 or more digits in all, so ordinary notes are refused:
  * "Video call on 16 Nov 2026" → 400
  * "Seen 2026-11-16" → 400
  * "Called back on 416 555 0199" → 400

  FO-13's table comment says "Dates (2026-11-14) and phone groups pass". The refusal is a clear 400 naming `methodDetail` ("at most 5 digits in all"), so the user can recover, and it errs toward keeping numbers out. Either let a date shape through or tell Lead B and FO-13s that notes carry no dates (the check's own `checkedAt` records the time).
* **n2.** The database-refusal fallback 400 (`service.ts:169`) names the constraint in `detail` but has no `fields` key. It is a backstop only.
Nothing else broke. The send path, the event, the audit and the migration are unchanged. Accented text still saves (probe 201). The polyglot copy is still served as an attachment with the sandbox CSP.

**Verdict: Approve** for **89c2b5f706be9f3943c926b1cfb7fb0b22c7916c** (no open Blocker or Major). The two test files outside the touch list wait on the tech lead's answer on the PR, as the builder asked.

## Re-review 2: 422d5122f → f38b7b763 (P-277, the diff only; m4, idempotent creates)
Reviewer, 16 Nov 2026. The diff touches 2 files, +39/-8 (`service.ts`, `check_fo13i_identity.ts`). **Runs on f38b7b7:** check_fo13i_identity **27/0** · check_fo5_retainers **243/0**.

**How it works.** A required `requestId` uuid becomes the check's id and its copy key (`identity/<person>/<requestId>.<ext>`, the same shape the table accepts). A firm-scoped pre-check, FileKeyTaken and P2002 all lead to `replay()`.
* **The comparison is complete.** It compares every stored field the request sets: person, checker, method, note, type, country, expiry, last 4, details and copy sha256 (`null === null` when there is no copy). Firm comes from `firmScope`. Expiry compares DATE to UTC midnight on both sides; my probe gave the same body 201, then 201, and expiry changed to `2031-06-01` gave 409. Details are compared in order, so a reordered list is 409, which is acceptable.
* **It is safe.** A match is returned through `list()`, so visibility is checked again. A mismatch answers 409 with no field of the saved check: another staff member reusing R's id on their own person gets 409 `REQUEST_REUSED`, and firm B gets 409 too (suite). That tells B only that a random uuid it already holds exists. Negligible.
* **No copy is overwritten or wrongly named.** `LocalFiles.put` claims the key with `link` (EEXIST): the same bytes count as a retry, other bytes raise FileKeyTaken. A row's sha256 is therefore always its file's.

**Races probed on a fresh requestId (3 rounds each), against my scratch copy of the suite's setup:**
* 4 identical JSON saves at once → 201×4, 1 row, 1 id.
* 4 identical saves with a copy → 201×4, 1 row, 1 new file.
* 2 saves with different copy bytes → one 201, one 409, 1 row.
* A retry with the same requestId after a forced failed insert (500) → **201 with the copy**. The earlier unreferenced copy is now healed rather than orphaned.
* A missing `requestId` (raw request, no helper) → 400 naming it.

**Orphan copies.** There is no new orphan path in normal use. Only a requestId reused for another person or firm, together with a copy, stores that copy and then answers 409 without the "not attached" note (n3, Minor; it needs a client bug or a deliberate replay).

**The tests.** The auto-requestId helper adds an id only when the case names none, and only to `POST …/identity-checks` (never to `download-link`).
* "no requestId → 400" in the suite actually sends `"x"`. It is the same branch, and my raw probe covers the missing case.
* The fail-first evidence is weak, as you note. The two new cases do fail if the id is ignored or replay is removed. But the suite's "three at once" runs after the first save has committed, so the P2002 path, the sha comparison and a same-firm other-person reuse are proven only by my probes (n4, Minor: run the three-at-once on a fresh requestId and add one other-bytes case).

**Minor (Should), not blocking.**
* n3: the orphan copy described above.
* n4: the test gaps described above.
* n5: `requestId` is now a required field of the record route, but `api/src/front-office/MODULE.md`'s entry line does not name it (STANDARDS module card [M]: update the card or say "Card unchanged").
* m3 and m5 stay open. n1 and n2 from the re-review are unchanged.

**Verdict: Approve** for **f38b7b76387285f48c09d6572ac0fb0a611a45f5** (no open Blocker or Major).
