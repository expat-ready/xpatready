# Review: PF-18a part 2, personal notification settings + NotificationPrefsPort (reviewer, 19 Nov 2026)

Branch `claude/runtime-pf18a-notif-prefs`, draft PR #2304. API and schema row with no screen, so it is judged against the brief `design/lead-b-briefs/PF-18a.md` (part 2, DW5, DW7), AG-16-10, AG-16-11, AG-16 §3.3 (lines 555-577) and STANDARDS. DW6 (`hostZone()`) arrived in round 3, after #2284.

**Verdict (round 4, `92924d7b95c0c760b65ab7856e3ece13be8653af`): Approve.** Round 4 (diff `ecc1ec248..92924d7b9`, screens excluded) has two fixes. (1) CodeQL: the Calgary time is now compared with `includes()` on the whole string (test:231-232). The suite gives 72/0, and DW6 still fails when the office zone is not used: `hostZone` ignoring the port (2 FAIL), the host-mail caller without the port (1 FAIL), the host mail taking the firm's setting directly (1 FAIL). (2) The front-office card fragment's path now resolves (`module-cards.py tree` PASS). Round 3: no open Blocker or Major; DW5, DW6 and DW7 are met. R3-1 (Minor) stays open and does not block. Journey score **8.5/10**.

## Round 3: diff only (`git diff 644017db5..ecc1ec248 -- ':!*/product/screens/*'`, P-277)
What I ran:
* `check_pf18a_notifications.ts`: **72 passed, 0 failed**.
* Booking suites on this tree: `check_fo3_booking.ts` 133/0 (FO-3h's hostZone cases), `check_pf19b_mail.ts` 28/0, `check_fo2p3b_arrival_port.ts` 51/0.
* `tsc -p api` clean; `any` count 416, baseline 433.
* 9 mutations in a scratch worktree: 8 caught.
* The merge of main: our files change only by 531c1a0f2. Newest migration on main is `20261119081500`, earlier than ours.

| Item | Verified by |
|---|---|
| R2-1, `protoKey` 500 | Body and first 8 groups only, no recursion (`service.ts:28-30`). The 5 000-deep cases in the test answer 400. Mutation "groups not checked": FAIL. |
| R2-2, issue line size | Each line cut to 200 characters (`service.ts:23`). Mutation "cut removed": FAIL (a 32 KB reply). |
| CodeQL partial replace | The `__proto__` bodies are written out whole (test:150). Same assertion as before. |
| DW6 `hostZone()` | `service.ts:188`: office zone through `OfficeClockPort`; the firm's zone with no office or no port. Mutations caught: port ignored (FAIL ×2), `zoneFor(firm, null)` (FAIL ×2), host-mail caller (`:594`) without the port (FAIL). A host with no office keeps the firm's zone; moving the host to another office moves the zone. |
| DW6 injection | `features/front-office-booking.ts` injects `OFFICE_CLOCK`. Caught: factory drops `offices`; `inject` lacks the token; `runtimeBookingPorts` drops it from the result. All features go into one Nest module (`features.ts`), so the token resolves. |
| Jobs in scope | The host-mail job carries `firmId`, and `platform-jobs.ts:68` runs it in `withFirm`. So `OfficeClock`'s scope check passes where `readSetting` used to read silently. |

The coordinator asked whether an optional `offices` in `BookingPorts` and `runtimeBookingPorts` is a risk. **Acceptable; not a finding.**
* The app has one production wiring, and three mutations of it are caught.
* A missing port falls back to the pre-PF-18a behaviour (the firm's zone), not a crash.
* Making it required would edit two unrelated suites outside the touch list (`check_pf19b_mail.ts`, `check_fo2p3b_arrival_port.ts`).
* What remains: a second production wiring added later could forget the port. It would then mail the firm's zone.

The brief's "attendance-question emails" do not exist yet: `runAttendanceAsk` only parses its payload. So DW6 has only the host's booking mail to change. Not a finding.
### Open finding
1. **R3-1, Minor (Should): the second hostZone caller has no failing test.** Dropping the port from `warningsFor` (`service.ts:718`) survives.
   * That line sets the time on the staff "Overlaps … 09:00–09:30" warning for a host in another office.
   * Fix (optional, this PR or FO-3's next): one check that a Calgary host's overlap label reads in Edmonton time.
   * Note: the label shows the host's office time with no "(Calgary)" tag, which AG-1-74 rule 5 asks for when it differs from the viewer's zone. That label is FO-3h's design, not this row's.

## Round 2 (`644017db5`), fixed in round 3
All round 1 findings and the breaker's M1 and m1-m3 were fixed and verified by mutation. New then:
* **R2-1 (Major):** `protoKey` recursed, so a 30 KB body nested 5 000 deep gave 500.
* **R2-2 (Minor):** an "Unrecognized keys" line was unbounded (a 3.8 MB reply).

## Brief and requirement fit (DW5, DW7)
| Case | Result | Evidence |
|---|---|---|
| Email off for a group: `allows(EMAIL)` false, in-app still true | Met | test l.128-129; contract case 2; journey J2 (database row `MENTIONS t/f`) |
| Security email allowed whatever the switches | Met | test l.131; contract case 4; GET shows `security {email:true, switchable:false}` |
| A group that cannot reach the person: not seen, cannot be set | Met | Officer GET returns 6 groups; PUT TEAM_WATCH gives 400 "This group cannot reach you…" with nothing written (J3) |
| Defaults equal §3.3; who sees each group equals §3.3 | Met | `samples/notification-groups.json` against §3.3 table rows 1-8; test l.95-99; mutations "group 8 Owner only" and "Payments email off" caught |
| Eight groups are PF-18np's enum, never a second list | Met | `checkRules` + the database CHECK compared to `NotificationGroup.options` (test l.65) |
| `agent/notification:manage-preferences`, all six roles, own only | Met | test l.112 (six 200s); body `staffId` gives 400; firm B's save leaves firm A alone |
| DW7: one contract, run by the real adapter and the fake; `check-port-contracts.mjs` | Met | both 6/6; two broken adapters fail it |
| DW7: migration in a parallel world (demo-shaped copy, `migrate diff` clean) | Met (R1 Major 1 fixed) | test l.70-87 |
| DW6: host in another office gets the office zone; no office gives the firm's (FO-3h cases pass) | Met (round 3) | test DW6 block; `check_fo3_booking.ts` 133/0 |

The builder's choices, judged:
* Switches per group: right (AG-16-10 "switches for the eight groups").
* Group 7's "in-app only" items as `emailNeverItems` data for the sender: an acceptable reading of §3.3 and AG-16-10 test 7, but see Minor 6.
* No audit line: right (AG-16 §10 audits firm and sensitive settings; this one is self-scoped).
* A whole save refused (400) when it names a group that cannot reach the person: right (all or nothing).
* The adapter throws outside the firm's scope: right (a silent false would drop notices).
* A deactivated person gets false, security emails included: reasonable (they are no longer firm staff).
* The CHECK compared to the enum: good.

## Standards ([M] lines that apply)
* §3.4 "every link checked twice": **met**. The service checks reach; the database has CHECK, the (firm, staff) key, the primary key, a trigger that keeps a row's person, firm and group, a column grant and RLS. Each is tested.
* §3.10, §7 "a rule's test fails when the rule is removed": **met in round 2** (every round 2 rule mutation is caught; the two M1 guards are caught together).
* §4 optimistic concurrency: **met in round 2** (`version`, 409 with `current`).
* §4 ports and adapters, contract first (zod in `ports/`, imports zod only): **met**.
* §5 migrations preserve records, rollback recorded: **met**. Additive only, rollback in the header, demo copy unchanged (test l.79).
* §5 indexed reads, no N+1: **met**. One query for the rows, one for the role keys.
* §6 RFC 9457 problems, server authorisation, deny by default: met (round 3; R2-1 fixed).
* §7 module card: **met** (`Card unchanged:` for features; `MODULE.rows/PF-18a.md`).
* §10 consequential choices recorded: met.

## Round 1 (`4130eb109`), all fixed in round 2
Ran then: the suite (59/0), `check_pf18a_offices.ts` 87/0, `check_pf12_walls.ts` 100/0, `check_prisma_schema.ts` 8/0, `tsc -p api` clean, `any` count under its baseline. Journeys on :4433. Mutations: 18, of which 15 caught.

Findings:
1. **Major:** `all.at(-1) === NEW` (test:60) would turn main red at the next migration.
2. **Minors:**
   * m2: the lock had no failing test.
   * m3: own-only read was not proven.
   * m4: ended grants were not proven.
   * m5: a stale tab overwrote with no 409 (STANDARDS §4).
   * m6: the group 7 email-off rule was not on the port.
   * m7: PR body (module-cards FAIL, cases list and duplicate check missing).

## Not applicable or not checked
* BIC-01–20 (EXPERIENCE §6) and D8, D9, D12-D14: no screen in this row (PF-18s builds it).
* D17 and D20: simulated only.
* `graph.mjs` (G1 0, G2 0, G3 161, G4 0, G5 0, G6 17) does not index the empty-path `@Get()`/`@Put()` on `api/platform/me/notifications` (nor part 1's offices GET/POST). That is a tool gap, so no finding.
* CI itself was not run: the PR is a draft.
* The builder commits this file into the PR. This round 3 edit is left uncommitted.
* Live mail delivery of the Calgary host's email in the running app. The suite runs it on `fakeMail`; DI is proven by the one-module feature list.

## D scores (0-3, this row's scope)
D1 3 (DW5, DW6, DW7 met) · D2 3 (database and service checks, race-safe) · D3 3 (one enum, one data file) · D4 N/A · D5 3 (stale tab gets 409; hostile bodies get 400) · D6 2 (§3.3 cited with the date read; no audit, rightly) · D7 N/A (no AI) · D8-D9 N/A · D10 2 (plain detail lines; zod text in `issues`) · D11 2 (`saved` and defaults shown) · D12-D14 N/A · D15 3 (GET 10-17 ms, PUT 26-44 ms) · D16 3 (round 2: every rule mutation caught; R2-1 adds one case) · D17 simulated only · D18 3 (the source block in the data) · D19 N/A (PF-18n and PF-18s close the loop) · D20 simulated only.

Reviewer: Approve 92924d7b95c0c760b65ab7856e3ece13be8653af (R3-1 Minor open, non-blocking).
