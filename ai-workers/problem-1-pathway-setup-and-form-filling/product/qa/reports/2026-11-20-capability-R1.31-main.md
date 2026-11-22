# qa capability R1.31 — re-proof on main 1ee04f2b4, 20 Nov (cloud qa lane; Opus 5.5 medium; reader Opus 5.5 high; live AI off; US$0)

**Item:** R1.31 "Only a signature, Signed offline or Convert moves a prospect to Won (any other move refused); totals per currency, never mixed." P-741: the e-signature door and a Signed-offline screen belong to FO-5s/FO-6; R1.31 proves the stage rule (Convert by screens, Signed offline by API).

**Verdict: Works** (P-339). Two green walks.yml `j_31` runs on main's head 568e240fd, and a fresh Opus reader who gives Works.

## What qa 9 left open
qa 9 (20 Nov ~06:xx IST, main 54ba0cce3) scored Partial, held only for P-339's runs. The pack run was item-proof 44641146727 on 54ba0cce3. The independent walks.yml `j_31` run on main was asked on #2296.

**Finding:** walks.yml never ran `j_31` on main. The two runs dispatched after #2296 merged ran **`walk j_33`**, plus the two self-tests: 44666100413 and 44666113220, both on d07a08fbc. Main has also moved on from 54ba0cce3. qa re-asked on #2296 (comment 7035137044) for walks.yml `j_31` twice on main's head.

## Runs on fresh isolated copies of main 1ee04f2b4 (never :4400)
| Run | Result | Output |
|---|---|---|
| `tests/journeys/j_31.ts` (J-30's walk under R1.31's number) | 55/55, twice | `2026-11-20-capability-R1.31-main/j31-run{1,2}.txt` |
| `tests/qa/check_r131_gate_a_value.ts` (gate A by screens: Value typed on the prospect panel, stored, board "USD 5,000" at 400/1024/1440 px) | 6/6, twice | `…/gate-a-value-run{1,2}.txt`, `…/shots/` |

**App changes in the R1.31 area since 54ba0cce3** (`git diff --stat 54ba0cce3..1ee04f2b4` on front office and prisma): `lead-page.tsx` gained the Messages box mount (PF-19b part 3, two lines); `type-page.tsx` changed 3 lines (booking). The rest is platform-offices schema. Nothing touches the stage rule, Convert, or the totals.

## Bugs
No open Blocker, Critical or Major names R1.31 in `qa/BUGS.md`. QA-533 (Major) is R1.30's.

## Runs on GitHub (P-339)
Dispatched by Lead 3 (series 3) on main **568e240fd**. Its front-office code is the same as 1ee04f2b4.
| Run | Job | Result | Artifact |
|---|---|---|---|
| [44712124997](https://github.com/expat-ready/xpatready/actions/runs/44712124997) (pack run) | 136206500042 `walk j_31` | 55 PASS, 0 FAIL, exit 0; 8 videos, 3 traces | 14617439332 |
| [44712138351](https://github.com/expat-ready/xpatready/actions/runs/44712138351) (independent re-run) | 136206503602 `walk j_31` | 55 PASS, 0 FAIL, exit 0 | 14618315711 |

The R1.31 lines in the run log:
- "W6 DW11 pass (R1.31): Yes moves it to Won by Convert (cause CONVERT)…"
- "W6 pass (R1.31): Signed offline wins the prospect … [200,[WON, SIGNED_OFFLINE, SIGNED_OFFLINE]]"
- "W3d fail: a Won card cannot be dragged"
- "W6 end: the walk ends at the won prospect in the board's Won column"

Both runs logged one step screenshot timeout ("record: no screenshot for step 44/52"). That is recording only; no assertion failed.

## Fresh reader (Opus 5.5 high, ran nothing)
**Works, ~80%, held only by the GitHub runs.** Nothing in the behaviour holds it back.
- **Only Convert or Signed offline makes Won.** `winProspect` is the only writer of WON (`api/src/front-office/sales/prospects.ts:81-90`). Its callers are Convert (`:308`) and Signed offline (`retainers/service.ts:609`).
- **Any other move is refused.** A person's move into Won gets 422 WON_BY_EVENT (`:263`), a move out of Won gets TERMINAL (`:265`), a change of type refuses a won prospect, and a booking moves only open-stage prospects (`arrival-port.ts:158`).
- **Totals are grouped per currency in the database** (`board-totals.ts:11-21`) and shown side by side (`pipeline-page.tsx:24-26`).
- **By screens:** the drag onto Won is refused (`j_30.ts:236`), Won is not offered by Move to… (`:185`), and Convert works (`:293-295`). By API (P-741): the refused move (`:85`), and Signed offline on a retainer the test inserts by SQL (`:317-322`).
- **Weak spot, a Minor test gap:** `j_30.ts:322` asserts `won_via !== "CONVERTED"` rather than `=== "SIGNED_OFFLINE"`. Recorded as a suggestion below: the behaviour is right in the code (`retainers/service.ts:609` passes SIGNED_OFFLINE); only the assertion is loose.
- No open Major or Critical names R1.31.

## Suggestions
- `j_30.ts:322`: assert `won_via === "SIGNED_OFFLINE"`. *Later · Capability* (J-30's lane).
