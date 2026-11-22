# Break report: FO-3st3b, Settings → Timings and a booking type's own timings under Advanced (R1.42)

Breaker: an independent agent that did not build the screen. Isolated copy on :4574 (`xr_studio_screens_fo3st3b`, `PLATFORM_IDENTITY=local`). Branch `local-int-fo3st3b`: main + #2718 + #2727 + #2750 + wiring. The copy was reset partway through the session. All results below come from the reset copy with the review fixes (`a37f80dda`), except where marked "first run". I added my own people with prefix `brkmwq14my0`: an Admin, a Case Officer host and Billing and finance in `sample-firm`, plus an Admin and Billing and finance in `sample-solo`. I also used the Sample Case Manager (user-T). I added one booking type of my own, "Break type brkmwq14my0 …". All firm-level writes went to `sample-solo`, and I put its values back to the defaults afterwards. I set the type's own timings back to the firm's. Tools: Playwright Chromium and direct API calls. US$0.
Scope: concept `screens/fo-3-booking` r2 BR-20, §4/§5 Timings, J-T5. Reminders are read-only by Lead B's ruling. The paid hold is not rendered. Neither is a finding.
Files: TT = `web/src/modules/front-office/booking/settings/type-timings.tsx`, TP = `timings-page.tsx`, TC = `timings-contract.ts`, API = `api/src/front-office/booking/settings/timings.ts`.

## Summary
0 Blocker · 1 Major (fixed by the review fixes, re-tested) · 4 Minor. Everything else I tried held: role gates, ranges, odd keys, the stale PATCH, Enter and Escape inside the panel, double clicks, and the narrow and zoomed layouts.

## Majors

**M1 (Major, FIXED in `a37f80dda`, re-tested): a timing save after a stale Reload let the panel's Save type silently undo another person's Definition change.**
Steps (first run, before the fixes):
1. Tab A opens the type at v1 and types Length 45.
2. B renames the type and sets a description (API PATCH, v2).
3. In A, a timing save answers 409 "Someone else changed this type…". A presses Reload in the timings section. At that time Reload refreshed only the section's own query.
4. A saves Gap after 20 (v3). `onSaved` gave the panel v3, but the panel still held its v1 Name and Description.
5. A presses Save type.

Actual (first run): 200. The type went back to the old name, `description: null`, minutes 45. B's change was lost with no message. This breaks AG-4-9 rule 7 and STANDARDS "[M] Optimistic concurrency".
Re-test on the fixes: Reload now refreshes the whole panel, and the Name field shows "… RENAMED-BY-B". Save type then keeps B's name and description ("after: 3 … RENAMED-BY-B, B wrote this, 30, 20"). Two more stale paths held:
- A saves a timing, B renames, then A presses Save type: 409 with the stale notice.
- B's panel, still at the old version, presses "Reset to firm default": 409. Its Reload shows the current name and B's own 22 minutes.

## Minors

**m1: an hours field silently rounds input that is not whole minutes, even though its hint says "in whole minutes".**
TC:57-61 rounds anything within 1e-6 minute of a whole number.
- On the type row (Shortest notice): "0.000000001" saved 0 and the note said "Shortest notice for this type is 0 hours". "1.0000000001" saved 60. "0.0166666667" saved 1 minute.
- On the firm page: Shortest notice "0.000000001" sent `{"minNoticeMinutes":0}`, and the page said "Timings saved". The firm's shortest notice became 0 (book with no notice).

"1.01" is refused correctly. The result is stated after the save, so this is Minor. But a near-zero typo turns into a real 0 with no question.

**m2: an hours value that is not a multiple of 0.6 minutes opens for editing as a long float.**
TC:54 `String(v / 60)`. A type with its own notice of 1 minute opens "Change" with `0.016666666666666666`. At 320 px the w-24 input shows only "66666666" (screenshot at `/tmp/claude-0/-home-user-xpatready/d724ccde-065c-5a5e-9819-b51c10d22bad/scratchpad/320-booking-types.png`). 50 minutes would show `0.8333333333333334`. The firm form uses the same `toInput`. Saving the text unchanged gives back the same value, so nothing is lost. It reads badly and cannot be checked by eye.

