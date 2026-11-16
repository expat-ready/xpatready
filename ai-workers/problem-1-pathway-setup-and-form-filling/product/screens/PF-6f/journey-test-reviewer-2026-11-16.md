# PF-6f journey test (reviewer role), 16 Nov 2026

Commit `0c5ff13c96722a70ac5f7ec04bae686de4cefeca` (PR #1952). I used my own isolated copy `rv_pf6f` on :4563 (`PLATFORM_IDENTITY=local`, `web/dist` built from this commit). For React StrictMode I added a Vite dev server on :4568 that proxies to :4563. The browser was headless Chromium (Playwright). Probes and screenshots are in the scratchpad only, and both servers were stopped at 06:28 UTC. Cost: US$0, no model calls.

## Journeys (persona · goal · expected)
1. **Main (Devin's case).** A case officer, already signed in, opens an old sign-in link. Goal: "get back to my account". Expected: one notice, "Open My account", then Back lands on My account and never shows "Signing you in…".
2. **Alternate.** An invitee opens a fresh link and is signed in once. The code leaves the address and My account opens.
3. **Signed out.** The same used link with no session. Expected: "Not signed in", the server's words and the sign-in card.
4. **Error.** The server refuses with other words, or the network fails. Expected: signed in → the one notice; signed out → those words and the card.
5. **Recovery.** Back and Forward several times, a reload while the post is in flight, and StrictMode's double effect.
6. **Two tabs.** The same fresh link opened in two browsers at once.
7. **Boundary.** A new link pasted into the open callback tab (hashchange) signs the new person in.

## What held
* J1: the notice reads "This link was not used." / "You are still signed in." with "Open My account", in one `role="status"`. The first Tab reaches "Open My account" and Enter opens `/account`. Eight Back/Forward steps all land on `/account`, never loading, with one post (P3).
* J2: one post, then My account. In StrictMode dev: one post, and a 2.5 s slow post still lands on My account.
* J3: "This sign-in link has been used or has expired. Sign in again." with the card, after Sign out in the same tab too (P8). axe finds nothing.
* J4: a mocked 401 detail ("SERVER-WORDS-XYZ…") is shown as sent while signed out. While signed in, the one notice shows instead. A network failure gives "Could not reach the server…" with the card when signed out, and the notice when signed in.
* J5: a reload during the post decides at once (refusal and card), never stuck.
* J6: one tab signs in, the other is refused with the card, one post each.
* J7: a new code by hashchange signs the new person in (posts 2, `/account`). A hash with no code goes to `/account`.
* Sizes: no sideways scroll at 400, 1024, 1440 or 200 % zoom (720 css px). axe finds nothing on either refusal state.
* Data: the plan's seats were back at 5 after every run, including a run that threw. Suites: pf6f 9/9 ×3, pf6a 52/52, FO-4 45/45.

## Findings
| # | Severity | Finding | Where |
|---|---|---|---|
| 1 | Minor | Two mounts never decide. First: a post outlives its page, and a new mount waits on `inFlight` with nothing to tell it when that ends (P4: still "Signing you in…" 9 s later). Second: a mount whose code is already in `sent` returns early (P6c). Both were reached only through synthetic in-app navigation: the loading state has no link and the code is gone from history. | `callback-page.tsx:28-29,42` |
| 2 | Minor | `process.exit(2)` inside `apiSignIn` skips the seat `finally` when the copy lacks local sign-in. | `check_pf6f_callback_browser.ts:33,66`; `check_pf6a_frame_browser.ts:35,144` |
| 3 | Minor (carried) | After a reload mid-post the page says the link "has been used or has expired". The link had not been used: it then signed in from a fresh browser (P5). | `callback-page.tsx:28` (`USED`) |

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J3 complete |
| Next step obvious | 1 | One link, "Open My account"; the card when signed out |
| Plain words | ½ | Two short sentences; finding 3 can be untrue after a reload |
| Feedback and state | ½ | Every UI path decides; finding 1 remains in code; loading is text, not a skeleton |
| Correct data | 1 | One post per code (network log); two tabs give one sign-in; seats restored |
| Error recovery | 1 | J4 and J5 |
| Accessibility and sizes | 1 | axe clean on both states, keyboard path, 400/1024/1440/200 % |
| Speed | 1 | Decides on mount with no request |
| Visual quality | 1 | Team Notice and Frame (1024 and 400 px screenshots) |
| Trust and sources | 1 | The server's words shown as sent; no AI |

**9/10, pass (no 0).** Fixes that would raise the halves, most valuable first:
1. Have the mount await the in-flight post (finding 1).
2. Change the wording after a reload (finding 3).

## Not tested
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* CI on this head.
