# qa capability R1.69: read log, fingerprint, keep-period reminder (24 Nov)

**Run:** `/qa capability R1.69`, cloud qa copy, Opus 5.5 medium, live AI off, US$0. Tested on main bdcf1e7be, after CS-D6 part 1 (#3203) merged; the local runs were on f0bc60179. Isolated copies only; :4400 not touched.

**Verdict: Partial** (was Not built). Two parts of the Done when are not built (P-606).

## What is left, exactly
1. **The list "Documents past their keep period"**: closed cases only, past the firm's keep period, none for a firm with no period. This is the CS-D6 row's keep list, which was not in part 1: `GET /api/runtime/documents/past-keep-period` answers 404 "Cannot GET".
2. **The weekly keep-period reminder**: CS-D6 with PF-14's notifications, at most once a week per person and document, and never about an open case. `api/src/documents/keep-period.ts` is not on main.

Dispose (CS-D6 part 2 with CS-X3) is not part of this row's Done when.

## Evidence
| What | Where | Result |
|---|---|---|
| j_69 as it stood, on main | walks.yml 45317096702, job 138186648063, on f0bc60179 | 12/21: journey drift plus the two missing parts |
| j_69 aligned to CS-D6 part 1 as merged (this PR) | walks.yml 45319610637, job 138194949752, on 434a050f5 (main bdcf1e7be plus j_69) | 18/21; the 3 FAILs are the two missing parts |
| The same, locally | fresh isolated copies of f0bc60179, run twice | 18/21 both times, the same 3 FAILs |

**The drift, which was in the journey and not the app.** j_69 was written before #3203 and guessed three things wrongly:
* CS-D6's routes sit behind PF-4's guard, so they need a staff session (bearer), not `x-actor`.
* The list answers `{ document, lines[] }`.
* "Read by" and the fingerprint appear in the line's ⋯ → "File details…" dialog, which asks for the staff sign-in inline.

What the alignment changed:
* The Owner, the Case Officer and the other firm's Owner sign in.
* The checks read `lines[].who` and `action`.
* The screen steps open File details.
* The unchanged checks became exact: `unchanged === true`, and `false` with a different `found_sha256`. Before, they were regex matches.
* Because there is one session per person (PF-4), the dialog's sign-in ends the script's own Owner session, so the script signs in again before W4.

One assertion changed to match the built design. A client is not staff, so the reads route answers the client 401 (no staff session), not 403. The step now also requires the Case Officer, who has no view-access-log key, to get 403, and checks that none of the three refused callers sees a line. This is no lower a bar.

## Held (18 steps)
* **Each read writes a line (W1).** Three reads write exactly three "viewed" lines, each naming who, which document and when. The client (403) and another firm (404) read nothing and write no line.
* **Read by (W2).** The Owner's list returns every read, newest first, through the API and on screen in File details. The Case Officer gets 403, the client 401 and another firm 404.
* **Fingerprint (W3).** The stored SHA-256 equals the hash of the uploaded bytes in the database, the upload's answer and the checklist. File details shows it in full.
* **A changed file is caught (W4).** An edited file is refused on read (409, "changed on disk") and writes no line. "Check the file is unchanged" says unchanged for the intact file and changed for the edited one, with one audit line each.
* **Keep period (W5, first half).** The Owner saves "Keep closed client files for 6 years", and KeepPeriodPort reads 6 from the firm setting.
* **Sizes (W7).** 400, 1024 and 1440 px, axe clean, no page error.
* **Gate A (W8).** The walk ends at R1.70's first step: the document on its line in the Documents panel.

NOTE, not counted: opening a document from the panel is CS-D5's (R1.68), and no open control is on the line yet.

## Bugs
None in the app.

## Questions for the Lead
None. The two remaining parts are already in CS-D6's row (the keep list; the reminder waits on PF-14).

## Suggestions
* *Needed for the proof · Capability:* the CS-D6 keep list and the weekly reminder, as one small runtime PR each. j_69 W5 and W6 then turn green with no journey change, unless the paths differ; the keep-list path is j_69's guess and the brief names none.
