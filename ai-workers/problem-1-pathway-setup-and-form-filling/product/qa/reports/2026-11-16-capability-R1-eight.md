# qa · capability, eight Release 1 rows · main 90ea6cfe6 · 16 Nov 2026, 12:xx IST

Lane: qa, cloud copy (bound 16 Nov, P-608). Rows asked by the current Lead: map rows 6, 27, 38, 40, 47, 49, 80, 99, which the board shows "Built" and qa's file showed Partial or Not built. Verdicts by a fresh Opus reader at high effort who ran nothing (P-303): `2026-11-16-capability-R1-eight/verdicts.md`. Tester's facts: `…/tester-notes.md`. Raw outputs: `…/*.txt`. Live AI off (fake launcher and saved runs); US$0; no priced button; nothing on :4400 (not reachable from the cloud copy).

## Verdict
| Row | Was | Now | Held by |
|---|---|---|---|
| R1.6 Permissions | Partial | **Partial** | QA-477, QA-478 (Majors, P-305) |
| R1.27 Every lead carries a source | Partial | **Partial** | parts missing: FO-4b; Gaps QA-479, QA-480 |
| R1.38 Time zones | Partial | **Partial** | parts missing: FO-3w part 1, FO-3st1, J-38 |
| R1.40 Calendar invite files | Partial | **Partial** | parts missing: FO-3w part 1, J-38 |
| R1.47 One email layout | Not built | **Partial** | parts missing: PF-19b part 2 and MailPort through MessagePort; Gap QA-481 |
| R1.49 Consent gate; unsubscribe | Not built | **Partial** | parts missing: PF-19b part 2 (unsubscribe) and the MailPort routing; Gap QA-481 |
| R1.80 IRCC forms per applicant | Partial | **Partial** | C7.2 on QA-315, QA-165 (Majors) |
| R1.99 AI on top of the guardrails | Partial | **Works** | — |

Release 1 at qa Works: **5** (R1.2, R1.9, R1.11, R1.12, R1.99). **The board's "Built" is wrong for rows 47 and 49**: only "PF-19b part 1" (booking mail) merged; the board's title match reads it as all of PF-19b (FORMULAS.md "accepted limit"). Rows 6 and 27 are also not whole: J-6 part 2, PF-6 part 2, FO-4 part 2 and FO-4b are open.

## What works
* **GitHub:** merge batch ci 43801075002 (draft #1926: base 9c671032f + #1912 PF-6 part 1 + #1915): 8 shards, types, 5 regression jobs green; regression job 133082469241 ran the C6.5 and C7.5 packs. Main after #1912 is records only.
* **R1.99 → Works.** P-616 moved the model choice to launch condition C26. qa re-runs on the configured checkpoint, live AI off: C6.5-counts 13/13, C6.5-screen 33/33, C6.5 57/57, C7.5 16/16; BK-14 15/15 and 10/10; C3.1 acceptance 17/17.
* **R1.6, part 1 meets the text (A6):** J-6 walk 50/50 twice; pf4 119/119, pf6b 24/24, fo2 113/113, fo4 45/45. qa's new sweep `tests/qa/check_r16_deny_sweep.ts` 10/10 twice: all 60 platform and front-office routes declare access; no token → 401 on 58; a Case Officer on the 23 routes whose keys they lack → 403 in words; the Owner passes the same 23; no duty hands out a money key.
* **R1.38, R1.40:** no regression after FO-3pa (#1830) and FO-3m (#1831): TZ walk 19/19, inbox walk 16/16, staff move 11/11, twice.
* **R1.49's gate on MessagePort:** pf19a 94/94, pf19b_sending 40/40 (marketing without consent suppressed and never sent; suppressed address gets nothing).

## Bugs
0 Blocker · 0 Critical · **5 new Major** · 0 Minor.
* **QA-477 · Bug · Major (R1.6):** an invitation that gives money keys writes no money-keys audit line (the J-6 breaker's F3, replayed: `check_qa477_money_keys_by_invitation.ts` 4/5 twice). Lane: runtime.
* **QA-478 · Conflict · Major (R1.6):** with "everyone sees all" off, an Owner sees all leads but only their own retainers (breaker's F2). Needs the tech lead's ruling.
* **QA-479 · Gap · Major (R1.27):** no list filters by source; no row shapes it.
* **QA-480 · Gap · Major (R1.27):** lead import (AG-2-7) is in no row.
* **QA-481 · Gap · Major (R1.47, R1.49):** the case side's link and code emails (`person-link.ts:168,177,285`) skip the layout and the consent gate; no row moves them.

## Coverage and suites
* Suites: the CI batch above (P-85) plus qa's targeted re-runs. No full local run, no c8, no `graph.mjs` this round: capability mode, no app-code change by qa.

## Could not test
* **Per-suite lines of the GitHub batch:** the log host was refused from the cloud copy. R1.99's Works holds on the condition that none of its suites passed only on retry in shards 2-8; please copy them from 43801075002 on the Mac.
* **A GitHub run for the booking code on main:** #1831 merged after the batch's base; its own queue run was not read.
* **J-6's walk and qa's `tests/qa/*` on GitHub's runners:** CI runs `tests/check_*` only.
* **A headed walk:** no visible browser in the cloud copy; headless only.
* **QA-165:** needs the Mac's Adobe Validate run.

## Questions for the Lead
1. **QA-478:** with "everyone sees all" off, does an Owner or Admin see the firm's prospects and retainers, or only their own? One rule for both areas.
2. **R1.27:** shape the source filter (QA-479) and lead import (QA-480), or narrow the capability text by decision?
3. **QA-481:** are the case side's link and code emails in row 47's "every email on both sides"? Is PF-13 (logo and colour) a part of row 47?
4. **R1.6 on GitHub:** move J-6's API halves into a CI-run `tests/check_*` suite, or accept qa's local walk as gate A?
5. **The board:** rows 47 and 49 (and 6 and 27) show "Built" while parts are open; the checklist still says "In PR" for rows 6 and 27, and row 80's C7.1/C7.8 note is old.

## Suggestions
* The board's built rule should not count a PR titled "<id> part 1" as the whole part. *Needed for the proof* · *Scaffolding*.
* QA-477's fix is small (one audit write on accept); with it and QA-478's ruling, R1.6 is the next likely Works. *Needed for the proof* · *Capability*.
