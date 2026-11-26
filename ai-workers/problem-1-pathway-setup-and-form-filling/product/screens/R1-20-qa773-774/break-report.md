# Break report: R1.20 QA-773 / QA-774 (PR #3465, head 15c7a1baf)

Breaker, 24 Nov 2026. Isolated copy `brk_r120` on :4551 (`PLATFORM_IDENTITY=local`, fresh web build per QA-181), stopped
afterwards. All plans, bookings and limit changes were Sample rows added by SQL as `xr_studio`: plans `Small (Sample)` 4
seats, `Tiny <b>(Sample)</b>` 4, `Same5 (Sample)` 5, and `platform_subscription_change` / `platform_limit_change` rows
stamped by their triggers. Scope: the Invite people duplicate row (QA-773) and `seatLimitOf` with its readers (gate
single/batch, Team seat line) (QA-774). I fixed nothing.

## Findings

**m1 (Minor): with an SA-3-43 lowering pending, a booking is not named when the lowered catalogue value equals the booked plan's seats.**
Steps: Team (5) → `platform_limit_change` SEATS 5→4 (pending for sample-firm until 24 Jan 2027, so the firm keeps 5) →
book `Small (Sample)` (4). GET /api/platform/staff → `{limit: 4, plan: "Team (Sample)", booked: false}`. The batch row
words say "your plan (Team (Sample)) has 4 seats". After the booking was withdrawn the line said "4 of 5 … on Team
(Sample)". So the current plan was named with the booked plan's number, which is the QA-774 class of error.
Cause: `api/src/platform/entitlements/limits.ts:70` compares `b.seats` with `f.seats_limit` (the catalogue value after the
lowering). It should compare with the current plan's effective limit for this firm (`base.seats` in
`platform_entitlement_limit`, including the kept old value). This needs a pending lowering that lands exactly on the
booked number, so it is rare.

**m2 (Minor): the duplicate row left on the form after Send has wrong words and cannot be removed.**
Steps (UI, 1440 px): Invite people → row 1 `dd1@x.com`, row 2 `DD1@x.com ` → Send. Row 1 is invited and leaves the form.
The duplicate becomes "person 1" and says "This email is already on an earlier row of this form." No earlier row
exists any more. The form notice says "fix it, or free a seat, then send again". Sending again gives "This person already
has a pending invitation: resend it instead." The row cannot be removed: `Remove person N` only shows when
`rows.length > 1` (`web/src/modules/platform/staff/invite-panel.tsx:91`), so Close plus the discard confirm is the only
way out. Server words: `api/src/platform/identity/batch-invite.ts:67`. The gap: the panel keeps a row whose only flag is
DUPLICATE_IN_FORM after its earlier row was sent.

**m3 (Minor): the form's seat preview counts the duplicate row as a seat and says "Your plan" for the booked plan's limit.**
Steps: booked Tiny (4), 3 used, rows `dd1@x.com` + `DD1@x.com`. The form shows "3 of 4 seats used · 2 on this form" and
the warning "More people than free seats. Your plan has 1 free seat … the other row stays". The server gives the
duplicate no seat (verified: free 2, rows n1, N1, n2, n2, n3 → n1 and n2 invited, n3 OVER_SEAT_LIMIT). So with free 2 and
rows a, A, b the form warns "more people than free seats", but everyone it can invite is invited. With free 2 and rows a,
A it says "5 of 5 seats after these invites" when the result is 4 of 5. The cause is `invite-panel.tsx:42` (`rows.length`)
together with the `twice` rows. Also `seatWords` (`invite-panel.tsx:26-28`) says "Your plan has N free seats … upgrade
your plan" while the Team line just above names the booked plan.

**m4 (Minor, wording): the refusal while a booking is open does not say how to undo it.** The single 409 says "…or change
the plan" (`identity/service.ts:249`) and the batch row says "Remove someone or upgrade your plan" (`batch-invite.ts:79`).
Neither mentions withdrawing the booking, which is the direct way to get the current plan's seats back.

Note (not counted, server unchanged by this PR): a good row that repeats the email of an earlier flagged row (INVALID_ROLES,
OWNER_BY_SINGLE_INVITE, ALREADY_STAFF) is flagged DUPLICATE_IN_FORM, and the person is not invited in that send
(`service.ts:445`). Fixing the first row and sending again invites them once.

## What held

- Duplicates: case (`Dup@X.com` / `dup@x.com`) is flagged DUPLICATE_IN_FORM on the later row. Leading/trailing spaces,
  zero-width and full-width forms are refused INVALID_EMAIL on their own row. The client trims before sending.
- A duplicate uses no seat. It is still flagged when the earlier row is over the limit or the firm has no live
  subscription. 50 rows of one address (mixed case) → 1 invited, 49 DUPLICATE_IN_FORM, in 0.18 s. 51 rows → 422
  ROWS_COUNT.
- Concurrency: 6 parallel batches of `[cN, CN]` with 1 free seat → exactly 1 invited. A single invite afterwards → 409.
  Ended at 4 of 4.
- Booked lower plan: Team line "3 of 4 seats used on Tiny <b>(Sample)</b>, the plan booked for your renewal" (escaped,
  no markup). The batch row says "your booked plan (Small (Sample)) has 4 seats". The single 409 says "Your booked plan
  (Small (Sample)) allows 4 people". The line, the form's free seats and the gate agreed on 4.
- Withdrawn: back to 5 on Team (Sample), `booked: false`, no suffix.
- Overtaken booking (subscription moved to Firm, then back): not named and not lowering while overtaken. Booking on an
  ENDED subscription with a new live one: ignored (5 on Team).
- No live subscription: "Your firm has no live subscription, so nobody can be added." (single and batch); line "4 of 0".
- Equal-seat booking (Same5, 5 = Team 5): names the current plan with 5, which is correct.
- Booking made first, lowering after (catalogue below the booked seats): booked plan named, which is correct.
- Walls: sample-solo's Owner reads only its own seats (Solo 1, `booked: false`) while sample-firm has an open booking.
  Its gate is unaffected.
- Roles: Case Officer and Case Manager get 403 MISSING_PERMISSION (agent/staff:manage) on GET staff and POST batch. No
  token → 401.
- Focus after Send lands on the first flagged row's email (row 1). The form is locked while in flight (journey W3).
- 1024 px and 640 px at 2x (200 % zoom): the seat line wraps, nothing is clipped or overlapping (screenshots taken; not
  committed).

Not tried: reload/back during Send (the batch is one transaction, unchanged); a full keyboard-only pass (only focus after
Send was checked). Outside scope (not a finding): Plan and billing (`billing/account.ts:60`) still shows "4 of 5" with the
current plan while Team shows the booked 4.

Verdict: Approve
- m1 Minor: limits.ts:70, a booking hidden when a pending lowering lands on the booked number (steps above).
- m2 Minor: invite-panel.tsx:91 / batch-invite.ts:67, a leftover duplicate row with wrong words and no Remove.
- m3 Minor: invite-panel.tsx:42, 26-28, the seat preview counts duplicate rows and says "Your plan" for the booked limit.
- m4 Minor: service.ts:249 / batch-invite.ts:79, the refusal does not mention withdrawing the booking.
