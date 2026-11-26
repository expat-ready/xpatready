# FO-7r part 2 (R1.111): break report, statement PDF and Send statement

Head tested: `9245f58089458dc2b66534f96116ee025620127e` (branch `claude/sweet-mccarthy-irx5y6`, PR #3753), taken with `git archive` into the scratchpad.
Harness: the setup of `studio/tests/check_fo7r_statement_send.ts` copied into a scratchpad file (`tests/break_fo7r2.ts` in the archived copy, never in the repo), on its own scratch database on :54329 (dropped). Nest on a random port, never :4400. Fixtures go through the real routes; edge rows are written with SQL in replica mode. The PR's own check passes there (16/16). No product code was edited.

## Breaks

**M1 (Major). An audit failure after the email answers 500: the email has gone and there is no record.** `send.ts:52-58` sends the mail inside `try`, then writes the audit line in its own transaction outside it (`send.ts:61`).
Repro: add a trigger on `audit_event` that raises for `action = 'statement.sent'`, then call `POST …/person/<id>/statement/send {}`.
Observed: HTTP 500 "Internal server error". The client's inbox gets 1 email; `statement.sent` lines: +0 (the audit adapter raises `audit_write_failed`).
Expected (claims "one audit line per send", "a mail is never sent with no record"): every email that goes out has its line, or the caller is told the email was SENT and the line is retried. The caller sees a failure and sends again. The idempotency key is new on each request (`send.ts:56`), so that retry is a second email.

**M2 (Major). With `caseId` or a past period, the document prints the whole client's figures for today next to the narrowed lines.** `send.ts:77` calls `summaries.summary(ctx, kind, id)` with no caseId and no period. `statement-document.ts:46-49` then prints "Held in trust for …" and "Owed" from that summary under the narrowed statement.
Repro A: a client with case C-2026-99001 (invoice CAD 1,000.00) and case C-2026-99002 (invoice CAD 4,000.00, trust CAD 300.00). `GET …/statement.pdf?caseId=<case 1>` prints:
`Closing balance: CAD 1,000.00` / `Held in trust for your case C-2026-99002: CAD 300.00` / `Owed: CAD 5,000.00`.
Nothing on the page says the statement is limited to case 1 (the wording has no case field).
Repro B: `?to=2020-01-31` prints "Period: the first entry to 2020-01-31" and every closing balance as 0.00. Then it prints `Held in trust for you (not yet on a case): CAD 1,500.00`, `Owed: CAD 1,655.50` and `Owed: USD 3,000.00`, which are today's figures, with nothing saying "as of today".
Expected: the figures of one document agree for the case and the period it names, or the figures that are not scoped say what they cover. Part 1's own W2 rule is "closing equals owed".

**M3 (Major). A `caseId` that is not this client's (any UUID, including another firm's case) is mailed, and the audit line names that case.**
Repro: `POST …/person/<id>/statement/send {"caseId":"<random uuid>"}`.
Observed: 200 `{email:"SENT", lines:0}`. The client gets a "No entries" statement that still carries the whole-client "Owed" and trust lines (M2). The audit line has `case_id` and `detail.caseId` set to the foreign id.
Expected: 404 or 422 naming `caseId`, nothing sent, no line ("caseId outside scope", "bad input → 422").

**M4 (Major; needs more than 200 lines and a write during the read). The PDF can contradict itself.** `send.ts:71-77` reads the statement page by page. Each page is its own RepeatableRead transaction (`statement.ts`, `MoneyStatement.statement`), the totals come from page 1 only (`st ??= p`), and the summary is a further transaction.
Repro: a client with 300 issued invoices of CAD 10.00. Wrap the app's `StatementSend.statements.statement` so that a CAD 10.00 payment is recorded after page 1 returns (this stands in for a cashier posting it during the read), then `GET …/statement.pdf`.
Observed: the PDF prints the new "Payment received" line, its last running balance is `CAD 2,990.00` and "Owed" is `CAD 2,990.00`, but `Closing balance: CAD 3,000.00`. The audit line's `closing` holds the stale 3,000.00 too.
Expected: one snapshot, so the closing balance equals the last running balance. The window is the whole read, which is up to about 6 s on a large client (m1).

