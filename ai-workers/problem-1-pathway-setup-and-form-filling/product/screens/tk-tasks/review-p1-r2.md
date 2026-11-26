# Review round 2: R1.75 part p1 (PF-29a, PF-29b), PR #3635, commit a1433d0dfafe710f736a0ac6eedf8acd57d2df8f

Reviewer: a fresh session that did not build this part or review round 1. Scope: only `git diff 54394f8..a1433d0` (studio files and `.mergify.yml`), checked against `review-p1.md`, `break-report-p1.md`, the PR comment "Reviewer: Block 54394f8…", STANDARDS.md §3–§4, §7 and concept r2.1 BR-3, BR-5, BR-8, BR-19. API only. Journey score: **N/A** (no screen). D1–D20 and BIC-01–20: N/A. The :4400 demo was not used.

**Verdict: Block.** No Blocker. Three Majors are open: one fix made a required suite flaky, one fix brought in a time-zone regression, and one round-1 rule is still untested. All three are small to fix.

## What I ran (at a1433d0)
* `check_tk1_tasks.ts` (127.0.0.1:54329): **39/40 in 5 of 13 runs, 40/40 in 8.** The failing line is always TK5 "the Owner reassigns…", `[422,200,409]` (Major 1).
* `check_pf12_walls.ts`: **110/110**. The trigger-function guard line now passes.
* `migration-slots.py check origin/main..a1433d0`: **PASS** (1 new migration, `20261125100000_platform-tasks__pf29a_plat_task`). `module-cards.py tree` and `pr`: PASS.
* Mutation runs in a scratch extract of a1433d0. I removed each fix in turn and checked that its test fails:
  * **Fails, as it should:** the Restricted `hostType`; reopen unassigning; the `holdsKey` assignee rule; the no-op path; who-may before which-version; the firm-task context; the audit `cut`; `HAS_WORD`; the host-zone check.
  * **Fails, as it should (review M2 rules):** cancel needs `:edit`; reopen needs `:edit`; a closed task cannot be assigned; the Restricted assignee's Done; Done by an `:edit` holder; Take it by view.all + edit.
  * **Still green:** the view.all rule at `service.ts:141` (Major 3), Take it's audit "before" (Minor 1) and `for share` (accepted: a race).
* Probes on the extract: zones (Major 2), titles, a long-description edit, and a same-value edit.

