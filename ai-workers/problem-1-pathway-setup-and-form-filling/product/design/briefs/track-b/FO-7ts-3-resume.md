# Brief: Row FO-7ts part 3 — resume the open PR #2368 (trust refund details, tax treatment, same-case pick, newest-issued index) (Track B; cloud builder)

Written 22 Nov 14:35 IST by Lead B (Track B, A286). Row owner: Lead B (Track B), taking over from Build Lead C, whose lane retired. Run `/next runtime FO-7ts` and take **part 3 by resuming #2368**: this lane resumes #2368 on its own branch `claude/sharp-archimedes-rcq3gs`; it opens no new PR and builds nothing new.
Model: Opus 5.5, effort: high (schema, migration, money; P-608 (2)).
Item: R1.58
**PR title (unchanged):** `migration — runtime: FO-7ts part 3 — trust refund details, tax treatment, same-case pick, newest-issued index`

**Start when:** now. #2368 is built and was approved: head `fac444ff5` (records only) over the last approved code head `a8f388459` (review round 5, "Approve a8f388459"; breaker round 3 passed `fce13845d`, then minors). It has been unmergeable since about 07:30 IST 21 Nov. **It needs a migration**, so it takes the product migration baton for `client-money.prisma` while it runs (the brief's order: part 3 first; the parts queued behind it on that file are listed in Build Lead C's brief, one at a time).

**Why it cannot merge today (found 14:3x IST, main `68f74620b`):**
* `git merge-tree` of `main` and the branch gives **one text conflict**, in `api/src/client-money/MODULE.md` (the PR's one added invariant line beside lines `main` changed since 19 Nov).
* **The migration stamp clashes:** the PR's folder `prisma/migrations/20261119170000_fo7ts_part3/` has the **same stamp** as `main`'s `20261119170000_pf18bk_support_keys`, and 21 migrations on `main` are newer than it. The newest on `main` now is `20261122033000_qa644_reserve_staging`.
* No migration on `main` after 19 Nov redefines the five functions this PR replaces (`money_trust_entry_write`, `money_invoice_write`, `money_credit_note_write`, `money_move_line_write`, `money_move_batch_owed_back`) or touches its columns, so a later stamp loses nothing of `main`'s (checked by grep of every newer `migration.sql`; re-check it at your merge).

**The specification:** Build Lead C's brief `design/build-lead-c-briefs/FO-7ts-3.md` on branch `claude/build-lead-c-647b40` (`git show origin/claude/build-lead-c-647b40:ai-workers/problem-1-pathway-setup-and-form-filling/product/design/build-lead-c-briefs/FO-7ts-3.md`), over the draft `design/briefs/FO-7ts.md` on `main`, plus the rulings recorded in `product/screens/FO-7ts-3/challenge.md` and `pick-guard-plan.md` on the branch (Lead 95's plan read; Lead 96's lock-order rulings that let it edit `money_move_line_write` and FO-7lk's two other writers). Nothing in the spec changes. This is the last part of FO-7ts; after it the client-money baton passes to the next part in the brief's order.

**What to do, in order:**
1. **Merge `origin/main`** into the branch (P-270: it conflicts). Resolve only the conflict: in `api/src/client-money/MODULE.md`, keep `main`'s text and the PR's one invariant line ("A pick of another payer's money is same-case only …"); no other edit. Push.
2. **Re-stamp the migration folder** after `main`'s newest at that moment (now `20261122033000`; open PRs carry later stamps, e.g. #2927's `20261122060000_pf4s_system_identity`, so if one merges first, stamp after it; pick a stamp later than whatever is newest when you push, e.g. `20261122<HHMM>00_fo7ts_part3`), moving `migration.sql` and `rollback.sql` together with **the SQL unchanged** (P-600 (d)); update the one constant in `tests/check_fo7ts_money_settings.ts` (`NEW3`) that names the folder. Commit message like `ed15879a4`'s: "re-stamped 20261119170000 → <new>, after <main's newest> (P-600); SQL unchanged". Push.
3. **Re-run the Done-when suites** on the merged head (below) in a scratch database, never in the Mac's main copy, and paste the result lines in the PR.
4. **Reviewer's Approve on the new head:** an Opus reviewer reads **only the diff from `a8f388459`** (the last approved code head) to the new head: the merge resolution, the rename and the one test constant. If that diff contains anything else, it is a full re-review, and you stop and ask first. The line "Reviewer: Approve <new head>" goes in `product/screens/FO-7ts-3/review.md`.
5. **Hand to Lead B (Track B) and the current Lead** (`tools/current-lead.sh`) for **the P-423 read** of the migration and the pick guard's code before the label: a PR comment naming the new head, the stamp, the suite results and "SQL unchanged since `a8f388459`" with the `git diff a8f388459 <new head> -- prisma/migrations/` evidence (renames only). The label `review: approved` is the Lead's step after that read.

