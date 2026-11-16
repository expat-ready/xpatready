# PF-6f review: the sign-in callback page (PR #1952), 16 Nov 2026

Reviewer: a fresh Opus 5.5 session that did not build the row. Commit **`0c5ff13c96722a70ac5f7ec04bae686de4cefeca`** (`git diff origin/main...0c5ff13`: `callback-page.tsx`, `check_pf6a_frame_browser.ts`, new `check_pf6f_callback_browser.ts`, one screenshot). Brief: `lead-b-briefs/PF-6f.md` rev 16.59. Context: `screens/pf-6-staff/review.md` new findings 1-3, and Devin's finding on #1912.
Copy: my own isolated `rv_pf6f` on :4563 (`PLATFORM_IDENTITY=local`, `web/dist` rebuilt from this commit), plus a Vite dev server on :4568 that proxies to :4563 (React StrictMode on). Both stopped at 06:28 UTC. Headless Chromium. Live AI off, US$0. Probe scripts and screenshots are in the scratchpad only. Journey test: `journey-test-reviewer-2026-11-16.md` (9/10).

## Verdict
**Approve.** No open Blocker or Major. The three Minors below are Shoulds.

## What I ran (exact commit)
* `check_pf6f_callback_browser.ts`: **9/9**, run 3 times on one copy (twice before `check_pf6a`, once after). The plan's seats were 5 after every run.
* `check_pf6a_frame_browser.ts`: **52/52** on the same copy after the pf6f runs, so the suite reruns on one copy. Seats were back at 5. `check_fo4_sales_browser.ts`: **45/45** on the same copy. Web `tsc --noEmit`: clean.
* **Mutation 1, revert the fix** (`!inFlight` → `!sent.size`, `:28`). This fails `PF-6f DW1 pass` with `{"url":".../sign-in/callback","backStuck":true}`. The run then throws (TimeoutError in the signed-out leg), and the `finally` still puts the seats back to 5. That also proves DW3's throw path.
* **Mutation 2, put the old notice back** (`{state.words} You are still signed in as before.`). This fails **both** DW2 cases ("…Sign in again. You are still signed in as before."). 7/9.
* Both mutations were undone, and the bundle was rebuilt from the clean tree. `git status` is clean.

## Brief items
| Item | Result | Evidence |
|---|---|---|
| 1 Never stuck on "Signing you in…" (Devin, Should 2) | Met on every path the UI offers | DW1 pass and fail. Probe P3: Back, Back, Forward, Forward, Back, Forward, Back, Back while signed in → `/account` each time, never loading, 1 post. StrictMode dev: one post for a fresh link, Back → `/account`, and a slow post (2.5 s) still lands on `/account` |
| 2 One plain notice (Should 1) | Met | "This link was not used." / "You are still signed in." with "Open My account", one `role="status"` node. The same notice shows for a server refusal with other words and for a network failure while signed in, so the old "or sign in below" clash is gone |
| 3 Seat lend in a `finally` (Should 3) | Met, with Minor 2 | Mutation 1 threw and the seats were 5. pf6a reruns 52/52 on one copy |
| DW4 Earlier suites unchanged | Met | pf6a 52/52, FO-4 45/45 |
| Signed-out refusal keeps the server's words | Met | A mocked 401 with the detail "SERVER-WORDS-XYZ…" shows it under "Not signed in" with the card. Network failure while signed out shows "Could not reach the server…" with the card |

## Code (`callback-page.tsx` at 0c5ff13)
* **The `inFlight` decrement against `setState`:** the counter cannot let a mount decide too early. `setState` (`:39-41`) and `inFlight--` (`:42`) run in the same microtask, and a mount with no code checks the counter synchronously. StrictMode's second effect sees `inFlight = 1` and waits, and the first closure's `setState` reaches the same instance. It is correct.
* **Hashchange (`:46`):** a new code on the signed-in notice is posted once and signs the new person in (P6, posts 2, `/account`). A hash with no code decides from the session (→ `/account`). The address is cleared each time.
* **Reload during an in-flight post:** the module resets, the address holds no code, and the page decides from the session (refusal and card while signed out). It is never stuck. See Minor 3 for the wording.
* **Two tabs, same fresh link (P7):** one tab signs in. The other gets the server's refusal and the card. One post each.
* **Server authorisation:** unchanged. The post still carries no bearer token.

