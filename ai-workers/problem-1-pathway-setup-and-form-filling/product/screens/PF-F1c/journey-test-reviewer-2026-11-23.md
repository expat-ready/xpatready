# PF-F1c part 1 journey test (reviewer role), 23 Nov 2026

PR #3215 · commit `8c9003b5c22347218e22ca11002ea60beb22e40c`.

**Score: not applicable (no screen).** PF-F1c part 1 is infrastructure as code: AWS CDK, synthesized only, with no AWS access. It adds no page, route or user-visible behaviour, so the journey-test skill has nothing to walk:
* no persona journeys (§1–§2),
* no Playwright, axe or width replay (§3),
* no data underneath (§4).

The caller confirmed this.

## What took the journey test's place
* **Break pass (§5), on the synthesized templates:** the guards were mutated in scratch copies. Two probes (A: files grants on the migration task role; B: files grants as the service task role's inline policies) pass every estate guard. That is Major M1 in `review.md`.
* **Data check (§4), the template as data:** all four hand-over gaps are present in both stacks, and the task's files settings match what `choose.ts` and `settings.ts:69` require. `npm test`: 121 pass, exit 0.

## Not tested
* The deployed behaviour: the row's five checks in the test account, which need the founder's account.
* Any user walk. D17 and D20 stay with the founder.

Verdict: see `review.md` (Block, M1).
