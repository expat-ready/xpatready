# FO-10 part 2: break report (PR #2622 at c817dc305, diff 1cd42b133..c817dc305 only)

This is a runtime row with no screen, so the screen attacks (keyboard, 1024 px, zoom, uploads, reload) do not apply. The breaker is a separate session that did not build this.
**Method.**
* A pristine `git archive` of c817dc305. The shared worktree had an uncommitted mutation in `place.ts` (`if (false && o.possibleMatch)`) from another session, so it was not used.
* Scratch scripts outside the repo, calling `AssignmentRules`, `arrive()` and `PrismaArrival` directly.
* Scratch databases `xr_brk_fo10p2_*` on :54329: every migration plus the PF-3 and FO-1a Sample seeds, all dropped afterwards.
* For the role checks, the real API on its own port (:4477) with local sign-in, also stopped and dropped afterwards.
* The PR's own check on the pristine copy: 25 passed, 0 failed.

## Findings

### Major 1: `PUT {mode:"ROUND_ROBIN"}` with no list (or `[]`) shares leads with every sales person, and loses the ticked list
- **Where:** `assignment/rules.ts:114`. It passes `eligibleStaffIds` only when the list is given; `save()` turns an absent list into `[]` (`rules.ts:50`), and `[]` means "every active person holding agent/prospect:edit" (`place.ts:151`). `ONE_PERSON` also writes `eligible_staff_ids = []` (`rules.ts:43,67`).
- **Repro:**
  * `setSharing(R,{mode:"ROUND_ROBIN",rotationStaffIds:[R,T]})`, then `setSharing(R,{mode:"ROUND_ROBIN"})` → 200 `rotationStaffIds: []`.
  * Same via ONE_PERSON: RR[R,T], then ONE_PERSON(O), then `{mode:"ROUND_ROBIN"}` → `[]`. Over HTTP, `PUT /api/front-office/lead-sharing {"mode":"ROUND_ROBIN"}` → 200, `[]`.
  * From then on every Case Officer, Case Manager, Owner and Admin takes turns.
- **Expected:** AG-2-85 rule 3: "Round robin between the people the admin ticks". Rule 9 and §10: "an empty rotation … falls back to Anyone takes it". Spec data keeps `LeadRotationMember` apart from `mode`, so switching to One person and back keeps the list. The spread at line 114 suggests "absent = keep" was meant.
- **Actual:** one missing field silently widens the rotation to the whole sales team, people the admin left out included. GET under ONE_PERSON returns `rotationStaffIds: []`, so a client cannot restore the list either.

