# PF-28 A2 (R1.10, booking and the platform's last fields): journey test (reviewer, 24 Nov)

Head: **a68a942c27bfd94d401cfc1020ab9b496315d0b7** (PR #3544). Reviewer: Opus 5.5. Live AI off; cost US$0.
- Isolated copies only, on :4436–:4438 (never :4400), each stopped afterwards: `rva2`, `rva2f`, `rvr192`, `rvsys`, and `rva2m` (a worktree of main a040b46d5, since removed).
- My probe scripts (zod precedence, Reflect metadata, schema comparison) stayed in the session scratchpad and were not committed.

**This is an API-only change: no screen changed.** So this score covers the API journeys (j_10's walk over every PF/FO route, the A2 test and the suites), not a browser walk.
- I read the code of the screens that call these doors. The booking pages, the find box and the sign-up form send nothing the new rules refuse.
- One screen effect: the template editor's preview pane says "No preview" for a draft over 10,000 characters (review m1).

## Journeys (persona: a booker on the public page, a firm's Owner, our support staff; or a script calling the API for them)
| # | Goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | Every booking door names a bad field in plain words | j_10 W2 booking | 422 naming the field, or 413/404 as ruled | **PASS**: 206 probes, 0 off (on main: zod's own words) |
| J2 | Every platform door does too | j_10 W2 platform | as above | **PASS**: 420 probes, 0 off |
| J3 | Every body and query reaches a schema | j_10 W3 schema | 0 unparsed; the SES door a NOTE (signature first) | **PASS** |
| J4 | An over-long field is named, never a 404 or a bare 400 | j_10 W3; A2 test L and Q | 422 on the field | **Booking and platform: none left.** The 22 that remain are all A3's (#3531) |
| J5 | A field sent alone is named first, even on a random id | A2 test W/L (17 probes) | 422, that field, plain words | **PASS** 6/6. On main's code 3/6 |
| J6 | A value the rule takes still passes | A2 test P; schema probes head vs main | the next rule or the look-up answers | **Held**, except two tightenings (J6 notes) |
| J7 | The system address change keeps its guard | metadata diff with main; pf25w, pf4s, pf28_system_reason | the same keys, audit, reason and HttpCode | **Identical**; 11/11, 104/104, 5/5 |
| J8 | Nothing stored by any refusal | A2 test N; j_10 W4 | row counts unchanged; no 500 | **Held** |
| J9 | Across the boundary: A3's and A5's | j_10 W2 sales and retainers, W3, W5 | red here, not this PR's | Red as expected |

**J6 notes:**
- What passes:
  - 5000 × U+1D400 support reply passes (code points, as the service counts them).
  - An ISO office version passes, and so does a 10,000-character template body.
  - "good-firm" passes as an address.
  - `q` of 2 characters → 200.
- The two tightenings:
  - A template **preview** of 10,001–20,000 characters was 200 and is now 422.
  - A sign-up `website` over 1000 characters was the trap's quiet answer and is now 422 (bots only).

## Break it (about 15 minutes, by script)
- **Error map, 26 zod forms:**
  - Every schema-set message wins over `plainIssue`: `{error}`, `{message}`, a refine string or object, enum words, `.max` and `.check` messages, superRefine, uuid, literal, pipe, email, int.
  - An error function returning undefined falls to the plain words. No zod words leak.
- **Web address, 8 inputs:** `Sample-firm`, `sample-firm`, `ab`, null, 5, `www`, 64 characters and `good-firm` each answer at the parse exactly as `checkAddressChoice` answers in the service.
- **Template:** 9,999 letters + one emoji (10,001 UTF-16 units) is refused, as `refusals()` refused it on main. Only the words differ (review m2).
- **Find:** a missing `q`, 1 character and 101 characters → 422 `QUERY_LENGTH`, with `fields.q`.
- **Gaming the SES excuse:** it needs a new route string in j_10 or a new allow-list key, and either shows in a diff. The door's post-signature parse is tested by `check_pf19b2_ses.ts:247`.

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | W2 booking, W2 platform and W3 schema PASS; W3 holds only A3's items; A2 test exit 0 |
| Next step obvious | 1 | Each refusal names its field, and the detail counts the fields and ends "Nothing was saved." |
| Plain words | ½ | No zod words left on these doors. But the publish refusal lost its count (m2); a preview pane error says "Nothing was saved."; "This must be a boolean." is technical |
| Feedback and state | 1 | 422 Problem Details with `fields`; find keeps `QUERY_LENGTH` |
| Correct data | 1 | Nothing stored (N, W4); valid values pass (P) |
| Error recovery | 1 | When the named field is fixed, the look-up or the next rule answers (P) |
| Accessibility and screen sizes | ½ | No screen changed and none was walked: no axe, keyboard or width run |
| Speed | ½ | No answer felt slow, but none was timed against the STANDARDS §9 budgets |
| Visual quality | ½ | No screen in the diff; the template preview pane's new "No preview" state was not viewed |
| Trust and sources | 1 | Sample data only; no AI; no immigration value; US$0 |

**8/10, pass** (8 or more, and no criterion at 0). To raise it, in order of value:
1. Keep the service's counted words for an over-long template body (m2).
2. Record the preview tightening in the PR, or view the preview pane at 10,001 characters in the browser (m1).
3. Re-run the PF-19s and FO-3 browser suites' axe and keyboard steps on merged main.

Not tested: a real screen reader, and an intended user's own walk (D17 and D20 stay with the founder). Of the PR's 33-suite `--only` set, I ran 18 suites plus j_10.
