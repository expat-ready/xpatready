# PF-28 part 5 (retainers): journey test (reviewer, 22 Nov)

Head: 9e04ee71c4f9aafa0a3b90ddcec2f22ee3d0326d (PR #2933). Isolated copy `rev_pf28p5` on :4492 (never :4400), `PLATFORM_IDENTITY=local`. Live AI off; cost US$0. Scripts: the reviewer's own headless Playwright walk and an API probe script. Both lived in the copy's ignored `var/` and were deleted afterwards. Screenshots are in the session scratchpad only; none was written to the repo.

The diff changes no screen layout. The journeys walk the retainer screens whose server answers changed: Settings › Retainer templates, the prospect's Retainer card (Prepare retainer), and the retainer page (Save as version, Check and send, Download).

## Journeys
| # | Persona · goal | Steps | Expected | Result |
|---|---|---|---|---|
| J1 | An Owner (user-R) adds the firm's retainer template (1440 and 1024 px) | Retainer templates → Upload template → Name + .docx → Upload | Listed, with a toast (multipart `name` and `file` pass the strict shape) | Held at both widths; answered in about 130 ms |
| J2 | The Owner switches it off and on | Opens the template → Make inactive → Make active | Each answers 200 (`PATCH {active}`) | Held at both widths |
| J3 | A Representative prepares a retainer for a new prospect | Prospect → Prepare retainer → picks the template → Prepare retainer | A Draft, version 1, and its page opens (`{templateId, representativeStaffId}`) | Held |
| J4 | They add the fee and save | Fee 1 amount 1500 → Save as version 2 | Version 2 (`PATCH` with expectedVersion, expectedStatus, representativeStaffId, fees) | Held |
| J5 | They send it (conflict check recorded by API, as in FO-5s) | Check and send → Send to … | Sent; "Waiting for … to sign version 2." | Held; the toasts read "Saved as version 2." and "Version 2 sent." |
| J6 | They download the sent version | Download version 2 | A file `retainer-v2.docx` (`download-link {version: 2}`) | Held |
| J7 | Wrong role, by API | user-O (no `retainer:void`/`configure-template`) withdraws, or switches a template, with an unknown field | 403 before the body | Held; no token gives 401 |
| J8 | Error and recovery, by API | Edit with a stale version: first a bad templateId, then a valid body, then the right version | 422 `templateId`, then 409 CHANGED, then 200 version 2 | Held |
| J9 | Error: Signed offline with no file and a stale version, then with the file, then right | three posts | 422 `file`, then 409 CHANGED, then 200 SIGNED_OFFLINE | Held |
| J10 | Across the boundary: another firm | firm B (sample-solo) edits firm A's retainer | Bad body: the same 422 as a random id. Valid body (fo5 suite): 404 | Held |

In the walk, no write the screens made answered 400, 404, 422 or 500, and there were no page errors: **12/12**.

## Data underneath
- **API probes:** the counts went from 0/0/0 (retainer/version/template) to 1/2/1. That is one draft, its edit to version 2, and one template. The later send, Signed offline and refused calls added no rows. Every refused call stored nothing.
- **The sweep** (45/45): the PF/FO row counts are unchanged after every probe.
- **The walk:** one template per width and one retainer, sent at version 2, as the page showed.

## Break it (about 15 minutes, by API)
- **Attack bodies:** a `__proto__` key gives 422 named. A list body gives 422 `body`. 5,000-deep nesting gives 422. A 200 KB fee label gives 422 at 120 characters. 51 fee rows give 422.
- **Unknown fields:** an unknown multipart field on template upload or Signed offline gives 422 named.
- **Malformed ids:** a bad id with a bad body gives 404 first. An upper-case prospect id is accepted as the same id.
- **Found (m1):** `download-link {"version": true}` answers `"version": "Invalid input"`, zod's words (`service.ts:82`).
- **Found (m2):** an unknown key inside a fee row (`junk`) is dropped silently, and the draft is made (201) (`service.ts:129-132`).
- **Seen (n1, shared rule):** a list body reads "This must be a object." (`input.ts:40`).

## Score (QUALITY.md "Journey score")
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J10 all completed |
| Next step obvious | 1 | Every refusal names its field, `body` included, and gives a way forward ("Send active or name.") |
| Plain words | ½ | Two API answers are not plain words: "Invalid input" (m1) and "a object" (n1). The screens' words did not change |
| Feedback and state | 1 | Toasts, status chip and version list update (J1, J4, J5) |
| Correct data | 1 | Counts as above; refused calls store nothing |
| Error recovery | 1 | J8 and J9: 422, then 409, then success |
| Accessibility and screen sizes | ½ | Walked at 1440 and 1024 px. Not run this time: axe, keyboard only, 400 px. The screens are unchanged by the diff |
| Speed | 1 | Template upload about 130 ms; no step waited over 1 s. Not timed against the §9 budgets one by one |
| Visual quality | 1 | Screenshots match the team look; nothing moved |
| Trust and sources | 1 | Sample labels kept; "Unconfirmed: no counsel" on the Code items; no AI on these screens |

**9/10, pass** (8 or more, and no criterion at 0). To raise it, in order of value:
1. Fix m1, which gives plain words.
2. Re-run the FO-5s browser suites' axe and keyboard steps on `main` merged (the builder's pre-label rule).

Not tested: a real screen reader, and an intended user's own walk (D17 and D20 stay with the founder). Withdraw and Signed offline have no screen yet, so they were tested by API only.
