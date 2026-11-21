# FO-10 part 1: break report (PR #2476 at 0d8b42d68)

Runtime row with no screen, so the screen-only attacks (keyboard, 1024 px, zoom, uploads, reload) do not apply. Breaker: a separate session that did not build this.
Method: a scratch script outside the repo (`/tmp/claude-0/fo10-break/break.mts`, not committed) on its own database
`xr_studio_fo10brk_<pid>` (every migration plus the PF-3 and FO-1a Sample seeds, dropped at the end), calling `AssignmentRules` and
`arrive()` directly as the PR's test does. The demo database was not touched. The PR's own check: 35 passed, 0 failed.

## Findings

### Major 1: a person whose sales role was ended still takes round-robin turns
- **Where:** `api/src/front-office/assignment/rules.ts:35-36`. `eligible()` joins `platform_role_grant` with no `g.ended_at is null`. The guard
  checks for it (`api/src/platform/identity/catalogue.ts:61`, `service.ts:117`), so the key is read differently here and at the guard.
- **Repro:** add a Case Manager, then end that grant (`ended_at = now()`) and give the person READ_ONLY. Then (a) `save({door:"BOOKING",
  strategy:"ROUND_ROBIN", eligibleStaffIds:[ended, T]})` is **accepted**, and the next 4 booking leads go to `[ended, T, ended, T]`; (b) an
  open turn (`eligibleStaffIds` empty) also includes them.
- **Expected:** refused at save (422), and skipped at placement, as for a Read-only person.
- **Actual:** half the leads go to someone who cannot Take or edit them (the guard denies `agent/prospect:edit`). They are also not in Unassigned
  leads: `leads.ts:59` treats only a null or **inactive** owner as unassigned, and this owner is active. So the leads are silently
  dropped from the queue (AG-2-85 rule 2: "a lead nobody sees is a dropped lead"). Ending someone's role is the normal way to take them off sales.

### Major 2: an OWNER rule can name someone who cannot work leads, and is never checked again
- **Where:** `rules.ts:89` (save checks only `status = ACTIVE`) and `rules.ts:55` (placement checks only `status = ACTIVE`).
- **Repro:** `save({door:"WEB_FORM", strategy:"OWNER", ownerStaffId: <active READ_ONLY person>})` returns 200. Every web-form lead then gets that
  owner. The same happens when a valid owner later loses the sales role (a grant ended or changed).
- **Expected:** the same test as the round-robin set uses (`eligible()`, line 95): an active person holding `agent/prospect:edit`. At placement,
  an owner without the key should fall back like `OWNER_INACTIVE` (BACKLOG FO-10: "among active staff holding the sales keys").
- **Actual:** the leads go to someone who cannot act on them, and they are not in Unassigned leads (same reason as Major 1).

### Minor 3: a lead is committed to a person deactivated during its arrival
- **Where:** `arrival.ts:94-97` with `rules.ts:55/58`. The staff row is read and not locked.
- **Repro:** an OWNER service rule names O. Start a web-form arrival whose audit port waits on `lead.created`. Meanwhile run `update platform_staff
  set status='DEACTIVATED'` for O (it commits at once), then release. The lead commits with `owner_staff_id = O` (now DEACTIVATED), and its audit line says
  "assigned to staff O by the default owner rule".
- **Expected:** AG-2-85 rule 18: "a lead whose owner would be a deactivated user gets no owner". **Mitigation:** `leads.ts:59` lists it under
  Unassigned, so it is not lost. Only the stored owner and the audit wording are wrong. A rare race.

### Minor 4: contradictory or foreign fields in the body are dropped without an error
- **Where:** `rules.ts:88-99`.
- **Repro:** `save({strategy:"ROUND_ROBIN", ownerStaffId:<another firm's staff>})` returns 200 with `ownerStaffId:null`. `save({strategy:"OWNER",
  ownerStaffId:T, eligibleStaffIds:[<another firm's staff>, "junk"]})` returns 200 with `eligibleStaffIds:[]`.
- **Expected:** a 422 on the field that does not belong to the chosen strategy, or at least on non-uuid or foreign ids. A caller that sent the wrong
  shape is told it was saved. No data crosses firms.

