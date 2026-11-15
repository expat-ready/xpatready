# Verdicts R1.38, R1.40 — main e593acccc (tree 32ac4601), 16 Nov 00:xx IST

Fresh Opus 5.5 qa reader (P-303): ran nothing; judged only from the files in this folder, `qa/CAPABILITIES.md` rows R1.38 and R1.40, RULES (P-339, P-348c gate A, P-317, P-606), qa skill §4 and Gate A, BACKLOG rows J-38, FO-3w, FO-3st, PF-4b.
CI: merge-queue run 43742297658 (head 3e36ca66, same tree 32ac4601) success, shards 1-8 and 5 regression jobs success; per-suite lines not extracted, so the run proves the pack green only by job conclusion, not by a counted line.

## R1.38 Time zones from booking page to invite — **Partial**
* Reason: the pack and walks are green, but there is no booking page (no screen to walk) and J-38 is not merged; gate A cannot be met.
* Newly proven vs 15 Nov (d52b7274e, Partial): the one test gap named last time is closed. `r140-staff-move-1/2.txt` (11/11 twice): a Dubai visitor books 12 Mar 2027 (stored 15:00Z), staff move it across Toronto's 14 Mar change (stored 16 Mar 14:00Z); the booker reads 7:00 p.m. then 6:00 p.m. (Asia/Dubai), the host reads 10:00 a.m. (America/Toronto) both times, with a fail case for an unshifted offset. The staff-zone time across a daylight-saving change is now shown, through the host's mail. Kept: fo3 133/0, fo3sr 29/0, TZ walk 19/19 twice, QA-470 3/3.
* Still missing: FO-3w (public booking page: "booking page" in the row's own name has no screen in web/; front-office has only sales/ lead pages); J-38 (join and walk, `tests/journeys/j_38.ts` absent; P-606 (2)); FO-3st (staff calendar: the only staff read, FO-3sr GET /:id, returns UTC and the booker's zone, no staff-zone label, so the staff zone is proven in mail only).
* Gate A: **not met** (P-348c: by screens only; no screen exists; API walks are supporting evidence).

## R1.40 Calendar invite files — **Partial**
* Reason: every Done-when clause is shown in tests, but no invite can be opened from the running app (mail is in-memory `fakeMail`) and no screen walk exists; gate A cannot be met.
* Newly proven vs 15 Nov (e13603508, Partial): the invite chain now holds on the staff path, not only the visitor's link. `r140-staff-move-1/2.txt`: three .ics to the booker (book, staff move, staff cancel), one UID across all, the host's too; SEQUENCE rises on each change; METHOD REQUEST, REQUEST, CANCEL; DTSTART 15:00Z then 14:00Z across the DST change; the moved invite does not carry the old time.
* Still missing: booking mail wired to a sending adapter with an inbox (booking still uses `fakeMail`; PF-4b #1816 is merged but booking does not use it; real sending is PF-19b, row 48), so an invite is seen only in memory; FO-3w (no page to book from); J-38 (walk "both mails and the .ics right", not merged; P-606 (2)).
* Gate A: **not met**.

## Notes for the Lead
* `tests/qa/check_r140_staff_move_invite.ts` is untracked in this copy (`git ls-files` misses it): commit it with the records PR (P-557), or this evidence cannot be re-run.
* Neither row may claim Works until FO-3w, J-38 and (R1.38) FO-3st merge, then a by-screens walk on an isolated copy ends at R1.39's / R1.41's first step and a run on main's head names the counted pack lines (P-339).
* No new bugs: nothing seen fails a clause; the gaps are unbuilt rows already in BACKLOG.
