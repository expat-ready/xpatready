# Review: FO-7r part 2 (R1.111): the client statement PDF and Send statement (API only)

Independent reviewer (fresh context, did not build it), 25 Nov 2026. **Head `9245f58089458dc2b66534f96116ee025620127e`**, branch `claude/sweet-mccarthy-irx5y6`, PR #3753 (the brief's "9245f58085" is a typo of this head: `git rev-parse HEAD` gives 9245f5808**9**…). I read `git diff origin/main..HEAD -- prototype`, the shape `screens/fo-7s-money/build/r1-111-shape.md` (part 2), AG-6-28, AG-6-41 and CC-8, and checked against part 1 (`reports/statement.ts`, `summary.ts`), `invoices/documents.ts` `textPdf`, `ports/audit.ts`, `ports/mail.ts`, `ports/messages.ts` and `platform/messages/send/mail.ts`. No :4400. Code untouched. Journey report: `journey-test-reviewer-2026-11-25.md`.

## Verdict: Block (Ship after fixes). Four Majors, each local; then re-review. Journey 6.5/10

**Suites:** `check_fo7r_statement_send.ts` **16 passed, 0 failed**; `check_fo7r_statement.ts` **46 passed, 0 failed**.
**Reviewer probe** (scratch database `xr_studio_rv_fo7r2_<pid>`, every migration, the same Nest app, guard and firm walls as the check; dropped after each run): injection names, overpayment, 460 lines over 3 pages, exactly 5,000 and 5,002 lines, a double send, a failing audit write, a company without a contact, input edges, and a Case Officer in and out of C5.

## What holds (checked, with evidence)
* **Figures are part 1's JSON, nothing recomputed.** statement-document.ts only formats digits. Probe: 460 lines over 3 pages print in the JSON's order with its amounts and balances (460 of 460 equal); the last balance equals the closing. Exactly 5,000 lines print (200, 0.5 s with statistics). The emailed PDF is byte-for-byte the GET's text (P2).
* **Negatives.** `SIGNED`: −5000 → "-50.00", −5 → "-0.05", 0 and −0 → "0.00", −123456789 → "-1,234,567.89". Overpaid client: "Payment received … CAD -150.00 balance CAD -50.00", "Closing balance: CAD -50.00", with "waiting … CAD 50.00": as part 1.
* **Walls and keys.** Another firm's client: 404 on both routes; no session: 401 (P5). C5: a Case Officer given `invoice:issue` but without the client in scope (everyone-sees-all off) gets **404 on the PDF and on send, no email**. A default Case Officer (show, not issue) gets the PDF (200) and **403 on send**. Routes: `statement.pdf` show, `statement/send` issue (routes.ts:56, :62).
* **Recipients.** A person's email; a company's PRIMARY contact (valid_to null). MailMessage is strict and has no `cc` field, so a Cc cannot be added. No address → 422 naming `to`, before any render or send; the probe's company without a contact gets the same 422 and no email.
* **Audit.** One line per sent email, `statement.sent` on `money_statement` / party id. Detail: ids, period, line count and `closing: ["INVOICES CAD -5000"]`; it passes AuditDetail (no email address). No line on NOT_SENT, 422 or 403 (P6, P2).
* **The 5,000 bound.** 5,001+ → 422 naming `to`, "choose a shorter period", nothing sent. It is checked page by page, so at most 26 pages are read.
* **PDF text escaping.** Name `Client (x) \ Sample) Tj (INJECT` and reference `R) Tj (EVIL \\ (ref)` print literally under poppler's `pdftotext`; `esc` escapes `\ ( )` and replaces control characters with "?". The template fill uses a callback, so `$&` is never expanded and values are not re-scanned.
* **Input.** Strict body and query: `every`, `pageSize`, a bad `caseId` → 422 naming the field; to before from → 422. The PDF is an attachment with no-store and nosniff.

## Findings
**Major 1. Send statement fails in the app for any statement over about 1,420 lines, answered NOT_SENT with no reason**
* **Where:** send.ts:127 puts the whole statement in the email body (`text: statementText(b.data)`). The app's MAIL_PORT is MessagesMail (features/platform-staff-read.ts:18), and MessagePort caps `content.text` at 100,000 characters (ports/messages.ts:29).
* **Scenario:** statement text 1,400 lines = 98,492 characters (accepted); 1,500 lines = 105,542 (refused: "content.text Too big"); 5,000 lines = 352,292. MessagesMail throws MessageRefused, send.ts:128 catches it, and the person gets `{ email: "NOT_SENT" }`. The PDF of the same period prints, and the 5,000 bound promises otherwise.
* **Why the check missed it:** it uses `fakeMail`, which takes any length.
* **Fix:** make the email body a short cover (letterhead, period, closing per account, owed), with the full statement in the attached PDF. Or bound Send at what the channel takes and say so in a 422. Test with a MailPort that applies MessageSend.

