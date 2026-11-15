# Brief: CS-W1, the case side's text firm key becomes the platform firm id (walls step 1, contract §8; map row 3; cases; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 01:3x IST by the case-side shaping lane from BACKLOG row CS-W1 (line 844), checked against `main` 81505985f and CS-C1a's head e59e0c030 (#1818, approved, not merged). **Draft until the release Lead approves it.** Model: Opus 5.5, effort: high (schema, a backfill on every case, the firm check every case read uses; breaker yes). **Ready when:** CS-C1a (#1818) and CS-K1 are on `main` and STATE names this lane the `cases.prisma` holder (P-438b). The row allows a swap with CS-K1; if CS-W1 goes first, CS-K1's `case_client.firm_id` then comes straight from `Case.firm_id`. One PR (about 550 lines expected); if it goes over 800, use the split under "What to build".

**Points the release Lead confirms in the approval (the code on `main` differs from the row's text):**
* **"The 13 call lines switch to the platform record" is narrowed to the lines that decide *which firm*.** The 13 lines (7 files: `assessments.ts:123`, `case-work.ts:87`, `main.ts:103`, `readiness.ts:73`, `review-rounds.ts:62`, `runtime.ts:147, 246, 356, 387, 509, 961, 988`, `team.ts:33`) read `samples/firms.json` (`api/src/firms.ts`). Most of them read **staff names, licences and the office phone that forms print** (`runtime.ts:509`, QA-289), not the firm's identity. Moving those to `platform_staff` / `platform_firm.business_address` is identity work (PF-4's area) and could change filled forms. Recommended: CS-W1 changes the **firm-identity comparisons only**: `Runtime.reach` (`:147`), the case list (`:988`), the activity feed (`main.ts:103`), `createCase` (`:246`), the next-number read (`:961`). They then compare `firm_id` uuids. The other lines keep reading `firms.json` by the same key, which P-559 (4) keeps.
* **`firm_key` stays** (P-559 (4); 11 case-side files and `runtime_next_case_number` read it). `firm_id` is added beside it and filled by a `BEFORE INSERT` trigger from the key, so the loaders, `routes-data.ts:58,68` (`caseStage.create`) and the checkpoint steps need no edit. Dropping `firm_key` is a later row, not this one.
* **A fourth unique rule.** The row says three are re-keyed. On `main` there are three on `Case` (`cases.prisma:65-67`: idempotency key, reference, case number) **plus** the counter's primary key `(workspace_id, firm_key, year)` (`:81`), which `runtime_next_case_number` (migration `20261112150000_a24_case_number`) writes with `ON CONFLICT`. All four move to `firm_id`. The function keeps its signature (`ws uuid, firm text, at`) and resolves the id inside, so `runtime.ts:295` is unchanged.
* **Order against the seed.** `start.sh` runs `migrate deploy` and seeds `platform_firm` only afterwards (`api/src/platform/identity/sample-seed.ts`). The backfill can therefore meet a case whose key has no platform firm. The migration then **refuses in plain words** ("run the Sample seed, then migrate again") and never invents a firm (`platform_firm` is Lead B's table). PF-3's `unmatchedCaseFirmKeys` (`seed-sample-firms.ts:86`) is the same test, reused.
* **Rows that wrote the firm "by key until CS-W1"** switch to `Case.firm_id`: CS-C1a's `case-close.ts:71` (`platformFirm.findUnique({ where: { key: c.firmKey } })`), and CS-K1's and CS-NT1's same lookup if they are merged by then. Each is a one-line change. List them in the PR.
* **The generic fill function for CS-W2 is born here**, so that CS-W2's per-file PRs can run in parallel and none of them owns a shared function: `case_firm_fill()` (`SECURITY INVOKER`; it fills `NEW.firm_id` from the row's parent when null and refuses a value that differs from the parent's). It is tested here on `case_stage` (parent: the case).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-W1` and take **one row, CS-W1**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `product/BACKLOG.md` row **CS-W1**, read with the points above. Sources (cite these): case-side contract v0.1 **§8** step 1 and conditions 1 and 3 (the firm id from `platform_firm` by key; triggers run with the caller's rights), **§0** fact 1 (three tables carry a text key; 13 lookup lines in 7 files), **§1** rule 5 (the demo reset never touches a real firm); decisions **P-575** (database walls between firms before the first real firm), **P-588 (4)** (the database fills the firm id, on four conditions), **P-559 (4)** (the Sample firms keep the keys `sample-firm` and `sample-solo`); **AG-1-1@ca84eb07** (every firm-owned record is scoped by `firm_id`), **AG-1-45@a4057ff0** (no read returns another firm's data).

**Read only these:** `prisma/schema/cases.prisma` (`Case` `:11-70`, `FirmCaseCounter` `:75-83`, `CaseStage` `:160-202`); migrations `20261112150000_a24_case_number` (the counter and `runtime_next_case_number`) and `20261109130000_c617_case_stages` (`runtime_case_stage_forward()` at `:123-134`, which refuses a changed `firm_key`: add `firm_id` to it); `prisma/schema/platform.prisma` `PlatformFirm`; `api/src/firms.ts`; `api/src/platform/seed-sample-firms.ts` `unmatchedCaseFirmKeys`; `api/src/runtime.ts` `reach` (`:139-149`), `createCase` (`:241-310`), `nextCaseNumber` (`:959-978`), `list` (`:980-1000`); `api/src/main.ts:103`; `api/src/case-close.ts` (`locked`); `tests/check_a24_case_number_api.ts` and `tests/check_c617_stages_migration.ts` (the harness to copy).

**What to build:**
* **Schema** in `cases.prisma`, with one migration folder. Its stamp is later than every migration before it and unique. Its functions are named `case_firm_*`.
  * `firm_id uuid NOT NULL` on `runtime_case`, `case_stage` and `firm_case_counter`, each with a foreign key to `platform_firm(id)` `ON DELETE RESTRICT` and an index `(firm_id, …)` shaped like today's `(workspace_id, …)` index.
  * In Prisma: `firmId String @default(dbgenerated("nullif(current_setting('app.firm_id', true), '')::uuid")) @db.Uuid`. This is P-588 (4)'s condition 1. `nullif` is needed because PostgreSQL leaves an empty string, not null, after a `SET LOCAL` ends, and `''::uuid` fails. The column is never a required field in Prisma.
  * `@@unique([firmId, id])` on `Case`: the parent key that CS-W2's composite foreign keys point at.
  * The four unique rules re-keyed from `firm_key` to `firm_id`.
* **Triggers:**
  * `case_firm_from_key()` on `runtime_case` and `firm_case_counter`, `BEFORE INSERT`: a null `firm_id` is filled from `platform_firm` by `firm_key`. A given `firm_id` must equal the key's firm, else the insert is refused in plain words.
  * `case_firm_fill()`, the generic one: on `case_stage` it fills from its case and refuses a mismatch.
  * `firm_id` joins `firm_key` in `runtime_case_stage_forward()`'s refused-update list (CREATE OR REPLACE, the body otherwise unchanged).
  * Every trigger is `SECURITY INVOKER`.
* **Backfill in the same migration:** `firm_id` comes from `platform_firm` by key for every row. A key with no firm makes the migration stop with words naming the key; then `SET NOT NULL`. `runtime_next_case_number` keeps its signature and resolves the id inside.
* **Code:**
  * `api/src/firms.ts` gains `firmIdOfActor(db, actor)` and `firmIdByKey(db, key)` (a small cache keyed by firm key, read from `platform_firm`, cleared by the demo reset).
  * The five firm-identity comparisons named above switch to `firm_id`.
  * `case-close.ts:71` and any merged CS-K1/CS-NT1 lookups by key read `c.firmId`.
  * Nothing else changes.
* **Split if over 800 lines:** part 1 the schema, the triggers and the backfill (DW1, DW2, DW4, DW6, DW7); part 2 the code switch (DW3, DW5).
* **Named test cases** (P-606), file `tests/check_csw1_firm_id.ts`, a pass and a fail each:
  * **CS-W1 DW1:** after the migration every case's, stage's and counter's `firm_id` equals the platform firm of its `firm_key`. This is checked on a copy holding cases of both Sample firms, measured right after this migration (rev 16.7). A forced case with an unknown key makes the migration stop with the words.
  * **CS-W1 DW2:** an insert with no `firm_id` gets the key's firm. An insert whose `firm_id` names the other Sample firm is refused. A `case_stage` row whose firm differs from its case's is refused.
  * **CS-W1 DW3:** staff of `sample-solo` (`user-S`) reading, listing, numbering or closing a `sample-firm` case get 404 "No such case." as today; `user-R` still reaches it. The client path is unchanged.
  * **CS-W1 DW4:** case numbers per firm stay gap-free after the re-key. Two openings at once in one firm get consecutive numbers, and the two firms' sequences are independent (`check_a24_case_number_api.ts`'s cases, re-run).
  * **CS-W1 DW5:** the demo reset deletes the demo workspace's cases of both Sample firms and nothing in another workspace. A case in a second workspace survives.
  * **CS-W1 DW6:** an `UPDATE` changing a stage's or a case's `firm_id` is refused.
  * **CS-W1 DW7:** `migrate diff` is empty, every new function is `case_firm_*`, and every trigger is `SECURITY INVOKER` (read from `pg_proc.prosecdef`).
