# PF-5t part 2 review: the terms page and Settings → Terms (PR #2135)

Reviewed commit `379f2c0ff9df280df05551af02696cc7b5e9fc9d` (branch `claude/screens-pf5t-terms`; `git rev-parse HEAD` matched). The brief is `lead-b-briefs/wave1-terms.md` plus `PF-5t.md` "Part 2, screens" (branch `lead-b-front-office`). This row has no `concept.md`, so the brief is the concept. Also read: `STANDARDS.md`, `EXPERIENCE.md`, `QUALITY.md`, `PRODUCT.md` §3–§4. Reviewer: Opus, independent (I did not build it). Wording and versions are Sample. **Unconfirmed: no counsel.**

**Verdict: Ship after fixes.** One Major: the headline trigger "on a 428 answer" has no test. The code itself behaves correctly in every journey I walked.

## What I ran (own isolated copy `rev_pf5t` on :4546, `PLATFORM_IDENTITY=local`; stopped afterwards)
* `check_pf5t_terms_browser.ts 4546 xr_studio_rev_pf5t`: **25/25, exit 0**, run twice (8.7 s each), plus a third run after my mutations were reverted. The pack overwrites the committed screenshots, so I restored them with `git checkout` each time.
* `tsc --noEmit -p web/tsconfig.json`: exit 0.
* **Scope:** the diff stays inside the touch list. There is nothing in `api/`. `frame.tsx` changes the 428 branch only (+1 import, +1 hook, 2 lines in the branch); `routes.tsx` and `account-sections.ts` get one entry each.
* **Mutation spot-check** (STANDARDS §7 [M]): I made each change, rebuilt `web/dist`, ran the pack, then reverted.
  * The `TERMS_PENDING` listener (`terms-gate.tsx:343`) turned off: **pack still 25/25**.
  * The listener and the post-accept refresh (`:365`) both off: **25/25**.
* **Journey score: 9.5/10 (pass)**: 10 journeys plus a break pass, in `journey-test-reviewer-2026-11-18.md`. Only accessibility and screen sizes scored ½ (m2, m3). This is the one journey score for this check.
* **Graph** (`graph.mjs`): the browser test visits `/platform/terms` and `/account`. Part 1's three routes show `testedBy: []`, which is the tool's known gap for `/platform` routes (part 1 review m5). I found no element that serves no capability.
* **CI at this head:** the PR is a draft, so only the guard and pr-rules ran (green). `module-cards` is red because `api/src/front-office/MODULE.md` is 42 lines on `main` too (I checked). The PR body carries the `Card unchanged:` line.

## D1–D20 (independent reviewer, browser and script evidence)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | DW6–DW9 all pass and I walked each one. A non-Owner is asked only for the privacy notice (J2). The Major is a test gap, not a behaviour gap |
| D2 Data integrity | 5 | Double click, two tabs and a replay each leave 1 row. 1 audit line per accept. The server decides what is pending |
| D3 Reuse | 4 | Part 1's routes are reused, with no second store. The kind words follow the complaints `CATEGORY` precedent |
| D4 Rule integrity | N/A | No rules authored |
| D5 Stability | 4 | Reload keeps the page. A stale version answers 400, the list refreshes, and accepting again works (J4) |
| D6 Governance | 4 | Who, when, which version and "for the firm / themself" are shown. Part 1 writes the audit line |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 4 | The crumb keeps "My account › <page>" under the terms card, and the person lands back at the same address |
| D9 Flow | 5 | One card, one primary "I accept"; terms page 0.42 s after sign-in; accept to content 0.11 s |
| D10 Language | 4 | "We've updated our privacy notice and terms of service." reads well. "Themself" (m4) |
| D11 Feedback | 4 | Busy states on both buttons; the "Not accepted" notice shows the server's words (DW8, J4) |
| D12 Visual | 4 | Team tokens, Notice, Button and Table; calm card (`terms-page-owner-1440.png`, `terms-acceptances-1440.png`) |
| D13 Accessibility | 4 | axe clean at 375, 512, 720, 1024 and 1440 on both pages. Focus goes to the heading. Focus is lost after accepting (m2); a long version overflows (m3) |
| D14 Team look | 4 | Inside PlatformFrame; same menu pattern as Team |
| D15 Speed | 5 | Settings → Terms: 4 API calls including sign-in, 50 rows, then Show more. No call per row |
| D16 Testability | 3 | 25 checks, each DW has a pass and a fail. But the 428 listener survives removal (M1), and the 400 path and Settings → Terms at 375/1024 are not in the pack (m1) |
| D17, D20 | simulated only | No intended user walked it |
| D18 Provenance | 4 | Each version is linked, with its published date and the "Wording Sample" note |
| D19 Closure | 4 | Publish → sign in → accept → carry on works on the product's own screens. There is no publishing screen, and the brief says versions are seeded |

