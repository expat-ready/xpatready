# Review: FO-7s3a part 1 (R1.58): Record payment (trust off), Money → Payments, payment detail

Independent reviewer (Opus 5.5, did not build it), 25 Nov 2026. Commit reviewed: **`2e1085ca2dc03c8975b23ace39f8e87f588c64ec`** on `claude/awesome-goldberg-pq9c52`, PR #3658, against `origin/main...2e1085ca2`. The PR head has since moved to `45bbc1473` (breaker fixes at `0a11cc94e`). This verdict covers only 2e1085ca2. Spec read: brief `design/briefs/FO-7s3a.md` part 1 (W1, DW1 part-1 half, DW3 trust-off half, DW4, DW5, DW10, DW11, touch list, Done when); `concept-payments.md` (c); `concept.md` §3 BR-1..BR-11; FO-7b `invoices/money.ts` `record()`; `ports/client-money.ts` PaymentIn/PaymentView; FO-7q `reads/payments.ts`, `reads/actions.ts`. Isolated copy `rv7s3a` on :4761 (never :4400 or :4752), live AI off, US$0. Journey report: `journey-test-reviewer-fo7s3a-p1-2026-11-25.md`.

## Verdict: Ship after fixes (Changes). 4 Major (Must), 6 Minor (Should). Journey score 8/10 (pass)
Each Major is a Must on this commit: M1, M2 and M3 match the breaker's round 1 on this same commit and were re-checked here, and M4 is new. The PR body says M1-M3 are fixed at `0a11cc94e`; that fix is not reviewed here. M4 is still present at `45bbc1473` (test lines 246-248).

**Suites on my copy:**
* `check_fo7s3a_payments_trust_browser.ts 4761 xr_studio_rv7s3a`: **34/34, exit 0** on a fresh database.
* `check_fo7s1_invoices_browser.ts` on the same database afterwards: **36/36**.
* A **second fo7s3a run on the same database: 32/34**, with both DW10 lines failing (see M4).
* The screenshots the runs rewrote were restored (`git checkout`), and the copy is stopped.

## Concept fit (c) and BR
* **Fields: met, with gaps the PR names.**
  * The panel has Method (the seven AG-6-19 words, no "Card", DW11), Amount in the invoice's currency with a read-back, Date received and Reference.
  * Paid by and Note are missing because FO-7b's `PaymentIn` takes neither. This is a declared contract gap and is not counted.
* **One key per opening, Record disabled on the first click (AG-6-19 r3): met.**
  * A double click gave 1 payment and 1 key.
  * The same key sent again gave `replayed: true`.
  * A new opening gave a new key.
* **Duplicate reference: met for plain text.** The panel shows the API's words exactly, then Record anyway on the same key. Escape or X asks "Discard this payment?", and closing records nothing. Invisible characters break it: see M3.
* **More than due is never refused: met.**
  * Trust off, CAD: "CAD 200.00 extra", Keep as credit, and the credit ledger holds 20000.
  * USD with trust **No**: "USD 200.00 extra" and "USD 200.00 kept as credit for Client B Sample."
  * Two tabs paying the full balance at once: 2 payments; the second shows "CAD 2,655.50 extra · Paid twice?" with Keep as credit.
* **Success: met.** "R-0012 recorded · Receipt emailed to Client B Sample", then "Part paid · Balance due CAD 1,655.50", with "Not yet cleared" for a cheque.
* **BR-1 (no trust words while trust does not show): met.**
  * I scanned body text, `title`, `aria-label`, placeholders and `<option>`s on the list, the detail and the panel.
  * With **No and nothing held**, as the **Owner** and as the **Billing person**: 0 hits. There was no "Received into" field and no column.
  * The suite covers Unanswered.
* **BR-4: met.** Each figure carries its own currency, and there is no total row.
* **BR-10: met.** Record payment shows from `RECORD_PAYMENT` only, Keep as credit from `KEEP_AS_CREDIT` only, and unknown actions are dropped (`contract.ts:27`).
* **BR-11: met.** Refusals appear on the panel in the API's words: future date, 201 characters ("At most 200 characters.").
* **C5 (DW10): met.**
  * With sees-all off, the Case Officer gets no row and a plain "Payment not found" with no amount.
  * The Billing person, once Client H is out of view, gets the same.
  * `not-a-uuid` gives the same page.
  * A forced POST by the Case Officer gives 403: "Your roles do not include the permission this needs (agent/payment:record)."

