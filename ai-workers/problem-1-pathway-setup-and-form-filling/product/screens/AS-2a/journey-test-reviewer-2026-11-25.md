# Journey test: AS-2a, cited gates on assessment-only releases (reviewer, 25 Nov 2026)

Head 6f71259eaa4c2f2a9e2619a0f1e98e4bf8fc6cfd. Isolated copy `rv_walk` on :4461 (Visitor visa set up by `tests/runtime/setup_visitor_visa.ts`). Headless Chromium (Playwright) plus API calls for the steps no screen offers (setting the flag and the source is API-only in this part, by design). US$0.

## Journeys (persona · goal · expected)
1. **Main.** Content publisher: "release a stream used only to assess people, with each rule cited". Cited gate plus flag, then submit, sign off, approve (a second person). Released with no form, and the review shows page, quote and date. **Held**: test A, and this copy.
2. **Error.** Publisher saves an uncited gate on an assessment-only combination. Expected: refused, with the reason on that gate. **API held** (400 `gates.0.source`). **Screen failed**: the dialog says "Each one is said under its field" and no field says anything (M3).
3. **Wrong use.** Case officer tries to open a case on the stream. Expected: refused in words. **Held**: the New case list shows "Assessment only: no forms. This release is used to assess a person; a case does not open on it." Keyboard-only at 400, 1024 and 1440 px.
4. **Alternate.** Publisher marks a combination that has forms as assessment only. Expected: no case opens on it (the line the reviewer signs). **Failed**: released with filing and placement checks skipped, startable, and a case opened (201) (M1).
5. **Boundary: an existing case.** Officer moves a case to the newest release, which is now assessment only with no forms. Expected: refused. **Failed**: moved, and the case is open on Release 4 (M2).
6. **Recovery.** The editor is reopened and re-saved. Expected: source and flag kept. **Held** (the PUT body carries them back; the GET shows `assessmentOnly: true`).
7. **Author's next step after release.** Expected: the page says what the release is for. **Failed, already recorded by the builder**: "Not ready … until it is fixed" and "Open a case on Release 4" (the walk's AS-2a2; review m6).

## Data underneath
* The release snapshot carries `assessment_only: true` and each source exactly as entered (jsonb, field by field). `forms` is 0.
* The audit line is written on the save. A second person approves (the author's own approve is refused, test A).
* After journey 4, the release with forms is `startable:true`. After journey 5, case C-2026-00001 is pinned on the assessment-only Release 4 (revision 2).

## Break-it pass (15 min, pure functions plus the door)
* The year `0000-01-01` and the year 1066 are accepted. `2026-02-30`, month 13, day 00 and future dates are refused.
* `https://user:pw@…`, `localhost` and IP addresses are accepted, and a raw space in the path is stored unencoded.
* A quote of 2000 code points including emoji is saved, then `door.assess` throws `too_big` (review m1).
* `sample: "true"`, `{}`, `{sample:true, url:null}` and `javascript:` are refused.
* Severity: three Major (M1–M3), the rest Minor.

## Score (0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | The main path completes by API. On screen, a new gate on such a combination cannot be saved (M3). |
| Next step obvious | ½ | The Open a case refusal is clear. The combination page says "Not ready … until it is fixed" and offers Open a case (m6). |
| Plain words | ½ | The refusal is plain. The name is doubled in the list (m5). One message holds `{ sample: true }`. |
| Feedback and state | ½ | The 409 is shown in the list. The editor's save failure is said nowhere (M3). |
| Correct data | ½ | Values are stored exactly and old fingerprints are unchanged. A case opens on, or moves onto, an assessment-only release (M1, M2). |
| Error recovery | ½ | Stale and field errors work as before. The source error is a dead end on screen. |
| Accessibility and screen sizes | 1 | axe WCAG 2.2 A/AA 0 on the Open a case dialog and the editor. No sideways scroll at 400, 1024 and 1440. The dialog opens by keyboard. |
| Speed | 1 | No new request per row. Page load plus dialog in about 1.4 s, including the full load to network idle. |
| Visual quality | 1 | No new visuals. Team notice components. |
| Trust and sources | ½ | Page, section, quote and date reach the release and the summary. The signed line "no case opens on it" is not true for M1 and M2. |
| **Total** | **6.5/10** | **Not a pass** (below 8, no criterion at 0) |

Fixes that raise the score, most valuable first:
1. M1: make one predicate decide every check, or refuse the flag together with forms.
2. M2: refuse a release move onto an assessment-only release.
3. M3: render `gates.N.source` under its gate.
4. m6: record AS-2a2 before AS-2d1.
5. m5: use the name once in the list.

Not tested: a real screen reader, 200 % browser zoom as such (covered by the 400 px width), and an intended user's unaided walk (D17 and D20 stay with the founder).
