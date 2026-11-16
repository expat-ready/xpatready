# qa · capability, front office: rows 40 and 38 re-checked after FO-3pa and FO-3m (16 Nov 2026, 10:0x IST)

**Mode:** `/qa capability`. FO-3pa #1830 (merged 08:07 IST, 16 Nov) and FO-3m #1831 (merged 09:28 IST) change the booking service, and FO-3pa adds the calendar file by link (row 40), so both rows were re-checked within 4 h (P-613 (4)). This is a cloud qa lane on Opus 5.5 at high effort. **Tested on main ddc6e919c.** Live AI was off, spend was US$0, and no priced button was pressed. The isolated copy was `qa_fon` on :4472; :4400 was not touched. All times are IST (P-338; Devin's finding on #1903, carried).
**Verdict (fresh Opus 5.5 reader that ran nothing, P-303; `2026-11-16-capability-R1-fo-0958ist/verdicts.md`):** **R1.40 Partial · R1.38 Partial**, with no regression. Bugs: none new, none closed.

## 1. On GitHub (P-339)
FO-3m's merge-batch **run 43796001718** (head 74f81226) has tree 64b53a51, which **is** main ddc6e919c's own tree. Every job was green (guard and packs were skipped by design). Counted lines are in `…/ci-43796001718-suite-lines.txt`:

| Suite | Job | Result |
|---|---|---|
| check_fo3_booking.ts | 133065965097 | 133/0 |
| check_fo3pa_public_answers.ts | 133065965074 | 45/0 |
| check_fo3m_answers.ts | 133065965203 | 14/0 |
| check_fo3sr_routes.ts | 133065965072 | 29/0 |
| check_pf19b_mail.ts | 133065965072 | 28/0 |
| check_fo3sa_any_time.ts | 133065965071 | 39/0 |

qa's local re-runs give the same counts.

## 2. Walks on the running copy
| Check | Result |
|---|---|
| `tests/qa/check_r140_inbox_walk.ts` (extended) | **19/19, twice** |
| `tests/qa/check_r1_fo3_tz_walk.ts` | 19/19, twice |
| `tests/qa/check_r140_staff_move_invite.ts` | 11/11, twice |

The inbox walk gains three checks for FO-3pa:
- After the move, the self-service link downloads the calendar file (`GET /api/public/bookings/<token>/ics`, 200, text/calendar).
- The download is the same invite as the moved email: same UID, SEQUENCE, METHOD and DTSTART, with DTSTAMP removed before comparing.
- An unknown link gets 404.

Everything the 06:58 IST round proved still holds: three mails each for booker and host, one UID, SEQUENCE 0, 1, 2, METHOD REQUEST, REQUEST, CANCEL, and DTSTART across Toronto's 14 Mar 2027 change.

## 3. Verdicts
| Row | Verdict | Why |
|---|---|---|
| R1.40 Calendar invite files | **Partial** | The invite can also be downloaded by link and matches the email (new); no regression. Missing: the booking page (FO-3w) and J-38. Gate A not met. |
| R1.38 Time zones booking page to invite | **Partial** | No regression. Missing: FO-3w, FO-3st and J-38. Gate A not met. |

## 4. The rest of the front-office group (P-606)
MVP-CHECKLIST still marks rows 26–37, 39, 41 and 42 Shaped, each with a part not yet merged, so they get no verdict.

## Not tested
- A headed walk: there is still no booking page.
- The download after a cancel, and the host's download. Neither is a Done-when clause.
- Coverage (c8).

## Questions for the Lead
None.