## D1-D20
* D1 Requirement fit, 4: (c) is built as written apart from the named gaps.
* D2 Data integrity, 2: the date is off by one day (M2), and a lost answer reads as a refusal (M1).
* D3 Reuse, 4: team Panel, Field and Notice; one `money()`; zod at the edge. D4 N/A.
* D5 Stability, 3: a reload mid-panel writes nothing; a lost answer leaves the panel stuck (M1). D6 Governance, 4: one `payment.recorded` audit line per payment (3 for 3 on INV). D7 N/A (no AI).
* D8 Orientation, 4: Money › Payments › Payment; the detail links back to its invoice. D9 Flow, 4: 4 fields and one primary. D10 Language, 3: see m1. D11 Feedback, 3: see M1.
* D12 Visual, 4. D13 Access, 4: axe 0 at 1440, 1024 and 200 % (720 CSS px at DPR 2); focus after a question (m4). D14 Team look, 4.
* D15 Speed, 5: Record 231 ms, list 111 ms, invoice detail 365 ms. D16 Testability, 3: see M4 and m3. D17 simulated only. D18 Provenance, 4. D19 N/A. D20 simulated only.

## BIC scorecard (EXPERIENCE §6)
| Check | Score | Evidence |
|---|---|---|
| BIC-01 Ask once | Met | the currency and Bill to come from the invoice; nothing is typed twice |
| BIC-02 Asked for a reason | Met | no "Received into" while trust does not show (my No scan; suite Unanswered) |
| BIC-04 Incomplete / invalid | Met | `abc`, `-5`, `10.555`, `1e3` and `0` are refused at the field in words, with nothing sent |
| BIC-11 One primary | Met | `j1-panel-filled-1440`: Record filled, Close ghost; the invoice detail has Record payment… filled and the credit note outlined |
| BIC-12 Check before it leaves | Met | "Recorded as CAD 1,000.00" read back before Record |
| BIC-13 Errors | Partly | M1 says "Not recorded" for an unknown outcome |
| BIC-14 Tooltips | N/A | none on these pages |
| BIC-18 States | Partly | empty, no-match, From after To, not found, loading and refused are all drawn; the lost-answer state is wrong (M1) |
| BIC-19 Cognitive load | Met | one h1, one primary, only document numbers |
| BIC-20 Keyboard / zoom | Met | the suite's keyboard path; `j10-panel-1024` and `j10-list-zoom200` have no sideways scroll |
| BIC-03, 05-10, 15-17 | N/A | no dependent answers, AI, documents, applications, roles, tasks or filing |

## Issues, ranked
* **M1 (Must, breaker M1, confirmed in code):** `record-payment.tsx:53`. A network failure after commit shows "Not recorded. Please try again." and does not invalidate the cache. A person may then record the payment again under a new opening; if they edit the amount first, they are stuck on KEY_USED. **Fix:** say "may have been recorded", read the invoice again, and resend on the same key.
* **M2 (Must, breaker M2, confirmed in code):** `record-payment.tsx:19,23,32,105`. `todayUtc()` is used as the default and as `max`, so in a Canadian evening the payment and its receipt are dated tomorrow. **Fix:** default to the person's local day, capped by the API's rule.
* **M3 (Must here, root in FO-7b):** I recorded `4471`+U+200F on an invoice that already had `4471`. It was recorded as R-0017 (stored hex `34343731e2808f`) with no duplicate question, and it looks identical on screen, so the DW5 guard is bypassed. `money_text_ok` only requires something visible. **Fix:** clean the reference in the screen, as the PR body says `0a11cc94e` does. **For the tech lead:** apply the same fix in FO-7b's `record()` so it covers every caller.
* **M4 (Must, new):** `check_fo7s3a_payments_trust_browser.ts:213-214`.
  * **What:** the test sets `platform.everyone_sees_all=false` and never puts it back: `before` is read and never used.
  * **Effect:** a second run on the same database fails 32/34. The Owner can no longer make Client H's invoice, so `hidPay` never happens. Every later suite in a shared CI or pr-suites shard copy also inherits firm-wide visibility switched off.
  * **Still there:** this is unchanged at 45bbc1473.
  * **Fix:** restore `before` in `finally` (delete the row when it was `none`), and check `hidPay.status` in its own line.
