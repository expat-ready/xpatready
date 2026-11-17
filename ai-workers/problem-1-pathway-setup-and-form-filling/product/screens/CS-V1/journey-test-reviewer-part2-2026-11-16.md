# CS-V1 part 2: journey test (reviewer role), 16 Nov

PR #2042 at commit 52e39187. This row checks API inputs and adds no screen. The journeys are therefore the existing screens that call the 15 routes it made strict, walked by the people who use them. Copy `rev_csv1b` on :4494 (PR code). A second copy, `rev_csv1b_main` on :4495, ran origin/main's code from a scratch extract as the baseline. Both copies are stopped. Live AI off, US$0. Case-close has no screen, so its journey is the in-process suite plus a differential test (see review-part2.md).

## Journeys (main path first)
1. **Case officer adds a form to a filing** (add-form.tsx: `GET addable-forms?q=&subject=`, `GET addable-forms/:form?subject=`, `POST form-additions`). At 1024 px, by keyboard: Enter on "Add a form to … filing" moves focus to the search box. Typing "IMM 0008" gives results in 69 ms. Enter picks it, 5 Tabs reach "Add to … filing", and Enter adds it, shown within 1.2 s as "Added by the case officer". The database holds exactly 1 active row for it. **Held.**
2. **Recovery: reload after adding.** After a reload the tag is shown once, with no duplicate row. **Held.**
3. **Case officer removes it with a reason** (`POST form-additions/:id/remove`). Remove stays disabled while the reason is blank. With a reason, the screen says "removed from … filing (kept in the record)", `removed_reason` is stored as typed and there are 2 audit lines (added, removed). Over the API, a reason over 500 characters is still cut to 500 (measured: 500). **Held.**
4. **Representative reviews a filing; case officer passes a warning with a reason** (readiness.tsx: `POST review`, `POST warnings/:code/pass`). `check_c76_ready_browser.ts` 53/53 on the PR copy, keyboard and both widths. **Held.**
5. **Case officer fills from documents** (documents-drawer.tsx: `GET proposals?subject=`, `GET checks?subject=&state=open`). `C6.5-screen.test.ts` 33/33. **Held.**
6. **Case officer opens "Case check from confirmed facts"** (eligibility.tsx: `GET assessments`). `check_c69_page_browser.cjs` 54/54, keyboard only. **Held.**
7. **Case officer downloads a form copy, original and validated** (forms.tsx and `?original=1`). `C7.2.test.ts` 11/11. **Held.**
8. **Error path: a stale or odd request** (null for every optional add field, as the API accepted before) answers 201. Wrong role by URL (client, `GET addable-forms`) answers 403. **Held.**
9. **Small screen: the add panel at 400 px.** No sideways scroll on the case page or with the panel open. **Held.**

## What held and what did not
* No screen request is refused. The web callers (readiness.tsx:232/280, add-form.tsx:51/111/125/170, documents-drawer.tsx:47/77, eligibility.tsx:94, forms.tsx:260) and finished-story.ts:273/275 send only fields the schemas take. `web/src/lib/api.ts` adds no query parameter, so a cache-buster that the strict proposals/checks queries would refuse never reaches them.
* axe (WCAG 2.0/2.1/2.2 A and AA) found no violations: picked form at 1024, after removal at 1024, add panel at 400. No page errors. Screenshots are in the reviewer scratchpad (`add-picked-1024.png`, `added-1024.png`, `add-panel-400.png`), not committed.
* Data underneath: across about 40 break-it requests on the PR copy, every refusal stored nothing (counts of audit_event, filing_review, readiness_pass and filing_form_addition taken before and after each).
* Break-it findings are listed in review-part2.md: the zod default words for over-long `signature` and `?original=`, `?original=` named as `body`, the order of the two addable GETs, and a pre-existing NUL byte answering 404.
* `acceptance/C7.8.test.ts` answers 14/20 on this cloud copy. It answers the **same** 14/20, with the same six failures, on origin/main's code (the library lacks a barcode-blank form and a third blank pick, and the setup step "PUT /api/library/fees" is missing on both). That is the environment, not this PR. `tests/runtime/check_c78_added_forms.ts` gives 20/20.

## Score (reviewer, out of 10)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-9 complete on the PR copy; the browser suites pass (53/53, 33/33, 54/54) |
| Next step obvious | 1 | No screen changed. The add panel moves focus to the search box and Remove names its reason (journeys 1, 3) |
| Plain words | ½ | Most refusals keep their words or give plain ones. `signature` over 40 and `?original=` over 10 answer "Too big: expected string to have <=40 characters" (zod's default), and `?original=` names `body` |
| Feedback and state | 1 | Each refusal is a 400 Problem Details with the field. The screen confirms add and remove in words |
| Correct data | 1 | One row per add, the reason stored as typed, cut to 500 as before, nothing stored on any refusal |
| Error recovery | 1 | A reload keeps one row. Remove is disabled while the reason is blank. Refusals say what to send |
| Accessibility and screen sizes | 1 | axe clean at 1024 and 400. Keyboard path for the add. No sideways scroll |
| Speed | 1 | Search 69 ms (budget 200 ms). Adding shows in 1.2 s. The schemas add no request |
| Visual quality | 1 | No visual change; the browser suites' screenshot steps pass |
| Trust and sources | 1 | No AI on these routes. Sample values stay labelled Sample (decision outcomes "Sample list") |

**Score: 9.5 / 10, pass (8 or more, no 0).** To raise plain words to 1: give the `signature` and `?original=` caps their own words, and name `original` as the field.

**Not tested:** a real screen reader. An intended user's unaided walk (D17/D20 stay with the founder). Case-close over HTTP (it needs PF-4's staff sign-in; covered in-process by `check_csc1_close.ts` 55/0 and by the differential test).
