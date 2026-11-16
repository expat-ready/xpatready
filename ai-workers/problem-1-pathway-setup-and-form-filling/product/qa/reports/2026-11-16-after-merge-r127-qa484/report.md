# qa after-merge — QA-493 (R1.27) and QA-484 retest, main d66bcfd2d, 16 Nov 21:3x IST

Asked by Lead 69 (Prove Lead plan, P-644) after FO-4sf #1962 (18:23 IST) and PF-5v part 1 #1955 merged. Lane: cloud qa after-merge (`2026-11-16-after-merge-lane.md`). Live AI off, US$0. Verdicts by a fresh Opus reader at high effort who ran nothing (P-303).

## Verdict
| Item | Verdict |
|---|---|
| QA-493 (Gap · Major, R1.27 "lists filter by source") | **Closed.** Row moved to `qa/BUGS-CLOSED.md`. |
| R1.27 Every lead carries a source | **Parts missing: FO-4b** (embed with campaign; BACKLOG "not built"). No verdict (P-606). |
| QA-484 (UX · Minor, empty sign-up in the validator's words) | **Fixed on main** (reader: CLOSE). Its row lives only in qa #1950 (open), not on main; #1950 already records it closed on 39d4c831b. This PR leaves #1950's row to #1950. |
| QA-500 (new, Bug · Minor) | The FO-4sf pack is not re-runnable on one database (line 177 reassigns a Referral lead and never restores it). |

## Evidence (isolated copies of main d66bcfd2d, PLATFORM_IDENTITY=local)
* `tests/check_fo4sf_source_filter.ts`: 34/34 and 34/34 on two fresh copies. DW1: filter by stored source (not the door), several values, a comma value, empty = all, A-to-Z choices, unknown or wrong-case → 400 UNKNOWN_SOURCE. DW2: an own-only Case Officer is never widened and never sees another person's sources. DW3: the Leads screen by keyboard, kept in the address over a reload, axe-core, 375/1024/1440 px.
* Same database, twice in a row: 34/34, then 33/34 (DW2 line 85). Cause: the pack's own leftover data (QA-500); the product is right.
* `tests/qa/check_r127_lead_source.ts`: 5/5 (a lead with no source is refused by the database).
* `tests/check_pf5v_signup_mail.ts`: 7/7 twice (run with `--tsconfig api/tsconfig.json`; without it tsx cannot compile the API's parameter decorators, which is the runner's error, not the code's).
* HTTP `POST /api/public/signup` on the running copy: `{}`, all empty, all blank, wrong types and an unknown key each answer 400 CHECK_FIELDS with plain words on the field ("email: Enter your work email.", "password: Choose a password.", "firmName: Enter your firm's name.", "extra: not a field of this form"). No validator text.
* Screen: the pack's screenshot at 1024 px shows Leads with "Source (1)" · "Phone call ×" · "All sources" and only Phone call leads listed.
* Lines: `run1-same-copy-lines.txt`.

## Bugs
0 Blocker · 0 Critical · 0 Major · 1 new Minor (QA-500). Closed: QA-493.

## Not tested
A headed walk by a person (cloud copy, no browser pane): the pack's DW3 drives the real screen in Chromium. The shared demo :4400 is not reachable from this cloud lane.

## Questions for the Lead
None.

## Suggestions
* MVP-CHECKLIST row 27 is stale ("FO-1a (In PR #1742) … Shaped"; FO-4sf and FO-4b not named). *Needed for the proof* · *Scaffolding*.
* QA-494's narrowed wording (import "when AG-18's engine lands") still waits for the Lead to copy it into the R1.27 text. *Needed for the proof* · *Capability*.
