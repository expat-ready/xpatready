# PF-19c part 2 (R1.46): platform lead starters, review

PR #3219, branch `claude/screens-pf19c-starters`, head `c80fe79b146ce30bdbf2b48789376ebb6f9585e2`, reviewed 23 Nov 2026 by a reviewer that did not build it.
Scope: the four files in `git diff origin/main...HEAD` (data-only migration `20261123030000_pf19c_platform_starters`, `tests/check_pf19c_platform_starters.ts`, one assertion in `tests/check_pf19a_messages_schema.ts`, `MODULE.rows/PF-19c.md`). Ruling: Lead 1, challenge B1 on #3179 ("seed the starters as platform rows").

**Verdict: Rework.** One Blocker: on a migration runner that is neither superuser nor BYPASSRLS (the Amazon RDS case PF-8b F7 exists for), the migration is refused. The PF-8b F7 suite fails on this head.

## Runs (all on scratch databases, never :4400)
| Run | Result |
|---|---|
| `tsx --tsconfig api/tsconfig.json tests/check_pf19c_platform_starters.ts` (scratch DB on the local cluster :54329) | 7 passed, 0 failed |
| `run-suites.sh --only check_pf19a_messages_schema.ts` | PASS, 94 passed, 0 failed (21 s) |
| `tsx tests/check_pf8b_f7_data_walls.ts 14471` (throwaway cluster) | **1 failed**: "every data statement on a walled table runs with FORCE lifted in its own DO statement". It names only `20261123030000_pf19c_platform_starters`, for `msg_template` (x2) and `msg_template_version` |
| By hand: every migration but this one applied to a scratch DB; `msg_template(_version)` owned by a NOLOGIN NOBYPASSRLS role; this migration run after `SET ROLE` to that role | `ERROR: new row violates row-level security policy for table "msg_template"` (`platform_firm_first()`, PF-12's `0_pf12_firm_first` gate); 0 rows. The same file run as the superuser: `INSERT 0 3` |
| Byte comparison: the three subjects and bodies in the migration (E'' strings, `\n` decoded) against `KINDS[].starter` in `registry.ts` on `origin/claude/screens-pf19s-templates` (JSON-decoded) | identical, all 3 keys, subject and body, newlines included (bodies 207/199/220 characters as JSON) |

## Findings
**Blocker**
- **B1. The data statement is not wrapped for a non-BYPASSRLS runner (PF-8b F7).** `migration.sql:7-21` inserts into `msg_template` and `msg_template_version`, both FORCE ROW LEVEL SECURITY with PF-12's `0_pf12_firm_first` gate. The comment at line 6 assumes a bypass runner. PF-8b F7 (`20261122050000_pf8b_f7_data_walls_checksums`, `tests/check_pf8b_f7_data_walls.ts:1-12`) says otherwise: the RDS admin owns the tables and is neither superuser nor BYPASSRLS. For that runner the `NOT EXISTS` reads nothing and the insert is refused, so `prisma migrate deploy` stops with this migration marked failed, and every later deploy waits until someone resolves it by hand. The F7 suite fails on this head (run above), so CI is red too. **Fix:** put the `WITH … INSERT` inside the F7 lifting `DO` block with `walls := ARRAY['msg_template', 'msg_template_version']`. That block checks `rolsuper OR rolbypassrls`, locks the walls, lifts FORCE, disables `0_pf12_firm_first` while it is plainly enabled, and restores both afterwards, exactly as in `20261122000000_pf5p3_billing_period/migration.sql:14-37`. Fix the comment at line 6 to match, then re-run `check_pf8b_f7_data_walls.ts` (its database part runs each data migration as a non-BYPASSRLS owner).

**Major**: none.

**Minor**
- m1. Nothing guards the wording against drift. The test checks one subject and one body prefix, not the full wording against `registry.ts`, which is not on main yet (#3179). The wording matches today (checked byte for byte above). Once #3179 merges, add one line comparing each platform version 1 to `KINDS[].starter`, so a registry edit that is not paired with a new platform version fails.
- m2. `check_pf19c_platform_starters.ts:56`: the write-once line uses `fails()`, which accepts any error. Match `/write-once/` so a typo or a different refusal cannot pass it.
- m3. `check_pf19c_platform_starters.ts:50-51`: if the `NOT EXISTS` guard is removed, the rerun hits the `msg_template_platform_key` partial unique index and the script throws (exit 1) rather than printing this line's FAIL. It still fails, but the reader gets no line naming why. Optionally catch the rerun error and report it on the line.

## What holds
- **Wording:** identical to `registry.ts` on the #3179 branch, newlines included. `kind` is `automatic`/`library`, which is what PF-19s writes for a firm's own template (`templates.ts:106`, `kind.list.toLowerCase()`). EMAIL, `en`.
- **pf19a constraints:** `msg_template_owner_check` holds (PLATFORM with a null firm). `key_check` holds: the three keys match `^[a-z0-9]+([._-][a-z0-9]+)*$` and are at most 120 characters. `language_check`: `en`. `msg_actor_ok('seed:sa05-a1')` holds. `version >= 1`, and no body is blank. `msg_template_platform_key` and `msg_template_version_platform_version` are not crossed, and the rerun adds nothing. `msg_template_version_in_firm` accepts it (null version firm, null template firm). The write-once trigger stands: update and delete of a platform version are refused (test line 4). The firm foreign keys do not fire on null.
- **PF-12 walls:** on a superuser or BYPASSRLS runner the rows go in and `pf12_platform_read` lets any firm session read them (generic probe in `check_pf12_walls.ts:264-266`). A firm cannot add or change one (same lines). On a non-bypass runner: B1.
- **Idempotence:** a single statement, with `NOT EXISTS` checked per key over firm-less EMAIL/`en` rows and backed by the partial unique index. Versions are inserted only for templates this run created. The rerun line passes, and Prisma's migration lock serialises deploys.
- **Send path order** (`messages.ts:104-107`): PostgreSQL sorts an enum by declaration order (`'PLATFORM', 'FIRM'`), so `owner desc` puts FIRM first, then `version desc`. Test line 7 shows it both ways: firm A's own version 1 wins over the platform's version 1, which an `asc` order would lose, and firm B still gets the platform's.
- **PF-19a assertion:** its intent stands. It now reads `total - starters || '|' || starters === "0|6"`: no other `msg_` row exists, and the set-aside is exactly six (a seventh `lead.%` platform row, or a stray `seed:sa05-a1` version, makes it fail). It counts rows rather than naming them, but `check_pf19c` pins the identity.
- **Pass and fail per line:** lines 1, 3, 5, 6 and 7 each fail if the migration, the field rule, the fill check or the owner order is removed (6 matches only the missing-field refusal, not "no template"). Lines 2 and 4: see m3 and m2.
- No other suite refers to the three keys or counts platform templates.

## Journey score (reviewer, the one score for this check): 7.5 / 10, below the bar
There is no screen in this item, so the journeys go through the starters' consumer, the send path, plus the deploy itself (report: `journey-test-reviewer-2026-11-23.md`). Fixing B1 raises "task completed" and "error recovery" to 1, which brings the score to 10/10.

## Not checked / not applicable
- D1-D20 and BIC-01-20 do not apply: there is no screen or page. `graph.mjs` was not run because it rewrites `qa/GRAPH.md`, which is outside this review's write scope.
- Not tested on a real RDS instance. The non-bypass run above stands in for it, as F7's own database check does.

Verdict: Block
Fix list: B1.

Reviewer: Block c80fe79b146ce30bdbf2b48789376ebb6f9585e2

## Re-review (diff c80fe79..a89c0be7)
Scope: only `git diff c80fe79b146ce30bdbf2b48789376ebb6f9585e2..a89c0be7a558c926a94b4826cbf2721720686ff3` (migration, `check_pf8b_f7_data_walls.ts`, `check_pf19c_platform_starters.ts`). Checked out at da069a02d (the later commits are records only). Throwaway clusters and the :54329 scratch DB only; :4400 was not used.

| Run | Result |
|---|---|
| `PGBIN=/usr/lib/postgresql/18/bin tsx --tsconfig api/tsconfig.json tests/check_pf8b_f7_data_walls.ts 14481` on the fix | **18/18 passed**: the sweep counts 45 guarded statements in 16 migrations, and the new pf19c window passes |
| The same suite (port 14482), in a detached worktree of a89c0be7 with only the pf19c migration put back to c80fe79's text | **3 failed**: the sweep (names pf19c, `msg_template` and `msg_template_version`); the pf19c window (`P3018`, `new row violates row-level security policy for table "msg_template"`, `platform_firm_first() line 5`); and "the rest applies" (`P3009`). The worktree was removed afterwards and the working tree is clean |
| `tsx --tsconfig api/tsconfig.json tests/check_pf19c_platform_starters.ts` | **7 passed, 0 failed**, including the rerun line and the write-once line |
| `diff` of the two `DO $pf8b_f7$ … $pf8b_f7$;` blocks (pf5p3 with comment lines dropped vs pf19c) | They differ only in the `walls` array (`'msg_template', 'msg_template_version'`) and the data statement |

### Findings
**B1 (first round): resolved.**
- **The wrapper matches the pattern.** It has the same `rolsuper OR rolbypassrls` test, and the lift runs only for the other runners. `LOCK TABLE … IN ACCESS EXCLUSIVE MODE` comes before any lift. `lifted` is read from `pg_class.relforcerowsecurity` and `gated` from `pg_trigger` (`0_pf12_firm_first`, `tgenabled = 'O'` only). After the insert both are restored in reverse order: the gate is enabled again, then FORCE is put back. For a bypass runner both arrays stay `'{}'`, so the restore loops do nothing and it writes exactly as before. On an error the whole DO statement rolls back, so FORCE and the gate come back with it, as in pf5p3. The window's "every walled table is forced again at the end" step passes. The comment now describes the F7 runner and names the pattern and the test.
- **The plpgsql body is still idempotent.** The `WITH … INSERT … INSERT` is unchanged apart from indentation. `NOT EXISTS` is checked per key over firm-less EMAIL/`en` rows, and versions are inserted only for templates this run created. For the non-bypass runner the owner sees every row once FORCE is lifted, so the guard reads the real table. The starters test reruns the file and adds nothing (bypass path). The window shows 3|3 on the non-bypass path.
- **The window is a real fail test.** Before the deploy, the seeded firm row is shown to be hidden from `xr_admin` (count 0) and visible to `postgres`. `want: "3|3"` fails both ways the old migration could go wrong: the run stopping (P3018, as reproduced above) or a silent zero-row insert. The mutation run above shows it failing.
- **m2 (first round): resolved.** Both refusals must contain `write-once`, which is the wording of the pf19a trigger (`'% is write-once: % refused'`, `20261115004500_pf19a_platform_messages/migration.sql:372`).

**New, Minor**
- m4 (nit). The CTE `t` (`… ), t AS (INSERT …) … FROM t JOIN s ON s."key" = t."key"`) has the same name as the DO block's `DECLARE t text`. It works: PL/pgSQL does not substitute a scalar variable for a table reference or for `t."key"`, and the window plus the 3 versions prove it. Still, a reader has to know that rule. Renaming the CTE (for example to `made`) would remove the doubt. Not required.

**Still open from the first round (Minor, unchanged by this diff):** m1 (wording drift guard once #3179 merges) and m3 (the rerun error is not reported on its own line).

**Blocker:** none. **Major:** none.

Journey score: unchanged in method. B1 was the only deduction ("task completed", "error recovery"), and the deploy now succeeds for the non-bypass runner, so the score is **10/10** for a89c0be7.

Verdict: Approve
Reviewer: Approve a89c0be7a558c926a94b4826cbf2721720686ff3 (code). The record-only commits 48a29c199 and da069a02d change no code.

## Re-review (diff 0dc59cb1f..843c77e5c, key rename)
Scope: only `git diff 0dc59cb1f..843c77e5c` (4 files, 16+/16-), checked out at 843c77e5c. I used throwaway databases on :54329 and the F7 cluster on 14491. I did not use :4400.

| Run | Result |
|---|---|
| `tsx --tsconfig api/tsconfig.json tests/check_pf19c_platform_starters.ts` | **7 passed, 0 failed** |
| `PGBIN=/usr/lib/postgresql/18/bin tsx … tests/check_pf8b_f7_data_walls.ts 14491` | **18/18 passed**, including the pf19c window (non-bypass owner, hidden firm row, `3\|3`) |
| `tsx … tests/check_b164_no_engine_keys.ts` | **67 passed, 0 failed** |
| `tsx … tests/check_pf19a_messages_schema.ts` | **exit 0**. The "six starter rows aside" line passes (`0\|6`) |
| A scratch script parses the migration's `VALUES` rows and compares them with `KINDS` at 571636d68 (`registry.ts`) | 3 rows. For all 3 keys, key, kind (`list` lower-cased), subject and body (after `E''` `\n` unescape) are equal |

### Findings
- **The keys pass the template key check.** `sales.lead.acknowledgement`, `sales.lead.follow_up` and `sales.lead.going_cold` each match `^[a-z0-9]+([._-][a-z0-9]+)*$` (`msg_template_key_check`, pf19a migration line 348), and each is far under 120 characters. The inserts in the starters test and in the F7 window would fail on that constraint otherwise. They also have three segments, so B164's two-segment combination shape (`^[a-z]{2,5}\.[a-z][a-z0-9_]*$`) no longer matches them. `'sales.lead.%'` fails its key shape on the `%`.
- **No old key remains.** A search of the whole studio tree (minus `node_modules`/`dist`) for `lead.acknowledgement|lead.follow_up|lead.going_cold` without the `sales.` prefix finds nothing. The only `'lead.%'` left is `check_fo2_leads_prospects.ts:380`, the `module_event.type` filter. This diff does not touch it, which is correct.
- **pf19a still pins exactly six.** The assertion is still `=== "0|6"`. Only the template filter changed: 3 templates by `sales.lead.%` plus 3 versions by `published_by = 'seed:sa05-a1'`. Any extra msg_ row still makes the left side non-zero.
- **The F7 window still proves the insert.** Only the `got` filter changed. `want: "3|3"` and the hidden-row precheck are unchanged. With a stale `lead.%` filter the window would read `0|3` and fail, so the rename is load-bearing and covered.
- **The wording and kinds match #3179.** The comparison above shows that. `kind` is `automatic` / `library` / `library`, the same as `list` Automatic / Library / Library at 571636d68.

**Still open, Minor (from earlier rounds, unchanged by this diff):** m1 (no drift guard between the migration and the registry once #3179 merges; today the match is shown only by script). m3 and m4 are unchanged.

**Blocker:** none. **Major:** none.

Journey score: **10/10** for 843c77e5c, unchanged. The rename changes no visible wording or flow. Sends by the new keys fill and deliver in the starters test.

Verdict: Approve
Reviewer: Approve 843c77e5c021d18918e8c17410320853a1bbee7c
