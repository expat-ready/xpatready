# PF-31 journey test: reviewer, 23 Nov 2026

Isolated copy `rvpf31` on :4741 built from web head `5247924c9`, on API `8b95408e9`. Live AI off, US$0. I signed in as the Sample Owner/Representative (local identity). Playwright ran headless Chromium at 1440, 1024 and 400 px, and at a 512 px CSS viewport ×2 (≈1024 px at 200 %). The builder's scripted check `check_pf31_multitab_browser.ts` passed 45/45. My probes: `tests/rv_probe_pf31.ts`, not committed.

## Journeys (persona: firm Owner or representative working several items)
1. **Main.** Open Offices, then Edit an office: it opens in its own tab, focused on the name. Type, then Save: one PATCH with If-Match, then a toast. *Held* (K1 55 ms; T4). After Save the edit tab stays open behind the list and its panel comes back (Q1; review Must 2).
2. **Alternate.** Ctrl-click Team and an office: both open as background tabs, and the address bar stays put (T1). Edit the same office again: the existing tab is focused, with no duplicate (T2). *Held.*
3. **Two records.** Type in office A and in office B, then switch between them: each keeps its value and shows a dot (T3, P4). *Held.*
4. **Reload.** Tabs, the active tab and the draft all come back (T6). *Held.*
5. **Second window.** The draft is mirrored both ways, the line reads "also open in 1 other window", one save, and the other window reads the record again (T4, T8). *Held.*
6. **Error (conflict, same field).** Save → 409 → both values shown → Keep mine → Save gives one 200 (T5, T8). *Held.*
7. **Error (conflict, different field).** I renamed the office while a colleague changed its time zone. Keep mine → Save **reverted the colleague's time zone** (P1; Must 1). *Failed.*
8. **Close a dirty tab.** The app asks; No keeps the tab, Yes drops it and its draft (T7). The 13th tab is refused with a message (T7). *Held.* Focus then lands on `<body>` (P3).
9. **Keyboard only.** Enter on Edit opens the tab and focuses the field (K1). Arrows, Home/End and Alt+PageUp/Down move between tabs (T10). After Delete or Alt+PageDown, focus is lost (P3/P4).
10. **Recovery: Back.** Back/Forward bring forward the tab that shows the address (P5). *Held.*

## Data underneath
Each save is one row change, and the phone audit line is kept (unchanged code path). Every 409 left the database untouched (T5, T8, T9). J7 wrote a value nobody typed in this session (the old time zone).

## Break it
* Two windows saving the same record: 409 with the conflict state. Correct.
* Different-field conflict: lost update after Keep mine (Must 1).
* A GET with If-None-Match after the body changed: stale 304 (firm profile; Must 3).
* `If-Match: *`, a list, a weak tag or a mismatched body: 422 in words (T9).
* Wrong route with If-Match: 422 (T9).
* Long names wrap in the conflict table (`overflow-wrap:anywhere`).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J6 finish; data saved once |
| Next step obvious | ½ | Close/Save leaves the edit tab open and its panel returns (Q1) |
| Plain words | 1 | "Someone else saved this first", "Keep mine, then Save", "12 items are open, the most at once" |
| Feedback and state | ½ | Dot, draft line and conflict table are good; the conflict is not announced or focused (K2) |
| Correct data | ½ | Keep mine reverts another person's field (P1) |
| Error recovery | ½ | The conflict can be recovered, but the default "keep mine" clobbers; Close loop |
| Accessibility and screen sizes | ½ | axe clean (strip and conflict); no sideways scroll at 400, 1024 and 200 %; no tabpanel; focus lost; 20 px × |
| Speed | 1 | Edit→field 55 ms; mirror 2–4 ms |
| Visual quality | 1 | Team look; the strip sits under the header and the panel below the strip (screenshot k-conflict at 1024 px) |
| Trust and sources | 1 | Both values shown, with who saved first stated; nothing saved before Save |
| **Total** | **7.5 / 10** | **Below pass (8)**, no criterion at 0 |

Fixes that would raise the score, most valuable first: a three-way Keep mine (correct data, error recovery); close the edit tab when its panel closes (next step); focus the next tab or a heading and announce the conflict (feedback, a11y); tabpanel roles and a 24 px ×.

Not tested: a real screen reader, Safari/Firefox, and an intended user's unaided walk (D17/D20 stay with the founder).
