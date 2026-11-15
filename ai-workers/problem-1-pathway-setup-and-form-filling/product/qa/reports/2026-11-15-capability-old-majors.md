# qa capability old-majors — 15 Nov 2026, main 1fcde2d15

**Asked by:** the tech lead. The board's health light is red partly because 8 Major bugs on capabilities otherwise at Works are older than 48 h: QA-383, QA-276, QA-278, QA-239, QA-237, QA-234, QA-162, QA-355 (QA-275 excluded by P-358). Each needs a fresh verdict on main's head.
**Where:** a cloud qa copy, scratch isolated copies of main **1fcde2d15** (`studio/tools/isolated.sh`, ports 4472–4477, each started and stopped in the same command), fresh databases, US$0, live AI off. Each check run **twice** (QA-278 four times). The machine has 4 CPUs, so the database pool is smaller than the Mac's: a harder test for QA-278, not an easier one.
**Verdict reader:** fresh reader on Opus at high effort (P-605, P-608). It read the code and the checks independently, agreed on the seven fixed, and re-rated QA-383 **Critical** (below).

**Verdict: 7 of 8 fixed on main; QA-383 is still open, now rated Critical.** Records: 1 Critical open (QA-383), 0 new Majors, QA-278 closed.

## Verdicts

| Bug | Was | Verdict on main 1fcde2d15 | Evidence |
|---|---|---|---|
| QA-278 | Bug · Major, C6.1 (48 case opens at once: 23 × 500) | **Fixed on main** | `tests/qa/check_qa278_open_48.ts` **4/4, 3/3, 3/3, 3/3** (four runs, two copies): `{"statuses":{"201":48}}`, 48 pins and 48 audit lines for 48 opens. **Control on the commit it was logged on**, bf12209f1, same machine, same check (API server by hand, own database): **`{"201":25,"500":23}` twice**, the 500s Prisma `P2028` (transaction could not start in time) in `Runtime.createCase`. So the check still catches the bug, and main no longer has it. No merge names QA-278; the fix lies between bf12209f1 and 1fcde2d15 (not bisected). |
| QA-276 | Bug · Major, C4.11, C5.1 | **Fixed on main** (closed 11 Nov, re-verified) | qa's `tests/qa/check_qa276_section_move.ts` **13/13 twice**; the builder's `tests/check_forms_qa276_section_move.ts` **27/27 twice** (an edit made during a release is still 409, in words) |
| QA-237 | Gap · Major, C4.11 step 5 | **Fixed on main** (closed 11 Nov, re-verified) | `tests/check_forms_qa237_qa239_held.ts` **23/23 twice** (one step more than on 11 Nov) |
| QA-239 | Gap · Major, C4.11 step 5 | **Fixed on main** (closed 11 Nov, re-verified) | same check as QA-237, **23/23 twice** |
| QA-162 | Gap · Major, C4.11 step 5 | **Fixed on main** (closed 11 Nov, re-verified) | `tests/check_forms_qa162_saved_matching.ts` **39/39 twice** |
| QA-234 | Gap · Major, C4.11 | **Fixed on main** (closed 11 Nov, re-verified **by screens**) | Visitor visa of the six, maps applied by the people's steps (`tests/b83_six_steps.ts apply`), then qa's browser check `tests/qa/check_qa234_own_question_screen.cjs` (headless Chromium, 1440 px, screens only): **all passed twice**, including "an empty Why is refused on the form, in words" |
| QA-355 | Bug · Major, C7.8, C7.6, C7.1 | **Fixed on main** (closed 11 Nov, re-verified) | configured checkpoint (Demo › Load the configured checkpoint, 201), `tests/qa/check_qa355_added_form_spoils_release_facts.ts` **2/2 twice** |
| QA-383 | Bug · Major, C7.8, C6.19 | **Still open: re-rated Critical** ("Critical (a capability gives a wrong result)", BUGS.md: IMM 5409 is written with "only option: Canada"); C7.1 added | see below |

Six of the eight (QA-162, QA-234, QA-237, QA-239, QA-276, QA-355) were already closed on 11 Nov (`qa/BUGS-CLOSED.md`, with evidence on main 68a7b59d1 or fbfb263c7) and were **not open rows in `qa/BUGS.md`** when this round started. Whatever the board counts them from is out of date. A likely source: the C4.11 row of `qa/CAPABILITIES.md` still quotes, in its older evidence, "Known Majors on this row …: QA-162, QA-234, QA-237, QA-239 … and new QA-276"; the C7.8 row names QA-355 (as closed).

## QA-383 on main 1fcde2d15

