# Break report: PF-19c part 2, the three lead starters as platform template rows (#3219)

Head attacked: `c80fe79b146ce30bdbf2b48789376ebb6f9585e2` (branch `claude/screens-pf19c-starters`), 23 Nov 2026.
Migration under test: `studio/prisma/migrations/20261123030000_pf19c_platform_starters/migration.sql` (21 lines at head).
Method: scratch databases on 127.0.0.1:54329 (`xr_brk_pf19c_*`; every migration before PF-19c, then `seedSampleFirms`,
then the PF-19c file) plus one throwaway PostgreSQL 18.3 cluster (initdb, port 15469) for a non-superuser runner. No
contact with :4400 or `xr_studio_demo`. All scratch databases, the cluster and temp files were removed afterwards.
Note: while I was working, someone changed the shared working copy without committing (migration.sql, the PF-19c test and
`check_pf8b_f7_data_walls.ts`, apparently fixing B1). Every result below is for the committed head: I took the
migration from `git show c80fe79b1:` and ran the tests from a `git archive` of the head, not from the working tree.

## Findings

| # | Attempt | Expected | Actual | Severity |
|---|---|---|---|---|
| B1 | Ran the migration as a table owner that is neither superuser nor BYPASSRLS. This is the Amazon RDS runner that PF-8b F4 to F8 support: `rds_admin` owns `msg_template(_version)` and FORCE RLS stays on, as PF-12 sets it. | It seeds the three rows or refuses with a clear message. The header says "Runs as the migration (bypass) role". | `ERROR: new row violates row-level security policy for table "msg_template"` (`platform_firm_first()` line 5) and psql exit 3. Nothing is seeded, and `prisma migrate deploy` would stop here, so no later migration would apply either. The `NOT EXISTS` read is also walled, so it sees no platform row. | **Blocker** |
| B1b | Ran the project's own guard for B1, `tests/check_pf8b_f7_data_walls.ts` (PGBIN=/usr/lib/postgresql/18/bin, port 15467). | Pass. | `FAIL every data statement on a walled table runs with FORCE lifted in its own DO statement`, naming `20261123030000_pf19c_platform_starters` on `msg_template` and `msg_template_version` (the bare `WITH … INSERT`, migration.sql:7-21). This is the only failure. The earlier data migrations wrap their statements in the PF-8b F7 DO block (lift FORCE, step past `0_pf12_firm_first`, put both back). This one does not. | Blocker (same root as B1) |
| m1 | Put a platform row `lead.going_cold` / EMAIL / en with **no version** in place first (a stray or hand-made row), then applied the migration. | Either the row gets version 1 or the migration stops and names the row. | Exit 0 with `INSERT 0 2`. `lead.going_cold` keeps 0 versions, because the guard (migration.sql:17) checks the template, not the version. Then every send of `lead.going_cold` for every firm is refused: `no email template lead.going_cold (en) for this firm`. No current code path creates platform rows (only the bypass role can), so this is unlikely. | Minor |
| m2 | A platform row with the same key that already has a version in other wording (an earlier hand seed). | Stop, or say so. | Skipped without a word, so the old wording stays. The registry starter and the database could then differ, and nothing reports it. | Minor |
| m3 | Sent `lead.acknowledgement` with a 180-character `firm_name`, and with one containing a newline. | Send, or a limit enforced when the firm name is entered. | Both refused by the subject rule (messages.ts:110): "gives no subject, one over 200 characters, or one with a line break". The subject `Thank you for contacting {{ firm_name }}` leaves 175 characters for the name. I found no length limit on `platform_firm.operating_name` (TEXT, no CHECK, no zod max). A firm with a very long name cannot send its automatic acknowledgement. | Minor |
| m4 | Checked where the wording comes from. | The wording matches a source on main. | It matches `registry.ts` KINDS word for word (subject and body for all three; ASCII only; the `kind` values match `kind.list.toLowerCase()`). But that file exists only on the open #3179 (`claude/screens-pf19s-templates`), not on main and not on this branch. The wording now lives in two places, and if #3179's wording changes in review, this already-applied migration cannot follow (checksum). | Minor |

## What held

- **Existing data:** applying it beside firm rows (firm A's own `lead.follow_up` v1, and firm B's own `lead.acknowledgement` with 0 versions) left those rows unchanged and added exactly the missing platform rows.
- **Rerun and concurrency:** a rerun adds nothing (the PR test passes 7/7). Two applies at once: the second fails loudly on `msg_template_platform_key` and does not create duplicates. Each run is one statement, so a failed run leaves nothing half-done.
- **App role (`xr_app`, PF-12) with firm A's session:**
  - It reads the 3 platform templates and their versions. With no firm it reads 0.
  - It cannot insert a platform template or version (`platform_firm_first`).
  - It cannot attach a firm-A version to a platform template (`msg_template_version_in_firm`).
  - UPDATE of key or language and DELETE of the platform rows touch 0 rows. TRUNCATE is refused (permission denied).
  - The platform rows were unchanged afterwards.
  - Firm A sees 0 of firm B's templates, both directly and through a join to the platform rows.
- **Send lookup** (the real `Messages.send` and, as `xr_app`, the same SQL):
  - A firm's own v1 wins over the platform's, because the owner enum order is PLATFORM then FIRM and the lookup orders desc.
  - A firm template with 0 versions falls back to the platform v1.
  - A firm's own WHATSAPP v7 and its own `fr` v9 do not affect the EMAIL/en send (still platform v1). An `fr` send uses the firm's fr v9.
  - With no fr row, `fr` is refused. That is English-only Release 1 (AG16-88), so not a finding.
  - Another firm keeps getting the platform version.
- **fillFields and the subject rule:**
  - Every `{{ … }}` in the seeded wording matches `[a-z][a-z0-9_]*`. The fields are `firm_name`, `lead_first_name`, `lead_number` and `owner_name`, all in the registry's lead list, with no passport or financial field.
  - The subjects are one line, 28 to 40 characters.
  - A value holding `{{ owner_name }}` is not filled in a second time.
  - A missing field is refused and named.
- **No drift:** `prisma migrate diff --from-config-datasource --to-schema prisma/schema` gives the same output before and after the migration: "This is an empty migration."
- **Write-once:** UPDATE and DELETE of a platform version are refused.
- **Other tests:** `check_pf19a_messages_schema.ts` passes 94/94 with the "0|6" exception. In `check_pf12_walls.ts`, all database-level checks pass (105). Its 5 server-start checks failed only because my archive copy lacks `prototype/p2/` (ERR_MODULE_NOT_FOUND), not because of this PR.

## Repro for B1 (throwaway cluster)
Apply every migration before PF-19c as a superuser. Then
`CREATE ROLE rds_admin NOSUPERUSER NOBYPASSRLS LOGIN; ALTER TABLE msg_template OWNER TO rds_admin; ALTER TABLE msg_template_version OWNER TO rds_admin;`
and `psql postgresql://rds_admin@…/db -v ON_ERROR_STOP=1 -f <head migration.sql>`. Result: the RLS error above, 0 rows.

Verdict: Block
