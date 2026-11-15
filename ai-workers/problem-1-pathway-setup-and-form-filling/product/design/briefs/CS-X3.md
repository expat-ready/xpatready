# Brief: CS-X3, a legal hold (and the keep period) stops every case-side delete: one delete door and a CI guard (map row 85 via PF-21b; documents and case deletes, API only; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 03:3x IST by the case-side shaping lane from BACKLOG row CS-X3 (line 835; Lead B's ask (c)), checked against `main` 81505985f and CS-C1a's head e59e0c030 (#1818, approved, not merged). **Draft until the release Lead approves it.** Model: Opus 5.5, effort: high (deletion, legal hold, a CI guard over every case-side file; breaker yes). **Ready when:** part 1 after PF-21b's port PR is on `main` (`ports/legal-hold.ts` with its fake and contract; not on `main`: a contract gap below). Part 2 after AUD-5 part 2 (`KeepPeriodPort.check`, `ports/keep-period.ts`) and CS-C1a (#1818, `Case.closedAt`) are on `main`. **Two parts, two PRs** (the row says 1 PR; the keep-period step has its own ready-when, and CS-NT1 and CS-D6 need the hold step first).

**Points the release Lead confirms in the approval (the requirement or `main` corrects the row):**
* **`LegalHoldPort` is PF-21b's, not CS-X3's.** CS-NT1's brief (batch 1) and AG-13-70 (5) say "CS-X3's `LegalHoldPort`". AUD-5's brief (batch 2) says the case delete door calls `check()`. In fact PF-21b ships the port (`ports/legal-hold.ts`, BACKLOG line 289). CS-X3 ships the **case-side door that every case-side deleter calls**, `caseDelete(...)`, which asks the port and then AUD-5. **Ask:** amend CS-NT1's brief so its note delete and its `case_note_purge` job call `caseDelete` (kind `note`), not the port directly. One door means one place where the order of BR-7 is kept.
* **On `main` there is no case-side delete to route through the door yet.** `case-documents.ts` has no Dispose and no cleanup. Its only `rmSync` (`:303`) removes a refused upload that was never stored. The same holds for `case-checklist.ts:289`, `sign-steps.ts:239` and `submission.ts:248`, and `fill-case.ts:526-556` removes a pending copy. Dispose is CS-D6's (not built), the expired-upload cleanup is PF-F2's (platform rail, not built), and the eraser is CS-X2's. So **`case-documents.ts` leaves the touch list.** Part 1 ships the door, its tests and the CI guard. Each later deleter calls the door in its own row (CS-D6, CS-X2, CS-NT1, PF-29's task delete when it is on a case host, CS-K1's delete of an empty client per AG-07 BR-28).
* **PF-F2's expired uploads were never stored.** The tus rail's half-finished upload has not passed PF-F4 and is not a document, like a refused upload. The recommendation is to put it on the allow-list with that reason and not gate it. The Lead rules: if it must be gated, PF-F2's cleanup calls PF-21b's port itself, since it is a platform file and cannot import the case-side door (contract §1 rule 4).
* **The words a firm user sees are fixed by the requirement:** "This data is on hold and can't be deleted." (SA-11-18@96c4c698; SA-11 §3.5). The answer is 409 with code `HELD`, these words and the hold's reason (BR-12: disclosed, never a false success).
* **The keep period is a reminder, not a lock** (SA-11-33@0325ce52; SA-11 §3.4: "Deleting inside the period shows a warning the person can pass with a reason (recorded)"). So part 2's step on a **closed** case's data is: `FLOOR` refuses with the date, `WARN` needs a reason that goes on the audit line, and `OK` proceeds. On an open case only the hold is asked: the firm's closed-file reminder starts at closing (CS-C1a's `closedAt`).
* **`FilesPort` on `main` has no `delete`** (`ports/files.ts`: `put`, `get`, `exists`; write-once keys). The door therefore takes the removal as a callback and never calls a store itself. Byte removal lands with CS-D6 once Lead B adds `delete` (a contract gap below). The CI guard watches for `files.delete(` in any case. Until CS-D1, a stored file lives under `var/workspaces/<ws>/…`, so the door also allows an `rmSync` of a stored path inside its own callback, and nowhere else.
* **One case-side bulk delete that is not a data delete:** `case-prepare.ts:259` `filingApplicant.deleteMany` keeps a filing's applicant rows equal to the people on it (C11.12). The recommendation is the allow-list, with the reason "join rows follow the filing; no stored data about a person is removed". The Lead rules.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-X3` and take **one part of row CS-X3** end to end on a fresh branch from `origin/main`, one PR per part.

