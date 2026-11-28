# Journey test: R1.36 / PF-20 part 1 (reviewer, 25 Nov)

Commit `4ecd8ab2745377054e87d791b6bd54cb08c36dde`. This part is an API and engine only; it has no screen, so there was no browser walk.
* **HTTP walk:** curl against an isolated copy on :4438 (runtime range; never :4400), started with `PLATFORM_IDENTITY=local` and signed in through `session/local`.
* **Engine walk:** `check_pf20_engine.ts` plus two race scripts on scratch databases.

## Journeys
| # | Persona and goal | Result |
|---|---|---|
| 1 | Owner (sample-firm user-R) opens the firm's automatic messages | 200 `{"recipes":[]}` in 32 ms. It is empty until part 2 registers the front office's recipes, as the PR says |
| 2 | Owner switches on a key that no module registers | 404 "No automatic message has this key." |
| 3 | Owner sends `{"on":"yes","x":1}` | 422 "2 fields need a change: on: This must be a boolean. x: This field is not allowed here. Nothing was saved." |
| 4 | Owner sends an empty body | 422 "on: This is required." |
| 5 | Wrong role: Case Officer (user-O) lists and switches | 403 for both, naming `agent/template:configure` |
| 6 | No session | 401 "Sign in first" |
| 7 | Firm B Owner (sample-solo) lists | 200 with only its own (empty) list; firms stay apart (engine check DW7) |
| 8 | Main path: two people enrolled, one without consent; at its time one is sent and one skipped; the recipe is switched off and the queued step cancelled (engine, fake clock) | Held (21/21): SENT with consentId, SKIPPED `NO_CONSENT: MARKETING`, the off ends runs and cancels jobs, one audit line |
| 9 | Recovery: a step job runs twice, and a cancelled job runs anyway | Held: one outbox row; the late job answers CANCELLED |
| 10 | Break it: an enrolment and an off at the same moment; a running step and an off at the same moment | **Failed.** The run survives the off and step 2 sends after the recipe is switched on again (review M1). The off's audit says 4 cancelled when 3 were, and the 4th was sent (m1) |

## Data underneath
* After the HTTP walk: `auto_recipe` 0 rows and `automation.*` audit 0 rows. A 404 or 422 wrote nothing.
* In the engine walk:
  * Each run exists once (partial unique index).
  * Step reasons are the gate's own.
  * The audit line has actor, before and after.
* The race in journey 10 leaves the wrong state: a RUNNING run on an off recipe.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–9 |
| Next step obvious | 1 | Each problem answer says what to change |
| Plain words | 1 | Problem texts and reasons ("recipe switched off", "step switched off") |
| Feedback and state | 1 | Every step run ends in a named state with a reason |
| Correct data | ½ | Journey 10 (M1, m1) |
| Error recovery | ½ | Idempotent and retries, but a crash between commit and schedule strands a run (sweep deferred, named) |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 8–32 ms per route |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | The sent row names the consent that allowed it; Sample labels on the test recipes |

**7 of 8 applicable = 8.5/10 scaled, pass (no 0).** To raise it: fix M1 and m1 (correct data); add the lost-job sweep in part 2 (error recovery).

**Not tested:**
* A screen, axe, the 400/1024/1440 px widths and a screen reader. They come with part 5.
* An intended user's unaided walk: D17 and D20 stay with the founder.
* A real recipe over HTTP: none is registered until part 2.
* The pg-boss runner's retries.