### Minor 5: a rule whose service is later deactivated stays "active" and cannot be edited
- **Where:** `rules.ts:71-72` (list) and `rules.ts:84` (save looks up only `active: true` services).
- **Repro:** save `{serviceId: svc7, OWNER T}`, then `update fo_service set active=false`. `list` still shows `active:true` with the label.
  Re-saving the same criteria (to change the owner) returns 422 "Choose a service from your firm's list". Only `off` works.
- **Expected:** the list says the service is retired (or the rule reads as not applying), and the rule can still be edited or switched off.
  No wrong placement: the public form refuses inactive services (`public.ts:106`).

### Minor 6: the database does not check `eligible_staff_ids` or `last_staff_id`
- **Where:** `migration.sql:166-167`. The trigger at line 208 covers only `owner_staff_id`.
- **Repro (psql):** a ROUND_ROBIN row with `eligible_staff_ids = '{<firm B staff>}'` is ACCEPTED, and so is `'{NULL}'`. `last_staff_id = <firm B staff>` and
  `last_staff_id = gen_random_uuid()` are both ACCEPTED.
- **Impact:** low. `eligible()` filters by `firm_id`, so firm B's staff are never picked, and a `{NULL}` set falls back to NO_ELIGIBLE. The schema comment
  says the API does this check. It does not meet the "database refuses what the API refuses" standard the owner trigger sets. Recorded, not urgent.

## Notes for the founder (requirement conflicts, not graded; not settled here)
- The newest AG-02 (v2.6, 28 Oct, AG-2-85) removes rules and conditions in favour of one "How new leads are shared" setting. P-574 (3) and
  BACKLOG FO-10 ask for door and service rules. The PR follows the BACKLOG. Three points where they differ, as the code stands:
  (a) a possible-match lead is placed by the rule, while v2.6 rule 10 says it skips the rotation (repro: two arrivals with one email; the
  second is flagged and still gets an owner); (b) v2.6 rule 1(b) says a one-to-one booking's host owns the lead, but `BookingArrival`
  (`ports/arrival.ts:39`) carries no host, so a booking rule now sends booking leads to round robin; (c) v2.6 rule 5 takes the person
  "given a lead least recently", while the PR takes the next id after the cursor (AG-2-13d).
- Every web-form or booking arrival now locks the matching rule row (`rules.ts:52`), including OWNER rules that never write it, so arrivals
  for one firm queue behind each other and behind save or off. Correct, but more serialisation than OWNER needs.

## What held
- **Wrong role and other firms:** all 3 routes declare `agent/prospect:configure-source` (Owner and Admin only). `off` with another firm's id, a non-uuid or the nil
  uuid returns 404. Another firm's service or staff (owner, turn) returns 422. Firm B's list does not show firm A's rules.
- **Bad bodies:** 201 ids returns 422. A string, null, number or lower-case door returns 422. A missing strategy, a numeric or empty `serviceId` and a nil-uuid owner return 422.
  MANUAL is refused by both the API and the database. The same id sent twice in different case is deduplicated.
- **Concurrent first saves:** 8 parallel first saves of one criteria all return 200 and leave exactly 1 row (the upsert is atomic, with no P2002 or 500).
- **Arrival while the specific rule is switched off:** the arrival waits for the row lock, then falls to the door rule. It does not drop to Unassigned (the
  `FOR UPDATE ... LIMIT 1` re-check takes the next row). The same holds with 20 staggered arrivals around an API `off`: 4 placed by the service rule, 16 by the door rule,
  0 Unassigned, 0 errors.
- **Parallel saves replacing a rule** (OWNER and RR in turn) during 20 arrivals: no errors, no deadlocks, and every lead has an owner.
- **Audit failure:** save with the audit port down leaves no row, and off with the audit port down leaves the rule active. The arrival rollback is also covered by the PR's test.
- **Database checks:** a mismatched criteria key, a MANUAL door, another firm's service (composite foreign key), a firm without a front office, a move to another firm,
  a blank `created_by`, a null set, and an owner on a ROUND_ROBIN row are all REFUSED.
- **X-4:** a firm with one active user and a round-robin rule gives the lead to that user, with no rule line. A firm with one sales user plus one Read-only user puts the open turn on the sales user.
- **A MANUAL arrival with no owner** ignores an any-door rule (and `Leads.add` always passes the adder).
