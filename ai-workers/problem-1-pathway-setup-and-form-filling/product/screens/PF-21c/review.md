# PF-21c review: ExpatReady's breach register and the "Security incident notice" (reviewer, 23 Nov 2026)

Reviewed head **06bc784e1f2ba49eb5645f1df1247852e2a3a5dc** (branch `claude/eloquent-ptolemy-h9jfsm`, PR #3185), `git diff origin/main...06bc784e` (11 files, +1114). Spec: BACKLOG row PF-21c, `trace-requirements.py --brief PF-21c` (SA-11-24, -25, -14, -35; SA7-D74 (b)), `api/src/platform/MODULE.md` (walls), STANDARDS §4-§5, PF-28. Pattern compared: PF-21b part 2 (holds).

**Left out (screen-only):** concept fit, the keyboard / 1024 px / 200 % walk, PRODUCT §3-§4 words, D1-D20, the BIC table and the retrofit mapping. This row has no screen (PF-21rs builds the console pages). I checked the schema, the definers, the walls, the permissions, races, validation, audit and the template labelling.

**Runs (this container, Postgres 18 on :54329):**
- `check_pf21c_breaches.ts`: 38/38, run twice.
- Touched suites, all green: `check_pf12_walls` 110/110, `check_pf19a_messages_schema` 94/94, `check_pf4s_system_signin` 102/102.
- Neighbours, all green: `check_pf21b_holds` 67/67, `check_pf8b_f4_migrations` 9/9 (RDS CREATE grant pair present), `check_aud_values` 14/14, `check_features_registry` 27/27.
- `check_pf28_inputs` against my copy: 48/48. It does **not** reach the six breach routes (see m6), so I probed them by hand.
- API walk on an isolated copy `rv21c` on **:4432** (a runtime port), stopped afterwards.
- Race experiment: two `pg` sessions as `xr_app` on a scratch database, dropped afterwards.
- No repo file changed except this review and the journey report.

## What holds (verified)
- **Keys.** `system/breach:manage` goes to platform-owner only. `system/breach:read` goes to platform-owner and platform-auditor (SA7-D74 (b)).
- **Wrong roles are refused.** Each case answers 403 and records nothing: a Platform Admin on read and on manage, Support, an Auditor writing, and a firm token (`FIRM_SESSION_REFUSED`). With no token: 401.
- **Walls.** Row-level security is forced on all three tables, with no policy; the tables are on PF-12's OWN list. The register definers are refused inside a firm's session. The notice definers are refused outside the named firm's own session. Even the service, called with the key inside a firm's scope, is refused.
- **Kept and insert-only.** A breach cannot be deleted or truncated. Events and notices cannot be updated, deleted or truncated (triggers, plus REVOKE from xr_data). The fixed facts never change, and a recorded breach never goes back to draft.
- **One notice per breach and firm.**
  - A second send → 409 `ALREADY_NOTIFIED`.
  - Two parallel sends → 201 + 409: one row and one email (advisory lock, then a fresh snapshot in the VOLATILE definer, plus the unique index as backstop).
  - Idempotency keys are per breach and staff member.
- **Recipients.** Only the firm's ACTIVE Owners and Admins with a live grant get the notice. An Owner who is also an Admin gets it once. A case officer, a SUSPENDED Admin (walk), a DEACTIVATED Admin and an ended grant are all excluded. A third firm gets 422 and nothing.
- **Audit.**
  - Each change writes an insert-only event with before and after.
  - Each notice writes a `NOTICE_SENT` event and one line on the notified firm's trail, in the same transaction.
  - Every call has PF-4s's guard line with its reason. There is no firm line for the investigation itself.
- **From an alert.** A draft is created from an integrity alert, and nothing is sent. A draft, or an UNDECIDED or NO_NOTICE breach, gets no notice.
- **Validation (PF-28 rule).** The bodies use strictObject with bounded lengths and arrays, and a decision needs its reason. A non-uuid id → 404, a 1 MB body → 413, a bidi mark → 422. Row counts were unchanged across 19 bad inputs.
- **Labelling.** The template body starts "Sample wording (Unconfirmed: no counsel)." The schema says "Legal reading Unconfirmed: no counsel". The data-category list is labelled Sample.

## Findings

### Blocker
None.

### Major
**M1. A breach change racing a notice leaves a notice the record forbids, and the email still goes out.**
- **Where.** `migration.sql:344`: `plat_breach_notice_ready` reads the breach with no row lock. `plat_breach_notice_allowed` (`:196-203`) re-reads it under the insert's snapshot. Neither conflicts with `plat_breach_change`'s `FOR UPDATE` (`:281`), so an uncommitted change is invisible to both. The change's own checks (`:158-163`) cannot see the uncommitted notice either.
- **Reproduced on this head:**
  1. A breach is RECORDED, decided NOTIFY_FIRMS, and names firm F.
  2. In F's session, `notice_ready` answers READY.
  3. Our staff's PATCH sets `affected_firms: []` and `decision: NO_NOTICE`. It is not yet committed.
  4. `notice_record` inserts the notice. Its foreign-key check waits on the change's lock.
  5. The change commits, then the notice commits.
- **Result:** `decision = NO_NOTICE`, `affected_firms = {}`, and 1 notice, with its outbox rows dispatched to F's Owner and Admins. Three invariants the migration states (`:18-21`) are broken. The 7-year record contradicts itself and cannot be corrected, because notices are insert-only.
- **When it happens:** two Platform Owners (or two tabs) work on one breach: one narrows the affected firms or reverses the decision while the other sends.
- **Order checked:** the opposite order (the notice first) is safe; the change waits, then gets 409.
- **Fix:** in `plat_breach_notice_ready`, read the breach with `SELECT … FOR SHARE`. That conflicts with the change's `FOR UPDATE`, so a send waits for an in-flight change and sees its result, and a change waits for an in-flight send and gets 409.
- **Test:** add a DW3/DW4 case that interleaves the two in this order: ready, change, record, commit the change. It should end with the notice refused (or the change refused) and no outbox row.

### Minor
**m1. STANDARDS §4 [M] "Optimistic concurrency" is not met on `PATCH /breaches/:id`.** `service.ts:71-78` takes no version or `updatedAt`. Two staff editing the description or the decision silently overwrite each other. Both values survive in the events, so nothing is lost from the record. *Fix:* an `expectedUpdatedAt` (or version) that answers 409 with the current breach. It can land with PF-21rs's form, but the route is this row's.

**m2. A confirmed alert draft emails the internal draft text to the firm.**
- `service.ts:141` writes "Draft from a audit_chain_break alert (rule BR-2): … (audit_event abc-123). Confirm or correct this record before it is recorded; nothing has been sent."
- `PATCH {status:"RECORDED"}` confirms it without any edit. `:222` puts the description into the email as-is.
- Walk J6: Sample solo's Owner received exactly that text, which ends "nothing has been sent". There is also a grammar slip: "a audit_chain_break".
- *Fix:* refuse a draft→RECORDED move while the description is still the generated one (422 "Describe the breach in your own words"). Or keep the generated text out of `description` (it is already in `sourceAlert`).

**m3. A firm's own session can record a notice that was never sent.**
- `plat_breach_notice_record` (`migration.sql:356-371`) is executable by xr_data in firm F's own session. It checks only that `p_by` names an existing `plat_system_staff` id.
- Shown in the race experiment: a firm-session call recorded a notice with no outbox row. A firm-side code path holding such an id can therefore mark F as "notified", and the real notice is then refused with `ALREADY_SENT`.
- *Fix:* require each recipient's `outboxId` to exist in `msg_outbox` for `p_firm`, with key `breach-notice:<breach>:<staffId>`.

**m4. The email's date is a UTC ISO date with no label.** `service.ts:222` uses `String(r.discovered_at).slice(0, 10)`. A breach discovered at 21:00 Toronto on 22 Nov reads "found a security incident on 2026-11-23". *Fix:* format it in ExpatReady's zone, in words (for example "22 November 2026").

**m5. The firm's Activity log shows `platform.breach.notice_sent` as a raw code.** The action is not registered with `AuditActionNames` (`audit/firm-read/action-names.ts`); the summary is plain. This is the same as PF-21b's m2. *Fix:* register it (for example "ExpatReady sent a security incident notice").

**m6. The tools do not see the coverage (qa note, not this row's code).**
- `graph.mjs` G3 lists four breach routes as reached by no test, because the suite's `call()` helper is not recognised. The suite does call all six routes (lines 145-253).
- `check_pf28_inputs` reports all six as "NOT TESTED (no Sample token holds the keys)", the same as holds and staff.

## Could not check
- The real send worker against SES. Dispatch was only queued (fakeJobs or the local channel).
- An RDS `migrate deploy`. The F4 suite is the proxy, and it passes.
- PF-21rs screens (not built).
- An intended user's walk (D17/D20 stay with the founder).

Journey score: **8.1/10** (pass; `journey-test-reviewer-2026-11-23.md`).

**To fix before Approve:**
1. M1: lock the breach row (`FOR SHARE`) in the notice path, plus the interleaving test.

**Should fix in the same round:** m2 and m3 (small, both in this row's files).

Verdict: Block 06bc784e1f2ba49eb5645f1df1247852e2a3a5dc
