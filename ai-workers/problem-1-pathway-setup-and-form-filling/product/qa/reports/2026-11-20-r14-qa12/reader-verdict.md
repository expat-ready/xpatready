# R1.4 reader verdict (fresh reader, ran nothing, P-303), main 90535a94e, 20 Nov

Read: `api/src/platform/firm-scope.ts`, `tests/check_pf12b_bypass_audit.ts`, `tests/check_pf12_walls.ts`, `tests/qa/check_r14_walls_gate_a.ts`, the two `*pf15*` migrations, BUGS.md QA-499/QA-500, CAPABILITIES.md R1.4, and this folder's evidence. Paths below are under `prototype/studio/`.

## Evidence accepted
- ci 44759585301 (app tree = main 90535a94e): 8 suites green, pf12b 56/0, pf12_walls 100/0. Local runs a/b match it, suite for suite.
- Gate A 17/17 twice (gate-a-3.log, gate-a-4.log). **The exception-list fix is legitimate.** `platform_plan_limit` (migrations/20261118213000_pf15_plan_limits/migration.sql:16-23) and `platform_limit_change` (…/20261119051500_pf15_limit_changes/migration.sql:27-41) have no firm_id. App writes to them are revoked (:56; :124-125). PF-12's own pack already exempts them as LATER_CATALOGUES (tests/check_pf12_walls.ts:35-36). Their firm-bearing siblings, `platform_storage_over` (:59-61) and `platform_limit_change_firm` (:143-145), are forced and carry the policy. gate-a-1/2 failed only on those two catalogues. Nit: the gate's forced-check exemption depends on array order (`EXCEPT.slice(0, 7)`, check_r14_walls_gate_a.ts:99).

## (a) Done-when, clause by clause
1. **The firm comes from the signed-in person only: MET.** PF-4's guard sets it through `setRequestFirm` (firm-scope.ts:273-278). A host-routed firm set at entry (:267-270) is replaced by the session's firm. Gate A shows that a header, query or body naming firm B never reaches B (check_r14_walls_gate_a.ts:74-81) and that /me answers each person's own firm (:92-93).
2. **A query with no firm returns nothing: MET.** The pool sets an empty `app.firm_id` when no firm is in scope (firm-scope.ts:306-310). Proven in check_pf12_walls.ts:182, :202 and :243-246, and in gate A at :66-71 (fo_lead 0 of 2 rows, platform_staff 0 of 4).
3a. **The bypass only through a named list: MET. "Only by named platform jobs": NOT MET as worded.** `asBypass` refuses any use not on the list or not on that use's routes (firm-scope.ts:163-168; check_pf12_walls.ts:268-269). But 12 of the 21 entries in BYPASS_USES (:105-125) are request routes, not platform jobs. See QA-500.
3b. **"Every use writes an audit line": NOT MET.** `asBypass` itself writes only the server-log line (:178, :148-150). An audit line is written only where a use calls `touchFirm` (:208-224). Eleven entries are `audit: "none: …"`:
   - the seven own-firm doors (:106-112);
   - `job:platform.signup.purge` (:116), `job:messages.send` (:120), `platform.account.mail` (:121) and `job:platform.secret_box.reencrypt` (:122).

   The suite asserts that these write no line (check_pf12b_bypass_audit.ts:77-78, :253, :262-263). gate-a-4-bypass-uses.txt: 29 bypass uses in the server log, 27 of them own-firm doors (authenticate 11, host 14, sign-in 2), and 0 audit_event lines (gate-a-4.log NOTE).

## (b) Does "every use writes an audit line" hold?
**No.**
- **QA-499's Expected has two parts.** Part 1: every cross-firm use writes a `platform.bypass` row in the same transaction. Part 2: the doors move off the bypass to narrow lookups, so they stop being bypass uses.
  - Part 1 is met on main by PF-12b part 1. The 8 per-firm uses are each run, and each writes one line per firm it touches (DW1, DW4, DW7: check_pf12b_bypass_audit.ts:108-118, :166, :182, :235, :256; the catch-up at :338-340). A failed write refuses the use and rolls its work back (DW2: :205-213).
  - Part 2 is not done. All seven doors are still bypass uses (`asBypass`, BYPASS_ROLE, firm-scope.ts:306) with no row. PF-12b part 2 has no backlog row and no PR.
