Reviewer: Approve 80a6ab20696c22e47f21362d0548451d273d846d

# FO-7c part 2a review, round 4 (reviewer, fresh context, diff only): the pay link and the client's pay door

**Verdict: Approve.** No Blocker or Major is open. Four Minors and two nits are below; none blocks.
* **Head reviewed:** `80a6ab20696c22e47f21362d0548451d273d846d` on `claude/eloquent-goodall-y7jjmw`.
  * The review started on `a437170dd`. The coordinator then moved the head one commit on, to `80a6ab206`, and asked for that commit to be included.
  * That commit changes the two warn lines to log a fixed `kind`, never an error's text (PF-23m). It also adds the pay link's empty body as a PF-28 by-design exception, raising the ceiling 22 → 23.
  * The approval is for `80a6ab206` only.
* **What I read:**
  * `git diff 26583a082 a437170dd -- prototype`: `pay.ts`, `check_fo7c_pay_link.ts`, and `j_57.ts` removed. No reference to `j_57` is left in `prototype/`.
  * `git diff a437170dd 80a6ab206`: `pay.ts`, `rail.ts`, `stripe-rail.ts`, `check_pf28_inputs.ts` and `pf28-allow-list.json`. With whitespace ignored, the JSON change is one added entry plus a re-indented line.
  * `firm-scope.ts`, for the walls.
* **Bar:** `review-part2a-round3.md` (R3-M1, Minors 7-9, n3) and `break-report-part2a-round3.md` (M1, m1, m2). The two residuals the Lead accepted are not raised again:
  * a page paid in the seconds before an offline payment lands;
  * the per-process queue across several API instances.
* **Runs.** All runs were on exact `git archive` copies under the session scratchpad. Postgres was on :54329. I never used :4400 and made no network call to Stripe.

  | Suite | `a437170dd` | `80a6ab206` |
  |---|---|---|
  | `check_fo7c_pay_link.ts` | 45/45 | 45/45 |
  | `check_fo7c_card_payments.ts` | 43/43 | 43/43 |
  | `check_pf23m_log_calls.ts` | not run | 15/15 |

  * The repo's own folder (clean tree) also gave 45/45 and 43/43 on `a437170dd`.
  * `check_pf28_inputs.ts` on `80a6ab206`: the static half passes, including "the allow-list never grows past its committed size" at exceptions 23. The probe sweep needs a running copy on the builder's port, so I did not run it.
* **Mutations:** 17 mutants of `pay.ts`, each run against `check_fo7c_pay_link.ts` in a scratch copy, plus one direct probe of `oneAtATime`. I edited nothing in the repo's working tree. The only file I wrote there is this review.

## Round 3 findings