**m1 (Minor). A large statement costs one full ledger read per page, and a refusal costs about 26 of them.** `send.ts:72-76` re-runs part 1's whole-ledger CTE for each page of 200.
Measured on this machine (Sample rows):
- 4,998 lines, Everything: PDF 1.19 s, send 1.19 s, RSS +18 MB.
- 4,998 lines in the period plus 40,000 earlier: PDF 5.6 s.
- 44,998 lines, Everything: refused with 422 after 6.1 s.
- Page 1 alone: 0.30 s; the summary alone: 0.30 s.

Page 1 already carries `accounts[].lines`, the period's line count, so the refusal over 5,000 could be decided before any further page is read. No budget is named for the PDF, which is why this is Minor.

**m2 (Minor). An address the database accepts but the mail port refuses answers 200 `NOT_SENT`, the same answer as a mail outage.** Examples are `brk@localhost`, `brk..dots@example.org` and `a@@example.org`. They pass `fo_person_email_check`, which requires lower case, no spaces and `_%@_%`, but fail `z.email()` in `ports/mail.ts`, and `send.ts:58` swallows the error. Expected: 422 naming `to` ("this address cannot receive email"), as for no address.

**m3 (Minor). A merged-away person's statement prints and is mailed to the tombstone's own email.** Repro: set `merged_into_id` and `merged_at` on a person with an invoice, then send. Observed: 200 SENT to the merged-away record's email. Expected: 404 or a pointer to the survivor (`common.ts:25` reads the record as stored).

**m4 (Minor; a documented limit). Non-Latin-1 names print as "?" in the PDF while the email text keeps them.** "王小明 Ölçü" prints as "??? Ölçü", and a name of 100 "𝔄" prints as 100 "?". The PDF and the email body then disagree about the client's name. The header comment states this limit, which is inherited from `invoices/documents.ts`.

