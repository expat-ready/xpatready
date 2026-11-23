# Review: PF-F1c part 2 (R1.24), PR #3216, web-address catch-up command under the walls

Reviewer: independent (did not build it). Head reviewed: `2c11a5e1e1c3fcb1098b1b7e3a9e4c8c81308f67` (branch `claude/sharp-babbage-kcvefr-webaddress`), against `origin/main` 1e89856fc.
Scope: a command and its test, with no screen. Checked against the hand-over (AWS staging proof, Step 17: "write each firm's address under `firmInTransaction(tx, firmId)` as F8 did for the seed"), PF-8b F8's pattern (`seed-sample-firms.ts`), `firm-scope.ts` and `platform/MODULE.md` (invariants and "Do not").

## Journey score
Not applicable: there is no screen, only a command. D1-D20, the BIC-01..20 scorecard, the graph and the 1024 px and keyboard walks are also not applicable: nothing is user-facing.

## What I ran (from the worktree's `prototype/studio`)
| Command | Result |
|---|---|
| `tsx --tsconfig api/tsconfig.json tests/check_pff1c_catchup_walls.ts` (PR head) | **14 passed, 0 failed, exit 0**; temp databases and roles dropped afterwards (checked) |
| `tsx --tsconfig api/tsconfig.json tests/check_pf25_web_address.ts` (PR head) | **72 passed, 0 failed, exit 0** |
| The same new test in a throwaway worktree of `origin/main` (test file copied in, main's `firm-created.ts`) | **9 passed, 5 failed, exit 1**: every firm `failed` ("is no platform firm"), no address, no audit line; with `case_lookup_read` dropped: exit 0, nothing found, nothing done. Fail-first confirmed. |
| `tsc -p api/tsconfig.json --noEmit` | No error in `firm-created.ts` or the new test (errors seen are in other, older tests) |
| GitHub checks on the head | CodeQL, pr-rules, review-rounds: success. `ci`, `fast`, `packs` and `types` show **skipped**: CI has not run on this head yet |

## Findings against the brief
1. **The command now works under the walls for a runner that is neither superuser nor BYPASSRLS.** `firm-created.ts:95`: with `asEachFirm`, each firm's transaction starts with `firmInTransaction(tx, firmId)`, the one place that sets `app.firm_id` (`firm-scope.ts:89-99`). With that set, `pf12_firm` admits the firm's row lock and its insert, and `platform_firm_first` passes. Checked on two runner shapes: A, in `xr_case_lookup` (as on staging), and B, with no read of `platform_firm`. Both are members of `xr_studio` and `xr_wall_reader`. The `xr_wall_reader` membership matches RDS: the pf12 migration grants it to the role that runs the migration (PF-8b-f5).
2. **The app's start-up run and the subscriber behave as before.** `routes.ts:48` still calls `catchUpFirmAddresses(db, audit)` with no options: same read, same order, no `firmInTransaction`. `onFirmCreated` is only called by the catch-up and the tests. One small difference in the retry rule: see m2. PF-25's 72 checks pass.
3. **The skip loop ends and cannot give a duplicate or held address.** Each pass either adds a new suggestion to `skip` or counts a race (at most 3). Every `tried.address` comes from `tries` and is not in `skip` (`firm-created.ts:62,102-103`). So the loop runs at most 50 suggestions + 3 transactions, then returns null (an error is raised) or throws. The address chosen is still checked by the database: the unique key sees every firm, and the held-address check `platform_firm_web_address_rules` is SECURITY DEFINER, owned by BYPASSRLS `xr_wall_reader` (`pf12_firm_walls/migration.sql:240-249`). So its inner invoker function `platform_web_address_held_by_other` reads every firm's history. The test proves both skips: `maple-immigration` (firm Q has it) and `-2` (firm Z holds it) are skipped, giving `-3` and `-4`. Could a free address be skipped by mistake? Only after a unique violation that is not about the address. The row lock taken first (`:49`) serialises with other writers of the same firm, so this cannot happen in practice.
4. **Finding the firms cannot reach a firm it should not.** The three sources are: the owner's own read (main's criterion), firms with a `firm.created` event, and `samples/firms.json` keys starting with `sample-` (looked up through `platform_firm_of_key`). Each is a subset of main's criterion ("has the event, or a `sample-` key"). Every firm is then checked again inside its own transaction: already has an address, DELETED or ABANDONED → unchanged (`:51-53`). `module_event.firm_id` has an ON DELETE RESTRICT foreign key to `platform_firm`, so no id points to a missing firm. Only firms.json creates `sample-` firms (checked `api/src`), so mode B misses none today.
5. **MODULE.md's "Do not" rules hold.** `app.firm_id` is set only through `firm-scope.ts`. The firm-table queries in `assignIn` keep `firmScope`. The new cross-firm read is ids only, on `module_event` (the event bus, unwalled by name), done by a command and not inside the app: the same pattern as main's command and PF-8b F8's seed. No new package, no migration, no logger. See m3 on ids in the output.
6. **The test reproduces the RDS shape.** The role is NOSUPERUSER and NOBYPASSRLS and owns the tables only through membership. FORCE is checked on. The real command runs as a child process, twice (the second run changes nothing), plus the superuser case. Removing any one part makes a check fail: `firmInTransaction` (A), the skip set (the Maple pair), the event or Sample discovery (B). A difference the PR itself discloses (Q1): main fails at the row lock here but failed at the insert on staging. The fix passes both points; RDS itself is not proven until the redeploy.

