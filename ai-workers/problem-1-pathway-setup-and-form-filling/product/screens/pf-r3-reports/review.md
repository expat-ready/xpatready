# PF-R3 Reports page (R1.79 part 4) · independent review

Reviewer: a fresh agent that did not build it (skills screen-review and journey-test) · PR #3864 draft · commit `b6b117848271d9062b29e2e2b46de4f56c21d725` · concept `concept-draft.md` r2 + `challenge.md` + `design/draft-reports.html` (branch `claude/runtime-pfr3-concept`, #3849; Lead 5's answers 1-3) · isolated copies :4741 and :4742, never :4400 · 26 Nov 2026.

**Verdict: Block** (skill scale: Ship after fixes). There are four Majors, each a small fix. The back end is sound: the person filter never reaches a `view.own` viewer, the export is audited before the file, and money is shown per currency.

## What I ran
- `check_pfr3_reports_browser.ts` on a fresh copy: **27/27**. A second run on the same database: 26/27. The BR7 API check wants `130.00`, and the invoices from run 1 double it. The check needs a fresh copy but, unlike J-79, never says so (Minor m9).
- `j_79.ts` on its own fresh copy (:4742, header line): **12/12**.
- My own walk (Playwright, my script; screenshots at 1440, 1024, 512 px = 1024 at 200 %, and 375 px). Personas: the Owner (signed in on the sign-in card, Home → Reports), Billing / Finance, Read-only, Case Manager and Case Officer, plus API break tests. The full walk is in `journey-test-reviewer-2026-11-26.md`.
- `graph.mjs`: G3 lists the four `/platform/reports/*` routes as tested by nothing. This is the tool's blind spot (the check reaches them through a local `api()` helper and the page through `staffApi` template strings), not a real gap.

## The departure (sibling `GET /reports/filters`)
**Accepted.** PF-R1's test (2) (`check_pfr1_reports.ts:256`) asserts that the layout answer is the same for every viewer. Adding `people` to it would break that test. The sibling route keeps the rule and gives the concept's behaviour: `people` only for `view.all`, `period` in the firm's zone, and `canExport`. The departure is named in the PR body, `qa/built/R1.79.md` and the `routes.ts` header.

## Concept fit per BR (my evidence)
- **BR-1 scope per card:** Partly. Each card shows its badge from its own answer. Billing on the Owner dashboard sees "Your work" on sales and case cards and "Whole firm" on money cards. WITHHELD cards carry no badge. A Case Officer who sets `scope` by hand gets `own` back. **But see Major 2:** the person words appear before the matching figures do.
- **BR-2 dashboard by role:** Met. Owner → Owner, Billing → Billing / Finance, Case Manager → Case Manager, Read-only → Case Officer, `?dashboard=nope` → the viewer's default.
- **BR-3 filter bar:** Partly. The person filter does not leak:
  - `filters` returns no `people` to the Case Officer, Billing or Read-only;
  - their `person=` in the address is dropped, and their requests carry no `staffId`;
  - the Case Manager's picker loads (challenge M1 closed).
  
  The address holds every filter, and a reload keeps them. **Month picker missing** (Major 3).
- **BR-4 money per currency:** Met. "CAD 1,130.00 · USD 210.00" on separate lines, never summed. A person filter that narrows to nothing shows "No invoices in this period", never "USD 0.00".
- **BR-5 "What this counts":** the words equal `source` (the check compares them), but they can only be read on mouse hover (Major 1).
- **BR-6 states:** Met on screen for the per-metric empty copy, "Not in your access" with the Financial-reports tooltip, the muted dashed "Not counted yet" (Q3), and Unavailable + Retry (never 0).
- **BR-7 export:** Met.
  - The button appears only with the key, on a table with rows.
  - My Owner export wrote one line: `actor staff:<id>`, `entity plat_report_export`, a uuid key, the summary "Report table exported: Tax collected, 2 rows.", and detail `{metric, scope: financial, from, to, rows: 2}` with no figure. The line shows in the Activity log.
  - Refusals write no line: Case Officer 403, Billing 403, Case Manager on a WITHHELD table 403, a single figure 400, an unknown or unregistered metric 400, an extra key 422, anonymous 401.
- **BR-8 drill-through:** no link anywhere. The rest was deferred by Lead 5's answer 1, so it is not a finding (P-26).

## Issues, ranked
**Major 1 (Must): BR-5 words cannot be reached by keyboard or touch.**
- `Tip` (`reports-page.tsx:22-25`) is a native `title` only. Its comment says the words open on keyboard focus, but they do not: on focus the (i) gets a ring and no text, and a click shows nothing (no `[role=tooltip]`).
- At 375 px, on a phone, "What this counts" can never be read.
- This breaks BIC-14 and EXPERIENCE §2.10 and §2.12 [M].
- **Fix:** use the team's `components/ui/tooltip.tsx` (Radix opens it on hover and focus) or a click toggletip, and test it.

**Major 2 (Must): stale figures appear under the new scope words.**
- The query uses `keepPreviousData` (`:87`), while the badge reads the person from the address (`:90`, `scopeWords :54`).
- Owner → Person "Case officer (Sample)": until the new answer lands, the cards read "Case officer (Sample)'s work · CAD 1,130.00 USD 210.00", which are the firm's figures. The settled answer is "No invoices in this period". I caught it in a normal walk and again with the query slowed down. There is no "updating" cue.
- A `person=` id from outside the people list makes the badge say "Whole firm" over figures narrowed to nobody.
- **Fix:** while `isPlaceholderData`, mark the cards busy (skeleton, or dimmed with `aria-busy`) and take the badge from the filters the answer was fetched with. Use "Selected person's work" when the id is not in `people`. Add a check for "<Name>'s work" with the narrowed figure.

