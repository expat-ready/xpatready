# Review: FO-3w part 1, the public booking pages (PR #1921): re-review at e903d44e3

Reviewer: Opus 5.5, effort high, fresh context (did not build it). Skill `screen-review`. Journey test: `journey-test-reviewer-fo3w-part1-2026-11-16.md` (8/10 at 52d96246d; **9/10 from 003e49c33**, unchanged here).
**Reviews so far:**
- 52d96246d: Block.
- 003e49c33: Approve (R1, B-M1..B-M3, m1, m4, m5 fixed).
- **This one:** the diff only, `git diff 9404ab637..e903d44e3 -- …/prototype`. Two files: `type-page.tsx` and the test. 16 Nov 2026, ~10:45 IST.

**The bar:** brief `lead-b-briefs/FO-3w.md` with A1 (P-626-order.md) and P-629; concept `fo-3-booking` r2 §3 BR-1..BR-7 and BR-11, §4 Public, §5 and §6.

**Verdict: Approve.** Devin's finding and my n1 and n2 are fixed. The two new checks fail when their fixes are reverted. Nothing new blocks.

## Re-run at e903d44e3 (ports 4546-4548 and 4846-4849; never :4400)
- **Suite:** `check_fo3w_booking_browser.ts` **67/67, exit 0** on a fresh copy. `web/dist` rebuilt at this head; run from a scratch worktree, so no shared-tree file was touched.
- **Mutation:** I reverted both fixes (`pad = 0`, and the no-times line drawn even on error), rebuilt, and ran on a fresh copy: **65/67**. Exactly the two new checks fail:
  - "BR-3 (Devin #1921): no browser zone → … Mon 30 Nov 19:30"
  - "(review n1): a month that fails to load shows the error and not 'No free times'"
- **Test seed:** the Monday 19:00-20:00 Toronto window (`check_fo3w…:48-50`) only adds Sample hours. Earlier checks still pass with it: J-P2's 30 Nov list now ends with 19:00 and 19:30.

## The diff, checked
| Item | Status | Evidence |
|---|---|---|
| Devin (red): no browser zone lost the firm's evening on a month's last day (BR-3) | **Fixed** | Details below the table. |
| n1: failed month also said "No free times" | **Fixed** | `Times` gets `error` only when there is no data for this key (`type-page.tsx:59`). The no-times line is withheld while `error` is set (`:149`). Check: aborted slots → "We could not load the times. Please try again." and no `[data-public-state=no-times]`. |
| n2: a ZodError taken for a refusal | **Fixed** | The guard adds `!(x instanceof Error)` (`type-page.tsx:189`). A ZodError or TypeError now gives the status-0 sentence, "We could not take this booking. Please try again.", never a crash. No check, as the PR says: it needs the API to drift from the contract. Accepted. |
| n4: zone pattern copied from the API | Left for a shared contract; answered on Devin's thread. Stays a Should. |

**How the Devin fix works** (`type-page.tsx:38-42`):
- With no zone, the month is asked one day wider each side in UTC, with no `tz`. One day covers every offset up to ±14 h. The window is at most 33 days, well under the server's 62-day cap.
- The grid still filters to the month's own days in the firm's zone (`inMonth`, `monthGrid`).
- With a zone, `pad` is 0, so the request is unchanged.
- Check: a "Factory" browser sees "Times shown in America/Toronto" and Mon 30 Nov 19:30 (00:30 UTC on 1 Dec).

**Read and found sound:**
- With a zone nothing changes, and a zone change still refetches in that zone (B-M1's check passes).
- A background refetch that fails while data is shown now keeps the data and no alert. That is right: the shown times are still the last good answer, and slot-taken already gave its own message.

## Still open (Should; none blocks)
- **n3.** The zone picker opens with focus on Close, not on the field (`type-page.tsx:89`). The team's Dialog uses `openOnFirstField`.
- **n4.** Duplicated zone and phone patterns (`time.ts:8`, `type-page.tsx:23`): for a shared contract.
- **m3, BIC-14.** The zone-line tooltip is a native `title`, so keyboard and touch users never see it.
- **BIC-13.** The error summary's lines are not links to their fields.
- **Part 2.** Reschedule and Cancel lead to "This page is not available." until the manage page lands (the brief's split; the PR states it).

## Scores at this head
Unchanged from 003e49c33:
- D1 4 · D2 5 · D3 4 · D5 4 · D8-D11 4 · D12 4 · D13 4 · D14 4 · D15 5 · D16 5 · D18 4 · D19 4
- D4, D6, D7 N/A · D17 and D20 simulated only
- BIC-20 Met · BIC-13 and BIC-14 Partly (Should)
- Journey 9/10

## Could not check
- A real screen reader. A visible (headed) browser: headless only.
- An intended visitor's unaided walk (D17 and D20 stay with the founder).
- Safari and Firefox.
- CI at e903d44e3: `pr-rules`, `module-cards` and `guard` were still running when I wrote this; they were green at 003e49c33, and the body is unchanged.
- DW11: not re-run. It passed at 52d96246d, and since then no change touches `routes.tsx` or a shared file.

Verdict: Approve