* **m1 (Should, D10):** `record-payment.tsx:87` reads "A refund of it is made from the payment's page once refunds are on this screen." The payment page has no refund, and the sentence describes the build state. **Fix:** remove it, or say "Refunds are not available here yet."
* **m2 (Should, breaker m1):** the footer Close (`:72`) bypasses `confirmClose`, while Escape and X ask first. The suite's DW5 text says "Close, then Discard", but the footer Close asks nothing.
* **m3 (Should, D16):** DW1 in the suite scans only as the Billing person, only with Unanswered, and only `innerText`. The brief also names the Owner, the No state, aria-labels, tooltips and titles. My scan of those passed; add it to the suite.
* **m4 (Should, WCAG 2.4.3):** after the duplicate question, focus sits on the dialog container, not on Record anyway (seen in my walk; breaker m4).
* **m5 (Should, breaker m2/m3):** an amount over FO-7b's limit passes the read-back, and a replay that dropped edits is not said.
* **m6 (outside this PR):** every page title is "Product Studio" (the platform frame's, not this diff).

## Code checks
* **No per-row requests:** the list is one keyset page per request.
* **Server authorisation:** a POST without the key gets 403.
* **No migration and no `api/` change**, as the touch list requires.
* **Rule removal:** if "Received into" is always drawn, the panel, list and detail scans fail. If the duplicate acknowledgement is dropped, DW5's Record anyway line fails. If the key is regenerated per submit, the DW4 replay line fails.

## Could not check
* A real screen reader.
* An unaided walk by an intended user (D17 and D20 stay with the founder).
* The fixes at 0a11cc94e.
* CI on 2e1085ca2.
* The graph view: `graph.mjs --check` exits 0, but it lists `POST …/invoices/:id/payments` and `GET …/payments/:id` as G3 "no test reaches". The pages call them through template URLs, which the tool does not see. This is a limit of the tool, not a finding against this PR.

Reviewer: Changes 2e1085ca2dc03c8975b23ace39f8e87f588c64ec

## Round 2 (25 Nov): `git diff 2e1085ca2..4a4a6509dc9e81ba147286dc453eec7faa125df6`, diff only
Commits `0a11cc94e` (breaker fixes), `272cf71c7` (M4, m1) and `4a4a6509d` (screenshots only). Fresh copy `rv7s3a` on :4761, web bundle rebuilt from the head.

**Verdict: Ship (Approve).** No Blocker or Major is open.

**Suites:**
* `check_fo7s3a` gave **42/42 twice on the same database** (M4 confirmed fixed). `platform.everyone_sees_all` is absent after the runs, as it was before them.
* `check_fo7s1` on that database afterwards: **36/36**.
* The rewritten screenshots are restored and the copy is stopped.

**Round 1 findings:**
* **M1, fixed.** With no answer, the panel now shows "No answer came back, so this payment may already be recorded…", holds the fields (read-only, Method disabled), refreshes the invoice, and resends on the same key. The replay says "…it was not recorded twice." Test lines B-M1 pass and fail.
* **M2, fixed.** The date defaults to the earlier of the local day and FO-7b's UTC day, and `max` is FO-7b's day. B-M2 covers it (Vancouver at 21:30).
* **M3, fixed for what was reported.** `cleanReference` (NFKC folding, then stripping U+00AD, U+200B-200F, U+202A-202E, U+2060-2064, U+FEFF) is sent on every submit. B-M3 shows "4471"+RLM asking "Record anyway?".
* **M4, fixed.** The suite now restores the setting in `finally`, and the DW10 setup is checked on its own line.
* **Minors:**
  * m1 fixed: the refund-promise sentence is gone.
  * m2 fixed: the footer Close asks first and is disabled while busy (B-m1).
  * m4 fixed: focus goes to Record anyway.
  * m5 fixed: amounts over the limit are refused on the field, and a replay is said (B-m2, `data-pay-replayed`).
  * m3 is deferred to part 2's DW1, by the builder's note. I accept that: round 1's hand scan (Owner and Billing, trust No, titles and aria-labels) found 0. **It must land in part 2.**

**New, Minor (Should), none blocking:**
* **r2-m1 (residual M3, root FO-7b):** some marks are still kept by `cleanReference` (`contract.ts:53`) and also pass FO-7b's API. Sent raw to the API after an existing "4471", each of these was recorded with no duplicate question (R-0015 to R-0019):
  * U+061C (Arabic letter mark)
  * U+034F
  * U+115F
  * U+3164
  * U+2800

  U+2066-2069 are refused by the API (INVALID). **Fix:** have the screen strip the same invisible class `money_text_ok` lists. The lasting fix is FO-7b's duplicate check comparing a cleaned form (already the PR's question 2 for the tech lead).
* **r2-m2:** in the "No answer yet" state, Close still asks "Discard this payment?", but the payment may already be recorded. **Fix:** say "It may already be recorded: check Payments before recording it again."

**Code read for round 2:**
* Replay safety holds: FO-7b answers a held key before its duplicate and trust checks, and the held fields match its KEY_USED comparison.
* No `api/` change; the touch list holds (plus the module card row `MODULE.rows/FO-7s3a.md`, P-712).

