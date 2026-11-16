# PF-6f break report (#1952, commit 0c5ff13)

Breaker run, 16 Nov. Scope: the brief's three items (the callback page never sticks on "Signing you in…"; one plain
notice when signed in; the PF-6a test's seat lend in a `finally`), plus the attacks the brief and the lead named. Only
`web/src/modules/platform/callback-page.tsx` was attacked; the server's callback route is not part of this row.
Nothing in product code was edited.

How: isolated copy `isolated.sh brk_pf6f 4564 start --ttl 40 PLATFORM_IDENTITY=local` (production web build, so no
StrictMode double effect), stopped and dropped afterwards. A throw-away playwright probe (chromium
/opt/pw-browsers/chromium; deleted after the run) made real hand-off links via invitations, as
`tests/check_pf6f_callback_browser.ts` does, counted every `POST /api/platform/session/callback` per tab, and used
`page.route` to slow, fail, hang or answer HTML. Sessions: user-T by API (sessionStorage), invitees via the links.

## Findings

**Major 1. A late answer from an earlier link replaces the session after the page has already signed in the later one.**
`callback-page.tsx:33-42`: each post's answer calls `setStaffToken` (`:39`) unconditionally, whenever it arrives, with
no "latest code wins" guard and no cancel. `session.ts:80-81` has exactly this guard for staff calls (break m2); the
callback has none.
Repro: signed out, open valid link L1 with its POST held 4 s (`route.fetch()`, wait, `fulfill`); 0.5 s later set
`location.hash` to valid link L2 (answered at once). Actual: at 1.5 s the page is on /account as **L2's person**; at
~4.5 s L1's answer lands and the same tab silently becomes **L1's person** (My account re-renders with L1's email).
2 posts, both accepted. Expected: the link opened last decides (or the second is held until the first answers), and a
page that has moved on is never re-signed-in behind the person's back. Major: it is the sign-in door, and the person
ends up as someone other than the link they opened last, with no notice.

**Minor 1. A remount while a post is in flight is left on "Signing you in…" forever (latent today).**
`callback-page.tsx:17,28`: `inFlight` belongs to the document, but the post's `setState` belongs to the mount that
sent it. A new mount with no code sees `inFlight > 0`, returns, and nothing ever updates it.
Repro: `/sign-in` (in the app), then in-app navigation to the link (`history.pushState(link)` + `popstate`, as a
`<Link>` would), POST held 5 s; Back during the post (to /sign-in), Forward after the answer. Actual: Forward shows
"Signing you in…" indefinitely, although the token **is** stored (sessionStorage holds it). A reload recovers.
Minor because no link or control on the page today moves within the app during a post (the working state has no
links; the header brand is not a link), so a person cannot reach it without scripting. It becomes real as soon as one
is added. Expected: a no-code mount waits for the post and is told its result (or decides from the session once it ends).

**Minor 2. A POST that never answers leaves the page on "Signing you in…" with no way out.**
Repro: route the callback POST and never fulfil it. Actual after 8 s (and indefinitely): "Signing you in…" only, no
sign-in card, no link, no timeout (`callback-page.tsx:35`, plain `fetch` with no abort/timeout). Reload recovers (it
shows the refusal). This was already true in PF-6 part 1, but the brief's item 1 is "never sticks on Signing you in…".
Expected: after a bound (say 15-20 s) the "Could not reach the server" refusal with the sign-in card.

**Minor 3. "Open the link from your email again" does nothing when done in the same tab.**
Repro: open link L with the POST aborted → "Could not reach the server, so this link was not used. Open the link from
your email again, or sign in below." Then open L again in the same tab (same path, so only the hash changes).
Actual: nothing changes; no second post (`sent.has(code)`, `:29`), the same message stays. The code was never received
by the server, so it is still good. Expected: a code whose post failed on the network is not kept in `sent` (a new
tab works, which hides this when the email client opens one).

**Minor 4. Back from My account needs two presses after "Open My account".**
Repro: signed in as user-T, open a used link → notice → Open My account → Back. Actual: Back lands on /account (as
the brief wants), via `<Navigate replace>` (`:50`), which leaves two /account entries: the next Back shows /account
again, unchanged; only the third leaves. Expected: one Back press per visible change (e.g. the notice's link replaces
rather than pushes, or the page goes back instead of replacing).

**Minor 5. The signed-in notice sits under a page titled "Sign in" twice.**
At 1440/1024/640 px the header and the where-line both say "Sign in" above "This link was not used. You are still
signed in." Small wording clash in the very state item 2 cleans up (`:53`, `Frame title="Sign in"`).

## What held
* Back/Forward ×4 each way after a fresh link (signed out → /account): never "Signing you in…", one post, no code in any entry.
* DW1 path (signed in, used link, Open My account, Back/Forward ×4): always My account, one post, never stuck.
* Two tabs, same link, separate sessions: one signs in, the other shows the refusal and the sign-in card; one post each.
  A tab opened from the signed-in tab (session copied) shows only the notice.
* Code after sign-out: a used code → refusal + card; a fresh code by hashchange → signs in; Back ×2 stays on My account.
* Reload mid-post: the code is already gone from the address; the reload shows the refusal and card, no second post.
* History walk (12 Back/Forward steps across a full load and a hashchange): `code=` never reappears; `history.state` keeps the router's key.
* 502 with an HTML body → "Something went wrong on our side. Please try again." plus the card, not raw HTML.
* Odd codes: `#code=` (no post, refusal), Japanese text, 200 000 characters, `code=a&code=b`, `%00%0A<script>`: one post
  at most, plain refusal, nothing rendered as markup, no page error.
* Valid code while signed in as someone else (user-T): signs in as the invitee and opens My account (the link is the proof).
* Notice: no "Not signed in", no "Sign in again", no card beside it; the failed-network case while signed in shows the same notice.
* Keyboard: the first Tab reaches "Open My account"; Enter opens /account. axe (A/AA) on the signed-out refusal: no
  violations; on /account after it: none serious/critical. 1024 px and 640 px (200 % of 1280): no sideways scroll.
* No page error from the app (the only ones seen were the probe's own init script on about:blank).

## Ranked
1. Major 1: an earlier link's late answer replaces the later sign-in (`callback-page.tsx:39`).
2. Minor 1: no-code remount during a post stuck on "Signing you in…" (`:17,:28`), latent.
3. Minor 2: a hung POST never leaves "Signing you in…" (`:35`).
4. Minor 3: a network-failed code cannot be retried in the same tab (`:29-30`).
5. Minor 4: two Back presses from My account after the notice (`:50`).
6. Minor 5: "Sign in" title above "You are still signed in." (`:53`).
