# FO-6d break, round 2, part 2 (PR #3224, head 130af5518)

Breaker, 23 Nov 2026. This round covers only the diff since part 1: `git diff 8162df596 130af5518`. That is `completion.ts` (the webhook's OTHER handler), `person-documents.ts` (`GET people/:personId/documents`, filtered per item by its own prospect), the dispatcher's one line and the `OTHER` event variant. Scope (P-26): the BACKLOG FO-6d row and this PR's Done-when table. API only. Part 1's findings (the government-form check and the title rule) are in `break-round2-part1.md` on #3207.

**How I tested:** the round 1 harness, run on this worktree. It uses a scratch database on :54329 (dropped afterwards), the real PlatformGuard, Nest on a random port, and the fake adapter and fake mail. Webhooks go through `SigningHooksController` → `Signing.receive`, which is the real dispatcher. The row suite gives 35/35. Script: `/tmp/claude-0/-home-user-xpatready/322d1bd4-de69-5b06-ae8b-6b0f184130f9/scratchpad/r2/attack2.mts` (PART=2).

## Blocker
None.

## Major
None.

## Minor
- **m1. The dispatcher hides the handler's answer** (`signing/service.ts:131`).
  - Every event handed to OTHER's handler answers `applied: true, reason: "handed to its module"`. That includes a replayed `completed` (where the handler says `duplicate: true`) and its refusals such as "viewed already" or "the request has expired".
  - Nothing is applied twice: evidence stays 1 after the replay. But the provider's log and ours say "applied".
  - The pattern is CONSULTATION's; the changed line extends it to OTHER.
- **m2. The person gate still counts ended company contacts** (`person-documents.ts:21`, no `validTo` filter).
  - Someone who sees only a prospect where the person's contact link has ended gets **200 with an empty list** instead of 404.
  - No title or hash leaks, because the items are filtered, but it tells them the person has signed copies elsewhere in the firm (found by reading the code; in my data the case officer also saw an unowned prospect, so the 200 had a second cause).
- **Declared in the PR body, not re-raised:** the 500 when consent text versions are mixed (round 1 m3), a decline left to FO-5d (m4), and orphan files after a failed completion.

## What held
- **Round 1 M1 on part 1** (OTHER events applied by the retainer handler while part 1 stands alone): fixed here. With this PR the same flow was tested:
  - `viewed` ×2 and `signed` ×2 are applied by `completion.ts`. The audit lines carry `documentKind: OTHER` and no `retainerId`.
  - `completed` → SIGNED, 1 evidence row, `signing.completed` with `documentKind` OTHER, and 2 "Your signed document" emails.
  - The replay is handled once. The prospect stays ENGAGED.
- **Review M2 fixed: each copy follows its own prospect.**
  - **Setup:** Bea signed four documents:
    - R-PRO-other: an OTHER on user-R's prospect;
    - R-PRO-retainer: a SIGNED RETAINER on that same prospect;
    - officer-PRO3-other: an OTHER on the case officer's prospect, where Bea is a live contact (the shared-contact case);
    - unowned-PRO4-other: an OTHER on a prospect with no owner.
  - **Everyone-sees-all off:**
    - R sees the R-PRO retainer and OTHER, plus PRO4.
    - The officer sees PRO3 and PRO4, but not R's OTHER or **R's retainer**.
    - Read-only and Billing see PRO4 only, through view.all on unassigned prospects.
  - **Everyone-sees-all on:** all four, for all four roles.
  - **The two routes agree:** for every viewer and every OTHER item, being listed equals getting 200 on `GET signature-requests/:id`.
- **The round 1 ended-contact case:** after Bea's PRO3 link was ended, the officer still sees only PRO3 (sent from their own prospect) and PRO4. R's document no longer appears.
- **Other reads:** firm B → 404, a bad id → 404, Eve or Dee for R → 404 (on no prospect R sees).
- **Registration:** the handler is registered once (`signingHandlerFor` guard). A RETAINER request still goes to `applyRetainer`.

Verdict: Approve
