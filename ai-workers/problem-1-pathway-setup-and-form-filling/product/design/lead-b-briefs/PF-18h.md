# PF-18h: the staff home's "Needs you" section with deadline items (R1.74, QA-471 (2))

**Row owner:** Lead B (9), 21 Nov 01:4x IST, at Lead 7 (series 3)'s ask. **Item:** R1.74. This is the second missing piece: CS-DL1 (2) "puts one 'Needs you' item on their home". No home screen exists on main (CS-DL1 brief, Contract gap (2): it "waits for whoever owns the home"). The home sits in PF-6's frame, so it is a platform row.
**Model and effort:** Opus 5.5, effort high (new screen). **Concept first** (skill `screen-concept`, `screens/pf-18h-home/concept.md`), challenged by a fresh reader, then the Lead's approval (P-223 (4), no board). **Reviewer:** a fresh Opus. **Breaker:** yes (new screen).
**Ready when:** PF-18n part 1 is on main (this reads its rows). **The J-74 walk step waits for CS-DL3 part 2 on main** (both edit `j_74.ts`): merge main first, P-270.

## Ruling (P-294, row owner)
"Home" in Release 1 is a staff **Home** page, the first page a staff member lands on after sign-in. It has one section for now, **Needs you**, and PF-29f later adds its "Due today or overdue" section beside it.
* A **Needs you item** is one of my **unread** notifications in group `MY_DEADLINES`: a stage deadline (CS-DL1) or a government step (CS-DL3).
* Because PF-18n keeps one row per item and kind and marks it unread again on each reminder, each deadline is **one** item. It comes back at 7 days, at 2 days and on the day.
* Opening an item goes to the case and marks it read, so it leaves Needs you. The full history stays in the notification list (PF-18ns).
* No new table, and no read of case-side tables: everything comes from PF-18n's rows, kept platform-only.
* The words come from the item kind ("A deadline on case …" or "A government step on case …"), with the case number from the link.
* Empty state: "Nothing needs you right now."

## Build
* `GET /api/platform/me/needs-you`: my unread `MY_DEADLINES` rows, newest first, at most 20, plus a total. The route goes in PF-18n's `api/src/platform/notifications/routes.ts` (this row adds it; PF-18n part 1 must be merged first).
* The Home page in a new `web/src/modules/platform/home/` folder. It has the Needs you list with the case, what is due and when it came in (the person's time zone), opening and marking read. The count is in words, not colour alone.
* One landing line in PF-6's frame or router so staff land on Home, and one nav link "Home".
* Keyboard only, axe-core clean, 375, 1024 and 1440 px.
* Card: `web/src/MODULE.rows/PF-18h.md` (and the api rows file, if the route counts as an entry point).

## Touch list
* new `screens/pf-18h-home/concept.md` (and its challenge)
* `api/src/platform/notifications/routes.ts`: one route
* new `web/src/modules/platform/home/*`
* PF-6's frame or router: one landing line and one nav link
* new `tests/check_pf18h_home_browser.ts`
* `tests/journeys/j_74.ts`: one walk step, **only after CS-DL3 part 2 is on main**
* the card rows files

**Never touches:** the case page (`web/src/runtime/*`), runtime route files, `api/src/case-deadlines/*`, `contracts/milestones.ts`, the case features. Those are CS-DL3 part 2's (Build Lead C) or the case side's.

## Duplicate check
On 21 Nov 01:4x IST, no open PR touches a home page, `web/src/modules/platform/home/` or `needs-you`. No BACKLOG row builds a staff home; PF-29f only adds a section to one. Re-check before you open the PR. If PF-29f has started, agree the page shell with its lane on a PR comment.

## Done when
* The concept is approved by the Lead after a fresh challenge.
* `check_pf18h_home_browser.ts` passes, each with a pass and a fail:
  * **DW1:** a reminder for a case I officer shows one Needs you item.
  * **DW2:** the 2-day reminder of the same deadline brings that item back, still one item.
  * **DW3:** opening it lands on the case and it leaves Needs you.
  * **DW4:** another person's or another firm's items never show.
  * **DW5:** keyboard only, axe-core clean.
* **J-74 gains a walk** (after CS-DL3 part 2 is on main): a deadline reaches its reminder, Needs you on Home shows it, and opening it reaches the case. The walk exits 0 twice.
* The PR body says "Item: R1.74" and "Fixes: QA-471 (part: Needs you)". qa then re-scores R1.74. Its last gap is the reminders firing on the real job runner in the walk, which qa rates.

**Rules (standard):** as PF-18n part 1. Under 800 changed lines (split the concept into its own records PR if needed).
