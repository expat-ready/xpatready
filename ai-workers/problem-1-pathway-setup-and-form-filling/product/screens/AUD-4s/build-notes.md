# AUD-4s — build notes (part 2: the page; R1.88)

Built from `concept.md` (C1–C9) over `concept-draft.md` and `design/draft-1.html`, on AUD-4's merged routes (#2339). No API change, no migration, no new technology.

## Files
* `prototype/studio/web/src/modules/platform/audit/contract.ts`: the one zod parser of AUD-4's answer, and the pure helpers (filters and the address, days in the log's zone, the read-back sentence).
* `…/audit/activity-log-page.tsx`: the page. One line each in `platform/routes.tsx` and `platform/account-sections.ts` (C5).
* `prototype/studio/tests/check_aud4s_activity_log_browser.ts` (44 lines, each case with a pass and a fail), `tests/journeys/j_88.ts` (the same walk under R1.88's number for automatic proof), `web/src/MODULE.rows/AUD-4s.md`.

## Top 5 production improvements over the board
1. The When cell is a real disclosure button (`aria-expanded`, `aria-controls`); the long summary is one line with the change under it, and in full on the open row.
2. Below 640 px the Who and Area columns fold into the line, so 375 px has no sideways scroll, of the page or of the table.
3. While the next answer comes the last list stays, dimmed and `aria-busy`, with the sentence already reading the new filters.
4. Export CSV keeps the focus (it is `aria-disabled`, not disabled, while the file comes) and focus returns to it after the confirm.
5. After an export every cached list of the log is asked again, so the export's line shows under any filter that matches it.

## Where the merged API differs from the concept's contract (the page follows the API; each is in the PR)
* The shortcut's filter is `ours=1` (the concept says `staffAccess`). A refused filter is 422 with the field named (the concept says 400).
* A line's `who` is words. Under a support session the API says "ExpatReady support" (C4 says "ExpatReady staff" everywhere). The page shows the API's words, so the page and the CSV agree; the line also carries a "Support session" mark. No actor word maps to `OUR_STAFF` today (`aud_event_actor_type`), so "ExpatReady staff access" lists support-session lines only. Question for the tech lead on the PR.
* The answer lists seven areas (C7's five plus "Configuration" and "Other"); the Area filter offers the API's list.
* **C9, the zone:** AUD-4's answer, `/me` and every read an `agent/audit:read` holder may call carry no `platform.time_zone`. The page shows every time in **UTC** and says so once in the sentence (never the browser's zone); the CSV's times are UTC too ("When (UTC)"). The parser already accepts an optional `timeZone` on the first page: when AUD-4 adds it the sentence, the times and the day boundaries follow it with no page change (tested with a stand-in answer). Question for the tech lead on the PR.

## Mock and real
Everything is real: the firm's own lines, the real routes, the real export. The check's lines are Sample rows written into its own isolated copy. No demo chrome. No AI. Cost US$0.

## Not built here (by the concept)
* The integrity pill and every word about integrity: C2, row AUD-4s-i. The task brief's "integrity line in both states" is that row's, not this one's.
* Session start, end, duration and reason of a support session: AUD-3b writes them (SA-2-29 met in part; the page says so under the shortcut).
* C8 Minor 8: §4b's Unverified lines (Clio, 1Password, Atlassian) are not re-read from this cloud copy (their help hosts are not reachable here); Clio's "Beats" line is out of the PR body. For the Mac before the label, or the Lead's ruling.

## Checks run
`check_aud4s_activity_log_browser.ts` exit 0 (44/44) on a fresh isolated copy; `j_88.ts` exit 0 by its header line (the recorded walk needs ffmpeg, which this cloud container lacks; GitHub's runners have it). axe-core WCAG 2.2 A/AA clean on every state; 375, 1024 and 1440 px; keyboard-only walk. Type-check clean.

## Honest self-score
Standards met as far as checked: keyboard, focus order, names, contrast (axe), states (loading, empty, first use, refused filter, load error, too large, no access, session ended), no silent filter. Known gaps: times are UTC until the zone field exists; the first-use state ("No activity yet") is not reachable on a signed-in firm (signing in writes a line) and is covered only by reading the code; D17 and D20 need an intended user and are not self-awarded.
