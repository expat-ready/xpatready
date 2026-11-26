# PF-22v journey test: reviewer, 26 Nov 2026 (API only)
Commit `0cfb49afd19945dd638146427fec577ef8bc47c9`. This part has no screen, so I walked each journey as the HTTP calls the PF-22s screen will make. The harness is a copy of `check_pf22v_saved_views.ts` in the scratchpad: a Nest app on a random port (never :4400), and a scratch database on 127.0.0.1:54329 that was dropped at the end. The personas are Sample staff of `sample-firm`, with EVERYONE_SEES_ALL off (each Agent sees their own).

## Journeys (main path first)
| # | Persona and goal | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Agent: "show me my Maple Law referrals and keep that" | `GET prospects?cf.referral_partner=Maple Law`, then `POST saved-views` (personal), then `GET saved-views` | only their prospect; the view listed under Your views | Held (V8, V2) |
| 2 | Admin: share "All open"; Agent opens it | POST shared, then Agent `GET saved-views`, then `GET prospects?<applies>` | Agent sees only their own | Held (V3) |
| 3 | Admin: share "Web form leads"; an Agent with no web-form lead opens it | POST `{view:all, source:Web form}` shared, then Agent opens `applies` | their own rows or none, never an error (challenge M3) | **Failed: 422 UNKNOWN_SOURCE** |
| 4 | Admin archives the field a view uses | archive with confirm, then `GET saved-views` | "1 filter part no longer applies", the rest applied | Held (V8) |
| 5 | Agent filters Budget 1000 to 2500.75 | `GET prospects?cf.budget=1000..2500.75` | rows in range | **Failed: 422 "Type a number, for example … 2500.50."** |
| 6 | Agent saves a view with a typo'd source, view or date | POST `{source:"No Such Source"}`, `{view:"bogus"}`, `{from:"31/31/2026"}`; also `{type:"SPACESHIP"}` on fo.prospects | 400 naming the part | **Failed: 201 each.** Opening the view then gets 422. |
| 7 | Wrong role: Agent shares, renames or deletes a shared view | POST shared, PATCH, DELETE | 403 SHARE_NOT_ALLOWED | Held (V3) |
| 8 | Wrong firm: firm B lists or patches firm A's view | GET, PATCH | none listed; 404 | Held (V7) |
| 9 | Recovery: double click on Save; two admins edit one shared view | 2 parallel POSTs; 2 PATCHes | one view; second edit gets 409 | **Failed: 2 rows; silent overwrite** (no version) |
| 10 | Clear a view's sort | PATCH `{sort:null}` | sort removed | **Failed: sort kept** |

## Break it (15 min)
- An oversized filter (40 sources × 500 characters) got **500**, from the database check.
- A repeated or empty text value is refused with misleading words.
- `cf.budget=0x10..` is read as 16 (harmless).
- A shared "Unassigned" view opened by an Agent who has `view.all`: 200 (correct).
- Firm walls and 404 for another person's view: held.

## Data underneath
- One audit line for each create, change and delete, recording only the filter's keys (V2, V6).
- The leaver's shared view stays, shown inactive (V6).
- The stored filter stays unchanged while `applies` drops the part (V4).
- The double create left 2 rows in `plat_saved_view`.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1, 2, 4: filter, save, share, archive and dropped part all work |
| Next step obvious | ½ | `canShare`, `canChange` and `droppedLine` are given, but journey 3 ends in an error with no next step |
| Plain words | ½ | The dropped cf reason reuses error text ("Choose from the listed choices…"); journey 5's message suggests the very value it refuses |
| Feedback and state | ½ | A 500 on an oversized filter; a 422 on opening a saved view |
| Correct data | ½ | Unusable filters stored (journey 6); duplicate views (journey 9) |
| Error recovery | ½ | Stored filter kept until Replace (good); no version, so edits are lost silently (journey 9) |
| Accessibility and screen sizes | N/A | No screen in this part |
| Speed | 1 | 22 views listed in 44 ms; list filters well under 200 ms (N+1 noted for 200 views) |
| Visual quality | N/A | No screen in this part |
| Trust and sources | 1 | Owners and creators labelled, "Former staff member" shown, audit lines, dropped parts named |

**5.5 of 8 scored criteria, which scales to 6.9 / 10. Below the 8 pass mark** (no criterion at 0).

## Fixes that raise the score, most valuable first
1. Keep a source part for a `view.own` viewer (challenge M3): next step and correct data.
2. Check the values of `view`, `type`, `from`/`to` and `source` at save: correct data and feedback.
3. Add `version` on PATCH/DELETE and `requestId` on POST: error recovery and correct data.
4. Fix the decimal range split; add a length limit on the filter: plain words and feedback.

## Could not test
- A real browser walk, axe, 400/1024/1440 px and the keyboard: there is no screen yet (PF-22s).
- A screen reader.
- An intended user's unaided walk (D17 and D20 stay with the founder).
