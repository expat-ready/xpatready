# Resume note: money chain lane (R1.59), stopped for the P-721 proof sprint

Written 19 Nov ~05:0x UTC (10:3x IST), on Build Lead C's word: stop after the current step, do no more FO-7ts part 3 work until the Lead says so, and go idle.

## Where things are
| Row | PR | Branch | Head | State |
|---|---|---|---|---|
| FO-7ts part 1 | #2106 | `claude/awesome-allen-009z29` | ae7cc15f | merged |
| FO-7lk | #2175 | `claude/trusting-fermat-ejsqdh` | df2a46ae | merged |
| FO-7ts part 2 | #2204 | `claude/trusting-fermat-ejsqdh-fo7ts2` | 7ea0132d | open; details below |
| FO-7ts part 3 | none yet | `claude/trusting-fermat-ejsqdh-fo7ts3` | this branch (from 7ea0132d) | plan only, **no code** |

FO-7ts part 2 (#2204) in detail:
* Reviewer: Approve 7ea0132d. Breaker: pass 7ea0132d. The P-423 read is done (Lead 86).
* `pr-rules` is red until P-720 (its size exception) is on `main`, through records PR #2219.
* After that it gets its label and merges. Push to it only for a fix.

## Next step when the Lead restarts it
1. **The Lead reads the pick guard plan:** `plan.md` in this folder, with the exact SQL and two questions. That read comes before any coding, as the brief requires (P-423):
   * Question 1, the lock: a pick takes only the payer's lock, through a new unlocked invoice helper (recommended), or both locks in a fixed order.
   * Question 2: should the same party on another case need the pick columns? Recommended: no.
2. **Build part 3** from `product/design/build-lead-c-briefs/FO-7ts-3.md`:
   * trust refund details, with `CARD` and `CARD_TERMINAL` refused;
   * tax treatment, plus the freeze in `money_invoice_write`;
   * the same-case pick;
   * the `(firm_id, issued_at DESC, id)` index;
   * the tests: DW10, DW15-DW18 and DW25-DW27, and the `refunded_on` date-list line in `check_fo7a_money_schema.ts`.
3. **Reviewer and breaker,** Opus at high effort. Open the PR only after #2204 merges, then merge `main` and stamp later than `main`'s newest (`20261118220000_fo7ts_ledgers`).
4. **Then FO-7b, FO-7g and J-59 (P-719),** in that order, each branched from the previous part's approved head, one money migration open at a time.

## Environment (cloud)
* PostgreSQL stops when the container restarts. Start it with: `pg_ctl -D <repo>/.tools/solution-1-prototype/pg18-data -l <same>/server.log -w start`.
* Tests: from the studio folder, `./node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/<file>.ts`.
* This branch's worktree has a `node_modules` symlink, which is not committed (it is listed in `.git/info/exclude`).
