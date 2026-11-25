# QA-770 review: Withdraw, Edit and Signed offline end the retainer's signing request (FO-5d (2), (3); API only)

PR #3648, head `c1c181cf0f6e28615f0c5bd1defbc77ceb9cbeed` (branch claude/pensive-maxwell-bsxoo9, diff `origin/main...c1c181cf0`).
I am an independent reviewer and did not build this. Specs: qa/BUGS.md QA-770, BACKLOG FO-5d (2) and (3), AG-05 v2.1 AG-5-34 (Withdraw "Refused on
`EXECUTED`"; "Client told"; "Never for an edit"), MS-D2(2). Decline (FO-5d (1)) is not in this PR and is not a finding. The PR has no page:
the retainer page has no Withdraw button on main (retainer-page.tsx:7). So 1024 px, 200 % zoom, keyboard and the BIC scorecard do not apply.

**Verdict: Block** on M1 (skill verdict: Ship after fixes). The rest is sound.

## What I ran (local PostgreSQL :54329, scratch databases dropped afterwards; never :4400)
* `check_fo6_signing_api.ts`: **65 passed, 0 failed**, exit 0. `check_fo5_retainers.ts`: **248/248**, exit 0. `check_pf19r_every_sender.ts` 21/21,
  `check_fo6_signing` 47/47, `check_fo2w_won_event` 19/19, `check_pf12_walls` 110/110. `tsc -p api/tsconfig.json --noEmit`: no errors.
* `check_fo6_door` needs a running copy, so I did not run it (it seeds the ended states by SQL and does not reach this code).
* A probe script in my scratchpad, outside the repo, using the suite's own set-up (fake adapter, fake mail). Results P1–P5:
  * **P1:** client signed, then the firm signed at the vendor, so the fake's envelope is `completed`. The `completed` webhook has not arrived yet.
    Withdraw → **200**, retainer WITHDRAWN, request CANCELLED:WITHDRAWN, the client gets "Agreement withdrawn". The late `completed` then gets
    "the request is cancelled". **0 evidence rows.**
  * **P2:** a second connection holds the request row lock, as the webhook's `receipt` does. Withdraw then takes the retainer row, and the hook asks for the retainer.
    Postgres reports a **deadlock**. The withdraw was the one cancelled: **409 "someone else saved it"** after 1051 ms. The retainer stays SENT.
  * **P3:** a vendor cancel that takes 6 s. The vendor cancelled once, then Prisma's 5 s transaction timeout rolled the database back:
    a **500** (P2028, logged as "unexpected database refusal"). Retainer and request still SENT, the envelope dead. A retry then works (200, WITHDRAWN).
  * **P4:** Edit with the vendor down → 503 SIGNING_UNAVAILABLE. Retainer SENT:1 and request SENT, so the rollback holds.
  * **P5:** Signed offline with the vendor down → 200, SIGNED_OFFLINE, request CANCELLED:SIGNED_OFFLINE. The vendor's envelope still gives a link (logged only).
* Not run: `graph.mjs` (it rewrites qa/GRAPH.md, and I may write only this file and the journey report). CI: the PR is a draft, so only the guard
  checks ran on this head (green).

## What holds
* Withdraw: `endRetainerSigning` runs inside the withdraw's transaction. The `updateMany` on the request is guarded by status (signing/service.ts:113), and there is one
  `signing.request_cancelled` line per request. `cancelNow()` is the last step before the commit (retainers/service.ts:680), and a failed cancel gives
  503 "Try again" and a full rollback (test :372-377). The email goes after the commit, once, with idempotency key
  `signing:<request>:withdrawn:<person>`, Reply-To the firm. A failed transaction cancels nothing (test :370-371). A double withdraw: the second
  waits on the version row, then gets 409 and never reaches the vendor.
* Edit: the request ends with UPDATED and is cancelled before the commit. There is no email (test :326-328, P4). Firm scoping: every query names `ctx.firmId`, and sendWithdrawn
  reads the person in the firm.
* After a withdraw or an edit, the webhook refuses (`!live`, :257). The door refuses CANCELLED with WITHDRAWN or UPDATED words (door.ts:73-75), and the firm
  link only issues on a live request (firm-link.ts:28).
* **Signed offline cancelling after the commit: I agree with this choice.** A paper signature is a fact, and a vendor outage must not refuse to record it. The schema
  enum (`SIGNED_OFFLINE`) and the door's "This agreement has been signed." (door.ts:71) already expect this end. Once the commit lands, our door, the firm link and
  the webhook all refuse, so a live envelope at the vendor cannot add a signature to our records. It goes beyond the row's touch list ("Withdraw and Edit only"),
  but the change is stated in MODULE.rows/FO-5d.md and closes the same QA-770 gap. The leftover is m3.
* Loosened assertions: they are honest. :345 and :357 now see "the request is cancelled", which is the new truth. The added `reqOf(r13)[2] === "CANCELLED"` and the QA-770
  lines pin the new state, so removing the withdraw's end still fails the suite. One cost is listed under m4.

## Issues (ranked)
1. **M1 Major (Must). A withdraw or edit goes through on an envelope the vendor reports as completed.** At signing/service.ts:120 and :127,
   `SigningEnded` is treated as "no change" for any state. The fake (port.ts:163) and the contract (contract.ts:110) raise it for a completed envelope.
   **Failing scenario:** P1. The client and the firm both signed at the vendor, the `completed` webhook is late (vendor retry, or a 409 retry here),
   and a colleague withdraws. Our record says WITHDRAWN, the client is emailed "there is nothing for you to do", the prospect is not won,
   and the sealed copy and its audit file are refused for good. AG-5-34 says Withdraw is "Refused on `EXECUTED`". The row allows only that "a second cancel is no change".
   This is not a regression: main never called the vendor here. But the vendor now tells us, and the code ignores it.
   **Fix:** in `cancelNow`, `SigningEnded` with state `completed` → 409, for example "Everyone has just signed this agreement. Open it again.",
   and roll back. Keep cancelled, declined and not-found as no change. Break m3's line (check_fo6_signing_api.ts:334-346) withdraws over a completed fake envelope:
   either point it at a not-yet-completed envelope or make it expect the refusal, and add a failing line for P1.
   If the Lead rules that "withdraw wins" stays, record that as a decision, and this item drops to Minor.
2. **m1 Minor (Should). The lock order is reversed against the webhook.** Withdraw (:671-672), Edit (:585) and Signed offline lock `fo_retainer` first, then
   `fo_signature_request` (signing/service.ts:113). The webhook locks the request first (:247 `receipt`), then the retainer (:262). That is P2: a deadlock, about 1 s lost, and a
   misleading "someone else saved it" message. The result stays consistent: either side retries. **Fix:** at the start of these three transactions, lock the retainer's live
   request rows (`select … for update`) before touching `fo_retainer`. That matches "writers queue on the request".
3. **m2 Minor (Should). A vendor call inside the transaction has no time limit below Prisma's 5 s.** P3: the vendor cancelled, the commit expired, the user gets a 500,
   and the client's link is dead while the retainer still reads SENT, until someone retries. The retry works, because a cancel on a cancelled envelope is no change. **Fix:** bound
   `port.cancel` in `cancelNow` (for example 3 s, then 503 "Try again") or set the transaction timeout, and map P2028 to 503. This matters once a real adapter exists (fake only today).
4. **m3 Minor (record, no fix now).** The after-commit cancel in Signed offline is only logged, never retried (P5). Our doors refuse, but the vendor
   envelope stays live. Note it for the real-adapter row (an outbox or a sweep).
5. **m4 Minor (Should). Test gaps.**
   * The "newer version" guard (signing/service.ts:264) is no longer reached: line :428 now passes on "cancelled". Its label still claims the guard, and removing the guard leaves
     the suite green. Fix: make version 1's request live again by SQL after the edit, or drop the claim.
   * No line takes the door or the session through a real withdraw or edit. Line :387 checks only the fake's `embeddedLink`. The row says "the door, the session and the webhook refuse".
   * Edit's failed cancel → 503 rollback has no line (P4 shows the code is right).
   * The row names `tests/check_fo5d_decline_withdraw.ts`, but the lines live in check_fo6_signing_api.ts. That is acceptable while Decline is still to come; say so in the PR.

## D1–D20 (API-only item, 0–4)
D1 3 (2) and (3) met except M1 · D2 3 status-guarded, once per request; M1 lets a wrong end in · D3 4 one helper for all three callers · D4 N/A ·
D5 3 a failed cancel rolls back; P3 gives a 500 before the retry · D6 4 audit line in each transaction · D7 N/A · D8–D14 N/A (no page) · D15 4 no per-row requests ·
D16 3 a pass and a fail line for each rule; m4 · D17 simulated only · D18 4 the reason is kept in the audit · D19 3 withdraw→link dead closed; M1 · D20 simulated only.

## BIC-01–BIC-20
N/A: no case-side page in this PR.

Reviewer: Changes c1c181cf0f6e28615f0c5bd1defbc77ceb9cbeed

## Round 2 (diff-only: `git diff c1c181cf0 2bf420e66`; head now `c586f1118`)

I reviewed only the fixes in `c1c181cf0f6e28615f0c5bd1defbc77ceb9cbeed..2bf420e66e2a7367d330860027e6f46ebbed3ca4`. That is 3 files: retainers/service.ts, signing/service.ts
and check_fo6_signing_api.ts. The head then moved to `c586f1118e235c27c599810a6ef8d6236ccd56ac` by one commit of records only. `git diff --stat 2bf420e66 c586f1118` shows 7 files:
5 J-55 screenshots (png), this review.md exactly as round 1 left it, and the round 1 journey report. There is no code in that commit, so this round holds for `c586f1118`.

**Verdict: Approve.** No Blocker or Major is open. Two Minors and some nits are below; none of them blocks the merge.

### What I ran (PostgreSQL :54329, scratch databases dropped; never :4400)
* `check_fo6_signing_api.ts`: **71 passed, 0 failed**, exit 0. The 6 new lines are M1 ×3, m4 ×2 and m2.
* I wrote a second probe script in my scratchpad, outside the repo, with the suite's own set-up (fake adapter, fake mail). Results:
  * **R2-P1** (the round 1 P1 case): withdraw over a completed envelope gives **409 SIGNED_AT_PROVIDER**. The late `completed` then applies: retainer SIGNED, 1 evidence row, prospect won.
  * **R2-P6**: the client and the firm signed at the vendor, but every webhook is late, so the retainer still reads SENT. Edit → **409 SIGNED_AT_PROVIDER**, still SENT:1, request SENT.
    Withdraw → 409 SIGNED_AT_PROVIDER as well. The late events then apply (SIGNED, 1 evidence row).
  * **R2-P7**: Signed offline over a completed envelope → 200, SIGNED_OFFLINE. The late `completed` gets "the request is cancelled" and the log says
    `cancel after the commit did not finish: SigningEnded` (see n1).
  * **R2-P2**: a second connection takes the webhook's order (request, then retainer, then the party's advisory lock), against Withdraw, Edit and Signed offline in turn.
    **No deadlock in any of the three.** Each waits about 400 ms for the hook to commit, then succeeds (WITHDRAWN, DRAFT, SIGNED_OFFLINE).
  * **R2-P3**: a vendor cancel that **succeeds** after 3.5 s → **503 SIGNING_UNAVAILABLE after 3036 ms**, and the database rolls back (retainer SENT, request SENT). The vendor
    has cancelled once by then, so its link is dead. The retry → 200 WITHDRAWN (the vendor now answers "cancelled", which is no change). Exactly 1 "Agreement withdrawn" email.
  * **R2-P8**: another writer holds the request row for 7 s, so the withdraw's transaction runs out of time → **503 TIMED_OUT** "That took too long, so nothing changed".
    Retainer and request stay SENT. The answer came after 7032 ms: Prisma only reports the timeout once the blocked query returns.

