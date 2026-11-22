# Brief: Row FO-7g part 1 — the cited GST/HST table and the tax-default route (Track B lane 2; cloud builder)

Written 22 Nov 11:1x IST by Lead B (Track B, P-785). Row owner: Lead B (Track B). Run `/next runtime FO-7g` and take **part 1 as narrowed here**.
Model: Opus 5.5, effort: high (money; P-608 (2)).
Item: R1.56
**PR title:** `runtime: FO-7g part 1 — tax default by province from a cited table`

**Start when:** now. No migration, and no file on this touch list is changed by an open PR (checked 10:5x IST 22 Nov). It runs **beside FO-7b part 1b** because it does not edit `api/src/client-money/invoices/`.

**The specification:** Build Lead C's brief `design/build-lead-c-briefs/FO-7g.md` on branch `claude/build-lead-c-647b40` (`git show origin/claude/build-lead-c-647b40:ai-workers/problem-1-pathway-setup-and-form-filling/product/design/build-lead-c-briefs/FO-7g.md`), over the draft `design/briefs/FO-7g.md` on `main`. Use its cited table (Source A, the CRA "GST/HST calculator (and rates)" page, 13 rows), its `canada-gst-hst.ts` shape, `taxDefault(...)`, the `GET /api/front-office/money/tax-default` route (key `agent/invoice:create`; another firm's party → 404), DW1-DW7, DW10 and DW11, and its breaker list. **Re-read the CRA page at source** and put each value with URL, quote and read date in the PR body (AGENTS rule 4); a value you cannot read at source is "Not verified" and the PR says so.

**Where this page wins (Lead B (Track B) ruling, 22 Nov, for parallel safety):**
* **Not in this part:** the draft-step calls in `api/src/client-money/invoices/` (a new `FEE`/`DISBURSEMENT` line takes the default; a `GOVERNMENT_FEE` line is 0; taxable / not taxable on a draft) and Build Lead C's DW12. They become **FO-7g part 1w**, a small part (under 150 lines) that starts after FO-7b part 1b merges, first in the folder order (FO-7g part 1w → FO-7t part 2 → FO-7r part 1).
* **DW12 here (pure):** `taxForLine(50, taxDefault({firmProvince: "ON", registered: true}).ratePpm)` is 6 (0.06, not 0.07), calling `invoices/tax-round.ts`'s export read-only.
* Build Lead C's question 1 is answered by P-701 (below). Question 2 is ruled: an unknown `province_state` gives `source: "NONE"` and 0 with the warning "Your firm's province isn't set — tax is not added", never a guess.

**Decisions (word for word):**
* **P-701:** "Release 1 invoices charge GST/HST only (founder, AskUserQuestion reply typed in Lead 81's session, 20:29 IST 18 Nov, word for word: "Yes, GST/HST only")." … "Rates come from CRA with page, quote and date (P-170). Unconfirmed: no accountant or counsel."
* **P-568 (1):** "Row 18: no Quebec firm in the first firms; Quebec sales tax (QST) and French stay out until he says otherwise."

**Touches:**
- `api/src/client-money/tax/canada-gst-hst.ts`
- `api/src/client-money/tax/defaults.ts`
- `api/src/client-money/tax/routes.ts`
- `api/src/features/client-money-tax.ts`
- `api/src/client-money/MODULE.rows/FO-7g-1.md`
- `tests/check_fo7g_tax_defaults.ts`

No schema, no migration, no screen, no `ports/` change, no edit in `invoices/`.

**Done when:** `tsx studio/tests/check_fo7g_tax_defaults.ts` exits 0 with DW1-DW7, DW10, DW11 and the pure DW12 each passing and failing as named, plus a check over the file that fails on a table value with no `source` (URL, quote, read date); `check_fo7b_invoices.ts`, `check_fo7a_money_schema.ts`, `check_fo7ts_money_settings.ts` and `check_pf12_walls.ts` pass unchanged (exit 0); full `ci` green.

Duplicate check: 22 Nov 10:5x IST, main `01841047d`: `git grep -n -i "gst\|hst\|canada-gst\|taxDefault" origin/main -- prototype/studio/api/src prototype/studio/ports` finds only `invoices/tax-round.ts` (the rounding, part 1a) and unrelated words; no `client-money/tax/` folder; no open PR builds it.

**Review:** an Opus reviewer at high **and the breaker** (money, P-278) with Build Lead C's breaker list. Tax readings are **Unconfirmed: no accountant**; legal readings **Unconfirmed: no counsel**.

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