**Order with #2953 (FO-7b part 1b, open):** the two PRs share **no file** (compared 14:3x IST: #2953 changes `invoices/*`, `port.ts`, `ports/client-money.ts`, its contract, wording samples and `check_fo7b_invoices.ts`; #2368 changes the schema, its migration, the four tests and the module card). So no merge order is required by file. They do meet in the database: #2368 replaces `money_invoice_write`, `money_credit_note_write` and `money_trust_entry_write`, which #2953's issue, receipt and credit-note routes fire. Therefore `check_fo7b_invoices.ts` is on this lane's must-pass list; **if #2953 merges first, merge `main` again only if it conflicts (P-270) and re-run `check_fo7b_invoices.ts` on the merged head before the label**; if it fails, do not merge before #2953's owner and Lead B agree a fix.

**Decisions (word for word):**
* **P-600 (1) (d):** "carries a stamp later than `main`'s newest migration, the later PR re-stamping".
* **P-270:** "Merge main into a PR only when it conflicts".
* **P-634 (1):** "A reversal (Returned, Recorded by mistake, Wrong client) is always accepted, even below zero".

**Touches:**
- `prisma/migrations/20261119170000_fo7ts_part3/`
- `prisma/schema/client-money.prisma`
- `api/src/client-money/MODULE.md`
- `api/src/client-money/MODULE.rows/FO-7ts-3.md`
- `tests/check_fo7ts_money_settings.ts`
- `tests/check_fo7a_money_schema.ts`
- `tests/check_fo7a2_ledger_rules.ts`
- `tests/check_fo7mv_move_list.ts`

The migration folder is listed by its current name; step 2 renames it to the new stamp (no other PR uses either name). These are #2368's own files, already changed on its branch; this lane edits only the merge conflict in the module card, the folder name and the test's folder constant. No new file, no route, no screen, no `ports/` change.

**Done when:** on the merged, re-stamped head, `tsx studio/tests/check_fo7ts_money_settings.ts` exits 0 with DW10, DW15-DW18 and DW25-DW30 each passing and failing as named in the brief; these pass unchanged (exit 0): `check_fo7a_money_schema.ts`, `check_fo7a2_ledger_rules.ts`, `check_fo7mv_move_list.ts`, `check_fo7lk_lock_order.ts`, `check_fo7b_invoices.ts`, `check_pf12_walls.ts`, `check_prisma_schema.ts`; the migration applies on an empty database and on the demo-data copy, and `rollback.sql` restores `main`'s function text; demo reset and checkpoint load; full `ci` green; "Reviewer: Approve <new head>" recorded; the P-423 read asked for.

Duplicate check: 22 Nov 14:35 IST, main `68f74620b`: `git grep -n -i "refund_method\|tax_treatment\|picked_other\|money_party_tax_treatment" origin/main -- prototype/studio/prisma prototype/studio/api` finds nothing (part 3 is not on `main`); `git log origin/main --since=2026-11-15 --format='%h %s' | grep FO-7ts` finds only part 2's commits (`ed15879a4`, `d62d4584d`, `37c299568`, `7ea0132d9`, `cbdf08a1e`); of the 56 open PRs at 14:40 IST only #2368 itself builds this (this lane resumes #2368), and #2953 is the only other client-money PR (no shared file, see above).

**Review:** an Opus reviewer at high, diff-only from `a8f388459` (P-277), **and the breaker** only if that diff holds more than the merge, the rename and the constant (schema, money, P-278). The Lead reads the migration (P-423). Tax readings are **Unconfirmed: no accountant**; legal readings **Unconfirmed: no counsel**.

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
