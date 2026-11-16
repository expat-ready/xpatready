# PF-6 part 1 break report (platform frame and staff session holder)

Breaker, 16 Nov 2026. Commit `8028615d4` (branch `claude/sleepy-carson-1ubqkh`, PR #1912). Isolated copy on :4561 (database `xr_studio_screens_pf6a`, `PLATFORM_IDENTITY=local`), Playwright on chromium. Scope: the brief's "What to build" items 1-6 (`lead-b-briefs/PF-6.md`, part 1). File paths below are under `prototype/studio/web/src/modules/platform/`. To make invitation hand-off links I raised `platform_plan.seats_limit` in the copy, then set it back (solo 1, team 5, firm 20). The invitees the probes created are still in the copy.

**Totals: 0 Blocker · 4 Major · 9 Minor.**

## Major

**M1. Signing in with the card on the callback page does nothing visible.** `callback-page.tsx:36-40`
Steps: accept an invitation, open its `/sign-in/callback#code=…` link once, then open the same link in a second fresh browser. The page shows the refusal words and the sign-in card. Sign in there as `user-o@sample-firm.example.com`.
Expected: My account opens (or the page moves on).
Actual: the token is stored (`sessionStorage` has `xr-staff-session`), but the page stays at `/sign-in/callback` and still shows "Not signed in · This sign-in link has been used or has expired" and an empty sign-in card. The page's `state` never leaves `"refused"`, and the card sits outside `PlatformFrame`, so nothing reacts to the new token. Anyone whose link was used or expired, which is the exact case the card is there for, looks as if the sign-in failed.

**M2. A link opened on the callback page by changing only the `#code` part is never used and stays in the address bar.** `callback-page.tsx:19-35` (the effect runs once, with `[]`)
Steps: open `/sign-in/callback` (refused page). In the same tab, open a fresh valid link `/sign-in/callback#code=<valid>` (paste it, or follow it). Only the fragment changes, so the browser does not load a new page.
Expected: the code is posted once and removed from the address (brief item 4).
Actual: 0 posts to `session/callback`. The address bar and history keep `…/sign-in/callback#code=vDnp…` while the page still says the link was used. The unused one-time code stays readable for its 5 minutes, and the person is not signed in.

**M3. When storage writes are refused but reads still work, a new sign-in can show the previous person.** `session.ts:16-19` (`read()` takes the stored value over `memory`), `:28-31`
Steps (writes refused by a full storage quota, `QuotaExceededError`): the tab holds person A's stored session (Second representative). `Storage.setItem` now throws. Open a valid callback link for person B in this tab.
Expected: B is signed in, or the person is told sign-in could not be kept.
Actual: the callback succeeds and puts B's token in `memory` only. `read()` still returns A's stored token, so `/account` shows **Second representative's** profile. If `removeItem` is also refused, Sign out leaves A's revoked token stored: every `/me` 401 ends a session that `read()` brings back, and the tab made **677 `/me` calls in 5 s**, stuck on "Checking who is signed in…". The brief's "storage refused" attack only passes when storage is fully blocked (see Held).

**M4. Two tabs: a tab opened from a link starts signed out, and signing in there ends the first tab with words that are not true.** `session.ts:10-19` (tab-only storage, as the brief keeps it) with AG-1-55
Steps: sign in as Case manager in tab 1. Open `/account` in a new tab the way Ctrl/middle-click does (`target=_blank`, `noopener`, which is the browser default). That tab shows the sign-in card. Sign in there.
Actual: tab 1's next click shows "You signed in on another device." It is the same device and the same browser. `window.open` with an opener copies the storage, and that tab works. Not a code slip: tab-only storage plus one session per person makes every tab a "device". Recorded because the brief asked for this attack. Who decides the words or the behaviour is Lead B's call, not this report's.

## Minor

**m1. Sign-out that fails over the network.** `frame.tsx:72-77`. I made the `session/sign-out` request fail as if the browser were offline (and, a second time, answer with an empty 500). The tab dropped the token with no message, but the old token still answered `GET /api/platform/me` with **200** in both cases. The server session lives on until the token expires and the person believes they signed out. Expected: say that sign-out did not reach the server.

**m2. A late refusal ends the next person's session.** `session.ts:66,77`. A's `/me` is slow (2.5 s, after a Profile click). A signs out and B signs in. Timeline: B's account shows at 1387 ms, then A's late `401 SESSION_REVOKED` at 3124 ms calls `endSession`, and B is back at the sign-in card. B's token is dropped while B's server session stays alive. `staffApi` does not check that the refused token is still the current one. Needs a slow answer that overlaps a sign-out and a new sign-in.

**m3. Sign out in a stale tab shows "Signed in elsewhere".** `frame.tsx:74-76`. In a tab whose session a newer sign-in ended, pressing Sign out shows "You signed in on another device" and "Sign in again here" instead of a signed-out state.

**m4. A refused code while someone is signed in says "Not signed in".** `callback-page.tsx:32,40`. Signed in as Case manager, open `/sign-in/callback#code=bogus`. The page shows "Not signed in" and the sign-in card, but the session is still in the tab (`/account` still opens it).

**m5. Callback network failure and reload mid-post.** `callback-page.tsx:21,33`. Network failure: the page says "Could not sign in. Please try again.", but the code is already gone from the address, so there is nothing to retry. Reloading then says "used or has expired" although the code was never redeemed. Reload while the post is in flight: 1 post (held), the server uses up the code, the token is lost, and the page says "used or has expired".

**m6. Focus drops to `<body>` after "Sign in again here" and after Sign out** (keyboard and Playwright, checked with `document.activeElement`). `signed-in-elsewhere.tsx:15`, `frame.tsx:74`. Keyboard and screen-reader users start again from the top, and nothing announces the sign-in card.

**m7. The firm is named by its key.** `frame.tsx:82`. The header title is "sample-firm" and the brand link is named "sample-firm home". The document title stays "Product Studio" on `/account`, on the callback page and on Signed in elsewhere.

**m8. The licence line shows a stored code.** `account-page.tsx:15,34`. It reads "rcic · CICC · R000002": `words()` keeps a lower-case code as it is (EXPERIENCE §5, plain words).

**m9. Wrong card copy, and the end reason is lost on reload.** `frame.tsx:32`: on My account and the callback page the card says "The sales screens are for your firm's staff." `session.ts:15`: the reason lives only in the page's memory, so reloading the Signed in elsewhere page gives the plain sign-in card.

## Held

* No session: `/account` shows the card and makes **no** `/api` call at all. The header has no name, no menu and no Sign out.
* Stale tab (same person signs in elsewhere): the next Profile click shows the exact AG-1-55 words and button. The page holds no name, email or firm key of the previous person. A wrong email after "Sign in again here" (a 401 with no token) shows the card, never Signed in elsewhere. Client-side expiry (`TOKEN_EXPIRED`) shows the card.
* Valid callback: posted once. The address becomes `/account`. Back skips the code entry (history: `/inbox` then `/account`). The same code in a second browser gets the server's own words. A valid code over another person's session switches to the new person.
* Storage fully blocked (`sessionStorage` and `localStorage` getters throw): sign in, move around, sign out and the callback all work in memory, a reload signs out, and there are no page errors. A corrupt stored value shows the card.
* Change of person (Case officer, then sign out, then Case manager), across `/account` and `/front-office/leads`, the page text read every 30 ms (58 reads): A's name and email never appear.
* No `x-actor` header on any request from `/account`, the callback page or Signed in elsewhere. No `[data-person-picker]`. `/api/platform/me/account` with only `x-actor` answers 401.
* Keyboard: no trap. The Tab loop is brand, Sign out, Profile, crumb, back to the brand. Signed in elsewhere puts focus on its heading, and the button comes next. axe finds 0 violations at 1024 px, 200 % zoom (1440 and 1024), 375 px and on Signed in elsewhere.
* A long Arabic, Greek and Chinese name with a 140-character word: the header truncates it, Sign out stays visible, there is no sideways scroll, and the Profile row wraps.

## Not findings (scope)
* FO-4's `SalesFrame` shows the plain card, not Signed in elsewhere, and its Sign out does not post `session/sign-out`. These are FO-4's own lines and the brief forbids touching them.
* The 1-hour token with no refresh is FO-4's behaviour, moved unchanged.
* Not tested: whether Chrome's global history (`chrome://history`) records the `#code` address before `replaceState` (headless cannot show it).
