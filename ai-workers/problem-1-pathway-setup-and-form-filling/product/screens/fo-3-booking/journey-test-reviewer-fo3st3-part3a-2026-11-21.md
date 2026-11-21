# Journey test (reviewer): FO-3st3 part 3a, Settings → Booking types, at 6b2a083c2 (PR #2718)

Reviewer role, skill `journey-test`, 21 Nov 2026 ~10:40 IST.
- **Where:** my isolated copy `review_fo3st3` on :4581, started with `PLATFORM_IDENTITY=local`, live AI off, US$0.
- **How:** headless Chromium driven like a person, plus database reads after each journey.
- **Scope:** concept r2 BR-19, §4, §5, §6 J-T1..J-T4. Timings and J-T5 belong to part 3b and are not scored.

**Score: 8.5/10, a pass (no criterion at 0).** The review still blocks on M1 and M2 (`review-fo3st3-part3a.md`).

## Journeys (persona · goal · result)
1. **Admin, main path:** "Set up a free consultation with a host on their evening hours."
   - On the screen: New booking type; name "Évaluation gratuite …", a description, Video and Phone, the host ticked, "Uses set" changed to "Evening calls"; Save type.
   - **Held:** "Added <name>." appears and the row shows "30 min · <host> · Yes".
   - Underneath: one type row, slug `evaluation-gratuite-…` (accent folded), modes `[VIDEO, PHONE]`, one host-set row with the chosen set, and one `booking_type.created` audit line.
   - Reopening shows "Evening calls". Setting it back to default deletes the row. A rename keeps the slug.
2. **Alternate, switch off in the panel:** untick Active, then tick it again. **Held:** the "Retired" pill and "No" appear, then go back to "Yes".
3. **Retire, Duplicate, Delete** (suite J-T2 plus my walk). **Held:**
   - Keep changes nothing.
   - Retire takes the type off `/book/sample-firm` and the booking stays.
   - "<name> (copy)" gets its own `-copy` slug.
   - Delete is soft (`deletedAt` is set).
4. **Empty and no host:** a type with no host shows "No host", and its preview says "This type has no host". **Held.** The empty list has no action button (m4).
5. **Errors:**
   - 1,001-character description → "Description must be at most 1,000 characters."
   - Used slug → "This web address is already used."
   - "Bad Slug!" → "Use lower-case letters, …"
   - No way to meet → "Choose at least one way to meet."
   - 81 characters → "Name must be 1 to 80 characters."; "manage" → "This web address is reserved."

   **Held:** each error is on its field, `aria-invalid` is set and the input is kept. There is no summary at the top (m3). An Arabic-only name saves with slug `type` (server rule).
6. **Preview as a booker** (J-T3).
   - **Held:**
     - A working Monday shows 09:00…16:30 in Toronto and 18:00 onwards in Asia/Dubai.
     - 25 Dec shows "Closed day".
     - Booking and audit counts are unchanged.
   - **Broke:** every open sends two requests and the list blanks back to skeletons between them. My J-42 run failed W0 on this (M2; `J-42/screenshots/W0-preview-1440.png` in my worktree).
7. **Wrong role** (J-T4):
   - **Case Manager, Case Officer and Read-only see values as text.** They get no New, Duplicate, Retire, Delete or Save buttons. Copy link, Copy embed code and Preview remain, which the `:list` key allows.
   - **Hosts show "1 host".** No route gives them names (accepted, m6).
   - **Server:** 403 on create, duplicate, switch-off, delete and host-set.
   - **Billing and finance:** no menu entry, and the URL gives the refusal sentence.
8. **Recovery:**
   - Stale save: the concept sentence and Reload, then the other person's values.
   - Double-click Duplicate → 1 row; double-click Save → 1 row.
   - Deleted in another tab, then saved here → "No such booking type."
   - Reload closes the panel and leaves the list intact.
   - Esc with typed edits closes the panel without asking (m2).
9. **Across the boundary (J-42 W0):** the Admin makes the type on this screen, and the public page books it (W1-W5 passed; W0's preview check failed, M2; W6 was aborted by a shared web rebuild from another copy, which is environmental). The timings are still database setup, with a HELD line (3b).

## Break pass (15 min)
- Duplicates under double-click hold, and two tabs hold.
- Long and non-Latin text: no sideways scroll, and the names wrap.
- Wrong role by URL and by API is refused.
- A suspended host is hidden from the editor but kept on the type (m6).
- Focus falls to `<body>` after the confirms, Duplicate and closing the preview (m1).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J-T1..J-T4 work on the screen. The allow flags a firm needs cannot be set (M1) |
| Next step obvious | 1 | One primary per area; Preview sits in Share; status line after each action |
| Plain words | 1 | Concept §5 words and the server's refusals; the additions are plain (n1) |
| Feedback and state | ½ | Status lines and Retired pill are good; the preview flickers (M2); edits dropped on Esc (m2); no summary (m3) |
| Correct data | 1 | One row each time, exact values, audit line, version +1, host-set row, 403s |
| Error recovery | 1 | Stale save with Reload, deleted elsewhere, field errors keep input |
| Accessibility and screen sizes | ½ | axe clean in every state; no sideways scroll at 400, 512@2x, 1024 and 1440; keyboard create works; focus lost (m1) |
| Speed | 1 | List 250-350 ms; save to row 121 ms; preview under 1 s |
| Visual quality | 1 | Team tokens, aligned table, calm panel (`fo3st3-panel-1024.png`, `fo3st3-read-only-1440.png`) |
| Trust and sources | 1 | No AI; "Nothing is booked." in the preview; the server's reasons are shown as given |

**Raises, most valuable first:**
1. Build the allow flags (task completed).
2. Load the preview once, or keep the earlier answer while it reloads (feedback).
3. Return focus after dialogs (accessibility).
4. Guard dirty Esc and add an error summary (feedback).

## Not tested
- A real screen reader.
- An intended user's unaided walk (D17, D20: the founder).
- Timings and J-T5 (part 3b).
