# Brief: FO-3f, booking hardening (FO-3's Minors) (cloud builder lane; row owner Lead B)

Start **now**: FO-3 and PF-14 are both on `main`. No schema change, so it may run beside any schema row. Paste into a new cloud session on the repository (default branch `main`):

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-3f` and take **one row, FO-3f**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `ai-workers/problem-1-pathway-setup-and-form-filling/product/BACKLOG.md`, row **FO-3f** (rows rev 16.8). Its numbered items, touch list and Done when are the whole job. Read only these with it:
* `product/design/lead-b-rows-2026-11-14.md`, section "Rev 16.8" (the row and the Lead B decisions above its table);
* PR #1760's body, section "Open items for Lead B", and `product/screens/FO-3/` review and break reports on `main` (m3, m7, m10, B-8, the cap race);
* PF-14's `JobPort` in `prototype/studio/ports/` (item 2);
* on `main`: the files in the row's touch list.

**Each numbered item:** a pass test and a fail test, named after the item's code (for example `B-22`), in the row's test file. If an item turns out to need a schema change, a new route or more than its touch list, stop and ask; never widen the row silently.

**Duplicate check (P-526):** BACKLOG, open PRs and BUGS for the item codes; one `Duplicate check:` line.

**Breaker: yes, on items 4 and 5 only (public door: one stamp books once; the cap under parallel bookings).** The reviewer checks the rest.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
