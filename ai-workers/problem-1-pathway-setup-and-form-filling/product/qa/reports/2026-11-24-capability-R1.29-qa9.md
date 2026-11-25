# qa capability R1.29 (qa 9), 24 Nov ~23:xx IST

Cloud qa lane qa 9 (Track A), Opus 5.5 medium, under Lead 32. Main a040b46d5 (after #3516, qa 8's trace). FO-9b part 2b is #3527 (draft, head d3d3b3eea, no migration), run here merged with main (a clean merge). Isolated copies `q9w129` (:4477, main) and `q9h3527` (:4478, #3527 + main). Live AI off, US$0.

## Verdict
**Partial, parts missing: FO-9b part 2b (#3527, draft), FO-9s parts 2-3 (no PR; concept #2896). No verdict (P-606).**

## The journey alignment (this PR, `tests/journeys/j_29.ts`; the plan in qa 8's `2026-11-24-capability-R1.29-trace.md`)
* **The ruling, as a step.** W1's "Add as new" record (Lena Parks) is now checked where the ruling puts it. Its pair is on the Kept separate tab, decided by the adder (`automatic: false`, `decidedAt` set), and never on To review (`review.ts` notePairs `addedAsNew`; FO-9b concept §8 B1; AG-2-68 rule 16).
* **OPEN pairs by the web form.** Each second record of W2-W5 arrives through the firm's published web form: `GET /api/public/forms/:token`, a wait past `minFillSeconds` (2 s), then `POST …/submissions` with the firm's own site as Origin (else 403 SITE_NOT_ALLOWED). The form is turned on with the firm's set-up consent wording (`fo_web_form_consent_check`) and an allowed site, as j_26 and j_27 do. A web-form arrival always makes a new person and writes its pairs OPEN (`sales/arrival.ts`).
  * Lena's web-form record has her name with another email and phone. It is a **name-only match**, so it is never merged by itself (`whyNotSafe` NOT_EXACT) and a person decides it, with or without part 2b.
  * Omar's has his own email in other capitals; he has money (an invoice fixture).
  * Kim's has her phone in another spelling; she has a case (a `case_client` row).
* **W4's control** (P-574 (2)): a safe exact duplicate (the same email by web form; no case, document or money) is merged by itself into the older record and shown as automatic on the Merged tab. It runs before and after the Omar and Kim arrivals, so their jobs have run when the two "never by itself" lines are read. Those lines bite once the control passes.
* **Each run has its own phone exchange.** On #3527, run 2 with fixed numbers gave 18/26: its people matched run 1's people by exact phone, and since run 1's were safe (no money, no case), part 2b correctly merged them. That was a journey fault, not a product one. Fixed, then re-run.
* Labels name FO-9b parts 1-2 as on main.

## Results (from the journey's header, `npx --prefix studio tsx`, twice each)
| Where | j_29 | Same steps both runs |
|---|---|---|
| main a040b46d5 + this journey | **22/26**, 22/26 | yes |
| #3527 d3d3b3eea merged with main + this journey | **24/26**, 24/26 | yes |

These pass on main:
* W1: the warning before Save (phone in another spelling, similar name, email in other capitals; not blocking; axe clean), and the Kept separate ruling.
* W2: Lena's web-form record arrives, and its pair is on To review with a score and reasons.
* W3: the merge keeps Lena Park and moves the leads and notes; the tombstone; one audit line with no email or phone.
* W4: the Omar pair (money) and the Kim pair (case, `needsCaseSide`) wait on To review; neither is merged (vacuous on main).
* W5: Undo from the Merged list restores both people; a second Undo is 409 in words.
* W6: 401 without a session, 403 for a Case Officer on a merge.
* W7: R1.30's first step, the Leads list with its filters.
* No page error.

These pass only with #3527: both W4 controls. The safe pair merges by itself (automatic), while Omar and Kim stay unmerged on To review.

## Failing steps
| Step | Answer | Part |
|---|---|---|
| W2: Sales › People to merge with the open count | no menu link | **FO-9s part 2** |
| W5: the review page with To review, Merged and Kept separate, and Undo merge | no page (`/front-office/duplicates`) | **FO-9s parts 2-3** |
| W4 control, twice (main only) | the safe pair stays OPEN | **FO-9b part 2b**, #3527 |

## Not tested
Headed walk and 400/1024 px: these wait on FO-9s's screens (P-606). Walks j_29 on main is asked of the Lead for when #3527 merges (P-439). #3527 is a draft whose door suites are still being updated, so its result here is a preview.

## Questions for the Lead
* FO-9s parts 2-3 have no PR (concept #2896 is still a records PR). Are they in a lane?

## Suggestions
* *Later, Capability:* other journeys that add people with fixed phone numbers (for example j_26, j_27) can be hit the same way once part 2b merges. A second run on the same copy may merge their people by itself. Give each run its own numbers.