**m3: two people saving the same firm timing both get "Timings saved", and the later save wins.**
Steps: tabs A and B both open Timings in `sample-solo` with Gap after 10. A saves 30. B, still showing 10, saves 5. Both pages say "Timings saved…" and the stored value is 5. B was never told the value was 30. Ten parallel API PUTs all answered 200, and the last one won (48).
Cause: PUT booking-timings has no version (API:139-152, TP:57).
Mitigation: the screen sends only the fields that changed (TP:49), so edits to different fields merge correctly.
Rated Minor because firm settings go through the settings home, which is last-write-wins by design (precedent: AUD-5-1 break report). This still misses STANDARDS §3 "[M] Optimistic concurrency" (01-programs-catalogue rated that Major). The fix would be in FO-3a1e's route, not this screen.

**m4: Reload after a stale timing save throws away the panel's unsaved Definition without saying so.**
Steps: type Length 45, then cause a stale timing save, then press Reload (TT:70, which invalidates `["fo","booking-types"]`). The panel resets to the server's values (minutes 30) and gives no "your typed changes were discarded" line.
The stale form could not have been saved anyway. Still, the notice says only "Reload to see their changes" and does not say the person's own typing will go.

## What held (attempt → result)
- **Ranges, API, firm and type:**
  - These were all refused with 400 and the field's range words, and nothing was saved: -1, 1e9, 1.5 minutes, "10" as a string, null on the firm route, 1e400, window 0 and 731, NaN or bad JSON.
  - Reminders: three, a duplicate, an empty list and a string were all refused.
  - `constructor` gave `{"constructor":"Not a booking timing."}` (firm) and "Not a field of a booking type." (type).
  - `reminderOffsetsMinutes`, `name` and `pad` on the type route were all refused. A 2 MB extra field was refused.
  - A `__proto__` key changed nothing (type stayed at v1 with all values null).
- **Version on the type route:** missing version, string version and -1 were refused. Ten parallel PATCHes with the same version gave one 200 and nine 409s.
- **Roles, API:**
  - Case Manager and Case Officer: firm PUT and type PATCH answered 403 MISSING_PERMISSION, for both the configure-availability fields and self-service.
  - Billing and finance: 403 on GET, PUT and PATCH.
  - No token, or a garbage token: 401.
  - Another firm's type, or an id that is not a uuid: 404.
- **Roles, UI:**
  - Case Manager and Case Officer see values as text with no buttons, plus "You can view timings but not change them.". The type panel shows values only.
  - Billing and finance by direct link to both pages gets the refusal notice, and no Timings menu entry (only the breadcrumb).
- **Client checks (type row and firm form):**
  - "", spaces, "-1", "1e9", Arabic-Indic digits, "1.5" days, "1.01" hours and 20 nines are stopped on the field with no request.
  - "12 " is trimmed and saved.
  - A server range error on an hours field now reads in hours: "Shortest notice must be from 0 to 8,760 hours."
- **Keyboard:**
  - Enter in the row field saves that row only: one PATCH to `/timings`, no PATCH to the type.
  - Escape leaves the row and keeps the panel open, with focus back on "Change".
  - The Tab order goes through the rows in order, then Save, then Cancel. Cancel returns focus to "Change for this type".
  - On the firm page, Enter saves.
- **Double clicks:** a double click on the row's Save, "Reset to firm default" or Save timings, and Enter pressed twice, each sent exactly one request.
- **Panel's typed Definition:** it survives your own timing save, and Save type afterwards is accepted. J-T5 is covered by the suite.
- **Warnings:** a type notice longer than its window warns on the type ("…no times can be offered.") and is named on the firm page.
- **Layout:** no sideways page scroll and no panel overflow at 1024 px, 200 % zoom of 1440 and of 1024 (720 and 512 CSS px), and 320 px, on both pages.
- **Returning to the tab:** a refetch on tab return did not wipe unsaved firm-form edits.
