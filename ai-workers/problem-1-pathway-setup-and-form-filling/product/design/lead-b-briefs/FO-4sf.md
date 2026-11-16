# Brief: FO-4sf, the leads list filters by source (AG-2-23 rule 1; R1.27) (cloud builder lane; row owner Lead B)

Written 16 Nov 12:2x IST by Lead B (6), rev 16.63 (qa #1953 QA-479 there). AG-2-23 rule 1: "**Filters on leads:** lead owner …, source, …"; its mode is THIN SLICE, so it is Release 1. **Model: Opus 5.5, effort: medium**: a small read filter on existing visibility. **Starts when:** **FO-2v (#1933)** is on `main`, because both edit `sales/leads.ts`'s list (P-526).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-4sf` and take **one row, FO-4sf**, end to end on a fresh branch from `origin/main`, one PR. It has a small screen part, in the same PR.

**Read only these:** AG-2-23 rules 1 and 2 and its tests (`AG-02-prospect-lead-sales-crm_v2.6_2026-10-28.md`); on `main`: `api/src/front-office/sales/leads.ts` (`list`), `sales/routes.ts`, the lead's `source` column and its values (`front-office-sales.prisma`), `web/src/modules/front-office/sales/leads-page.tsx` and `contract.ts`.

**What to build:**
* `GET /api/front-office/leads?source=<one or more of the stored source values>`. It filters **inside** FO-2v's visibility, never widening it. An unknown value → 400 naming the allowed ones. No value → all sources, as today.
* On the Leads page, one **Source** filter beside the view chips: a multi-select of the source values, with their plain labels. It is kept in the URL (`?source=`). Empty means all.

**Done when** (P-606), in `tests/check_fo4sf_source_filter.ts` (API and browser), a pass and a fail each:
* `FO-4sf DW1`: with leads from the web form, manual entry and a booking, `source=MANUAL` returns only manual ones. Two values return both. An unknown value → 400.
* `FO-4sf DW2`: an own-only Case Officer filtering by source sees only their own leads of that source. The filter never shows another person's lead (the FO-2v sweep stays green).
* `FO-4sf DW3`: in the browser, choosing a source filters the list and survives a reload. Keyboard only; axe-core; 375, 1024 and 1440. FO-2's, FO-4's and FO-2v's suites pass unchanged.

**Touch list:** `sales/leads.ts` (the list's filter), `sales/routes.ts` (the query parameter), `web/src/modules/front-office/sales/leads-page.tsx` and `contract.ts`, `tests/check_fo4sf_source_filter.ts`.

**Duplicate check (P-526):** BACKLOG (AG-2-23's other filters are later rows), open PRs (`sales/`), BUGS (QA-479 in #1953's numbering); one `Duplicate check:` line.

**Reviewer** (P-303); breaker no (a read filter, inside a swept rule). **P-610:** about 200 lines.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
