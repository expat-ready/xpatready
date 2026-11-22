# Brief: Row CS-W2 part filings — the firm column on the nine filings tables (Track B lane 7; cloud builder; a migration)

Written 22 Nov 11:4x IST by Lead B (Track B, P-785). Row owner: Lead B (Track B). Run `/next runtime CS-W2 filings` and take **part 1, `filings`, only**.
Model: Opus 5.5, effort: high (schema and a backfill; P-608 (2)).
Item: R1.3
**PR title:** `migration — runtime: CS-W2 part filings — firm_id on the filings tables`

**Start when:** the Lead gives Track B the migration baton for it. **This part carries a migration**, and the migration scope holds one at a time for the whole product (`.mergify.yml` lines 112-140). Track B's recommended order on the baton: #2368 (FO-7ts part 3, needs a merge of `main` and a re-stamp) → #2320 (CS-NT1 part 1) → **this part**. It may be built while it waits; its migration folder is re-stamped after the newest on `main` before it queues (P-600).

**The specification:** `design/briefs/CS-W2.md` on `main`, part **1. `filings`** (9 tables; after CS-W1): "Fill from the case; `FilingApplicant`, `AssessmentOverride` and `AssessmentReview` fill from their same-file parent. Keys to `Case` and to the file's own parents; `SubmissionGroup → CaseStage` waits for part 3." With the brief's rules: no composite key on an optional `SetNull` relation; each area part adds keys only to parents that already carry `firm_id`; CS-W1's `case_firm_fill()` and `case_firm_from_key()` and `tests/check_csw1_firm_id.ts` are the harness to copy.

**Decisions (word for word):**
* **P-559:** "existing case, forms and runtime code is unchanged until the case side's firm-walls rows." (this row is one of them)
* **P-600** (migration stamps, as the CS-W2 brief applies it): the folder's stamp is later than every migration on `main` and unique; re-stamp, SQL unchanged, when `main` moves.

**Touches:**
- `prisma/schema/filings.prisma`
- `prisma/migrations/<stamp>_csw2_filings/`
- `tests/check_csw2_filings.ts`
- `api/src/MODULE.cases.rows/CS-W2-filings.md`

**Done when:** `tsx studio/tests/check_csw2_filings.ts` exits 0 with the part's DW cases each passing and failing as named (a pass and a fail each), and W1 passes; `check_csw1_firm_id.ts`, `check_prisma_schema.ts`, the filings suites named in the PR (found with `tools/check-select-suites.sh`), the demo reset, the checkpoint load (C10.1) and `check_d1_reset_to_six.ts` pass unchanged (exit 0); full `ci` green on the head.

Duplicate check: 22 Nov 10:5x IST, main `01841047d`: the newest case-side firm migration is `20261121100000_csw3_case_door`; no `csw2_*` migration folder; no open PR changes `filings.prisma`.

**Review:** an Opus reviewer at high **and the breaker** (schema). The Lead reads the migration before the label (P-423).

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
