# Brief: PF-6f, PF-6 part 1's follow-ups: the sign-in page stuck on Back, and the reviewer's three notes (cloud builder lane; row owner Lead B)

Written 16 Nov 11:3x IST by Lead B (6), rev 16.59. From #1912 (PF-6 part 1, merged 16 Nov 04:51 UTC): Devin's 🟡 "Callback revisits stuck on loading" (on `callback-page.tsx:25`, confirmed by the lane, deferred to this row), and the reviewer's three new Shoulds (comment 6905937729). **Model: Opus 5.5, effort: high**: the sign-in door. **Starts when:** now. No open PR touches `web/src/modules/platform/callback-page.tsx` or `tests/check_pf6a_frame_browser.ts`; PF-6 part 2a does not, so they may run at once.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next screens PF-6f` and take **one row, PF-6f**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** on `main`: `web/src/modules/platform/callback-page.tsx`, `session.ts` (`staffToken`, `useMe`), `tests/check_pf6a_frame_browser.ts`; `product/screens/pf-6-staff/review.md` (its Shoulds) and #1912's two comments on `callback-page.tsx:25`.

**What to build:**
1. **The callback page never sticks on "Signing you in…"** (Devin's finding, and the reviewer's Should 2).
   - The case: a signed-in person opens a refused link, chooses "Open My account", then presses Back. The page mounts again with no code, while the module-wide `sent` set is not empty, so it waits forever.
   - The fix: on a mount with no code, decide from the current session. Signed in → open My account. Not signed in → show the refusal and the sign-in card.
   - Keep `sent` only to stop a second post of the same code.
2. **One plain notice** (the reviewer's Should 1, "the 'This link was not used' notice's words clash").
   - A signed-in person on a refused link sees one consistent message: "This link was not used. You are still signed in." with "Open My account".
   - It never shows "Not signed in" beside it.
   - Use concept §5's words where it has them.
3. **The test gives back its seat in a `finally`** (the reviewer's Should 3). `check_pf6a_frame_browser.ts`'s seat lend is returned even when a case fails, so the suite reruns on one copy.

**Done when** (P-606), a pass and a fail each:
* `PF-6f DW1`: the browser case from Devin's finding: refused link, then Open My account, then Back. It lands on My account and is never left on "Signing you in…". The same path signed out shows the refusal and the sign-in card. A second post of the same code is never sent (counted on the network log).
* `PF-6f DW2`: the refused-while-signed-in state shows only the notice in item 2, and axe-core finds nothing serious or critical on it (the reviewer's earlier note: the refusal state was not axed).
* `PF-6f DW3`: `check_pf6a_frame_browser.ts` passes twice in a row on one fresh copy, with a deliberately failing case in between (shown once, then removed), and the plan's seats are back to their start value.
* `PF-6f DW4`: PF-6 part 1's other cases and FO-4's suite pass unchanged.

**Touch list:** `web/src/modules/platform/callback-page.tsx`, `tests/check_pf6a_frame_browser.ts`, and a new `tests/check_pf6f_callback_browser.ts` if the cases fit better there.

**Duplicate check (P-526):** BACKLOG, open PRs (`callback-page`), BUGS; one `Duplicate check:` line.

**Reviewer and breaker** (P-278: the sign-in door). The breaker tries Back and Forward several times, two tabs with the same link, and a code in the address after sign-out.

**P-610:** about 150 lines.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text named here.
**Rules (standard, every PF/FO brief):** P-559; one row, one session, one PR; new files only outside the touch list; Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270); before asking for the label, run the suites of every CI part red on an earlier head plus the shard that shares your demo database, and paste the result lines; live AI off, US$0, never a priced button (P-175); no real keys; push after every step (P-557); questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the queue and to **Lead B** (row owner, branch `lead-b-front-office`) for the row; every token earns its outcome (P-556).
