# Journey test (reviewer): FO-9b part 2b, the merge by itself at arrival

* Reviewer: Opus 5.5, independent. Date: 24 Nov 2026.
* Commit: `ed63b3ab7783121c294a1a46b84d7bbaa7083fc9`.
* Copies: isolated copies on the runtime ports 4436-4439, never :4400.
* Values: all Sample. Cost: US$0, live AI off.
* Scope: API only. The automatic merge has no screen of its own; the Merged tab is FO-9s part 2, which is not built. So the journeys are walked through the doors' own screens (j_28, j_33, FO-4al) and the data underneath.

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| 1 (main) | A visitor enquires, then books. The firm wants one record. | Web form with email E, then booking page with the same E, tick on (j_28 W2) | Booking commits; seconds later the booking's person is merged into the visitor (`automatic`, `system:fo-duplicates`); both leads on the visitor; both consent rows kept | PASS (47/47) |
| 2 (alternate) | One phone in two spellings, at two doors | Web form "+44 (0)20 7946 0958", booking "0044 20 7946 0958" (j_33 W5) | One person; the lead page shows the survivor in E.164 and no possible-match line | PASS (19/19; screenshot W5-booking-lead-on-the-web-form-person-1440) |
| 3 (rule) | A person with money is never merged by itself | An invoice, a tax treatment or a trust payee row on the first record, then a repeat | Two records; the pair is To review | PASS (unit, 3 fail lines) |
| 4 (rule) | Similar name only | Same name, different emails | Listed, never merged by itself | PASS (unit) |
| 5 (error) | The earlier record is being changed | A lock held on the earlier lead, then an arrival | Arrival commits in under 2 s; the job is Busy and fails for a retry; the next try merges | PASS (unit) |
| 6 (recovery) | An arrival rolls back | Arrival thrown inside its transaction | The job finds no person and does nothing | PASS (unit) |
| 7 (staff door) | Staff choose "Add as new" for a known email | FO-4al AL3 and AL4 on the real runner | Never merged by itself (written Kept separate) | PASS: 27/27; 6 jobs completed, 0 merges, 2 KEPT_SEPARATE pairs |
| 8 (wrong firm) | Firm B gets firm A's person's email | Web form in firm B | No pair, no merge; the job runs in firm B | PASS (unit) |
| 9 (consent across the boundary) | The visitor unsubscribes after the merge | j_28 W3-W5 | Marketing blocked for the visitor, and for the merged-away record (`ADDRESS_UNSUBSCRIBED`) | PASS |

## Break-it (15 min)
* **Redelivery after an Undo (Minor, m1 in review.md).**
  * Steps: the job merged two arrivals; R undid it (`{"restored":true}`, pair OPEN); the same job ran again (`attempt: 2`).
  * Result: merged again, with a new `mergeRef`.
  * pg-boss delivers at least once, so a worker stopped between the commit and `complete` would override a person's Undo. `at-arrival.ts:60` checks only `mergedIntoId`.
* **App closed in-process (Minor, m2).** The registered queue is never cleared (`at-arrival.ts:33`). Arrivals still commit; each one logs an error line.
* **Two arrivals at once for one email.** The `fo_sales_match` lock puts them in order. Their jobs race on the survivor's lock: one is Busy and retries 30 s later. No double merge, because the key is used once per person.
* **Hand-added lead.** Through the real route, an exact match is a 409 or "Add as new" (Kept separate). The unit line's MANUAL merge runs only by calling `arrive()` directly (m3).
* **Known, not from this row.** `qa/check_r133_phone_doors_http` E3 fails as open QA-540 (the edit route).

## Score (0, ½ or 1 each)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1 and 2 end with one record |
| Next step obvious | 1 | A safe duplicate needs no decision; an unsafe one stays flagged ("Possible match", FO-4 DW3) |
| Plain words | 1 | Reason: "Merged by itself: exact match, no case, document or money (P-574 (2))." |
| Feedback and state | ½ | The merge lands seconds after the arrival, with no sign on the lead page; the Merged tab (FO-9s part 2) is where it will show |
| Correct data | 1 | One merge row, one `person.merged` event, one audit line; leads and consent rows on the survivor |
| Error recovery | ½ | Busy and rollback are handled; a redelivered job overrides an Undo (m1) |
| Accessibility and screen sizes | ½ | No new UI. FO-4al and FO-9s axe and widths 375/1024/1440 pass; the lead page after a merge was seen at 1440 only |
| Speed | 1 | The arrival adds one lock and one send (under 2 s with a held lock); the merge follows within the 2 s poll |
| Visual quality | 1 | The W5 screenshot is clean, team look |
| Trust and sources | 1 | `automatic`, `by` and reason are recorded; Sample labels kept |

**Score: 8.5 / 10. Pass** (8 or more, no 0).

To raise it:
1. Guard the job against re-merging after an Undo (m1).
2. Check the lead page after a merge at 1024 px and 200 % zoom when FO-9s part 2 lands.

## Could not test
* A real pg-boss crash and redelivery (simulated with `run()`).
* A screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* Several API instances.

## Round 2 (commit e65760efd, diff only)
* Re-walked on the runtime ports: j_28 on :4438 passed 48/48. W2 now keeps the visitor and the booking apart (the booking carries a consent); the job completed and the pair is To review. j_33 on :4439 passed 20/20. W5 keeps two emails on one phone apart, and the lead page shows "Possible match".
* What held: a retry after Undo never merges again; "Add as new" is never merged; a consent-carrying arrival waits for a person, and its savepoint leaves no row behind; 12 concurrent arrivals become 1 record; a 4 s queue returns the arrival in 2,036 ms.
* Break-it: a phone-only person gets a stranger's email (Blocker B1-r). An arrival carrying Bea's email and Ada's phone joins Ada and Bea into one record (Major M-r1). Old OPEN pairs are merged by a later arrival (Minor m-r3). Details are in `review.md` Round 2.
* Score changes: Correct data 1 → ½ (B1-r, M-r1). Error recovery stays ½: Undo now holds, but a wrong join by itself is shown to no one. The other criteria are unchanged.
* **Score: 8.0 / 10.** That meets the score's pass rule, but the review verdict is Block because of B1-r. To raise it, fix B1-r and M-r1 (Correct data back to 1).

## Round 3 (commit 628b26e9d, diff only)
* I re-walked on the runtime ports.
  * j_28 on :4438 passed 48/48. In W2 the visitor and the booking stay apart, the job completed and the pair is To review.
  * j_33 on :4439 passed 20/20. In W5 two emails on one phone stay apart, and the lead page shows "Possible match".
  * The screenshots were put back.
* What held:
  * A phone-only person is no longer given a stranger's email (NEW_CONTACT; Vera's line is red when it is removed).
  * Ada, Bea and Zed stay 3 records.
  * A burst still becomes 1 record, and its line now goes red without the follow-up.
  * A pair left from yesterday stays.
  * The 2 s bound and the shutdown hook each have a fail line.
* Break-it:
  * The burst window gives 1 or 2 records at random: 8 of 16 trials each (m-r3-1).
  * A stranger can fill an empty last name (m-r3-3).
  * Unreadable phones skip the conflict check (m-r3-4).
  * The CI type check fails at `at-arrival.ts:113` (M-r3-1). This is not a user-facing fault.
  * Details are in `review.md` Round 3.
* Score changes: Correct data ½ → 1. Error recovery stays ½: nobody is told about a merge made by itself. The other criteria are unchanged.
* **Score: 8.5 / 10, pass.** To raise it, show the automatic merge where a person sees it (FO-9s part 2; Error recovery and Feedback).
