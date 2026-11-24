# Journey test (reviewer): M2 no array batch (PR #3441), head 4461c363b118b14f33444068b1ed8ddeeead5f43, 24 Nov

The diff has no screen, route or wording. It changes how every interactive transaction on the app's client is started, so the journeys are the user actions that go through the changed code. I ran them as API journeys on isolated copies (real `main.ts`, :4431 to :4433, never :4400) and as scratch-database probes, and checked the data underneath. I walked no browser.

## Journeys
| # | Persona and goal | Steps | Expected | Head 4461c363b |
|---|---|---|---|---|
| J1 | Firm Owner: "update our public phone, email, website, time zone and currency" | `check_r192_firm_profile.ts` P2 (one save, read back) | Saved, one audit line per changed key | **500**. The audit count per key is `[1,0,0,0,0]`, so one key was committed while the response says the save failed |
| J2 | Owner saves the same again (recovery) | r192 P2 fail case | Nothing changes, no line | **500 again** |
| J3 | Admin changes the website | r192 P4 | Saved, audited as the Admin | **500** |
| J4 | Firm B's Owner saves | r192 F1 | Firm B changes, firm A untouched | **500** |
| J5 | Staff member opens their availability for the first time | probe: the person's advisory lock, then `copyFirmHoursTo(tx)` (availability.ts:263-265) | Normal hours copied | **Fails after 5012 ms** (self-deadlock) |
| J6 | Author reorders a section in the questionnaire | `check_c41_section_order.ts` | Order saved | 32/32 |
| J7 | Author reorders names in the structure | `check_w1_structure.ts` | Order saved | 81/81 |
| J8 | Case officer prepares a case with a recorded filing | `check_bk17_keep_recorded.ts` | Recorded filing kept, one snapshot | 25/25 |
| J9 | Firm B's request runs while firm A's is in flight | `check_no_array_tx.ts` | Never A's rows | 10/10 (red 4/6 on d33cb8de8) |

With d33cb8de8's `firm-scope.ts`, J1 to J4 pass (r192 58/58) and J5 copies 5 windows in 25 ms. With the review's B1 fix applied, J1 to J5 pass and J9 stays 10/10.

## Data underneath
- J1: `platform_firm_setting` and `audit_event` keep a change that the user was told failed, so they are no longer all-or-none.
- Probe (a): `writeSetting(tx)` and then a failing outer transaction leaves 1 row at the head and 0 on base.

## Break-it (15 min)
- I tried `tx.$transaction([...])`, a Proxy-wrapped array and `.call` on another receiver: all are refused.
- An array-like object with `map` would still pass `Array.isArray`'s check (review m1).
- Two firms at once on interactive transactions: each stays in its own firm (J9).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 0 | J1, J3, J4 and J5 fail |
| Next step obvious | ½ | The 500 says "refresh and try again", and retrying fails (J2) |
| Plain words | 1 | The M2 refusal and the problem texts are plain; no wording changed |
| Feedback and state | 0 | J1 reports failure while one key was saved |
| Correct data | 0 | Partial write (J1, probe a) |
| Error recovery | ½ | Retry fails, but nothing is corrupted across firms |
| Accessibility and screen sizes | 1 | No UI change in the diff; unchanged from the approved base (not walked) |
| Speed | 0 | J5 waits 5 s and then fails |
| Visual quality | 1 | No UI change (not walked) |
| Trust and sources | 1 | No AI or source display touched |

**Score: 5/10, fail (below 8, with four 0s).** The most valuable fix is B1 in `review.md` (keep `this` in the override): it restores J1 to J5, which were checked at 58/58 and green.

Not tested: a real screen reader, a browser walk, the intended users' unaided walk (D17/D20 stay with the founder), and the branding, timings and batch-decision journeys end to end (reasoned from the same cause; probe b covers the lock pattern).

## Round 2, head 078ebab5dad1c6c939e0a7340e6e8121ba491175 (24 Nov 13:43 IST)

These are the same journeys, re-run through `run-suites.sh` isolated copies (runtime ports +14000, never :4400) and scratch-database probes. I walked no browser, because the diff has no screen.

| # | Journey | Round 2 result |
|---|---|---|
| J1-J4 | Owner, Admin and firm B save the firm profile, plus the retry | `check_r192_firm_profile` **58/58** (round 1: 48/58, 500 with a partial write) |
| J5 | First availability read (advisory lock, then the nested copy of the hours) | `check_fo3a_hours_timings` 47/0. Probe: a nested call keeps the outer pid and txid, so the lock is the same session's (no self-deadlock) |
| J5b | Branding save; batch decision of marks | `check_pf13_branding` 30/0; `check_forms_qa193_batch_mark` 18/18 |
| J8 | Case officer prepares a case (the renamed snapshot client) | `check_bk17_keep_recorded` 25/25 |
| J9 | Firm B's request while firm A's is in flight | `check_no_array_tx` 14/0 |

**Data underneath:** the outer transaction fails after a nested write, and 0 rows are left (suite case and probe). Refused batches (array, array-like, iterator, `Set`, `undefined`, promise) write nothing.

**Break-it:** the `$extends` client's transaction keeps its extension and nests. A detached `$transaction` throws, as plain Prisma does (no such use in api/src). Reverting the m1 condition goes unnoticed by the suite (review m5).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1-J5, J8 and J9 pass |
| Next step obvious | 1 | The saves succeed; no unexplained 500 is left |
| Plain words | 1 | The M2 message is unchanged and plain |
| Feedback and state | 1 | No save reports a failure while keeping a part |
| Correct data | 1 | Nested writes are all-or-none with the outer transaction |
| Error recovery | 1 | A refusal fails closed before anything runs |
| Accessibility and screen sizes | 1 | No UI change (not walked) |
| Speed | 1 | The 5 s hang is gone (fo3a 22 s for the whole suite) |
| Visual quality | 1 | No UI change (not walked) |
| Trust and sources | 1 | No AI or source display touched |

**Score: 10/10, pass.** Not tested: a browser walk, a real screen reader, or an intended user's unaided walk (D17/D20 stay with the founder).
