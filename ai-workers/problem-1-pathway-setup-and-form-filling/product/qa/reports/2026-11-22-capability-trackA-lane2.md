# qa capability — Track A lane 2: R1.10, R1.88, R1.102, R1.23, R1.104 (22 Nov, A286)

Second Track A qa lane (founder's ask A286; Lead 4's brief, 14:3x IST). Cloud copy, Opus 5.5 medium (P-788); isolated copies :4470-:4474 only (never :4400); live AI off; US$0. Branch `claude/upbeat-ptolemy-i8mytx`.

## Journeys
All five were already on main before this lane started (no new journey written; duplicate check re-run 14:3x IST):
| Journey | Last commit on main | Row |
|---|---|---|
| `j_10.ts` | 1b158c73c (06:27) | R1.10 checking every input |
| `j_88.ts` | ef3ab4f2e (06:14) | R1.88 the firm reads its audit log (#2916 also touches J-88: "J-88 joined and walked") |
| `j_102.ts` | 7732dfcc6 (05:58) | R1.102 find a person or case |
| `j_23.ts` | 86251ebc4 (06:16) | R1.23 branding |
| `j_104.ts` | 15ca27fbe (06:27) | R1.104 consultation agreement |

## Parts (GitHub, 14:4x IST)
| Row | Merged | Open |
|---|---|---|
| R1.10 | PF-28 part 4 #2908 (09:00 UTC) | PF-28 part 5 #2933 (approved, queued) |
| R1.88 | AUD-4 #2339, AUD-4s part 2 #2916 (17:18 IST) | — |
| R1.102 | PF-30a #2884, CS-S1 part 1 #2035, PF-30s #2921 (18:29 IST) | CS-S1 part 2 #2913 |
| R1.23 | PF-13 parts 1a, 1b, part 2 #2910 (16:34 IST) | — |
| R1.104 | FO-5 parts 1-2, FO-3c #2922 (20:45 IST) | none open; poller, screens and FO-6 API part not built |
No row has all its parts merged: **no verdict yet (P-606)**; CAPABILITIES rows unchanged.

## Baseline on main 68f74620b (one run each, isolated copy)
Commands: `zsh studio/tools/isolated.sh jNN <port> start --ttl 30 AI_LIVE=off PLATFORM_IDENTITY=local [PLATFORM_SAMPLE_SEED=on]` then `tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_NN.ts jNN <port>`.

* **j_10 (:4470): exit 1.** PASS W1 (Country field shows the server's field error), route table 209 PF/FO routes, money 20/20, every route probed, nothing stored, no 500 from probes, DW6 refused 400. FAIL: platform 4 probes on 3 routes (e.g. `POST /api/platform/complaints/:id/steps` missing), front-office sales 14 on 2 routes (identity-checks), booking 25 on 8 routes (#2908 merged, yet booking-types missing → not 422), retainers 24 on 9 routes (#2933's), W3 run-time schemas 20 (cap 19), over-long per field, 16 bodies/queries reach no zod schema (public booking), W5 case side (malformed id → 403 on some routes), W6 QA-507 charset/encoding → 500 (still), W8 allow-list holds 31 part-5 lines + 1 part-2 line. **Steps not owned by #2933 that are red:** platform, FO sales, booking, W3, W5, W6 (QA-507) — #2933 alone will not make j_10 green.
* **j_88 (:4471): exit 1.** Setup PASS; every walk step FAIL: no "Activity log" menu entry (`menuEntries 0`) — the page is #2916's.
* **j_102 (:4472): exit 1.** PASS: firm B's same email never listed to firm A; owner finds own hidden lead; records closed by their own routes (404/403). FAIL: no find box (#2921); find door names no case (W3, firm A `[]`: #2913's case finder); firm B's search finds no case.
* **j_23 (:4473): exit 1.** PASS W0 fail-before, W5 (the confirmation email is from the sender name with logo and colour — PF-13 part 1b). FAIL: no Branding page (#2910); W4 the public booking page draws no logo/banner/favicon/colour — the header says no part yet draws the brand on a client page, so **W4 stays red after #2910**.
* **j_104 (:4474): exit 1.** PASS W1 (booking on screen), W10 axe at 1440. FAIL: FO-3c's service not on main (#2922). The header says W2, W3 and W5's running-copy steps stay red after #2922 (booking-event poller unwired; API only, no screen) — **#2922 alone will not make j_104 green.**

## Verdict R1.23 — Partial (22 Nov 16:4x IST, main 1b4f148d6)
Walked within 10 min of #2910's merge (16:34 IST). `j_23` on isolated copies :4475 and :4476 (fresh each): exit 1 both times, 14/15 PASS, the same single FAIL.
* PASS: W0 fail-before; W1 Owner finds Branding in My account (no address typed), the form has all five; W2 sets all five, "Branding saved.", read and stored images as entered (96x48, 32x32, 600x120), one audit line per changed key; W3 #ffcc00 refused on the colour field with ratio and 4.5:1, SVG-as-.png and 2 MB + 1 byte refused on the logo field, nothing stored; W5 confirmation email from the sender name with logo and #7a1f4e; W6 Case Officer: no entry, "Only an Owner or Admin can change the firm's branding." by address, PUT 403; W7 keyboard save, 400/1024/1440 no sideways scroll, axe clean; no page error.
* **FAIL W4:** the public booking page draws no logo, banner, favicon or brand colour. Done when "client pages … show them" not met → **QA-743** (Gap, Major). PF-13's own Done when names client pages ("a saved logo shows on the client signing page"; FO-3w option (b) leaves the logo and colour on the booking page to PF-13), so this is a gap of the merged parts, not an unbuilt later row.
* Not run: walks.yml on GitHub (a cloud lane asks the Lead; no Works claim made).

## Verdict R1.88 — Works (22 Nov 17:2x IST, main f198c943b)
Walked within 10 min of #2916's merge (17:18 IST).
* GitHub (P-339): walks.yml 45019288306 (job 137198530530) and 45019291303 (job 137198572385), j_88 success twice on f198c943b (this lane dispatched both; the second was a duplicate click, kept as the second run). PR head walk 45011253504 success; merge-queue ci 45015795367 success.
* Local: `j_88` on fresh isolated copies :4477 and :4478: 26/26 PASS, exit 0, twice.
* All of the Done when holds: Owner and Admin filter by person, record and date and export (row-by-row match with audit_event, one audit.exported line); the four other roles refused on screen and by API (403); 375/1024/1440 axe clean. Screenshots: `2026-11-22-capability-trackA-lane2/R1.88-f198c943b/`.

## R1.102 interim (22 Nov 18:3x IST, main after #2921; no verdict, P-606)
One `j_102` run on a fresh isolated copy (:4472), exit 1. The find box works now: "/" opens it, "No matches" before the records exist, the lead found by name and by email ("Matched: Email"), firm B's records never shown to firm A, a hidden lead never shown to user-O, records closed by their own routes, and 400/1024/1440 axe clean. **Failing only on CS-S1 part 2 (#2913, the case finder):** W1 and W2 case principal by name and email, W3 by file number (firm A's and firm B's searches name no case), W4 firm B's case, W5 keyboard (needs the case as the second row).

## Duplicate scoring of R1.23 and R1.88 (found 20:5x IST)
Another qa lane (`claude/qa-r123-walk` #3057, `claude/qa-r188-walk` #3062) scored the same two rows and merged first: R1.23 Partial on 0fb27300c (W4, **QA-746**), R1.88 Works on f198c943b citing the same walks runs this lane dispatched (45019288306, 45019291303). Same verdicts, same evidence. The rows on main are theirs; this lane's QA-743 is withdrawn as a duplicate of QA-746 (removed from BUGS.md, never on main). Lead 4's 14:3x IST duplicate check listed R1.23 and R1.88 for this lane only, so the two lanes overlapped.

## Verdict R1.104 — Partial (22 Nov 21:0x IST, main bc1f39c08)
Walked within 20 min of #2922's merge (20:45 IST). `j_104` on fresh isolated copies :4478 and :4479: exit 1 twice, the same 9 FAIL / 12 PASS. #2922 itself says it is not R1.104's last part.
* PASS: setup; W1 booking on screen; W2 fail-before; W4 setup (agreement sent, unsigned); W5 fail-before; W5 host's "needs you" lists it; W6 client then host sign, sealed, signed copy emailed once; W7 by-person "Agreement signed" with sha256; W8 firm B 404, no key 403; W10 axe; no page error.
* FAIL, parts not built (no open PR): W2 a booking made in the app sends no agreement (by-booking "No agreement was sent"; the booking-event poller is unwired); W3 the booking panel shows nothing; W5 running copy: no reminder queued; W7 screen: the person's page shows no "Agreement signed" or signed copy.
* FAIL, findings: **QA-747** (Gap, Major): Attended saved and consult record accepted while unsigned (W4, W9): "cannot start until signed" has no part. **QA-748** (Bug, Major): a Follow-up booking is sent an agreement (W4b). **QA-749** (Ambiguity): the reminder goes to the host, not the person who booked (W5).
* Unconfirmed: no counsel.

## Questions for the Lead
1. R1.10: after #2933, j_10 is still red on platform, FO sales and booking routes, run-time schemas (20 > 19), the case side's malformed ids and QA-507. Which parts own these (PF-28 part 2 residue, part 4 follow-up)? Without them R1.10 is Partial, not Works.
2. R1.23 W4 is QA-746 on main (Gap, Major; this lane's QA-743 withdrawn as its duplicate): which lane draws the brand on the public booking page (PF-13 follow-up or FO-3w)? R1.104 W2/W3/W5 (poller, panel, queued reminder) have no part in an open PR. Are they backlog rows, or does the row's Done when accept the email-only / API-only scope?
4. R1.104: which row gates the consultation start (QA-747), and who gets the reminder (QA-749)? The poller and the two screens (W2, W3, W7) have no open PR.
3. (answered: #2916 merged 17:18 IST; R1.88 Works.)

## Suggestions
* *Needed for the proof · Capability:* a backlog row for the brand on the public booking page (R1.23 W4) and the FO-3c poller + panel (R1.104 W2/W3).

## Next
Watching #2933, #2916, #2913, #2921, #2910, #2922; each row is walked twice on main within 60 min of its last merge and its verdict recorded in `qa/CAPABILITIES.md`.