**The row:** `product/BACKLOG.md` row **CS-X3**, read with the points above. Requirement text (cite these, read only this text):
* **SA-11-18@96c4c698**: a hold on a firm, case, data category or date range blocks deletion of in-scope data; hold beats every deletion; a firm user sees "This data is on hold and can't be deleted."
* **SA-11-40@13537758** rule 4: a hold may name one person record and blocks deletion of that record's data.
* **SA-11-28@0d12915a**: a held deletion is reported HELD or partial, never falsely complete.
* **SA-11-33@0325ce52**: the closed-file keep period is the firm's own reminder, passed with a recorded reason.
* SA-11 **§3.5** (`SA-11-audit-compliance-and-data-governance_v2.16_2026-10-25.md:346-363`): any deletion path checks active holds first; holds are explainable.
* SA-11 **BR-7** (`:626`): legal hold > keep-period warning > deletion request.
* SA-11 **BR-12** (`:631`): HELD with disclosure, never a false success.
* **AG-13-70@de512dbe** (5): an item on legal hold cannot be deleted (notes and tasks).
* AG-07 **BR-28** (`AG-07-case-core-and-delivery_v3.12_2026-10-28.md:671`): a client or case with history is closed, not deleted.

**Read only these:** `ports/legal-hold.ts` and its contract (PF-21b's, once on `main`); part 2 `ports/keep-period.ts` (AUD-5); `ports/audit.ts` (the flat port shape with its fake); `ports/files.ts`; `api/src/core.ts` (`Audit.log`, `fail`; `actorOf`); `api/src/case-close.ts` and `api/src/features/case-close.ts` (CS-C1a: the firm id from `platform_firm` by `Case.firmKey`, PF-4's guard pattern); the delete and `rmSync` lines listed above; `api/src/demo.ts:540-575` (the reset); `api/src/MODULE.cases.md`; the TypeScript compiler API as AS-1m's import walk uses it (already a dependency).

## Part 1 (CS-X3a): the door, the hold step and the CI guard (expected ~500 lines)
* **`api/src/documents/delete.ts`:** `caseDelete(tx, ctx, req, remove)`.
  * `ctx` is the session's firm scope (PF-4's guard on a staff route) or the job's `firmScope` (PF-14). **The firm is never taken from `req`.**
  * `req = { kind: "document" | "note" | "task" | "erasure" | "client", caseId | null, personIds: string[], category, recordDate, reason? }`. `personIds` are the front-office person ids of the people whose data it is: the case client's `fo_person_id` from CS-K1. A family member has none yet (CS-X1's question). `category` is from a fixed case-side list (`case_documents`, `case_answers`, `case_notes`, `case_tasks`, `case_files`) offered to PF-21b as its CATEGORY vocabulary.
  * **Step 1, holds:** `LegalHoldPort.isHeld` for the firm, the case, each person, the category and `recordDate` (the DATE_RANGE scope). Any hold → **409 `{ code: "HELD", title: "This data is on hold and can't be deleted.", reason, placedAt }`**. `remove` is not called and nothing changes. Every match is reported, not just the first.
  * **Step 3 (step 2 is part 2):** `remove(tx)` runs in the same transaction, then one audit line: ids, kind and reason only, never names or answers (SA-11-40 §7; BR-16 style).
  * **No race with a new hold.** The hold read and the delete must be serialised against PF-21b's placement (a contract gap below). Until PF-21b offers it, the door takes `pg_advisory_xact_lock_shared(hashtext('legal-hold:' || firmId))` and the PR asks PF-21b's placement to take the exclusive form.
