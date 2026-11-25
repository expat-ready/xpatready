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
