# Brief: PF-4pc, mixed-case paths get the same guarded answer (map row 5, hardening) (cloud builder lane; row owner Lead B)

Drafted 16 Nov 03:1x IST by the shaping lane, for Lead B's approval (P-558). Row: BACKLOG **PF-4pc** (rev 16.22 from #1811 breaker m5; rev 16.24 adds the ConfigReadGuard case from #1823). It fails closed today; this row makes the answer the same at every letter case. **Model: Opus 5.5, effort: high** (security; reviewer and breaker at high, P-605).

**Starts when:** CS-C1a **#1818** is on `main` (it adds its `PLATFORM_ACCESS` hook on the same `core.ts` line; Lead 58's note in BACKLOG, Lead B agrees).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-4pc` and take **one row, PF-4pc, path case**, end to end on a fresh branch from `origin/main`, one PR.

**What `main` does today (checked 16 Nov, `81505985`):**
* `api/src/core.ts` ~line 91 (`ConfigReadGuard`): `/^\/api\/(platform|front-office)(\/|$)/.test(path)` hands those paths to the platform guard, **case-sensitively**; a mixed-case path such as `/API/Front-Office/bookings` falls through, so a Bearer token gets the link-only 403 ("Not for a link session").
* `api/src/main.ts` ~line 244: the web app's catch-all `get(/^\/(?!api\/).*/)` is case-sensitive, so `/API/...` returns the web page (200, HTML) instead of an API answer.
* `api/src/platform/identity/guard.ts` already guards a **declared** platform route whatever the letter case (its comment at ~line 82, "break M1"). Express routing is case-insensitive by default, so a mixed-case path can reach a handler only through that guard.

**Read only these:** the BACKLOG row PF-4pc and its rev 16.24 line; `core.ts` (`ConfigReadGuard`, after #1818), `main.ts` (the catch-all), `identity/guard.ts` (how it matches paths); STANDARDS §6 line 40 (problem answers); the module cards `api/src/MODULE.core.md` and `api/src/platform/MODULE.md`. The requirement behind it: SA-6-4 (platform and firm keys never mix) and AG-1-1 deny-by-default as PF-4 cites them; this row adds no rule, only the same answer at every case.

**What to build:** both matches compare the lower-cased path (`path.toLowerCase()` before the test, or the `i` flag), so `/API/...` and `/Api/Platform/...` follow exactly the lower-case route's path: the platform guard for `/api/platform` and `/api/front-office`, and never the web page for any `/api/` path. No other line changes.

**Done when** (P-606: list the cases in the PR body first; the reviewer ticks one per line). In `tests/check_pf4pc_path_case.ts`:
* `PF-4pc DW1 pass/fail`: `GET /API/Front-Office/bookings` with a valid staff token gives the same status and body as `/api/front-office/bookings`; without a token, 401 `NOT_SIGNED_IN` (today: the link-only 403, shown first as the failing case).
* `PF-4pc DW2 pass/fail`: `GET /API/Platform/me` with and without a token answers as the lower-case path; `/API/link/...` keeps the link rules.
* `PF-4pc DW3 pass/fail`: no `/api/` path at any letter case returns the web page (`/API/whatever` → the API's 404 problem answer, not HTML).
* `PF-4pc DW4 pass/fail` (rev 16.24): ConfigReadGuard's 403 on an upper-case platform path becomes the platform guard's answer, the same as the lower-case path.
* `PF-4pc DW5`: a sweep over every declared platform and front-office route (guard.ts's route list) at three letter cases finds no route reachable unguarded; PF-4's, PF-4b's and CS-C1a's suites pass unchanged.

**Duplicate check:** BACKLOG (PF-4pc), open PRs (#1818 touches `core.ts`, hence the wait; PF-0bp changes `main.ts`'s `ProblemErrors`, a different block), `main` (guard.ts already handles a declared route's case, the two matches above do not), BUGS (none); one `Duplicate check:` line after re-running it.

**Touch list:** `api/src/core.ts` (the one match), `api/src/main.ts` (the catch-all's pattern), `tests/check_pf4pc_path_case.ts`; `api/src/MODULE.core.md` (an invariant "API paths are matched without letter case") only if it lists the matches, else `Card unchanged: <reason>`. **The release holder reads the `core.ts` and `main.ts` lines before the label** (P-423: guard).

**Contract used:** none; PF-4's platform guard.

**Parallel safety:** after #1818 (same `core.ts` line and `MODULE.core.md`). PF-0bp edits `main.ts` too (`ProblemErrors`, another block): the second to merge merges `main`. PF-4s may need its own `/api/system` match in the same places: **PF-4s and this row never edit the match at once**; this row should go first, so PF-4s's new match is case-insensitive from the start.

**Reviewer and breaker** (P-278: security): the breaker tries `%2F`-encoded slashes, a trailing dot, Unicode case folding (`/api/PLATFORM` with a dotless i), and `HEAD` requests.

**P-610:** about 150 lines with tests; no split.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.
**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
