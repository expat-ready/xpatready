Reviewer: Block 0243e27a7bd7d7192f9ca74bca2d04e127348044

# Round 2 (diff only, 6b67dcf31 → 0243e27a7)

Read diff-only on 22 Nov by the same reviewer, against the round 1 findings below and against the FO-7b payment code on #2953 (`invoices/money.ts`: the replay is checked before the duplicate reference). I did not run the check. Line numbers are those of the file at `0243e27a7`.

**Verdict: Block.** All of round 1's Blockers and Majors are fixed. But the rewrite added one assertion that a correct build cannot pass (N1). The fix is one line. The open Minors (n1-n4) do not block.

## Round 1 findings against the new text
* **B1 fixed:** `receiptsOf` (l. 108) and the DW5 sweep (l. 191) join `money_receipt.trust_entry_id` to the DEPOSIT entry, with `kind = 'TRUST'`.
* **B2 fixed:** l. 130 reads `detail->>'answer_before'` / `'answer_after'` and the actor, filtered by firm A. The header (l. 29) names the audit actions and the shape.
* **M1 fixed:** firm B answers YES (l. 120) before the walls (l. 249-256). The request read, the cancel, the deposit and the request on firm A's client must each be 404. Only the ledger and balances may be empty, and never with totals.
* **M2 fixed, with a residual (n1):** the stand-in is gone. NO with nothing held is tested (l. 118-119). The YES read (l. 121) proves the ledger's 404 meant trust off.
* **M3 fixed:** `GET /requests/:id` is read for Part paid, Paid with "CAD 20.00 more than requested", r1 Paid and r2 Cancelled (l. 224-229).
* **M4 fixed:** a receipt email is found by its attachment filename `${number}.pdf`, an exact match, so `DR-0001.pdf` can no longer match. The match must exist (`!!etMail`, l. 195).
* **M5 fixed:** the refusal case is now a deposit on cancelled r2: 409, no row, no audit line (l. 230-232). A build that pre-checks the cancel in TypeScript never reaches the database, but a test cannot force that, so this is accepted.
* **M6 fixed:** a Case Manager and a Case Officer get 403 on a request and on a deposit (l. 139-140, 164-165).
* **M7 fixed:** `fieldError` accepts 400 or 422. CARD and CARD_TERMINAL accept a field error or 409. The header (l. 26-27) records the newer PF-28 ruling and the question to the tech lead.
* **M8 fixed:** `trust.request_sent` is no longer asserted. The header (l. 8-9) says why.
* **m1:** fixed (migrations and imports are inside `try`; the scratch database is dropped in `finally`).
* **m2:** fixed (one line per request and per cancel; every `trust.%` line has a `staff:` actor; the dead code is gone).
* **m3:** fixed (both emails are checked to go to `fo7t.a@example.org`).
* **m4:** fixed (the receipts are raced on PA and PC, and the series is checked for gaps and repeats). The added concurrent replay is broken: see N1.
* **m5:** fixed by the header (l. 20, 25). No company case was added (n4).
* **m6:** fixed (CARD_TERMINAL is tested).
* **m7:** fixed (pageSize 200 is accepted; `held[].cases` is checked to be an integer; the header gives the reason for the non-Owner read).
* **m8:** fixed (l. 205).
* **m9:** fixed by the header (l. 21).
* **m10:** fixed (a request on another firm's person, l. 158-160; the invoice-read deferral is stated, l. 7-8).
* **m11:** fixed (the comment at l. 43; `EVENT` is read loosely).
* **DW ordering:** firm B's two `trust.answered` lines (NO, then YES) are kept out of firm A's counts (l. 126, 130, 245). The firm-wide `staff:` sweep (l. 263) still holds, because firm B's lines are written by its staff.

## New in the rewrite
* **N1, Blocker, l. 174-175: the concurrent replay reuses d1's reference.** `raced` spreads `d1body`, so it sends `reference: "ET-0001"` on PA with a **new** key. The header (l. 20) defines a duplicate reference as any trust deposit of the same party with that reference. FO-7b, the pattern, checks the replay first and the duplicate second. So a correct build answers **409 DUPLICATE_REFERENCE to both calls**, while the check expects "200,201". It also sends `trustRequestId: r1`, which would put a second 600.00 on r1 if a build let it through. Fix: `dep({ method: "WIRE", amountMinor: 1500, idempotencyKey: "fo7t-replay" })` twice at once, with no reference and no request. The later sums (l. 211-213, 219, 238) read the database, so they still hold.
* **n1, Minor (the residual of M2), l. 112:** the trust-off probe of `GET /requests/:id` still uses an id that does not exist, so its 404 would be the same with trust on. The route now exists (M3), but nothing shows it refuses while trust is off. One way: firm B creates a request while YES, answers NO (nothing is held, since a request is not money), then reads it and cancels it → both 404, then answers YES again. Its audit lines stay out of firm A's counts.
* **n2, Minor, l. 158-160 vs l. 250:** a request on another firm's person accepts "404 or a field error", but the same write from firm B's side must be 404. DW10 says 404. Make both 404, or allow the same codes in both places.
* **n3, Minor, l. 194-195:** "Not yet cleared" is required in the email's subject or text. The brief puts it on the receipt, and FO-7b checks it in the receipt PDF's text. Either read the PDF text the way FO-7b does, or state in the header that the email text carries it too.
* **n4, Nit:** `companyId` is in the contract but never used. No receipt number or event is asserted after the cancelled-request refusal (l. 232).

Journey score: still not applicable, because no route or screen is built at this head.

---

# Round 1

Round 1 verdict line: `Reviewer: Block 6b67dcf31f3af6bf64594dfcd3d6baaf9c88a9a6`

# FO-7t part 1, check-first review: `tests/check_fo7t_trust.ts` read as the specification

Reviewed 22 Nov by an Opus 5.5 reviewer that did not write the check. Head `6b67dcf31` (branch `claude/runtime-fo7t-part1`, PR #3033, draft). I read it against `briefs/track-b/FO-7t-1.md` (on `lead-b/2026-11-22-track-b`), `design/briefs/FO-7t.md` part 1 and DW1-DW6, DW10 and DW18 (on `main`), FO-7b's harness `tests/check_fo7b_invoices.ts` on #2953 (`bb83bcec7`), `prisma/schema/client-money.prisma`, and the FO-7a, FO-7ts and PF-3 migrations, `ports/audit.ts`, `ports/mail.ts` and `api/src/platform/http/input.ts`. I did not run the check (as asked). Port 4400 and other checkouts were not touched. Line numbers are those of the check file.

**Verdict: Block (Rework of the check, not of the design).** The route contract mostly matches the brief, and most DW cases have a real pass. But no correct build can pass this check. Two of its SQL reads name a shape that the schema forbids: B1 makes a correct build fail, and B2 throws and aborts the run. Several of its "fail" halves are also vacuous, so a wrong build passes them. Every fix below is in the one test file, and a re-review needs only the diff.

## Blocker

* **B1, lines 151 and 168: the TRUST receipt is looked up by `payment_id`, which FO-7a forbids on a TRUST receipt.** `money_receipt_kind_check` (migration `20261115042334`, l. 613-615) is `kind = 'TRUST' AND trust_entry_id IS NOT NULL AND payment_id IS NULL`, and `money_receipt_write` requires `trust_entry_id` to name a DEPOSIT entry. So `count(*) from money_receipt where payment_id = <deposit's payment>` is always 0 on a correct build: DW4's pass (l. 151 expects 1) and DW5's "exactly one TRUST receipt per deposit" (l. 168 expects every TRUST payment to have 1) can never pass. Fix: join through the entry, `money_receipt r join money_trust_entry e on e.firm_id = r.firm_id and e.id = r.trust_entry_id where e.payment_id = …` (and `r.kind = 'TRUST'`).
* **B2, line 115: `audit_event` has no `before`/`after` columns.** AuditPort's adapter (`api/src/platform/audit/audit-event.ts` l. 61, `ports/audit.ts` `flattenValues`) writes them into `detail` as `<field>_before` / `<field>_after`. psql errors on `min(before->>'answer')`, the `try` catches it, and the run ends at DW2. Fix: `detail->>'answer_before'` / `detail->>'answer_after'` (or the field name the header pins, e.g. `trustAnswer_*`), and state that field name in the header.

## Major

* **M1, lines 211-215 (DW10 walls are vacuous).** Firm B (`sample-solo`) is still UNANSWERED, so every one of its trust routes answers 404 because trust is off, not because of the wall. Also, `(r.body.items ?? r.body.balances ?? []).length === 0` accepts a **200 from `GET /requests/:id` or `/cancel` carrying firm A's request** (that body has neither key, so the length is 0). A leaking build passes. Fix: have firm B's Owner (`tS`) answer YES first. Then require 404 for the request read, the cancel and the deposit, and allow "200 with an empty page" only for the ledger and balances.
* **M2, lines 97 and 103-104 (DW1).** `GET /requests/${PA}` asks for a request id that does not exist, so it is 404 with trust on or off. The DW1 "fail (stand-in)" is a constant (`planted404` always returns 404) plus a repeat of the pass. DW1's "UNANSWERED **or NO**, nothing held → 404" is never tested for NO. A build that 404s only on UNANSWERED passes. Fix: probe a real request id (create it in firm B after YES, or reuse r1 after a NO on a firm with nothing held). Probe `/cancel` too. Add the NO-with-nothing-held case (firm B: NO → all 404 → YES for M1). Delete the stand-in.
* **M3, `GET /trust/requests/:id` has no pass anywhere.** It is only asked where 404 is expected (l. 97, 211), so a build that never registers the route passes every assertion. The brief's derived status (`Sent | Part paid | Paid | Cancelled`, "CAD 200 more than requested", AG-6-61 rule 8) is likewise untested. Fix: after d1 (60,000 on r1's 60,000), `GET /requests/r1` → 200, `Paid`. Read r2 → `Cancelled` with its number. A second deposit on a request → the extra noted.
* **M4, lines 172 (DW5 "an e-Transfer's receipt does not say Not yet cleared" is vacuous).** `mail.sent.find(m => JSON.stringify(m).includes(d1.body.receiptNumber))` looks for `R-0001`, and r1's request email (sent earlier) contains `DR-0001`, which includes `R-0001`. It also passes when nothing is found (`?? ""`). Fix: find by attachment filename `${n}.pdf` or subject (as FO-7b does, `subject.startsWith("Receipt …")`) and require that it was found.
* **M5, line 222 (DW10 "a rollback leaves none" is not a rollback).** A CARD deposit is refused at the input check, before any transaction opens. A build that writes its audit line outside the transaction still passes. Fix: use a write that the **database** refuses inside the transaction after the route's checks pass, e.g. a deposit on cancelled r2 (`money_payment_write`: "only a sent, not cancelled, trust request takes a payment") or USD on a CAD request. Then assert no audit line, no payment, no entry, no receipt number taken, and no event.
* **M6, keys are never tested (task (b); brief rulings: requests and deposits `agent/payment:record`, ledger `agent/invoice:show`).** Per PF-3's grants, Case Manager (user-T) and Case Officer (user-O) lack `agent/payment:record`, but no case posts a request or deposit as them. A build that puts deposits under `@AnyStaff` passes. Fix: user-T or user-O `POST /requests` and `POST /deposits` → 403, nothing written. Name the keys in the header contract.
* **M7, status codes pinned against PF-28's standing rule (lines 111, 133, 139, 144, 196, 222).** On `main`, a field error is `FIELD_ERROR_STATUS` = **422** (Lead B rev 17.21, `api/src/platform/http/input.ts`; 400 only for an unparseable body). FO-7b answers 422 for CARD and for a missing key (#2953, its P case). The check demands 400 for a bad answer, no party, cancel without a reason and page size 500, and `[400, 409]` for CARD, which excludes FO-7b's own 422. FO-7t.md's "→ 400" (16 Nov) predates rev 17.21. The check must not settle that conflict silently (AGENTS rule 2). Fix: follow the newer ruling, 422 (or accept `[400, 422]` where the brief says 400) and say so in the header, or put a "Question for the tech lead" on the PR.
* **M8, lines 226 and 233 (`trust.request_sent` contradicts FO-7t-1).** FO-7t-1's touch list allows `ports/events.ts`: "the `trust.deposited` line and its payload type **only**". FO-7t.md marks `trust.request_sent` as "proposed here, Lead B confirms", and Lead B's part-1 brief leaves it out. DW18 names only `trust.deposited` (and later parts' events). Fix: drop the two `TRUST_REQUEST_SENT` assertions, or keep them only behind a written Lead B confirmation cited in the header.

## Minor

* **m1, line 61:** the feature is imported before `try`. While it does not exist (red by design), each run leaves `xr_studio_fo7t_scratch_<pid>` behind. Fix: import inside the `try`.
* **m2, lines 219-221:** `failMail >= 0` is always true, and the `update … trust_details = null` is dead. `request_created + request_sent >= 3` allows a request to write two lines. Fix: one line per request (`=== 3`, or per id), and the actor `staff:%` on every `trust.%` line (FO-7b l. 236 does this).
* **m3, DW3/DW5 recipient:** neither email is checked to go **to the party** (`fo7t.a@example.org`). Fix: `mail.inbox(...)`, as FO-7b does.
* **m4, line 173:** both "at the same moment" deposits are on PA/CAD, so FO-7a's party lock serialises them before the receipt is numbered. Fix: use PA and PC (PC is created and unused) so the series itself is raced. Also add a concurrent idempotency replay (FO-7b's double click, l. 294).
* **m5, lines 17-19 vs the brief:** the brief writes `?party=&case=&currency=` and the check uses `personId=&caseId=`. Either follow the brief, or state why (person vs company) and add one company case. The duplicate-reference scope (same party, any request, case-insensitive like FO-7b's `lower()`) is pinned at l. 155 but not stated in the header: state it.
* **m6:** CARD_TERMINAL into trust (refused by the database since `20261118200100`) is not tested. Fix: expect a 4xx, never a 500.
* **m7:** DW6 tests 500 → 400/422 but not the 200/201 boundary. Line 116 pins a non-Owner `GET /answer` → 200, while the brief puts both answer routes under the Owner-only marker. The reading is reasonable (AG-6-59 rule 3's "Ask <Owner>…" needs it), but say so in the header. `held[].cases` and "for 1 case" are in the contract but not asserted.
* **m8, lines 180-181:** the case and USD deposits' statuses are not asserted, so a refusal surfaces later as a confusing DW6 failure. Assert 201.
* **m9, DW4 evidence:** the route stores any caller-given key. How the key comes from `FilesPort` (e.g. the firm's prefix, or that it exists in the files fake) is not pinned. Ask or pin it.
* **m10:** a request or deposit naming another firm's person (PB is created and unused) is not refused anywhere ("never a prospect" is only "no party → 4xx", l. 138). DW1's "an invoice read names no trust field" is left out without saying so: state that it is FO-7b's (part 1 may not touch `invoices/`).
* **m11, line 33:** `EVENT` comes from `ports/events.ts`, which FO-7b calls frozen until #2919 (FO-7b uses `MONEY_EVENT` in `ports/client-money.ts`). Make the import follow wherever #2919 puts client money's names, as FO-7t-1 says.

## Contract match (task (b)), in short
Met: Owner-only PUT (403 for a non-Owner), Yes→No → 200 with held per currency and never 409, DR- from the database at send, no link and no "card" in the request email, empty trust details → stored unsent with "Add your trust payment details", CARD refused, idempotent replay, duplicate reference → 409 then recorded on confirm, "Not yet cleared" on a cheque's receipt, ledger default 50 / maximum 200, newest first with running balance, currencies never summed, C5 fail-closed (Case Officer gets an empty page), `trust.deposited` once per deposit with ids, amount and currency. Broken or vacuous: TRUST receipt per deposit (B1), audit old and new (B2), 404 when off (M2, M3), walls (M1), rollback (M5), keys (M6).

## Journey score
Not applicable: there is no screen or built route at this head (one test file, red by design, and I was asked not to run it). So there is no journey-test report and no score for this round; the journey belongs to the build's review.

## Could not check
I did not execute the check (as asked). Lead B's confirmation of `trust.request_sent` and the 400-vs-422 question are rulings, not facts I can verify here.
