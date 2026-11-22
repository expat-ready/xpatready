# Brief: Row CS-W3 part 2-forms — the form-filling files run with their firm set (Track B lane 8; cloud builder)

Written 22 Nov 11:4x IST by Lead B (Track B, P-785). Row owner: Lead B (Track B). Run `/next runtime CS-W3` and take **part `2-forms` only**.
Model: Opus 5.5, effort: high (permissions and firm walls; P-608 (2)).
Item: R1.3
**PR title:** `runtime: CS-W3 part 2-forms — form-filling files run with the firm set`

**Start when:** CS-W3 part 2-review is merged (both parts edit the census allow-list in `tests/check_csw3_firm_scope.ts`, so one CS-W3 part at a time). No migration.

**The specification:** `design/briefs/CS-W3.md` on `main`, part 2, area **`2-forms`**: `fill-case.ts`, `fill.ts`, `forms.ts`, `form-additions.ts`, `filing-changes.ts`, `case-filings.ts`, `must-verify.ts`, `rule-facts.ts` (about 16 transactions / 13 raw queries). A fix-up is a one-line call of PF-12's export at the start of an interactive transaction, or a raw query moved inside one; never a reformat. **Before starting, re-check open PRs for these eight files** (the forms lane works near them); the start hook refuses an overlap.

**Decisions (word for word):**
* **P-559:** "existing case, forms and runtime code is unchanged until the case side's firm-walls rows." (this row is one of them)

**Touches:**
- `api/src/fill-case.ts`, `api/src/fill.ts`, `api/src/forms.ts`, `api/src/form-additions.ts`
- `api/src/filing-changes.ts`, `api/src/case-filings.ts`, `api/src/must-verify.ts`, `api/src/rule-facts.ts`
- `tests/check_csw3_firm_scope.ts`
- `api/src/MODULE.cases.rows/CS-W3-2-forms.md`

**Done when:** `tsx studio/tests/check_csw3_firm_scope.ts` exits 0 with **CS-W3 DW5** for this area (the journey passes with the walls on in the scratch copy, the allow-list loses the part's files, a planted unscoped query in the area fails the census); the forms suites named in the PR (found with `tools/check-select-suites.sh`), `check_pf12_walls.ts`, `check_csw1_firm_id.ts`, the demo reset and the checkpoint load pass unchanged (exit 0); full `ci` green.

Duplicate check: 22 Nov 10:5x IST, main `01841047d`: the census allow-list (lines 271-274 of `tests/check_csw3_firm_scope.ts`) holds `fill-case`, `form-additions`, `filing-changes`, `case-filings`; the builder confirms with `csw3-spike.sh census` which of the eight still reach a case table and says so in the PR; no open PR changes them (read 10:5x IST).

**Review:** an Opus reviewer at high **and the breaker** (permissions, P-278).

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
