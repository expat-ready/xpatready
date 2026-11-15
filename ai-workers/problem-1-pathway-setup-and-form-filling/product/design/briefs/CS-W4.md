# Brief: CS-W4, the case-side walls switched on and proven, the release gate (walls step 7, contract §8; MVP checklist launch condition C2; map row 3; case side; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 02:0x IST by the case-side shaping lane from BACKLOG row CS-W4 (line 847), checked against `main` 81505985f and PF-12's brief (branch `lead-b-front-office`, `design/lead-b-briefs/PF-12.md`). **Draft until the release Lead approves it.** Model: Opus 5.5, effort: high (permissions on every firm table, the release gate; breaker yes). **Ready when:** PF-12 is on `main`, every CS-W2 part is merged (every case-side table has a non-null `firm_id`), and every CS-W3 part is merged (the census allow-list is empty). **Two parts, two PRs** (P-610).

**Points the release Lead confirms in the approval (PF-12's brief and the code correct the row's text):**
* **The role split is PF-12's, for the whole database.** PF-12's brief makes the app connect as a role that owns no table, is not a superuser and has no `BYPASSRLS`. Migrations run as the owner role. The demo, CI and every test database use the same split. On `main`, 473 test files name `xr_studio` in their database address, and PF-12 moves them. **This row therefore does not change `start.sh`, the CI workflow or the test set-up again.** It proves that the case-side suites run under that role, and it touches those files only if PF-12 left a case-side suite on the owner role (named in the PR).
* **The write wall on the platform-wide tables is its own part, and larger than the row says.** Contract §1 rule 1 has the app role get `SELECT` only on platform-wide tables, with writes going through a configuration role. On `main`, 93 files under `api/src` write only platform-wide configuration tables (the Studio, proposals, library, forms, sources), all through the one `Db` provider in `core.ts`. `Workspace` (platform-wide, the demo boundary) is created by the app itself (`core.ts`, `Workspace.create`). **Question for the tech lead:** which way do configuration writes reach the configuration role?
  * (a) A second provider `ConfigDb` connecting as the configuration role, used by the configuration services. Real separation; it touches each configuration service's injection.
  * (b) `SET LOCAL ROLE` to the configuration role in PF-12's wrapper when the request is a configuration write by a configuration person. One place, but the app role must be a member of the configuration role, so it guards against mistakes, not against a taken-over app.

  Recommended: (a) for the first real firm (P-575 (3)), sized in part 2's PR after part 1 merges; `Workspace` creation goes through it too.