### Major 2: a booking host who cannot work leads owns the lead, which then never shows in Unassigned leads
- **Where:** `sales/arrival.ts:103-106` checks only `status = ACTIVE`. It does not check the sales key, as `eligible()` does for rules (`place.ts:145-155`, part 1's break M2).
- **Repro:**
  * `arrive(BOOKING, bookingHostStaffId = <active READ_ONLY staff>)`: the owner is the Read-only person.
  * The same for a Case Manager whose grant was ended (`ended_at`/`ended_by` set, no live role): the owner is that keyless person.
  * Nothing stops it upstream: `fo_consultation_type` checks only that a host is staff of the firm.
- **Actual:** the owner cannot Take or edit the lead (the guard denies `agent/prospect:edit`). `leads.ts:53` counts only a null or inactive owner as Unassigned, so the lead drops out of every queue (AG16-60, AG-2-85 §2: "a lead nobody sees is a dropped lead").
- **Expected:** treat a host without the sales key like an inactive one (HOST_INACTIVE → Unassigned), or mark it as a deliberate departure in the PR. Rule 1(b) says the host owns, but rule 2 and AG16-60 need someone able to act on it.

### Minor 3: in a one-user firm (X-4), an inactive host gives the lead an owner, but the audit line says it was left in Unassigned leads
- **Where:** `arrival.ts:103-111` and `placedWords` at `arrival.ts:53`.
- **Repro:** Sample solo firm: S is ACTIVE, a second staff member B2 is SUSPENDED. `arrive(BOOKING, host = B2)` gives `owner_staff_id = S` (correct: fact 1(a) comes first).
  * Summary: "…left in Unassigned leads: the booking's host is not active."
  * Detail: `ownerFact: "HOST_INACTIVE"`, `ownerStaffId: S`.
- **Expected:** the line names the X-4 owner. The lead's timeline reads this line, so it currently shows something untrue.

### Minor 4: the body GET returns cannot be sent back for two of the three modes
- **Where:** `rules.ts:106,110`. `rotationStaffIds !== undefined` refuses even `[]` and `null`, while `onePersonStaffId: null` is accepted.
- **Repro:** GET returns `{mode, onePersonStaffId:null, rotationStaffIds:[]}`. Changing only `mode`:
  * `ANYONE` → 422 "Anyone takes it names nobody."
  * `ONE_PERSON` (+ person) → 422 "takes no rotation list".
  * `ROUND_ROBIN` round-trips fine.
- **Expected:** treat empty (`[]`, `null`) like absent, as `onePersonStaffId` already does. Otherwise the settings panel must hand-build each body.

### Minor 5: the turns check accepts any value type; a non-number takes a person out of the rotation for good
- **Where:** the migration (`20261121090000_fo10p2_least_recent_turns/migration.sql:11`) checks only `jsonb_typeof(turns)='object'`. `place.ts:185` compares `locked.turns[id] ?? 0` with `<`.
- **Repro:** four people A, O, R, T in id order. `turns = {R:"abc", O:1, T:2, A:3}`: R never gets a lead (5 of 5 to O, T, A), and `"abc"` is never overwritten. `{R:{"a":1}}` and `{R:1e300}` / `1e400` behave the same way.
  * `null` and `"0"` heal on the next lead (`?? 0`, string coercion).
  * Junk for the first person in id order heals after one lead.
- Only manual SQL can write junk. The API never does.

### Minor 6: `turn_no` is INTEGER; at 2147483647 every arrival under that rule fails
- **Where:** `place.ts:186` (`turn_no + 1`).
- **Repro:** `update … set turn_no = 2147483647` → the next web-form arrival throws `22003 integer out of range` and the whole arrival rolls back: no lead, and the public form gets a 500.
- Not reachable in practice (2^31 leads on one rule). `bigint` would remove it.

### Minor 7: PUT lead-sharing on a firm with no `fo_sales_setup` row gives a 500
- **Where:** `rules.ts:64` (the upsert), reached from `setSharing` (`rules.ts:111/114`).
- **Repro:** start the API on a fresh database, run the PF-3 seed without FO-1a's seed, then `PUT {"mode":"ROUND_ROBIN"}` as the Owner → 500 (P2003, FK `fo_assignment_rule_firm_id_fkey` → `fo_sales_setup`). ANYONE → 200.
- The row is written on `firm.created`, so this happens only when that delivery was missed. Part 1's `POST assignment-rules` has the same flaw. Expected: a 409/422 in words, not a 500.

## What held
- **Fairness:**
  * 40 parallel arrivals with 4 people → exactly 10 / 10 / 10 / 10, `turn_no = 40`, no errors.
  * 30 arrivals while the list flips 6 times and a person is suspended mid-run (async): no rejections; the suspended person got 0 leads after the suspension committed. The save that re-adds them gets a clean 422.
  * 30 arrivals while the mode cycles RR → ONE_PERSON → ANYONE 9 times: no deadlock, no 500.
- **Turns:**
  * Removed and re-added: R gets the first lead back, once, then normal turns.
  * RR → ONE_PERSON → ANYONE → RR keeps the turns: the person given a lead least recently comes first.
  * A firm-B staff id or an upper-case key in `turns` is ignored.
  * The check refuses `[]`, JSON `null`, a scalar and `turn_no = -1`; SQL NULL is refused by NOT NULL.
  * `prisma migrate diff` shows no drift for `fo_assignment_rule`.
- **Possible match:**
  * A phone-only match → Unassigned, turn unmoved.
  * An unreadable-phone repeat is not a match and is placed.
  * The same email only in firm B is not a match and is placed.
  * Two arrivals at once with one email: the first is placed, the second flagged; the turn moves once.
  * A possible match on a booking with an active host → the host (a fact, not the setting).
- **Host:**
  * A forged `fo_booking` with a firm-B host is refused by the trigger; a consultation type naming firm-B staff is refused too.
  * A firm-B host id passed straight to `arrive()` → no owner.
  * SUSPENDED and DEACTIVATED hosts → no owner, no rule.
  * The booking row is written before `bookingArrived` in one transaction (`booking/service.ts:527-528`).
  * A booking on an open prospect returns before any owner logic (`arrival.ts:79-88`).
- **Endpoint:**
  * Case Officer and Case Manager → 403 on GET and PUT; no token → 401; POST → 404; an upper-case path is refused.
  * Firm B's Owner reads and writes only firm B, and cannot name firm-A staff (422).
  * ONE_PERSON naming a Read-only, suspended, firm-B or absent person → 422.
  * RR with firm-B staff, 201 ids, or a string instead of a list → 422.
  * Unknown fields, including `__proto__` and `constructor` → 422.
  * JSON `null`, a JSON string or broken JSON → 400; more than 5 MB → 413.
  * 10 parallel first-ever PUTs on one firm → no unique-key error.
  * MANAGE and configure-source are held by the same roles (OWNER, ADMIN), so the second route over the catch-all row grants no one extra.
- **Audit failure:** setSharing (RR and ANYONE) and an arrival with a failing audit port roll back completely: the rule, its turns and the lead count are unchanged.
