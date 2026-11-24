# Journey test (reviewer): FO-3v part 1, video meeting links (R1.112), PR #3418 at ba232f8bd

Reviewer role, 24 Nov 2026. No page in this part: the My account → Video panel (DW7) moved to part 1b (P-610), so the journeys use the API, the way the panel and the public booking page will call it. Isolated copy `runtime_rev` on :4436 (`PLATFORM_IDENTITY=local`, fresh database, Sample seed). It was stopped afterwards; :4400 was never used. Sign-in used the local stand-in (`POST /api/platform/session/local`). Script: the scratchpad `fo3v_journey.mjs` (not committed). US$0, no model call.

## Journeys (persona · goal · expected)
1. **Main path.** Case Officer (user-O, no extra keys): "I want my video bookings to use my Zoom room."
   - Expected: GET shows empty settings. `zoom.us/j/1234` is refused with AG-4-58's words. `https://zoom.us/j/1234567890` is saved, with the choice pre-set to My meeting link.
2. **Booker, Video.** Ana books the Sample free consultation on `/book/sample-firm`. The host is the Owner, whose Sample My meeting link the seed sets.
   - Expected: the confirmation answer, the manage view, the email and the `.ics` LOCATION all carry the host's link.
3. **No source.** The Owner clears his link, then Bea books Video.
   - Expected: the booking is made and the email says "Your join link will follow." The host gets exactly one item.
4. **Wrong person.** The Case Officer sends `staffId` = the Owner's id, and the second representative sends `userId`. Also tested: no sign-in, another firm's Owner, and a path with an id.
   - Expected: 403 for the two bodies with nothing changed, 401, own data only, and 404 for the path.
5. **Reschedule by link.** Ana moves her booking. Expected: the link is kept.
6. **Cancel by link.** Ana cancels. Expected: `joinLink` is null and the row's `voided_at` is set.
7. **Recovery.** The same save twice, then a reload. Six first saves at once. Two tabs (one saves, one clears).
8. **Deactivation (screen boundary to Team).** The Owner deactivates the second representative through the product's own route (as `xr_app`, behind PF-12's wall). Expected: her saved link is gone.
9. **Data underneath.** Rows in `fo_video_pref`, `fo_booking_video`, `msg_notification`, `msg_outbox` and `audit_event`, plus the copy's `api.log`.

## What held
- **J1** holds:
  - 422 with `fields.myMeetingLink` = "Enter a full link starting with https://", and detail "…Nothing was saved.";
  - the save returns `sourceChoice: "MY_LINK"`, `sources: ["MY_LINK"]`, `zoomAvailable: false`;
  - a repeat save writes no new audit line (exactly 2 lines: "Meeting link changed.", "Video choice changed.").
- **J2** holds:
  - 201 with `joinLink` = `https://meet.example/sample-room` (105-158 ms). The manage view and `/ics` (LOCATION) carry it too.
  - The demo inbox shows "…Video call. https://meet.example/sample-room".
- **J3** holds:
  - 201 with `joinLink` null, and the email reads "Video call. Your join link will follow.";
  - exactly one `msg_notification` row (`video-link-needed`, group NEEDS_YOU, item booking) for the Owner, so the real NotificationPort is wired in the running app;
  - see F1 for what the host actually sees.
- **J4** holds: 403 `OWN_RECORD_ONLY` twice with both rows unchanged; 401; the solo firm's Owner reads only his own (empty) settings; `GET …/me/video/<id>` gives 404.
- **J5** holds: 200, and the link is kept after the move.
- **J6** holds: 200 with `joinLink` null and `voided_at` set.
- **J7** holds:
  - six parallel first saves give six 200s and one row;
  - save against clear ends consistent (link and choice set together);
  - JSON `null` gives 400 `BODY_NOT_JSON`, and an array gives 422.
- **J8** holds at this head: 200, and the row count went from 1 to 0, in the deactivation's own transaction. The trigger fails PF-12's guard at this head, though; see the review, M1.
- **J9** holds: `audit_event` holds none of the four test URLs (summary + detail). `api.log` (103 lines) holds none of them either.

## Break it (15 min)
- **Refused with 422:** `javascript:alert(1)`, `https://x.example/a\nLOCATION:evil`, U+2028 inside, `https://user:pw@…`, `HTTPS://…`, a leading or trailing space, a no-break-space host.
- **Saved:** `https://例え.jp/会議室?名前=ア,b;c`. The `.ics` escapes `,` and `;` (ics.ts:27).
- **Length:** 2,048 characters of accented text is saved, and 2,049 is 422, because both the API and the database count code points.
- **Not tried here:** look-alike characters and a two-session lost update. Both are in the breaker's report (`break-report-fo3v-part1.md`, m1 and m3).
- **My mistake, not a finding:** my Phone booking took 409 because I picked a slot overlapping my own earlier booking. The row's check covers Phone (DW2 fail line).

## Findings
- **F1 (Minor; review m1).** The host's one item exists but cannot be read. `GET /api/platform/me/notifications/items` returns `label: null, link: null`, so the bell shows "Something needs you" (web `notifications/contract.ts:30-36` has no `video-link-needed` words). Home's `GET /api/platform/me/needs-you` lists only `MY_DEADLINES` (store.ts:92), so it is empty. AG-4-29 rule 7 asks for "Add a video link for <booker>'s <time> call" on the home screen. The brief limits this part to the port lines and DW3's count, so this is recorded as a gap.

## Score (each 0 / ½ / 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J3, J5, J6 and J8 complete through the product's own routes |
| Next step obvious | ½ | The refusals say what to do, but the no-source host's item has no words or link (F1) |
| Plain words | 1 | AG-4-58's exact error words; "You can change only your own video settings."; "Your join link will follow." |
| Feedback and state | 1 | Each PUT answers the new state (link, choice, sources); GET after a reload matches |
| Correct data | 1 | One row per person; voided on cancel; provider `MY_LINK`; audit lines without the URL |
| Error recovery | 1 | Nothing saved on any refusal; repeat and parallel saves are safe |
| Accessibility and screen sizes | 1 | N/A: no page in this part (DW7 is part 1b) |
| Speed | 1 | PUT/GET 11-44 ms; a booking 105-158 ms on the Sample data |
| Visual quality | 1 | N/A: no page |
| Trust and sources | 1 | No AI. Each link records its source (`provider`, audit "source: my link"); the type's link is never used |

**9.5 / 10: pass** (8 or more, no 0). To raise it: give the host's item its words and a way to open it (F1), in part 1b or FO-3vm.

## Not tested
- The page (part 1b).
- A real screen reader.
- A real Cognito sign-in.
- An intended user's unaided walk (D17 and D20 stay with the founder).
- `check_fo3w_booking_browser.ts` (no Playwright browser on this machine).
- The PR body (no GitHub access from this session).
