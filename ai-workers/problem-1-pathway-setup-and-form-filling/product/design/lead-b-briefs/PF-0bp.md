# Brief: PF-0bp, body-parser errors are problem answers, never 500 (cloud builder lane; row owner Lead B)

Drafted 16 Nov 01:3x IST by the shaping lane, for Lead B's approval (P-558). Row: BACKLOG **PF-0bp** (rev 16.24, from #1823). An enabler: every PF/FO route's error answers (STANDARDS §6 [M] "Errors as RFC 9457 Problem Details with field-level messages"). **Model: Opus 5.5, effort: medium** (one handler, reviewer only).

**Starts when:** now. FO-2 part 1 (#1813), which shared the `main.ts` lines, is on `main`.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-0bp` and take **one row, PF-0bp, body-parser errors as problem answers**, end to end on a fresh branch from `origin/main`, one PR.

**What `main` does today (checked 16 Nov, `81505985`):** `api/src/main.ts` sets `app.useBodyParser("json", { limit: "5mb" })` after FO-2's `publicFormBodyLimit` (32 KB on the web-form door), and `ProblemErrors` already turns an oversized body (`e.type === "entity.too.large"` or `status 413`) into a 413 problem answer ("This request is larger than the 5 MB the server takes…"). **Nothing handles a malformed JSON body** (`entity.parse.failed`, status 400): no line in `api/src` names it, so it falls through to the last branch. Prove that first with the failing test.

**Read only these:** `api/src/main.ts` (`ProblemErrors`, lines ~180-225, and the parser lines ~234-236), `api/src/front-office/sales/public.ts` (`publicFormBodyLimit`, `tooBig`), STANDARDS §6 line 40 (the problem-details line), the module card `api/src/MODULE.core.md`.

**What to build:** in `ProblemErrors`, before the generic branches, `e?.type === "entity.parse.failed"` (or a body-parser error with `status 400` and `expose`) → 400 problem JSON, title "Request refused", detail "The request body is not valid JSON. Nothing was saved or started.", `code: "BODY_NOT_JSON"`. The 413 branch keeps its words; it gains `code: "BODY_TOO_LARGE"`. Neither answer repeats any part of the body or the parser's own message (the parser's message quotes the bad text).

**Done when** (P-606: list the cases in the PR body first). In `tests/check_pf0bp_body_errors.ts`:
* `PF-0bp DW1 pass/fail`: `POST /api/front-office/leads` and `POST /api/platform/complaints` with body `{"a":` and a valid staff token → 400 `application/problem+json`, `code: "BODY_NOT_JSON"`; the same posts with valid JSON reach their handlers (a 2xx or the handler's own 400).
* `PF-0bp DW2 pass/fail`: a 6 MB JSON body → 413 `BODY_TOO_LARGE` on a staff route; the web-form door's 33 KB body still answers FO-2's own 413 words (`TOO_LARGE`), unchanged.
* `PF-0bp DW3`: a malformed body containing `secret-marker-123` → the answer and the captured server log lines hold no `secret-marker-123` (PF-23's log capture).
* `PF-0bp DW4`: neither error reaches a handler (a test-only route counts calls; it stays at 0) and neither answer is a 500.
* `PF-0bp DW5`: FO-2's `check_fo2_leads_prospects.ts` door cases and P-179's 5 MB case pass unchanged.

**Duplicate check:** BACKLOG (PF-0bp; PF-28 "checking every input" is the zod layer inside handlers, not the parser), open PRs (none touching `main.ts`'s `ProblemErrors` at 01:3x IST 16 Nov), `main` (no `entity.parse.failed` in `api/src`), BUGS (none); one `Duplicate check:` line after re-running it.

**Touch list:** `api/src/main.ts` (`ProblemErrors` only), `tests/check_pf0bp_body_errors.ts`, `api/src/MODULE.core.md` only if its invariants name the error answers (else `Card unchanged: <reason>`). **Must still be true:** every suite.

**Contract used:** none (the app's one error filter; STANDARDS §6).

**Parallel safety:** `api/src/MODULE.core.md` (the api-core card) is also edited by CS-C1a #1818: if this row changes the card, whichever merges second merges `main` (prefer `Card unchanged: <reason>`). `main.ts` is the app's one shared file. **PF-4pc** (BACKLOG; waits on CS-C1a #1818) changes `main.ts:244`'s path match; this row changes only `ProblemErrors`, a different block, so the two may run at once and the second merges `main` in. No other open PR touches `main.ts` today; if one opens on `ProblemErrors`, this row waits.

**Reviewer only** (no permissions, money or schema).

**P-610:** about 150 lines with tests; no split.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.
**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
