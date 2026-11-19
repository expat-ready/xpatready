---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/web/src/runtime/**"
---
# Module card: web-runtime (P-615)
The case screens: the case officer's cases, the client's questionnaire and the filing to its record. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `cases.tsx` routes `/cases/*` (case list, one case, the client's questionnaire, phone first); `questionnaire.tsx`, `answer-sheet.tsx` answers; `checklist.tsx`, `documents-drawer.tsx` documents; `eligibility.tsx`, `readiness.tsx`, `review.tsx`, `representative-review.tsx`, `sign-steps.tsx`, `submission.tsx` the filing steps; `stages.tsx` multi-stage cases; `privacy.tsx`, `link-page.tsx` adult privacy and links; `release-update.tsx`, `out-of-date.tsx` newer releases.
**Owner area.** runtime lane (Unconfirmed: no lane map in code).
**Entry points.** routes `/cases/*` and `/link` (`App.tsx`); API calls through `@/lib/api` to `/api/runtime/*` (card api-cases).

**Invariants (set by).**
- The server decides what each person may do; a screen only shows (STANDARDS §6, `lib/api.ts`).
- A person chosen on purpose who does not work on cases is never switched silently (P-456 (3), P-484).
- A document's cost is shown before any read; live is never offered; replay is US$0 (P-110, P-175, P-295). Sample documents only (P-133).
- Only values whose check digits pass collapse; each other value asks a tick or a correction (P-243).
- A rule whose "when not met" is needs review asks for the representative, never a hard Does not qualify (P-230 (1)); unconfirmed answers are named, not counted as answered (P-236).
- Mark reviewed stamps "Reviewed by" or "Seen by" from the firm's record, decided by the server (P-229 (2)).
- Dates read "9 May 2029", never ISO (P-407); answer parts in words, never "box" (P-63); codes in words (B148).
- Drawers, never modals, on the eligibility page.

**Tables.** none directly (web).
**Tests.** `tests/check_bk4a.ts`, `tests/check_bk4b_handoffs.ts`, `tests/check_a24_2_case_list_browser.ts`, `tests/check_c83_review_browser.cjs`, `tests/check_c81_sign_browser.ts`, `tests/check_m3s4_never_waivable.ts`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Decide a permission, a stamp or readiness in the browser; ask the server.
- Show a raw code, an ISO date or a key to a person.
- Offer a live AI read.
