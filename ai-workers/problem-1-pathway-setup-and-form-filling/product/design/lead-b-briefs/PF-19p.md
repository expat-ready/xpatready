# Brief: PF-19p, platform account messages: email to a person before any firm exists (AG-1-70; unblocks PF-5v part 2 and PF-5 part 2's Cognito sign-up email) (cloud builder lane; row owner Lead B)

Written 16 Nov 12:1x IST by Lead B (6), rev 16.62 (#1955 ruling, comment above). **The problem:** sign-up's verification email has no firm to send under:
* `MailMessage.firmId` is required;
* `Messages.send` reads the From name and Reply-To from `platform_firm`;
* `msg_outbox.firm_id` and `msg_firm.firm_id` are foreign keys to `platform_firm`;
* a pending sign-up gets its firm only at verify (P-566).

**Model: Opus 5.5, effort: high**: schema plus a shared port; reviewer and breaker at high. **Starts when:** now. No open PR edits `platform-messages.prisma`, `ports/mail.ts` or `send/messages.ts`; check at start (PF-19b part 2 is starting: whichever starts second waits, P-526).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-19p` and take **one row, PF-19p**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** on `main`: `prisma/schema/platform-messages.prisma` and PF-19a's migration (`msg_outbox`, `msg_firm`), `ports/mail.ts`, `api/src/platform/messages/send/messages.ts` (`send`, where the firm row is read), PF-19b's local adapter and `messages/demo-inbox.ts`, PF-12's policies on the `msg_` tables (if PF-12 is on `main`), and #1955's question and ruling.

**What to build:**
* **Schema** (one migration in `platform-messages.prisma`, P-600, stamped later than `main`'s newest):
  - `msg_outbox.audience`, `FIRM | PLATFORM_ACCOUNT`, default `FIRM`, so every existing row stays `FIRM`;
  - `firm_id` becomes nullable, with a CHECK that `firm_id IS NULL` exactly when `audience = 'PLATFORM_ACCOUNT'`.
  
  Nothing else changes.
* **PF-12's walls:** a `PLATFORM_ACCOUNT` row is readable and writable only by the system role, never by any firm's role. Add the policy beside PF-12's. If PF-12 is not on `main` yet, the policy goes with whichever lands second; say which in the PR.
* **`MailPort`** (`ports/mail.ts`, zod only, its fake in the same file; a shared contract, P-423): `MailMessage` takes **either** `firmId` **or** `platformAccount: true`, never both and never neither (a zod union).
  - `platformAccount` messages are system messages only: never copied, never marketing.
  - Their From name is "ExpatReady". From and Reply-To come from one platform setting (`platform.account_mail_from`, Sample `no-reply@expatready.com`).
* **`Messages.send`:** a `platformAccount` message writes a `PLATFORM_ACCOUNT` outbox row with no firm read, through the same send path, adapters and idempotency. The consent gate does not apply, because these are account messages to the person who asked.
* **The demo inbox** shows `PLATFORM_ACCOUNT` rows by address, as it does firm rows.

**Done when** (P-606), in `tests/check_pf19p_platform_mail.ts`, a pass and a fail each:
* `PF-19p DW1`: a `platformAccount` message is stored with `audience` `PLATFORM_ACCOUNT` and no firm, and shows in the demo inbox for its address. A message with both `firmId` and `platformAccount` → refused by the port. One with neither → refused.
* `PF-19p DW2`: a direct insert of a `FIRM` row with no firm, or a `PLATFORM_ACCOUNT` row with a firm → refused by the CHECK.
* `PF-19p DW3`: a firm's role reads no `PLATFORM_ACCOUNT` row, and the system role reads them (PF-12's walls, if on `main`).
* `PF-19p DW4`: the shared mail contract case passes on the fake and the real adapter (PF-0c). PF-19a's, PF-19b's and every mail suite pass unchanged. The migration test in a parallel world passes.

**Touch list:** `prisma/schema/platform-messages.prisma` + one migration folder; `ports/mail.ts`; `api/src/platform/messages/send/messages.ts`; `messages/demo-inbox.ts`; the platform setting registration (one line); `tests/check_pf19p_platform_mail.ts`; `api/src/platform/MODULE.md`.

**Duplicate check (P-526):** BACKLOG, open PRs (`platform-messages`, `ports/mail.ts`), BUGS (QA-481); one `Duplicate check:` line.

**Reviewer and breaker** (P-278: schema, a shared port, personal data). The breaker tries a firm role reading platform rows, a forged `platformAccount` on a marketing message, and a NULL-firm row by raw SQL. The release holder reads the migration and the port (P-423).

**P-610:** about 350 lines.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
