# Brief: CS-V1 PR 3, the last five unparsed case-side inputs (cloud builder lane; row owner Build Lead C)

Written 19 Nov 20:3x IST by Build Lead C (3), under P-733 (items nearest to done first). **Approved for building**, once the Lead confirms the Bake's tag wait (P-499) no longer applies: the draft `product/design/briefs/CS-V1.md` on `main` is the specification; **this page wins** where they differ. Release 1 row **R1.10** ("Checking every input", `qa/CAPABILITIES.md` line 147, Partial). It is the case half's last part; Lead B's PF-28 is the platform and front-office half.

**PR title:** `runtime: CS-V1 part 3 — the last five case-side inputs parse through strict schemas; the allow-list is empty`
**Model:** Opus 5.5, effort medium (input checks on existing routes; no schema, money or screen).

**Why one PR, not 3a and 3b:** the draft planned 3a (person-link 5, case-prepare 1, sign-steps 1) and 3b (runtime 3). On `main` (6f2caced0, 19 Nov) `tests/check_csv1_inputs.ts`'s `ALLOW` holds only five entries, because person-link's methods were fixed on the way:
* `case-prepare.ts POST /api/runtime/items/:id/pdf-copy body` (`CasePrepare.pdfCopy`)
* `runtime.ts GET /api/runtime/cases query` (`Runtime.list`: take, after, client, q)
* `runtime.ts GET /api/runtime/cases/:id/questionnaire query(mode)`
* `sign-steps.ts POST /api/runtime/items/:id/sign-steps/:key body` (`SignSteps.step`)
* `sign-steps.ts POST /api/runtime/items/:id/signed-scan body` (`SignSteps.scan`: the upload's text fields only)
That is well under 400 lines, so one PR. Confirm the five in the PR body by re-running PR 1's check on `main`.

**Ready when:**
* **#2289 (AUD-1m part 2a) is on `main`.** It changes `case-prepare.ts` (the audit line only). Branch after it merges.
* `runtime.ts`: #2255 (FO-8) and the later CS-K1 part 2 change `createCase` and the case read, not `list` or the questionnaire handler. Whichever merges second merges `main`. CS-W1 (which also wants `list`) is not in flight.
* `sign-steps.ts`: the draft waited on CS-D1b; CS-D1b is not in flight and is three parts away, so this PR goes first and CS-D1b merges `main` later.

**What to build:** the draft's "PR 3a" and "PR 3b" bullets, for these five methods only. Each gets a strict zod schema in `contracts/` beside the file's existing ones: field-level messages in plain words, a length limit on every string, and the standard 400 answer with the field named and "Nothing was stored." where a write is refused. Remove each fixed method from `ALLOW`. For `list`: keep today's defaults and limits for `take` and `after`; an unknown filter is 400, as PR 2 ruled for the GETs.
* **Touch (nothing else):** the three files' service methods (first lines only), their `contracts/` schema files, and `tests/check_csv1_inputs.ts` (`ALLOW` and the DW4/DW5 cases). No engine, schema or screen change. A web screen that sends an extra field to a now-strict route is a stop-and-ask.

**Named test cases** (P-606), in `tests/check_csv1_inputs.ts`, a pass and a fail each:
* **CS-V1 DW4 (part 3):** for each of the five, an oversized string, a wrong type and an unknown field each answer 400 with the field named and store nothing (row counts read before and after). A correct request answers as before (the signed scan with a real Sample upload).
* **CS-V1 DW5:** `ALLOW` is empty and the check passes. Fail: a planted unparsed route fails the check.

**Done when:** `tsx studio/tests/check_csv1_inputs.ts` exits 0 with DW4 (part 3) and DW5 passing and failing as named. These pass unchanged: `check_forms_qa53.ts`, the suites of the three files (`tools/check-select-suites.sh`), and the browser suites for the case list, the questionnaire and the signing steps (named in the PR). Full `ci` is green.

**Review:** fresh Opus reviewer. No breaker (no schema, money or permission change).

**Duplicate check:** `git grep -nE "pdfCopy|SignSteps.step|SignSteps.scan" origin/main -- prototype/studio/contracts` shows no schema for these five yet; open PRs: none touch `check_csv1_inputs.ts` (checked 19 Nov 20:3x IST). Put the re-run in the PR as one `Duplicate check:` line.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head, as a line of its own, **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label after a failed merge batch, name the failing suites and show them covered (P-731 (2)). **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files this page and the draft name and the code you change (P-556).

**PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix.