### Round 1 findings
* **M1: closed.** signing/service.ts:139 counts `SigningEnded` as no change only when the state is not `completed`. :147 turns `completed` into 409 `SIGNED_AT_PROVIDER`.
  The conflict throws inside the transaction, and `cancelNow` is the last step in Withdraw and Edit, so everything rolls back: no WITHDRAWN, no email, no audit line (test :346-348).
  Cancelled, declined and not-found still count as no change. Signed offline keeps its cancel after the commit, so a paper signature still wins over a completed envelope (R2-P7).
  AG-5-34 governs Withdraw, not Signed offline, and the agreement is signed either way. I accept this.
* **m1: closed.** `lockRetainerSigning` (signing/service.ts:112-115) locks the live request rows in id order. It is the first statement of the transaction in Edit (:587),
  Withdraw (:673) and Signed offline (:746). That is now the webhook's order: `receipt` (:228) takes the request, and the retainer comes later (:282, or `moveRetainer`).
  Signed offline takes request → party → retainer, and the webhook's `completed` takes request → retainer → party (`clearForWin`). The two orders differ after the first
  lock, but both start with the same request row, so they queue on it and cannot deadlock (R2-P2 includes the party lock).
  Other paths: the conflict check takes the party lock only, and Send takes party → retainer on a DRAFT, which has no live request. Neither waits on a request while holding the party.
  When no request is live, nothing is locked first. That is safe: the webhook then refuses on `!live` before it touches the retainer.