- **Lead 70's ruling** says "a bypass use must write an audit_event row", with no log-only option and the Done-when unchanged. Read as written, the four no-firm "none" entries fail too:
  - The purge, the PLATFORM_ACCOUNT send and mail, and the re-encrypt entry each switch to the BYPASSRLS role (firm-scope.ts:306) and write no row.
  - "Touches no firm's rows" is a code comment, not something the wall enforces: while a use is on the bypass, every walled table is readable (:159-161).
  - Nothing technical stops a platform-level line: audit_event's firm_id is nullable (prisma/schema/audit.prisma:30).
  - Re-encrypt is weaker still. A job with no firm is refused before any read (secret-box/reencrypt.ts:59), so the entry only adds a bypass switch and could be removed.
- **Known limit, documented in the suite:** a per-firm use that reads across firms without calling `touchFirm` writes no line (check_pf12b_bypass_audit.ts:104-106). Today only the suite's per-use count guards this, not `asBypass`. See F2.

## (c) Verdict: **Partial** (stays)
Clauses 1 and 2 are met. Clause 3 is met only as "a named list". Its audit half is met for cross-firm uses only.

## (d) QA-499: stays open, narrowed (Gap · Major, owner Build Lead A)
Close the cross-firm half as fixed by #2029. New wording:
> **11 bypass uses still write no audit_event row (main 90535a94e).** These are the seven own-firm doors (authenticate, sign-in, invitation, web form, booking page, booking self-service, web-address host; firm-scope.ts:106-112) and four no-firm uses (signup purge, messages.send, account.mail, re-encrypt; :116, :120-122), all `audit: "none"`. Gate A on main: 29 uses during sign-ins, 0 audit_event lines.
>
> Expected (QA-499 as ruled by Lead 70):
> - the doors leave the bypass for narrow `xr_wall_reader` lookups, as `platform_web_address_taken` does (PF-12b part 2), or write a row;
> - each no-firm use either writes one platform-level `platform.bypass` row (firm_id null) in its own transaction, fail-closed, or leaves the bypass (re-encrypt: remove the entry).
>
> Only a ruling by the founder or Lead B that rewords R1.4's Done-when can exempt any of them.

## (e) QA-500: still stands, and is wider
The list now has 21 named uses, 12 of them with request routes. Even after part 2 moves the seven doors, five uses on request routes remain on the bypass: sign-up, demo inbox, demo reset, limit change and account mail. The Done-when wording ("named platform jobs") stays wrong either way.

## (f) New findings
- **F1, Process · Major (tech lead):** PF-12b part 2, the remaining half of QA-499 that R1.4 needs to reach Works, has no backlog row, no owner and no PR. R1.4 cannot move beyond Partial until it is shaped.
- **F2, Gap · Minor (Build Lead A):** the audit is opt-in per call. `asBypass` does not check that a "per-firm" use wrote any line (firm-scope.ts:162-180), and the suite itself shows a 0-line cross-firm read under `platform.demo.reset` (check_pf12b_bypass_audit.ts:106). The only guard is the suite's per-use run check (:62-66), which covers the paths it runs, not every path. Fail-closed on a write error, but fail-open on a missing call (P-607).
- **F3, Proof · Minor (qa):** gate A reports the audit count as a NOTE and asserts nothing (check_r14_walls_gate_a.ts:110-112). Its baseline is taken after start-up (:43), so the start-up catch-ups in gate-a-4-bypass-uses.txt (web-address 1, prospect-won 1) cannot show their lines there. Their audit is shown only underneath, in pf12b DW1 (:118, :338-340). The bypass-uses file counts the whole log (29), not the run's 26.
