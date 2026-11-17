# Journey test (reviewer): QA-498, BK-5 door 2 "Try again" lands on Immigration programs (17 Nov)

Reviewer role, PR #2054, head 57ce8390665eaeb3615322b908d1d8a8802f2a17. This PR changes only a test and the runner list; the product is unchanged.

**Limits of this walk.** On the caller's instruction I ran no browser and started no isolated copy: the builder is running the browser suites on this small machine, and contention would distort them. So steps 2 to 5 of the skill (visible walk, replay, data, break-it) were **not walked by me**. Each score below rests on:
* the code at head;
* the suite's assertions;
* the builder's uncommitted head-run screenshots in `BK-5-start-page/screenshots/` (`bk5-08`, `bk5-09`);
* the builder's timeline in the PR body.

A score that rests on these, not on my own walk, is marked (code/evidence).

## Journeys (configuration author, Demo › Starting points, door 2 "Pathways released, ready to walk")
1. **Main path:** the demo has programs. The author opens door 2, types RESET and starts. The page empties the demo, then loads, then lands on Immigration programs with the done toast.
2. **Error, then recovery (BR-6):** the configured load stops part way. The page shows "Stopped part way" with the server's words, RESET stays typed, and the button reads Try again.
3. **Double click (QA-498):** the author double-clicks Try again. Expected: reset and load each sent once, then a landing on Immigration programs.
4. **Across the screen boundary:** the toast says "Pick the pathway to change, then Review and release". Immigration programs lists Visitor visa (Gate A).
5. **Wrong role:** as the Approver, every door is off with the reason, and a direct POST gets 403 (unchanged; asserted by the BR-3 steps).

## What held (code/evidence)
* **J2 and J3:** `start.tsx:166-167`'s `once` ref stops a second send. The test requires exactly `["/api/demo/reset","/api/demo/load"]`, now read after the landing. `bk5-08` shows the part-way words, RESET kept, and Try again.
* **J3's landing:** `programs.tsx:261` renders the h1 unconditionally. `bk5-09` shows the Immigration programs h1 with loading cards and the done toast.
  * React Router 7.18.2 commits the route inside `startTransition` (`chunk-62JRHF6Z.mjs:10411`). So for 48 ms (303 ms at a 6x CPU throttle) the toast shows over the old Starting points page, then the right page appears.
* **J4:** the toast names the next step, and Gate A's Visitor visa step stays in the suite (line 207).

## Findings
* No Blocker and no Major.
* **Minor (product observation, no change asked):** the done toast reads "Pick the pathway to change" over Starting points for one transition. That is about 48 ms, below perception, and React Router's default behaviour.
  * Setting `useTransitions={false}` would remove it, but that is outside QA-498's scope and touch list.

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | It lands on Immigration programs (`bk5-09`), and each call is sent once (the asserted line) (code/evidence) |
| Next step obvious | 1 | The toast says "Pick the pathway to change, then Review and release" and the page lands on that list |
| Plain words | 1 | Part-way words, "Try again", and the toast with measured seconds (`bk5-08`, `bk5-09`) |
| Feedback and state | ½ | The toast commits up to 48-303 ms before the page it describes. Running and failed states are clear |
| Correct data | 1 | Reset then load, once each. "Kept files checked unchanged" in the toast. DB checks in the suite (code/evidence) |
| Error recovery | 1 | Part-way failure, then RESET kept, then Try again, then a correct landing (BR-6 lines) |
| Accessibility and screen sizes | ½ | The suite has axe at 1440 and 375 px and a keyboard menu step. Not walked by me at 1024 px or 200 % |
| Speed | ½ | Door 2 end to end took 149 s in the builder's run (toast). It is a long job with the progress shown; not timed by me against §9 |
| Visual quality | 1 | `bk5-08` and `bk5-09`: team look, one filled button, skeletons while loading |
| Trust and sources | 1 | US$0, no live AI route (BR-7 line), a Demo pill and the prototype banner |

**Score: 8.5 / 10. Pass** (8 or more, and no criterion at 0). This score is from code and evidence, not my own walk.

To raise it, most valuable first:
1. Commit the route before the toast, or make the toast follow the landing. This is a separate row if wanted; not asked here.
2. A 1024 px / 200 % keyboard walk of door 2, by qa.

## Could not test
* The visible walk, the replay runs, the data reads and the break-it pass (no browser, by instruction).
* A real screen reader.
* D17 and D20: an intended user's unaided walk stays with the founder.
