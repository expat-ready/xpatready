# Review: PF-4s sole Owner after the race (QA-755, test-only)

Branch `claude/screens-pf4s-sole-owner`, head `f2523afcf20c62c5f8c44149cf50172538c1222d` (test-first commit `cf18dcb89`). Row: Lead 18, newest comment on #3202, 24 Nov. Diff `origin/main...f2523afcf`: one file, `prototype/studio/tests/check_pf4s_system_signin.ts` (+13 −1). No product code. Reviewer session, fresh context. The check runs in one process on its own scratch database at 127.0.0.1:54329 (no app copy, never :4400), US$0. This is the screen-review skill scaled to a test-only diff. PF-4s has no screen, so D1–D20 and the BIC table do not apply here. The graph was not run, because this check writes only this file.

**Verdict: Ship (Approve).** No Blocker, no Major, no Must. Two Minor items (Should, optional) and one Nit.

## What I ran (from `prototype/`, `npx tsx --tsconfig studio/api/tsconfig.json …`)
| Run | Result |
|---|---|
| Head file, `PF4S_FORCE_SOLE_OWNER=OWNER2` | **104/104**, exit 0, `forced: OWNER2 …` |
| Head file, `PF4S_FORCE_SOLE_OWNER=OWNER` | **104/104**, exit 0 |
| Head file, no variable | **104/104**, exit 0 |
| `cf18dcb89`'s file (scratch copy, imports pointed at the branch's `studio/`), forced OWNER2 | **103/104**, exit 1: `FAIL … (PF-28) … "POST /api/system/staff: unknown 403 (+1 MISSING_PERMISSION), wrong type 403"`, then the same for the other five routes. This is the batch #3364 symptom. |
| `cf18dcb89`'s file, forced OWNER | 104/104 |
| Instrumented scratch copy of the head, 6 runs (2 forced each way, 2 plain) | the real race went to **OWNER every time** locally (OWNER2's call refused 409 ROLES_CHANGED). After the hook: the named person is `soleOwner`, each Owner has exactly one platform-owner grant row, and the open Owner grants are the named person plus GONE (deactivated, excluded by the `ACTIVE` join). |
| Same copy with the two `Promise.all` calls swapped, so **OWNER2 wins naturally** (no hook) | fixed line: 104/104. Old line (`signedNow(OWNER)`): **103/104, the same PF-28 403**. With forced OWNER on this order, the hook's other swap path ran (OWNER2 → OWNER) and gave 104/104. |

So the red is shown twice: once by the builder's hook, and once by a natural OWNER2 win that does not use the hook. The forced state and the natural state hold the same grant facts. Scratch files are in the session scratchpad only. Each run's database was dropped by the file's own `finally`.

## The questions
1. **Is the cause right? Yes.** The race at `:446-447` has OWNER and OWNER2 each removing the other's Owner role. Under `pg_advisory_xact_lock` (`api/src/platform/system-identity/staff.ts:48`) the first one in wins. The second gets 409 `ROLES_CHANGED` (its own roles were re-read under the lock, `:52`) or `LAST_OWNER` (`:84-86`). Either sender can be first. `:466` reads the survivor as `soleOwner`, and `:468` already signs it in. The old `:477` signed in `OWNER`. When OWNER2 won, OWNER had no open grant, so the guard refused with `MISSING_PERMISSION` before checking the body (`guard.ts:114,120`), which gives 403 instead of 422. Locally OWNER always wins, because its call is sent first. That explains why it only showed up in a busy CI batch.
2. **Is the hook faithful? Yes, for everything the rest of the file reads.**
   - It runs **after** the race's own `ok(…)` (`:448-451`), so it cannot hide a race failure. `owners === 1`, `200,409` and `lines() - before2 === 2` are judged on the real outcome.
   - Unique index `plat_system_role_grant_open_once` (`(staff_id, role_code) WHERE ended_at IS NULL`, migration `20261122060000…:120`): the reopen runs only when the named person has no open Owner grant (`:458`). The other person's grant is closed first. So two open rows can never exist. `order by ended_at desc` cannot pick a NULL, because the guard at `:458` rules NULLs out. It picks the grant the race just closed.
   - Check `plat_system_role_grant_ends_later`: `ended_at = now()` is the database's wall time. That is at or after `granted_at` (column default at creation). It holds.
   - Sessions: removing a role does not end the target's sessions (`staff.ts:112-114`, no `endSessions`). So neither the real race nor the swap touches `sessionsEndedAt`, and every later sign-in is a fresh `signedNow`.
   - Audit: the swap writes no line, and `plat_system_audit` is insert-only, which is untouched. In a forced run, the race's two lines name the real winner, not the forced one. No later check reads those lines. They only count deltas through `one()` and `lines()`.
   - No triggers on `plat_system_role_grant`. Row-level security passes, because the `xr_studio` psql session has no firm.
3. **Does any later use of OWNER still assume an Owner? No.** After `:446`, `OWNER` appears only in the race itself (`:446-447`) and the hook (`:457`). `:468` (`o4`) and `:489` (`ow`) use `soleOwner`. OWNER3 (`:471`) is its own new Owner, deactivated on purpose. AUD-3a uses ADMIN, and DW8 uses the firm token. The `owner` token from `:137` and `o` are not used after the race.
4. **Is anything weakened? No.** The fix changes one argument (`OWNER` → `soleOwner`). Every assertion text and condition is byte-identical to main. The hook only moves state after an assertion. It adds no `ok` lines, and the count stays 104.
5. **Is the env hook acceptable? Yes.** It is opt-in, inert when unset (CI does not set it), limited to two literal values, and explained in place (`:452-454`). It is the only way to run the OWNER2 outcome on demand, because the plain run locally always gives OWNER. It touches only the check's own scratch database.

## Issues (ranked)
1. **Minor (Should, optional): the hook does not prove it worked.** `:463` prints `forced: X is the one active Owner` whether or not the swap took effect, and nothing compares `soleOwner` with `want`. If the swap ever failed to move the grant (a future schema change, say), a "forced OWNER2" run would quietly run the OWNER outcome and pass, and the proof would be wrong. Fix: after `:466`, when `forced` is set, add `if (soleOwner !== want) throw new Error(…)`. Alternatively, print the line only after checking. A throw adds no `ok`, so the count stays 104.
2. **Minor (Should, optional): the usage line does not mention the variable.** The header (`:8`) gives one run line. Adding the two forced forms there would let the next person repeat the proof without reading `:452`.
3. **Nit:** the swap's `ended_at = now()` is wall time, while the race's `ended_at` is the check's clock, which can be minutes ahead. So in a forced run the grant history is not in clock order. Nothing reads it.

No Blocker, no Major, no Must.

## Journey test (reviewer, scaled: an API flow with no screen): **8 / 10, pass**
Person: a Platform Owner at ExpatReady, with a second Owner. Goal: "If the two of us remove each other at the same moment, one of us stays Owner, and whoever stays can still run staff access, with bad requests refused." I walked it through the check's own HTTP calls, in both orders (natural OWNER win, natural OWNER2 win via the swapped scratch copy, and both forced):
- One call is 200 and the other 409 with "Your roles changed while this was being sent. Nothing was saved; try again." Exactly one active Owner remains, with two audit lines.
- Whoever is left signs in again, and all six staff routes answer an unknown field with 422 naming it and a wrong type with 422, each writing one REFUSED `INVALID` line. Staff count is unchanged.
- Break: with the old line, the loser is asked to act, and the server refuses with 403 `MISSING_PERMISSION` (authorisation enforced on the server).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | survivor manages staff in both orders (104/104 ×5 runs) |
| Next step obvious | ½ | the 409 says "try again"; no screen exists to show it |
| Plain words | 1 | ROLES_CHANGED and LAST_OWNER messages (`staff.ts:52,86`) |
| Feedback and state | 1 | a code on every refusal, one audit line each |
| Correct data | 1 | one active Owner, one grant row each, staff count unchanged |
| Error recovery | 1 | loser's call saves nothing; the survivor carries on |
| Accessibility and screen sizes | ½ | no screen in this change |
| Speed | ½ | whole check about 10 s; not timed against `STANDARDS.md` §9 |
| Visual quality | ½ | no screen in this change |
| Trust and sources | 1 | audit lines name our staff; Sample names only |

## What I could not check
- Batch #3364's CI log itself. The cause is shown by mechanism and by two reproductions (hook, and a natural OWNER2 win).
- `run-suites.sh --only check_pf4s_system_signin.ts` (the builder's 104/104). I ran the file directly, five times on the head.
- A real screen reader or an intended user's walk (D17/D20): no screen here.

Reviewer: Approve f2523afcf20c62c5f8c44149cf50172538c1222d

Verdict: Approve at f2523afcf20c62c5f8c44149cf50172538c1222d
