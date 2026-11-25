# FO-3st2 break report (Availability and Time off, `/account/availability`)

Breaker, 18 Nov 2026, against `claude/screens-fo3st2` at ea002db43 (code unchanged at ff43b8403), on the isolated copy :4571 (db `xr_studio_screens_fo3st2`, PLATFORM_IDENTITY=local), Chromium via Playwright, live AI off, US$0. People made for this run: `fo3st2-brk-admin` (Admin), `fo3st2-brk-co` and `fo3st2-brk-new` (Case Officer), `fo3st2-brk-gone` (deactivated). Scope is the brief's "What to build" and concept `fo-3-booking` r2 BR-17 / §4 / §5 / §6 J-A. Paths: `web/…/booking/availability/availability-page.tsx` = **page**, `…/contract.ts` = **contract**, `api/src/front-office/booking/settings/availability.ts` = **svc** (FO-3a part 1b, not this diff).

**Summary: 0 Blocker, 4 Major, 11 Minor.**

## Major

**M1. Unsaved hours are dropped with no warning by "Make default", choosing another set, switching colleague, and reload.**
Steps: on a non-default set, change Wednesday's end 11:00 → 11:45 and do not save. Click "Make default". Result: the set becomes default and Wednesday shows 11:00 again, with no message. Same result when you click another set in the list and come back (typed 12:00, shows 17:00), when an Admin switches "Viewing" to another colleague and back (typed 11:11, shows 16:00), and on browser reload (no `beforeunload` prompt).
Expected (the brief's "nothing lost silently"): either keep the draft or ask before throwing it away. The house `Dialog` already has `guard` ("Discard your unsaved changes?").
Where: page:110 (a new `set.version` or `set.id` resets the draft), page:125-129 (Make default sends only `isDefault` and `version`, and the answer resets the editor), page:220, page:297/307.

**M2. A failed "Remove" on time off shows nothing.**
Steps: open the page. Remove a time off row from another tab (or call `DELETE /front-office/me/time-off/<id>`). Back in the first tab, click "Remove" on that row. Result: the server answers 404 "No such time off.", but there is no alert and no status text, and the row stays listed until a reload. The same happens for any refusal (403, 500).
Expected: the server's message, shown by the row or in the section.
Where: page:254 sets `problem`, which page:269 renders only inside the open "Add time off" form. If the form is open, the error shows there as "Not saved", which is the wrong action.

**M3. Keyboard focus falls to `<body>` after 7 actions** (DW6 says "keyboard-only").
Measured with `document.activeElement` after pressing Enter on:
- "Remove hours" (page:177; the button unmounts)
- "Add a set" → submit (page:83/223; no trigger to return focus to)
- "Delete" in the confirm (page:132)
- "Add time off" (page:261; the button unmounts and focus does not move to From)
- "Cancel" in the time off form (page:270)
- "Remove" on a time off row (page:282)
- Esc/Keep is fine; Save hours keeps focus as the notes say

Expected: focus moves to a sensible neighbour each time: the next row, the new set's heading, the From field, or the "Add time off" button.

**M4. Duplicate set names are accepted: by case, by spacing, and under concurrent creates.**
Steps: through the API and the "Add a set" dialog, create "Evening calls", "evening calls" and " Evening  calls ". All three are saved and the list shows "Evening calls" twice, identical to the eye. Five parallel `POST …/availability-sets {"name":"Race set"}` make five "Race set" rows.
Expected (STANDARDS §5 [M] uniqueness scoped to the parent, §4 [M] idempotent creates): one name per person, compared by meaning; a duplicate refused on "Set name". FO-3st3's host-set picker will show sets by name, so duplicates there cannot be told apart.
Where: svc:45 and svc:110-123 (no uniqueness check, no idempotency key); page:78-94. The rule belongs to FO-3a part 1b; the screen shows the effect.

## Minor

- **m1. 43 windows fail with no message.** Click "Add hours" 43 times, then "Save hours". The server answers 400 with `fields.windows` = "At most 42 windows in one set.". Nothing renders: page:190 hides the Notice for any `windows…` key, and page:136 only matches `windows.<i>…`. Expected: the message near Save hours.
- **m2. A set deleted in another tab leaves this tab stuck.** Save hours or Delete on it gives "Not saved / No such set of hours." with no Reload button (page:114 offers Reload only for `STALE_VERSION`), and the dead set stays in the list. Expected: Reload, or drop the set and say so.
- **m3. "Reload" after a stale save drops your own edits.** The Notice says only "Reload to see their changes" (page:191). The second tab's Tuesday 15:00 was gone after Reload with nothing to copy from. Expected: the wording says your edits will be replaced, or they are kept to re-apply.
- **m4. A window ending 24:00 shows a blank end.** The server accepts and returns "24:00" (svc:41), but `<input type=time>` cannot show it (page:175). The draft still holds "24:00", so a save keeps it, but the user sees an empty field and cannot enter 24:00.
- **m5. "Add hours" after a window ending 23:00 or later proposes 09:00-17:00** (page:27). That proposal overlaps the day's own hours, so the first save is refused with "These hours overlap.".
- **m6. The zone list has no "Asia/Kolkata".** The datalist has 418 names from Chromium's `Intl.supportedValuesOf`, which lists "Asia/Calcutta" (time.ts:15, page:156). A search for "Kolkata" (J-A5's zone) suggests nothing, and picking the suggestion saves "Times in Asia/Calcutta". Typing the full name works.
- **m7. "Change zone" cannot be cancelled.** Once opened, the field stays until a save succeeds or the page reloads (page:149-157). After "Mars/Olympus" is refused, the only way out is to fix the name or reload.
- **m8. Time off at a non-existent local time moves earlier.** Part day 14 Mar 2027 02:30-03:30 Toronto (the spring gap) is saved as 06:30Z, listed "01:30 – 03:30", which adds an hour (contract:24-28). Expected: refuse it, or move it to 03:30.
- **m9. "Whole day" keeps its last state.** After a part-day entry or Cancel, "Add time off" opens unticked; `reset()` does not reset `whole` (page:232, 237).
- **m10. Past time off is confirmed but cannot be seen.** Whole day 5 Jan 2026 shows "Time off saved." and is stored (`fo_time_off` row), but the list shows only `endsAt > now` (svc:185), so it can never be seen or removed. The same day saved twice gives two identical "Mon 1 Feb 2027 (whole day)" rows (svc:189).
- **m11. A deactivated colleague stays editable by URL.** The picker hides them, as the brief asks. But `?staff=<deactivated id>` opens them as "Another colleague", with no notice, and an Admin can save hours and add a set ("Ghost set" created) (page:52; svc:215-219 does not check status).

