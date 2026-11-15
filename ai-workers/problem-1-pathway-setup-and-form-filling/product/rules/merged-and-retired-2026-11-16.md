# Merged and retired rule rows (B193 part 5, P-619 step 6; 16 Nov 2026)

Moved word for word from `RULES.md` (main af7df6d6) by the rule-triage lane, 16 Nov 01:0x IST, so the register is shorter and no rule is lost (P-188, P-611). Nothing here was reworded. **Merged** rows say the same as the RULES.md row named beside them, which stays in force; **retired** rows are done, one-time or superseded by the rows named. Why each moved: `design/rule-triage-2026-11-16.md`. Every old ID and where it went: `rules/rule-id-map-2026-11-16.tsv` (check-docs.sh fails if one is missing).

## Merged

| ID | Rule | Enforced by | As of |
|---|---|---|---|
| IDX-1 | Milestone plans stand as recorded (M3 done 29/29 10 Nov; the Bake; the Chrome extension, 40 sessions), detail in the side file: P-434, P-438, P-450, P-459, P-460, P-463, P-466, P-469, P-471, P-472, P-474, P-475, P-481, P-489, P-494, P-499; with P-435, P-447 to P-449, P-451 to P-457, P-476, P-482 to P-484, P-495. | prose | 12 Nov |
| P-550 | 2-3 tech leads for the four weeks from 13 Nov, each owning named modules and lanes; one holds the release; then back to one (amends P-511). | prose | 13 Nov |
| P-589 | A private backup now; cut CI minutes first (B190); private at the gate before real firm data (P-590: option C). | prose | 14 Nov |
| IDX-4 | Product rulings stand in their DECISIONS rows (read one when its capability is touched): P-441, P-443, P-444, P-487, P-490, P-491, P-496 to P-498, P-510, P-525, P-538, P-548, P-588; with P-72, P-78, P-148, P-154, P-242, P-411; holds P-235 to P-248 lifted (P-316). | prose | 14 Nov |
| P-508 | Never leave a question card open when the founder may leave (cron fires only when idle); reference folder `reference/` (P-509). | prose | 13 Nov |
| P-515 | Every step rests on a framework chosen after comparing the top options; the cto-review skill measures DORA and flow. | prose | 13 Nov |
| P-536 | Small fixes the desk and the Lead both recommend need no founder word, except money, a lower bar, a day or more, permissions, security. | prose | 13 Nov |
| P-541 | No immigration expert is booked: a value leaves Sample only with an official citation (page, quote, date). | prose | 13 Nov |
| P-553 | Launch on our own build; open-source parts only through STANDARDS §1 (P-563 stands). | prose | 13 Nov |
| P-555 | Tokens and accounts are the founder's; no usage cap; everything on GitHub so a new account resumes in minutes (P-552, P-554 withdrawn). | prose | 13 Nov |
| P-556 | No limit is not waste: every token is justified by the outcome. | prose | 13 Nov |
| P-566 | Firm sign-up is the standard self-serve SaaS flow; questions best practice settles are decided by the Leads with evidence. | prose | 14 Nov |
| P-614 | Target kept: all 101 by 29 Nov; no gate lowered; the 17 Nov check reports the forecast with the same measures. | prose | 15 Nov |
| P-436d | PRs under ~800 lines, split by layer: schema, API, screen (P-438 (1), P-610). | prose | P-612 |
| P-348h | Two PRs carrying a migration take different stamps. | prose | P-612 |
| QA-221 | Each form's own official words decide who fills it and what it asks (ruling, 4 Nov). | prose | 4 Nov |
| P-384 | The founder gives product direction only; the Lead owns the pipeline, paid runs included. | prose | 7 Nov |
| P-621 | Google only (Gmail, Calendar) for now; Microsoft deferred; ports stay provider-neutral. | prose | 16 Nov |
| P-436f | Models: Opus builds, reviews, breaks and reads fresh; Sonnet or Haiku for read-only side work; standbys idle; Fable never builds or reviews (P-455). | prose | P-612 |
| P-377 | Live runs from a Terminal tab (sandbox network); a paid run on the data Works counts on, never fixture-only. | prose | 9 Nov |

