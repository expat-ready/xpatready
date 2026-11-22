# CS-W3 part 2-review: the area's journeys with the walls on (evidence before any edit)

22 Nov 2026, ~22:50 IST, branch `claude/dazzling-thompson-1ndong` at `main` `cff0a6c24` (no code change yet).
Run: `bash studio/tests/fixtures/csw3/csw3-spike.sh suites a check_c76_readiness_api check_c81_signing_api check_a24_case_number_api check_b162_no_copy_api`
(mode a = main as it is, part 1's door included; each suite on its own isolated copy, walled with `csw3-spike-walls.sql` before it starts).

| Suite | Exit | Result | Covers (of this area's ten files) |
|---|---|---|---|
| `check_c76_readiness_api` | 0 | 34/34 | `readiness.ts` |
| `check_c81_signing_api` | 1 | 47/48 | `sign-steps.ts` (all its own cases pass) |
| `check_a24_case_number_api` | 0 | 23/23 | `submission-record.ts`, `filing-record.ts` |
| `check_b162_no_copy_api` | 0 | 7/7 | `review-rounds.ts`, `review-stamp.ts` (`/runtime/filings/:id/ready`) |

The one failure: `check_c81_signing_api` "pass (#924): the firm's own officer reads this case's sign and scan lines in the activity feed" answers `{"status":200,"entities":[]}`. The feed is `GET /api/activity` (`main.ts:103` → `studio.ts` `activity`), which is **not under `/api/runtime/*`**, so part 1's door sets no firm for it, and with the walls on it reads no case rows. `main.ts` and `studio.ts` are in none of the part 2 areas (`studio.ts` is on the census allow-list, but the spec assigns it to no part): a gap for the row owner, not a defect in this area's files.

Why no file of this area failed: part 1's door (`features/case-firm-door.ts`) tags every `/api/runtime/*` request of a staff member with that person's firm, and PF-12's `FirmWallsInterceptor` opens the handler's scope from it; `WalledPool.connect` then sets `app.firm_id` on every connection checked out in that scope, interactive `$transaction`s included. None of the ten files runs outside a request (no jobs, timers or start-up code: `grep` for `setTimeout|setImmediate|onModuleInit|jobs.` finds none).

Not yet run walled (no usage line the spike can drive): `check_c75_review_runs_api` (`review-runs.ts`), `check_c95_release_update` (`release-update.ts`), `check_bk17_keep_recorded` / `check_qa295_recorded_people` (`submission.ts`, `submission-record.ts`); `findings.ts` has no suite of its own named by the selector.
