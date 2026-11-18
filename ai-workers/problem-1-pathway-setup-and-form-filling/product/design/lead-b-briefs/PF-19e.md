# Brief: PF-19e, sealed transactional bodies, and staff and system mail onto the one send path (AG-1-70; PF-19b part 2's held binding) (cloud builder lane; row owner Lead B)

Written 16 Nov 12:4x IST by Lead B (6), rev 16.64 (#1956 ruling, comment 6910009720). **Model: Opus 5.5, effort: high**: secrets and the shared send path. **Starts when:** PF-19b part 2 (#1956) is on `main`, and PF-19p if it is open (same files: whichever is second waits, P-526). PF-24's `SecretBoxPort` is on `main`.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-19e` and take **one row, PF-19e**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** on `main`: `ports/secret-box.ts` and its contract case, `api/src/platform/messages/send/messages.ts` (where a rendered body is stored at `msg/<firm>/outbox/<id>.json` and its hash kept), the send worker, `messages/demo-inbox.ts`, `MessagesMail` (PF-19b part 2), `features/platform-staff-read.ts` (the `MAIL_PORT` binding), `identity/service.ts:317` ("never stored or logged"), and the firm's daily cap code; #1956's question and ruling.

**What to build:**
1. **Every `TRANSACTIONAL` body is stored sealed:** `SecretBoxPort.seal` for that firm, with purpose `message-body`. PF-19p's platform account messages are sealed under the platform's own key.
   * The stored hash is the hash of the sealed bytes.
   * Only the send worker and the demo inbox open it.
   * No log, audit line or API answer carries the opened body.
   * Non-transactional bodies are unchanged.
2. **The switch:** the app's `MAIL_PORT` becomes `MessagesMail` (one line in `features/platform-staff-read.ts`), so staff and system mail (invitations, sign-in and reset codes) uses the one send path.
3. **Account and security mail is exempt from the firm's daily cap of 50**: `TRANSACTIONAL` messages sent by the platform (the system actor), not by staff to a client. A platform per-address limit applies instead: at most 5 an hour (Sample); above it, 429 with a plain sentence.
4. **A suppressed staff address on an invitation or two-step reset** answers 409 "We couldn't send email to <address>. Ask your firm's Owner or Admin to check it.", writes an audit line, and never answers 500. The address stays suppressed.

**Done when** (P-606), in `tests/check_pf19e_sealed_bodies.ts`, a pass and a fail each:
* `PF-19e DW1`: an invitation's stored body file holds no `invitation#t=` text, and its bytes are sealed. The demo inbox shows the link. The worker sends it. Another firm's key cannot open it.
* `PF-19e DW2`: a marketing body is stored as before. A `TRANSACTIONAL` body is never stored unsealed: the test fails when sealing is removed (shown once, then put back).
* `PF-19e DW3`: with the firm at its daily cap of 50, an invitation and a two-step reset still send. The sixth reset email in an hour to one address → 429.
* `PF-19e DW4`: a reset to a suppressed address → 409 with the sentence, and an audit line. It is never 500.
* `PF-19e DW5`: PF-4b's, PF-19a's, PF-19b's and PF-6m's suites pass, as does the shared mail contract on both adapters. No log line in the run holds a token (scanned).

**Touch list:** `api/src/platform/messages/send/messages.ts` (seal on store), the send worker (open on send), `messages/demo-inbox.ts` (open on read), `features/platform-staff-read.ts` (one line), the cap check (the exemption and the per-address limit), `identity/service.ts` (the 409 on suppression, invitation and reset paths only), `tests/check_pf19e_sealed_bodies.ts`, `api/src/platform/MODULE.md`.

**Duplicate check (P-526):** BACKLOG, open PRs (`send/messages.ts`, `MAIL_PORT`), BUGS; one `Duplicate check:` line.

**Reviewer and breaker** (P-278: secrets, personal data). The breaker tries reading the outbox file through any route, an expired key version, the cap with a mix of kinds, and a reset storm. The release holder reads the diff (P-423).

**P-610:** about 350 lines.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).

## Amendment (18 Nov, #2157 PF-19r part 1, ruling 6987664663)
* **Scope widens to PF-19r's senders.** PF-19e seals **every** TRANSACTIONAL body on store. That covers the staff invitation, the two-step reset notice, the identity provider's code emails, and the complaint reminder's last resort to the firm's contact address. A test per sender checks that its stored outbox file holds no link, token or code text.
* **The cap exemption replaces PF-19r's interim hold:** once DW3 holds (transactional staff mail sends at the cap), update `check_pf19r_senders.ts` DW5. The held invitation and `409 NOTICE_HELD_DAILY_LIMIT` go away. Only marketing and service mail is held at the cap.
* **Gate:** PF-19e must be on `main` before any copy with real people. Until then the unsealed token in the demo outbox file is accepted on demo and test copies only.
* If #2157 merges first, merge `main` in (P-270) and take its senders. If PF-19e merges first, #2157 merges `main` in and takes the sealing.
