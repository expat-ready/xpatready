# Review: PF-18a part 2, personal notification settings + NotificationPrefsPort (reviewer, 19 Nov 2026)

Commit `4130eb109c8350cdffc4a7006811ce46605a3d98`, branch `claude/runtime-pf18a-notif-prefs`, draft PR #2304. API and schema row with no screen, so it is judged against the brief `design/lead-b-briefs/PF-18a.md` (part 2, DW5, DW7), AG-16-10, AG-16-11, AG-16 §3.3 (lines 555-577) and STANDARDS. DW6 (`hostZone()`) is not in this commit: it waits for #2284, as the lane was told, so it is not a finding here. A re-review needs it.

**Verdict: Block** (Ship after fixes). One Major, six Minors. Journey score **8.5/10**, a pass (`journey-test-reviewer-2026-11-19.md`).

## What I ran
* `tests/check_pf18a_notifications.ts` on the commit: **59 passed, 0 failed** (21 s). Its neighbours also pass on this tree: `check_pf18a_offices.ts` 87/0, `check_pf12_walls.ts` 100/0, `check_prisma_schema.ts` 8/0. `tsc -p api` is clean. The `any` count is 416, under the baseline of 433.
* An isolated copy on runtime port **:4433** (`tools/isolated.sh`, `PLATFORM_IDENTITY=local`), signed in as Sample staff. I walked GET and PUT and read the database afterwards. Never :4400.
* 18 mutations of the product code in a scratch worktree, plus 2 probes: 15 caught, 3 survived (below).
* `module-cards.py pr` with this diff and the current PR body: **FAIL** (Minor 7).

## Brief and requirement fit (DW5, DW7)
| Case | Result | Evidence |
|---|---|---|
| Email off for a group: `allows(EMAIL)` false, in-app still true | Met | test l.128-129; contract case 2; journey J2 (database row `MENTIONS t/f`) |
| Security email allowed whatever the switches | Met | test l.131; contract case 4; GET shows `security {email:true, switchable:false}` |
| A group that cannot reach the person: not seen, cannot be set | Met | Officer GET returns 6 groups; PUT TEAM_WATCH gives 400 "This group cannot reach you…" with nothing written (J3) |
| Defaults equal §3.3; who sees each group equals §3.3 | Met | `samples/notification-groups.json` against §3.3 table rows 1-8; test l.95-99; mutations "group 8 Owner only" and "Payments email off" caught |
| Eight groups are PF-18np's enum, never a second list | Met | `checkRules` + the database CHECK compared to `NotificationGroup.options` (test l.65) |
| `agent/notification:manage-preferences`, all six roles, own only | Met | test l.112 (six 200s); body `staffId` gives 400; firm B's save leaves firm A alone |
| DW7: one contract, run by the real adapter and the fake; `check-port-contracts.mjs` | Met | both 6/6; two broken adapters fail it |
| DW7: migration in a parallel world (demo-shaped copy, `migrate diff` clean) | Met, but see **Major 1** | test l.70-87 |

The builder's choices, judged:
* Switches per group: right (AG-16-10 "switches for the eight groups").
* Group 7's "in-app only" items as `emailNeverItems` data for the sender: an acceptable reading of §3.3 and AG-16-10 test 7, but see Minor 6.
* No audit line: right (AG-16 §10 audits firm and sensitive settings; this one is self-scoped).
* A whole save refused (400) when it names a group that cannot reach the person: right (all or nothing).
* The adapter throws outside the firm's scope: right (a silent false would drop notices).
* A deactivated person gets false, security emails included: reasonable (they are no longer firm staff).
* The CHECK compared to the enum: good.

## Standards ([M] lines that apply)
* §3.4 "every link checked twice": **met**. The service checks reach; the database has CHECK, the (firm, staff) key, the primary key, a trigger that keeps a row's person, firm and group, a column grant and RLS. Each is tested.
* §3.10, §7 "a rule's test fails when the rule is removed": **partly**. 15 of 18 mutations caught; three rules have no failing test (Minors 2-4).
* §4 optimistic concurrency: **not met, and I accept it as a Minor** (Minor 5).
* §4 ports and adapters, contract first (zod in `ports/`, imports zod only): **met**.
* §5 migrations preserve records, rollback recorded: **met**. Additive only, rollback in the header, demo copy unchanged (test l.79).
* §5 indexed reads, no N+1: **met**. One query for the rows, one for the role keys.
* §6 RFC 9457 problems with field messages; server authorisation, deny by default: **met** (same shape as offices and settings).
* §7 module card: **not met yet**. The `platform` fragment is fine; `api/src/features` changed without a card line (Minor 7).
* §10 consequential choices recorded: partly. The concurrency choice is not recorded.