| Finding | Fixed? | Does a test fail without the fix? |
|---|---|---|
| **R3-M1 / break M1** (Major): a row lock and a pooled connection held across Stripe | **Fixed** (`pay.ts:168-187`). One short repeatable-read snapshot reads the amount due and the payment count, then closes. The create and expire calls then run with no transaction or lock open. Clicks on one invoice queue in-process (`oneAtATime`, `pay.ts:46-55`). The "more than 30 s → 500" shape (round 3's P3 and P7) goes too, because there is no transaction left to time out. | **Yes.** Putting the old `for update` transaction (`timeout: 30_000`) back around the body gives **2 FAIL**. `check_fo7c_pay_link.ts:246`: `{"staffOk":false,"waited":29729,"s":500}`, i.e. staff blocked for 29.7 s and then a 500. The line-262 count also fails. Removing the queue gives 1 FAIL (line 250: `[200,200,200,200,200,200]`), and so does raising the cap to 10. |
| **Minor 7**: the page handed out last was never shown to take a card | **Fixed** (`check_fo7c_pay_link.ts:191-193`). The test is also no longer weaker than it reads: with the firm's name out of the description, `p1` is a live page that the slot-change click expires (`!paysOld` now means something). | **Yes.** `keepId: "none"` gives 1 FAIL (line 193). Dropping the expire call gives 1 FAIL (line 189). |
| **Minor 8 / break m1**: a list or expire failure became a 500 | **Fixed** (`pay.ts:183-185`). The new page is answered and a warn line `card_pay_expire_failed` is written, with `kind` only (seen: `"kind":"Error"`). The old page lapses within 41 min, a residual the Lead accepted. | **Yes.** Rethrowing from the catch gives 1 FAIL (line 254: 500). |
| **Minor 9 / break m2**: a same-slot replay hands out a page that is already expired | **Fixed for the rename** (the description is `Invoice <number>` only, `pay.ts:175`). **Open for the other shape:** a partial credit undone within one slot, with the payment count unchanged, still replays an expired page until the next slot (≤10 min). Round 3 put that shape in the later stored-session-id row (`shape-r1.57.md` follow-ups), and no money is at risk. | **Yes** for the rename. Putting `from ${firm.name}` back gives 2 FAIL (lines 158 and 181). |
| **n3** (Minor 1 of round 2): no certain test of the clock margin | **Fixed** (`check_fo7c_pay_link.ts:183`). The expiry must equal the end of the next slot plus 31 min, with the slot boundary tolerated. | **Yes, deterministically.** `MIN_LIFE_MS` = 30 min gives 1 FAIL (line 183). 21 min, which line 183's tolerance would accept, gives 1 FAIL on the 30.5-min floor (line 184). |

## The checks asked for
* **`oneAtATime` is correct.** Direct probe (a scratch copy with `queues` exported; `tsx` on a stand-alone script):
  * Ordering: a failing fn does not block the next. The run order was a(throws), b, c(throws). At most 1 fn ran at a time per key, and two keys ran in parallel.
  * The cap: the 4th concurrent caller gets **429** while `waiting` is 3. The count includes the one running, so the real limit is 1 running plus 2 waiting (see nit 2).
  * Error and throw paths: after failures the map is empty (`queues.size` 0). A synchronously throwing fn rejects and leaves the map empty.
  * Recovery: after errors, a fresh burst again accepts 3 and refuses the 4th.
  * No leak: 1,000 sequential keys leave the map empty. `q.tail` is replaced on each call and never rejects (`run.catch`), so no unhandled rejection and no growing chain.
  * The decrement sits in a `finally` after `await run`, so the count stays right when a call errors. The 429 is raised before the increment.
* **Nothing else in the diff adds a defect.**
  * `notWork()` is still answered on a snapshot that is settled.
  * The refusal path now builds its offline answer from the snapshot's view.
  * `kind` is cleaned to `[\w ./()-]` and cut to 80 characters (`stripe-rail.ts:59`). The expire path logs a class name or `kind`, never Stripe's text. So the masked-key message that round 3's break run saw can no longer reach the log.
  * The PF-28 exception's reason is consistent with round 3's findings: no field, 422 for an unknown field, 415 for a body that is not JSON.
  * `j_57.ts` is gone, with nothing left pointing at it.
* **The snapshot runs as the firm under PF-12's walls.** It is a Prisma interactive transaction opened inside `open()`'s `withFirm(firmId)` scope (`pay.ts:113`, `169`). PF-12's pool sets `app.firm_id` and the role on checkout in that scope (`firm-scope.ts:53-54`, `591`), and the transaction keeps them. There is no bypass and no new lookup.
  * If the snapshot ran with no firm, the walled tables would read nothing, `snap.f` would be null and every click would be a 404.
  * The suite instead gets 200s with the exact amounts: 1,000.00, then 600.00 after a 400.00 offline payment, read through this snapshot.
  * `first.id` comes from the firm's own token lookup.

## New findings
No Blocker. No Major.

**Minor 10: the suite never checks that clicks on one invoice run one at a time, nor that the count is released after an error.** Each of these mutants passes **45/45**:
* `const run = fn()` (clicks no longer serialised);
* the count released on success only (after 3 failures on one invoice, every later click is 429 until the process restarts);
* the cap at 5 instead of 3.

The probe above shows the head's code is right, so this is a missing test, not a defect. The fix is cheap: put the probe's cases in `check_fo7c_pay_link.ts` next to line 250 (`oneAtATime` is already exported). Those cases are: the order and at most 1 at a time per key, a failing fn followed by a working one, a 4th caller → 429, and the count reset after errors.

**Minor 11 (carried from round 2's Minor 4, still the Lead's call): the snapshot itself is unpinned.** Each of these passes **45/45**:
* dropping `isolationLevel: "RepeatableRead"`;
* dropping the transaction (two plain reads);
* taking the amount from `open()`'s earlier read (`const v = first`);
* dropping the snapshot's `notPayable` check (`pay.ts:173`).

The windows are milliseconds, and the result is the accepted "extra" residual class. No money is at risk.

**Minor 12 (carried from round 3 n2): the warn lines' level and `kind` are untested.** `check_pf23m_log_calls` (15/15) checks the call shape only. Dropping `kind`, or logging at info, would still pass the FO-7c suites. There is still no Stripe request id in the line.

**Minor 13 (records): the PF-28 ceiling 22 → 23 is marked "awaiting the tech lead"** (`check_pf28_inputs.ts:118`, `pf28-allow-list.json`). The reason is sound, but the list's own rule is that it "only shrinks" unless the Lead accepts an entry by name. Record the Lead's acceptance in the PR before merge.

**Nit 1:** `rail.ts:36-38`. The old doc line ("The processor refused a refund") now sits on top of the new one. The new line says `kind` is Stripe's words "or 'fake'", but the default is `"refused"` (seen in the log: `"kind":"refused"`).

**Nit 2:** `pay.ts:46` and `pay.ts:154` say "at most 3 waiting", but the count includes the click being served: 1 running plus 2 waiting. The 429 detail is fine.

## Scores (this diff)
* **D11 3 → 4:** R3-M1 is closed. The P2, P3 and P7 500s are gone.
* **D16 4:** Minors 10 to 12 are untested paths.
* **D1, D2, D5 4; D15 5;** the rest as in round 3.
* BIC-01 to BIC-20 are N/A: this part has no screen.

**Journey score (reviewer, the one score for this check): 8.0/10, pass (8 or more, no 0).** This is re-scored on this diff from round 3's 7.0. There is no page of this part to walk, and j_57 has moved to its own PR, so no browser walk was possible. No separate journey-test report was written: by instruction, the only file written is this review.
* Speed ½ → 1: a staff offline payment during a slow Stripe click saves at once (line 246, under 3 s; the mutant measured 29.7 s). Six clicks at once never tie up the pool (line 250).
* Feedback and state ½ → 1: a failed expire still answers the page (line 254), and no transaction is left to time out into a 500.
* Unchanged at 1: correct data, error recovery, plain words, trust.
* Unchanged at ½ and waiting on FO-7s2 part 2 (the client's page): task completed, next step obvious, accessibility and screen sizes, visual quality.

To raise it: the remaining four ½ scores come with FO-7s2 part 2's page.

**Not checked:**
* a real Stripe test-mode call (part 5);
* whether Stripe's list shows a just-created session at once;
* several API instances (an accepted residual);
* the PF-28 probe sweep, which needs a running copy;
* j_57 (in its own PR).
