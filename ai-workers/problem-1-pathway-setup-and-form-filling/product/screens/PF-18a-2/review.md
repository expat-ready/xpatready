# Review: PF-18a part 2, personal notification settings + NotificationPrefsPort (reviewer, 19 Nov 2026)

Branch `claude/runtime-pf18a-notif-prefs`, draft PR #2304. API and schema row with no screen, so it is judged against the brief `design/lead-b-briefs/PF-18a.md` (part 2, DW5, DW7), AG-16-10, AG-16-11, AG-16 §3.3 (lines 555-577) and STANDARDS. DW6 (`hostZone()`) waits for #2284 as instructed, so it is not a finding; a re-review needs it.

**Verdict (round 2, `644017db54c1e9330e5ba1ee3b057410c05f200a`): Block.** The round 2 fix for breaker m2 brings in one new Major (a 500), and there is one new Minor. Every round 1 finding is fixed and verified. Journey score **8.5/10** is unchanged (`journey-test-reviewer-2026-11-19.md`); the J9 stale tab now gets 409.

## Round 2: diff only (`git diff 4130eb109..644017db5`, P-277)
Ran: `check_pf18a_notifications.ts` **65 passed, 0 failed**; a scratch worktree with 11 mutations (10 one at a time, then the two M1 guards together); an isolated copy on **:4433** (never :4400); `module-cards.py pr` with the live PR body: **PASS**.

| Finding | Fix | Verified by |
|---|---|---|
| R1 Major 1, stamp test time bomb | `all.at(-1) === NEW` dropped (test:62) | a later folder `20261120000000_zz_later_row` gives 65/0 (it was 58/1) |
| R1 m2, lock untested | the parallel saves use opposite orders, and the second one is 409 | lock removed: FAIL 5/5; version check moved out of the lock: FAIL 5/5 |
| R1 m3, own-only read | the Owner's GET checked after the officer saves | the staff filter dropped from `savedRows`: FAIL |
| R1 m4, ended grants | an Admin with an ended grant gets no Firm and connections | `endedAt: null` dropped: FAIL |
| R1 m5 / break m1, stale tab | `version` (hash of the saved rows); 409 with `current` | no check: FAIL; hash ignores values: FAIL; live: stale PUT gives 409 |
| R1 m6, group 7 email-off items | port rule list (`ports/notification-prefs.ts:11-13`) and `MODULE.rows` | read |
| R1 m7, PR body | Done-when list, `Duplicate check:`, `Card unchanged:` for features | `module-cards.py pr` PASS |
| break M1, uncapped problems | max 8 checked before the items (`pipe`), issues capped at 20 | each guard alone survives (they back each other up); both removed: FAIL (6,001 issues); live 7 MB body: 413 in 28 ms |
| break m2, `__proto__` | `protoKey` refuses it | check off: FAIL (409); **but see R2-1** |
| break m3, SECURITY on IN_APP | `decide` gives false | mutation back to true: 5 FAIL (suite + contract) |

### Open findings
1. **Major (Must): a nested body makes the route answer 500.** `S/api/src/platform/settings/notifications/service.ts:28` `protoKey` recurses into every nested object with no depth limit. Before this fix, `strictObject` refused the unknown key with a 400 without walking inside it.
   * Failing case (live, :4433): PUT `{"version":"x","groups":[{"group":"MENTIONS","inApp":true,"email":true}],"z":` + `{"a":` × 5 000 + `1` + `}` × 5 000 + `}` (30 KB) returns **500**. The log shows `RangeError` at `protoKey (service.ts:28)` and an Errors metric of 1.
   * Depths of 100 000 and 400 000, and a 100 000-deep array inside a group item, also return 500.
   * Any of the six roles can do this. It breaks the file's own rule ("an unknown field refuses the whole save (400)") and the repo's "never a 500" bar (guard, break M1). Each request writes an error-level line with a stack.
   * Fix: check for an own `__proto__` key only on the body and on each of at most 8 `groups` items. Those are the only objects the schema accepts; anything deeper is already an unknown key. Add the 5 000-deep case to the test.
2. **Minor (Should): one problem line is still unbounded.** zod's "Unrecognized keys" issue lists every extra key.
   * Failing case: a 3.5 MB body with 300 000 extra top-level keys returns a 400 that is **3.8 MB**, in 574 ms. With 8 at once, another person's GET took **3.3 s**. The same 8 bodies sent to a route that 404s cost 1.2 s, so this route adds about 2 s on top of JSON parsing.
   * Same class as break M1, though far smaller (reply 1.1× the request, against 8× before).
   * Fix: cut each issue string (for example `.slice(0, 200)`) in `refused` (service.ts:23), next to `MAX_ISSUES`.

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
* §6 RFC 9457 problems, server authorisation, deny by default: met, **except R2-1** (a 500 on a nested body).
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
* The builder committed this file and the journey report into the PR at `644017db5`. This round 2 edit is left uncommitted.

## D scores (0-3, this row's scope)
D1 3 (DW5 and DW7 met; DW6 deferred by instruction) · D2 3 (database and service checks, race-safe) · D3 3 (one enum, one data file) · D4 N/A · D5 2 (round 2: stale tab now 409; a nested body gives 500, R2-1) · D6 2 (§3.3 cited with the date read; no audit, rightly) · D7 N/A (no AI) · D8-D9 N/A · D10 2 (plain detail lines; zod text in `issues`) · D11 2 (`saved` and defaults shown) · D12-D14 N/A · D15 3 (GET 10-17 ms, PUT 26-44 ms) · D16 3 (round 2: every rule mutation caught; R2-1 adds one case) · D17 simulated only · D18 3 (the source block in the data) · D19 N/A (PF-18n and PF-18s close the loop) · D20 simulated only.

Reviewer: Request changes. Fix R2-1 (Major). R2-2 should land with it.