* **Touch (nothing else):**
  * `prisma/schema/cases.prisma` + one migration folder (baton);
  * `api/src/firms.ts`;
  * `api/src/runtime.ts` (`reach`, `createCase`'s firm line, `nextCaseNumber`, `list`);
  * `api/src/main.ts` (line 103 only);
  * `api/src/case-close.ts` (line 71), and the same one line in CS-K1's `clients.ts` and CS-NT1's `case-notes/service.ts` if merged;
  * `api/src/MODULE.cases.md` (the invariant "a case's firm is `firm_id`; `firm_key` is kept for Sample data only");
  * new `tests/check_csw1_firm_id.ts`.

**Done when:** `tsx studio/tests/check_csw1_firm_id.ts` exits 0 with DW1-DW7 each passing and failing as named. These pass unchanged: `check_a24_case_number_api.ts`, `check_c617_stages_migration.ts`, `check_csc1_close.ts`, `check_csk1_client.ts` (if merged), `check_case_feed.ts`, `check_prisma_schema.ts`, `check_d1_reset_to_six.ts`, every case suite, the demo reset and the checkpoint load (C10.1). The module-card check passes and full `ci` is green on the head.

**Duplicate check:** searched BACKLOG (PF-3, PF-12, CS-K1, CS-T1, CS-S1: the last two wait on this row), open PRs (`firm_id` on `runtime_case`, `firmIdOfActor`), `git grep -n "firm_id\|firmId" prisma/schema/cases.prisma api/src/runtime.ts` on `main` (none) and BUGS. PF-3's `firmScope` filters PF/FO rows only; no case table has a firm id today.

**Parallel safety:**
* `cases.prisma` is a baton (P-438b). The measured order of its holders is **#1818 CS-C1a → CS-K1 → CS-W1 → CS-K2** (`case_client_merge`) **→ CS-W2's `cases` part**. CS-T1, CS-K3 and CS-NT1 add nothing to `cases.prisma` (CS-NT1 at most one back-relation line). CS-T1 and CS-S1 wait on this row.
* `runtime.ts`: CS-C1b and CS-K1 hold `createCase` first. This row changes one line there (the firm id) and three other functions. Do not start while either is in review without telling its builder.
* `main.ts`: one line.
* No `core.ts`, `ports/` or `events.ts` change.
* Two migrations at once take different stamps; re-stamp on top of `main` before the label (P-600's five steps).

**Contract gap (for the PR body):**
* §8 step 1 counts "11 files reading the key and 7 looking the firm up switch". This brief narrows that to the identity comparisons (first point above).
* The contract has no rule for the staff names and licence that `firms.json` still holds. They move with PF-4's identity work, under a row the release Lead names.

**Reviewer and breaker** (schema, a backfill on every case, the firm check on every case read; P-278). The breaker runs the migration on a copy with both firms' cases, a key with no firm, and openings in parallel. It tries DW3 through every route that reads a case. The release holder reads the migration before the label (P-600 (5)).

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One row, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`). Read only the files named here and the code you change (P-556).
---