Configured checkpoint, a With an LMIA (`wp.lmia_inside`) case opened by the case officer, client Sample Client A.
* **By screens** (`tests/qa/check_qa383_screen.cjs`, new; headless Chromium, 1440 px, twice): the client opens Client questionnaire › About Sample Client A › Personal details. "Country or territory where the person currently resides" is a list with one choice: **"only option: Canada"** (screens `2026-11-15-old-majors/qa383-question.png`, `qa383-page.png`).
* **Underneath** (`tests/qa/check_qa383_imm5710_current_cor.ts`, new, twice): the questionnaire offers `[{"key":"only option: Canada","label":"only option: Canada"}]`. Typing "Canada" now saves (200; on 10 Nov it was refused), but the answer carries the problem **"Choose one of: only option: Canada."**, so it counts as answered with a problem.
* **What the forms get** (one-off probe, not committed): picking the offered choice ("only option: Canada") saves with no problem. The generated copies were then read with pypdf. **IMM 5710** writes `<Country>511</Country>` in CurrentCOR Row2, which is right. **IMM 5409** (same fact, `IMM_5409[0].Page1[0].Info[0].Country[0]`) writes the text **"only option: Canada"** on the official form.
* **Cause, unchanged:** `engine/runtime/case.ts:146-147` (`shapeIn`) takes every label before "=" from the map note `code_list:imm5710.current_cor (only option: Canada=511)`, so the lead-in "only option:" becomes part of the label. `optionsOf` (`:168-170`) reads the same way. Nothing in `engine/options.ts` (`namesNoValues`, `isCodeRange`) reads an "only option:" lead-in.
* **Fix proposal (for the Lead; the fresh reader completed it):** read a map note's "only option:" lead-in as a lead-in, and an "e.g." list (`code_list:imm1344.country (e.g. Canada=511, United States of America=461)` in saved drafts) as no list, in **one helper in `engine/options.ts`**. Three readers use it:
  * `shapeIn` and `optionsOf` in `engine/runtime/case.ts` (`:146-147`, `:168-170`);
  * `pdfOptions` (`engine/options.ts:187`), which parses the same note;
  * the fill's inline code table (`p5/transforms.ts:370`), keyed today by "only option: Canada": "Canada" must map to 511 there (check against IMM 5710's inventory).

  Answers already saved as "only option: Canada" are read as "Canada" (a read step or a migration). The same lead-in is on IMM 5710's mailing and residential country notes (`address_component:country -> code_list:…`); the helper should cover them. **Touch list:** `engine/options.ts`, `engine/runtime/case.ts`, `p5/transforms.ts`, qa's two checks (extend them: IMM 5710 writes 511 and IMM 5409 writes "Canada"; today that comes from the probe only), and C6.19's pack step from #1450 review round 3 m1. Lane: forms. As a Critical it goes to the top of the backlog, and merges in that area wait until it is fixed and retested (qa skill §5).
## Records changed
* `qa/BUGS.md`: QA-278 closed (moved to `qa/BUGS-CLOSED.md` with the control run); QA-383 row brought to main 1fcde2d15 with the new evidence and the fix proposal; a short note lists all 8 verdicts.
* `qa/BUGS-CLOSED.md`: QA-278 added; the six closed rows each get "re-verified 15 Nov on main 1fcde2d15" with their counts.
* `qa/CAPABILITIES.md`: **C7.8, C6.19 and C7.1 read Partial** (QA-383, an open Critical, names them; P-305 (3): "An open Major or Critical keeps it Partial"). C7.1 was added on the reader's advice, because the fill writes the wrong value. Works count: M3 27/29 → 25/29, T 6/8 → 5/8. C6.1 stays Works: QA-278 no longer disputes it.
* New checks: `tests/qa/check_qa383_imm5710_current_cor.ts` and `tests/qa/check_qa383_screen.cjs`. Both fail today and pass when the fix lands.

## Not tested
* No GitHub runner run in this round: every check ran on scratch copies of main in this cloud copy, which the task allows. The closed six were green on GitHub's runners on 11 Nov (BUGS-CLOSED).
* QA-383 was walked at 1440 px only. The written IMM 5409 value comes from a one-off probe, not a committed check; the fix's check should assert it.
* QA-278's fixing merge was not bisected. Its check depends on timing and calls itself "not a CI timing gate", so nothing in CI guards against a regression (the reader's point).
* The QA-239 check proves the hold on Study permit only; the bug also named With an LMIA, Express Entry and Spouse (the reader's point). **Closed after the Lead's answer on #1802:** the C4.11 spread pack (`acceptance/C4.11-spread.test.ts`, C4.11-27) already proves it on all four. On main 08a0e887b it gave **8/8 on two fresh copies**: held on Spouse 4, Express Entry 4, Study permit 7, With an LMIA 7, with 0 Hiding errors; then none held through B86's and B88's doors. The pack is one run per fresh copy: a second run on the same database finds the holds already cleared (6/8), which is a property of the pack, not a product fault.
* QA-162 closed under its own condition. 13 of the 22 saved conditions are still left out, each with its reason; the follow-ups are QA-402 and QA-404.
* No capability was re-scored to Works: that needs a green pack on GitHub's runners (P-339).

## Questions for the Lead
1. QA-383 is still open, now **Critical** by the fresh reader (a wrong value written on IMM 5409). Please turn the fix proposal and touch list above into a fix row for the forms lane, at the top of the backlog, and hold merges in that area. If you rule it Major instead, C7.8, C6.19 and C7.1 stay Partial all the same.
2. The board still counts six bugs that were closed on 11 Nov. Please point it at the open rows of `qa/BUGS.md` only, or tell qa which file it reads.

## Suggestions
* Make the board's "old Majors" count come from `qa/BUGS.md` open rows only (gate-b.mjs already parses them). *Needed for the proof · Scaffolding.*
