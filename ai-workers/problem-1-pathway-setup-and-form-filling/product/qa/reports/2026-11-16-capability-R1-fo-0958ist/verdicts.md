# Verdicts R1.38, R1.40: main ddc6e919c, 16 Nov (fresh Opus 5.5 reader, ran nothing, P-303)

Since fecf52a2b: FO-3pa #1830 (merged 08:07 IST) and FO-3m #1831 (merged 09:28 IST = main ddc6e919c), both touching `api/src/front-office/booking/service.ts`.
CI: run 43796001718 (FO-3m merge batch, tree 64b53a51 = `git rev-parse ddc6e919c^{tree}`, checked): every job success; suite lines 09:13-09:27 IST: fo3 133/0, fo3pa 45/0, fo3m 14/0, fo3sr 29/0, fo3sa 39/0, pf19b 28/0 (`ci-43796001718-suite-lines.txt`). qa re-runs on isolated copy qa_fon (`check_*.txt`): the same six counts.
Walks on that copy: `r140-inbox-walk-{1,2}.txt` 19/19 twice (DTSTAMP 10:01 and 10:02 IST; the runs differ only in firm key and DTSTAMP); `r138-tz-walk-{1,2}.txt` 19/19 twice; `r140-staff-move-{1,2}.txt` 11/11 twice.

## Regression from FO-3pa or FO-3m: none seen
The packs from before the merges count what they counted at fecf52a2b (fo3 133, fo3sr 29, fo3sa 39, pf19b 28), and every walk passes in full.

## R1.38 Time zones from booking page to invite: Partial (unchanged)
- Reason: the API, mail and invite give the right offset across Toronto's 14 Mar 2027 change, but there is no booking page or staff calendar to walk by screens.
- Newly proven: nothing new for this row. The FO-3pa download carries the same DTSTART 14:00Z as the moved email. The booker's mails read 7:00 p.m. then 6:00 p.m. (Asia/Dubai) and the host's 10:00 a.m. (America/Toronto) both times; both still hold after FO-3pa and FO-3m.
- Missing: FO-3w (the booking page: no booking route or screen in `web/src`; BACKLOG row 595 "not built"); FO-3st (staff calendar: no screen; row 596 "not built"); J-38 (BACKLOG row 857; no `tests/journeys/j_38*`; only j_6 and j_9 exist). P-606: not every part is merged, so the row cannot be scored Works.
- Gate A: not met. It needs a walk by screens from the booking page to the next capability's first step. P-616 (pass by API) does not apply, because this row has planned screens.

## R1.40 Calendar invite files: Partial (unchanged; PF-19b part done)
- Reason: every Done-when clause holds over HTTP on the running app, but the walk starts with no booking page, and J-38 is not merged.
- Newly proven (FO-3pa): `GET /api/public/bookings/<token>/ics` answers 200 text/calendar, `attachment; filename="invite.ics"`. With DTSTAMP removed, the file equals the moved invite in the booker's email (UID, SEQUENCE, METHOD, DTSTART). The test source (`tests/qa/check_r140_inbox_walk.ts` l.56-64) compares the whole text, not only those four fields. An unknown link of the same length gets 404. Still holding: six invites (booker and host) share one UID; SEQUENCE goes 0, 1, 2; METHOD goes REQUEST, REQUEST, CANCEL; DTSTART goes 15:00Z, then 14:00Z.
- Not covered by the walk: the download after a cancel (the walk downloads before it) and the host's download. Neither is a Done-when clause; qa can add both to the walk later.
- Missing: FO-3w (the walk's start), J-38. PF-19b merged (#1860).
- Gate A: not met. There is no booking screen to start the walk from; the HTTP walk is supporting evidence only.