## Round-1 findings: are they fixed?
| Finding | State at a1433d0 |
|---|---|
| Review Blocker 1 (CI red) | **Fixed.** Area-named folder, `xr_wall_reader` SECURITY DEFINER with `search_path` pinned, features card row. The regex CHECKs are equivalent to the old `IN` lists (PG `~` anchors `^…$` on the whole value). |
| Review M1 (Restricted shows its type) | **Fixed** (`service.ts:136`). The test fails without the fix. |
| Review M2 (rules removable) | **Mostly fixed.** Cancel and reopen `:edit`, closed assign, Restricted Done, Done by `:edit` and Take it by view.all + edit each fail when removed. **Not fixed: the view.all rule** (Major 3). |
| Review M3 / break M2 (reopen to a deactivated person) | **Fixed** (`service.ts:249`). The test fails without the fix. |
| Break M1 (details 4,001–5,000 give a 500) | **Fixed** (`cut`, `service.ts:87`). The test fails without the fix. Side effect: Minor 2. |
| Break m1, m2 (zones) | Fixed for `US/Pacific-New`, `Mars/Olympus` and lower case, but it **adds Major 2**. |
| Break m3, m4, m6, m7, m8 | Fixed, each with a failing test. m7's no-op adds **Major 1** (in the test, not the code). m3 has Minor 3. |
| Break m5 / review Minor 1 (Take it's audit "before") | The code is right: the "before" is derived from the locked row (`:228`). **No test fails without it** (Minor 1). |
| Review Minor 2 (`for share`) | Added (`:147`). `xr_app` holds UPDATE on `platform_staff`, so FOR SHARE works under the real role. `identity/service.ts:167` has the same pattern. Sound. |

## Major
1. **A required suite is now flaky. The no-op fix broke TK5's version arithmetic.** `tests/check_tk1_tasks.ts:159-160`.
   * TK5's Take-it race (`:154`) is won by either the Case Officer or the Owner.
   * When the Case Officer wins, the Owner's "assign to the Case Officer" (`:159`) is now a no-op (`service.ts:206`, `:272`) and the task stays at v2. `unassign` names `version: 3` (`:160`) and gets 409. Result `[422,200,409]`.
   * Measured: 5 of 13 local runs failed. The merge queue retries a failed suite once, so roughly 1 batch in 7 still fails and ejects its batch-mates.
   * Fix: name the version the response returns (`toOff.body.version`), or assign to the person who lost the race.
2. **A regression: modern IANA zone names are refused, and a firm zone like `Asia/Kolkata` silently becomes UTC.** `service.ts:40-42, 47, 155`.
   * `canonicalZone` accepts only `Intl.supportedValuesOf("timeZone")`. That list uses ICU's old spellings (`Asia/Calcutta`, `Europe/Kiev`, `Asia/Saigon`, `America/Godthab`; no `Etc/GMT+5`).
   * The platform already accepts and stores the IANA names. `settings.ts:195-215` (TIME_ZONE) says so, and `check_pf4_identity.ts:463` asserts that `Asia/Kolkata`, `Europe/Kyiv`, `Asia/Ho_Chi_Minh` and `Etc/GMT+5` are accepted.
   * Probe, with the firm zone set to `Asia/Kolkata` and the Owner in no office: `POST {host:firm, due:{date:"2026-12-01", time:"17:30"}}` gives **201 with `dueZone:"UTC"` and `dueAt 17:30Z`**. That is 5 h 30 min off, with no message.
   * Naming `zone:"Asia/Kolkata"`, `"Europe/Kyiv"`, `"Asia/Ho_Chi_Minh"` or `"Etc/GMT+5"` gives **422 "A time zone from the list"**. At 54394f8, Intl accepted these names.
   * Canadian province zones are all on the list, so firms and offices abroad are hit. Offices abroad start with the firm's zone (`zones.ts:17`).
   * Fix: validate with the platform's own rule (`TIME_ZONE.schema`, or export `isZone` from `settings.ts`). Use the office or firm zone as given: it is already validated. Never fall back to UTC silently. Add a pass for `Asia/Kolkata` named and as the firm zone.
3. **The view.all read rule is still removable with the suite green** (review M2, STANDARDS §7 [M]). `tests/check_tk1_tasks.ts:213-214`.
   * I changed `service.ts:141` to `(this.mine(s,row) || host)` and the suite still gave 40/40.
   * The TK9 line's 404 does not come from the rule. It comes from `readable`'s `if (!row)` (`:139`): `tasks9.get(...)` runs outside a request, so PF-12's walls hide the row.
   * Also, `c9` was made by the Owner, the same `staffId` as `offCtx`, so `mine()` would pass anyway.
   * Fix: through a route, have a person with view.own only (a grant without `view.all`) read a colleague's task → 404. Their own task → 200.

## Minor
1. `check_tk1_tasks.ts:217`: the m5 audit test runs serially. With the "before" set back to the pre-transaction `row`, it still passes. Only a race (Take it alongside an edit) shows the fix. It can wait, but do not count it as m5's test.
2. `service.ts:87` with the audit: editing a 4,500-character description at character 3,000 writes an audit line with **no description before or after** (probe: only `version_before/after`). Both cut copies are the same and `descriptionChars` does not change, so the trail cannot show that the details changed. Fix: also record a hash of the full text, or the character offset of the first difference.
3. `service.ts:27, 30`:
   * Tag characters U+E0000-E007F are refused, so the Scotland, Wales and England flag emoji are refused (`"Call 🏴󠁧󠁢󠁳󠁣󠁴󠁿 office"` → 422). The note says "emoji kept".
   * `HAS_WORD` refuses titles of only emoji or symbols (`"✅"`, `"📞 ☎"`, `"?"` → 422 "Write what needs doing").
   * U+034F and a lone surrogate (`"a\ud800b"` → saved as `"a�b"`) still pass.
   * Fix: drop E0020-E007F from `HIDDEN` when it follows U+1F3F4, or accept that, but say it in the note.
4. `migration.sql:64`: the comment says the assignee is "read in the caller's scope: another firm's person is not seen". It now runs as `xr_wall_reader` (BYPASSRLS), so it sees every firm. It is still correct because it compares `NEW.firm_id`, which `0_pf12_firm_first` has fixed first. Correct the comment.
5. The carry to p2 (Idempotency-Key on create, list routes before `:id`) is acceptable to carry: no screen calls create until p2, and it is one part away. But it is recorded only in a PR comment. The PR body and the `shape-r175.md` p2 row do not name it (P-557). Name it in one of them.
6. Kept as the builder stated: a same-value edit (`{version:2, title:"big"}` on a task titled "big") still moves the version and audits. Inserts are guarded by the service only. A time in the spring-forward gap moves on by an hour. Both of the last two are named in the PR comment.

## Could not check
The full CI run on GitHub. A multi-process race of `for share` against p3's deactivation (p3 does not exist yet; its lock order should take the staff row before task rows, to avoid 40P01).

## List to fix
Major 1 (TK5 version), Major 2 (zone rule and fallback, with tests), Major 3 (a real view.all test).

Reviewer: Block a1433d0dfafe710f736a0ac6eedf8acd57d2df8f
