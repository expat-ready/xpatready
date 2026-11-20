# Brief: CS-DL3 part 3, a government-step reminder seen on screen (cloud builder lane; row owner Build Lead C)

Written 21 Nov 03:1x IST by Build Lead C (4), after #2594 (CS-DL3 part 2) merged at 03:04 IST, with #2596 (PF-18n part 1) in the queue. Release 1 row **R1.74**. This page is what the PR needs so that "it reminds the case's people before it falls due" holds by screens.

**PR title:** `screens: CS-DL3 part 3 — a government step's reminder reaches the case officer; J-74 walks it`
**Model:** Opus 5.5, effort medium. Reviewer; no breaker (no schema, no contract, no new route).

**Ready when:** **#2596 has merged** (`msg_notification`, `PrismaNotificationPort` bound to `CASE_DEADLINE_NOTIFICATIONS`, `GET /api/platform/me/notifications/items`), **and #2621 has merged** (Lead B's PF-18h; its deadline "Needs you" item is the screen this PR walks, ruled by Lead 8 21 Nov). This PR builds neither; it walks "Needs you". The lane may start on #2596 + #2621's branches and finish when both are on `main`.

**Build (touch list, nothing else):**
1. `web/src/runtime/milestones.tsx:96`: the `data-gov-not-sent` sentence ("…none is sent to anyone until the firm's notifications are connected") is false once #2596 lands. Replace it with one plain sentence that names who is reminded and where it shows, e.g. "The case officer and the lead representative are reminded in Needs you." (Match the words #2621 uses for that list.) Rename the data attribute to `data-gov-reminded`, and update `check_csdl3_milestones_browser.ts` to match (DW8 keeps its pass and fail).
2. `tests/journeys/j_74.ts`: after the walk records the biometrics step (W5), add steps that:
   * advance the clock port to 7 working days before its due date, skipping the firm's closed days;
   * run the case-deadline job through its test entry, the way `check_csdl3_milestones.ts` does;
   * sign in as the case officer and open the reminder surface by screens;
   * see one item naming the case, the step and the due date;
   * follow it to the case page.

   Then cancel the step (part 2's dialog). Advance to 2 working days before and run the job again: no new item appears, which proves a cancelled step stops reminding. Each new step gets a pass and a fail against its stand-in (J-77 pattern).
3. `web/src/runtime/MODULE.rows/CS-DL3.md`: one line for part 3.

**Done when:**
* `tests/journeys/j_74.ts` exits 0 twice on an isolated copy;
* `check_csdl3_milestones_browser.ts` and `check_csdl3_milestones.ts` pass;
* the module-card check passes;
* full `ci` is green.
Body says "Completes: R1.74", and adds "Fixes: QA-471 (part: seen on screen)".

**Parallel safety:** one screen file (one sentence), one test, one journey, one card line. It touches no `ports/`, `api/`, migration or notification file. A clash with Lead B's PF-18h or PF-18ns is impossible on files; if their item's wording changes after merge, walk what is on `main`.

**Duplicate check:** `git grep -n "data-gov-not-sent" origin/main` returns exactly milestones.tsx:96 and the browser check; no open PR names CS-DL3 part 3 (checked 21 Nov 03:1x IST).

**Rules (standard, every Build Lead C brief, P-644):**
* Opus 5.5 at the effort above, with no model switch mid-session.
* One part, one session, one PR, on a fresh branch off `origin/main`.
* If anything outside the touch list is needed, stop and ask in a PR comment headed "Question for the tech lead"; Build Lead C answers within 30 min. Never widen the row silently.
* One `Duplicate check:` line in the PR body.
* A fresh Opus reviewer. The label `review: approved` only after "Reviewer: Approve <head sha>" plus green CI on that sha; the Lead applies it. Get the approval on the branch first, then open the PR as non-draft.
* Live AI off, US$0, never a priced button.
* Times only from the clock port.
* Push after every step.
* Run suites only on an isolated copy (`tools/isolated.sh`).
* Report to the current Lead (`tools/current-lead.sh`) and to Build Lead C (branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`).

**Addendum, 21 Nov 03:4x IST (Lead B's ruling, via Lead 8):** PF-18h (#2621) drops its own J-74 step, so **this PR owns the J-74 reminder walk**. #2621 exposes `data-needs-you-item` hooks on each "Needs you" item. J-74's new steps find the reminder through those hooks (never by CSS class or position), and read the item's visible text for the case, the step and the due date. The cancelled-step check counts the `data-needs-you-item` elements for that step. Expected timing: #2621 labelled about 06:30 IST and merged about 07:15 IST. Build on its branch until then.
