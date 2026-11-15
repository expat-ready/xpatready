# Brief: CS-W3, every case-side database call runs with the firm set (walls steps 5, 5b, 6, contract §8; map row 4; case side; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 01:5x IST by the case-side shaping lane from BACKLOG row CS-W3 (line 846), checked against `main` 81505985f. **Draft until the release Lead approves it.** Model: Opus 5.5, effort: high (permissions on every case read and write; breaker yes). **Ready when:**
* part 0 (the spike): now;
* part 1: **PF-12 is on `main`** (its wrapper in `api/src/platform/firm-scope.ts` and the app role that owns no table) and CS-W1 is merged;
* parts 2-4: after part 1, each when its files have no open PR (plan below).

**Seven parts**, each under 800 lines (P-610).

**Points the release Lead confirms in the approval (the code on `main` differs from the row's text):**
* **PF-12's wrapper does not exist yet.** `api/src/platform/firm-scope.ts` on `main` holds only `firmScope` / `inFirm` / `notInFirm` (where-clause helpers, PF-3). `git grep -i "app.firm_id"` finds nothing. PF-12's brief (branch `lead-b-front-office`, `lead-b-briefs/PF-12.md`) says only "every request's transaction opens with `SET LOCAL app.firm_id`". It names no export. This row imports whatever PF-12 exports and never writes a second copy, so **the shape is a contract gap for Lead B** (below). The size of this row depends on it:
  * If PF-12 sets the firm **inside every interactive `$transaction` and around single operations centrally**, the case side's 162 `$transaction` in 62 files (measured) need no edit.
  * If it covers only single operations, each of the 100 case-side `$transaction` sites gets a one-line change.
* **One request context, not a new one.** `main` already has two: PF-23's `requestScope` (`api/src/platform/observability/log.ts:28`, whose `firmId()` reads PF-4's `req.platform.firmId`, `hook.ts:37`) and PF-14's `currentJobFirm()` (`api/src/platform/jobs/pgboss-jobs.ts:57`). AUD-1b reuses them. This row puts the case side's firm into the same context (one middleware), never a new `AsyncLocalStorage`. **Question for the tech lead:** confirm with Lead B that PF-12's wrapper reads `requestScope` and `currentJobFirm`, and that the case side may mark its firm there through one line in `hook.ts`'s `firmOf` (Lead B's file).
* **Step 5c (the audit context and the 25 direct audit writes) is AUD-1m's row, not this one** (BACKLOG line 882 lists the same 20 files; it waits on AUD-1b). This row only makes sure the firm is in the context AUD-1b reads. **Measured:** 26 direct `auditEvent.create` lines in 20 case-side files, and 219 `audit.log(` lines in 63 files.
* **Extension sessions:** no extension-session code exists on `main`. Contract §8 step 5b points at `api/src/core.ts:88-98`, which is `ConfigReadGuard`; only `demo.ts:564` deletes the tables. The extension lane's own rows set the firm from the paired staff member when they write that code. This row adds a test that fails if a route reaches `extension_*` with no firm.
* **Three places must find the firm before they can read anything, because the walls hide every row while no firm is set** (PF-12 forces row-level security on `platform_firm` too):
  * staff by `x-actor`: the actor's key comes from `samples/firms.json`, but its id is a `platform_firm` row (CS-W1's `firmIdOfActor`);
  * the link session guard: `person-link.ts:356` looks the session up by token hash, across firms;
  * the simulated client: `user-P` and `user-Q` have no firm in `samples/firms.json`; `Runtime.reach` matches them by `clientActorId`.

  Recommended: **one narrow `SECURITY DEFINER` function per door**, each returning only a firm id: CS-W1's `case_firm_id_of_key(key)` (reused, not copied), and this row's `case_firm_of_link_session(token_hash)` and `case_firm_of_case(case_id)`. The scoped read then decides 404 as today.
  * **`FORCE` binds the table owner too.** Only superusers and `BYPASSRLS` roles skip it, so a function owned by the migration role would see nothing once CS-W4's policies are on. The functions are therefore owned by CS-W1's dedicated `NOLOGIN` role `xr_case_lookup`, which owns no table. It has `SELECT` on `platform_firm`, `person_link_session` and `runtime_case` only, plus one policy per table, `FOR SELECT TO xr_case_lookup USING (true)`. This row adds those two policies (on `person_link_session` and `runtime_case`); CS-W4's gate lists them as the only non-firm policies.
  * Every function has `SET search_path = pg_catalog, public`, with `EXECUTE` revoked from `PUBLIC` and granted to the app role only. Prefer this over a `BYPASSRLS` role, which would read every table.
  * **Question for the tech lead:** this differs from §8 condition 3, which is about triggers; confirm, or name another way. The breaker tests all three functions.
