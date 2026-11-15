# Brief: CS-C1, decision, withdrawal, close and reopen; the case count (map row 77; cloud builder lane; row owner the release Lead)

Written 15 Nov 14:2x IST by Lead 57 (feeding Lead, P-613) from BACKLOG row CS-C1 (rev 16.10, QA-474), checked against `main` d52b7274e. **Ready when:** PF-4 #1744 is on `main` (it is). The BACKLOG row also says "a schema slot after CS-D1"; CS-D1 has no PR, so the release Lead decides whether CS-C1 takes the `cases.prisma` slot now (asked 14:10 IST). Effort: Opus 5.5 **high** (schema, permissions and plan limits, P-608 (2)). Paste into a new cloud session on the repository (default branch `main`). **Two parts, two PRs (P-610):** run part 1 first; part 2 starts from `main` after part 1 merges, in the same session or a fresh one.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-C1` and take **one part of one row** end to end on a fresh branch from `origin/main`, one PR per part.

**The row:** nothing on `main` records a decision or closes a case: `Case.status` is only ever `OPEN` (`prisma/schema/cases.prisma`), and a filing is submitted when it has a `FilingRecord` (C8.2, `prisma/schema/filings.prisma`). CS-C1 adds the decision record, withdrawal, close and reopen, the two events, and (part 2) the active-case count and the plan-limit check at opening that PF-15 waits on. Requirement text: only what `python3 product/tools/trace-requirements.py --brief CS-C1` prints (contract §3.4, §4; SA-3-4, SA-3-47; AG-7-33, -34, -13, -50; BR-10, BR-15; P-588 (3)). Outcome words are a **Sample list until cited** (AG-7-33 rule 4; P-170).

**Read only these:**
* `prisma/schema/cases.prisma` (`Case`, `CaseStage`) and `prisma/schema/filings.prisma` (`Filing`, `FilingRecord`);
* `api/src/runtime.ts` around `createCase` (line 240) — part 2 only;
* `api/src/front-office/retainers/routes.ts` (the route pattern with `@PermissionKeys`) and `api/src/platform/identity/keys.ts`, `guard.ts` (`platformRoutes`, `assertEveryRouteDeclared`, `staffOf`);
* `ports/events.ts`, `ports/staff.ts`; the keys `agent/case:record-decision` and `agent/case:reopen` are already seeded (PF-3 migration `20261114015002_pf3_platform_tables`, lines 586-590).

## Part 1 (CS-C1a): schema, decision, withdrawal, close, reopen, events (expected ~550 lines)

