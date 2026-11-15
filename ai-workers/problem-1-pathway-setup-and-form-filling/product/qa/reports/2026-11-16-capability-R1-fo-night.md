# qa · capability, front office group, night of 15–16 Nov 2026: map rows 38 and 40

**Mode:** `/qa capability` (P-613 (4); a cloud qa lane, Opus 5.5, high effort). **Tested on `main` e593acccc** (tree 32ac4601), 16 Nov 00:xx IST. Live AI off, US$0, no priced button. Isolated copy `qa_fon` :4472 (started and stopped in one command, ttl 20–30 min); :4400 untouched.
**Verdict (fresh Opus 5.5 reader that ran nothing, P-303; `2026-11-16-capability-R1-fo-night/verdicts.md`):** **R1.38 Partial · R1.40 Partial** (both unchanged; gaps narrowed). Bugs: 0 Blocker · 0 Critical · 0 Major · 0 Minor new; none closed.

## 1. On GitHub (P-339)
Merge-queue run **43742297658** (merged #1822, head 3e36ca66; its tree 32ac4601 **is** main e593acccc's): conclusion success; types, shards 1–8 and 5 regression jobs success. Suite lines were not extracted from the shard logs (job conclusions only); a Works claim later must cite the counted pack lines.

## 2. qa re-runs (same tree, this cloud copy)
| Check | Result | File |
|---|---|---|
| `tests/check_fo3_booking.ts` (FO-3) | 133 passed, 0 failed | `…/fo3-pack.txt` |
| `tests/check_fo3sr_routes.ts` (FO-3sr #1811) | 29 passed, 0 failed (run with `--tsconfig studio/api/tsconfig.json`: decorators) | `…/fo3sr-pack.txt` |
| `tests/qa/check_r1_fo3_tz_walk.ts` (API walk on the running copy) | 19/19, twice | `…/r138-tz-walk-{1,2}.txt` |
| `tests/qa/check_qa470_host_mail_zone.ts` | 3/3 | `…/qa470.txt` |
| **new** `tests/qa/check_r140_staff_move_invite.ts` | **11/11, twice** | `…/r140-staff-move-{1,2}.txt` |

The new check: a visitor in Asia/Dubai books Fri 12 Mar 2027 10:00 Toronto (EST); the host moves it **through FO-3sr's staff path** to Tue 16 Mar 10:00 (EDT, after Toronto's 14 Mar change), then cancels. Stored 15:00Z then 14:00Z (SQL); the booker's mails read 7:00 p.m. then 6:00 p.m. (Asia/Dubai); the host's read 10:00 a.m. (America/Toronto) both times; three invites, one UID (the host's too), SEQUENCE rising, METHOD REQUEST, REQUEST, CANCEL, DTSTART in UTC. Each line with a fail case. This closes the 15 Nov gap "no test shows the staff-zone time across a daylight-saving change" for the host's mail.

## 3. Verdicts
| Row | Verdict | Why |
|---|---|---|
| R1.38 Time zones booking page to invite | **Partial** | packs and walks green; the host's mail keeps office time across DST (new). Missing: the booking page (FO-3w), J-38 not merged (P-606 (2)), the staff calendar view (FO-3st; FO-3sr's staff read returns UTC and the booker's zone, no office-zone label). Gate A not met: no screen to walk |
| R1.40 Calendar invite files | **Partial** | every Done-when clause now shown by a test, the staff move and cancel too (new). Missing: an invite opened from the running app (booking mail is in-memory `fakeMail`, `api/src/front-office/booking/runtime-ports.ts`; real sending is row 48, PF-19b), FO-3w, J-38. Gate A not met |

## 4. The rest of the front-office group (P-606: no verdict until every part has merged)
Merged tonight: FO-3sr #1811, FO-2 part 1 #1813, FO-2 part 2 #1843, FO-4 part 1 #1822, PF-4b #1816. MVP-CHECKLIST still marks rows 26–33, 37, 39, 41, 42 Shaped (a part not merged): parts missing per the checklist, e.g. FO-4b (26), FO-4 later parts (30–32), FO-10 (32), FO-9a (29, 33), FO-3w, FO-3a, FO-3st (37, 39, 41, 42), FO-3pa #1830 in queue. Each is scored within 4 h of its last part merging (P-613 (4)) by the next qa round.

## 5. Not tested
Headed walk: no booking or invite screen exists. Coverage (c8) not run this round (API-only re-score). Per-suite lines of run 43742297658.

## Questions for the Lead
1. Row 40's "invite seen in the running app" waits on booking mail moving off `fakeMail` (row 48 / PF-19b's local adapter has an inbox). Is wiring booking onto that adapter a row of its own, or part of FO-3w? Without it, R1.40 cannot pass gate A even once the page exists.

## Suggestions
* *Needed for the proof · Capability:* FO-3sr's staff read could carry the host's office-time label (AG-04 rule 9) so FO-3st has it from the API.
* *Needed for the proof · Scaffolding:* name `--tsconfig studio/api/tsconfig.json` in the usage line of `check_fo3sr_routes.ts` (it fails to start without it outside CI).