## What held

- **Stale save, two tabs** (same person, and Admin vs. the colleague): 409 shows "Not saved / Someone else changed these hours. Reload to see their changes." with a Reload button. The draft is kept until Reload, and the other tab's change appears after it.
- **Invalid zone:** "Mars/Olympus", "asia/kolkata", "EST", "" and " Asia/Kolkata" are refused on the zone field ("Choose a time zone such as America/Toronto."), and nothing else is saved.
- **Set name:** 81 characters → "Name must be 1 to 80 characters." on "Set name". Empty and spaces-only are refused. 80 × "é" and Arabic text are saved and wrap (no overflow). `<img onerror>` displays as text.
- **Roles:**
  - A Case Officer or Case Manager sees no picker, and `?staff=<id>` shows their own hours.
  - GET, POST and DELETE on `staff/:id/…` give 403 MISSING_PERMISSION for them.
  - `me/…` with another person's set id gives 404.
  - Another firm's id, or a non-uuid, gives "Could not load the hours / No such staff member.".
  - No token gives 401.
  - The deactivated person is not in the picker and cannot sign in.
- **Rapid double clicks and Enter twice:** "Add a set", "Save time off" and "Delete" each happen once. Two concurrent "Make default" calls leave exactly one default. Six concurrent first reads for a new person make one "Normal hours".
- **DST:** whole day 14 Mar 2027 is stored 05:00Z-04:00Z (23 h) and 7 Nov 2027 is 04:00Z-05:00Z (25 h); 13-15 Mar shows "(whole days)". Part day 7 Nov 01:00-03:00 is stored as 3 h.
- **Time off checks:** To before From (whole or part day) → "End must be after start." on To. Over 366 days → "Time off can be at most 366 days.". Empty From, or empty part-day To, is blocked by the browser's required check.
- **Layout and accessibility:** 375, 1024, and 720×450 (1440 at 200 %) have no horizontal overflow. axe (wcag2a/aa, 21aa, 22aa) finds 0 violations at 375, 1024, 720 and 1440. First view is 0.75 s.
- **Not applicable to this screen:** hostile uploads (none on it); 100 programs / 400 combinations (not this screen's data).
