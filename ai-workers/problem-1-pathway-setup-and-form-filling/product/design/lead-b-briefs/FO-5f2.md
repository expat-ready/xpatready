# Brief: FO-5f2, a Word template can never take down the API (FO-5f item 5's rest) (cloud builder lane; row owner Lead B)

**Start once FO-5f #1791 is on `main`** (same file, `docx.ts`). It is at the top of the front-office pull order (Lead 53). It does **not** touch `retainers/service.ts`, so it runs beside PF-6b. **Availability for every firm: builder, reviewer and breaker all at high effort** (P-605). Paste into a new cloud session on the repository (default branch `main`):

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-5f2` and take **one row, FO-5f2**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `ai-workers/problem-1-pathway-setup-and-form-filling/product/BACKLOG.md`, row **FO-5f2** (rows rev 16.15). Its five items, touch list and Done when `DW1`-`DW8` are the whole job. Read only these with it:
* `product/design/lead-b-rows-2026-11-14.md`, section "Rev 16.15" (the root cause and the ruling above the table);
* `product/screens/FO-5f/fo5f2-handover.md` on `main` (every way in, word for word), and `review.md`/`break-report.md` there, rounds 3-4;
* the reverted attempt at commit `04c152982` (read it to see why mirroring the library's typing failed; do **not** restore it);
* on `main`: `api/src/front-office/retainers/docx.ts`, and docxtemplater's own documentation for `InspectModule`/`getAllTags`, `delimiters` and the change-delimiter syntax (the installed 3.71.1).

**The design is ruled (row owner, P-502): do not mirror docxtemplater's part typing in our code.**
* Use an **allowlist before any parse**: unlisted part types, or templated types in non-standard places, are refused, and `[Content_Types].xml` and `.rels` over 256 KB are refused unparsed.
* Run **every compile, render and placeholder read in one `worker_threads` worker**, with `resourceLimits` and a 5 s timeout. The API process never calls `compile`.
* Take the **tags from docxtemplater's own parse**.
* Allow **no delimiter change**.
* If a docxtemplater option named here does not exist in 3.71.1, stop and ask with the documentation line. Never fall back to a regex of our own.

**Named test cases (P-606):** list `FO-5f2 DW1` to `DW8` (pass and fail where the row says) in the PR body before writing code. The reviewer ticks one per line. Run each delimiter case alone with its own timer (the breaker's round-3 probe hung on two cases in one process).

**Duplicate check (P-526):** BACKLOG, open PRs, `main` and BUGS for "placeholder cap", "docx", "M-1" and "FO-5f2"; one `Duplicate check:` line.

**Breaker: yes.** It re-runs every way in over HTTP, with a concurrent page read that must keep answering.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text `python3 product/tools/trace-requirements.py --brief FO-5f2` prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