* **The CI guard `tests/check_csx3_no_bare_deletes.ts`** walks every `.ts` under `api/src/` with the TypeScript compiler API. It fails on:
  * a call to `.delete(` or `.deleteMany(` on a Prisma delegate of a model in a case-side area file (`cases`, `answers`, `filings`, `review`, `submission`, `evidence`, `links`, plus any area file a later case row adds; the list comes from the schema files, not typed by hand);
  * any `files.delete(` / `FilesPort.delete`;
  * `rmSync` / `unlinkSync` / `rm(` / `unlink(` in a file under MODULE.cases.md's `paths`, `api/src/documents/`, `api/src/case-export/` or `api/src/case-notes*`.

  It skips calls inside `api/src/documents/delete.ts` and calls on the **allow-list**. Each allow-list entry is a file, a function name and a reason; line numbers move, so they are not used. The entries:
  * the refused-upload cleanups: `case-documents.ts` `upload`, `case-checklist.ts` `upload`, `sign-steps.ts` signed scan, `submission.ts` fee receipt (never stored);
  * `fill-case.ts`'s pending copy (never kept);
  * `case-prepare.ts`'s applicant sync (point above);
  * `demo.ts`'s reset (Sample firm only, P-571 (1); proven by CS-W3);
  * the in-memory `Map`/`Set` `.delete(` calls, recognised by type, not listed.
