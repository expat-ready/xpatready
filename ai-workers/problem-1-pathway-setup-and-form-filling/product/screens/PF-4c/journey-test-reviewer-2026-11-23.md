# Journey test (reviewer role): PF-4c part 2, the licence-number warning (PR #3173 at dc200625e)

23 Nov 2026. Isolated copy `rvj92c` on :4784, with `AI_LIVE=off PLATFORM_IDENTITY=local`. Never :4400. US$0.
The scripted walk is `j_92.ts`, run twice. The break-it pass is a reviewer script (headless Playwright, in the reviewer's scratchpad, not committed).

## Journeys
1. **Main path.** Persona: a College member at a firm. Goal: "I want my licence on file." Steps: My account, Licence, College member, type `X-55`, Save. Expected: saved, a toast, and a warning on the number that names the College and says "It was saved." **Held** (j_92 W6; break C1).
2. **Alternate.** The same person with a correct number, `R123456`. Expected: saved with no warning. **Held** (D3 over the API; the W7 keyboard save).
3. **Correcting the typo.** After the warning, the person types a new number. Expected: the warning goes at once. A good save then shows no warning. **Held** (C2, A2).
4. **Owner on Licences.** Persona: the Owner. Change a person's record to a wrong shape. Expected: saved, and the panel stays open with the warning. **Held** (j_92 W6 panel; B1).
5. **Owner corrects it in the open panel.** Expected: saved, and the panel closes. **Held** when no spaces were typed (B3). **Broken** when the first number had a trailing space: "Someone else changed this licence…, Nothing was saved", and the correction is thrown away (A2; review Major 1).
6. **Body without a format.** Persona: a notary. Expected: never a warning. **Held** (D4).
7. **Reload after a warning.** Expected: no stale warning. **Held** (C3).
8. **Escape after a warning in the panel.** Expected: it closes and focus returns to Change. **Held** (B4).
9. **Privacy (AG-1-31).** Expected: the warning never holds the number. **Held** (D1). The toast holds no number (j_92 W6).
10. **Regression.** Expected: the existing PF-6 licence flows still work. **Broken:** `check_pf6_staff_browser.ts` times out after its first warned panel save, so the panel blocks Add licence (review Blocker 1).

## Replay and data
* j_92 gave 21/22 on both runs. The only FAIL is W1 (Firm profile page, PF-5s S5, out of scope).
* axe WCAG 2.2 A/AA is clean in the warning state, and at 400, 1024 and 1440 px. There is no sideways scroll. The keyboard-only save works.
* There were no page errors.
* Data underneath:
  * The DB stores the trimmed number (`X-77` for `X-77 `).
  * GET `me/account` carries no warning.
  * The wrong shape gets 200, never 4xx.

## Break it
* Trailing space, then a corrected save in the panel: **false conflict** (Major).
* Lower-case `r555555`: warned. That is acceptable, as it is soft and only a typo check.
* `ZZ-SECRET-123`: the warning words exclude the number.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | j_92 W6: saved and warned, on both pages |
| Next step obvious | 1 | "Check it. It was saved." Save and Cancel stay at hand in the panel |
| Plain words | 1 | The body is named in full and there is no code. The hint "We never verify licences" stays |
| Feedback and state | 1 | The toast and the field note agree. The field is not marked invalid |
| Correct data | ½ | It stores what was typed (trimmed), but a correct follow-up save is refused (journey 5) |
| Error recovery | ½ | After the false conflict, a second save works, but the correction is lost and the message is untrue |
| Accessibility and screen sizes | 1 | axe clean at 3 widths. Contrast about 10.4:1. Linked by aria-describedby. A real screen reader was not tried (review Minor 1) |
| Speed | 1 | Each save settled well within the 30 s waits, and no step felt slow. Not timed against STANDARDS §9 |
| Visual quality | 1 | Warning tone with the same tokens. See the `j92-w6-*-1440.png` screenshots |
| Trust and sources | 1 | The pattern is cited from college-ic.ca with quote and date. The hint says nothing is verified |
| **Total** | **8.5 / 10** | **Pass** (8 or more, no 0) |

What would raise it most:
1. Build the panel's `start` from the stored record. This fixes correct data and error recovery.
2. Get the PF-6 suite green again.

## Not tested
* A real screen reader (the announcement of the `role="status"` note as it arrives).
* 200% zoom.
* An intended user's unaided walk. D17 and D20 stay with the founder.
