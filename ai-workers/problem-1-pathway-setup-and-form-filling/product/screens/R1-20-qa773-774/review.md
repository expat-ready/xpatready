# Review: R1.20 QA-773 / QA-774 (PR #3465, head 15c7a1baf065183351b5c2fd764a6397bac7c0ff)

Reviewer, 24 Nov 2026. I did not build this. Base fa337044c (merge base with origin/main). Code reviewed: `git diff fa337044c...15c7a1baf -- prototype/studio`.
(a77bfa9ea, on top of it, adds only the breaker's `break-report.md`.) Isolated copies on :4541-:4545, never :4400, all stopped afterwards.
Scope: the two qa Majors only. Not built and not findings: the downgrade check, Stripe plan change (QA-775), new seat rules.

**Verdict: Ship (Approve).** Both bugs are fixed at their cause. Each new check fails on main and passes on head (re-run by me). No Blocker or Major. Four Minors follow as rows.

## What I ran (evidence)
| Run | Head 15c7a1baf | Main fa337044c + head's test |
|---|---|---|
| `check_pf4c1b_batch.ts` (scratch DB) | 25/25 | 22/25: DW7 seat line `{"limit":13,"plan":"Team (Sample)"}`; the row says "your plan (Team (Sample)) has 4 seats"; the single 409 says "Your plan (Team (Sample)) allows 4" |
| `journeys/j_20.ts` (isolated, `PLATFORM_IDENTITY=local`) | 45/45, twice (no flake) | W1/W2: Send makes no batch call (`batchCalls []`, 5 rows stay); W3 "not walked" FAIL; W4: "6 of 11 seats used on Team (Sample)" while the gate allows 7; then W6 STOP (follows from A never being invited) |
| `check_pf6_staff_browser.ts` (isolated) | 93/93 | 90/93: the three BR-3 checks |
| Reviewer probe (scratch script; 1024/400 px, keyboard, axe, break-it) | see journey-test report | not run |

## Correctness
* **QA-773.** `invite-panel.tsx` drops `if (rows.some(twice)) return;`. The duplicate row is still named before Send (`:81`). The server (`batch-invite.ts:67`, lower-cased by `emailOf`) flags the later row DUPLICATE_IN_FORM and skips `personCheck` for it. A flagged row takes no seat. Probe: `"  A-UPPER "` after `a` gives one invitation for that address, row 2 DUPLICATE_IN_FORM, and the rest go out.
* **QA-774.** `seatLimitOf` (`limits.ts:62-71`) takes the limit from `PgEntitlements.limitOf`, the same definer read the gate uses. Its one extra query only decides which plan to name. `seatRoom` and `StaffReads.seats` both call it. The usage now comes from `seatsUsed`, the gate's own count (same formula as before).
  - No live plan: `planCode` null, so `booked` is false, the plan is null and the limit 0. Same as before; the batch still fails closed (DW3 "no live plan" passes).
  - Booked plan with equal seats: `b.seats === b.current`, so the current plan is named. Correct, because the number is that plan's too.
  - Booking overtaken (the subscription has moved off `from_plan_id`, or the subscription ended): excluded by the join, as in `platform_entitlement_limit`'s `booked` CTE.
  - Pending SA-3-43 lowering: wrong in one corner, Minor m1 below.
  - RLS: `platform_subscription_change` and `platform_subscription` are walled (`pf12_firm`); `platform_plan` is not. Every caller runs inside a staff request or `inFirm(actor)`, so the firm's own booking is visible. j_20 W4 proves this through the real app as `xr_app` ("9 of 10 seats used on Sample Lower …"). pf4c1b DW7 calls `StaffReads` with the superuser client (`check_pf4c1b_batch.ts:195`), so it does not test the walls; j_20 does.
  - DW3: still one EntitlementPort `check` per form (PASS "one EntitlementPort seat check"). `limitOf` runs twice per form, as on main.
  - Race: `limitOf` and the booking query are two statements under READ COMMITTED. A booking withdrawn between them could mislabel the plan once. The window is tiny; I note it and raise no finding.
* Per-row requests: none. The seat line reads a fixed number of queries per page.

## Tests prove the bugs (D16)
* Each "fail (QA-77x)" check is red on main and green on head (table above). Main has neither the `booked` naming nor the `seats()` change, and its words checks and seat-line checks each failed on their own point (the plan named, the limit shown), so each check tests its own rule.
* Hygiene (WAY-OF-WORKING: "a wait … fails loudly"): the waits that QA-773 used to break are now checks of their own: `.waitFor(...).then(() => true, () => false)` inside `ok` (`j_20.ts:115`, `check_pf6_staff_browser.ts:180`). The `.catch(() => "")` calls come after reads, never after a wait, and every one feeds a check that then FAILs. W3's skip on main records a FAIL (`j_20.ts:157`). `settle` (`check_pf6_staff_browser.ts:71`, existing code) returns quietly after 10 s, but the next check counts the posts and fails. Acceptable.

## D1-D20 (1-5)
D1 5: both qa rows' "Expected" met, shown by red/green runs · D2 5: one invitation per address, case- and space-insensitive; the seats never pass the booked limit · D3 5: one limit reader shared by the gate and Team · D4 N/A · D5 4: re-send gives the right words; a lone stale duplicate row cannot be removed (m2) · D6 N/A · D7 N/A · D8 5: unchanged · D9 4: the duplicate left after Send needs Close (m2) · D10 3: stale "earlier row" words, and "Your plan has N free seats" under a booked limit (m2, m3) · D11 5: toast, form notice, row flags, focus on the first flagged row · D12 5: team components, no new styles · D13 4: axe 0 serious on Team (400 px) and on the form with duplicates; no sideways scroll at 1440/1024/400; keyboard open and Send; 200 % zoom bracketed by 400 px, not shot directly · D14 5 · D15 5: Send answered in 241 ms · D16 5 · D17 simulated only · D18 4: the booked plan is named on the seat line and in refusals · D19 4: Team → invite → accept (W6) green · D20 simulated only.

## BIC-01-BIC-20
N/A: Team and Invite people are firm-admin screens, not case-side (EXPERIENCE §6 scope).

## Graph (P-86)
`graph.mjs`: G1 0, G2 0. `graph.json` lists `POST /platform/staff/invitations/batch` with `testedBy: []`, but pf4c1b, pf6 and j_20 all post to it through `call()` / `staffChange`. That is a gap in the tool's detection, not in this PR.

## Issues (all Minor, "Should", follow-up rows; none blocks)
1. **m2: stale duplicate words after Send.** When the earlier row is invited and leaves the form, the duplicate becomes "person 1" saying "This email is already on an earlier row of this form." No earlier row exists any more. If it is the only row left it has no Remove (`invite-panel.tsx:91`), so the only way out is Close. Seen in the probe at 1024 px and in j_20 W1. The words come from `batch-invite.ts:67`, and `j_20.ts:121` / `check_pf6_staff_browser.ts:181-183` assert them. Fix: when DUPLICATE_IN_FORM's earlier row was invited, the panel says so ("This email was invited on an earlier row; remove this row.") and offers Remove even on a single row.
2. **m1: pending lowering plus equal booked seats.** `limits.ts:66,70` compares the booked seats with the current plan's catalogue `seats_limit`, not with its effective limit (the kept value). With current 5→4 pending (the firm keeps 5) and a booked plan of 4, the limit is 4, `booked` is false, and the refusal names the current plan with 4 (the breaker reproduced it). Fix: compare with the effective current limit (return `base.seats` from the definer, or read the kept value).
3. **m3: form seat words under a booking.** `invite-panel.tsx:26-28` says "Your plan has N free seats" while the limit is the booked plan's. `:42` counts duplicate rows as seats, so it warns "more people than free seats" when everyone who can be invited will be.
4. **m4: hidden server flag on a duplicate row.** While an earlier row with the same email stays on the form, `:81` shows only "already on another row". Other server flags on that row are hidden (probe: row 4 had INVALID_ROLES plus DUPLICATE_IN_FORM; only the duplicate words showed under Email).

## Not checked
A real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); 200 % zoom as a screenshot (my zoomed browser had no session); CI on the PR (body still "Draft").

Reviewer: Approve 15c7a1baf065183351b5c2fd764a6397bac7c0ff
