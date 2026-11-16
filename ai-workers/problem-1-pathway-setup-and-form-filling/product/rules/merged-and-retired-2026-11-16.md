# Merged and retired rule rows (B193 part 5, P-619 step 6; 16 Nov 2026)

Moved word for word from `RULES.md` (main af7df6d6) by the rule-triage lane, 16 Nov 01:0x IST, so the register is shorter and no rule is lost (P-188, P-611). Nothing here was reworded. **Merged** rows say the same as the RULES.md row named beside them, which stays in force; **retired** rows are done, one-time or superseded by the rows named. Why each moved: `design/rule-triage-2026-11-16.md`. Every old ID and where it went: `rules/rule-id-map-2026-11-16.tsv` (check-docs.sh fails if one is missing).

## Merged

| ID | Rule | Enforced by | As of |
|---|---|---|---|
| P-550 | 2-3 tech leads for the four weeks from 13 Nov, each owning named modules and lanes; one holds the release; then back to one (amends P-511). | prose | 13 Nov |
| P-547 | The document system is approved with seven folds (its check never reds a product PR). | prose | 13 Nov |
| P-583 | GitHub's free safety settings on in the checked order; the founder clicks, the Lead guides and verifies. | prose | 14 Nov |
| P-589 | A private backup now; cut CI minutes first (B190); private at the gate before real firm data (P-590: option C). | prose | 14 Nov |
| P-508 | Never leave a question card open when the founder may leave (cron fires only when idle); reference folder `reference/` (P-509). | prose | 13 Nov |
| P-512 | Questions go in the end-of-turn box (cards only while the founder types); expert facts revalidated on canada.ca (see P-541). | prose | 13 Nov |
| P-514 | The Lead and the desk talk directly; each check looks at the desk's track file; the founder never relays. | prose (lead-watch skill) | 13 Nov |
| P-566 | Firm sign-up is the standard self-serve SaaS flow; questions best practice settles are decided by the Leads with evidence. | prose | 14 Nov |
| P-580 | The Lead fills vendor forms while the founder watches; the founder types every password, code and card detail. | prose | 14 Nov |
| P-592 | `MVP-CHECKLIST.md` is the one tracking page for Release 1. | prose | 14 Nov |
| P-515 | Every step rests on a framework chosen after comparing the top options; the cto-review skill measures DORA and flow. | prose | 13 Nov |
| P-536 | Small fixes the desk and the Lead both recommend need no founder word, except money, a lower bar, a day or more, permissions, security. | prose | 13 Nov |
| P-541 | No immigration expert is booked: a value leaves Sample only with an official citation (page, quote, date). | prose | 13 Nov |
| P-555 | Tokens and accounts are the founder's; no usage cap; everything on GitHub so a new account resumes in minutes (P-552, P-554 withdrawn). | prose | 13 Nov |
| P-556 | No limit is not waste: every token is justified by the outcome. | prose | 13 Nov |
| P-436d | PRs under ~800 lines, split by layer: schema, API, screen (P-438 (1), P-610). | prose | P-612 |
| P-348h | Two PRs carrying a migration take different stamps. | prose | P-612 |
| P-436f | Models: Opus builds, reviews, breaks and reads fresh; Sonnet or Haiku for read-only side work; standbys idle; Fable never builds or reviews (P-455). | prose | P-612 |

