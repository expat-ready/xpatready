# PF-0c journey test (reviewer, 15 Nov 2026, head 6358be56)

PF-0c has no screen. The "people" here are builders and CI, and the product is the guard (`tools/check-port-contracts.mjs`) plus the shared contracts. So each journey was walked as that person would meet it: run the tool, read its output, change a file, run it again.

- **Way of walking:** I copied `ports/`, `tests/` and `api/src` to a scratch tree and called the guard on it. The real tree was never edited.
- **Not run:** the browser, axe, screen-size and Playwright steps, because there is no UI.

## Journeys
| # | Person, goal | Steps | Expected | What happened |
|---|---|---|---|---|
| J0 | Builder: "is the tree clean?" | `node tools/check-port-contracts.mjs`, then `--list` | 0 problems, under 10 s; the list shows each port, adapter and test file | 0 problems, 646 ms (0.69 s wall); 9 ports and 19 adapters listed with their test files. Held |
| J1 | Builder adding the first real MailPort (`export class SesMail implements MailPort`) | Add the file, run the guard | Fails, saying which contract file and export to add | `MailPort … has a real adapter (SesMail) and no contract: add ports/contracts/mail-port.contract.ts exporting mailPortContract`. Held |
| J2 | Same builder, class not exported, behind `export const sesMail = () => new SesMail()` | Add the file, run the guard | Fails (ruling 3: "a class with implements") | **`[]`: passes.** Review M2 |
| J3 | Same builder, function adapter `export function sesMail(r): MailPort` | Add the file, run the guard | Fails | Fails with the same clear message. Held |
| J4 | Builder deletes LogAlerts' contract call (it stays only in a comment) | Edit the test, run the guard | Both adapters named, with the line to add | Both named, each with ``add `await runContract(alertPortContract, "LogAlerts", …)` ``. Held |
| J5 | Builder whose JobPort adapter runs a keyed job twice | Run the contract | Red on "a keyed job runs once" | DW3 is red. My own variant, which answers `queued: false` but still runs twice, is also red. Held |
| J6 | AUD-1 builder whose adapter replaces a record's earlier audit line | Run the audit contract | Red on "the trail only grows" | **Green, 5 of 5.** Review M1 |
| J7 | CI without AWS credentials | Run check_pf4 | Cognito NOT TESTED; it never adds to the pass count | `NOT TESTED  PF-0c DW2 IdentityPort CognitoIdentity: no AWS credentials (never counted green, P-405)`; the total stays 118/118. Held |
| J8 | Release holder reads the CI step (P-423) | Read the proposed YAML | Part 1 only; red on failure; time printed | Correct as text. It is not in ci.yml at this head (review C1) |

## Data underneath
- Every suite was re-run, and every PF-0c line was read in its output (see review.md, "Named tests").
- The scratch tree and databases were left as the suites leave them. Isolated copies `pf4` and `pf23rev` were stopped.

## Break it
- **Mutants:** an audit upsert (passes: M1), a no-op `recurring` (passes: m1), a withdrawal that ignores its time (caught), and queued:false with a double run (caught).
- **Guard fixtures:** these slip through the guard (m4):
  - a `/*` inside a regex literal hides the adapter after it;
  - a wrapper adapter taking its own port;
  - `satisfies`;
  - a call inside a string or `if (false)`.

  A quote inside a regex literal and an `export default class` are read correctly.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1, J3, J4 and J5 held. J2 lets a real adapter through without a contract |
| Next step obvious | 1 | Every failure names the file, the export or the exact `runContract` line to add (J1, J4) |
| Plain words | 1 | One sentence per problem; the per-case lines name the rule (`a key is write-once …`) |
| Feedback and state | 1 | One line per case and one per adapter (`7 of 7 cases`); the ms is printed; NOT TESTED has its own line |
| Correct data | ½ | Contracts pass on all 18 adapters run. The append-only case is vacuous (J6) |
| Error recovery | 1 | Fixing the reported problem turns the guard green (the self-test's pass/fail pair; J4 reversed) |
| Accessibility and screen sizes | N/A | No UI |
| Speed | 1 | Guard 0.35-0.65 s against a 10 s limit. check_pf14 goes from about 83 s to about 2 min (PlatformJobs on the wall clock; raised as Q6) |
| Visual quality | N/A | No UI |
| Trust and sources | 1 | Cognito is never green (J7); each contract cites its port's sentences; uncertain points are in the PR's Questions |

**7 of 8 applicable = 8.8/10. Pass (8 or more, no 0).**

Fixes that would raise the low criteria, most valuable first:
1. M2: let the guard accept a non-exported class, which raises "task completed".
2. M1: write both audit lines under the same entityKey, which raises "correct data".

Not tested: CognitoIdentity for real (PF-4b), the CI run (no step on this head), and an intended user's unaided walk (D17/D20 stay with the founder).
