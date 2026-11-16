# PF-6 part 1 — journey test (reviewer role), 16 Nov 2026

Commit `8028615d4` (PR #1912). Copies: the builder's :4561 (`xr_studio_screens_pf6a`, PLATFORM_IDENTITY=local) and my own fresh isolated copy :4562 (`screens_pf6a_rv`, started fresh for each rerun and then stopped), both serving `web/dist` built from c39b97a0f, this commit's last web change. **From 02:42:48 UTC, :4561's `web/dist` was rebuilt from uncommitted working-tree fixes (callback-page, frame, session).** Everything below ran before that, except the M1 recheck, which is noted. Headless Chromium, Playwright. Walk scripts and shots: scratchpad only. US$0.

## Journeys (persona · goal · expected)
1. **Main.** Case officer: "see my own account". Open `/account`, get the sign-in card, sign in, see the name in the header and Profile (name, email, roles, licence, two-step).
2. **Alternate.** Invitee: "open the sign-in link from my email". `/sign-in/callback#code=…` signs in once, the code leaves the address, My account opens.
3. **Empty.** A person with no licence sees "No licence recorded."
4. **Error.** A wrong email, an unknown firm, a used link, a junk link while signed in, a link with no code.
5. **Wrong role / wrong identity.** The Studio's simulated person: no `x-actor` reaches staff routes. A revoked session (Sign out everywhere) gets the sign-in card, not Signed in elsewhere.
6. **Recovery.** Reload, double-click Sign in or Sign out, storage refused, and a used link followed by the sign-in card on that page.
7. **Signed in elsewhere (AG-1-55).** The same person signs in in a second browser. The first tab's next click says so, and "Sign in again here" opens the card.
8. **Boundary.** Sign out; the next staff call carries no old token; Sales (`/front-office/leads`) then shows the card.

## What held (evidence)
* The suite passed 47/47 on two fresh copies (no flake), FO-4 passed 45/45 and PF-1 passed 28/28 on a fresh copy. On the builder's copy a rerun stops at the invitation: the seat limit is taken by the first run's invitee plus a leftover probe invitation (finding 5).
* J1, keyboard only: Tab goes brand > crumb > Firm key > Work email > Sign in. Enter signs in, and Profile appears in 95 ms. A reload keeps the session (132 ms). The header shows "Case officer (Sample) · Sign out". Values match `GET /api/platform/me/account` exactly.
* J3: "No licence recorded." J4: "No staff member signs in with that firm key and work email." appears on the card. A link with no code says "This sign-in link has been used or has expired. Sign in again."
* J5: every request from `/account` is `/api/platform/*` with a bearer token and no `x-actor` (request log). There is no `[data-person-picker]`.
* J7: the stale tab needs a click (no polling, as the brief says "on its next click"). The brand link click shows the exact words, focus is on the heading, the button comes next, and it opens the card.
* J6: a double-click on Sign in or Sign out gives no error. With storage fully blocked, sign-in works in memory.
* 200 % zoom at 1024 (512 css px, DPR 2): no sideways scroll, axe finds nothing, the menu shows as a row. 375, 1024 and 1440 hold (suite screenshots).

## Findings
| # | Severity | Finding | Where |
|---|---|---|---|
| 1 | Major | **A sign-in on the refused callback page looks as if nothing happened.** After a used or expired link, the page shows the card. Signing in there stores the token, but the page stays on "Not signed in · used or has expired" with an empty card: `CallbackPage` never reads the token. This is the breaker's M1, confirmed by reading the code at `8028615d4`. My browser recheck after 02:42 ran on the rebuilt (fixed) bundle, so it went to /account. | `callback-page.tsx:17-41` |
| 2 | Major | **A new link pasted into the refused callback tab is never used and stays in the address.** The effect runs once (`[]`). A change only after `#` does not remount the page, so nothing is posted and `#code=` stays in the address bar and history (brief item 4, DW4). This is the breaker's M2, confirmed by reading the code. | `callback-page.tsx:19-35` |
| 3 | Minor | A refused link while still signed in says "Not signed in" and shows the card, but the session is intact (/account opens it). | `callback-page.tsx:22,32,40` |
| 4 | Minor | Plain words. The licence reads "rcic · CICC · R000000": `words()` leaves a lower-case code as stored. The card says "The sales screens are for your firm's staff…" on My account and the callback page. | `account-page.tsx:15,34`; `frame.tsx:32` |
| 5 | Minor | The suite cannot run twice on one copy: each run's invitee takes a seat ("allows 5 people … (6 now)"). CI is unaffected, because it uses a fresh copy per suite and per retry. | `check_pf6a_frame_browser.ts:39-46,130` |
| 6 | Minor | Focus drops to `<body>` after "Sign in again here" and after sign-in. | `signed-in-elsewhere.tsx:15`; `frame.tsx:86` |
| 7 | Minor | Loading is a line of text, not the skeleton FO-4 already has (`sales/loading.tsx`). The browser tab is titled "Product Studio" on staff pages. | `account-page.tsx:27`; `frame.tsx:88` |

## Score (journey-test §6)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J7, J8 complete; the suite passed 47/47 twice |
| Next step obvious | ½ | Signed in elsewhere and the card are clear, but the refused-link card stalls (findings 1, 2) |
| Plain words | ½ | AG-1-55's words are exact; "rcic", the sales copy and "Not signed in" while signed in are not (findings 3, 4); the firm key in the title follows Lead B's ruling (PF-13 DW11) |
| Feedback and state | ½ | Busy buttons and status lines work; finding 1 gives no feedback after a successful sign-in; finding 7 |
| Correct data | 1 | Profile equals the API; one session per person on the server; the old token gets 401 after Sign out; one POST per code |
| Error recovery | ½ | Reload, storage blocked and a revoked session recover; the refused-link path does not (findings 1, 2) |
| Accessibility and screen sizes | 1 | axe finds nothing serious at 375, 1024, 1440 and 200 %; keyboard path works; focus loss is minor (finding 6) |
| Speed | 1 | Sign-in to Profile 95 ms, reload 132 ms, one `/me` per navigation |
| Visual quality | 1 | BK-3 Frame, team tokens, calm card; screenshots at all three widths |
| Trust and sources | 1 | No AI; two-step state and licence come from the server; the rule line "required for everyone" is shown |
| **Total** | **8 / 10** | **Pass** (8 and no 0). The fastest raise is findings 1 and 2 (+1 to +1½), then 4 and 3. |

**Could not test:** a real screen reader; Safari's or Firefox's storage behaviour; the real identity provider (local stand-in only); an intended user's unaided walk (D17 and D20 stay with the founder).
