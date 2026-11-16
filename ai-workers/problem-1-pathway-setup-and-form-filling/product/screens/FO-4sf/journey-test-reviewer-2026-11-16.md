# FO-4sf journey test (reviewer), 16 Nov

Commit `036a5a78` (code identical at `282dc487a`), isolated copy `review_fo4sf` on :4436, headless Chromium driven like a person (clicks, keys, reading the page), `PLATFORM_IDENTITY=local`. Data made through the product's own doors: a visitor sent the hosted web form at 375 px (lead `Wren…`, source "Website form"); the Case Manager added two by hand through `POST /api/front-office/leads` (Leads has no Add panel yet): `Ada…` source "Referral", `Bo…` source "Phone call"; the Case Officer added `Cy…` "Walk-in". Script (scratch, not committed) replayed twice; the builder's suite is the committed replay (22/22).

## Journeys (persona · goal · result)
| # | Who · goal | Expected | What happened |
|---|---|---|---|
| J1 main | Case Manager · "show me the leads we typed in" | Added by hand narrows the list | Done in ~0.37 s; Ada and Bo shown, Wren gone. **Their Source column reads "Referral", "Phone call"** under a pressed "Source: Added by hand" |
| J2 alternate | Same · add web form, reload | Both kinds, kept | `?source=WEB_FORM,MANUAL`; after reload both chips pressed, three rows |
| J3 alternate | Manager · "everything from referrals" (AG-2-23 field 2) | A Referral choice | **None**: choices are Web form, Added by hand, Booking only |
| J4 boundary | Open Ada from the filtered list, go back | Filter kept | Lead page Source = "Referral". Browser Back keeps `source=MANUAL`; **the app's Leads link goes to `?view=all`, filter lost** |
| J5 empty | Booking only | Plain empty state | With no booking lead in view: "No leads from Booking here. Choose All sources to see every lead." No product path makes a booking lead yet |
| J6 error | Hand-typed `?source=` | 400 naming allowed; screen ignores junk | API `FAX`, `Referral`, `WEBSITE` → 400 naming WEB_FORM, MANUAL, BOOKING; address `FAX,MANUAL` → only Added by hand pressed, no error |
| J7 wrong role | Own-only Case Officer, `source=MANUAL` | Only own leads | Only Cy; DB: 0 rows owned by someone else |
| J8 keyboard + sizes | Tab to Web form, Space, Tab to All sources, Enter at 1024 and 720 px (200 % of 1440) | Usable, no sideways scroll | 8 / 7 tabs, focus ring visible, focus stays on the chip, clear works; axe 0 violations; no sideways scroll |
| J9 recovery | Double-click Booking | No flicker or double request harm | Ends with Booking on; one list shown |
| J10 search | Search "Wren" under Added by hand | Told why nothing shows | "No lead matches “Wren…”." with no mention of the source filter |

## Data underneath
Filter reads added no audit line (the only 2 new lines: Cy's add and the setting change); every other lead row unchanged (hash equal). Server enforced visibility (J7) and refused unknown values (J6).

## Break-it (15 min)
Comma list, repeated key, blank value, wrong case, `source[a]=b` (ignored, 200), bad view + bad source (400), very long junk (message bounded at 200 chars): all held. Widening mutation (OR for AND): 7 suite lines fail, so the visibility rule is guarded. Severity of findings: **Blocker 1** (source vs door), Minor 2 (Leads link drops filter), Minor 3 (search line silent about filter).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Narrows by arrival path; cannot narrow by the source a person sees (J1, J3) |
| Next step obvious | 1 | Chips beside the view chips; All sources appears when needed |
| Plain words | ½ | "Source" filter and "Source" column mean different things (J1) |
| Feedback and state | 1 | Pressed chips, address, empty state with a way out (J2, J5) |
| Correct data | 1 | Exactly the door's rows, inside visibility, nothing written (J7, data) |
| Error recovery | ½ | Reload and browser Back keep it; app Leads link loses it (J4) |
| Accessibility and screen sizes | 1 | axe clean 1440/1024/720; keyboard path; no sideways scroll (J8) |
| Speed | 1 | ~0.37 s click to list |
| Visual quality | 1 | Same chip style, wraps cleanly at 200 % |
| Trust and sources | 1 | No AI; the row shows its origin |
| **Total** | **8.5 / 10** | Pass by score (8+, no 0); the review still blocks on Blocker 1 |

Fixes that raise the low criteria, most valuable first: filter the lead's stored source (task, words); keep `?source=` on the app's Leads link (recovery).

**Not tested:** a real screen reader; an intended user's unaided walk (D17/D20 stay with the founder); a real booking-made lead (none exists in the product yet).
