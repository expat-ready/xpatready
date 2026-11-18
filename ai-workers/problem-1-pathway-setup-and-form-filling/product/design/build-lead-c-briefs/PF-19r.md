# Brief: PF-19r, every remaining email through the one sending path (cloud builder lane; row owner Build Lead C)

Written 18 Nov by Build Lead C. **Approved for building** (Build Lead C's rulings at the end). New row for gap G4 of the end-to-end review (`product/design/release1-end-to-end-review-2026-11-18.md` on branch `lead/2026-11-07-lead31`, Wave 1 lane "Messages") and bug QA-495 (Major). Release 1 rows **R1.47** (one email layout) and **R1.49** (consent gate on every path). It is the first row of the lane; J-48 and J-49 follow it.
**Row id:** `PF-19ms` is already a BACKLOG row on `main` (line 1028: the mailbox screens, "Connect your email and the Unmatched inbox"), so this row is **PF-19r** ("remaining senders"; free on `main`, Build Lead C 18 Nov).
**PR titles:** part 1 `runtime: PF-19r part 1 — staff and system mail through MessagePort`; part 2 `runtime: PF-19r part 2 — the case side's link and code emails through MessagePort`.
**Model:** part 1 Opus 5.5, effort medium. Part 2 Opus 5.5, effort **high** (link tokens and sign-in codes, the consent gate, a person outside the firm).

**Ready when:** checked on `main` 18 Nov.
* PF-19a is on `main` (#1754): `ports/consent.ts`, the consent store.
* PF-19b parts 1 and 2 are on `main` (#1824, #1956): `ports/messages.ts` (`MessagePort`, `layout()`), `api/src/platform/messages/send/messages.ts`, `…/send/mail.ts` (`MessagesMail`: MailPort over MessagePort), `MESSAGES_MAIL` in `api/src/features/platform-messages.ts:21,30`, the unsubscribe page and SES notices.
* **PF-19p must be on `main` first** (in flight on branch `claude/funny-edison-0xod9n`, approved by its reviewer, no BACKLOG row: review D12). It changes `ports/mail.ts`, `ports/messages.ts`, `…/send/mail.ts`, `…/send/messages.ts` and `identity/session/mail.ts`, the same files this row reads. Build on top of it.
* Part 2 waits on part 1.

**What to build.** Every sender found on `main` 18 Nov that sends an email without `MessagePort`. Ten send lines; seven move here, three are not this row's (the table says why).

| # | Sender (file:line on `main`, under `prototype/studio/`) | Goes through today | Class | Part |
|---|---|---|---|---|
| 1 | Staff invitation: `api/src/platform/identity/service.ts:325` (`emailInvitation`) | `MAIL_PORT` = `LocalMail` (in memory), bound at `api/src/features/platform-staff-read.ts:15` | TRANSACTIONAL | 1 |
| 2 | Two-step reset notice: `api/src/platform/identity/session/service.ts:193` | the same `MAIL_PORT` | TRANSACTIONAL | 1 |
| 3 | The identity provider's code emails (forgot password, sign-up, codes): `api/src/platform/identity/session/email-sender.ts:40` (`handleCustomEmail`) | whatever `MailPort` its caller passes; no caller in `api/src` (only `tests/check_pf4b_session_reads.ts:57`) | TRANSACTIONAL | 1 (one line: the deployed function's wiring takes the app's `MailPort` over MessagePort). Not verified: where the deployed function is wired; grep found no caller outside the test |
| 4 | Complaint acknowledgement reminder: `api/src/platform/complaints/complaints.ts:435` | `fakeMail()` at `api/src/features/platform-complaints.ts:20` (nothing is sent at all) | SERVICE | 1 |
| 5 | Case side, link sent again: `api/src/person-link.ts:168` | writes `demo_message` directly | TRANSACTIONAL | 2 |
| 6 | Case side, new link: `api/src/person-link.ts:177` | writes `demo_message` directly | TRANSACTIONAL | 2 |
| 7 | Case side, "Send me a code": `api/src/person-link.ts:285` | writes `demo_message` directly | TRANSACTIONAL | 2 |
| 8 | Sign-up "You already have an account": `api/src/platform/firms/signup.ts:144` | `fakeMail()` at `api/src/platform/firms/runtime-ports.ts:26` | TRANSACTIONAL | not here: PF-5v part 2 (QA-481, in flight, no BACKLOG row) with PF-19p |
| 9 | Sign-up verification code (local stand-in): `api/src/platform/firms/signup-identity.ts:33` (`LocalSignUp.register` keeps it in an array) | nowhere (QA-481) | TRANSACTIONAL | not here: PF-5v part 2 |
| 10 | Booking mail: `api/src/front-office/booking/service.ts:590, 600, 634` | already `MESSAGES_MAIL` (`features/front-office-booking.ts:9`) | SERVICE / TRANSACTIONAL | none: already on MessagePort |

No other sender: `git grep -nE "nodemailer|createTransport|sendMail|mail\??\.send\(|demoMessage\.create"` on `main` finds only the lines above and the SES adapter itself (`api/src/platform/messages/channels/email/ses.ts:9,38,50`, which is MessagePort's own channel).

**Part 1: staff and system mail (senders 1-4).**
* `MAIL_PORT` in `features/platform-staff-read.ts` becomes the app's `MessagesMail` (`useExisting: MESSAGES_MAIL`); `LocalMail` stays only for tests that build it themselves. Because every feature is added to one Nest module (`api/src/features.ts`), this one binding reaches the invitation (`identity/service.ts:85`) and the session service (`session/service.ts:37`).
* The complaints feature takes `MESSAGES_MAIL` instead of `fakeMail()`. A SERVICE email must name its person (`send/mail.ts`: "a service email names its person"), so the reminder's staff query (`complaints.ts:418-421`) also selects the staff id and passes `person: { kind: "STAFF", id }`.
* Each of these emails now has the one layout (firm name on top, "Sent by …" line), the firm's sender name, the gate (a suppressed address gets nothing, transactional included) and the daily cap; the demo shows them at `GET /api/demo/platform-inbox`.
* A refused send keeps today's behaviour per caller: an invitation stays pending and the answer says the email was not sent (`emailInvitation` returns false); the two-step reset rolls back (its comment at `session/service.ts:192`); a reminder that cannot be sent is not recorded as sent.
* Not verified: whether the trial firm's daily cap (Sample 50) can hold back an invitation batch (PF-4c, up to 20 rows); the test covers it either way (DW5).

**Part 2: the case side's link and code emails (senders 5-7).**
* `PersonLinks` takes `MESSAGE_PORT`. Each of the three writes becomes `MessagePort.send(tx, …)` inside the same transaction it runs in today, then `dispatch` after the commit. `person: { kind: "CASE_PARTY", id: subjectId }`, class TRANSACTIONAL, the idempotency key from the link id (and, for a code, the code's row change), never the token or the code.
* **The firm:** the case side has no firm id yet (CS-W1 adds it). Use the case's `firmKey` → `platform_firm.id`, as `api/src/case-close.ts:65` already does. A case whose firm key has no platform firm sends nothing and answers in words ("This firm cannot send email yet"), never a silent success.
* **Refused by the gate:** a suppressed address → no link row change is lost, the person sees "Not sent: this address does not take email from the firm" and nothing is written to the demo inbox.
* **The demo inbox (stand-in SI-20):** the link page (`web/src/runtime/link-page.tsx`) and the case suites read `GET /api/demo/inbox` (`person-link.ts:420-428`), which reads `demo_message`. See question 1: the default in this brief is that `demo_message` keeps a copy written only after `MessagePort` answers QUEUED, so the inbox, its delete-on-link-death rule (`person-link.ts:192, 284, 342`) and the case suites stay as they are.
* Codes and tokens: the rendered message under `msg/<firm>/outbox/` holds the link and the code, as `demo_message` does today. Neither ever appears in a log line, an audit line or an error text.

**Done when (P-606):**
* Part 1: `tsx studio/tests/check_pf19ms_senders.ts` exits 0, each case with a pass and a fail:
  * **DW1:** an invitation from the running app's providers lands in `msg_outbox` with the layout's firm-name header and "Sent by" line; fail: with `LocalMail` bound (today's `main`), no outbox row.
  * **DW2:** an invitation to a suppressed address → SUPPRESSED, nothing sent, the invitation stays pending and the answer says "not sent"; fail: an address not suppressed is sent.
  * **DW3:** a two-step reset notice goes through MessagePort; a refused notice rolls the reset back (the provider is not reset).
  * **DW4:** a complaint reminder reaches the handler through MessagePort with `person` STAFF; fail: a reminder with no person is refused, never sent blank.
  * **DW5:** the trial daily cap holds the 51st email of the day with the "daily limit" reason, and an invitation batch that hits it reports the held rows.
  * **DW6:** a grep test: no file under `api/src/features/` binds `MAIL_PORT` to `LocalMail` or uses `fakeMail(` outside the sign-up ports PF-5v part 2 owns.
* Part 2: `tsx studio/tests/check_pf19ms_case_links.ts` exits 0, each with a pass and a fail:
  * **DW7:** "Send to …" writes one outbox row (CASE_PARTY, TRANSACTIONAL, the case's platform firm) with the layout, and the demo inbox shows the link; fail: a rolled-back send leaves no outbox row and no demo copy.
  * **DW8:** "Send me a code" goes through MessagePort; fail: a code to a suppressed address is not sent and the page says so.
  * **DW9:** the resend of the same link within a minute sends nothing more (break m3 kept); the same idempotency key twice → one outbox row.
  * **DW10:** a case firm key with no platform firm → refused in words, nothing written.
  * **DW11:** no token or code in any log line, audit line or error text (scan the captured output).
  * **DW12:** a grep test: `demoMessage.create` appears only after a QUEUED answer (or nowhere, if question 1 is answered the other way).
* Suites that pass unchanged: `check_pf19a_messages_schema.ts`, `check_pf19b_sending.ts`, `check_pf19b_mail.ts`, `check_pf19b2_ses.ts`, the PF-19p suite, `check_pf4b_session_reads.ts`, `check_pf4c_batch_invite.ts`, `check_pf6m2_invite_recheck.ts`, `check_pf21_complaints.ts`, `check_pf21w_routes.ts`, `check_c616_privacy.ts`, `check_c616_privacy_browser.cjs`, `tests/qa/check_qa359_resend_after_staff_readdress.cjs`, `tests/qa/check_qa357_qa358_c616_words.cjs`, `check_forms_qa53.ts`, `check_pf0p_ports.ts`. A suite that reads `LocalMail`'s inbox from the running app (not one it builds) is changed to read the platform inbox, and the PR names each such line.
* `node studio/tools/check-port-contracts.mjs` exits 0; the module-card check passes; full `ci` is green.

**Duplicate check:** `git grep -nE "MAIL_PORT|fakeMail\(|demoMessage\.create" origin/main -- prototype/studio/api/src` gives the ten lines above; BACKLOG has no row that moves senders 1-7 (grep "QA-495", "remaining senders": 0 rows; G4 says the same). Overlaps: PF-19p (in flight, same message files: wait for it); PF-5v part 2 (in flight, owns senders 8-9); PF-19b's own row text says "MailPort becomes a thin caller of MessagePort", done for booking only.

**Touch list:**
* Part 1: `api/src/features/platform-staff-read.ts`, `api/src/features/platform-complaints.ts`, `api/src/platform/complaints/complaints.ts` (the reminder's query and `person`), `api/src/platform/identity/session/mail.ts` (comment: test-only), new `tests/check_pf19ms_senders.ts`, one sentence in `api/src/platform/MODULE.md`.
* Part 2: `api/src/person-link.ts`, `api/src/features/person-link.ts`, new `tests/check_pf19ms_case_links.ts`, one sentence in the case side's module card if it has one (Not verified: which card lists `person-link.ts`).
* No schema, no migration, no screen. Not `ports/*` (PF-19p's), unless the review asks.

**Review:** an Opus reviewer for both parts, **and the breaker** for both (consent gate and sending to people outside the firm, P-278; part 2 also link tokens and codes). The breaker tries:
* an invitation or code to a suppressed address;
* the 51st send of a trial day;
* a resend pressed twice at once;
* a case of firm A sending as firm B's sender;
* a token or code in a log, an audit line or a refusal text;
* a rolled-back case change that still sends.

**Holds and parallel safety:** part 1 and part 2 touch different files, but part 2 starts after part 1 merges (one lane). No other Wave 1 lane edits these files. `api/src/platform/MODULE.md` is a busy 40-line card: merge `main` before the first push. Do not edit `person-link.ts` while a case-lane PR has it open (check open PRs first; if one has, ask in a PR comment).

**Questions for the tech lead (answer before part 2 starts):**
1. The case side's demo inbox: keep `demo_message` as a copy written after a QUEUED answer (this brief's default; least change, case suites unchanged), or move `GET /api/demo/inbox` and the link page onto the platform inbox and retire `demo_message`'s writes (one inbox, but the delete-when-the-link-dies rule and the case suites change)?
2. The row id: `PF-19r` is taken (mailbox screens). Confirm PF-19r, or name another.

**Standard rules:** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`.

**Audit actors (Lead 80, 18 Nov, after #2003 AUD-1a):** the audit trail refuses an actor word with no type. A test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients), never a bare word like `test`. #2003 is on `main` (merge `fa2c6865c`): build on it.

**Build Lead C rulings (18 Nov):**
* The id is **PF-19r**, because PF-19ms is taken (BACKLOG line 1028, the mailbox screens). The current Lead adds the BACKLOG row.
* Demo inbox: keep `demo_message` as a copy written after MessagePort accepts the send. No move to the platform inbox in this row.
* PF-19p is in flight on the same message files, so part 1 starts only after PF-19p merges, and the two parts run one after the other.

**Overlapped chain (Lead 81, the founder's "start doing it", 18 Nov 22:5x IST; this replaces "Ready when" and "branch from `origin/main`" above):** PF-19p (#1961) is merged, so PF-19r branches from `origin/main` as written. J-48 branches from this row's approved head.
