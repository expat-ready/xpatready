# PF-30s build notes

* **Retrofit mapping (team names → ours):** the team's product has no find box in its top bar (AG-02 names Cmd+K as the command launcher, which stays theirs). Ours: `FindBox` in `web/src/modules/platform/find/`; it uses the team's tokens and the `Input` look from `components/ui/controls.tsx` (same height, border, focus ring), and lucide's `Search` and `X` icons as every other control here.
* **Where it sits:** PlatformFrame and SalesFrame controls (the two frames with a staff bearer token). The Studio and Cases frames act as simulated people with no staff token: no box there (concept §6b).
* **Reads:** only `GET /api/platform/find?q=` (PF-30a, #2884). Kinds with words: person, prospect, company (PF-30a's finder), case, case_person (CS-S1 part 2's, #2913).
* **Rounds:** challenge r1 → concept r2 (`challenge.md`); review round 1 (`review.md`, Changes: M1 640-719 px) and break round 1 (`break-report.md`, Changes: M1 = review's, M2 marked row out of view, M3 Tab under the bar): all fixed with a test each in `tests/check_pf30s_find_box_browser.ts`.
* **Not here (for their owners):** PF-30a finds Cyrillic and Hangul names only by email, and lead numbers (L-…) not at all (break report "Outside this PR"); the case finder is #2913.
