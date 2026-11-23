# PF-17 part 1: journey test (reviewer role), 23 Nov 2026

Commit cb761f977792f5621c406bc41d8a4c3d7f133eed. This part is an API only; the console screens come in part 4. So I walked the journeys through the real Nest app (the suite's own harness: PF-4s's system sign-in, its guard, FirmWallsInterceptor, and the real controller and service) against a scratch database on 127.0.0.1:54329. Port 4400 was not used. Data was read with psql. The probe script is in the reviewer's scratchpad (`probe.mts`) and is not committed.

## Journeys
| # | Persona · goal | Steps | Result |
|---|---|---|---|
| J1 | Support staff: "which firms need us today?" | Sign in (local, second step) → `GET /api/system/firms` | 200, 2 Sample firms, each with status, plan, subscription, last sign-in, 4 usage rows and health. Held. |
| J2 | Support: "show me only the ones in trouble" | `?health=ATTENTION` | Only Solo (2 of 1 seats, "seats over the limit"). Held. |
| J3 | Billing: "open firm A" | `GET /api/system/firms/<A>` | Same figures as the list row and as PF-15's own reads. One line on firm A's trail; one PF-4s line. Held. |
| J4 | Auditor: "is a held firm visible as held?" | Firm set to PAYMENT_HOLD → open | HELD, "on payment hold" first, the seat reason kept. Back to OK once fixed. Held. |
| J5 | Admin with 55 firms: "page through" | Page 1, then `?page=2`; `?q=paging firm 007` | 50 + 5, no firm on both pages, the ATTENTION firm first; the name search finds 1. Held. 322 ms per list call (m1). |
| J6 | Wrong role: Content publisher; firm staff | List and one firm | 403 for both; no token: 401; a forged `system` claim: 401. Held. |
| J7 | Error: bad id, bad query | `/firms/not-a-firm`, an unknown uuid, `%00`, an encoded `../`; `?health=SICK`, `?page=0`, `?sort=name`, a repeated `health` | 404 "No such firm." for every id; 422 FIRMS_QUERY with the field named; never 500. Held. |
| J8 | Recovery: reload, odd paths | Mixed case `/API/System/Firms`, a trailing slash, HEAD | Same answer (200); each call audited once. Held. |
| — | Across the boundary | Part 4's screens | Not built (part 4): not walked. |

## Break-it (15 min)
* A SQL-looking `?q` and id: 0 rows and 404. A Unicode `?q`: 200, 0 rows. `?page=99999`: empty page. `?q[a]=1`: 422.
* A DELETED firm reads `health: "OK"`, with plan null and every limit at 0 (review m2).
* Any other route reaching the uses: refused (`BypassRefused`, DW6).
* `tests/check_bypass_uses.ts` goes red, because the uses are on the frozen list (review B1). This does not change any journey's outcome.

## Data underneath
* The audit counts before and after each call: one `plat_system_audit` line per call, refusals included.
* The list call: one firm-less `platform.bypass` line and nothing on firm trails.
* Opening one firm: +1 line on that firm's trail only.
* The figures equal `seatsUsed`, `limitOf`, `usedBytes` and `PgCaseCount` for the same firm.
* No write besides the audit lines.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J5: list, filter, open, page; every figure correct. |
| Next step obvious | ½ | The reasons say what is wrong ("seats over the limit", "payment overdue") but not what to do; the actions are part 3. |
| Plain words | 1 | "No such firm.", "Check the highlighted fields", "trial ends within 3 days". |
| Feedback and state | 1 | Health plus reasons, `total`, `page` and `pageSize` on every list. |
| Correct data | ½ | Equal to PF-15's reads (DW2, J3). But a deleted or abandoned firm reads OK (m2), and the clock is not PlatformClock (m5). |
| Error recovery | 1 | 404 and 422 in plain words, the field named, never 500 (J7). |
| Accessibility and sizes | N/A | No screen in part 1 (part 4). |
| Speed | ½ | Sample data 17-95 ms per call; 55 firms 322 ms and one transaction across every firm's reads (m1; STANDARDS §9: < 200 ms, no request per row). |
| Visual quality | N/A | No screen in part 1 (part 4). |
| Trust and sources | 1 | The 3-day and 50 values are labelled Sample; the figures' origin is PF-15's reads; every call is audited. |

**Score: 6.5 of the 8 applicable criteria, which scales to 8.1 / 10, given as 8 / 10. No criterion is at 0, so it passes as a journey.** The review still blocks on B1, because an existing CI suite goes red at this commit.

Fixes that raise the low scores, most valuable first:
1. Take `usedBytes` out of the list's transaction, or record that it is accepted (m1).
2. Give a deleted, abandoned or no-plan firm a plain reason (m2), and use PlatformClock (m5).
3. Part 4: show the next action beside each reason.

Not tested: a real screen reader, widths and zoom (no page yet); an intended user's unaided walk (D17 and D20 stay with the founder); a real S3 bucket.
