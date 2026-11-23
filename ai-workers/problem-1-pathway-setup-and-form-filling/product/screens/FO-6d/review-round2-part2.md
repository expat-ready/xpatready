# FO-6d review, round 2 (diff only): part 2 of 2, PR #3224

Reviewer: independent reviewer agent, 23 Nov. Branch `claude/nice-curie-tzbprl-p2`, head **130af5518d5156fd4da576b727c39a41e7b39ba0**, stacked on part 1 (8162df596). Scope: `git diff 8162df596 130af5518`. Part 1 has its own report (`review-round2-part1.md` on #3207).

## What I ran (worktree of 130af5518; Postgres 127.0.0.1:54329)
| check | result |
|---|---|
| `tests/check_fo6d_any_document.ts` | **35 passed, 0 failed** |
| `check_fo6_signing_api`, `check_fo3c_consultation_agreement` (CONSULTATION still routed to its own handler) | 51/51, 42/42 |
| `check_pf6b_permission_rules` (the new `PersonDocumentsController.list` sweep line), `check_pf19r_every_sender` (the `completion.ts` sender line) | 41/41, 21/21. To get these to run I linked `.tools/solution-1-prototype` into the scratch worktree: the worktree's `prototype/node_modules` symlink pointed at a missing path, an environment gap and not a code fault |
| **Split lost nothing:** the `onHook … signedCopies` block of f6d048440's `any-document/service.ts`, compared with `completion.ts` | **identical** (`diff` is empty) |
| Routing and contract: f6d048440 compared with 130af5518 | `signing/service.ts:129` is back to `!== "RETAINER"`. `OtherKind` includes `OTHER`. The `OTHER` variant of `SigningCompletedPayload` is back. The handler is registered once, in the feature factory (`if (!signingHandlerFor("OTHER"))`) |

## Round 1 findings
* **M2 (person documents leaked items across owners): fixed** (`person-documents.ts:213-222`).
  * **The fix:** each signed request is mapped to its own prospect, then shown only if that prospect is visible to the viewer:
    * OTHER: `fo_signing_document.prospect_id`.
    * RETAINER and CONSULTATION: `fo_retainer.prospect_id`.
    * An item with no prospect is shown only to see-all viewers.
  * **The test is honest:**
    * In S6, Cy (the company's signatory) is on a second prospect owned by the Case Officer, and everyone-sees-all is off.
    * Pass: the Case Officer sees their own copy and not user-R's.
    * Fail: user-R sees their own copy, and neither the hash nor the title ("other owner") of the Case Officer's copy.
    * Remove the filter and the fail check fails, because round 1's code listed both copies.
* **Round 1 Minor 3** (stale comments): the `handlers.ts` comment now names `features/front-office-signing-any-document.ts`.
* **Round 1 Minor 7** and **breaker m3, m4** (decline left to FO-5d; a mismatched consent version gives 500; orphan files on a failed completion): said in the PR body. The code is unchanged from round 1, as expected.

## Findings

### Blocker
None.

### Major
None in this diff.

### Minor
1. **The item filter's RETAINER and CONSULTATION branch has no test.** S6 covers OTHER only. One retainer signed on the Case Officer's prospect, asserted absent for user-R, would cover the second half of the M2 fix.
2. **A consultation agreement with no prospect is hidden from own-only staff.**
   * FO-3c creates the CONSULTATION retainer with `prospectId: b.prospectId`, which can be null for a booking (`consultation-agreement/service.ts:209`). `visible()` then returns false for everyone except see-all viewers, including the representative who ran the consultation.
   * This errs toward hiding, so nothing leaks. Say it, or let the retainer's `representative_staff_id` also count for own-only.
3. **The gate still counts ended company contacts** (`person-documents.ts:210`, breaker M2's `validTo` point). Since items are now filtered, the only effect is 200 with an empty list instead of 404. Filter `validTo` when the person-record screen lands.

## Done-when → proof (part 2's lines)
| line | pass | fail | holds? |
|---|---|---|---|
| uploaded PDF signed by two people → sealed copy filed (on both people, downloadable, hashed) | S4 ×4 | S4 duplicate `completed` handled once | yes |
| OTHER never moves a prospect or makes a client (after signing) | n/a | S4 | yes |
| nobody signs without consent; firm signs last | S5 redelivery applies | S4 no consent 409; S5 firm-first 409 | yes |
| each signed copy follows its own prospect (round 1 M2) | S6 | S6 | yes |
| part 1 + part 2 = the round 1 behaviour | handler identical; routing, payload, sender and sweep lines restored | none | yes |

## Note on the stack
Part 1's Major 1 asks that the routing line (`!== "RETAINER"`, `OtherKind` with `OTHER`) move into part 1. After that rebase, part 2's diff loses those two lines and is otherwise unchanged. This Approve is for 130af5518; the rebased head needs a quick diff-only look before it is labelled.

## Journey score
Not applicable: API only, no screen. FO-6ds owns the journey and its score. I wrote no journey-test report.

## Could not check
Fake adapter and fake mail only (FO-6v held). FO-6 part 4's consent door is not built, so the suite writes consent directly.

Reviewer: Approve 130af5518d5156fd4da576b727c39a41e7b39ba0
Verdict: Approve