## What held
- **PDF text injection.** `(`, `)`, `\`, `) Tj ET BT /F1 99 Tf (` in a name are escaped (`textPdf` esc), and `pdftotext` reads the literal text. Long names wrap at 95 characters.
- **Line breaks.** A line break stored in a name does forge a line ("Closing balance: CAD 0.00"). It can only be put there with SQL: every route that writes names (sales `text()`, booking `Name`) and references (`money_text_ok`) refuses line breaks.
- **A client with no name.** It prints and audits as "Client".
- **Company contacts.** Two primary contacts are refused by `fo_company_contact_one_primary_key`. An ended primary gives 422 naming `to`, with nothing sent and no line.
- **Recipients.** Spaces, newlines, upper case and `Bcc:` in an email are refused by `fo_person_email_check`. The mail schema has no `cc` field, and the request takes no `cc` (422).
- **Mail failure after render.** 200 `NOT_SENT`, no line. No mail port: `NOT_SENT`, no line.
- **Double and concurrent sends.** Six at once: 6 × 200 SENT, 6 emails, 6 lines (one per send, as designed: a person may send again).
- **Keys and firms.** Without `agent/invoice:issue`: 403. A Case Officer outside C5 gets a PDF 404. Firm B on firm A's client: 404.
- **Over 5,000 lines.** 5,002 lines: 422 naming `to`, nothing sent. A shorter period prints.
- **No schedule.** `every`, `schedule`, `pageSize`, `after`, `from[]`, a repeated `from` and `__proto__` are each 422 naming the field.
- **Bad input.** Dates that do not exist, years before 2000, `from > to`, a non-UUID or empty `caseId`, a number for `from`, a 10,000-character `from`, `PERSON` and `company/<person id>` give 422 or 404. No 500 except M1. A body of `"x"` or `null` gives 400 from Nest's JSON parser (platform-wide).
- **Figures.** The JSON figures (each line's amount and balance, opening, closing, owed, held) print exactly, and CAD and USD are never added.

Verdict: Changes

## Round 2 (bbeb2bd7e)

Head tested: `bbeb2bd7e112bb743dfe07cd6077f46e848c72de`, only the diff from `9245f58`. I archived it into the scratchpad, where the PR's check passes 26/26. I ran the round-1 repros again twice: once with fakeMail behind a 100,000-character text limit, and once with the app's real mail stack (`MessagesMail` over `Messages` with the local email adapter). Both used scratch databases on :54329, which I dropped afterwards.

**R2-M1 (Major, new in round 2). Reading the whole statement in one query becomes very slow when database statistics are out of date, and the request then fails with a 500.** `send.ts:104-118` runs `allLines` (`statement.ts:125`, a page of 5,001) and `summaryIn` inside one interactive transaction, which has Prisma's default 5 s timeout.

Repro (realistic data): 5,000 clients with 4 invoices each, then `analyze`. Then give one client N invoices with a payment each. The new rows stay below autovacuum's 10 % re-analyze threshold.

Timings, with the PDF before re-analyze, after `analyze`, and part 1's JSON page 1:
- 300 lines: 0.44 s (200); 0.42 s; 0.09 s.
- 800 lines: 8.5 s (**500**); 0.13 s; 0.15 s.
- 2,000 lines: 171 s (**500**); 0.20 s; 0.76 s.

The log says "A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 170873 ms passed". The query keeps a database connection for the whole time. Send fails the same way, so nothing is sent. With no statistics at all (a fresh copy), 1,000 invoices take 72 s and also end in a 500.

Round 1's pages of 200 did not have this problem. The PR's own check adds `analyze` after its bulk insert ("a 5,000-line read before them took minutes"), and that hides it. Expected: a statement within the 5,000-line limit prints whatever state the statistics are in, and never answers 500.

**R2-m1 (Minor, left over from round 1's m2). One address that the database and `z.email()` both accept is still refused later by the mail layer.** `a@b-.example` is the case the mail layer's own comment names. `send.ts:52` checks `z.email()`, but MessagesMail refuses the address in `normaliseAddress`.
- With the app's real port: 200 `NOT_SENT` and no line, where 422 was expected.
- With fakeMail: SENT.
- The 8 other addresses I tried now get 422 naming `to`: `brk@localhost`, `brk..dots@`, `a@@`, `brk@-x.`, `x@example.org.`, `"q"@`, `brk@[127.0.0.1]` and `brk@ex_ample.org`.

**Round-1 findings that now hold**
- **M1:**
  - With the audit trigger raising, the answer is 500, with 0 emails and 0 outbox rows, on both ports.
  - A mail refusal (fake `failOn`, or a real address on the suppression list) gives 200 `NOT_SENT`, with 0 lines and 0 outbox rows.
  - When the daily cap is full, the answer is `HELD`, with one line and one QUEUED row each time.
- **M2:** `?caseId=` prints "Period: Everything, case C-2026-98001 only", with that case's owed only and no other case's trust. With `to=2020-01-31` added, "As of 2026-11-25:" heads today's figures for that case.
- **M3:** another client's case, or a random UUID, gives 404 on both PDF and send, with nothing sent and no line. An upper-case id of the client's own case gives 200.
- **M4:** I read 60 PDFs of a 300-line client while 60 payments were being recorded. All 60 were consistent: last running balance = closing = owed.
- **m1 (with fresh statistics):** 4,998 lines: PDF 0.18-0.23 s, send 0.19-0.22 s. With 40,000 earlier lines: 0.55-0.62 s. 44,998 lines: 422 in 0.32-0.35 s. RSS within +15 MB.
- **m3:** a merged-away person (PDF and send) and a merged-away company (send) give 404. A merged-away primary contact cannot happen through the product, because a merge moves the contact links (`duplicates/merge/columns.ts:18`).
- **Long statements through the 100,000-character limit:** 4,998 lines are SENT. The cover note is 300 characters and the PDF is 368 KB, with every line. With MessagesMail the row is QUEUED.

**Notes, not findings**
- A HELD email still writes "statement.sent / Statement sent to …". Its detail does not say it is held.
- A company billed on a case that is linked to a person is refused with 404 for that case, while part 1's JSON answers it. Nothing on main writes `money_invoice.case_id`, and trust checks the case's party, so this cannot happen today.

Verdict (round 2): Changes

## Round 3 (diff-only, 6434d8e31)

Head tested: `6434d8e31accb76362c7e07f9170a823d0836461`, only `git diff bbeb2bd7..6434d8e3`. Isolated copy `brk3fo7r` on :4433 (`isolated.sh … PLATFORM_IDENTITY=local`: the app's real mail stack, live AI off, US$0), stopped and its database dropped afterwards. Fixtures went through the real routes, and bulk rows were written with SQL in replica mode. Autovacuum was off on the money tables so that the statistics lag stays fixed. Timings are given without auto_explain (I used it only to read the plans). The PR's check passes 33/33, and the PF-28 sweep passes 51/51 against the copy.

**R3-M1 (Major; R2-M1 is only fixed below about 3,500 lines). With out-of-date statistics, a statement inside the 5,000-line limit still answers 500, and so does the summary.**
- Setup: 20,000, then 60,000 other invoices (each with a line and a payment), then `analyze`.
- Then one client gets N invoices with a payment each, not analyzed. In the 81,000-row run the new rows stayed below the 10 % re-analyze threshold.

| Lines (stale) | PDF | Send | Summary alone | Part 1 JSON page |
|---|---|---|---|---|
| 800 | 0.24 s, 200 | 0.26 s | 0.11 s | 0.14 s |
| 2,000 | 1.25 s, 200 | 1.37 s | 0.72 s | 0.65 s |
| 3,000 | 2.7 s, 200 | 2.8 s | | |
| 3,500 | 4.0 s, 200 | 4.0 s | 2.3 s | |
| 4,000 | 5.0 s, **500** | 4.9 s, 200 | | |
| 5,000 | 7.6–8.5 s, **500** | 7.6–8.3 s, **500** | 4.0 s | 3.8–4.5 s |
| 5,000 (5,000 invoices, no payments) | 17.8 s, **500** | | 18.4 s, **500** | |
| 6,000 (over the limit) | 6.0 s, 422 (expected) | | 5.6 s, **500** | 5.8 s, **500** |

- The log shows Prisma P2028: the transaction expired after its 5 s limit.
- After `analyze`, the same 5,000-line client takes 0.24 s (PDF), 0.27 s (Send) and 0.08 s (summary).
- With no statistics at all (a fresh copy), 1,000 lines take 0.28 s, but 5,000 lines take 4.0 s (PDF) and 4.3 s (Send), about 1 s under the limit.
- A failed Send sends no email and writes no line, so it fails closed.
- Cause, from the plans: `wholeSql` removed the page self-join, but `ledgerCtes`, which the PDF, Send, summary and JSON all share, is still quadratic when it estimates 1 row per client:
  - `statement.ts:66-67`: the `inv` total is a Nested Loop Left Join that rescans the grouped line sums for each invoice (2,500 loops, "Rows Removed by Join Filter: 3,123,750", 1.5 s). Its index probe has `invoice_id = inv0.id AND invoice_id = ANY(ids)`, 0.48 ms × 2,500.
  - `statement.ts:79-80`: the payment branch probes the same way, 0.61 ms × 2,500 = 1.5 s.
  - The `agg` change in `summary.ts:46-58` does not touch this, because the time goes into the `ledgerCtes` that it reads.
  - `send.ts:121` and `send.ts:123` run both reads (about 4 s each) in one 5 s transaction (`send.ts:131`).
- Expected (R2-M1): any statement within `STATEMENT_LINE_MAX` prints and sends, whatever the statistics are, and an over-limit client gets 422 or a summary, never 500.

**R3-m1 (Minor). The stale-statistics check cannot catch R3-M1.**
- `tests/check_fo7r_statement_send.ts:230-236` seeds 1,500 invoices (3,000 lines) and bounds them at 3 s. They measured 2,606 ms here and 2,715 ms on the copy, so a busy CI runner will make the test flaky.
- It logs the summary's time but never asserts it (`:233`).
- Nothing tests at or near the 5,000-line limit, which is where the 500 starts.

**What held**
- **R2-M1 at round 2's sizes:** 800 lines now take 0.24 s, down from 8.5 s and a 500. 2,000 lines take 1.25 s, down from 171 s.
- **Figures** (a client with an invoice, payments, a refund, a credit note, a write-off, kept credit, USD, a trust deposit and trust applied, spread over 2026):
  - Periods tried: Everything, from-only, to-only, both, an empty period, a single day, and a case with Everything, from–to, to-only and from-only. In each, every PDF line's amount and running balance equals part 1's JSON, walked in pages of 7.
  - Opening and closing are printed, the last running balance equals the closing, and the audit's `closing` equals the JSON closing.
  - The closing of CAD 1,805.50 equals Σ facts computed by hand, and the bulk clients close at N × 6.00.
- **Period rules:**
  - `{}`, no body, null, `everything`, `" EVERYTHING"`, `ALL`, a number, an array, or a `Period` key: 422 naming `period`.
  - Everything with `from` or `to`: 422 naming `period`. Everything with a `caseId`: 200, case only.
  - Dates with only `to` or only `from`: 200. Dates with neither, or with only a `caseId`: 422 naming `from`.
  - `from > to`, with or without a case: 422 naming `to`.
  - `from` of `""`, `null` or 2026-02-30: 422 naming `from`.
  - Dates with another client's case: 404.
  - None of these sends anything or writes an audit line.
- **Path order:**
  - Kind `logo`, `PERSON`, `person%20`, or `company` with a person's id: 404.
  - An id of `not-a-uuid`, 10,000 characters, or a uuid with a suffix: 404, before the body, even with an unknown field.
  - A well-formed unknown uuid: `{}` gives 422 `period`, and `from > to` gives 422 `to`, before the client lookup. A valid body gives 404.
  - The client's own id in upper case: 200.
  - An array body: 422. `"x"`, `null` or broken JSON: 400 (platform-wide).
- **R2-m1 on the real port:** `a@b-.example`, `a@-b.example`, `a@b.example-`, `ü@…`, `a@bücher.example`, `a@ex.c`, `a.@…`, `.a@…`, an IP literal, `a@example`, `a@b..example`, a trailing dot, `localhost` and `a@b_c.example` each give 422 naming `to`, with no line. None answered NOT_SENT.
- No 500 anywhere outside R3-M1.

**Notes, not findings**
- **Firm wall:** another firm's real client with `{}` gets 404 from the firm-walls interceptor, while an unknown uuid with `{}` gets 422. That tells a caller the id exists in some firm. Any invalid body did the same before this diff, and the behaviour is platform-wide.
- **Order differs between sibling routes:** the PDF and JSON parse the query before the path's shape (`send.ts:114`, `statement.ts:111`), while Send now checks the path first. Each order meets PF-28 (b) on its own.
- **Overlong addresses:** a 65-character local part and 64-character labels are SENT, because the channel's own rule takes them.

Verdict (round 3): Changes 6434d8e31accb76362c7e07f9170a823d0836461
