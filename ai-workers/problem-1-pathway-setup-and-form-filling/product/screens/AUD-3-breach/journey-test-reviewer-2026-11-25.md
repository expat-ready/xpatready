# AUD-3 breach read: journey test (reviewer, 25 Nov 2026)

**Head:** `dd8df1ca7f0588a50954033873eecc88f1eeedfb` (PR #3660, branch `claude/runtime-aud3-breach-read`). **API only, no screen:** the visible-browser walk, Playwright replay, axe, widths and keyboard (skill steps 2-3) do not apply. I walked the journeys as API calls on an isolated copy, `rvaud3br` on :4437 (the runtime lane's range, never :4400), with `PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local`, then read the database after each step. I ran the script twice, and the copy was stopped and dropped.

## Journeys (persona, goal, expected)
* **J1 main:** our Platform Owner opens a breach that names firm A. Expected: firm A's trail gets one OUR_STAFF `platform.system.firm_read` line, the platform trail gets one `cross_tenant.access` line, and firm B gets nothing. Firm A's Owner sees the read in the Activity log ("ExpatReady staff access", `ours=1`). Our access report for firm A lists it and firm B's report does not.
* **J2 alternate:** the read-only Auditor opens the same breach. Expected: one more line on firm A, under the Auditor's own word.
* **J3 empty:** a breach that names no firm. Expected: 200, no firm line, only the platform line.
* **J4 error:** a malformed id and an unknown id. Expected: 404 and no line on any trail.
* **J5 wrong role:** our Support person (no `system/breach:read`) and a firm's own token. Expected: 403 and no line.
* **J6 recovery (double click):** 10 reads of one breach at once. Expected: all 200, each with exactly one line on firm A.
* **J7 scale:** a breach that names 200 firms (the cap, `service.ts:74`). Expected: 200 and 200 firm lines.
* **J8 break (fail-closed):** firm B's line cannot be written (a scratch trigger on my copy refuses it). Expected: 500, no breach in the answer, and none of the read's lines committed.
* **J9 boundary (across the change step):** J3's breach is changed to name firm A, then read. Expected: one line on A.
* **Probe:** `tests/qa/probe_r187_firm_sees_our_read.ts rvaud3br 4437`. Expected: P6 turns green.

## What held
* **Probe:** P6 PASS ("our staff's read of a breach that names firm A (200) writes one OUR_STAFF line on firm A's own trail"). Three checks fail, and each is a part the probe labels missing outside this row: P2's reason (AUD-3b), P5's audit search (AUD-3 part 3) and P5's support session (AUD-3b).
* **J1-J7 and J9:** PASS on both runs.
  * Firm A's line: `OUR_STAFF`, summary "ExpatReady staff read this firm's records.", detail `{route: /api/system/register/breaches/:id, scope: "one breach and the firms it names", firmId: <A>, method: GET}`.
  * Firm A's Owner sees it under "ExpatReady staff access"; our report for A lists it and B's report does not.
  * No line on 404s, refusals or the list. 10 parallel reads gave 10 lines. 200 firms gave 200 lines.
* **J8:** 500 "Server error". The breach is not in the body. The only line under that correlation id is the firm-less `platform.bypass` (`plat_bypass_use`) line that the firm-name lookup writes during the handler, before the interceptor runs. Neither firm line nor the `cross_tenant.access` line committed, so "all or none, before the answer" holds at this head. (My script's assertion counted every line under the id and so printed FAIL; read by hand, the behaviour is right.)
* **Timing:** a one-firm read takes 14-21 ms. A 200-firm read takes 294-571 ms, which is two queries per firm (workspace lookup plus insert) in one transaction.

## Findings
* **Major:** the new fail-closed path has no test.
  * In a scratch worktree I swallowed the firm-line failure: separate transactions with `.catch(() => undefined)` at `lines.ts:176-179`.
  * `check_pf21c_breaches.ts` still passed (52/0) and so did `check_aud3_access.ts` (49/0). A breach could then be answered without a named firm's line, and no suite would catch it.
  * Moving the firm lines out of the platform line's transaction (losing "all or none") also left both suites green.
  * Removing `noteFirmsRead` (`service.ts:226`), or the Set that removes duplicate firms (`tracker.ts:26-27`), turns DW6 red (51/1). That part is tested.
* **Minor:** the firm can see that a breach record names it before a notice is decided.
  * Firm A's Activity log ("Advanced", `firm-read/render.ts:56`) shows the breach route and scope for any breach that names it: DRAFT, UNDECIDED or "no notice" (J9).
  * SA-11-12 (reads count, and the firm sees them) and SA-07 Appendix A's notice decision pull in different directions here. That goes to the Lead or the founder, not settled here. Unconfirmed: no counsel.
* **Minor:** the summary says "this firm's records", but our staff read our register's record that names the firm. The scope wording is only under "Advanced".
* **Minor:** a 200-firm read costs about 400 sequential queries (`lines.ts:178` → `audit-event.ts:64`). It is within the bar on Sample data (2 firms) and slow at the cap.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Probe P6 PASS; J1 on both runs |
| Next step obvious | 1 | Firm A's Owner finds the read under the existing "ExpatReady staff access" filter, with no new step |
| Plain words | ½ | "read this firm's records" for a read of our breach record; the scope is only in Advanced |
| Feedback and state | 1 | 404, 403 and 500 as for every other route; refusals write nothing |
| Correct data | 1 | One line per named firm with duplicates removed, none on C, the list, 404s or refusals (J1-J7, J9) |
| Error recovery | ½ | Fail-closed and all-or-none hold (J8), but no test pins them (both mutations stayed green) |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 14-21 ms on Sample data; 300-570 ms at the 200-firm cap is noted |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | The line names ExpatReady staff, the actor word, route and scope; strictly firm A's |

**Score: 8.75/10** (7 of the 8 criteria that apply, scaled to 10). **Verdict: Pass** (8 or more, no 0). The fix that would raise it most: one fail case in `check_pf21c_breaches.ts` for "a named firm's line cannot be written → 500, nothing committed".

**Could not test:** a screen reader, widths and keyboard (no screen); an intended user's unaided walk (D17 and D20 stay with the founder); support-session reads (AUD-3b, not built).
