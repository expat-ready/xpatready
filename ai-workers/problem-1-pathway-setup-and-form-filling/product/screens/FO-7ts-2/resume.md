# Resume note — money chain lane (FO-7ts / FO-7lk), on hold

Written 19 Nov ~03:0x UTC (08:3x IST), on Build Lead C's word (P-719, Lead 86's ruling): finish FO-7ts part 2 to its PR, then **hold**. Don't start part 3 until the Lead restarts R1.59.

## Where things are
| Row | PR | Branch | Head | State |
|---|---|---|---|---|
| FO-7ts part 1 | #2106 | `claude/awesome-allen-009z29` | ae7cc15f | merged 18 Nov 22:26 UTC |
| FO-7lk | #2175 | `claude/trusting-fermat-ejsqdh` | df2a46ae | merged 19 Nov 02:25 UTC |
| FO-7ts part 2 | #2204 | `claude/trusting-fermat-ejsqdh-fo7ts2` | this branch | open, non-draft. Reviewer: Approve and Breaker: pass on cbdf08a1, round 6. See "Open questions" for what it waits on. |

Records for part 2 are in this folder: `build-notes.md`, `review.md` and `break-report.md` (rounds 1-6).

## Next step when the Lead restarts R1.59
**FO-7ts part 3**, from `product/design/build-lead-c-briefs/FO-7ts-3.md` on `claude/build-lead-c-647b40`. Its scope, from the draft `product/design/briefs/FO-7ts.md`: the trust refund's details, the tax treatment, the same-matter pick and the newest-issued index.

1. Branch from `origin/main` after #2204 merges. `client-money.prisma` and the migration baton are free then.
2. Stamp the migration later than `main`'s newest, which will be `20261118220000_fo7ts_ledgers`.
3. Opus reviewer and breaker at high effort (P-608). The tech lead reads the pick guard before starting and before the label (P-423).

## Open questions (on #2204)
* **Size exception (P-610):** 876 changed lines, as CI counts them. `pr-rules` is red only for size. Lead 86 rules on the PR: if granted, add `Size exception: P-NNN` to the PR body (a body edit re-runs the check, no push needed); if refused, split it into the pair and the credit ledger.
* **The tech lead's P-423 read and the label.**
* **Breaker findings outside this row, for the tech lead:**
  * B13 / N6: an invoice already paid by credit can still be paid from trust, credited or written off (a Code s. 32 reading);
  * B15: saving a draft's line and then applying credit in one transaction can deadlock;
  * B11b: any party on a case may refund that case's credit (a route rule);
  * L5: a draft that ever held credit stays pinned;
  * two invoices saved in crossed order can deadlock.

## Environment notes (cloud)
* PostgreSQL stops when the container restarts. Start it with `pg_ctl -D <repo>/.tools/solution-1-prototype/pg18-data -l <same>/server.log -w start`.
* Run the tests with `./node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/<file>.ts` from the studio folder. Without `--tsconfig`, the PF-12 API-start cases fail on decorators.
