# Brief: CS-C1s, a screen to record a decision, withdraw, close and reopen a case (screens lane; row owner Build Lead C)

Written 18 Nov by Build Lead C. **New screen row**, from gap **G3** of the end-to-end review of 18 Nov (`release1-end-to-end-review-2026-11-18.md` on `lead/2026-11-07-lead31`, line 202) and bug **QA-502** (Gap · Major, `product/qa/BUGS.md` line 31 on `main` 15c75cd52). Release 1 row **R1.77** (map 77, "Submission number and UCI; decision, close, reopen"): Partial since 17 Nov with every API part merged (`product/qa/CAPABILITIES.md` line 227). This row is the screen that turns it to Works. It follows design before build: **part 1 = concept** (skill `screen-concept`), **part 2 = build** (skill `screen-build`). Not verified: whether P-663's hold on new capability rows covers a screen row that only closes a Partial; Build Lead C asks the current Lead before part 2 starts.

**The API, already on `main`** (CS-C1a #1818, CS-C1b #2002; verified in `api/src/features/case-close.ts` and `api/src/case-close.ts`):
* `POST /api/runtime/cases/:id/decisions`, key `agent/case:record-decision`. Body `CaseDecisionBody` (`contracts/runtime.ts:525`): `filingId`, `outcome`, `decidedOn` (YYYY-MM-DD), optional `note` (at most 2,000 characters), optional `idempotencyKey`. A second decision on a filing is a correction (a new row).
* `POST /api/runtime/cases/:id/withdraw`, same key. Body `CaseWithdrawBody`: `reason`, `withdrawnOn`. Refused 409 `HAS_DECISION` once any filing has a decision.
* `POST /api/runtime/cases/:id/close`, same key. Body `CaseReasonBody`: `reason` (at most 1,000 characters). Refused 409 while a filing has no decision.
* `POST /api/runtime/cases/:id/reopen`, key `agent/case:reopen`. Body `CaseReasonBody`. Refused 409 `CASE_OPEN` on an open case.
* All four sit behind PF-4's guard: they take the **staff bearer session** (`staffOf(r)`), never `x-actor`.
* **What is missing for a screen:** nothing in `web/src` calls these routes, and the case read (`runtime.ts:354`) returns `status` only: no outcome, reason, dates or decision rows (QA-502).

**Outcome words: S (to source).** AG-7-33 rule 4, `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-07-case-core-and-delivery_v3.12_2026-10-28.md` line 3903: "The decision vocabulary comes from the pack." Rule 3 (line 3902) names `APPROVED`, `REFUSED` "or another value from the pack". On `main` the list is `DECISION_OUTCOMES = ["APPROVED", "REFUSED"]`, commented "Sample until cited" (`contracts/runtime.ts:502-504`). No official IRCC page in `official-sources/ircc/` cites decision words (grep on `main`, 18 Nov). So the screen shows the outcome words and the close outcomes (`WITHDRAWN`, `COMPLETED`, `CLOSED_BY_STAFF`) **labelled Sample**. If the concept wants IRCC's own words, it cites an official IRCC page with URL, quote and date; otherwise they stay Sample.

---

## Part 1: concept (records only)

**PR title:** `screens: CS-C1s part 1 — concept: decision, withdraw, close, reopen on the case page`
**Model:** Opus 5.5, effort high.
**Ready when:** **now**. Records only: no code.

**What to build:** follow `.claude/skills/screen-concept/SKILL.md` steps A to C for one panel on the case page (`web/src/runtime/cases.tsx`, under `SubmissionPanel` at line 403).
* **Job:** a case officer with the key records the authority's decision on a submitted filing, corrects one, withdraws a case before any decision, closes a decided case with a reason, and reopens a closed case with a reason. The case header shows the outcome, the reason and the date.
* **Rules to show** (AG-07 v3.12): AG-7-33 rules 1-3, 5 and 8 (line 3892 on); AG-7-50 (withdraw, line 4005); AG-7-34 rule 2 (close, line 3968); AG-7-13 rules 2, 3 and 7 (reopen, line 4080); BR-10 (the key is not `agent/case:edit`). **Out of scope, named in the concept:** AG-7-33 rule 6 (next options on a refusal) and rule 7 (the class-2 client message box), auto-close (AG-7-34 rule 1), and a filing's own withdrawal (AG-7-50 rule 3).
* **States:** open, no filing submitted (no Record a decision); a filing submitted (Record a decision); every filing decided (Close the case); closed or withdrawn (outcome, reason, date; Reopen); each refusal's words from the API (the 409 texts in `case-close.ts`); no key (the action is not offered, and the panel says who can); no staff session (see question 1).
* **The read the screen needs** (the concept decides; recommended): a new `GET /api/runtime/cases/:id/decisions` in `features/case-close.ts`, reading the closing fields, the decision rows and each active filing with "submitted" and its latest decision. Key `agent/case:show` (Not verified: the right read key; it exists in PF-3's seed, `migrations/20261114015002_pf3_platform_tables/migration.sql:593`). This keeps `runtime.ts` untouched, so it does not clash with CS-K1's change to the case read.
* **Write:** `screens/CS-C1s/concept.md` (under 100 lines, ending with the definition of ready), a self-contained HTML board in `screens/CS-C1s/design/`, then a **fresh challenge** by a new agent in `screens/CS-C1s/challenge.md`. **No board for the founder:** Build Lead C approves after the challenge (P-223 (4)).

**Questions the concept must answer (at most three):**
1. **Session:** the case page calls the API as the simulated person (`useActorId`, `api`), but the four routes need a staff bearer token. Recommended: the panel calls through `staffApi` (`web/src/modules/platform/session.ts:68`; the front-office lead page uses a `staffApi` from its own `sales/session`, Not verified whether it is the same one), and shows the staff sign-in card when there is no session. Not verified: which sign-in card component the case page can reuse.
2. **Where it sits:** one panel under Record the submission, plus one line in the case header.
3. **Outcome words:** Sample, or cited IRCC words (above).

**Done when:** `concept.md`, the board and `challenge.md` are on the branch; the challenge's objections are answered in the concept; Build Lead C writes "Approved for building" in `concept.md`. No code, no test.

**Duplicate check:** `git grep -n "CS-C1s\|/decisions\`\|/close\`\|/reopen\`\|/withdraw\`" origin/main -- product/BACKLOG.md studio/web/src` → no row and no caller; the only `/withdraw` calls are the library's own (`library-forms.tsx`, `review-items.tsx`, `structure.tsx`).

**Touch list:**
* new `screens/CS-C1s/concept.md`
* new `screens/CS-C1s/design/` (one HTML board)
* new `screens/CS-C1s/challenge.md`

**Review:** an Opus reviewer reads the concept against the skill's checklist. No breaker (records only).

---

## Part 2: build

**PR title:** `screens: CS-C1s part 2 — decision, withdraw, close, reopen on the case page`
**Model:** Opus 5.5, effort high (permission keys on a screen).
**Ready when:** part 1 is merged with "Approved for building" in `concept.md`, and the current Lead has confirmed the P-663 point above.

**What to build:** the approved concept, through `.claude/skills/screen-build/SKILL.md`. Expected:
* the read route in `features/case-close.ts` and `case-close.ts` (`CaseClose.view`), firm-scoped (another firm's case → 404);
* one panel, new `web/src/runtime/case-decision.tsx`, mounted in `cases.tsx`, with four dialogs (Record a decision, Withdraw the case, Close the case, Reopen the case), each with its reason or note field and the API's own refusal words;
* the case header line: "Closed · <outcome> · <date>" with the reason, and a "Sample" mark on the outcome words;
* no new rule in the screen: every check stays in `contracts/runtime.ts` and the API.

**Done when (P-606):**
* `tsx studio/tests/check_csc1s_view.ts` exits 0 (the read route), each case with a pass and a fail:
  * **DS1:** the read lists the decision rows, the closing fields and each filing's "submitted" flag; another firm's case → 404.
  * **DS2:** without `agent/case:show` → 403.
* `node studio/tests/check_csc1s_decision_browser.cjs` exits 0: a browser journey at 1440 px and 375 px, with axe:
  * **DS3:** a staff person records Approved (Sample) on a submitted filing, closes the case with a reason, sees the outcome, reason and date in the header, reopens with a reason, and the case is open at the same stage.
  * **DS4:** a case with no decision is withdrawn with a reason and date; the header reads Withdrawn.
  * **DS5 (fail cases):** Close with a filing undecided shows the API's words and changes nothing; Withdraw after a decision shows "A filing has a decision…"; an empty reason shows "Give a reason."; a person without `agent/case:record-decision` is not offered the actions, and a forced call is 403.
* qa's `tests/qa/check_r177_case_decision.ts` passes **46/46** (its last line fails today because there is no screen).
* `check_csc1_close.ts`, `check_csc1_count.ts`, `check_case_feed.ts`, the C8.2 suite, `check_b78_sp_case_browser.cjs`, the demo reset and the checkpoint load (C10.1) pass unchanged.
* The module-card check passes; full `ci` is green; screenshots and build notes in `screens/CS-C1s/`.

**Duplicate check:** as part 1, run again on `main` at the start of part 2; one `Duplicate check:` line in the PR.

**Touch list (the concept may narrow it; widening needs a question first):**
* `api/src/features/case-close.ts` (one GET route)
* `api/src/case-close.ts` (`view`)
* new `web/src/runtime/case-decision.tsx`
* `web/src/runtime/cases.tsx` (mount the panel and the header line)
* `api/src/MODULE.cases.md` and `web/src/runtime/MODULE.md` (one line each)
* new `tests/check_csc1s_view.ts`, new `tests/check_csc1s_decision_browser.cjs`
* `screens/CS-C1s/` (build notes, screenshots, review and break reports)

No schema, no migration.

**Review:** an Opus reviewer (skill `screen-review`) **and the breaker** (permission keys, P-278). The breaker tries:
* each action without its key, through the screen and the API;
* another firm's case id in the address;
* a double click on Record a decision (one row, or a correction row, never two silent ones);
* Close and Reopen in two tabs at once;
* a reason of spaces or invisible characters, and one over 1,000 characters.

**Holds and parallel safety:**
* `cases.tsx` is shared with other case-page screen lanes: mount lines only, named in the PR.
* `runtime.ts` and `cases.prisma` are untouched, so this row runs beside CS-W1 and CS-K1. If CS-K1 merges first, the header may show the client code; that is not in this row.
* `case-close.ts` is otherwise CS-C1's: one added method, no change to the four actions.

**Standard rules:** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`.

**Audit actors (Lead 80, 18 Nov, after #2003 AUD-1a):** the audit trail refuses an actor word with no type. A test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients), never a bare word like `test`. Once #2003 is on `main`, merge `main` before the first push.

**Build Lead C rulings (18 Nov):**
* Session: accepted as recommended. The panel calls through `staffApi` (`web/src/modules/platform/session.ts:68`), the same staff sign-in the front-office screens use.
* P-663: this row finishes a started Partial (R1.77), so under P-698 (3) it counts as finishing, not as a new capability row.
* Outcome words stay **Sample** until an official IRCC page is cited. The concept cites AG-7-33 rule 4: "The decision vocabulary comes from the pack."
