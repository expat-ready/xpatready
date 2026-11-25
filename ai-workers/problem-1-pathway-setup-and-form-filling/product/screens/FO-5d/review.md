# FO-5d part (1): the client declines. Review, round 1 (d2c603bd3)

Independent reviewer, PR #3670, head `d2c603bd38cfec50738400003470d3720aef7ec3`, worktree `claude/pensive-maxwell-bsxoo9-decline`. Reviewed at 255be82c9; d2c603bd3 only renames the migration folder to `20261125150000_front-office-signing__fo5d_decline_reason` (SPD-2; `diff -M`: migration.sql 100 % rename, 5 name-only lines elsewhere), and the suite is 26/26 again there. API, migration and tests; no screen. So the screen-only checks (keyboard, 1024 px and 200 %, BIC-01 to BIC-20) are N/A, and the code dimensions are the review.

**Verdict: Block.** Three open Majors. All three are missing failing lines for rules real data reaches; the code itself behaves correctly in every walk. On the skill's scale this is "Ship after fixes": the fixes are test lines.

## What I ran
* `check_fo5d_decline_withdraw.ts`: exit 0, 26/26. `check_fo6_signing_api.ts`: exit 0, 57/57.
* Isolated copy `fo5drev` on :4436 (runtime ports): j_55 28/34 (the failures wait on #3648, FO-5s, and a qa inbox timing issue), plus 10 HTTP walks. See `journey-test-reviewer-2026-11-25.md`, **score 8/10, pass**.
* rollback.sql on that copy's database (3 reasons kept): clean, then the migration re-applied cleanly.
* graph.mjs (run, then its file restored): G1 0, G2 0. One G3: `POST /public/sign/:token/decline` is reached by no HTTP test, because the suite calls the controller in-process. My HTTP walk covers it; the next PR's page closes it.
* Mutations (rule removed, suite re-run, `git checkout` restored):

| # | Rule removed | Suite |
|---|---|---|
| M5 | reason text in the audit summary (`decline.ts:48`) | red |
| M8 | envelope cancel after the decline (`door.ts:126`) | red |
| M10 | the check constraint (migration) | red (3 lines) |
| **M3 / M3b** | recipient: always the representative / never the representative (`decline.ts:69`) | **green 26/26** |
| **M2** | "only a RETAINER gets an item" (`decline.ts:67`) | **green** |
| **M6** | `canOpen` in the labeller (`notification-labels.ts:30`) | **green** |
| M1 | version check (`decline.ts:57`) | green |
| M4 | the decline route's `begin` (limiter, JSON check) (`door.controller.ts:105`) | green |
| M9 | webhook "answered already" (`service.ts:207`) | green |

## The four deviations
1. **Check instead of replacing the trigger: accept.** Part 1's `fo_signing_signer_write` refuses any change to a signer who declined (`20261122020000…/migration.sql:306`), and any change once the request is final (`:303`). The check (validated; M10 red) adds "only beside `declined_at`, trimmed, 1-500". The rule holds without rewriting a trigger. Note: the suite's "never changes" line is refused by the request-final clause, not the signer freeze. Both hold.
2. **Ended link → 409 in words: accept.** The door's GET already reads the same token as "This agreement was declined…" (FO-6 4b note rule 4), and a 404 on decline would contradict it. Unknown, malformed and other-firm tokens keep the 404 (suite D2). The lead should align the row's acceptance text.
3. **No `on-signing-declined.ts`: accept.** One function in one transaction for the door and the webhook. Placement in `signing/` follows `service.ts`'s existing writes to `fo_retainer` (`moveRetainer`).
4. **j_55 W3 query: accept.** It adds `fo_signer` to the union that `hasColumn` already named; it widens where to look, and the reason must still match word for word. qa owns j_55: tell qa on the PR.

## Code checks
* **Lock order.** Door decline: request `FOR UPDATE` (`door.ts:99`), then retainer `FOR UPDATE` (`decline.ts:55`), the same order as the webhook (`service.ts:152` → `:216`). Main's withdraw, edit and signed-offline lock only the retainer, so there is no cycle today (see m6 for #3648).
* **Decline vs signature.** Serialised on the request lock and re-read under it (`door.ts:100-102`): the 5-way race gave one 200 and four 409s; a signature after the decline is refused and stored (D3).
* **Firm scoping.** Every read and write is under `withFirm` from the token, plus `firm_id` in the raw SQL.
* **Notify.** The port skips an inactive or opted-out recipient without throwing (`store.ts:31`), so a decline is never blocked by its recipient.
* **Audit.** One line per change in the transaction, with no reason text (M5 red; checked over HTTP).

## Issues, ranked
**Major 1 (Must): the recipient rule has no failing line** (`decline.ts:68-69`).
* Rule: the prospect's owner is told, else the representative (AG-5-68 r4 "the file owner when there is no case").
* Failing scenario: a case officer owns the prospect and the representative is someone else (`visible` and the draft allow it). Send the item to the representative instead (M3), or to nobody when there is no owner (M3b), and the suite stays 26/26. The seed's owner *is* the representative.
* Fix: one prospect owned by someone other than the representative (item to the owner), and one with no owner (item to the representative).

**Major 2 (Must): r6 "a non-retainer document gets no item" has no failing line** (`decline.ts:67`).
* Reachable: a consultation agreement's client link has the same firm-first shape (`booking/consultation-agreement/service.ts:224`), so `POST /api/public/sign/:token/decline` accepts it.
* Failing scenario: remove `r.kind === "RETAINER"` (M2), and the representative gets "A client declined a retainer" for a consultation agreement, with the suite still green.
* Fix: decline a sent consultation agreement on the door. Expect DECLINED and no item.

**Major 3 (Must): the labeller's "only a reader who may open it" has no failing line** (`notification-labels.ts:30`).
* Only the missing-key case is tested.
* Failing scenario: everyone-sees-all off and the prospect reassigned away (the old owner keeps the row). With `canOpen` removed (M6), the old owner is shown "Retainer for <client>" and the link; suite green.
* Fix: as `check_pf18n2_lead_notices.ts:128` (DW3 reassigned away), a reader with the key who may not open it gets no label.

**m1 (Should): "has been told" is not always true** (`door.ts:129`).
* No item is written for a consultation or other document (r6), or when the retainer moved on.
* Seen over HTTP: on a SIGNED_OFFLINE retainer whose request was still live, the decline answered "Sample immigration firm has been told.", `agreement: null`, and 0 items were written.
* Fix: say it only when an item was written; otherwise "You declined this agreement."

**m2 (Should): the 500 limit counts UTF-16 units, not characters** (`door.controller.ts:54`, `text()` = zod `.max`; `decline.ts:44` `slice`).
* 300 emoji (300 characters) gets 422 "at most 500 characters", while the database counts code points.
* Fix: refine on `[...s].length`, and slice by code points.

**m3 (Should): the item's words.**
* `web/.../notifications/contract.ts:35` reads "A client declined a retainer"; the row and AG-5-68 r4 say "Client B declined the retainer. Edit and resend, or withdraw it."
* A **firm** signer's decline at the provider while SENT or VIEWED also raises this "client declined" item (`decline.ts:67` does not check `s.role`).
* Fix: notify only for a CLIENT decline (or use other words), and carry the next step in the kind's words.

**m4 (Should, lead): Home's "Needs you" does not show the item.**
* `store.ts:92` lists MY_DEADLINES only, so `GET /me/needs-you` returned 0 while the notification list had it. AG05-D4(8) asks for "one home-screen item".
* Not this PR's file: the lead should route it (PF-18h) or regroup the kind.

**m5 (Should): untested wiring and defence in depth.**
* M1 (version check; unreachable today: Send cancels stale requests, and the status check excludes DRAFT and SIGNED_OFFLINE) and M4 (the route's limiter: it held over HTTP, 429 after 30).
* M9: without it, a provider `declined` for a signer who signed hits the trigger's "does not change". That message is not in `this.tx`'s map (`service.ts:161`), so the answer is a 500 and endless redelivery.
* Fix: one line each, or name them in `MODULE.rows/FO-5d-1.md`.

**m6 (Should, lead): lock order against #3648.**
* #3648's withdraw and edit update `fo_retainer` first, then `endRetainerSigning` updates `fo_signature_request`. That is the reverse of this PR's request → retainer order (and the webhook's).
* Failing scenario: a Decline and a Withdraw at the same moment can deadlock. `door.ts:121` maps no 40P01/40001, so the client gets a 500.
* Fix: whichever merges second takes the request lock first, or the door answers 409 "try again".

**m7 (Should): one query set per row in the labeller** (`notification-labels.ts:29-30`).
* `canOpen` → `visible` per item: the retainer, the setting, the key, the prospect. `LeadNotificationLabels` batches into 3 queries. STANDARDS: no request per row.
* Fix: read the visibility once and filter in memory.

**m8 (nit).**
* `retainers/service.ts:234-238`: `canOpen` sits between `visible`'s JSDoc and `visible`.
* The firm-after-client WITHDRAWN path (`decline.ts:58-60`) writes no `retainer.withdrawn` event, unlike FO-5's withdraw (`service.ts:677`). There is no consumer today.

## D1-D20 (1-5)
D1 4 (every row behaviour is present; m3, m4) · D2 5 (the race gives one; check plus trigger; the webhook applies once) · D3 4 (one shared `applyDecline`; FO-3c keeps its own copy of the consultation decline) · D4 4 (the CLIENT_SIGNED → WITHDRAWN mapping matches FO-3c) · D5 4 (double click, reload and cancel failure held; m6) · D6 5 (audit per change, no reason) · D7 N/A · D8 N/A · D9 3 (the item lacks the next step; not on Home) · D10 3 (m1, m2) · D11 4 (states in words) · D12 to D14 N/A (no screen) · D15 4 (30 ms; m7) · D16 3 (Majors 1-3, m5) · D17 simulated only · D18 4 (the reason is shown as the client's own) · D19 3 (the retainer page shows the reason only with FO-5s S7) · D20 simulated only.

BIC-01 to BIC-20: N/A (no case-side screen in this PR).

## Could not check
A real vendor (fake adapter only). The deadlock with #3648 (not merged; read from code). The client's page and keyboard path (FO-5s S7). A screen reader and an intended user (D17 and D20 stay with the founder).

Reviewer: Block d2c603bd38cfec50738400003470d3720aef7ec3