| ID | Outcome | Merged into (still in RULES.md) | Was in section | Why |
|---|---|---|---|---|
| IDX-1 | merged | IDX-5 | Goal and order | Both are indexes saying "the rulings named stand as recorded in their DECISIONS rows; read the row when its subject is touched". |
| P-550 | merged | P-558 | Goal and order | Both say: more than one tech Lead for the four weeks from 13 Nov, each owning named modules; P-558 names who holds what (and P-622 (4) now trims the number). |
| P-589 | merged | P-539 | Goal and order | Both say: the repository stays public for now, sensitive content goes to private notes, CI minutes are cut, private is revisited at the gate (P-589 is P-539's follow-up with the backup and option C, P-590). |
| IDX-4 | merged | IDX-5 | Goal and order | Same as IDX-1: product rulings stand in their DECISIONS rows, read when the capability is touched. |
| P-508 | merged | P-388 | Goal and order | Both say: no waiting question or prompt while the founder may be away (P-508's network cable is history, P-509). |
| P-515 | merged | P-502 | Goal and order | DECISIONS P-515 says it "extends P-502": both say every step rests on evidence and a framework compared against options, never assumption. |
| P-536 | merged | P-486 | Goal and order | Both list the same founder-only exceptions (money, a lower bar, a day or more, permissions, security) to the Lead deciding alone. |
| P-541 | merged | P-170 | Goal and order | Both say: an immigration value leaves Sample only with an official citation (page, quote, date). |
| P-553 | merged | P-587 | Goal and order | Both say outside code enters only through the STANDARDS §1 gate (P-563 and the "own build" product ruling stay in DECISIONS). |
| P-555 | merged | P-461 | Goal and order | Both say there is no usage cap and lanes push every step so any account resumes. |
| P-556 | merged | F-12Nov | Goal and order | Both say every cost (tokens included) is judged by the value it buys. |
| P-566 | merged | P-294 | Goal and order | Both say questions best practice settles are ruled by the Lead with evidence (its firm sign-up ruling stays in DECISIONS P-566). |
| P-614 | merged | P-609 | Goal and order | Both say: all 101 by 29 Nov, no gate lowered, the 17 Nov check reports the forecast. |
| P-436d | merged | P-610 | Builders and qa | Both say: a PR under about 800 changed lines (P-436d adds "split by layer", kept word for word in the side file). |
| P-348h | merged | P-600 | Builders and qa | Both say two PRs carrying migrations take different (later) stamps. |
| QA-221 | merged | P-170 | Builders and qa | Both say the official source decides: QA-221 for who fills a form and what it asks, P-170 for every immigration value. |
| P-384 | merged | P-532 | The tech lead | Both say the Lead owns the pipeline and every session and is the founder's one contact; the founder gives product direction. |
| P-621 | merged | IDX-5 | The tech lead | A product scope ruling (Google only for Release 1), like the rows IDX-5 indexes. |
| P-436f | merged | P-605 | Tokens, money, account | Both say Opus builds and reviews, Fable never builds or reviews (P-436f's Sonnet and Haiku clause kept word for word in the side file). |
| P-377 | merged | P-175b | Tokens, money, account | Both say a live call runs only as an approved paid run from a Terminal tab. |

## Retired

| ID | Rule | Enforced by | As of |
|---|---|---|---|
| IDX-2 | One-time or time-boxed directions, done or standing as recorded in the side file: P-485, P-506, P-507, P-533, P-537, P-545, P-569 (integration stopped). | prose | 14 Nov |
| P-583 | GitHub's free safety settings on in the checked order; the founder clicks, the Lead guides and verifies. | prose | 14 Nov |
| IDX-3 | Integration rules, stopped with the integration, kept in the side file for a resume: P-513, P-516, P-518 to P-520, P-522 to P-524, P-528, P-529, P-531, P-534, P-535, P-543, P-546, P-549; with P-517, P-527, P-544. | prose | 14 Nov |
| P-511 | One Lead (amended by P-550); the Fable planner is the founder's read-only strategy desk. | prose | 13 Nov |
| P-602 | Overnight on one account; lanes push and STATE says where to resume before 95%. | prose | 14 Nov |
| P-479 | Co-founder's copy parked (P-480): the Sample PDF goes by hand later, accepted on its checksum, nothing committed. | prose | P-612 |
| P-436a | Cost is context size: about 75% of spend is long sessions re-reading 300k+ contexts. | prose | 9 Nov |
| P-312 | Process freeze until 10 Nov 22:30 IST (expired); changes on a measured number, checked after a fixed period, kept or undone. | prose | 10 Nov |

| ID | Outcome | Superseded by or recorded in | Was in section | Why |
|---|---|---|---|---|
| IDX-2 | retired | P-545, P-569 | Goal and order | One-time or time-boxed directions by its own words; the standing parts are AGENTS rule 9 (P-545, start read) and DECISIONS P-569 (integration stopped). |
| P-583 | retired | STATE / BACKLOG | Goal and order | A one-time switch-on of GitHub settings on 14 Nov by the founder; any step still open is an action item, not a rule. |
| IDX-3 | retired | P-569 | Goal and order | Integration stopped (P-569); the rows are kept word for word in `rules/goal-and-order.md` for a resume. |
| P-511 | retired | P-550, P-558, P-622 | Goal and order | "One Lead" was amended by P-550, replaced by P-558's two Leads and trimmed by P-622 (4); the strategy desk part stands in P-514 and P-597. |
| P-602 | retired | P-557 | Goal and order | A one-night plan for 14 Nov; its standing half (lanes push, STATE says where to resume) is P-557. |
| P-479 | retired | P-480 | The tech lead | Parked by P-480 ("let's park it"); nothing to do or enforce while parked; DECISIONS keeps both rows. |
| P-436a | retired | P-446, P-446f | Tokens, money, account | A finding (where spend goes), not a rule; the rules acting on it are P-446 and P-446f. |
| P-312 | retired | P-502 | Tokens, money, account | Its freeze expired on 10 Nov 22:30 IST (its own words); "changes on a measured number" is P-502. |
