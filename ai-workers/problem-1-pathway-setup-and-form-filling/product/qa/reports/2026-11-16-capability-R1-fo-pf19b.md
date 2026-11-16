# qa · capability, front office: rows 40 and 38 re-scored after PF-19b booking mail (16 Nov 2026)

**Mode:** `/qa capability`, re-scoring row 40 within 4 h of PF-19b #1860 merging (23:08 UTC, 15 Nov), as the tech lead ruled on #1855. Cloud qa lane, Opus 5.5, high effort. **Tested on main fecf52a2b**; only `product/` changed after b54c2cd4b. Live AI off, US$0, no priced button. Isolated copy `qa_fon` :4472, started and stopped in one command; :4400 untouched.
**Verdict (fresh Opus 5.5 reader that ran nothing, P-303; `2026-11-16-capability-R1-fo-pf19b/verdicts.md`):** **R1.40 Partial · R1.38 Partial.** Bugs: none new, none closed.

## 1. On GitHub (P-339)
PF-19b's merge-batch **run 43768047575** (head 001597a2; its tree 35a08683 is the tree of main after b54c2cd4b, and only records changed after it): every job green. Counted suite lines (`…/ci-43768047575-suite-lines.txt`):

| Suite | Job | Result |
|---|---|---|
| check_pf19b_mail.ts | 132978320874 | 28/0 |
| check_fo3sa_any_time.ts | 132978320874 | 39/0 |
| check_fo3sr_routes.ts | 132978320892 | 29/0 |
| check_fo3_booking.ts | 132978320890 | 133/0 |

The latest batch run, 43777123886, is on main fecf52a2b's own tree 753ff42a and was also green (records only).

## 2. qa runs on main fecf52a2b
| Check | Result |
|---|---|
| The four suites above, re-run | 28/0, 133/0, 29/0, 39/0 |
| **new** `tests/qa/check_r140_inbox_walk.ts` (running copy, HTTP) | **16/16, twice** |
| `tests/qa/check_r1_fo3_tz_walk.ts` | 19/19, twice |
| `tests/qa/check_r140_staff_move_invite.ts` | 11/11, twice |

The inbox walk: a visitor in Asia/Dubai books Fri 12 Mar 2027 10:00 Toronto, moves it by the self-service link to Mon 15 Mar 10:00 (after Toronto's 14 Mar change), then cancels. The demo inbox (`GET /api/demo/platform-inbox`, stand-in SI-20) then holds three mails each for the booker and the host, each with an `invite.ics`. The invites show:
- one UID;
- SEQUENCE 0, then 1, then 2 (printed for booker and host alike);
- METHOD REQUEST, REQUEST, then CANCEL, on the host's three as well as the booker's;
- DTSTART 20270312T150000Z, then 20270315T140000Z;
- the booker's mails reading 7:00 then 6:00 p.m. (Asia/Dubai), and the host's 10:00 a.m. (America/Toronto) both times.

A malformed address gets 400. The first invite is printed whole in `…/r140-inbox-walk-1.txt`. After the reviewer's first round, each fail case first asserts that its mail exists, so none can pass on an empty inbox; run twice again, 16/16.

**Observation, not a finding (reader's ruling):** the first, unpaced walk (`…/r140-inbox-walk-unpaced-*.txt`, 7/14, run with the test's first version, before the reviewer's fixes) booked, moved and cancelled within seconds, and only the cancel mail arrived. `runMail` sends only the newest state's mail (`service.ts`: "a newer state has its own email, so an older one is not sent"). The calendar still ends correct, so this is by design. The walk now waits for each mail, the way a person would move it later.

## 3. Verdicts
| Row | Verdict | Why |
|---|---|---|
| R1.40 Calendar invite files | **Partial** | Every Done-when clause now shows in the running app (new). Missing: the booking page (FO-3w) and J-38. Gate A not met: the capability starts on the booking page, and the demo inbox has no screen. |
| R1.38 Time zones booking page to invite | **Partial** | The running app's invite carries the stored instant across the change (new). Missing: FO-3w, FO-3st and J-38. Gate A not met. |

## 4. The rest of the front-office group (P-606)
FO-3sa #1828 merged at 22:00 UTC. MVP-CHECKLIST still marks rows 26–37, 39, 41 and 42 Shaped, each with a part not merged, so they get no verdict.

## Not tested
A headed walk: no booking page and no inbox screen exist. Coverage (c8) was not run in this API-only re-score.

## Questions for the Lead
None.

## Suggestions
* *Later · Capability:* a booker who changes a booking within seconds receives only the newest mail, e.g. "has moved" with no "is booked" before it. That is fine for the calendar, but worth a look when FO-3w's confirmation screen is designed (the reader would log it as UX, Minor, if the founder wants it tracked).
