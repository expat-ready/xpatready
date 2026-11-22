# Brief: Row CS-W3 part 2-review — the review and submission files run with their firm set (Track B lane 5; cloud builder)

Written 22 Nov 11:3x IST by Lead B (Track B, P-785). Row owner: Lead B (Track B). Run `/next runtime CS-W3` and take **part `2-review` only**.
Model: Opus 5.5, effort: high (permissions and firm walls; P-608 (2)).
Item: R1.3
**PR title:** `runtime: CS-W3 part 2-review — review and submission files run with the firm set`

**Start when:** now (it can start today with the first four, if the Lead's cap allows). No migration: a fix-up is code only (CS-W3 part 1, #2349, merged the door and the census). Only **one CS-W3 part at a time**: every part edits the census allow-list in `tests/check_csw3_firm_scope.ts`.

**The specification:** `design/briefs/CS-W3.md` on `main`, part 2, area **`2-review`**: `review-rounds.ts`, `review-runs.ts`, `review-stamp.ts`, `readiness.ts`, `findings.ts`, `sign-steps.ts`, `submission.ts`, `submission-record.ts`, `filing-record.ts`, `release-update.ts` (about 20 transactions / 14 raw queries). A fix-up is a one-line call of PF-12's export at the start of an interactive transaction, or a raw query moved inside one; never a reformat. Build Lead C's `CS-W3-1.md` (branch `claude/build-lead-c-647b40`) for how part 1 shaped the door.

**Decisions (word for word):**
* **P-559:** "existing case, forms and runtime code is unchanged until the case side's firm-walls rows." (this row is one of them)
* **P-606** (as the R1.3 qa note applies it): a capability with parts missing gets no verdict, so this part closes nothing alone; R1.3 also needs CS-W2 (10 parts), the other CS-W3 parts and CS-W4.

**Touches:**
- `api/src/review-rounds.ts`, `api/src/review-runs.ts`, `api/src/review-stamp.ts`, `api/src/readiness.ts`, `api/src/findings.ts`
- `api/src/sign-steps.ts`, `api/src/submission.ts`, `api/src/submission-record.ts`, `api/src/filing-record.ts`, `api/src/release-update.ts`
- `tests/check_csw3_firm_scope.ts`
- `api/src/MODULE.cases.rows/CS-W3-2-review.md`

Not `api/src/MODULE.cases.md`, `runtime.ts` or `case-feed.ts` (open PR #2320 and Track A's CS-S1 part 2 hold them).

**Done when:** `tsx studio/tests/check_csw3_firm_scope.ts` exits 0 with **CS-W3 DW5** for this area (its journey passes with the walls on in the scratch copy, the census allow-list loses these ten files, and a deliberately unscoped query planted in a test file of the area fails the census); every review and submission suite named in the PR (found with `tools/check-select-suites.sh`), `check_pf12_walls.ts`, `check_csw1_firm_id.ts`, the demo reset and the checkpoint load pass unchanged (exit 0); full `ci` green.

Duplicate check: 22 Nov 10:5x IST, main `01841047d`: the ten files are on the census allow-list in `tests/check_csw3_firm_scope.ts` lines 271-274 (47 files at part 1); no open PR changes any of them (open PRs read 10:5x IST).

**Review:** an Opus reviewer at high **and the breaker** (permissions, P-278).

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
