# Journey test (reviewer): FO-9b part 2b follow-ups, commit 518fec066eb14b4cef21eeccea7fd5760119edce

* Reviewer: independent, Opus 5.5. Date: 25 Nov 2026. API only (no screen): the doors' own paths, walked over HTTP and by the merged join-and-walk journeys.
* Copies: isolated, on the runtime ports :4436, :4437 and :4438, never :4400. Each copy's database and files were removed when it stopped. j_28 and j_33 overwrite their tracked screenshots, so I restored them with `git checkout`.
* Personas: a visitor on the firm's web form; a stranger who knows the visitor's email; the firm's staff, who read the record afterwards.

## Journeys
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| H1 (main, m-r3-3) | Cher enquires with no last name. A stranger later uses her email | Web form POST: "Cher" with her email; then "Mallory Attacker" with the same email | Merged by itself (exact email); her record still reads "Cher" with no last name | PASS: posts 201 in 44 ms and 39 ms; merged in 1.8 s; "Cher", family name empty |
| H2 (m-r3-4) | One email with two different unreadable phones | "555 0199 ext 4", then "0161 496 0000" | Both stay; the pair waits on To review | PASS: 2 live records |
| H3 (break, m-r3-4) | One email with two different phones that have no digits | "ring the bell", then "call evenings" | Both stay, as in H2 | **FAIL**: Pat merged into Pia in 1.7 s (review m1, Minor). The record on file keeps its own phone |
| H4 (alternate) | The same unreadable phone typed two ways | "555 0177 ext 9", then "555-0177 ext. 9" | One record | PASS |
| 5 (j_33 W5) | One phone in two spellings, at two doors, with two emails | j_33 on :4436 | Two records; the lead page shows "Possible match" | PASS 20/20 |
| 6 (j_28 W2) | A visitor enquires, then books with a consent tick | j_28 on :4437 | The booking carries a consent, so the two stay apart and the pair is To review | PASS 48/48 |
| 7 (tie, m-r3-1) | S has been on file since yesterday; X arrived (its job never ran); L arrives | Suite, 4 trials | L into S, then X into S: one record each time | PASS 4/4 (with the old order: 3 of 4 red) |
| 8 (slide, R3-m3) | O1, O2, O3 arrived 27, 18 and 9 minutes ago; O4 arrives | Suite | O4 and O3 join O1; O2 stays on To review | PASS |
| 9 (recovery) | A job that ran late for the oldest person of a burst | Suite probe P3 | The burst still becomes one record | PASS |

## What held
* Every merge still goes through `mergeIfSafe`'s arrival rules. In my runs, NEW_CONTACT, CONSENT, the email CONTACT_CONFLICT, Undo, "Add as new", the burst and the old-pair line all stay green.
* The order is now fixed: the outcome no longer depends on a random pair id.
* Underneath (SQL on the copy): one merge row per join; the survivor's name, email and phone are unchanged; the newcomer's values are in the snapshot only.

## Break-it
* Letter-only phones (H3): Minor m1.
* Clock: putting `new Date()` back for the run's start stays green, so that half has no fail line (Nit 2).
* An empty first name: no door writes one, and the suite has no line for it (Nit 3).
* Five repeat runs of the suite: 38/38 each, no flake.

## Score (0, ½ or 1 each)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | H1, H4 and journeys 5-9 end as written |
| Next step obvious | 1 | An unsafe pair stays flagged ("Possible match", j_33 W5) |
| Plain words | 1 | The merge reason is unchanged and plain |
| Feedback and state | ½ | A merge made by itself still shows no sign on the lead page (FO-9s part 2) |
| Correct data | 1 | Names and contact keys on the record on file never change. H3 joins two records, but the one on file is unchanged (the same grade as round 3, with m-r3-4 open then) |
| Error recovery | ½ | Undo holds, but nobody is told about a merge made by itself |
| Accessibility and screen sizes | ½ | No new UI; j_28 and j_33 were walked at 1440 px only |
| Speed | 1 | Posts answer in 23-44 ms; merges land in about 1.7 s |
| Visual quality | 1 | No UI change; the journeys' screenshots match |
| Trust and sources | 1 | `automatic`, `system:fo-duplicates` and the reason are on each merge |

**Score: 8.5 / 10. Pass** (8 or more, and no 0).

To raise it:
1. Show a merge made by itself where a person sees it (FO-9s part 2). This would raise Feedback and Error recovery.
2. Fix m1 so that H3 passes.

## Not tested
* A real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).
* Several API instances running jobs at once.
* Real skew between the app's clock and the database's.