* **Named test cases** (P-606), file `tests/check_csx3_holds.ts` (on PF-21b's fake), a pass and a fail each:
  * **CS-X3 DW1:** a person hold on the client's `fo_person_id` → `caseDelete` of that client's document answers 409 `HELD` with the words and the reason, and `remove` is never called (a spy), so the row and bytes stay. With no hold → `remove` runs once and one audit line is written.
  * **CS-X3 DW2:** a case hold blocks a delete on that case only; the same kind on another case of the same firm proceeds.
  * **CS-X3 DW3:** a released hold (released at set) lets the delete proceed; a hold placed after release blocks it again.
  * **CS-X3 DW4:** a hold on firm A never blocks firm B; a `req` that names firm A while the session is firm B deletes nothing of A's (the firm comes from `ctx`; the request has no firm field, a test sends one and it is refused by zod `strictObject`).
  * **CS-X3 DW5:** a CATEGORY hold on `case_notes` blocks a note delete and not a document delete; a DATE_RANGE hold covering `recordDate` blocks it and one ending the day before does not.
  * **CS-X3 DW6:** two holds match → both reasons are in the 409.
  * **CS-X3 DW7:** a hold placed concurrently (a second connection takes PF-21b's placement lock while the delete waits) → the delete sees it and answers `HELD`, never deletes after the hold commits.
  * **CS-X3 DW8 (the guard):** a throwaway file written by the test with `tx.caseDocument.delete(...)` makes the guard fail naming the file and function. The same call inside `documents/delete.ts`'s callback passes, the real tree passes, and an allow-list entry whose function no longer exists fails (no stale entries).
  * **CS-X3 DW9:** the demo reset still works for the Sample firm (the existing reset suite unchanged).
* **Touch (part 1):** new `api/src/documents/delete.ts`, new `tests/check_csx3_holds.ts`, new `tests/check_csx3_no_bare_deletes.ts` (with its allow-list inside), `api/src/MODULE.cases.md` (paths gain `documents/*`; the door under Invariants: "every case-side delete goes through `caseDelete`").

## Part 2 (CS-X3b): the keep-period step (expected ~250 lines; after AUD-5 part 2 and CS-C1a)
* **Step 2** (between holds and `remove`): when the case is closed (`Case.closedAt` set, CS-C1a), the door calls `KeepPeriodPort.check(tx, { firmId, class: "closed_client_file", startedAt: closedAt, subject })`. AUD-5 asks holds first itself, so the door passes its hold result through and does not ask twice.
  * `FLOOR` → 409 `{ code: "KEEP_FLOOR", until }`.
  * `WARN` → `req.reason` (1-500 characters) is required, or 409 `{ code: "REASON_NEEDED", title: "This closed file is inside your firm's keep period (until <date>). Give a reason to delete it." }`. The reason goes on the audit line.
  * `OK` → proceed.
  * The firm's setting is read through AUD-5, never a second setting (AUD-5's brief drops CS-D6's `documents.keep_period_days`).
* **Named test cases**, file `tests/check_csx3_keep_period.ts`, a pass and a fail each:
  * **CS-X3 DW10:** a closed case inside the firm's reminder → `REASON_NEEDED` without a reason; with one → deleted, and the reason is on the audit line.
  * **CS-X3 DW11:** an open case → no keep-period ask (a spy on the port), only the hold.
  * **CS-X3 DW12:** no firm setting → `OK`; a held item on a closed case → `HELD`, never `REASON_NEEDED` (the hold wins, BR-7).
* **Touch (part 2):** `api/src/documents/delete.ts`, new `tests/check_csx3_keep_period.ts`, `api/src/MODULE.cases.md` (one line).

**Done when:** `tsx studio/tests/check_csx3_holds.ts` and `tsx studio/tests/check_csx3_no_bare_deletes.ts` (part 1) and `tsx studio/tests/check_csx3_keep_period.ts` (part 2) exit 0, with each DW case passing and failing as named. These must pass unchanged: `check_csc1_close.ts` (once on `main`), `check_case_feed.ts`, the case document and checklist suites (`check_c65_document_rules.ts`), the demo reset and the checkpoint load (C10.1), and `node studio/tools/check-port-contracts.mjs` (exit 0). The module-card check passes and full `ci` is green on the head.

**Duplicate check:** BACKLOG (PF-21b ships `LegalHoldPort` and names "the case side's deletes" as callers; AUD-5 names CS-X3 as a caller of `check`; CS-D6's Dispose and CS-X2's eraser name this door; CS-NT1's brief calls the port "CS-X3's"), open PRs (`legal-hold`, `caseDelete`, `isHeld`), `git grep -n "isHeld\|LegalHold\|caseDelete" api/src ports` on `main` (empty); no case-side delete door exists; one `Duplicate check:` line.

**Parallel safety:**
* All new files except `api/src/MODULE.cases.md` (one paragraph; CS-K1, CS-K3, CS-NT1 add theirs: merge `main` on a conflict).
* No schema and no migration, so the row does not hold the `cases.prisma` baton.
* `core.ts`, `runtime.ts`, `case-feed.ts` and `ports/` are untouched.
* **Order:** part 1 **before** CS-D6's Dispose, CS-NT1's delete and purge, and CS-X2. They call the door, and the guard fails them otherwise.
* The guard runs over every file, so a row merging in the same hour with a bare case delete turns red. That is intended. Its fix is the door, not an allow-list entry, unless the release Lead adds one.

**Contract gap (for the PR body):**
* **`LegalHoldPort` is not on `main` and in neither contract's ports list** (case-side §3, platform §7).
* PF-21b's `isHeld(firmId, subject)` takes one subject. The door asks five (firm, case, persons, category, date), so the request is for `isHeld(tx, firmId, subjects[]) → { held: false } | { held: true, holds: [{ scope, reason, placedAt }] }`, called inside the caller's transaction, with **placement and the read serialised** (DW7).
* **The CATEGORY vocabulary** for case-side data is unstated in PF-21b; this brief offers the five names above.
* **A PERSON hold on a family member cannot be matched on the case side.** Case-side people are per case with no front-office person id (CS-K1 links only the client).
* **`FilesPort.delete` does not exist** (Lead B's port; CS-D6 needs it).
* **`KeepPeriodPort`** is AUD-5's, not yet on `main`.

**Reviewer and breaker** (deletion; P-278). The breaker tries:
* a delete with a firm id in the body;
* a hold placed mid-delete;
* a bare delete hidden behind an alias (`const d = tx.caseDocument; d.delete(...)`) or a dynamic delegate (`tx[name].deleteMany`); the guard must catch both, or the PR names the limit;
* an allow-listed function that gains a second, real delete;
* the 409's words in every state.

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One part, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`). Read only the files named here and the code you change (P-556).
---
