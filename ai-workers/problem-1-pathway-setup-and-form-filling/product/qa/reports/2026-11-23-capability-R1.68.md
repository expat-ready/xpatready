# qa capability R1.68 — Preview for staff review (24 Nov 00:5x IST)

**Ask:** Lead 12: CS-D5 (#3188) has been on main since 16:04 UTC 23 Nov, and CAPABILITIES still said Not built.
**Duplicate check:** no qa report on R1.68 since 18 Nov (`2026-11-18-rescore-g-l.md`); no open PR names R1.68 or CS-D5; no `j_68` on main.
**Run:** main ff55aab02 · isolated copies (`PLATFORM_IDENTITY=local`, ports 4468/4469) · live AI off · US$0 · never :4400.

## Verdict
**Partial, no verdict (P-606). Part missing: CS-D5 part 2, the screen.** BACKLOG sizes CS-D5 as "2 PRs: API; then screen". Only part 1 (the API) has merged. Fresh reader (Opus): the same.

## What was run
| Check | Result |
|---|---|
| `tests/check_csd5_preview.ts` (part 1's check: single use, expiry, other firm, other staff, altered token, client 403, HEAD, `contains_scripts`, nameless URL) | 23/23, exit 0, **twice** locally; 23/23 on GitHub in merge batch run 45206634081, shard 17 |
| Gate A by screens, officer at 1440 px, Visitor visa case | **5/7 twice, same steps** |
| · P1 a clean passport PDF uploaded on the line by screen: Received, named | PASS |
| · P2 a Preview control on the line or in its menu | **FAIL (CS-D5 part 2)**: the menu holds only "Upload a file…, Not applicable…, History" (shot `2026-11-23-r168-gate-a/P2-line-menu-1440.png`) |
| · P3 a viewer anywhere on the case page | **FAIL (CS-D5 part 2)**: none |
| · P4 part 1's link, called as the screen would: POST `…/documents/:id/preview-link` 200; GET of its URL 200, `inline`, `nosniff`, CSP `default-src 'none'; sandbox`, no name in the URL | PASS |
| · no model call (ai_batch unchanged) | PASS |
| `git grep "preview-link\|document-previews\|pdfjs" -- web/src package.json` | nothing: no screen calls part 1 |

There is no row pack: R1.68 has no `j_68`, so walks.yml has nothing to run yet. The walk script was a qa scratch file and is not committed (records only, as asked).

## Bugs
None new. Part 1 behaves as its PR says.

## Questions for the Lead
1. Is CS-D5 part 2 (the screen) on a lane? #3188 says part 2 also needs CS-D1 parts 2-3 (the accept route) and the `pdfjs-dist` gate.
2. When part 2 lands, should qa write `j_68` (screen walk to C6.4's accept/reject as the next capability's first step), or will the builder's journey script be the pack?

## Suggestions
* *Needed for the proof · Capability:* part 2's journey should end at C6.4's accept/reject on the same line (gate A's "next capability's first step").
* *Later · Scaffolding:* #3188 defers single use and the key to one process (deploy MIN_TASKS = 2). That needs a row before the cloud runs two tasks.

## Also in this PR (from earlier tonight)
`qa/CAPABILITIES.md` row R1.67, Works confirmed on main 09b3893df (walks 45222716893), and the report `2026-11-23-trackB-r165-r167.md`. Its R1.65 half matches the row qa Track B 3 had already put on main (Partial; PF-F1c deployed check missing), so main's R1.65 row is kept unchanged.
