# Brief: Row FO-7g part 1w — the tax default reaches every new draft line (Track B; cloud builder; LX945)

Written 22 Nov 13:4x IST by Lead B (Track B). Row: `product/BACKLOG.md` row **FO-7g part 1w** (on branch `lead-b/2026-11-22-track-b` until the Lead's records PR lands). Run `/next runtime FO-7g` and take **part 1w only**.
Model: Opus 5.5, effort: high (money; P-608 (2)).
Item: R1.56
**PR title:** `runtime: FO-7g part 1w — the tax default on every new draft line`

**Start when:** #2967 (FO-7g part 1) and #2953 (FO-7b part 1b) are both merged. Branch from `origin/main` after both. No migration.

**What to build (the row, exactly):** in FO-7b's draft code in `api/src/client-money/invoices/` (calls only), a new `FEE` or `DISBURSEMENT` line takes `taxDefault(...)`'s `ratePpm` through `lineRatePpm` (part 1's `tax/defaults.ts`); a `GOVERNMENT_FEE` line is 0 and asking to tax it is refused 400 at the field; a draft line may be set taxable or not taxable (`agent/invoice:edit`), giving the default or 0, never another number; the amount is always `taxForLine` (QA-482). The firm's province and `tax_registered` are read as part 1's route reads them (one snapshot). A rate sent by the client is never used.

**Decisions (word for word):**
* **P-701:** "Release 1 invoices charge GST/HST only"
* **P-568 (1):** "Row 18: no Quebec firm in the first firms; Quebec sales tax (QST) and French stay out until he says otherwise."

**Touches:**
- `api/src/client-money/invoices/`
- `tests/check_fo7g_tax_defaults.ts`
- `api/src/client-money/MODULE.rows/FO-7g-1w.md`

**Done when:** `tsx studio/tests/check_fo7g_tax_defaults.ts` exits 0 with the row's five cases each passing and failing as named (Ontario 0.50 `FEE` through the route → `tax_rate_ppm` 130000 and tax 0.06, not 0.07; `GOVERNMENT_FEE` with 130000 refused; a client-sent rate not used; not registered → 0 on every line; firm A never reads firm B's province); `check_fo7b_invoices.ts`, `tests/journeys/j_59.ts`, `check_fo7a_money_schema.ts` and `check_pf12_walls.ts` pass unchanged (exit 0); full `ci` green.

Duplicate check: 22 Nov 13:4x IST: no draft-step call of `taxDefault` or `lineRatePpm` on `main` or in #2953 (part 1's file header: "nothing in invoices/ does yet").

**Review:** an Opus reviewer at high **and the breaker** (money). Tax readings Unconfirmed: no accountant.

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