**Major 2. The email goes out before its audit line: an audit failure gives a 500, an email with no audit line, and a retry sends it again**
* **Where:** send.ts:126 sends, then send.ts:131 writes the audit in its own transaction.
* **Probe:** a trigger refusing `statement.sent` inserts → **500, one email sent, no line**. P-607 (3) says "no action without its audit line", and AG-6-28 §9 requires "Audit: statement sent".
* **Fix:** write the email with `mailIn(this.mail, tx, …)` (platform/messages/send/mail.ts:105) inside the same transaction as `audit.record`, and run `dispatch` after the commit, as complaints.ts:503 and card/account.ts:176 do. A failed audit line then rolls the outbox row back, so a 500 means nothing was sent.

**Major 3. A case's statement prints the whole client's owed and every case's trust**
* **Where:** send.ts:147 reads the summary without the case (`this.summaries.summary(ctx, kind, id)`). statement-document.ts:207–210 print `sum.totals` (owed, credit, waiting) and every `sum.cases` row's trust.
* **Scenario (from the code):** client with case 1 (CAD 200.00 owed) and case 2 (CAD 900.00 owed, CAD 1,500.00 trust). `statement/send {caseId: case 1}` prints "Closing balance: CAD 200.00", then "Owed: CAD 1,100.00" and "Held in trust for your case <case 2>: CAD 1,500.00". AG-6-28 r3 asks for a statement "on a client or a case".
* **Not tested:** the check never sends or prints with `caseId`. My probe could not seed real cases (C5 needs `runtime_case`).
* **Fix:** with `caseId`, take owed, credit, waiting and held from part 1's own `sum.cases` rows for that case (per currency). Add a pass and a fail test.