## Issues, ranked
1. **Major (Must): the DW7 stamp test will fail once any later migration lands.** `tests/check_pf18a_notifications.ts:60` asserts `all.at(-1) === NEW`.
   * Failing case: add any later folder (I used `20261120000000_zz_later_row/migration.sql` = `select 1;`). The run gives **58 passed, 1 failed** ("the migration has its own stamp…").
   * Suites are picked up automatically (`select-suites.mjs`, merge-queue shards, nightly). So the next row with a migration turns main's batches red with no fault of its own.
   * Fix: drop `&& all.at(-1) === NEW`, as part 1 does at `check_pf18a_offices.ts:70`. "Later than the newest on main when it merges" is a merge-time check, not a check that must hold forever.
2. **Minor (Should): the per-person lock has no failing test.** Removing `pg_advisory_xact_lock` (`service.ts:39`) survives, because both parallel saves list the groups in the same order (`test:152`).
   * Failing case: with the lock removed and `s2` reversed to `MY_DEADLINES, NEEDS_YOU`, the breaker check fails 5/5 and 3/5 (deadlocks give 500). With the lock kept and `s2` reversed, it passes.
   * Fix: reverse `s2`.
3. **Minor (Should): own-only on read is not proven.** Dropping `staffId` from the read filter (`service.ts:23`) survives: every later GET checks only the group names.
   * Failing case: the officer saved `MENTIONS t/f`. With the filter dropped, the Owner's GET can show the officer's switch.
   * Fix: after two people save different values for one group, assert each GET shows its own.
4. **Minor (Should): ended role grants are not proven.** Dropping `endedAt: null` (`prefs.ts:15`) survives.
   * Failing case: an Admin whose ADMIN grant has ended still gets `FIRM_AND_CONNECTIONS` from `allows`.
   * Fix: end a grant and assert false.
5. **Minor (Should): a stale save from a second tab overwrites with no 409** (STANDARDS §4 [M]).
   * Failing case (J-break): tab 1 reads; tab 2 sets MENTIONS off; tab 1 PUTs all its groups and gets 200, and MENTIONS is back on.
   * There is one writer and saves are per group, so I accept it. Record the choice and the alternative in the PR (§10), or add a `version` the way offices does.
6. **Minor (Should): group 7's email-off items are not visible to the port's callers.** `ports/notification-prefs.ts:5-10` does not say that `allows(…, "PAYMENTS", "EMAIL")` answers only the group switch.
   * A sender of "payment received" that trusts `allows` would send an email, against AG-16-10 test 7.
   * Fix: one line in the port's rule list, and in `MODULE.rows/PF-18a.md`, naming `emailNeverItems` as the sender's (PF-18n) rule.
7. **Minor (Must before the label): the PR body.**
   * `module-cards.py pr` fails: `api/src/features/MODULE.md` is not updated, and there is no `Card unchanged: <reason>` line.
   * The brief's cases list ("list the cases in the PR body first") and the final `Duplicate check:` line are still missing. The PR is a draft.

## Not applicable or not checked
* BIC-01–20 (EXPERIENCE §6) and D8, D9, D12-D14: no screen in this row (PF-18s builds it).
* D17 and D20: simulated only.
* `graph.mjs` (G1 0, G2 0, G3 161, G4 0, G5 0, G6 17) does not index the empty-path `@Get()`/`@Put()` on `api/platform/me/notifications` (nor part 1's offices GET/POST). That is a tool gap, so no finding.
* CI itself was not run: the PR is a draft.

## D scores (0-3, this row's scope)
D1 3 (DW5 and DW7 met; DW6 deferred by instruction) · D2 3 (database and service checks, race-safe) · D3 3 (one enum, one data file) · D4 N/A · D5 2 (double click gives 1 row; stale tab, Minor 5) · D6 2 (§3.3 cited with the date read; no audit, rightly) · D7 N/A (no AI) · D8-D9 N/A · D10 2 (plain detail lines; zod text in `issues`) · D11 2 (`saved` and defaults shown) · D12-D14 N/A · D15 3 (GET 10-17 ms, PUT 26-44 ms) · D16 2 (3 survivors, Minors 2-4; Major 1) · D17 simulated only · D18 3 (the source block in the data) · D19 N/A (PF-18n and PF-18s close the loop) · D20 simulated only.

Reviewer: Request changes. Fix Major 1 (and Minor 7 before the label). Minors 2-6 should land in the same PR.