| ID | Outcome | Merged into (still in RULES.md) | Was in section | Why |
|---|---|---|---|---|
| P-550 | merged | P-558 | Goal and order | Both say: more than one tech Lead for the four weeks from 13 Nov, each owning named modules; P-558 names who holds what (and P-622 (4) now trims the number). |
| P-515 | merged | P-502 | Goal and order | DECISIONS P-515 says it "extends P-502": both say every step rests on evidence and a framework compared against options, never assumption. |
| P-536 | merged | P-486 | Goal and order | Both list the same founder-only exceptions (money, a lower bar, a day or more, permissions, security) to the Lead deciding alone. |
| P-541 | merged | P-170 | Goal and order | Both say: an immigration value leaves Sample only with an official citation (page, quote, date). |
| P-555 | merged | P-461 | Goal and order | Both say there is no usage cap and lanes push every step so any account resumes. |
| P-556 | merged | F-12Nov | Goal and order | Both say every cost (tokens included) is judged by the value it buys. |
| P-436d | merged | P-610 | Builders and qa | Both say: a PR under about 800 changed lines (P-436d adds "split by layer", kept word for word in the side file). |
| P-348h | merged | P-600 | Builders and qa | Both say two PRs carrying migrations take different (later) stamps. |
| P-436f | merged | P-605 | Tokens, money, account | Both say Opus builds and reviews, Fable never builds or reviews (P-436f's Sonnet and Haiku clause kept word for word in the side file). |

## Retired

| ID | Rule | Enforced by | As of |
|---|---|---|---|
| IDX-3 | Integration rules, stopped with the integration, kept in the side file for a resume: P-513, P-516, P-518 to P-520, P-522 to P-524, P-528, P-529, P-531, P-534, P-535, P-543, P-546, P-549; with P-517, P-527, P-544. | prose | 14 Nov |
| P-511 | One Lead (amended by P-550); the Fable planner is the founder's read-only strategy desk. | prose | 13 Nov |
| P-602 | Overnight on one account; lanes push and STATE says where to resume before 95%. | prose | 14 Nov |
| P-479 | Co-founder's copy parked (P-480): the Sample PDF goes by hand later, accepted on its checksum, nothing committed. | prose | P-612 |
| P-436a | Cost is context size: about 75% of spend is long sessions re-reading 300k+ contexts. | prose | 9 Nov |

| ID | Outcome | Superseded by or recorded in | Was in section | Why |
|---|---|---|---|---|
| IDX-3 | retired | P-569 | Goal and order | Integration stopped (P-569); the rows are kept word for word in `rules/goal-and-order.md` for a resume. |
| P-511 | retired | P-558, P-622 | Goal and order | "One Lead" was amended by P-550 (merged into P-558), replaced by P-558's two Leads and trimmed by P-622 (4); the strategy desk itself stands in P-514 and P-597. |
| P-602 | retired | P-557 | Goal and order | A one-night plan for 14 Nov; its standing half (lanes push, STATE says where to resume) is P-557. |
| P-479 | retired | P-480 | The tech lead | Parked by P-480 ("let's park it"); nothing to do or enforce while parked; DECISIONS keeps both rows. |
| P-436a | retired | P-446, P-446f | Tokens, money, account | A finding (where spend goes), not a rule; the rules acting on it are P-446 and P-446f. |
| P-547 | merged | IDX-2 | Goal and order | One-time process direction folded into IDX-2 by #1943 (RULES under 25 KB); its row is word for word in `rules/goal-and-order.md` › Index lists (Lead 66, 16 Nov). |
| P-583 | merged | IDX-2 | Goal and order | One-time process direction folded into IDX-2 by #1943 (RULES under 25 KB); its row is word for word in `rules/goal-and-order.md` › Index lists (Lead 66, 16 Nov). |
| P-589 | merged | IDX-2 | Goal and order | One-time process direction folded into IDX-2 by #1943 (RULES under 25 KB); its row is word for word in `rules/goal-and-order.md` › Index lists (Lead 66, 16 Nov). |
| P-508 | merged | IDX-2 | Goal and order | Folded into IDX-2 with the one-time and standing process directions (RULES under 25 KB with B193 part 2's cells); its row is word for word in `rules/goal-and-order.md` › Index lists and above (Lead 66 fold, Lead 68 note, 16 Nov). |
| P-512 | merged | IDX-2 | Goal and order | Folded into IDX-2 with the one-time and standing process directions (RULES under 25 KB with B193 part 2's cells); its row is word for word in `rules/goal-and-order.md` › Index lists and above (Lead 66 fold, Lead 68 note, 16 Nov). |
| P-514 | merged | IDX-2 | Goal and order | Folded into IDX-2 with the one-time and standing process directions (RULES under 25 KB with B193 part 2's cells); its row is word for word in `rules/goal-and-order.md` › Index lists and above (Lead 66 fold, Lead 68 note, 16 Nov). |
| P-566 | merged | IDX-2 | Goal and order | Folded into IDX-2 with the one-time and standing process directions (RULES under 25 KB with B193 part 2's cells); its row is word for word in `rules/goal-and-order.md` › Index lists and above (Lead 66 fold, Lead 68 note, 16 Nov). |
| P-580 | merged | IDX-2 | Goal and order | Folded into IDX-2 with the one-time and standing process directions (RULES under 25 KB with B193 part 2's cells); its row is word for word in `rules/goal-and-order.md` › Index lists and above (Lead 66 fold, Lead 68 note, 16 Nov). |
| P-592 | merged | IDX-2 | Goal and order | Folded into IDX-2 with the one-time and standing process directions (RULES under 25 KB with B193 part 2's cells); its row is word for word in `rules/goal-and-order.md` › Index lists and above (Lead 66 fold, Lead 68 note, 16 Nov). |

## The RULES.md note, word for word (moved by Lead 64, 16 Nov 08:3x IST, size limit)
**Triaged 16 Nov (B193 part 5, P-619 step 6):** 9 rows merged into the row that says the same and 5 retired, word for word in `rules/merged-and-retired-2026-11-16.md`; every old ID and where it went in `rules/rule-id-map-2026-11-16.tsv` (check-docs.sh fails a missing one); the check queue for the other prose rows: `design/rule-triage-2026-11-16.md`.

* Retired by Lead 69, 20:5x IST 16 Nov (replaced by P-643), row word for word: | P-642 | Extra usage cap US$50 tonight; until the founder switches it on, the 96% stop line stands. (replaced by P-643) | prose | 16 Nov |