* **m2: closed, with a known leftover.** `withinMs(3000)` (:103-107) bounds each vendor cancel. A later rejection of the vendor's promise is still handled by `Promise.race`,
  so there is no unhandled rejection, and the timer is cleared in `finally`. If the vendor's cancel succeeds after our 3 s limit (R2-P3), the outcome is **safe**:
  our records stay SENT, nothing wrong is committed, and the retry closes the gap, because a cancel on a cancelled envelope is no change. One email goes out, as it should.
  What is left is the round 1 P3 window: the user now sees 503 instead of 500, but the client's link may be dead until someone retries. That is the same class as m3.
  P2028 → 503 TIMED_OUT (retainers/service.ts:191) runs before the unique-key and race mapping, and it is right for both of Prisma's P2028 cases (timeout and maxWait).
* **m3: no code change, as agreed.** But it is not recorded anywhere yet: see r2-m2.
* **m4: closed except the file-name note.** Bullet 1: the newer-version guard line now asserts only "cancelled", and its label says the guard is a second wall that no route reaches. That is honest.
  Bullet 2: the door is now covered through a real withdraw and a real edit (WITHDRAWN / UPDATED). The session is not covered, but the door is where it reads the state. Bullet 3: Edit's 503 rollback now has a line.
  Bullet 4 (the row names `check_fo5d_decline_withdraw.ts`) is still not said in the PR: see r2-m2.