**Major 3 (Must): no month picker; From after To is silently undone.**
- The row (batch 5: "a month picker"), BR-3 ("Month … custom From–To is offered") and the board (Month: November 2026 / October 2026 / Custom dates…) all have one. The build has only two raw date inputs (`:113-114`).
- Typing From = 2026-12-15 snaps the field back to 11/01 with no message (`contract.ts:44`), while the address keeps `from=2026-12-15` (BIC-13).
- **Fix:** a Month select (the firm's month and earlier months, plus "Custom dates…" that shows From–To), and a field message for From after To.

**Major 4 (Must): named BR cases are untested, though the PR claims a pass and a fail per BR.**
- Concept §6 adopts challenge M6's table in full. Missing:
  - BR-6's empty-period copy;
  - BR-1's "<Name>'s work" under a person filter;
  - BR-2's Read-only → Case Officer;
  - BR-3's person reloading from the address;
  - BR-3's Billing request with no `staffId`.
- Removing `emptyWords`, `isEmpty` or the person branch of `scopeWords` leaves 27/27 green. This breaks STANDARDS §3.10 and §7 [M].
- **Fix:** add these checks (Major 2's check covers BR-1).

**Minor** (fix, or list in the PR with a follow-up):
- m1. A table is a bordered card nested in the card: `Table`'s own border and radius (`controls.tsx:177`). Concept §4 (m8) says it must not be. Rows are 37 px; the concept says 44.
- m2. "(left the firm)" is shown for every non-ACTIVE status, so a SUSPENDED colleague reads as having left (`routes.ts:65`, `reports-page.tsx:117`). Say "(Inactive)" (challenge M1).
- m3. An export of an empty table returns 200 with a file that has no header row (columns come from the rows, `export.ts:34-44`), plus a 0-row audit line. It is reachable by API or a race. Refuse it or write the header from the definition.
- m4. The page's 403 copy asks for "the Export permission" for a WITHHELD refusal too (`reports-page.tsx:97`). The concept's words are "You can't export reports. …".
- m5. Reports is not in the staff left menu, and the path reads "My account › Reports" (PlatformFrame without an area). The page is reached only through Home's list, which meets the concept's "one menu link" only literally.
- m6. The audit `detail` keeps the filters as sent, not the narrowed `staffId` (challenge M4). No seeded role tells the difference today.
- m7. Column order and the report keys are written twice, in web and API (`columnsOf` vs `Rows`), against STANDARDS §7. The CSV header is the raw key (`tax_name`) while the screen says "Tax name".
- m8. Retry is the one filled button and is 32 px tall at 375 px (UXL-09: 44). The Person select widens to the longest name (about 670 px at 1024 with a long Sample name).
- m9. `check_pfr3_reports_browser.ts` is not rerunnable on the same copy (see What I ran). Refuse the run, as J-79 does.

## D1–D20 (independent reviewer, browser and script)
D1 3 month picker missing; stale scope words · D2 4 read-only; line before file; header-less empty CSV · D3 4 reuses the door, `csvRow`, `auditEvent`; some logic written twice · D4 N/A (no rules) · D5 4 reload keeps filters, Retry, double-click gives one line; check not rerunnable · D6 4 audit line with scope and rows, in the Activity log · D7 N/A (no AI) · D8 3 "My account › Reports", not in the left menu · D9 3 changing the month needs two date edits · D10 3 tooltips unreachable; "(left the firm)" · D11 3 stale figures; silent From>To · D12 4 clean; nested table card · D13 3 axe 0 at 3 widths, 200 % fine, keyboard path complete, tooltips not on focus · D14 4 team controls and tokens · D15 5 LCP 372 ms, one query per view · D16 3 27 checks, mutation gaps (Major 4) · D17 simulated only · D18 3 source and scope per card, source hover-only · D19 4 J-79 12/12; drill deferred · D20 simulated only.

## Scorecard (concept 4c: BIC-11, -13, -14, -18, -19, -20 apply; the rest N/A, read-only page)
| BIC | Score | Evidence |
|---|---|---|
| 11 | Met | Only Retry is filled; Export is outline (Billing / Finance at 1440 and 1024) |
| 13 | Partly | Export errors say what and why; From>To reverted with no message (Major 3) |
| 14 | Not met | Native `title`; no tooltip on focus or click (Major 1) |
| 18 | Partly | Skeletons and teaching empties; stale figures during a reload (Major 2) |
| 19 | Met | One heading per card; red only for errors; counts say what they count |
| 20 | Partly | Keyboard path and 200 % zoom work; tooltip words not keyboard-visible |

UXL: 01-06 Met · 07, 08, 13 N/A · 09 Partly (m8) · 10, 11 Met (tables scroll inside at 375) · 12 Partly (Major 2) · 14 Met (scope in words, en-only screen).

**Journey score: 7/10, below the pass mark of 8** (no criterion at 0; see the journey-test report).

## Not checked
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); the walk video (no ffmpeg here); LCP on the Mac or CI.

Reviewer: Block b6b117848271d9062b29e2e2b46de4f56c21d725