**Major 4. The test does not prove Send needs `agent/invoice:issue` (STANDARDS §7 [M]: a rule's test fails when the rule is removed)**
* **Where:** test:427 deletes both `invoice:issue` and `invoice:show` from CASE_OFFICER before the send 403. A send route keyed `agent/invoice:show` would still give 403 there.
* **Status:** the code is right. The Case Officer holds show, not issue, by default (pf3 migration:810), and my probe gives PDF 200 and send 403.
* **Fix:** sign in user-O before any delete: assert send 403 and PDF 200, then delete show and assert PDF 403.

**Minor 1. The multi-page path has no test.** P4 pass prints a period with 0 lines (`to=2026-01-01`, bulk lines dated today), and P1 fits on one page. A paging bug that drops `after` would still pass P4 fail, because page 1 would repeat until it passed 5,000. The probe shows the code is right today (460 of 460 lines). **Fix:** P4 pass on a period with 201+ lines, compared with the JSON pages.
**Minor 2. Pages and summary are separate snapshots** (send.ts:142–147: each `statement()` and `summary()` is its own RepeatableRead transaction). A payment recorded between page 1 and page 2 is counted in page 2's balances but is missing from the lines, and the closing comes from page 1. This is rare: it needs 201+ lines and a concurrent write. **Fix:** one RepeatableRead transaction for every page and the summary, or check last balance = closing and retry once.
**Minor 3. A double click sends two emails** (probe: two concurrent POSTs give 200 and 200, 2 emails, 2 audit lines; the key is `randomUUID()` per request, send.ts:126). AG-6-28 lets a person send again and no record is created, so this is not the [M] idempotent-create rule. **Fix:** an optional body `idempotencyKey` (as payments take), and the part 4 button disabled while sending.
**Minor 4. "Owed" is today's figure, but a period closes at `to`** (statement-document.ts:209). For a past period paid since, the PDF prints "Closing balance: CAD 1,655.50" and "Owed: CAD 0.00". **Fix:** label it "Owed today (<date>)".
**Minor 5. A `caseId` that is not this client's is sent anyway** (probe: an unknown case gives SENT, lines 0, "No entries.", and the audit line is written on that case id). **Fix:** 404 for a case that is not the party's or not in scope.
**Minor 6. A send held by the daily cap answers SENT.** MessagesMail returns `held`, which send.ts:126 ignores; identity's sends report `emailHeld`. FO-7b's invoice email does the same. **Fix:** answer HELD.
**Minor 7. Check gaps and words.** P3 fail does not count emails. A company with no contact is not in the check (the probe holds). "Date 2026-11-25" lacks the colon its neighbours have (statement.txt:9).

**Idempotency ruling (asked):** a double click alone is a Minor (3). Without Major 2's fix it becomes part of that Major: a 500 after a sent email invites the retry that sends a second one.

## D1–D20 (API only; screen dimensions N/A)
D1 Requirement fit 3: r3 PDF, period, trust words and person-only send hold; the case statement is wrong (M3) · D2 Data integrity 3: figures exact, but M1 and M3, and Minor 2's snapshots · D3 Reuse 4: part 1's reads, `textPdf`, `addressOf`, `partyOf`, AuditPort and MailPort reused · D4 N/A · D5 Stability 2: a 500 after a sent email, double sends (M2, Minor 3) · D6 Governance 3: one audit line per send, but an email can go with none (M2) · D7 N/A (no AI) · D8–D14 N/A (no screen) · D15 Speed 4: 460 lines 2.1 s cold, 5,000 lines 0.5 s with statistics · D16 Testability 2: M4, Minor 1, M1 hidden by fakeMail · D17 simulated only · D18 Provenance 4: letterhead, period, date, line kinds in words · D19 not yet: parts 3–4 · D20 simulated only.

**BIC-01–20:** N/A (no case-side screen).
**Graph:** `graph.mjs` lists both new routes as "no page uses it", and the check names them only through a template helper the graph does not resolve. This is the tool limit part 1 saw, not a finding.
**Could not check:** MessagesMail end to end with a real channel (M1 is from the port's schema plus measured text lengths); a real case's statement (M3 is from the code); production query plans (a 5,000-line PDF read straight after a bulk insert, before ANALYZE, went past the 300 s fetch limit; with statistics it took 0.5 s).

Reviewer: Block 9245f58089458dc2b66534f96116ee025620127e

## Round 2 (diff-only, bbeb2bd…)
**Verdict: Approve. Head `bbeb2bd7e112bb743dfe07cd6077f46e848c72de`.** No open Blocker or Major. I reviewed only `git diff 9245f580..bbeb2bd7 -- prototype` (8 files, +195 −72); it answers my round 1 and the breaker's (break-report.md). **Checks:** `check_fo7r_statement_send` **26 passed, 0 failed**; `check_fo7r_statement` **46 passed, 0 failed**, S8 included (load average 0.6). My round-1 probe ran again on this head, and a new probe sent through the real `MessagesMail` with a stubbed message layer. Every scratch database was dropped.
* **M1 fixed.** The email body is `coverText` (statement-document.ts): 306–312 characters, with the full statement only in the PDF. The check's mail port now applies the 100,000-character limit, and a 4,000-line statement is SENT with all 4,000 lines in the PDF. A body put back to the full text would fail that test. My probe: 5,000 lines SENT in 239 ms.
* **M2 fixed.** `audit.record`, then `mailIn`, run in one transaction (send.ts:155–164), with `dispatch` after the commit and `mailReady` first. Probe on the real `MessagesMail.sendIn` path:

  | What happens | Answer | Audit lines |
  |---|---|---|
  | Message queued | SENT | 1 |
  | SUPPRESSED or FAILED | NOT_SENT | 0 (rolled back) |
  | Database error inside the send | NOT_SENT | 0, nothing committed |
  | Audit write refused (trigger) | 500 | 0, and 0 emails (round 1: 1 email) |

  The daily cap now answers HELD (my round-1 m6); I read it in the code but did not run it, because capHolds needs the real `Messages`.
* **M3 fixed.**
  * **Figures:** a `caseId` takes owed, credit, waiting and held from that case's `sum.cases` rows only, and the period reads "…, case C-… only" (statement-document.ts:228–246). The check's case statement shows CAD 1,655.50 and no USD.
  * **Which cases are allowed:** `caseOfClient` (send.ts:209) gives 404 for a case outside the scope's cases or not linked to this party (`caseLinks`). My probe's unknown case now gets 404; round 1 sent it.
* **M4 fixed.** The seeded Case Officer, checked to hold show only, gets the PDF (200) and 403 on Send, before show is removed. A send route keyed on show would now fail that test.
* **Round-1 Minors:**
  * m2 (pages and summary in separate snapshots) fixed: `allLines` is part 1's `read` with `limit + 1` as one page, and it runs with `summaryIn`, the letterhead and the party in one repeatable-read transaction. Probe: 460 lines match the JSON exactly in 56 ms; 5,000 lines print in 203 ms; 5,002 → 422 in 166 ms.
  * m1 (multi-page path untested) is moot: there are no pages now, and the 4,000-line test covers the long read.
  * m4 fixed: "As of <today>:" heads the summary.
  * m5 fixed: a case not this client's is 404.
  * m6 fixed: HELD is answered. m7: "Date:" now has its colon.
* **Breaker items:** a merged-away party is 404 in `partyFor` (part 1's reads too; part 1 still passes 46/46), and an address the mail port refuses is 422 naming `to`.
* **Held again on this head (probe):**
  * escaping of `( ) \` in names and references;
  * negatives ("-50.00", "-0.05", "0.00");
  * Case Officer C5: out of scope gets 404 on both routes and no email; default gets PDF 200 and Send 403;
  * a company with no contact gets 422;
  * strict inputs.

**Still open, Minor (accepted as a stated limit in send.ts's header):** round-1 m3. Two quick sends still give two emails and two lines (probe 200/200). Part 4's button should be disabled while sending.
**New, Minor:** a case with no money rows prints "case on file only" and an "As of …:" heading with no figures under it. Name the case, or print "Nothing owed on this case".
**Observation, not a finding:** `caseOfClient` accepts only the case's own linked client. When AG-6-41's "Bill to another party" lands (AG-7-52), a payer with invoices on someone else's case would get 404 for that case's statement. No route on main bills a case to another party today.
**Journey (re-scored on this head):** 8/10, pass with no 0. Task completed, feedback, correct data and speed each move to 1; next step obvious, error recovery, accessibility and visual quality stay ½.

Reviewer: Approve bbeb2bd7e112bb743dfe07cd6077f46e848c72de
