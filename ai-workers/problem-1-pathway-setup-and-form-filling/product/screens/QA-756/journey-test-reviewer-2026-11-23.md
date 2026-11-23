# Journey test: QA-756, booking pages on a firm's own address (reviewer, 23 Nov 2026)

Commit `886a61188dee949b9355b51e5ee90646f4a8875a`, isolated copy `rv_qa756` on :4491 (never :4400). Firm A = `sample-firm.localhost`, firm B = `sample-solo.localhost`, ExpatReady's own host = `localhost`. Headless Chromium through Playwright, with `*.localhost` mapped to 127.0.0.1. Clicks and keys only, except where marked as a URL typed by hand.
The walk script and its screenshots stayed in the reviewer's scratchpad and are not committed. Each step below can be repeated with the URLs given.

## Journeys
1. **Main path (visitor, "book a free consultation with the firm on its own address").** Open `A/book`, Tab to "Choose Free consultation (Sample)", Enter, pick the first time, fill name and email, pick Video, then "Book this time". Then "Reschedule" opens `A/book/manage#…`. Reload.
2. **Wrong firm (break-it).** A's manage link opened on B's address: `B/book/manage#<A's token>`.
3. **Across the boundary (emailed link).** The same booking through the emailed form of the link: `localhost/book/sample-firm/manage#<token>`.
4. **Main host unchanged (j_37's path).** `localhost/book/sample-firm`, then its type page, then `localhost/book`.
5. **Error (bad address).** On A: `/book/no-such-type`, `/book/sample-firm`, `/book/manage` (no token), `/book/qa756-nope`. Then `notafirm.localhost/book/no-such-type` and `A/account`.
6. **Break-it (files).** On A: `/assets/nonexist.js`, `/brand/nothing.svg`, `/fonts/inter/none.woff2`. Also POST and DELETE on `/book`, `/api/public/booking-site` and `/assets/x.js`.
7. **Break-it (studio by client-side navigation).** On A's `/book`, `history.pushState('/account')`.

## What held
* J1: list in 402 ms (cold), firm name in the frame and the title, 2 cards (A's only, no B type).
* J1: the keyboard reached "Choose", and the type page opened at `A/book/sample-free-consultation` in 113 ms.
* J1: booked. The confirmation's links are `/book/manage#<token>` and `/api/public/bookings/<token>/ics`, both on A. Manage shows "Your booking" and still shows it after a reload.
* J2: B shows "This link is no longer valid…", and nothing of A's.
* J3: "Your booking" on ExpatReady's own host.
* J4: list (2 cards, Choose goes to `/book/sample-firm/sample-free-consultation`), type page "Choose a time", and `/book` shows "This page is not available.".
* axe WCAG 2.2 A/AA: 0 violations on A's list, type, booked and manage.
* 400 and 1024 px: no sideways scroll. No console error on the main path.
* J6: other methods give Nest's 404 with no data.
* J7: only a sign-in page renders, and every API call there is a 404. A person cannot get there without developer tools, so this is not a finding.

## Findings
* **Major (M1):** J5. `A/book/no-such-type` gives 200 with the SPA, then a frame with an empty firm bar and "This page is not available.". `notafirm…/book/no-such-type` gives 404 with the server page and its second line, "Check the address…". AG-4-17 asks for the same page byte for byte with the same status. `public-paths.ts:16`, `main.ts:257`.
* **Major (M2):** J6. `A/assets/nonexist.js` (and the brand and font cases) gives 200 and the full studio shell: "Prototype · demo workspace · Acting as…", the studio menu, and "The studio did not accept the simulated person". `public-paths.ts:17-19`, `main.ts:257`, `App.tsx:44`.
* **Minor (m2):** the probe `/api/public/booking-site` counts against the slots per-IP limit (`service.ts:265`). When that limit refuses it, the page shows "Please try again in a minute." even on a dotted ExpatReady host (`site.tsx:25`).

## Data underneath
* The booking made on A's address reads back on A's address as A's type (D4 of the check, J1). The check passes 12/12 on this commit.
* The view and the calendar file answer on A; the same link on B gives the one not-found.
* No other firm's rows were shown on A's address, by key (D3) or by token (D4, J2).

## Score (each 0, 1/2 or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 booked and managed on A's address |
| Next step obvious | 1 | One "Choose" per card, one "Book this time", Reschedule and Cancel on the confirmation |
| Plain words | 1 | Same FO-3w words, no ids |
| Feedback and state | 1 | Skeleton during the probe and the slots, "You are booked" focused |
| Correct data | 1 | A's types only; booking under A; B refused (J2, check D3 and D4) |
| Error recovery | 1/2 | Unknown slug and unknown firm give different pages (M1) |
| Accessibility and screen sizes | 1 | axe 0 on 4 states, keyboard path, 400 and 1024 px |
| Speed | 1 | 402 ms cold list, 113 ms type page |
| Visual quality | 1/2 | Studio shell and demo chrome on M2's paths; empty firm bar on not-found |
| Trust and sources | 1 | No AI; Sample values labelled |
| **Total** | **9/10** | **Pass (8 or more, no 0).** M1 and M2 still block the review. |

Fixes that raise the low criteria, most valuable first:
1. M1, the one not-found from the server for an unknown or unlisted slug on a firm address.
2. M2, a missing file on a firm address gives the plain 404.

## Could not test
* A real screen reader.
* An intended user's unaided walk (D17, D20 stay with the founder).
* j_24, which is on PR #3191.
* A real wildcard DNS host and certificate.
* A real 200 % zoom (I used a 400 px viewport instead).

## Round 2: commit `ad346742db7c2609f2df91ec5d7491fcfb44a56e` (copy `rv2_qa756` on :4493; never :4400)
Headless Chromium, `*.localhost` mapped to 127.0.0.1, run twice with the same result. Extra Sample types were added to the copy's own database for the break-it: on A, a hidden type, a CASE_REVIEW type, a switched-off type and an OTHER type; on B, a type A does not have.
* J1 again, keyboard only at 1024 px: A's `/book`, Tab to "Choose…", Enter, then "Choose a time" at `A/book/sample-free-consultation`. List 185 ms and 230 ms; type page 85 ms and 100 ms. No 4xx or 5xx while the list and type page load. axe: 0 on the type page.
* J5 again: `A/book/no-such-type` and `notafirm…/book/no-such-type` both give 404 and the same page: "This page is not available. Check the address, or contact the firm that sent it to you." The headers match too (450 bytes, `no-store`). axe: 0 on that page. No sideways scroll at 400 px.
* J5 break-it: on A, the hidden, CASE_REVIEW, switched-off and B-only slugs give the same plain 404. The page answer and the door's answer agree for every slug. B's own type opens on B. A's OTHER type opens on A (same rule as `publicType`).
* J6 again: `A/assets/nonexist.js`, `A/brand/nothing.svg` and `A/fonts/inter/none.woff2` give the plain 404, with no studio shell. HEAD, POST and PUT on `A/book/no-such` give 404. `A/book/manage/` gives 404. `A/book/manage?x=1` gives 200.
* J2 and J4: covered by the check's new D5 browser lines (18/18 on this commit).
* Data: unchanged from round 1 (D3 and D4 pass). The booking-site probe has its own rate count (`site:ip:`).

| Criterion | R1 | R2 | Evidence (round 2) |
|---|---|---|---|
| Error recovery | 1/2 | 1 | One server page for an unknown type and an unknown address, with the line "Check the address…" |
| Visual quality | 1/2 | 1 | No studio shell or demo chrome on a missing file. The not-found is the plain page the rule asks for. |
| The other eight | 1 each | 1 each | Unchanged; J1 above |
| **Total** | 9/10 | **10/10** | **Pass.** |

One Minor (n1 in review.md): the doors' JSON 404 has the same bytes on A and on an unknown address, but the headers differ (ETag, Cache-Control). It does not change the score.