* **`Db` is a subclass, and a wrapped client is not.** `class Db extends PrismaClient` (`core.ts:30-35`) is injected by class in 85 files (`@Inject(Db)`), and `new Db()` is called in 7 places in `tools/` and in 6 test files. Prisma's `$extends` returns a new client object, not a `Db`, so "one line in `core.ts`" is not honest. Part 1 instead:
  * registers the `Db` token with a factory that returns PF-12's wrapped client, typed as `Db` through one exported type;
  * changes `new Db()` in the 7 tools calls to a `firmDbFor(firmId)` helper;
  * leaves the 6 test files on the raw client, with the census watching them.

  Expected: about 40 lines in `core.ts` and the tools, plus a check that nothing does `instanceof Db` (none on `main`). If PF-12's export is not a `$extends` client, the spike re-sizes this.

* **Measured on `main`** (files under `api/src` outside `platform/` and `front-office/`):
  * 140 files open the database;
  * 47 of them reach a firm-owned case table, with 100 `$transaction` and 81 raw SQL lines between them (the contract's "51 raw SQL places" is from `f1d0d403e` and counted differently);
  * 93 reach only platform-wide configuration tables, which need no firm (they belong to CS-W4's write wall);
  * plus the checkpoint steps (28 files at the top of `features/checkpoint/`, 48 with sub-folders) and 7 `new Db()` calls in 6 `tools/*.ts` scripts.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-W3 <part>` (parts: `0-spike`, `1-context`, `2-cases`, `2-forms`, `2-review`, `2-evidence-links`, `3-background-loaders`) and take **one part of row CS-W3**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `product/BACKLOG.md` row **CS-W3**, read with the points above. Sources (cite these): case-side contract v0.1 **§8** step 5 (the firm-scope helper, `SET LOCAL app.firm_id` per transaction, as PF-12 does), 5b (link sessions from the link's case, background runs from their case or job), 6 (loaders and Sample data run as the Sample firm; the reset cannot touch another firm), the spike paragraph (a scratch copy, `FORCE ROW LEVEL SECURITY` on four tables, a role that owns no table; count failures by cause), **§1** rule 5; **§2.5** (one request context, `AsyncLocalStorage`); decisions **P-588 (4)** (the walls test runs under an app role that owns no tables), **P-575**; **AG-1-45@a4057ff0** (no read returns another firm's data), **AG-1-3@95ab42da** (AG-1's own changes are scoped to the caller's `firm_id` and audited: the same rule this row applies to the case side).

**Read only these:** `api/src/platform/firm-scope.ts` (PF-12's version), PF-12's migration folder and `tests/check_pf12_walls.ts`; `api/src/platform/observability/log.ts` (`requestScope`) and `hook.ts`; `api/src/platform/jobs/pgboss-jobs.ts:50-60` (`currentJobFirm`); `api/src/core.ts` `Db` (`:30-35`); `api/src/firms.ts` (CS-W1's `firmIdOfActor`); the files of your part.

**What to build, per part:**
* **Part 0, the spike** (contract §8's paragraph, about a day; a records PR, no product code). On a scratch copy of the demo data:
  * add `firm_id` to `runtime_case`, `case_stage`, `filing` and `party`, with `ENABLE` + `FORCE ROW LEVEL SECURITY`;
  * add a second role that owns no table;
  * add `set_config('app.firm_id', …, true)` at the start of each transaction, by hand;
  * run the case-side suites, one link session, one client session and one in-process background run (`finder.ts`).

  The report `product/design/case-side-walls-spike-2026-11-<dd>.md` lists the failures **by cause**, says whether PF-12's wrapper shape covers interactive transactions, and re-sizes parts 2-3. The scratch script goes under `tests/fixtures/csw3/` so that parts 1-3 reuse it. This part is also what CS-W2 waits on.
* **Part 1, the context** (~400 lines):
  * new `api/src/case-firm-context.ts`, a Nest middleware for `/api/runtime/*`, `/api/link/*` and `/api/demo/*`. Staff by `x-actor`: the firm id from CS-W1's `firmIdOfActor` (through `case_firm_id_of_key`). A link session: `case_firm_of_link_session`. A simulated client: `case_firm_of_case` for the case in the path; the client's case list uses the firms of their own cases (Sample: one). The id is put into the shared request context (the question above).
  * `Db` in `core.ts` provided through a factory returning PF-12's wrapped client, and `firmDbFor(firmId)` for the 7 `tools/` calls (point above).
  * `main.ts`: the middleware's one registration line.
  * one migration folder: the two `SECURITY DEFINER` functions (prefixed `case_firm_`, owned by `xr_case_lookup`, `search_path` set), their grants and their two `TO xr_case_lookup` policies.
  * new `tests/check_csw3_firm_scope.ts`, the **census**. On the scratch copy with the walls on (part 0's script, applied to every case-side table that has `firm_id`), it runs each area's journey under the app role and lists the case-side files that still run a query with no firm. Those files are on an allow-list that **only shrinks**; a file not on the list that runs unscoped fails the check.
* **Part 2, the fix-ups by area**, each taking its files off the census list. A fix-up is a one-line call of PF-12's export at the start of an interactive transaction, or a raw query moved inside one. Never a reformat.
  * **`2-cases`:** `runtime.ts` (10 `$transaction`, 10 raw), `team.ts`, `case-stages.ts`, `case-work.ts`, `routes-data.ts`, `stage-scope.ts`, `case-changes.ts`, `employer-link.ts`, `earlier-facts.ts`, `assessments.ts` (about 21 / 22).
  * **`2-forms`:** `fill-case.ts`, `fill.ts`, `forms.ts`, `form-additions.ts`, `filing-changes.ts`, `case-filings.ts`, `must-verify.ts`, `rule-facts.ts` (about 16 / 13).
  * **`2-review`:** `review-rounds.ts`, `review-runs.ts`, `review-stamp.ts`, `readiness.ts`, `findings.ts`, `sign-steps.ts`, `submission.ts`, `submission-record.ts`, `filing-record.ts`, `release-update.ts` (about 20 / 14).
  * **`2-evidence-links`:** `case-documents.ts`, `case-checklist.ts`, `document-review-counts.ts`, `case-prepare.ts` (a baton file, P-438b), `person-link.ts` (about 14 / 16).
* **Part 3, background and loaders** (step 5b and step 6):
  * in-process runs set the firm of the case or job they work for: `ai.ts`, `finder.ts`, `sample-case.ts`, `finished-story.ts`, `health-verdict.ts`; `sources.ts`, `canada.ts`, `draft-qd.ts` and `edition-published.ts` if the census shows they reach a case table, else they are listed as configuration;
  * the demo reset (`demo.ts`, `demo-reset-to-six.ts`, `demo-sample-case.ts`, `demo-finished-story.ts`) and the checkpoint runner (Demo's `loadConfigured` in `demo.ts`, one wrapper there, not in the step files) run as the Sample firm;
  * `tools/*.ts` that call `new Db()` take the firm from an argument, defaulting to the Sample firm.
* **Named test cases**, all in `tests/check_csw3_firm_scope.ts` (each part adds its own), a pass and a fail each:
  * **CS-W3 DW1** (part 1): with the walls on the scratch copy, a staff request of `sample-firm` reads its case and gets 404 for a `sample-solo` case. A request with no firm reads nothing and is refused loudly (a 500 named "no firm set" in the log), never an empty 200.
  * **CS-W3 DW2** (part 1): a link session works for its own case only; a token of firm A never reaches firm B's rows. `case_firm_of_link_session` returns nothing for an unknown hash and only a firm id for a known one, also with `FORCE ROW LEVEL SECURITY` on `person_link_session` and no firm set. The app role cannot `SELECT` the table through the function's policy, and `pg_proc.proconfig` shows the `search_path` of all three functions.
  * **CS-W3 DW3** (part 1): the simulated client reaches their own case; `case_firm_of_case` for another person's case still ends in 404.
  * **CS-W3 DW4** (part 1): 100 interleaved requests of the two firms never swap firms. Each request's queries carry its own firm (the `pg_stat_activity` / `current_setting` read inside each transaction).
  * **CS-W3 DW5** (each part 2): the area's journey passes with the walls on, and the census allow-list loses the part's files. A deliberately unscoped query added in a test file of the area fails the census.
  * **CS-W3 DW6** (part 3): `finder.ts`'s background run and an AI-assist run set their case's firm; a run with no case refuses to start.
  * **CS-W3 DW7** (part 3): the demo reset, run as the Sample firm with the walls on, deletes the Sample firm's rows and none of a second firm's (a fixture firm in another workspace, and one in the same workspace). The checkpoint load (C10.1) passes with the walls on.
  * **CS-W3 W1** (journey, part 3): open a case, add a person, answer, open a link and answer as the client, run readiness and close the case, all with the walls on the scratch copy, two firms side by side.
* **Touch (nothing else):**
  * part 0: the report, `tests/fixtures/csw3/*`;
  * part 1: new `api/src/case-firm-context.ts`, `api/src/core.ts` (the `Db` provider), the 6 `tools/*.ts` files that call `new Db()`, `api/src/main.ts` (one line), one migration folder (functions only), `api/src/platform/observability/hook.ts` (one line, Lead B's OK), new `tests/check_csw3_firm_scope.ts`, `api/src/MODULE.cases.md`;
  * parts 2-3: the part's listed files and the census allow-list.

**Done when:** for the part, `tsx studio/tests/check_csw3_firm_scope.ts` exits 0 with its DW cases each passing and failing as named. After part 3 the census allow-list is empty and W1 passes. Every case suite, `check_pf12_walls.ts`, `check_csw1_firm_id.ts`, the CS-W2 part tests, the demo reset, the checkpoint load (C10.1) and `check_d1_reset_to_six.ts` pass unchanged. Full `ci` is green on the head.

**Duplicate check:** searched BACKLOG (PF-12, AUD-1b, AUD-1m, PF-14's job context, PF-23's request context, CS-W2, CS-W4, the extension lane's rows), open PRs (`app.firm_id`, `set_config`, `firmScope`), `git grep -n -i "app.firm_id\|set_config\|AsyncLocalStorage" api/src` on `main` (only PF-23's and PF-14's contexts) and BUGS. Nothing sets a firm on a case-side query today.

**Parallel safety (keeping live lanes unblocked):**
* **Census, not a big bang.** Part 1 changes no area file. Parts 2-3 land in any order, because the allow-list shrinks one part at a time, and none of them waits for another.
* **Start a part only when no open PR touches its files.** Check with `gh api repos/{owner}/{repo}/pulls` and each PR's files. The busy ones today:
  * `runtime.ts`: CS-C1b, CS-K1, CS-NT1, CS-W1 and CS-V1 PR 3;
  * `review-rounds.ts`, `readiness.ts`, `form-additions.ts`: CS-V1 PR 2; `review-rounds.ts` and `readiness.ts` also AUD-1m;
  * `person-link.ts`: CS-V1 PR 3, AUD-1m;
  * `case-prepare.ts`: the P-438b baton, CS-V1 PR 3, AUD-1m;
  * `sign-steps.ts`, `submission.ts`, `fill-case.ts`: CS-D1b;
  * `case-documents.ts`, `case-checklist.ts`: CS-D1, CS-D6, CS-D7;
  * `team.ts`: CS-T1;
  * `core.ts`: AUD-1m (`Audit.log`).
* **Order for the busy files:** take `2-cases` after CS-K1 and CS-NT1 part 1 merge. Take `2-review` and `2-evidence-links` after CS-V1 PR 2 and before CS-V1 PR 3, or after it.
* **Every edit is a one-line insertion at the top of a transaction callback**, so a conflict with a live lane is a one-line merge. Never reorder or reformat.
* **New routes behind PF-4's guard** (`features/case-close.ts`, CS-K1's clients, CS-NT1's notes, CS-T1's queue) already get the firm from PF-12's hook and are covered without an edit. A new `x-actor` route is covered by part 1's middleware.
* Tell the rows that add routes in STATE.

**Contract gap (for the PR body):**
* **For Lead B, PF-12:** the wrapper's exported names and whether it sets the firm inside interactive transactions (proposal: `firmDb(db)`, a Prisma client extension that starts every `$transaction` with `set_config('app.firm_id', <id>, true)` and wraps single operations, plus `withFirm(firmId, fn)` for runs outside a request). Also: the policy's `current_setting('app.firm_id', true)::uuid` fails on the empty string PostgreSQL leaves after a `SET LOCAL`; use `nullif(…, '')`.
* Contract §8 step 5b's extension-session line names code that is not on `main`.
* §8's walls have no door for a session that must find its firm before reading (link, client). The two narrow functions above are proposed.

**Reviewer and breaker** (permissions on every case path; P-278), per part. The breaker tries to read another firm's rows with no firm set, an empty firm, a forged `x-actor`, a reused link token, two firms' requests interleaved, and a background run with no case. The release holder reads part 1's migration before the label.

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One part, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`); Lead B for PF-12's wrapper. Read only the files named here and the code you change (P-556).
---