**Not checked in round 2:** CI on 4a4a6509d; a real screen reader.

Reviewer: Approve 4a4a6509dc9e81ba147286dc453eec7faa125df6

## Round 3 (25 Nov): `git diff 4a4a6509d..c02da9d558987177d3c846d3dfd18d50d209222f`, diff only (the Lead's comment 7155220615)
Fresh copy `rv7s3a` on :4761, web bundle rebuilt from the clean head. The local database cluster was down, so I started it with `pg_ctl` (only the database, not :4400).

**Verdict: Ship (Approve).** No Blocker or Major is open.

**Suites:**
* `check_fo7s3a` gave **45/45 twice** on the same database.
* `check_fo7s1` on that database afterwards: **36/36**.
* The rewritten screenshots are restored and the copy is stopped.

**The changes:**
* **A 5xx after the save is "No answer yet": held.** Only a refusal below 500 is shown as "Not recorded" (`record-payment.tsx:61`). The suite's B-M1 round-2 lines (a 504 after the save) pass.
  * My probe: a slow 503 after the save showed "No answer came back…". Record again replayed it ("…it was not recorded twice."), and the database held exactly one WIRE 2.00 payment.
* **`cleanReference`: held.** It drops `\p{Default_Ignorable_Code_Point}` and `\p{Bidi_Control}`, and folds only U+FF01-FF5E (`contract.ts:55`).
  * In Node, it now cleans U+061C, U+034F, U+115F, U+1160, U+3164, U+FFA0, U+180E, U+2066, U+200D, U+FE0F, U+E0041, U+17B4 and U+1D173. This closes r2-m1 for these.
  * Visible text is kept ("No² ①ﬁ", per the suite).
* **Close, Escape and X while busy: held.** `confirmClose` and the footer Close share `mayClose` (`record-payment.tsx:44`). In my probe, Escape during a 1.5 s Record left the panel open and asked nothing.
* **Words after "No answer yet": held.** Both Escape and Close asked "This payment may already be recorded. Close anyway? The invoice shows it if it was." Dismissing kept the panel open. This closes r2-m2.
* **Focus:** in the "No answer yet" state, focus stays on a button in the panel, not on the page body.
* **Tests:** B-M1 has 2 new lines, B-M3 is widened, and the B-m1 Close line replaces the Escape step. Each has a pass and a fail.

**New, Minor (Should), not blocking:**
* **r3-m1:** U+2800 (Braille pattern blank) is neither default-ignorable nor a bidi control, so `cleanReference` keeps it. FO-7b's `money_text_ok` strips it as invisible. "4471"+U+2800, recorded after an existing "4471", **was recorded without the duplicate question** (browser probe).
  * **Fix:** strip U+2800 too, or better, use FO-7b's own invisible class.
  * The lasting fix is still FO-7b's duplicate check comparing a cleaned form (the PR's question 2 for the tech lead).

**Not checked in round 3:** CI on c02da9d55; a real screen reader.

Reviewer: Approve c02da9d558987177d3c846d3dfd18d50d209222f

## Round 4 (25 Nov): `git diff f1a962afd..77787fa899c3df4d4a65f76b6f199f9eba183905`, diff only (the Lead's comment 7159369398)
**Verdict: Ship (Approve).** No Blocker or Major is open.

* **The change** is one comment line in `tests/check_fo7s3a_payments_trust_browser.ts:19`, the usage line. `&& trap '…stop' EXIT &&` is removed between `isolated.sh fo7s3a 4752 start AI_LIVE=off PLATFORM_IDENTITY=local` and `tsx studio/tests/check_fo7s3a_payments_trust_browser.ts 4752 xr_studio_fo7s3a`.
* **Why it was broken:** `run-suites.sh:391` matches a usage line only in the form `isolated.sh <name> <port> start[ KEY=VALUE…] && (tsx|node) studio/tests/<file>…`. The old line did not match, so the runner started no copy. That fits batch #3738's shard 13 "fetch failed :4752".
* **Confirmed:** from the solution folder, `bash product/tools/run-suites.sh --only check_fo7s3a_payments_trust_browser.ts` gave **PASS, 45/45, 24 s** on commit 77787fa89. It used the runner's own copy (prefix `screens`, slot 2, ports +11000, so not :4752 or :4400). No test copy is left running, and the rewritten screenshots are restored.
* **Nothing else changed.** The code and the other test lines are the same as at c02da9d55, so round 3's Approve and r3-m1 (U+2800, Minor) carry over unchanged.

Reviewer: Approve 77787fa899c3df4d4a65f76b6f199f9eba183905
