# R1.107 (AS-2) shape: five provincial streams, client copy (P-526; for the tech lead's approval)

**Done when** (`qa/CAPABILITIES.md:214`): "Each stream says eligible or not with its cited rule; a client copy can be sent".
Sources: AG-3-19, AG-3-11, AG-3-13, BR-6, AG-3-38, AG-3-27, AG-3-32, AG-3-34, AG-3-41, BR-11, BR-16, BR-17, AG02-D9(3) (`design/r1-source-map-2026-11-21.md` R1.107). Decisions: P-577, P-607 (6) and (9), P-650 (2) and (3).

## What main has today (25 Nov, a2cce14e2)
* `engine/eligibility/` (AS-1m): gates in the configurator's condition language, three outcomes, failed gate named, missing facts named (POSSIBLY). `EligibilityPort` with a fake and a contract test.
* A gate is `{key, label, condition, whenNotMet?}`: **no citation on a gate**.
* Release refuses a draft with **no form line** (`releaseLineProblems`, G5): the five streams are assessment only (P-650 (2)), so they cannot be released today.
* Release also refuses a gate whose fact no form of the combination asks (`engine/eligibility-gates.ts` `gateProblems`, P-62): on an assessment-only release the facts are asked of the person through `requiredFacts`, so AS-2a replaces that check there with "the fact is a live library field". Facts the provincial gates read that the library lacks (a NOC TEER category, a points total, a connection to the province) are added in the data parts through the library's own guarded change, each labelled Sample where no official page defines it.
* No lead assessment store (FO-15a/b not built: R1.106's parts); AS-1g (#3478, draft) and AS-1s (scores) not merged.

## The five streams (P-607 (9): the stream whose official page publishes its own grid or points)
All read at source on 25 Nov 2026, word for word: `screens/AS-2/sources-2026-11-25.md`.
1. **Ontario: OINP Ontario Workforce Priority** (the only open OINP stream since the 2026 redesign; EOI points, a ranking).
2. **British Columbia: Skills Immigration, Skilled Worker** (registration points in the program guide, not yet read: Sample).
3. **Alberta: Alberta Opportunity Stream** (criteria only on its page; no grid found yet).
4. **Saskatchewan: International Skilled Worker, Occupation In-Demand** (60 of 110 points, fixed pass mark).
5. **Manitoba: Skilled Worker Overseas** (connection to Manitoba plus 60 points, its own grid on the page).
The founder's confirming card (P-607 (9)) is still owed; recommendation below.

## Thin path: gates first, scores after (P-348, P-606)
"Eligible or not with its cited rule" is a gate verdict (AG-3-11, BR-6: gates decide eligibility, the score only ranks). So R1.107 needs **cited gates on assessment-only releases**, not AS-1's grids. The EOI ranking (AS-2e) and the grids stay after AS-1g/AS-1s; R1.107 does not wait on them and does not duplicate them. Saskatchewan's and Manitoba's "at least 60 points" gate reads the points total as an answered fact (the consultant's count on the province's own worksheet) until AS-2e computes it from the grid. That answered total is labelled **Sample**, and the data tests fail without the label (Lead 5, (c)). The 60 itself is cited.

## Parts (one PR each, under 800 lines; in order)
| Part | Area | What | Touch | Proof | Waits on |
|---|---|---|---|---|---|
| **AS-2a** cited gates + assessment-only release | engine + configurator | (1) a gate's optional `source` {url, section, quote, date} or `sample: true`, stored only when set (old fingerprints unchanged), checked on save (an https url, a quote, a real date; neither → refused when the combination is assessment only); (2) `assessment_only: true` inside the existing `combination.eligibility` JSON (**no migration**): release skips the "no form line" hold only when the flag is set and at least one gate exists; Open a case refuses such a release in words "Assessment only: no forms" (P-650 (2)); (3) `EligibilityPort.assess` returns each gate's line `{key, words, state, source}` so a met gate also shows its rule (port change, fake and contract test updated); (4) `tests/journeys/j_107.ts` | `engine/eligibility/gates.ts`, `assess.ts`, `engine/eligibility-gates.ts` (check), `api/src/programs.ts` (one hold line), `api/src/runtime.ts` (open-case refusal), `ports/eligibility.port.ts`, `ports/fakes/eligibility.fake.ts`, `ports/contracts/eligibility-port.contract.ts`, `api/src/configurator/eligibility.door.ts`, `tests/check_as2a_cited_gates.ts`, `tests/journeys/j_107.ts` | pass and fail each: uncited gate on assessment-only → refused; cited gate saved and carried into the snapshot; a release without the flag still held for no form line; with the flag released; Open a case refused; a met gate's line carries its source; an old release's hash unchanged; every C6.9 and AS-1m suite unchanged | nothing (not alongside #3478's `engine/snapshot.ts`? no overlap: it does not touch these files) |
| **AS-2a2** the combination page for an assessment-only release | screens | the status "Assessment only" (not "Not ready" or "Live"), no form or document to-do, no "Open a case" button or "Next: the firm opens a case", each gate listed with its source (found in AS-2a's walk, `walk-as2a/walk.md`; review m6 on #3663) | `engine/setup-checklist.ts`, the combination page under `web/src/pages/`, its browser test | a pass and a fail each, 375/1024/1440, axe | AS-2a |
| **AS-2d1** Ontario, BC, Saskatchewan | data (configurator) | three combinations under `individual.economic.provincial`, assessment only, gates from the sources file, loaded through the configurator's own guarded save and released | `samples/provincial-streams/{on,bc,sk}.json`, a loader in the sample set-up, `tests/check_as2d1_pnp_cited.ts` | every gate's quote is found on the sources file's quote list and holds its number, else labelled Sample (test fails otherwise); two worked profiles per stream (one eligible, one not with the gate and its quote named); one missing answer → POSSIBLY with the fact named; `listAssessable()` lists the three | AS-2a |
| **AS-2d2** Alberta, Manitoba | data | as AS-2d1 for two streams | `samples/provincial-streams/{ab,mb}.json`, `tests/check_as2d2_pnp_cited.ts` | as AS-2d1; Manitoba: no connection → NOT "regardless of your points total" | AS-2a |
| **FO-15a, FO-15b** the lead's stored assessment | runtime (front office) | as their BACKLOG rows (R1.106's parts; no owner, so this lane builds them after AS-2a: Lead 5, 25 Nov 11:17 IST) | as BACKLOG | as BACKLOG | AS-2a |
| **AS-2c** client copy, API | runtime (front office) | as BACKLOG AS-2c (reviewed PDF via `DocumentRenderPort`, disclaimer, provenance, audit, review before sharing on, P-607 (6)) | as BACKLOG | as BACKLOG | **FO-15b** (the lead's stored assessment: R1.106's part, not built) |
| **AS-2cs** client copy, screen | screens | as BACKLOG AS-2cs | as BACKLOG | as BACKLOG | AS-2c, FO-15s |

AS-2e (EOI ranking, scores) moves out of R1.107's chain: R1.107's Done when asks for eligibility, not a score; it follows AS-1s.

## Journey j_107 (`tests/journeys/j_107.ts`, written in AS-2a; isolated copy, never :4400)
* W1: the door lists the five provincial releases, each marked "Assessment only: no forms" (AS-2d1, AS-2d2).
* W2: for each stream, an eligible profile gives LIKELY_ELIGIBLE with every rule shown with its URL, quote and date (AS-2a + data).
* W3: for each stream, a profile failing one gate gives NOT_ELIGIBLE naming that gate and its quote (BR-6, AG-3-13).
* W4: Open a case on a provincial release is refused in words (P-650 (2)).
* W5: a client copy of a reviewed assessment is made with the disclaimer and provenance, and is sent only by a person (AS-2c, AS-2cs).
W1-W4 go green with AS-2a, AS-2d1, AS-2d2; W5 with AS-2c, AS-2cs.

## The tech lead's answer (Lead 5 on #3663, 25 Nov 11:17 IST)
Shape approved, with three changes: (a) FO-15a/b built in this lane after AS-2a; (b) nothing merges past the shape until the founder's P-607 (9) card on the five streams (the Lead raises it); (c) the answered points total labelled Sample, tested. Legal points keep "Unconfirmed: no counsel".

## Questions for the tech lead (each with my recommendation; answered above)
1. **Approve the shape** (gates first; AS-2e after AS-1s; no migration). Recommended.
2. **The five streams** for the founder's P-607 (9) card: the five above (Ontario's Foreign Worker stream closed on 30 May 2026, so Ontario Workforce Priority). Recommended.
3. **The client copy waits on FO-15b** (R1.106's part, unbuilt and unowned in flight). Recommend: whoever builds FO-15a/b next (R1.106's builder) does them before AS-2c; if no one is on them by the time AS-2d2 merges, this lane builds FO-15a and FO-15b from their BACKLOG rows (no duplicate).
4. Saskatchewan's and Manitoba's 60-point gate reads an answered points total until AS-2e (recommended), rather than waiting for the grids.

## The tech lead's second answer (Lead 5 on #3663, 25 Nov 12:20 IST)
(1) AS-2a2 is its own part (each PR under 800 lines). (2) The provincial facts enter the field library as configurator data through the configurator's own guarded save, each fact with its source quote or a Sample label; no direct database insert. AS-2d1 therefore starts by adding a `gate` kind to C3.6's "Add the fact this rule needs" (`api/src/rule-facts.ts`, one proposal through `insertProposals`, a second person approves), then loads each stream's gates through the gates save.