* **The rewritten break m3 is honest.** The old line pinned "completed after a withdraw is final", which M1 now forbids. The new pair is a refusal plus the late completion
  applying (:338-353), and "after a withdraw the firm cannot sign at the vendor" (:354-363). Together they keep the guarantee that a withdrawn retainer never gains evidence.

### Remaining issues
1. **r2-m1 Minor (Should). The Edit half of the M1 test does not reach M1.** At check_fo6_signing_api.ts:350-351 the retainer is CLIENT_SIGNED, which `EDITABLE` does not allow
   (retainers/service.ts:41). So the 409 is `NOT_EDITABLE`, which comes before any vendor call, and the line would pass with the M1 fix removed.
   The code is right: R2-P6 shows Edit → SIGNED_AT_PROVIDER. **Fix:** take R2-P6's shape. Act both signatures at the fake without posting them, so the retainer stays SENT, then
   assert `ed?.body.code === "SIGNED_AT_PROVIDER"` with SENT:1. Or relabel :351 "refused as not editable".
2. **r2-m2 Minor (Should). The PR body is stale.** It still names head `c1c181cf0` and 65 lines. It says break m3 "now also accepts the request is cancelled", but that line was
   rewritten. It does not state the M1 refusal (409 SIGNED_AT_PROVIDER), the lock order, the 3 s limit or P2028 → 503. It also lacks the two records round 1 asked for:
   m3 (Signed offline's after-commit cancel is logged, never retried; for FO-6v, an outbox or a sweep) and m4 bullet 4 (the lines live in check_fo6_signing_api.ts until Decline comes).
   **Fix:** update the body. No code change is needed.
3. Nits (no fix required):
   * **n1:** signing/service.ts:139 is shared with `afterCommit` (:156). A completed envelope after Signed offline now logs "cancel after the commit did not finish". It used to be silent.
     The cancel did not fail, so a quiet "completed at the provider; the paper signature stands" would be clearer.
   * **n2:** the comment at retainers/service.ts:746 says "the webhook's lock order (the request, then the party and the retainer)". The webhook takes the retainer before the party.
     It is safe, as explained under m1, but the comment is wrong.
   * **n3:** no line pins m1's lock order or P2028 → 503. Removing `lockRetainerSigning` would leave the suite green. R2-P2 and R2-P8 show both work.
   * **n4:** the `tokenOf` helper (:448) has a filter that always holds (`count(*) … !== "0"`). It is harmless.
   * **n5:** after a timeout, "nothing changed" is not quite true at the vendor (R2-P3). "Nothing was saved" would be exact.

### Journey test (reviewer, round 2; same journeys as `journey-test-reviewer-2026-11-25.md`, rerun through R2-P1 to R2-P8)
| Criterion | Round 1 | Round 2 | Evidence |
|---|---|---|---|
| Task completed | 1 | 1 | J1–J3 complete |
| Next step obvious | ½ | 1 | J9: no deadlock, so no "someone else saved it" (R2-P2). J10: 503 "Try again" |
| Plain words | 1 | 1 | "Everyone has signed this agreement at the signing service; the signed copy is on its way." |
| Feedback and state | 1 | 1 | Refusals name the cause (SIGNED_AT_PROVIDER, TIMED_OUT) |
| Correct data | ½ | 1 | J8: the withdraw is refused, and the late completion applies with its evidence (R2-P1, R2-P6) |
| Error recovery | ½ | ½ | 503 in 3 s, and the retry heals. Until then the link is dead while the retainer reads SENT (R2-P3; m3 class) |
| Accessibility and screen sizes | 1 | 1 | N/A, no page |
| Speed | 1 | 1 | 71 lines; lock waits of about 0.4 s |
| Visual quality | 1 | 1 | N/A, no page |
| Trust and sources | 1 | 1 | Sample values; an audit line in each transaction |

**9.5 / 10, pass.**

Reviewer: Approve c586f1118e235c27c599810a6ef8d6236ccd56ac (code reviewed at 2bf420e66e2a7367d330860027e6f46ebbed3ca4; c586f1118 adds records only)