## Issues, ranked
**Blocker:** none. **Major:** none.

**Minor**
- **m1. The row id points to an unrelated row (traceability).** In `BACKLOG.md:1059`, `PF-F1c` is the S3 documents-bucket row (#3215 is "PF-F1c part 1"). This PR puts that id on a web-address fix: `firm-created.ts:12,61,77,87,127,148`, `tests/check_pff1c_catchup_walls.ts:1`, and `api/src/platform/MODULE.rows/PF-F1c.md:1`. That last file lists a web-address test under a files row's name. Fix: the Lead records "PF-F1c part 2 = R1.24 catch-up" in BACKLOG/STATE, or gives the work its own id. No code change needed.
- **m2. The header says the subscriber is "unchanged" (`firm-created.ts:19`), but the retry rule changed for the app's path too** (`:91-104`). A refused address that is new no longer counts as an attempt, so the most attempts went from 3 to about 53 (suggestions + 3). Harmless: still bounded, and each attempt follows a database refusal. Fix: one line in the header saying this.
- **m3. The command's output got longer.** In `asEachFirm` mode, `results` now lists every firm with a `firm.created` event, by firm id, including firms that already have an address and DELETED ones (`assigned:false`) (`:118-122,136,149`). On ECS this stdout goes to the task's logs, and MODULE.md says "Do not … log record ids". Printing ids is not new (main printed the firms it acted on), but the list now covers every firm with an event. Fix: print only `assigned:true` and `failed` (or counts) in the command's `console.log`.
- **m4. Test gap.** No fixture has a firm with no event, a non-Sample key and no address (a firm from before PF-25), so nothing proves the command leaves it alone in either mode. Point 4 shows this by reading the code only. Fix: one such firm in the set-up, and assert `-` after runs A, B and C (`tests/check_pff1c_catchup_walls.ts:47-56`).

## What I could not check
- Amazon RDS itself: the staging point of failure (the insert, not the lock) is unexplained locally. Proof is the hand-over's steps after merge: rebuild, `deploy 2`, run the command, `curl sample-firm.` → 200, `deploy 0`.
- CI on this head (the checks are skipped so far).
- The app start-up run as the RDS owner (out of this row's scope; PR Q2).

Reviewer: Approve 2c11a5e1e1c3fcb1098b1b7e3a9e4c8c81308f67

**Verdict: Approve.** No open Blocker or Major. The four Minors (m1 row id, m2 header wording, m3 output size, m4 test fixture) can be fixed in this PR or a follow-up.
