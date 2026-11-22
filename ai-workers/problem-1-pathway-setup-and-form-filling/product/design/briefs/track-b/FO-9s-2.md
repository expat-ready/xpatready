# Brief: Row FO-9s part 2 — People to merge, the duplicate review list screen (Track B; cloud builder)

Written 22 Nov 14:36 IST by Lead B (Track B, A286). Row: `product/BACKLOG.md` row **FO-9s** (screens). Run `/next screens FO-9s` and take **part 2 only**.
Model: Opus 5.5, effort: high (a screen that reads pairs across visibility rules and offers merge actions: permissions; P-608 (2)).
Item: R1.29
**PR title:** `screens: FO-9s part 2 — People to merge (R1.29)`

**Start when:** #2921 merged (PF-30s, the find box, changes `web/src/modules/front-office/sales/sales-frame.tsx`; touch-overlap 14:4x IST) **and FO-9b part 2 is merged** (its routes `GET /api/front-office/duplicates/review`, `GET /api/front-office/duplicates/merges`, `POST …/review/:id/keep-separate`, with the concept's M6-M8 lines), which itself starts after FO-9b part 1 (brief `design/briefs/track-b/FO-9b-1.md`). Not before: the concept marks parts 2-3 as waiting on FO-9b part 2, and the screen must call real routes, never a stub. No migration (web only). Concept approval: done (#2896 r3, the tech lead after `challenge.md`); land #2896's records first or read them from its branch.

**The specification:** the FO-9s concept r3, `screens/FO-9s/concept.md`, with `challenge.md` and the board `screens/FO-9s/design/fo9s-boards.html` (board S2), on branch `claude/runtime-fo9s-concept` (PR #2896; `git show origin/claude/runtime-fo9s-concept:ai-workers/problem-1-pathway-setup-and-form-filling/product/screens/FO-9s/concept.md`). **The next part is S2 exactly:** Sales › **People to merge** (menu item with the open count; no key → no item), tabs To review · Merged · Kept separate, the table (People with lead or client number · What matched · Match pill 0-100 with its tooltip, no "strong" label · First seen · actions), Keep separate, and on the Merged tab **Undo merge** on every not-undone merge, automatic ones labelled "Merged automatically" (BR-6, BR-7, BR-10, BR-11; copy in concept §5 word for word, including the empty and no-key sentences). The **Merge…** action on a To review row opens nothing in this part: it is shown only to holders of `agent/prospect:merge`, and a case pair shows it off with BR-7's sentence; the dialog is part 3.

**What is left after this part:** **FO-9s part 3** (S3, the guided merge dialog: field by field, what moves, confirm, the toast with Undo; BR-8, BR-9), then **J-29** (the walk S1 → lead → S2 → S3 → Undo). The Engage-as-Corporate and add-contact mounts of the part 1 hint wait on FO-4c's screens (not on `main`).

**Decisions (word for word):**
* **P-574 (2):** "anyone else goes to a duplicate review list with a match score and a guided manual merge"
* **P-575 (4):** "The case side has no written contract (A51's biggest gap)" (why a case pair's merge is refused here and goes to the case side, BR-7).

**Touches:**
- `web/src/modules/front-office/duplicates/people-to-merge-page.tsx`
- `web/src/modules/front-office/duplicates/review-contract.ts`
- `web/src/modules/front-office/routes.tsx`
- `web/src/modules/front-office/sales/sales-frame.tsx`
- `web/src/MODULE.rows/FO-9s-2.md`
- `tests/check_fo9s_review_browser.ts`

The menu item goes in the Sales frame and the page's route in the front office's route list (one line each; list them in the PR). New files otherwise; part 1's `duplicates/contract.ts`, `duplicate-hint.tsx` and `use-duplicate-check.ts` are not edited. No API change: if FO-9b part 2's answer lacks a field the screen needs, stop and ask on the PR.

**Done when:** `tsx studio/tests/check_fo9s_review_browser.ts` exits 0 (Playwright on an isolated copy, Sample people) with a pass and a fail per rule: BR-6 a viewer who may open only one side sees no pair, and a Case Officer without `agent/prospect:merge` sees no Merge… while holders do; no key → no menu item and the no-key sentence at the address; BR-7 a case pair's Merge… is off with the sentence word for word; BR-10 Undo merge on a not-undone merge restores (count by API) and a refused Undo shows the server's reason after the click; BR-11 Keep separate moves the pair to Kept separate and the lead page's "Possible match" notice goes; the open count on the menu matches the To review tab; the empty state's sentence; keyboard only, axe-core (no serious), 375/1024/1440 with no horizontal scroll; `check_fo9s_duplicates_browser.ts`, `check_fo4_sales_browser.ts`, `check_fo4al_add_lead_browser.ts` and `check_fo9b_merge.ts` pass unchanged (exit 0); `tsc -p web` 0 errors; full `ci` green.

Duplicate check: 22 Nov 14:36 IST, main `68f74620b`: `git grep -nE "People to merge|duplicates/review|keep-separate" origin/main -- prototype/studio/web prototype/studio/api` finds nothing; `web/src/modules/front-office/duplicates/` holds part 1 only (`contract.ts`, `duplicate-hint.tsx`, `use-duplicate-check.ts`); `git log origin/main --since=2026-11-15 --format='%h %s' | grep FO-9s` finds part 1 only (`391d0352e` to `b7888d35b`, #2900, the hint on Add a lead); open PRs at 14:40 IST (`open-prs-1440.txt`): #2896 (FO-9s concept, records) and no FO-9s or FO-9b build PR.

**Review:** an Opus reviewer (screen-review, D1-D20) **and the breaker** (new screen offering merge actions across visibility rules; P-278), journey test scored by the reviewer.

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
