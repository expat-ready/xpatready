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
