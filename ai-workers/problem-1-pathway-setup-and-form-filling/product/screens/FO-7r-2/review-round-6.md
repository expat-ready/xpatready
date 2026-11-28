# FO-7r part 2 (R1.111), PR #3753: review round 6 (diff-only, P-303)

Reviewer role, 2026-11-26. Range `9e9ee41ab..b47b4fb34` (HEAD `b47b4fb3433281d3bc22c7e155b4422fa919b99c`). Earlier rounds approved `2eaba6c`; `9e9ee41ab` added reports only. This round looks only at the diff and what it claims.

## What changed
Two test files changed. No product code changed (checked with `git diff --stat`: only `tests/check_fo7r_statement_send.ts` +10 and `tests/check_pf19r_every_sender.ts` +1).

1. `tests/check_fo7r_statement_send.ts`: after the database block, the test now runs `documentRenderPortContract` against `StatementDocuments` (pure, no database).
2. `tests/check_pf19r_every_sender.ts`: adds a SENDERS row for `client-money/reports/send.ts`, `{ mailIn: 1 }`, with its route.

## Is the contract harness honest?
- **The data covers every name in the wording.** `samples/client-money-wording/statement.txt` uses 8 names: `firmName, firmAddress, billTo, period, issuedOn, accounts, held, summary`. The harness `stmt` has all 8, each as a string. `statementText` throws on a missing or non-string name. `""` for `firmAddress`/`held` counts as a string, and that matches what `statementData` produces for a firm with no address and no trust. So the render really fills the template and does not throw by accident.
- **`other` changes the rendered text.** Only `summary` changes, `Owed: CAD 0.00` to `Owed: CAD 0.01`. `{{summary}}` is printed into the page, and the summary is 2 short lines, well under `textPdf`'s 95-character wrap, so the difference reaches the content stream. The contract's "other data, another document" case passed, which it could not do if the reader returned nothing. So the reader is not blind.
- **The reader reads the PDF.** `stmtText` decodes the bytes as latin1 and collects every `(...) Tj T*` line. That is exactly the line format `textPdf` writes (`api/src/client-money/invoices/documents.ts:59`), across all pages. The reader is identical to the one already used for MoneyDocuments (`tests/check_fo7b_invoices.ts:476`) and TrustDocuments (`tests/check_fo7t_trust.ts:406`). The code comment calls it "FO-7b's text-page reader", and that is true.
- **Key order.** `reordered` is the same object with its keys reversed. The text was the same.
- **Refusals.** The adapter refuses an unknown key and `"Not A Key"` because it accepts only `client_money.statement`. A `Date` in the data is refused by `RenderData.parse` (zod `z.json()`), which runs inside `statementText`.

Nit (no action): the reader does not unescape `\(`. Both sides of each comparison escape the same way (`Invoices and payments (CAD)`), so equality is unaffected. This matches the existing MoneyDocuments and TrustDocuments harnesses.

## Is the sender-table route claim true?
- `send.ts:38` imports `mailIn` from `platform/messages/send/mail.ts`. Its only send is `send.ts:103`, `mailIn(mail, tx, …)`, inside `this.db.$transaction` (`:97`), right after `this.audit.record(tx, { action: "statement.sent", … })` (`:98`). That is "in the audit line's transaction". `await out.dispatch()` runs at `:108`, after the transaction resolves. That is "dispatched after commit".
- `mail` is the constructor's `MailPort | null`. A null mail answers `NOT_SENT` (`:85`), so "optional" is true.
- `features/client-money-reports.ts:19-20` builds `StatementSend` with `mail ?? null` from `inject: [Db, PlatformClock, { token: MAIL_PORT, optional: true }]`.
- `MAIL_PORT` has one provider, `{ provide: MAIL_PORT, useExisting: MESSAGES_MAIL }` (`features/platform-staff-read.ts:18`). The same check's S2 enforces this, and S2 passed.
- The count is exact. The scan found `{"mailIn":1,"anySend":0}` for send.ts, and the row says `{ mailIn: 1 }`.

## Runs (HEAD b47b4fb34, from studio)
| Check | Result |
|---|---|
| `node tools/check-port-contracts.mjs` | 0 problems, DocumentRenderPort ×5, exit 0 |
| `node tools/check-port-contracts.mjs --self-test` | 9 passed, 0 failed |
| `tests/check_pf19r_every_sender.ts` | 21 passed, 0 failed |
| `tests/check_fo7r_statement_send.ts` (own DB) | 38 passed, 0 failed, including `PF-0c DW2 DocumentRenderPort StatementDocuments: passes its contract (3 of 3 cases)` |

**Fail before (a throwaway worktree at `9e9ee41ab`):**
- the port guard failed with `FAIL DocumentRenderPort: real adapter StatementDocuments (…statement-document.ts) runs no contract`, exit 1;
- the every-sender check failed S1 with `client-money/reports/send.ts: {"mailIn":1,"anySend":0} send call(s) not in the table`.

Both checks fail without the diff and pass with it.

## Journey score
None this round. This is a diff-only re-review of test changes with no screen change, so no journey was run. The reviewer journey score from earlier rounds stands (`journey-test-reviewer-2026-11-25.md`).

## Findings
- Blocker: none.
- Major: none.
- Minor: none.
- Nit: the reader does not unescape `\(` (above). No action needed.

**Verdict: Approve** for `b47b4fb3433281d3bc22c7e155b4422fa919b99c`.
