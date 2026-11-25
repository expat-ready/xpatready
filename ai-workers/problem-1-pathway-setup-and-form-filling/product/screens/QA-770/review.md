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
