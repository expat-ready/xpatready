# Break report, round 2 (last): FO-7t part 2, Pay from trust and refund to the client (API only)

Commit `c28b95329223049ee5aa1e88c03834a97b27bfca` (PR #3442, `claude/brave-gauss-nmhcd5`; fixes in `f7fd4d91b`), 24 Nov 2026. The breaker (Opus 5.5) did not build this and edited no code. Same harness as round 1: the setup of `tests/check_fo7t_money_out.ts`, each run on its own scratch database on 127.0.0.1:54329 (cluster collation `C`), with the Nest app in-process and local sign-in. Nothing ran on :4400, no network, US$0, amounts Sample. The builder's check gives **45/45** at this head. Scripts are in the scratch folder `…/scratchpad/breaker2/`: `break.ts` and `break2.ts` (round 1, re-run), `tail3.ts` (E0-E9) and `tail4.ts` (F1-F2). Logs: `r1a.log`, `r1b.log`, `r2.log`.

## Round 1 findings at this head
* **Major 1 (double-clicked refund): fixed for identical bodies.** B5: two refunds at once gave `[201, 409 DUPLICATE_REFERENCE]` and one row; a later repeat gave 409. C1: two applications gave `[409 DUPLICATE, 201]` and one withdrawal. B2b: 100 identical 1-cent applications gave 1 × 201 and 99 × 409 `DUPLICATE`.
* **Minor 1 (payee reason dropped): fixed.** A payee that is the payer, with a reason, gives 422. A reason with no payee gives 422.
* **Minor 2 (date per party): fixed.** The J2 refund dated before J2's money gives 422.
* **Minor 3 (tick with trust off): fixed.** It gives 409 `TRUST_OFF` "… The invoice was not issued.".
* **Minor 4 (uncleared cheque through a move): still open, and still latent.** B6 still gives 201 with no confirm, because `money-out.ts:67-68` counts only `DEPOSIT` rows. The fix commit does not claim this one.
* **Minor 5 (text and existence oracles): unchanged.** A payee name with a zero-width character inside, or with a Cyrillic letter, still gives 201.

## Findings (no Blocker, no Major)
**Minor A: the refund duplicate guard misses 18 invisible or look-alike spellings.** `money-out.ts:53` (`refKey`) removes only U+200B-D, U+2060 and U+FEFF. `money_text_ok` accepts the other invisible characters as long as the text also has something visible.
* Repro (E1): refund `ET-555`, then the same body with the reference `ET-555` + one invisible character, and no confirm.
* **201 (a second refund written)** for: LRM U+200E, RLM U+200F, soft hyphen U+00AD, CGJ U+034F, Arabic letter mark U+061C, U+180E, U+2062, U+206A, VS16 U+FE0F, VS1 U+FE00, tag U+E0041, U+3164, U+115F and U+2800. Also for the look-alikes Cyrillic `Е`, U+2010 hyphen, en dash and U+2212 minus. **19 refunds were recorded for what reads as one reference.**
* A burst (E2) of 100 at once, alternating `ZZ-9` and `ZZ-9`+LRM, gave 2 × 201.
* F2: U+061C, a direction mark, is stored in `refund_reference` (bytes `d89c`), although the 422 wording promises "no … direction-changing characters".
* Non-ASCII case: `RÉF-ÖΣ-1`, then `réf-öσ-1`, gives **201**. On this cluster's `C` collation, `lower()` changes ASCII letters only (`lower('ÉTÖ-Σ')` = `ÉtÖ-Σ`). It depends on the deployment: an `en_US.UTF-8` cluster (`tools/new-machine.sh:182`) would catch it.
* Why it is only Minor: a double click sends identical bytes, and those are caught. A bypass needs a second, differently spelled entry, for example a reference pasted from a bank email that carries an LRM. The same `refKey` serves deposits (`service.ts:192`).
* Fail test: refund `ET-555`, then `ET-555‎`. Expect 409.

**Minor B: "Record anyway?" clicked twice writes two refunds that can never be corrected, and the acknowledge flag is not tied to anything.** `money-out.ts:141`.
* E3: `ET-777` is recorded. Then two confirmed bodies (`duplicateReferenceAcknowledged: true`) are sent at once. Result: **201, 201**, 3 refunds and 400.00 gone where 200.00 was meant.
* E3: an acknowledged *first* write is accepted, so a client that always sends the flag has no guard at all. 100 acknowledged identical bodies wrote 49 refunds (all that was held).
* Applications do the same with `duplicateAcknowledged` (E4: 100 acknowledged 1-cent applications gave 50 × 201). Those can be corrected (F1).
* This is the residual of round 1's M1. The builder raised it as the idempotency-key question for the tech lead (commit `f7fd4d91b`). It closes when the Lead records the key step or the deferral. Generic references ("Refund", "e-Transfer") make the confirm path the normal one, so this should be settled before a screen ships.

**Minor C: the refund guard can be raced across currencies.** The lock is per currency (`money_trust_lock(f, party, cur)`, `money-out.ts:129`), but the duplicate read covers every currency (`:139`).
* E2: in 20 of 20 rounds, a CAD refund and a USD refund with the same reference, sent at once, **both gave 201**.
* Sent one after the other, the USD one gives 409 `DUPLICATE_REFERENCE`. The result depends on timing. No balance is wrong.

**Minor D: the duplicate guard tells an on-team officer about a case it cannot see.** `money-out.ts:139-141` checks every case of the client.
* E8: user-O (on CASE only). The Owner recorded refund `HIDDEN-REF-42` on CASE2. When user-O refunds on CASE with that reference, the answer is 409 "A trust refund with reference HIDDEN-REF-42 is already recorded for this client." `NOT-THERE-43` gives 201.
* Result: a reference that can be guessed (a cheque number) can be checked against cases outside the officer's view. The officer still gets 404 on CASE2 itself.

**Minor E: "Pay it again?" also fires after the money was returned to trust, and for a different source.** `money-out.ts:101-103`.
* F1: a withdrawal of 100.00, then a `CORRECTION` returning it (written by SQL, net 0 paid), then 100.00 again. Answer: 409 `DUPLICATE` "was paid from trust … a moment ago".
* E4: 50.00 from CASE, then 50.00 picked from CASE2, gives `DUPLICATE` too.
* Both can be confirmed, so nothing is lost. The wording is wrong in the first case, and that case is latent until a return route ships.

## What held
* **The 100-race (E7):** 100 rounds of two applications and a refund on one party and case. 150 × 201 and 150 × 409 `NOT_AVAILABLE`. No 5xx and no 40P01 (deadlock). 0 rounds took more than was available or ended with a balance mismatch. Minimum `balance_after` 0, minimum running sum on the case 0, 0 invoices over-applied, 30 s.
* **E7b, same invoice:** two applications on one invoice (one acknowledged) and a refund, 100 rounds. 150 × 201, 142 `NOT_AVAILABLE`, 8 `DUPLICATE`, 0 bad rounds, 0 over-applied.
* **Guard bursts (E2):** 100 identical bodies alternating two references gave exactly 2 rows. 100 bodies in six covered spellings (`dup-x`, `DUP-X`, `Dup-X `, full-width, U+200B, U+2060) gave exactly 1 row. 100 identical applications gave 1 row.
* **Covered spellings (E1):** case, full-width, trailing spaces, a leading NBSP, U+200B/C/D, U+2060, U+FEFF, U+FFA0, U+2011, U+FE63, a decomposed `É`, NBSP/ideographic/thin/narrow spaces, and doubled spaces all gave 409. `BANKREF77` without spaces is a different reference and gave 201, which is right.
* **Application guard (E4):** 1 cent more or 1 cent less gives 201 (a different amount). The same amount gives 409, and with the acknowledge 201. An upper-case invoice id is still caught. Another invoice with the same amount gives 201. The window: 119 s gives 409, 121 s gives 201. A double-clicked pick writes 1 row. Ack sent as `"true"` or `null` gives 422.
* **Tick against route, 30 rounds at the same instant:** 30 × 200, 27 `DUPLICATE`, 3 `DRAFT`. No invoice has two withdrawals. A tick and then the route gives `DUPLICATE`.
* **No false refusals of a first write (E5):** a refund reusing the client's own deposit reference, another client's refund reference, or firm B's refund reference gives 201. A refund dated yesterday on money that came in today gives 201 (the one-day slack). Two days earlier gives 422, which is right.
* **Nothing left behind:**
  * E0 `TRUST_OFF` (firm B, unanswered or No, nothing held): audit, event and entry counts are equal before and after, no number series row is made, the invoice stays a draft, and the next plain issue takes INV-0001 (no gap).
  * E6 `CHANGED` (the invoice's case moved by another session while the route waited on the payer's lock): 409 `CHANGED`, counts equal, 0 withdrawals.
  * E9: four guard refusals left the counts equal.
* **Walls and C5 (E8, user-O on CASE only):**
  * user-O: a refund on CASE gives 201, and on CASE2 or CASE_C gives 404. PC with no case gives 404. Applying on a CASE2 invoice gives 404, also with the acknowledge. A CASE2 pick gives 404.
  * Firm B on firm A's refund, application or tick gives 404, also with the acknowledge flags.
  * A Case Manager without the keys gets 403 on both routes.
* **Round 1's battery re-run:** amount and tick edges (422, still a draft), picks, credited and written-off invoices, a USD invoice with only CAD money, the shortfall with the party's whole balance (C4: "Only CAD 20.00"), and Yes → No → Yes: all as in round 1.

Verdict: Approve
