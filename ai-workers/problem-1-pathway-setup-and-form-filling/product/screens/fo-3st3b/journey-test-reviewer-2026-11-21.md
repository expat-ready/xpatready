# Journey test (reviewer), FO-3st3b Settings → Timings and a type's own timings, 21 Nov 2026

Scope: PR #2750 code at b4b67150a plus the local wiring a0401088e and 5ddd560b3, on the builder's copy at http://localhost:4574 (database `xr_studio_screens_fo3st3b`, local sign-in; never :4400).
Method: headless Playwright scripts that act like a person (click, type, Enter, Escape). Scripts: `walk.mjs`, `lost.mjs`, `edit.mjs` in my session scratchpad; screenshots are there too and are not committed. After each step I read the API. This is not a visible-browser walk: no one watched it live.

## Journeys (persona · goal · expected)
1. **Main, Admin:** "Set our firm's self-service limit to 6 hours." Menu → Timings → 6 → Save timings → "Timings saved. …"; the API reads 360. **Held.**
2. **J-T5 across the screen boundary, Admin:** "This type needs a 2-hour limit." Booking types → the type → Advanced shows "Uses firm default (6 hours)" → Change for this type → 2 → Enter → "2 hours (this type)" → Reset to firm default → 6 h. **Held** (suite steps 1-4; my walk did the same on Gap after: 5 → "5 minutes (this type)", API 5).
3. **Keyboard only, Admin:** Tab to a field → type → Enter saves → focus goes to the h1. In the panel: focus "Change for this type" → Enter → the field is focused → Enter saves → focus returns to "Change". Escape leaves the row and keeps the panel open. **Held.**
4. **Errors, Admin:**
   - "six" or "x" → refused at the field, nothing sent;
   - "0.001" hours → refused;
   - "1.25" hours → saved as 75 minutes;
   - 100000 hours → the server refuses with words in **minutes** under an hours field (m1);
   - gap after 2,000 with notice 2 → neither saved.
   **Held, except for the words.**
5. **Read-only, Case Manager:** both pages show values as text, with no input or button, and "You can view timings but not change them." The PUT and PATCH get 403 (suite). axe: no violation. **Held.**
6. **Wrong role, Billing and finance:** no Timings menu item; the direct URL shows "You do not have permission to do this. Ask an Owner or Admin." **Held.**
7. **Recovery, double-click:** a double-click on Save timings sends 1 PUT; saving with nothing changed says "Nothing to save: no value changed." **Held.**
8. **Recovery, two tabs on one type:**
   1. Tab B renames the type.
   2. Tab A's timing save gets 409 with "Someone else changed this type. Reload to see their changes."
   3. A presses Reload, then saves the timing again → 200.
   4. A presses Save type → **200**.

   B's rename is overwritten without a word. **Failed: Major (review M1).**
9. **Two tabs on firm Timings:** A saves notice 5 h, then B (still showing 4 h) saves 6 h → "Timings saved."; 6 h wins silently. This comes from the server's route, which takes no version (review m5).
10. **Sizes:** 375, 1024, and 512 CSS px (1024 at 200 %): no sideways scroll on Timings or in the type panel. The side menu is hidden under 768 px (the frame's pattern).

## Data underneath
- Every save changes only the fields that were sent: the firm row by key; the type's column, with its version bumped by one.
- A refusal leaves both unchanged.
- The server writes one audit line per change (FO-3a1e; I read this in the code, not in `audit_event`).

## Break-it notes
- Tried: non-numbers, negative values, fractions, very large values, double-click, a retired type that has overrides ("Overridden on 3 types: …" includes it, n2), a stale version, and a direct URL with the wrong role.
- Not tried: very long or non-English type names in the "Overridden on" line beyond the Sample names (wrapping looked fine at 375).

## Score (0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J-T5 and the firm save both complete through the screens |
| Next step obvious | 1 | "Change for this type" / "Reset to firm default" sit beside each value; one "Save timings" |
| Plain words | ½ | Range words in minutes under hour fields; the hours error differs from §5 (m1, m2) |
| Feedback and state | 1 | Status lines, busy buttons, focus return, read-only line, loading and error states |
| Correct data | ½ | Values exact; a lost update through the Reload path (journey 8) |
| Error recovery | ½ | Stale words and Reload are shown, but Reload leads to a silent overwrite (journey 8) |
| Accessibility and screen sizes | 1 | Keyboard complete, axe clean, 375/1024/200 % with no sideways scroll |
| Speed | 1 | Timings page ready in 358 ms; saves answered well under 1 s |
| Visual quality | 1 | Team look, calm grid; two filled buttons only while a row is open (m3) |
| Trust and sources | 1 | No AI; every value is Sample; defaults shown as "Default: …" |

**Score: 8.5/10. Pass on the score (no 0), but the review blocks on M1.** The fixes, most valuable first:
1. **M1:** the section's Reload refreshes the panel, and the version patch is guarded. This raises correct data and error recovery.
2. **m1:** range words in hours. This raises plain words.

Not tested: a real screen reader, a visible-browser walk watched live, an intended user's unaided walk (D17, D20 stay with the founder).

## Re-test at 4053db1f2 (same day, fresh copy :4574)
- **Journey 8 now holds:** after the stale save and Reload, the panel shows tab B's name, and Save type keeps it on the server.
- **Journey 4's range words** are in hours ("must be from 0 to 8,760 hours").
- **The row Save is an outline button,** so the panel has one filled button.
- **Re-score:** correct data 1, error recovery 1; plain words stays ½ ("0.1667" hours is refused with the whole-minutes hint; the m2 words are not in §5). **9.5/10, pass.**
