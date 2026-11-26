# Journey test: CS-NT1t, a person's own timeline (reviewer, 26 Nov 2026)

PR #3829 at **3069120aee22938a2c5b3d7ff8b0ae52c9c1e163**. Isolated copy `rv_csnt1t` on :4434 (never :4400), `AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`, stopped afterwards. Data: the builder's check ran first (one person on two cases, a won prospect, 120 paged upload lines, firm B's notes and a planted line). Then I walked it in Playwright Chromium, using only what a person sees (menu, links, keyboard) and a staff session for the sample firm's Representative. Script and screenshots are in the reviewer's scratch folder, not committed. No model call, US$0.

## Journeys (persona · goal · result)
1. **Main path, Representative at 1440.** Goal: "What has happened with this client across everything?" Steps: Clients (list in 1.1 s), click the person, read Timeline, Show older until the end. **Held:** first lines 197 ms after the click; 10 → 50 → 100 → 129 lines (64-150 ms a click); "That is everything for this client."; newest first; no duplicate-key warning, no console error. Wrong turn: 120 "Document uploaded" lines and several "Other change" lines say nothing about which case or what changed (`j1-client-1440`, `j1-timeline-end-1440`).
2. **Keyboard only at 1024.** Tab reaches the "Timeline lines" region (visible ring, `j2-region-focus-1024`) and Show older. Enter loads 10 → 50 and focus stays on Show older. **Held.** axe WCAG 2.2 A/AA on the whole client page: 0.
3. **200 % zoom (720 CSS px) and 375 px.** No sideways scroll at either. Show older is 32 px tall, a secondary action (≥24 px). **Held** (`j3-zoom200`, `j3-375`).
4. **Empty: a client with no cases, notes or prospect.** It shows "Nothing has happened for this client yet." Drawn, but it does not say what will appear (`j4-empty-1440`).
5. **Loading (read slowed 2.5 s).** A skeleton of fixed height. **Held** (`j5-loading`).
6. **Error (read answers 500).** It shows "The timeline could not be loaded" with the server's detail. There is no Try again; the only way back is a reload (`j6-error`).
7. **Wrong firm.** Firm B's Owner opening A's client sees "No such client" and no line (builder PT7, re-run by me). If the timeline alone answers 404, the words say "This case is not in the firm…", a case, on a client page (J7).
8. **Across the boundary.** A case number in Cases opens the case page. The case's own Notes and timeline panel still passes (`check_csnt1d_panel_browser.cjs` 53/53 on this head).

## Data underneath (API and SQL)
* `GET /api/runtime/clients/:id/timeline` read in 94 ms. Each line carries source, kind, who and when. Case lines carry `caseId`, and the person's notes and prospect lines carry `caseId: null`.
* Firm isolation: firm B's notes and the planted B line never appear. I also pointed `case_client.prospect_id` at **firm B's prospect** (planted): 0 prospect lines (`prospects.read` is firm-scoped), then I restored it.
* Inputs: `?cursor=a&cursor=b` → 400 "Give it once."; `?kinds=NOTE` → 400 "Only cursor."; `not-a-uuid` → 404 "No such client in your firm."
* Role keys: every seeded role holds both `agent/case:show` and `agent/prospect:show`, so the prospect read without the prospect key leaks nothing today (review Minor #7).

## Break it
* A 4,990-character Arabic note on the person, added with 201: it shows as two clamped lines with an ellipsis, laid out right to left inside `<bdi>`, with no sideways scroll at 1024 or 375. **The rest cannot be read anywhere** (Major; `b-rtl-375`, `b-rtl-1024`).
* Paging under 120 extra lines: each line once (PT4 and J1). No test covers repeats of note or prospect lines (Minor #5).
* Reload and double click: not walked. From the code, a reload starts again at page 1 (no saved cursor), and Show older shows `busy` while it loads (`case-notes.tsx` Show older button).
* Not tried: two tabs writing (the timeline is read-only); a hostile file (no upload here).

## Findings
* **Major:** prospect lines other than notes read "Other change" (engaged, won, calls), so the line does not say what (`person-timeline.ts:35`, `case-notes.tsx:24`).
* **Major:** a person's or prospect's note longer than two lines cannot be read in full (`case-notes.tsx:266`; the client page has no note list).
* Minor: case lines do not name their case; prospect lines are not marked as the prospect's. The 404 words name a case. The empty words do not teach. The error has no Try again.

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: every line is reachable to the end, newest first |
| Next step obvious | 1 | Show older, then the end line (J1, J2) |
| Plain words | ½ | "Other change" for prospect lines; case words on a client 404 (J7) |
| Feedback and state | 1 | skeleton, empty, error, busy Show older, end line (J4-J6) |
| Correct data | 1 | firm B never shown (also a planted cross-firm prospect), once, no skip over 120 lines |
| Error recovery | ½ | the error has no Try again; only a reload brings it back (J6) |
| Accessibility and screen sizes | 1 | axe 0, keyboard path, 200 %, 1024 and 375 px with no sideways scroll |
| Speed | 1 | read 94 ms; first lines 197 ms; Show older ≤150 ms |
| Visual quality | ½ | walls of "Other change" and grey kind tiles; long notes clamped with no way to expand |
| Trust and sources | ½ | a line does not say whether it came from a case (which one), the prospect or the person |

**8/10: pass (8 or more, no criterion at 0).** What would raise it most: words for prospect lines (plain words, visual quality); a case or prospect label on each line (trust); Try again on the error (recovery).

Could not test: a real screen reader; an intended user's unaided walk (D17 and D20 stay with the founder); writing a person's note from a screen (there is none; part 3 is API only, outside this row).