## BIC scorecard (EXPERIENCE §6)
These are account screens, not case screens, so §6 does not formally apply. I scored the "Always" checks anyway.
* BIC-11 Met: one filled button per card, "I accept".
* BIC-14 N/A: no chips, icon-only buttons or numbers.
* BIC-18 Partly: loading is text, not a skeleton, as in the frame's precedent. The empty list says what is missing. The refusal says why.
* BIC-19 Met: at 1440 and 1024, one heading per panel and red only for the error.
* BIC-20 Partly (m2): keyboard-complete, and no sideways scroll at 512 px (200 % of 1024).
* BIC-01 to 10, 12, 13, 15 to 17 N/A: no facts, AI, filing or review step.

## [M] lines that apply
* Met:
  * server authorisation (the 403 is shown, not bypassed);
  * RFC 9457 words shown;
  * no per-row requests;
  * cursor paging used;
  * axe on every state the pack draws;
  * keyboard path;
  * no IDs on the main path. The 403 detail "(agent/settings:list)" is the guard's text, not this PR's.
* **Not met:**
  * §7 "a rule's test fails when the rule is removed" (M1);
  * §4 long content on the terms card (m3).

## Issues, ranked
* **M1 (Major, Must): the 428 trigger has no test.** The brief's rule is "On a `428 TERMS_PENDING` answer, the frame shows one page". The code does it (`terms-gate.tsx:342-346`).
  * Removed, the pack stays 25/25. DW6's "published while signed in" check passes only through the frame's re-check on navigation (`frame.tsx:73`).
  * Failing scenario, walked with the listener off: an Owner is on Settings → Terms with more than 50 rows. A privacy notice is published, and they click Show more. They get "Could not load more: Please accept the updated terms to continue." and no terms page. On the real code the terms page shows (J7).
  * Fix: in `check_pf5t_terms_browser.ts`, near :152, add an in-page call with no route change after publishing, and assert `[data-terms-page]`. For example, Show more with the first page's `nextCursor` set by a route rewrite, as DW8 does. Then run it with the listener removed to see it fail.
* m1 (Minor, Should): the pack also lacks:
  * the 400 path (`terms-gate.tsx:368`, a stale version refreshes the list; I walked it in J4);
  * Settings → Terms at 375 and 1024, and by keyboard. DW7 names both screens, and `:133` checks only 1440. I measured both: clean.
  * The post-accept refresh (`:365`) survives removal and shows no visible effect, because errored queries refetch on remount. Test it or drop it.
* m2 (Minor, Should): after "I accept", focus falls to `<body>` (J1), because the button unmounts. A keyboard or screen-reader user starts again from the top (WCAG 2.4.3). Fix: move focus to the returned page's `h1` or `main`.
* m3 (Minor, Should): a long unbroken version string overflows the terms card. Seen with a 150-character version at 375, 512, 720 and 1024 (sideways scroll, `terms-gate.tsx:379-380`). Fix: `[overflow-wrap:anywhere]` on the item. Settings → Terms already contains it in its table.
* m4 (Minor, Should): "Themself" (`acceptances-page.tsx:265`, `:283`) is non-standard. Use "Themselves" or "Own" (EXPERIENCE §5).
* m5 (Minor, Should): with a stale version, the 400 notice says "Reload the page…" while the list has already refreshed (J4). Clear or replace the notice once the refreshed list arrives.
* m6 (Minor, Should): dates use the browser locale (`terms-gate.tsx:381`, `acceptances-page.tsx:266`) and render as "11/18/2026", which is ambiguous for Canadian and Indian users. `components/status.tsx:63` `fmtDate` exists. This matches `team-page.tsx:18`, so the module-wide fix is a follow-up.

## Could not check / outside this row
* A real screen reader. The founder's or an intended user's unaided walk (D17, D20).
* Not a finding (P-26, touch list), but worth telling Lead B: `SalesFrame` (`front-office/sales/sales-frame.tsx`) has no terms branch. A pending person on Leads sees only the 428 words.
* The full CI is not run yet, because the PR is a draft.

**Verdict: Block.** Fix M1. The Minors are Should items: fix them here or list them as follow-ups.
