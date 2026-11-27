# Review round 6 (diff only, P-303): FO-3v part 1, PR #3418 at ec24f5241

Reviewer: Opus 5.5, fresh context (I did not build it). 26 Nov 2026. Scope: `git diff a3d7537f3 ec24f5241` only (4 files, 12 lines added, 3 removed). This round fixes three pr-suites failures from CI on a3d7537f3. No page changed, so I ran no journey. The round-1 journey score, 9.5/10 (`journey-test-reviewer-fo3v-part1-2026-11-24.md`), stands.

**Verdict: Approve** for ec24f52415fb9312bf377709ebc5ccdb6a8053ed.

## 1. PF-28: query parse on GET/PUT /api/front-office/me/video (fixed)
- `service.ts` adds `VideoQuery = z.strictObject({})`. `VideoService.get` and `put` both run `parseInput(VideoQuery, query)`. `parseInput` returns 422 with `fields` naming each unknown key ("This field is not allowed here.").
- Order in `get`: the id-like 403 check, then the query parse, then the only read (`foVideoPref.findFirst`). Nothing is read before the parse.
- Order in `put`: the id-like 403 check (body and query names), then the query parse, then `parseInput(VideoBody, …)`, then the transaction. So the query is parsed before the body, and nothing is written before either parse. The controller's 415 for a non-JSON body still comes first, as before; that is outside this diff and does not matter here.
- 403 OWN_RECORD_ONLY still wins over 422: an id-like key throws before the parse runs. The existing AG-4-59 fail test (`?staff_id=` on GET, `StaffId`/`id` on PUT, all 403) still passes.
- New fail test (`check_fo3v_video.ts`): `?pf28Unknown=x` on GET and `?colour=red` on PUT, each must give 422 naming the field, and the link must stay unchanged. On a3d7537f3 the service has no `VideoQuery` (I checked with `git show`: 0 matches), so the GET returns 200 and the test fails. CI's failure of check_pf28_inputs on that head shows the same thing. It bites.

## 2. check_fo1a_sales_schema: `video` area prefix (legitimate)
- `fo_video_link_ok` and `fo_video_drop_on_deactivate` belong to FO-3v's own area file (`prisma/schema/front-office-video.prisma`, table `fo_video_pref`, migration `20261126063100_shared__fo3v_video`). That is the same position as `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, and FO-9b's `fo_dup_` (commit 4f36b1f03). The comment names it.
- The change adds a single exact area prefix anchored as `^fo_(…|video)_`. It is not a wildcard, and it does not allow-list a generic name, so the guard is not loosened.
- The fail case still bites: `fo_next_number` must still be reported. The suite passes 124/124, including that fail case.

## 3. check_b164_no_engine_keys: `video` in NOT_KEYS (no weakening for real programs)
- `keyLike` checks the data first: a known key, or any key whose head is a known program prefix, returns true *before* NOT_KEYS is consulted. NOT_KEYS only exempts the "new 2-5 letter program, one dot" guess.
- No sample (`programs.json`, `wave1.json`, `routes.json`, `fee-table.json`) has a key starting with `video`, and no IRCC program is called "video". So the only effect is that `video.<x>` strings are no longer guessed to be a new program, and the only such strings are the two audit actions in `service.ts` (lines 129-130).
- This follows the "audit" precedent (AUD-4) and has a comment. The shrink-only ALLOW list is unchanged. `PROGRAM`, `FORM` and `SLICE` are untouched.

## Suites (re-run here, commit ec24f5241, builder ports +14000)
| Suite | Result |
|---|---|
| check_fo3v_video.ts | 33 passed, 0 failed |
| check_fo1a_sales_schema.ts | 124 passed, 0 failed |
| check_b164_no_engine_keys.ts | 67 passed, 0 failed |
| check_pf28_inputs.ts | 51/51 passed |

## Findings
None at Blocker, Major or Minor.

VERDICT: Approve