* **The gate cannot use name prefixes.** PF-12's missing-policy check works by prefix (`platform_*`, `fo_*`, `money_*`, `msg_*`, `auto_*`, `plat_complaint*`). Case-side tables have none (`runtime_case`, `party`, `filing`, …). So the case-side twin reads the **case-side area files** (`cases`, `answers`, `filings`, `review`, `submission`, `evidence`, `links`, `extension`, `case-notes`, and `case-search` / `case-corporate` when they exist). It requires each model to be either firm-owned with a forced policy, or on a named list: the two exceptions (P-588 (5)) plus the platform-wide `Route` and `Workspace`. **It also fails when a new schema file appears that is in neither PF-12's prefixes nor this file list**, so no file is left unclassified.
* **`AuditEvent` is mixed** (contract §2.7) and AUD-1a moves it to `audit.prisma`. Its policy (a firm's lines plus null-firm configuration lines readable by the configurator) belongs to the audit rows, not here. It is listed in the gate as "audit's, policy by AUD-1".
* **The MVP checklist's C2 says "Not started (no row)".** The rows are CS-W1 to CS-W4: a records line for the release Lead (`MVP-CHECKLIST.md:209`), not this builder's.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-W4 <part>` (parts: `1-policies-gate`, `2-write-wall`) and take **one part of row CS-W4**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `product/BACKLOG.md` row **CS-W4**, read with the points above. Sources (cite these): case-side contract v0.1 **§8** step 7 and condition 4 (forced row-level policies on the firm tables; the write wall; the app role that owns no tables; the release-gate test with exactly two named exceptions), **§1** rule 1 (three kinds of table; platform-wide tables are read-only to firms, written by configuration staff), **§2.7** (the exceptions `ExtensionCodeTry`, `PersonLinkTry`); decisions **P-575** (walls before the first real firm), **P-588 (1)** (the write wall), **P-588 (4)**, **P-588 (5)**; **AG-1-45@a4057ff0** (no endpoint returns another firm's data), **AG-1-3@95ab42da** (every change is scoped to the caller's firm). PF-12's brief is the pattern: the policy text, the roles, the start-up owner check and its test shape.

**Read only these:** PF-12's migration folder, `api/src/platform/firm-scope.ts` and `tests/check_pf12_walls.ts`; `tests/check_csw3_firm_scope.ts` (the census and its scratch walls script under `tests/fixtures/csw3/`, which this row turns into the real migration); the case-side area files in `prisma/schema/` (models and `firm_id` only); for part 2 also `api/src/core.ts` (`Db`, `Workspace`) and the list of configuration services that the census marked "configuration".

**What to build:**
* **Part 1, policies and the gate** (~450 lines; one migration folder, policies only, no table change):
  * `ENABLE` and `FORCE ROW LEVEL SECURITY` on every firm-owned case-side table, measured on `main` when you start (52 after CS-W2, plus `case_decision`, `case_client`, `case_client_merge`, `case_note` and any later one).
  * One policy per table: `USING (firm_id = nullif(current_setting('app.firm_id', true), '')::uuid)` with the same `WITH CHECK`. Name it as PF-12 names its policies.
  * `PersonLinkTry` and `ExtensionCodeTry` get none and are listed.
  * The PR body lists every table and its policy as a table.
  * New `tests/check_csw4_walls.ts`, PF-12's twin. It imports PF-12's helpers rather than copying them, and the PF-12 gate stays the one CI job (this test is added to the same shard).
  * From now on every new case-side table ships its policy in its own migration. Add that line to `DEVELOPING.md` "Database schema: one file per area".
* **Part 2, the write wall on the platform-wide tables** (sized after part 1, under 800 lines or split by configuration area):
  * the configuration role (owner of nothing, `SELECT`/`INSERT`/`UPDATE`/`DELETE` on platform-wide tables only);
  * `REVOKE INSERT, UPDATE, DELETE` on those tables from the app role;
  * configuration writes through the way the question above settles;
  * the demo reset and the Sample loaders, which write configuration, through the same way;
  * every use of the configuration role audited, as PF-12's bypass role is.
* **Named test cases**, file `tests/check_csw4_walls.ts`, a pass and a fail each:
  * **CS-W4 DW1** (part 1): under the app role, a raw query with no `app.firm_id` returns nothing on every case-side firm table (a loop over the measured list). With the firm set, it returns that firm's rows.
  * **CS-W4 DW2** (part 1): firm A's session reading firm B's row by id through SQL returns nothing, for one table of each area file. An `INSERT` naming firm B under firm A's session is refused by `WITH CHECK`.
  * **CS-W4 DW3** (part 1): the app role owns no case-side table, has no `BYPASSRLS` and is not a superuser (`pg_class.relowner`, `pg_roles`). The start-up check refuses to start when it does (PF-12's check, extended to the case side's tables).
  * **CS-W4 DW4** (part 1): a new case-side table with `firm_id` and no policy fails the gate, and so does a new schema file in no list (both forced in a scratch copy). The two named exceptions pass and a third unnamed one fails.
  * **CS-W4 DW5** (part 1): every case-side suite passes under the walls, including the census, the CS-W2 part tests, the demo reset and the checkpoint load (C10.1).
  * **CS-W4 DW6** (part 2): under the app role an `INSERT`/`UPDATE`/`DELETE` on a platform-wide table (`combination`, `form_edition`, `route`) is refused, and a configuration person's publish through the configuration way succeeds and is audited. A case-side route cannot reach the configuration way (a forced call fails).
  * **CS-W4 W1** (part 2): the configurator's author → reviewer → approver publish, then a firm's officer opening a case on the published release, all under the split roles.
* **Touch (nothing else):**
  * part 1: one migration folder (policies only), new `tests/check_csw4_walls.ts`, `DEVELOPING.md` (one line), and `start.sh` / the CI workflow / a test set-up file only if a case-side suite still used the owner role (named in the PR);
  * part 2: one migration folder (the role and grants), the configuration way (`api/src/core.ts` and the configuration services' injection, or PF-12's wrapper with Lead B's OK), `start.sh` and the CI workflow (the configuration role's address), and the test.

**Done when:** for the part, `tsx studio/tests/check_csw4_walls.ts` exits 0 with its DW cases (and W1 for part 2) each passing and failing as named. `check_pf12_walls.ts`, `check_csw3_firm_scope.ts` (allow-list empty), every case and configurator suite, the demo reset and the checkpoint load (C10.1) pass unchanged under the split roles. Full `ci` is green on the head. After part 2, the MVP checklist's C2 can be marked by the release Lead.

**Duplicate check:** searched BACKLOG (PF-12, which does PF/FO tables and the roles; AUD-1a/AUD-1c, the audit table's own rules; CS-W1 to CS-W3), open PRs (`ROW LEVEL SECURITY`, `FORCE`, `CREATE POLICY`, `xr_config`), `git grep -n -i "row level security\|create policy"` in `prisma/migrations` on `main` (none before PF-12) and BUGS. No case-side table has a policy.

**Parallel safety:**
* Part 1 is the last walls step and touches no area file, only a new migration folder (policies), so it runs beside schema rows on other files. **But any case-side table added after its stamp must ship its policy**, and the gate fails it otherwise. Tell CS-S1, CS-98a and any later case-side schema row in STATE.
* Re-stamp on top of `main` before the label (P-600's five steps).
* Part 2 touches `core.ts` (also AUD-1m's `Audit.log`) and the configuration services, which belong to the configurator and forms lanes. Start it only when those files have no open PR, and take their OK in the PR.
* `start.sh` and the CI workflow are shared with PF-12; one line each.

**Contract gap (for the PR body):**
* Contract §1 rule 1's configuration role has no named mechanism (the question above).
* PF-12's prefix-based gate does not see case-side tables; the case side's twin closes the gap by file list.
* `AuditEvent`'s mixed policy is unowned until AUD-1.

**Reviewer and breaker** (permissions, schema; P-278), both parts. The breaker tries every case-side table with no firm, an empty firm and a wrong firm, a raw `SET ROLE` or `set_config` from a route, `session_replication_role`, a new table without a policy, and a configuration write from a case route. The release holder reads both migrations before the label (P-600 (5)).

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One part, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`); Lead B for PF-12's files. Read only the files named here and the code you change (P-556).
---
