# qa capability R1.50: in-app notifications and personal notification settings (24 Nov)

**Run:** `/qa capability R1.50`, cloud qa copy, Opus 5.5 medium, live AI off, US$0. Tested on main bdcf1e7be; the local runs were on f0bc60179, and the commit between them touches only the support queue (#3225). Isolated copies only; :4400 not touched.

**Verdict: Works** (was Not built). Every part has merged: PF-18a #2304, PF-18np, PF-18n, PF-18n part 2 #3289, PF-18s and PF-18ns #3302. P-339 is met: the journey is green on GitHub's runners on main's code, and a fresh Opus reader agrees.

## Evidence
| What | Where | Result |
|---|---|---|
| New journey `tests/journeys/j_50.ts`, written from the row's Done when (this PR) | walks.yml run 45318534154, job 138191376653, on 47217cf5f (main bdcf1e7be plus this file) | 21 PASS, 0 FAIL, exit 0, with 19 videos and 7 traces |
| The same journey, locally | fresh isolated copies of f0bc60179, run twice | 21/21 both times |
| Fresh Opus reader (read only, P-339) | this session | Works, medium-high confidence |

There is no item-proof run: no merged PR carries `Completes: R1.50`, so the journey is the pack.

## Done when, clause by clause
* **An event notifies its people (W1).** The Owner (R) uses Assign on two lead pages. In the database, the Case Officer (O) and the second representative (T) each get exactly one unread lead-assigned row ("Work handed to me"). Both bells go from 0 to 1 and are labelled "Notifications, 1 unread" for screen readers. Each panel names its own lead and not the other's. R, who did the assigning, is not told.
* **Read per person (W2).** O opens the notice from the panel and lands on the lead. O's row is marked read and O's bell shows 0. T's row stays unread and T's bell stays at 1. O marking T's row read is refused (404), and T's row is unchanged.
* **A kind switched off stops for that person only (W3).** In My account → Notifications, O unticks In app for "Work handed to me" and saves. The switch is still off after a reload; it is one saved row, and T and R have none. The next two assigns reach T but not O. When O ticks it back on, the next lead handed to O reaches O again.
* **Walls (W4).** T and another firm's Owner never see O's row, and marking it read as either is 404. With no token the answer is 401.
* **Sizes (W5).** The page with the bell, the open panel, the All page and the settings page at 400, 1024 and 1440 px: no sideways scroll, axe 0 serious or critical, no page error.
* **Gate A (W6).** From the notice, O is on the lead's page with Engage, the first step of the prospect pipeline (R1.31, Works).
* **The bell (PF-18ns), judged on its own.** All six `[bell, PF-18ns]` steps pass on GitHub and locally.

## Limits (the reader's notes, none blocking)
* Each lead-assigned notice reaches one person. Events that tell several people do exist on main: deadline reminders go to the officer and the lead representative, and a disconnected payment account goes to every Owner. They belong to other rows, come from a clock or a webhook, and can't be started by screens on a fresh copy. The store writes one row per person through the same per-person switch check either way.
* Setup creates the leads through the API (P-33: capturing leads is not under test) and, as the database owner, clears R's, O's and T's notices and switches. Every action under test happens on screen.

## Bugs
None found.

## Questions for the Lead
* **Does "an event notifies its people" need an event with several recipients walked, for example a stage deadline reminder?** Recommendation: no. Lead-assigned is R1.50's own first caller, and the several-recipient events are CS-DL1/FO-7c rows proven by their own checks. If you rule yes, R1.50 goes to Partial pending a reminder walk on the fake clock.

## Suggestions
* *Later · Scaffolding:* a check of several recipients against the real store, not only fakeNotifications (`check_csdl1` uses the fake).