## Issues, ranked
1. **Should (Minor): two mounts can still wait forever.** Today's UI reaches neither of them.
   (a) A post can outlive its page. `inFlight` stays above 0, and a new mount with no code waits on it. Nothing re-decides when the post ends, because the old closure's `setState` goes to the unmounted instance. Probe P4: with the post delayed 4 s, an in-app move away and then Back still shows "Signing you in…" 9 s later.
   (b) A mount whose code is already in `sent` returns before deciding (`:29`). Probe P6c: an in-app mount of `/sign-in/callback#code=<used>` stays loading.
   Neither is reachable today: "Signing you in…" has no link (P4 found 0 anchors), and `replaceState` takes the code out of every history entry. I reached both only with synthetic `pushState`/`popstate`.
   Fix: keep the in-flight post as a module promise. A no-code mount, or a mount whose code is already in `sent`, awaits that promise and then decides from `staffToken()`.
2. **Should (Minor): `process.exit(2)` skips the `finally`.** `apiSignIn` exits the process when a sign-in is refused (`check_pf6f_callback_browser.ts:33`, `check_pf6a_frame_browser.ts:35`), and both tests call it inside the `try`, after the lend (pf6f `:66`, pf6a `:144`). A pf6f run on a copy started without `PLATFORM_IDENTITY=local` leaves the plan with +100 seats. DW3 says "whatever fails".
   Fix: throw instead of exiting, or lend after the first sign-in.
3. **Should (Minor, carried over, not a regression): a reload during the post says the link "has been used or has expired. Sign in again."** In probe P5 the code had not reached the server, and the same link then signed in from a fresh browser. `main` does the same.
   Fix, if wanted: on a no-code mount after a reload, say "This link was not used here. Open the link from your email again, or sign in below."
* Not findings: the loading text instead of a skeleton, and the notice trusting the local token (a token revoked on the server still reads "still signed in"). Both are unchanged from PF-6 part 1 and accepted there.

## D1-D20 (this row's surface only)
| D | Score | One line of evidence |
|---|---|---|
| D1 | 5 | Brief items 1-3 and DW1-DW4 each have a pass and a fail. Both mutations fail their case |
| D2 | 5 | One post per code (network log); two tabs give one sign-in |
| D3, D4, D6, D7 | N/A | No content, rules or AI |
| D5 | 4 | Reload, Back/Forward, StrictMode, hashchange and network failure hold. Minor 1 (two narrow waits) |
| D8 | 4 | The Frame's "Sign in" place line; the notice says where the person stands |
| D9 | 5 | One action ("Open My account"); Back lands on My account |
| D10 | 4 | Two short sentences when signed in. Minor 3 when reloaded mid-post |
| D11 | 4 | Every state decides; loading is text, not a skeleton (carried over) |
| D12, D14 | 4 | Team Notice and Frame. Screenshots: `callback-refused-signed-in-1440.png`, and mine at 400, 1024 and 200 % |
| D13 | 5 | axe finds nothing on the signed-in notice (1024, 1440) or the signed-out refusal. No sideways scroll at 400, 1024 or 200 % (720 css px). Tab 1 reaches "Open My account", Enter opens `/account` |
| D15 | 5 | Decides on mount with no request; one post per code |
| D16 | 5 | Mutation-proven cases; reruns on one copy; seats restored on throw |
| D17, D20 | — | Simulated only |
| D18 | 4 | The server's refusal words are shown while signed out |
| D19 | N/A | A follow-up row; invite → link → My account still passes in pf6a |

**BIC-01–BIC-20:** N/A. EXPERIENCE §6 scopes them to case-side screens, and this is the firm-staff sign-in door (as in the PF-6 part 1 review).
**Standards [M]:** STANDARDS §3.10 (a pass and a fail per rule): met. §7 (the test fails when the rule is removed): met (mutations 1 and 2). §7 (axe on every state): met for both refusal states. EXPERIENCE §2.12: met. Demo chrome: none. Retrofit mapping: not applicable (web only; the brief asks for none).
**Graph (P-86):** `graph.mjs` shows `POST /platform/session/callback` as `testedBy: []`, `webUse: false`. The page posts with plain `fetch`, not `api()`, so the graph cannot see it. The route is exercised and counted by pf6a and pf6f through the network log. This blind spot predates the row, so it is not this row's finding. The new test names no capability (`caps: []`), the same as pf6a.

## Could not check
* A real screen reader. The notice is a `role="status"` that is already filled on mount, so whether it is announced is unverified.
* An intended user's unaided walk (D17, D20 stay with the founder).
* CI on this head.
* Note on shared state: my two mutations each rebuilt the shared `studio/web/dist` for a few minutes during this review (before 06:20 UTC). Another session's isolated copy was running in the same folder then. Its results from that window should be treated as unreliable. I also sent one refused callback post to :4564 (another copy) by mistake. That post was harmless.

**Verdict: Approve** for `0c5ff13c96722a70ac5f7ec04bae686de4cefeca`. No open Blocker or Major.
