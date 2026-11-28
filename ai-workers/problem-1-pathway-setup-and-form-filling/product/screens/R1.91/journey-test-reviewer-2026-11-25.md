# R1.91 part 1 — journey test (reviewer role), 25 Nov 2026, commit e134f6ecd

No screen in this part. The persona is the operator: the tech lead or a CI job readying a Stripe test account, plus the walk that relays Stripe's events. These journeys used the CLI, the suite's recorded Stripe answers, a scratch fake and a scratch database. There was no network to Stripe.

## Journeys
| # | Journey | Expected | Result |
|---|---|---|---|
| 1 | Main: first set-up on an empty test account | 3 products, 6 CAD prices, tax-exclusive; ids in `platform_plan`; portal configuration made; Smart Retries checklist line | Held (suite lines 91-99, 125-128) |
| 2 | Re-run | Nothing made, same ids | Held (suite 101-102) |
| 3 | A plan added later | Only its two prices made | Held (suite 103) |
| 4 | Error: a plan amount changed | CONFLICT named, nothing made, nothing written, exit 1 | Held (suite 105-107, 129-132) |
| 5 | Wrong key: live, `pk_`, blank, trailing space | Refused, exit 2, before any call | Held (walked on the CLI) |
| 6 | Error: Stripe unreachable | Plain words, nothing written | Nothing written, but a raw `StripeConnectionError` stack (walked) |
| 7 | Alternate: yearly price exists, monthly missing | Monthly made on the same product | **A second product made** (probe) |
| 8 | Relay main: events since the start, oldest first, once each | Signed, verified by our webhook check, never twice | Held (suite 140-172) |
| 9 | Relay recovery: route answers 500, then 200 | Kept, then delivered once | Held (suite 158-162) |
| 10 | Relay teardown: `stop()` during a pass | No more polling | **Keeps polling (4 polls after stop)** (probe) |

## Data underneath
`platform_plan` gets exactly the found or made ids, and with a conflict or a dry run it is unchanged (scratch database, suite 126-134). A found price with inclusive or unspecified tax behaviour is accepted as correct (probe): see review finding 2.

## Break it
| Attack | Result |
|---|---|
| Two polls at once | One pass (held) |
| Foreign signing secret | Refused (held) |
| An archived price under our key | Not seen (review finding 4) |
| Stale id when a period's cents go null | Kept (review finding 6) |
| Foreign events in the shared account | Relayed; firm-less audit lines (review finding 10) |

## Score
Each criterion scores 0, ½ or 1.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Set-up and relay work on recorded answers. The live proof is not run, and `stop()` is broken (J10). |
| Next step obvious | 1 | A CONFLICT says "nothing written"; checklist line printed. |
| Plain words | ½ | Refusals are plain; failures print raw stacks (J6). |
| Feedback and state | 1 | One line per price (made or found), the portal id, a count. |
| Correct data | ½ | Ids correct, but found prices' tax behaviour is unchecked and stale ids are kept. |
| Error recovery | ½ | Re-runs are safe, but a duplicate product (J7) and an archived key cause failure mid-run. |
| Accessibility and screen sizes | 1 (N/A) | No screen. |
| Speed | 1 | Suite of 32 checks in seconds; relay polls every 2 s. |
| Visual quality | 1 (N/A) | No screen. |
| Trust and sources | 1 | Sample amounts come from the plan table; the events are Stripe's own; test keys only. |

**8/10, pass on score with no 0 (6/8 on the applicable eight).** To raise the score, fix in this order: the `stop()` flag (task completed), the conflict legs (correct data), product reuse (error recovery), and a plain error line (plain words).

Could not test: live Stripe test mode, real runners in parallel, and an intended user walking it unaided (D17/D20 stay with the founder).
