# PF-21d — carrying out an approved "delete my data" request (brief for the tech lead)

Row: BACKLOG **PF-21d** (completes map row 85, R1.85). Shaped 23 Nov by the runtime lane, stacked on #3189 (PF-21b
part 3, the register `plat_data_request`). Requirement text read: `trace-requirements.py --brief PF-21d` only
(SA-11-16, -18, -28, -40). Legal points: Unconfirmed: no counsel. Cost US$0, live AI off.

## What main and #3189 give us (facts, checked 23 Nov)
* `ports/legal-hold.ts` + real adapter (PF-21b parts 1-2): `isHeld(tx, firmId, subjects)` with a `PERSON` subject.
* `ports/keep-period.ts` (AUD-5): class `client_financial` is a 7-year **FLOOR** (NFR5-08, BR-6). PF-21d uses it,
  not a constant of its own (AUD-5's duplicate note).
* Money rows (`client-money.prisma`) name the party **by id only** (`person_id`, `company_id`); the name lives on
  `fo_person`. So "money rows stay, name replaced by a reference" = anonymise `fo_person` in place, and leave every
  money row as it is (they are insert-only/frozen by trigger; touching them is neither needed nor allowed).
* PF-14's job runner (`platform/jobs/`) and #3189's daily check pattern (`platform.register.data_requests_daily`).
* **No platform-wide switch store.** `platform/settings.ts` (PF-3) is per firm, audited on a firm's line; SA-12's
  feature flags and kill switches are not built and have no BACKLOG row.
* **No firm-side "delete my data" request.** SA-11-16 says the job runs on "a firm's approved … request"
  (§3.4, SA05-Q3 firm tools); main has only #3189's register of requests made **to ExpatReady** (§3.8, SA-11-28).

## Decisions I need (each with my recommendation)
1. **Home of the "Data erasure" switch (SA-11-16 (d)).** Recommend a minimal platform switch, the shape SA-12 can
   absorb later: table `plat_switch` (key PK, `on` default true, changed_by, changed_at) + insert-only
   `plat_switch_event` (key, on, reason required, actor, at); one seeded row `platform.data-erasure` = ON;
   `GET /api/system/switches`, `POST /api/system/switches/:key` with a reason, `@SystemChange` (ALLOWED/REFUSED line in
   `plat_system_audit`). Key: `system/compliance:dsr-manage`, Platform Owner only, **Sample** (SA-12/R9-34 names no
   key). Rejected: env var (cannot be tripped at run time with a reason); a PF-3 firm setting (it is not a firm's).
2. **Which request feeds the job.** Recommend the job takes an *erasure order* (firm id, person id, approved at,
   source) so any request kind can feed it; this PR wires **the register's DELETION requests only**. The firm-side
   "delete my data" request (staff enter it on the client's person record, SA-11-40 rule 8) needs **a new row** —
   for Lead B to shape; I do not build it here.
3. **Split (P-610, under 800 lines each).**
   * **Part 1 (this lane, next):** `ports/erasure.ts` (`ErasurePort.register(module, eraser)`, interface, fake,
     contract test both adapters pass), the switch (decision 1), approve + cancel on the register, the 7-day job,
     the hold check, the per-module result steps, one test eraser. One migration: `plat_switch*`, column
     `erase_on date` on `plat_data_request`, event kinds `ERASURE_APPROVED`, `ERASURE_CANCELLED`,
     `ERASURE_MODULE_RESULT`, `ERASURE_SKIPPED_SWITCH_OFF`.
   * **Part 2:** the platform and front-office erasers (`fo_person` anonymised in place; its leads, prospects, calls,
     notes, consent rows; money rows untouched by id, checked against AUD-5's floor), plus the outcome text
     (what was deleted, what is kept and why, SA-11-28) stored on the request.
   * **Not here:** the deletion-outcome **email** (SA-11-28) — recommend PF-21rs or a part 3 through MailPort; the
     case side's eraser is CS-X2.
4. **States during the window.** Recommend: approve requires type DELETION, status PENDING or IN_PROGRESS, and both
   `firm_id` and `person_id` set **and the person existing in that firm** (closes #3189's review m2); it sets
   IN_PROGRESS, `erase_on` = approval day + 7 (Toronto, code constant), step `ERASURE_APPROVED`. Cancel before
   `erase_on` clears it (step `ERASURE_CANCELLED`). The job ends COMPLETED (all modules ERASED/nothing to erase) or
   HELD (any module held or kept, never a false COMPLETED, SA-11-28).

## Test list — `tests/check_pf21d_erasure.ts` (each a pass line and a fail line)
1. Approved day 0: the job on days 0-6 erases nothing; on day 7 it runs (fake clock).
2. Cancel on day 6 → day 7 erases nothing; cancel after the job ran → 409.
3. Switch off → nothing erased, one `ERASURE_SKIPPED_SWITCH_OFF` step, the request stays IN_PROGRESS; on → next run erases.
4. Tripping the switch without a reason → 400; by Support/Admin/Auditor/firm staff → 403 and a REFUSED line; by the
   Platform Owner → saved, one event, one ALLOWED line.
5. A PERSON hold (or FIRM hold) on the subject → `HELD`, no eraser called, the hold's reason on the step; released → next run erases.
6. A registered test module is called once with (firm, person), its result recorded as one step; a second run does nothing.
7. One module failing → the request is not COMPLETED, the failure is a step, the job fails and retries.
8. Firm A's order never calls an eraser with firm B, and the eraser runs under firm A's scope only.
9. Approve refused: not DELETION, no person, a person not in that firm, already COMPLETED → 400/409, nothing scheduled.
10. Database: the new event kinds are insert-only; `erase_on` changes only through approve/cancel; the migration is measured
    right after itself on empty and demo copies; `migrate diff` empty.
11. Unchanged and passing: `check_pf21b_requests`, `check_pf21b_holds`, `check_pf21b_port`, `check_pf12_walls`,
    `check_features_registry`, `check_aud5_keep_periods`.

## Touch list (part 1)
* new `ports/erasure.ts`, `ports/contracts/erasure-port.contract.ts`
* new `api/src/platform/erasure/{service,job,routes}.ts`, `api/src/platform/switches/{service,routes}.ts`
* `api/src/platform/register/requests/{service,routes}.ts` (approve, cancel; one status rule)
* `prisma/schema/platform-register.prisma` + one migration folder (queued after #3189's `20261123100000_pf21b_data_requests`)
* new `api/src/features/platform-erasure.ts`; `api/src/platform/MODULE.rows/PF-21d.md`
* new `tests/check_pf21d_erasure.ts`; `tests/check_pf4s_system_signin.ts` only if a new key is seeded (decision 1 reuses one: no change)

Reviewer + breaker (deletion, schema, permissions). Starts once #3189 merges or as a PR stacked on it.

## Split of part 1 (23 Nov, the runtime lane, P-610)
Built whole, part 1 was 927 changed lines of code and tests, over P-610's 800. So it ships as two stacked PRs, the same
scope as accepted:
* **1a** (branch `claude/sharp-shannon-mdy7sc`, on #3189): `ports/erasure.ts` + its contract and registry, the switch
  (`plat_switch`, `plat_switch_event`, migration `20261124080000_pf21d_switch`, `/api/system/switches`),
  `tests/check_pf21d_switch.ts`. About 530 lines.
* **1b** (branch `claude/runtime-pf21d-erasure`, on 1a): approve, cancel, the daily job, `erase_on` and the ERASURE_*
  steps (migration `20261124085000_pf21d_erasure`), `tests/check_pf21d_erasure.ts`. About 520 lines.
