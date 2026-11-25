# PF-28 parts 2b–2c: journey test (reviewer, 21 Nov)

Head: 0c6608fd81793897b626a75db1923920cc88e34b (PR #2794). Isolated copy `rv_pf28b` on :4438 (runtime ports; never :4400), `PLATFORM_IDENTITY=local`. Live AI off; cost US$0. Script: the reviewer's own Playwright walk (kept in the session scratchpad, not committed). It ran clean twice after a fresh restart. One earlier run hit the sign-up door's own limit of 10 tries per IP in 10 minutes (429, by design), because I had also sent probes by hand.

This diff changes no screen layout. The journeys walk the screens whose server answers changed: Sign up, Confirm your email, Complaints (list, Record drawer, record), and Settings → Terms.

## Journeys
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | A firm owner signs up (keyboard only, 1024 px) | Types `own,er…@example.com` (the page's own check passes it), tabs through, ticks with Space, presses Enter | The server refuses it (422); the words appear on Work email and in the summary | Held: "Give your work email (name@example.com)." on the field, `aria-invalid=true`; axe clean; no sideways scroll |
| J2 | The same owner confirms the email | Corrects the email, sends, opens the link from the demo inbox, types a wrong code, then the right one | Wrong code: the words show on the code field and the form stays; right code: done | Held: 422 CODE_WRONG gives "That code is not the one we sent"; the right code shows the done view |
| J3 | Recovery: the used link opened again (400 px) | Opens the same link and presses Confirm | The closed page, with a next step | Held (404 path); no sideways scroll at 400 px |
| J4 | Error: a link cut short by a mail client | Opens `/sign-up/verify#token=<20 chars>&code=…` and presses Confirm | The closed page, not an error | Held (422 by shape): "This link cannot be used" with "Send a new link" |
| J5 | A Responsible person records a complaint | Complaints → Record a complaint → submits empty → fills the fields → submits | The server's field errors on their fields; then the record opens | Held: 422 COMPLAINT_FIELDS lists How it came, About and What it is about, and each shows on its field; the second submit opens the record |
| J6 | The handler acts on it | Acknowledge on the record | 200, and the record updates | Held (the id is checked before the body; a real id passes) |
| J7 | Back to the list at 1024 px | `?view=all` | The complaint is listed; the chips work | Held; axe clean; no sideways scroll |
| J8 | Settings → Terms | Opens the page | The acceptances load (`limit` and `cursor` go through the rule) | Held, with no error |
| — | Builder's walk `part-2b-walk/walk.cjs` on my copy | — | — | exit 0, 4/4; every view chip answered 200 |

## Data underneath
- One firm per completed sign-up: `platform_firm` count 2, with 2 distinct emails across the two runs that got through.
- One complaint per run, with the summary exactly as typed. Its audit lines are `complaint.record` ×1 and `complaint.acknowledge` ×1.
- The only refused calls were the ones the walk provoked: signup 422, verify 404/422, complaints POST 422. There were no page errors.

## Break it (about 15 minutes, by API)
- A repeated query key (`?from=a&from=b`, `?name=a&name=b`) gives 422 "This must be text." An unknown key on every changed list gives 422 with the key named.
- A malformed complaint id with a bad body gives 404 before the body is read. A complaint with an unknown field and no Idempotency-Key gives 422 for the body first.
- The verify door's 422 depends only on the body's shape (a 43-character token and 6 digits). A well-formed unknown token gives the same 404 as before, so the 422 tells nothing about which links exist. The per-IP limit still runs first.
- The public suggestion door on a firm's host still answers that host's 404 before reading the query.
- **Found:** `tests/journeys/j_100.ts` (R1.100's journey) now fails 3 of 27 checks on this head (run on my copy: 24/27). It still expects 400 for sign-up field errors (lines 93 and 95) and for CODE_WRONG (line 113). `tests/qa/check_qa_r1_platform_fo_walk.ts:42-50` makes the same assumption. See review M1.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J8 all completed |
| Next step obvious | 1 | Each refusal names its field; the closed page offers "Send a new link" and "Sign in" |
| Plain words | ½ | A cut-short link reads "This link has expired or was already used." (J4), which is not true. The server's detail "This link is not complete. Open it again from the email." is not shown (verify-page.tsx:52). |
| Feedback and state | 1 | `aria-invalid`, a summary, focus moved to the summary (J1); busy states on submit |
| Correct data | 1 | One firm, one complaint, one audit line per change (above) |
| Error recovery | 1 | Wrong code, then the right code (J2); a used link closes with a way forward (J3) |
| Accessibility and screen sizes | 1 | axe (WCAG 2.2 A/AA) clean on 5 states; 400, 1024 and 1440 px with no sideways scroll; keyboard-only sign-up |
| Speed | 1 | No step waited over 1 s: each answer arrived within the scripts' fixed 0.4–0.8 s pauses in both runs. Not timed against the §9 budgets one by one. |
| Visual quality | 1 | The screenshots match the team look; nothing moved |
| Trust and sources | 1 | Sample labels are kept (lists, plan, firm name); no AI on these screens |

**9.5/10, pass** (8 or more, and no criterion at 0). To raise plain words: when the verify answer is 422 and not CODE_WRONG, show the server's detail, or a sentence for an incomplete link.

Not tested: a real screen reader, and an intended user's own walk (D17/D20 stay with the founder). I did not re-walk the notification and office screens: no web screen calls these doors (grep of `web/src`).
