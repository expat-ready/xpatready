# Brief: PF-6r, the roles read (what each role gives, by class) for PF-6 part 2 (R1.6) (cloud builder lane; row owner Lead B)

Written 16 Nov 10:1x IST by Lead B (6), rev 16.54. PF-6 part 2's role picker and Compare roles must show money permissions and licence actions apart (R1.6, "money and licence apart"), from the catalogue, never from text typed in the browser (STANDARDS §7). No route on `main` answers "which keys does each role give, with their class". **Model: Opus 5.5, effort: high**: permissions. **Starts when:** now. It runs beside PF-6m and FO-2v, which share no file with it.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-6r` and take **one row, PF-6r**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** on `main`: `api/src/platform/staff-read/routes.ts` and `service.ts` (the pattern), `api/src/platform/identity/keys.ts` (the key catalogue, its `scope` and `class`, `moneyKeysOfRoles`), the `platform_role_permission` and `platform_permission_key` tables (PF-6b), and BACKLOG PF-6b.

**What to build:** `GET /api/platform/roles`, declared `@PermissionKeys("agent/staff:manage")` (the people who invite and change roles).
* It answers the six starter roles in a fixed order: Owner, Admin, Case Manager, Case Officer, Billing and finance, Read-only.
* Each role has its key list, each key with `{ key, class: GENERAL | MONEY | LICENCE, scope: OWN | ALL | NONE }`, read from the firm's `platform_role_permission` rows joined to the catalogue.
* Each role also has its `moneyKeys` and `licenceKeys` counts.
* It gives no labels: the screen's plain words come from SA-06 Appendix C, per the concept.

**Done when** (P-606), in `tests/check_pf6r_roles_read.ts`, a pass and a fail each:
* `PF-6r DW1`: Billing and finance answers its money keys with `class: MONEY`, and the counts match `moneyKeysOfRoles`. Read-only answers 0 money keys.
* `PF-6r DW2`: OWNER and ADMIN get 200. CASE_OFFICER and READ_ONLY get 403. No token gets 401. Firm B's rows never appear in firm A's answer.
* `PF-6r DW3`: `assertEveryRouteDeclared` passes, and PF-4b's and PF-6b's suites pass unchanged.

**Touch list:** `api/src/platform/staff-read/routes.ts` (one route), `staff-read/service.ts` (one method), `tests/check_pf6r_roles_read.ts`.

**Duplicate check (P-526):** BACKLOG, open PRs (`staff-read`, `roles`), BUGS; one `Duplicate check:` line.

**Reviewer** (P-303). The release holder reads the permissions diff (P-423). **P-610:** about 150 lines.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
