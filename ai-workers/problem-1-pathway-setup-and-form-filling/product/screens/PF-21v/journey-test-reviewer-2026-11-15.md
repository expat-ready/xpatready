# PF-21v journey test (reviewer role), 15 Nov

This tests commit c799e5fa0 of PR #1848. **There is no screen yet** (PF-21s builds it), so the journeys are API journeys over HTTP, taken by the screen's future users through PF-4's real guard:
* the Nest app built from the feature's classes (the suite, and my probes on a scratch worktree, on port 0);
* the real `main.ts` on an isolated copy at :4438 (PF-4 part B, 118/118).

:4400 was never touched. US$0.

## Journeys
1. **Owner, "who is late, and who has it?"** The list (`view=all`, `overdue`) shows `businessDaysLeft`, `people` and `firmTimeZone`. Every handler and recorder is named, including the deactivated leaver.
2. **Owner, one complaint's history.** `GET /:id` names every actor and both sides of the handler change, and leaves the system actor out.
3. **Case manager, "who can I give this to?"** `GET /handlers` returns the 11 active staff, `{id, displayName}` only, by name.
4. **CASE_OFFICER handler, "my own complaints".** They see only their own, with names only from those rows.
5. **Wrong role.** CASE_OFFICER, BILLING_FINANCE and READ_ONLY on `/handlers` get 403 `MISSING_PERMISSION`. `/HANDLERS` and `/handlers/` get the same.
6. **No token or a junk token.** 401 `NOT_SIGNED_IN` / `TOKEN_REFUSED`.
7. **Wrong firm.** Firm B's Owner gets firm B's 2 staff and their own zone. Firm A's answers never carry `Asia/Kolkata`.
8. **Moved off a complaint.** Recovery case: once the CASE_OFFICER is moved off, the complaint is gone from all four of their views, `people` is `{}`, and `/:id` gives 404 with no `people`.
9. **The due week, across DST.** Every 6 h in Toronto's November change week: 2…2, 1, 0, then −1 (overdue) from the due evening, −2, −3. The sign always matches `overdue`.
10. **Across the boundary to PF-21s.** Everything the screen needs is in one answer:
    * a name for each id;
    * the zone to show dates in;
    * a signed day count;
    * the choices for the handler form.

    The browser does not need to work out any rule itself (STANDARDS §7).

## Data underneath
* The values come from the database and settings: the zones and closed days I wrote with `writeSetting` showed up in the answers.
* The handler list matches `platformStaff` with `status = ACTIVE` under `firmScope`.
* The suite found 3 setting reads per request.
* The changes I made (record, handler change, note) each wrote their events. Reads write nothing.

## Break it
* **Name leak through `people`.** Covered by journeys 4 and 8, and mutation 2 in `review.md`. None found.
* **Keyless caller, another firm's staff.** Covered by journeys 5–7, plus the service's own 403. None found.
* **Time-zone edges.** I tried +14, −11, +5:30, −3:30, Lord Howe's 30-minute DST, and both Toronto DST changes. All correct.
* **Old overdue rows.** 100 complaints overdue for about 26 years take 1.3–1.6 s per list (minor m2). That is outside the sample data.
* **A firm with no opening days.** It reads 0 for three days (minor m3).

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1–4 and 10 return all four fields |
| Next step obvious | 1 | `/handlers` gives the handler form its choices; `people` names everyone shown |
| Plain words | 1 | "Choosing a handler needs the permission to record complaints." |
| Feedback and state | 1 | Three clear states: `null` (done), ≥ 0 (left, 0 = due today), < 0 (overdue) |
| Correct data | 1 | Due-week sequence, the zones, deactivated names kept |
| Error recovery | 1 | Consistent 401/403/404; a moved-away complaint disappears cleanly (journey 8) |
| Accessibility and screen sizes | ½ | N/A, no screen (PF-21s) |
| Speed | 1 | `/handlers` 6 ms, list 12 ms on the sample data |
| Visual quality | ½ | N/A, no screen |
| Trust and sources | ½ | Every value is the server's own, but the overdue clamp (−1 on the due evening) is a builder reading still waiting for Lead B's confirmation |

**8.5/10, pass (8 or more, no 0).** The two N/A halves are mine, since there is no screen. To raise it:
1. Lead B confirms the overdue rule in the brief.
2. PF-21s's own journeys at 400, 1024 and 1440 px with axe.

**Not tested:** a real screen, a screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).
