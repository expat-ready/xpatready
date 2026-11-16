# Brief: PF-5v, the sign-up verification email reaches an inbox, and sign-up's plain field words (QA-481, QA-484; R1.19, R1.100) (cloud builder lane; row owner Lead B)

Written 16 Nov 11:5x IST by Lead B (6), rev 16.61.
* **QA-481 (Major):** in the running app, `LocalSignUp` keeps the verification code and email in private arrays (`api/src/platform/firms/signup-identity.ts:25-33`). No inbox shows them, so nobody can confirm a sign-up, and R1.19 and R1.100 cannot be walked.
* **QA-484 (Minor):** an empty sign-up answers in the validator's words.

**Model: Opus 5.5, effort: high**: the sign-up door. **Starts when:** now. No open PR touches `platform/firms/`; check at start. AGENTS rule 4 does not apply: no immigration values.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-5v` and take **one row, PF-5v**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** on `main`: `api/src/platform/firms/signup-identity.ts`, `firms/signup.ts` and `firms/routes.ts`, PF-19b's `MailPort` local adapter and `GET /api/demo/platform-inbox` (`platform/messages/demo-inbox.ts`), PF-4b's custom email sender (the pattern: the identity provider's emails go through our one send path, AG-1-70); qa's `tests/qa/check_qa_r1_platform_fo_walk.ts` (its R1.19 and QA-484 lines).

**What to build:**
1. **The local stand-in sends through `MailPort`.** `LocalSignUp.register` hands its verification email (code and link) to `MailPort`, the same one send path as every other email (AG-1-70). With the local adapter, it then shows in `GET /api/demo/platform-inbox?address=`.
   * The code is never in a log or an audit line.
   * The in-memory `sent` list may stay for tests.
   * The "already have an account" email keeps its path, now also through `MailPort`.
2. **Plain words on sign-up's fields** (QA-484), each on its field: "Enter your work email.", "Choose a password.", "Enter your firm's name.". Any other refusal keeps the door's existing words. No validator text reaches an answer.

**Done when** (P-606), in `tests/check_pf5v_signup_mail.ts`, a pass and a fail each:
* `PF-5v DW1`: a valid sign-up puts one email in the demo inbox for that address, carrying a 6-digit code and the confirm link. Confirming with that code creates the firm and its Owner. A wrong code → the existing refusal, with no firm made. Another address's inbox holds nothing.
* `PF-5v DW2`: `POST /api/public/signup` with `{}` names all three fields in the words above. A bad email keeps its existing words.
* `PF-5v DW3`: no code or password appears in any log line or audit line written during the run (scanned). PF-5's, PF-4b's and PF-19b's suites pass unchanged. qa's R1.19 and QA-484 lines pass.

**Touch list:** `api/src/platform/firms/signup-identity.ts`, `firms/signup.ts` (the field words, and passing `MailPort`), the runtime wiring line that constructs `LocalSignUp` (one line), `tests/check_pf5v_signup_mail.ts`.

**Duplicate check (P-526):** BACKLOG (PF-5 part 2 has the Cognito adapter, not this), open PRs (`firms/`), BUGS (QA-481, QA-484); one `Duplicate check:` line.

**Reviewer and breaker** (P-278: the sign-up door, personal data). The breaker tries reading another address's inbox, a code replay, and a sign-up flood.

**P-610:** about 200 lines.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