* **Schema** (one migration, its stamp later than the newest on `main` when it merges; function names prefixed `case_`): `case_decision` in `cases.prisma` — firm, case, filing (empty for a whole-case withdrawal), kind `DECISION | WITHDRAWAL`, outcome (Sample list), decided on, note, recorded by and at; **insert-only** (a trigger refuses `UPDATE` and `DELETE`; a correction is a new row). `Case` gains `closed_at`, `closed_reason`, `close_outcome` (`WITHDRAWN | COMPLETED | CLOSED_BY_STAFF`), `withdrawn_at`, `withdraw_reason`, `closed_from_stage`; `status` moves `OPEN → CLOSED → OPEN` only.
* **Routes** (new `api/src/case-close.ts` service, `api/src/features/case-close.ts` controller, behind PF-4's guard like `retainers/routes.ts`): record a decision on a submitted filing (`agent/case:record-decision`; AG-7-33 rules 1-3, 5); withdraw before a decision (same key; BR-10); close with a reason (same key; AG-7-34 rule 2); reopen with a reason (`agent/case:reopen`; AG-7-13 rules 2, 3, 7) back to `closed_from_stage`. **If the case routes cannot sit behind PF-4's guard without touching files outside the touch list, stop and ask in a PR comment** (the case side today reads an `x-actor` header).
* **Auto-close (AG-7-34 rule 1) is not built** (it needs after-decision items, AG-7-49): staff close only (Lead ruling, reversible). Say so in the PR body.
* **Events** `case.closed`, `case.reopened`: names added to `ports/events.ts` (`EVENT.*`, never a string literal) with their payload types; written to `module_event` in the change's own transaction (firm id from `platform_firm` by `Case.firmKey` until CS-W1).
* **Named test cases** (P-606), listed as `CS-C1 DW1`-`DW8` in the PR body before code; file `tests/check_csc1_close.ts`, a pass and a fail each:
  * **DW1** a decision on a submitted filing → 201 and one `case_decision` row; on an unsubmitted filing → 409.
  * **DW2** a decision, withdrawal or close without `agent/case:record-decision` (READ_ONLY, BILLING_FINANCE) → 403 `NOT_ALLOWED`; with it (OWNER, ADMIN, CASE_MANAGER) → 2xx.
  * **DW3** withdraw after every filing has a decision → 409; before → the case closes with `WITHDRAWN`.
  * **DW4** close without a reason → 400; with one → `CLOSED`, `CLOSED_BY_STAFF`, `closed_from_stage` set.
  * **DW5** reopen without `agent/case:reopen` or without a reason → refused (403 / 400); with both → `OPEN` at `closed_from_stage`, and the audit keeps the old close values.
  * **DW6** `case.closed` and `case.reopened` written once each in the change's transaction; a forced rollback writes none.
  * **DW7** `UPDATE` or `DELETE` on `case_decision` refused by the database.
  * **DW8** firm A's token on firm B's case → 404 on all four routes; firm B's case unchanged. No token → 401 `NOT_SIGNED_IN`.
* **Journey CS-C1 W1** (scripted): open a case → submit a filing (C8.2 record) → record a decision → close → reopen → close again; the outbox holds `case.closed` twice and `case.reopened` once.
* **Touch (part 1):** `prisma/schema/cases.prisma` + one migration folder, new `api/src/case-close.ts`, new `api/src/features/case-close.ts`, the features list (one line), `ports/events.ts`, new `tests/check_csc1_close.ts`.

## Part 2 (CS-C1b): the active-case count and the limit check at opening (expected ~350 lines)

* **`CaseCountPort`** at `ports/case-count.port.ts` (`zod` only) with its fake at `ports/fakes/case-count.fake.ts`: `activeCounts()` → `{ individual, corporate }` for the session's firm; active = created, not withdrawn, and not every filing decided or withdrawn (SA-3-47; a reopened case counts again); grouped by `Combination.clientType` (SA-3-4). The real adapter and the fake both pass one contract file under `ports/contracts/` (PF-0c's guard requires it).
* **The limit check at opening:** `Runtime.createCase` (`runtime.ts:240`; a **one-line hook**, contract §7, the release Lead's OK given by this brief) takes `pg_advisory_xact_lock` on the firm and calls `EntitlementPort.check(firm, metric)` with the count read in that transaction, before the case number is taken. If PF-15 has not landed, create `EntitlementPort` at `ports/entitlement.port.ts` with PF-15's exact name and the allow-all fake (contract §6).
* **Named test cases:** `CS-C1 DW9`-`DW13`, file `tests/check_csc1_count.ts`:
  * **DW9** the active count drops when every filing is decided, and rises on reopen.
  * **DW10** a corporate combination's case counts as corporate, an individual one as individual.
  * **DW11** two openings in parallel at the limit (a test `EntitlementPort` with limit N) → one opens, the other 409 `PLAN_LIMIT_REACHED`; no case number is spent on the refused one.
  * **DW12** firm A's count never includes firm B's cases.
  * **DW13** the fake and the real adapter pass the same contract; the port-contract guard passes.
* **Touch (part 2):** new `ports/case-count.port.ts`, `ports/fakes/case-count.fake.ts`, `ports/contracts/case-count.contract.ts`, the real adapter beside `api/src/case-close.ts`, `ports/entitlement.port.ts` (only if PF-15 has not landed), `api/src/runtime.ts` (the hook, one line plus the import), new `tests/check_csc1_count.ts`.

---

**Must still be true:** every existing suite, the demo reset, C8.2's and C10.1's suites pass unchanged; opening a case with no limit configured behaves exactly as today. qa scores map row 77 only after both parts merge (P-606 (2)); say so in each PR body.

**Duplicate check (P-526):** BACKLOG, open PRs (`CS-C1`, `case_decision`, `case-close`, `CaseCountPort`, `EntitlementPort`), BUGS; one `Duplicate check:` line.

**Reviewer and breaker** (schema, permissions, plan limits; P-278). The breaker tries DW2, DW5, DW8 and DW11 through the API. The release holder reads the schema and permissions diff before the label (P-423).

**P-610 (founder, 15 Nov):** each part's PR stays under 800 changed lines, tests included. If part 1 would pass 800, move the events (DW6) and W1 into part 1b. Re-review reads only the new commits since the last Approve (P-277).

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently, never leave a part for later. One part, one PR; Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Never push to a PR that carries the `queued` label** (a push dequeues it and throws away the running merge batches; Lead 60, 15 Nov 19:3x IST). Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head of the PR plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0, never a priced button (P-175). No real keys. Push after every step (P-557). Cross-module port interfaces, fakes and shared event payload types live in `prototype/studio/ports/`; never import `engine/` from a port. Report to the current Lead (`tools/current-lead.sh`). Every token earns its outcome (P-556): read only the files named here and the code you change.
