# FO-6d part 1: review of the IRM fix (PR #3207)

Reviewer: a fresh reviewer that did not build this, reviewing only the diff. Date: 2026-11-23.

- **Scope:** `git diff 8f418c028 54041dca7`, the last approved head to the head under review. Two commits:
  - ba70d3acc: `isGovernmentForm`'s name pattern reads `(?:IMM|IRM)`, with a new test line.
  - 54041dca7: fixes the quotes in the test label, so the suite compiles.
- **Why the fix was needed:** full run 45239424480, shard 14, `check_irm_editions.ts` breaker m5 flagged `front-office/signing/any-document/service.ts:46`.
- **Out of scope:** the screen review and the journey test. They were scored on the approved head 8f418c028. This diff changes only a back-end check and adds no screen or journey, so neither is re-run here.

## What changed

1. `api/src/front-office/signing/any-document/service.ts:46`
   - Before: `/(?:^|[^a-z])IMM[\s_-]?\d{4}/i`
   - After: `/(?:^|[^a-z])(?:IMM|IRM)[\s_-]?\d{4}/i`
   - The doc comment now says "an IMM or IRM form number".
   - Nothing else in the file changed.
2. `tests/check_fo6d_any_document.ts`, S2 government-form fail check:
   - A third request: file `letter.pdf`, title `IRM 0002 statement (Sample)`.
   - The check now requires 422 `GOVERNMENT_FORM` for it as well.
   - The label is reworded: "a name like client_IMM5476.pdf, a title like IRM 0002".

## The pattern: does it catch what it should, and only that

I ran both patterns, old and new, in node on the same inputs:

| Input | Old (IMM only) | New (IMM or IRM) |
|---|---|---|
| `client_IMM5476.pdf` | caught | caught |
| `imm5257e.pdf` | caught | caught |
| `IRM 0002 statement` | not caught | **caught** |
| `IRM0002`, `irm-1234`, `x_irm_1234` | not caught | **caught** |
| `Engagement addendum` | not caught | not caught |
| `FIRM 2024 letter`, `FIRM2024`, `firm_2024` | not caught | not caught |
| `Confirm 1234`, `Confirm-1234`, `Infirm 2024` | not caught | not caught |
| `IRMA 1234`, `IRM 123` | not caught | not caught |

- **"FIRM 2024" and "Confirm 1234" do not trip it.**
  - With the `i` flag, `[^a-z]` also excludes `A`–`Z`. So the letter before "IRM" in "FIRM", "Confirm", "Infirm" and so on blocks the match, whatever its case.
  - Every English word ending in "irm" (firm, affirm, confirm, infirm, squirm) has a Latin letter before the "irm", so none of them trips the pattern.
- **The IMM cases behave as before.** The IMM alternative is the same text as the old pattern.
- **The pattern is only half of the call.** Its input is `${f.name} ${title}`, as before. The byte signals (XFA, NeedsRendering, AcroForm+UR3, deflated XFA) are unchanged.

## The new test line is a real fail case

- **The request isolates the title.** It sends the suite's default clean PDF, a neutral file name (`letter.pdf`) and the IRM number only in the title. So only the title's number can make the refusal.
- **Mutation, in a throwaway worktree:** I restored the IMM-only pattern and re-ran the suite.
  - The IRM request returned **201**: the document was sent.
  - The S2 government-form check went red: `[…, 422, 201]`.
  - The leaked send then pushed `requests()` up, so the later count checks failed too: 18 passed, 8 failed.
- With the fix, the check is green. The line catches the regression it was written for.

## Runs

- **Setup:** head 54041dca7 merged with origin/main (merge 9ac08ad9e), in a throwaway detached worktree.
  - node_modules were symlinked from the main checkout.
  - The worktree has since been removed and nothing was committed.
  - Postgres 127.0.0.1:54329.
- `npx tsx --tsconfig api/tsconfig.json tests/check_irm_editions.ts` gives **13/13 passed**.
  - That includes "IRM fail (breaker m5): no pattern … reads IMM without IRM", which reports `[]`, so service.ts:46 is no longer flagged.
  - The planted-pattern control still passes.
- `npx tsx --tsconfig api/tsconfig.json tests/check_fo6d_any_document.ts` gives **26 passed, 0 failed**.
  - That includes the reworded S2 government-form check.

## Findings

- **Blocker:** none.
- **Major:** none.
- **Minor:** none.
- **Nit 1: the guard admits non-letters before the number.**
  - `(?:^|[^a-z])` lets an accented letter or a digit sit right before the number, so `ÉIRM 1234` and `2IRM1234` are caught.
  - This was already true of IMM (`2IMM1234`) and is not new in this diff. It is harmless here, because a false catch only refuses the send with a clear message.
  - No action asked.
- **Nit 2: a leaked send cascades.**
  - If this check ever regresses, the extra send makes later count-based checks fail as well. Seven extra red lines appeared in the mutation run.
  - That noise is the suite's existing design (shared counters), not this diff. No action asked.

Verdict: Approve
