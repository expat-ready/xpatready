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

## Round 2 (reviewer, 23 Nov 2026)

Reviewed head **cc7e9a4be2d24bd140e977afde0e6d606c9bfc3f**: only `git diff 06bc784e..cc7e9a4b` (routes.ts, service.ts, the PF-21c migration edited in place, the Prisma schema, the suite). The migration is not on main yet, so editing it in place is safe.

**Runs:**
- `check_pf21c_breaches.ts`: 46/46.
- Neighbours: `check_pf12_walls` 110/110, `check_pf8b_f4_migrations` 9/9. The `tsc` run on `api/` shows no breach errors.
- **Mutation runs:** each fix was reverted one at a time in a scratch worktree, and the suite was run again (13 runs; worktree removed afterwards).
- **SQL race:** two `xr_app` sessions used one Idempotency-Key, on a scratch database (dropped afterwards).
- **API walk:** isolated copy `rv21c` on :4621, stopped afterwards (see the journey report's Round 2).

### Round 1 and breaker findings: fixed?
| Finding | Fix (file:line) | Test, and does it fail without the fix? | Status |
|---|---|---|---|
| M1 / B1: race between a change and a send | `FOR SHARE` in `notice_ready` (`migration.sql:368`) and in `notice_record` (`:399`) | suite:237. Without `FOR SHARE`: `raced 201`, so it **fails** | Fixed. The send waits, then answers 409 `NOT_DECIDED_TO_NOTIFY` (422 `BREACH_FIELDS` if only the firm was removed). No 500 |
| m2: draft text emailed | A confirm needs `description` (`service.ts:83`) | suite:308. **Fails** without the fix | Fixed (walk J3) |
| m3: notice recorded with no outbox rows | Each recipient needs this notice's outbox row (`migration.sql:400-408`) | suite:342. **Fails** without the fix | Fixed |
| m4: email date | `YYYY-MM-DD HH:MM UTC` (`service.ts:234`) | none needed | Fixed: unambiguous. It is not in words, but nothing in the standards asks for words |
| B2: notice to an all-suppressed firm | 409 `NOT_DELIVERABLE`, rolled back (`service.ts:244`) | suite:263. **Fails** without the fix | Fixed. Walk J4: 0 outbox rows and 0 notices, then 201 once the suppression is lifted |
| B3: forged sender or template | Sender must be ACTIVE with an open grant holding `system/breach:manage`; template must be the notice's (`migration.sql:386-396`) | suite:345. **Fails** without the key check, and **fails** without the template check | Fixed (residual: note R1) |
| B4: duplicate creates | Idempotency-Key, partial unique index (`:94`), advisory lock and hash in `plat_breach_open` (`:272-282`) | suite:249. **Fails** without the hash check. Still **passes without the lock** (n1) | Fixed. Walk: repeat → 200 with the same id; other body or other Owner → 422; missing → 400; key with a space → 400. SQL race: the second session waited 1.5 s and got `repeated` |
| B5: decision rewritten | Trigger freezes reason and decider once notices exist (`:169`); `decided_by` moves only on a real change (`:313`) | suite:268. **Fails** without the fix | Fixed. Walk J5: Owner 2 sending the same decision → 200, decider unchanged; a new reason → 409 `DECISION_KEPT` |
| B6: invisible or broken text | Refines at `service.ts:60-61` | suite:272. **Fails** without either refine | Fixed for the reported cases (n2) |
| B7: alert ids in description | Description no longer quotes entity or key (`service.ts:149`) | suite:296. **Fails** without the fix | Fixed. The ids stay in `source_alert` (internal only) |

**Checks on the new code. No defect found in:**
- the 13-argument definer (owner, REVOKE and GRANT loop updated; no other caller);
- the CHECK on `request_key`/`request_hash`, which matches `readIdempotencyKey`'s 0x21-0x7E rule;
- `plat_breach_json` and the events, which strip the key and hash;
- the immutability trigger, which covers the key;
- migrate diff, which is empty (DW8);
- deadlocks: the change takes no advisory lock, and two notices to different firms both take `FOR SHARE` and do not block each other.

### New findings (round 2)
**Blocker:** none. **Major:** none.

**n1 (Minor, test gap).** suite:249's "three drafts at once" check still passes with `pg_advisory_xact_lock` removed from `plat_breach_open` (`migration.sql:274`); the requests are not truly concurrent. Only my two-session SQL run proves the lock. If the lock were ever bypassed, the backstop unique index raises a `unique_violation` that `refusedByDb` does not map, so the answer would be 500. *Fix:* hold a transaction across the second call (as the M1 test does), or map `plat_breach_request_key` to the repeat path.

**n2 (Minor).** Other blank-looking characters still pass. A description of only U+3164 (Hangul filler) → 201 (walk J6). Others not covered: U+115F, U+1160, U+FFA0, U+2800, U+180E, U+2061-U+2064, variation selectors, tag characters. *Fix:* widen the class in `service.ts:61`, or require at least one `\p{L}\p{N}`.

**n3 (nit).** The `BREACH_CHANGED` catch (`service.ts:250-256`) cannot be reached while `FOR SHARE` holds, and no test covers it. Reverting `FOR SHARE` with the catch still in place gives 201: the catch alone would not save the race. Harmless backstop.

**n4 (nit).**
- `NOT_DELIVERABLE` says "(bounced or complained)", but UNSUBSCRIBE and STAFF suppressions trigger it too.
- Each refused attempt leaves a rendered file with no outbox row. That is accepted under the Messages design ("at most an orphan file … nothing is ever sent").

**R1 (residual note, B3).** A firm-session caller could still forge a notice by writing its own `breach-notice:` outbox rows. That needs:
- the breach id, which a firm learns only once its notice exists, and then it gets `ALREADY_SENT`;
- a manage-holding staff id;
- the template id.

Low risk, defence in depth.

**Unchanged by this diff:** m1, m5, m6 (deferrals for the tech lead).

Journey score round 2: **8.8/10** (pass; `journey-test-reviewer-2026-11-23.md`, Round 2).

Verdict: Approve cc7e9a4be2d24bd140e977afde0e6d606c9bfc3f (no open Blocker or Major; n1 and n2 are small follow-ups)

Reviewer: Approve cc7e9a4be2d24bd140e977afde0e6d606c9bfc3f

## Round 3 (Lead 6), head 21adefa9c559435864a915c6025aa42a6b0ee341

**Reviewer:** a fresh reviewer. **Scope:** only `git diff 67a552a49..21adefa9c`. That diff is one line, `tests/check_pf19r_every_sender.ts:57`. Commit f36ff9e93, made after it, adds only the breaker's report, so the code at the branch head is the same as at 21adefa9c.

**The entry is correct.**
- **Counts:** `{ messagePort: 1, anySend: 1 }` matches the file. `service.ts:239` `this.messages.send(tx, …)` is the file's only `.send(`. `:258` `this.messages.dispatch(…)` is not a send.
- **Route text:** it matches the code. `features/platform-register-breaches.ts:11` binds `{ provide: BREACH_MESSAGES, useExisting: MESSAGE_PORT }`. The notice is written in the firm's transaction (`:217-255`) and dispatched after commit (`:258`).
- **Suite:** `run-suites.sh --only check_pf19r_every_sender.ts` passed, 21 passed and 0 failed, twice (at 21adefa9c and at f36ff9e93). S1 also passed in a clean worktree at 21adefa9c.
- **The test fails when the rule is removed:** with the 67a552a49 table on the same code, S1 fails with "platform/register/breaches/service.ts: {"messagePort":1,"anySend":1} send call(s) not in the table".
- **Replay:** `check_pf21c_breaches.ts` passed 46/46 on its own copy.

**Findings on this diff**
- **n5 (Minor, follow-up; the same as the breaker's R3-2).** Nothing checks the binding that the new route text states. PF-19r's S2 never loads BREACH_MESSAGES. `check_pf21c_breaches.ts:125` tests `"useExisting" in p`, not `=== MESSAGE_PORT`. Today's binding is correct, so this is a missing regression guard, not a live bypass. Fix: assert `useExisting === MESSAGE_PORT` (one S2 line, like person-link's at `:161`).
- **The breaker's R3-1** (the scan misses `x["send"](` and `.send.call(`) is older than this diff. It is not a finding on this entry.
- **Seen during the review:** `service.ts` changed for a moment in the shared working tree (an SES `.send` line, then a `.deliver?.()` line). These were the breaker's round 3 mutations (break-report M6 and M9), and they were gone before both suite runs above. Neither is in any commit. Builders and breakers: run mutations in a separate worktree, not in the shared checkout a reviewer is reading.

**R2-1 ruling: Minor.**
- **Where it can come from:** the attack needs arbitrary SQL as `xr_app`, and no firm-side path gives that.
- **The app never writes a chosen key:** the only writer of `msg_outbox` is `MessagePort.send` (`platform/messages/send/messages.ts:99-100`). Every caller in `api/src` builds its key on the server with a fixed prefix (grep of `idempotencyKey`). The keys a user can pick (`ai_batch`, `form_instance`, `case_decision`) are in other tables. Every `$queryRawUnsafe`/`$executeRawUnsafe` call passes its values as parameters.
- **`app.firm_id` is set only by the server:** `firm-scope.ts:97` and `:459`.
- **The attacker must also know** the breach id, an ACTIVE manage-key staff id and the notice's template version id. A firm sees none of these before its own notice.
- **Anyone who could run that SQL already has more:** `xr_app` can already `SET ROLE xr_staff_bypass` (`20261116013000_pf12_firm_walls/migration.sql:109`) and holds `xr_data`'s UPDATE and DELETE rights. So R2-1 adds nothing a database-credential attacker does not already have, inside this firm or across firms.
- **Impact if reached:** high. An Owner would miss a legally relevant notice. The block form is not silent: the Platform Owner sees 409 `NOT_DELIVERABLE`. The forged-record form is silent (409 `ALREADY_NOTIFIED`).
- **Against the bar:** STANDARDS.md has no Major/Minor definitions. The nearest bars are §6 "[M] Authorisation on the server for every endpoint" and §8 ASVS L2 authorisation. Both are met, because every endpoint is authorised. QUALITY.md's "data at risk" needs a path to the risk, and there is none.
- **So:** this is a defence-in-depth gap below the app's own trust boundary. That makes it Minor, not Major.
- **Follow-up row:** in `plat_breach_notice_record`, require each named outbox row to be `QUEUED`, with `created_at >= now()` (the same transaction), or `xmin = txid_current()`. Also refuse a pre-existing `breach-notice:` key in `send()`'s repeat lookup when its row is not from this breach's sender.

**Journey score (round 3):** 8.8/10, pass, carried over with fresh evidence. This diff changes no app code. The PF-21c replay passed 46/46. The isolated copy `rv21c3` on :4641 answered health 200 (16 ms) and an unsigned breach-register call 401 `NOT_SIGNED_IN` (9 ms), then was stopped and dropped. See `journey-test-reviewer-2026-11-23.md`, Round 3. **Could not check:** S2 in a clean worktree, because `p2/` packages are missing there; the runner's 21/21 on the same code covers it.

**Unchanged:** R2-2…R2-4, n1, n2, m1, m5, m6 (Minor or deferred, as in round 2).

Verdict: Approve 21adefa9c559435864a915c6025aa42a6b0ee341 (no open Blocker or Major; n5 and R2-1 are Minor follow-ups)

R2-1: Minor

Reviewer: Approve 21adefa9c559435864a915c6025aa42a6b0ee341

## Round 4 (re-stamp only; Lead 8)

Diff reviewed: `git diff -M 055aaa0ef23c0d57624528aa60650472541e435e..95a1bdbf03f0ea32cbe6036a5a13fc6d2818e24c`. It is one commit (95a1bdbf0).

- **The diff is exactly the re-stamp.** `--stat`/`--summary` show four files and 3+/3-. The folder rename `20261123100000_pf21c_breaches => 20261123210000_pf21c_breaches` is 100%. `migration.sql` has blob `0d780dd590b45739d21e35868ed8744112cd0425` on both sides. The three one-line edits change only the name: the comment at `api/src/platform/register/breaches/service.ts:5`, the comment at `prisma/schema/platform-register.prisma:177` and `NEW` at `tests/check_pf21c_breaches.ts:23`.
- **The old name is gone.** `git grep 20261123100000` at the head finds nothing (rc 1). The new name appears only in those three places and the folder.
- **Order.** origin/main is at a2e3d48ed, fetched today. Its newest migration is `20261123140000_csd7c_type_defaults`, and 20261123210000 sorts after it. No folder on main has the prefix 20261123210000. main has moved past the branch (it adds `20261123030000_aud_ourstaff_actor_word` and `20261123140000_csd7c_type_defaults`). `git merge-tree --write-tree origin/main 95a1bdbf0` merges cleanly. Main already has some duplicate 14-digit prefixes (for example 20261025090000). They are not touched by this PR and are not a finding here.
- **Suite.** `run-suites.sh --only "check_pf21c_breaches.ts check_pf8b_f4_migrations.ts"` at 95a1bdbf0: check_pf21c_breaches.ts PASS, 46 passed and 0 failed. check_pf8b_f4_migrations.ts PASS, 9/9.
- **Journey score:** 8.8/10, carried over from round 3. There is no app behaviour change: comments, one test constant and a migration folder name with identical SQL. The PF-21c replay applied the renamed migration and passed 46/46.
- **New findings:** none. n5, R2-1 and the other round-3 Minors carry over unchanged.

Verdict: Approve 95a1bdbf03f0ea32cbe6036a5a13fc6d2818e24c (no open Blocker or Major)

## Lead read fix (Lead 9; diff-only review)

Diff reviewed: `git diff 6a1c683a917c075defbdd2face5620e5cd552351..ccb4ea2d7c1a60fd0c0f0c4ce787a83b52c190da`. Two files, 6+/2-.

- **The diff is exactly what was ordered.** `migration.sql:126-127`: the decided branch of `plat_breach_decision_whole` gains `"decided_by" IS NOT NULL` and `"decision_reason" IS NOT NULL`. Nothing else in the migration changes, and the folder is still `20261123210000_pf21c_breaches`. `tests/check_pf21c_breaches.ts:171-174` adds two checks. Nothing else changed.
- **The constraint now refuses both NULL cases.** Before the fix, `plat_breach_actor_ok(NULL)` and `btrim(NULL) <> ''` gave NULL, so the decided branch was NULL and the CHECK passed. Now each NULL makes that branch false. The UNDECIDED branch is unchanged.
- **No legitimate write is refused.** I traced every path that writes `plat_breach`:
  - `plat_breach_open`, both the manual record and the from-alert draft, never sets a decision. The row is UNDECIDED with all three fields NULL, so the first branch holds.
  - `plat_breach_change`, deciding NOTIFY_FIRMS or NO_NOTICE: `decided_by` is `p_by`, a staff actor, whenever the decision or reason changes. Otherwise it keeps the old `decided_by`, which is already set on a decided row.
  - `decision_reason` comes from the patch. The API always supplies it with a non-UNDECIDED decision: `service.ts:79-84` refines on "Say why", and `plain()` is trimmed and at least 1 character. So a decision patch that keeps the old reason resends it, and the row passes.
  - Going back to UNDECIDED sets by, at and reason to NULL (`service.ts:182`; function lines 312-315), so the first branch holds.
  - The update trigger (`:169-177`) touches only `decided_at`. It sets `decided_at` to `updated_at` on a decided row, or keeps the old value.
  - No seed writes `plat_breach`. The DO block seeds only the permission keys and the template. `git grep` finds no other writer.
  - At the head, the DW2 "decision names who, when and why" check passes, and so do the UNDECIDED checks.
- **The two checks really test the constraint.**
  - Each check matches `/plat_breach_decision_whole/` in psql's stderr. Each then confirms that `select decision` returns `UNDECIDED`. That select would return `""` and fail if the row were invisible.
  - `xr_studio` is `rolsuper=t, rolbypassrls=t` (from `pg_roles`), so forced RLS does not hide the row, and the direct UPDATE reaches it.
  - `plat_breach_system_only()` passes, because no firm session is set.
- **Suites at ccb4ea2d7:** `run-suites.sh --only "check_pf21c_breaches.ts check_pf8b_f4_migrations.ts"` gives check_pf21c_breaches.ts PASS (48 passed, 0 failed) and check_pf8b_f4_migrations.ts PASS (9/9).
- **It fails without the fix.**
  - **Setup:** a scratch worktree at ccb4ea2d7 with only `migration.sql` restored from 6a1c683a9. `git diff 6a1c683a9 --stat` in that worktree showed only the test file. `run-suites.sh` there stopped because it could not start a demo database in the scratch copy, so I ran the suite's own usage line, `tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21c_breaches.ts`.
  - **Result:** both new checks FAIL, because the UPDATEs succeeded and wrote a decided row with a NULL reason or a NULL `decided_by`. Four later checks failed as a consequence, plus one unexpected error, for 11 passed and 6 failed. The worst of these: a notice was sent (201) off a decision that named no reason or no person, where the check expects 409 `NOT_DECIDED_TO_NOTIFY`. That is the BR-11 hole the fix closes.
  - **Cleanup:** the worktree was removed, and no `xr_studio_pf21c_*` database was left.
- **Journey score:** 8.8/10, carried over from round 3. Only a CHECK constraint tightens and two checks are added. No legitimate path changes behaviour, as shown above.
- **New findings:** none. n5, R2-1 and the other round-3 Minors carry over unchanged.

Verdict: Approve ccb4ea2d7c1a60fd0c0f0c4ce787a83b52c190da (no open Blocker or Major)

## Merge with main fix (Lead 9's full run; diff-only review)

What I reviewed: `git diff c1d7da393..efaf4f5e1` for `breaches/`, `tests/check_pf21c_breaches.ts` and the PF-21c migration, plus `git diff 09b3893df..efaf4f5e1 --stat`. The commits are 30800b7a8 (merges main 09b3893df), 5117f0403 (test) and efaf4f5e1 (fix).

- **The merge is clean.**
  - `git show --cc 30800b7a8` prints no combined hunk, so every file takes one parent's version as it stands.
  - `09b3893df..efaf4f5e1 --stat` lists only PF-21c's own files. The four other test files carry the same +/- lines as PF-21c's change from the merge base at c1d7da393, and no other lines.
  - The migration diff is empty. `20261123210000_pf21c_breaches` still sorts last, after main's `20261123030000_aud_ourstaff_actor_word`, and touches neither `aud_event_actor_type` nor `audit_event`.
- **The stated cause is right.** In `audit-event.ts:57`, when the request's actor type (`ctx.actorType`) is OUR_STAFF, any line whose word does not map to OUR_STAFF is refused with `AuditRefused`. `hook.ts` `auditOf` sets OUR_STAFF / `ourstaff:<id>` from `req.systemStaff`. PF-21c's `system:platform.register.breach` maps to SYSTEM, so the notice transaction rolled back and the route answered 500. The firm check on `:51` cannot be the cause, because a system request has no `req.platform`, so `ctx.firmId` is unset.
- **The fix matches the holds pattern and AUD-3a.**
  - `actorOf` is word for word the same as `holds/service.ts:30`.
  - `c.staffId` comes from `systemStaffOf(r)`, which is the same `req.systemStaff.staffId` that the hook puts in the request's actor (`ctx.actor`). So the `:60` exact-actor check passes, and the DB function maps the word to OUR_STAFF (DW6 asserts `actor_type`).
  - The system word is used only when there is no staff member, which no route produces (`BreachCaller.staffId` is required).
  - The header comment is accurate.
- **PF-21c has no other firm-trail write.** `notify` is the only `audit.record` call. `MessagePort.send` and `dispatch` write no `audit_event`; I grepped `platform/messages/`.
- **The `plat_breach*` actor columns are still consistent.** `opened_by`, `decided_by`, the event `actor` and the notice `sent_by` all hold `staff:<id>` and are checked by `plat_breach_actor_ok` (`staff|seed|system`). These are our own registers, not `audit_event`, so AUD-3a's mapping does not reach them. Main made the same choice for holds ("The hold's own `by` column keeps its `staff:<id>` form"). This is not a defect.
- **Minor (new, carried, not blocking):**
  - The firm-trail line's `detail.by` and `after.sentBy` still read `staff:<our staff id>` on the firm's own trail. Holds has the same in `detail.by` and `after.placedBy`.
  - The breaches header, unlike the holds header, does not say that the register's own `by` columns keep the `staff:` form on purpose. One sentence there would stop a later reader from "fixing" the actor column without the CHECK.
  - If a later row moves those columns to `ourstaff:`, `plat_breach_actor_ok` must widen the way PF-25's checks did.
- **It fails without the fix.**
  - **Setup:** a scratch worktree at efaf4f5e1 with only `service.ts` restored from c1d7da393 (`git diff --cached --stat`: that one file, 3+/5-). node_modules was symlinked, and `npx prisma generate` ran in studio. I then ran `tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf21c_breaches.ts` from the worktree's prototype folder.
  - **Result:** 14 passed, 3 failed, exit 1. Both notice POSTs answered 500, and the log shows `audit_write_failed` / `errorName: AuditRefused` for `plat_breach_notice`.
  - **What failed:** "DW2 firm A's notice → 201" and "DW2 firm B's notice → 201" fail, and then an unexpected TypeError ends the run before DW6 runs.
  - **What that proves:** the suite is red on the merge without the fix, which is the same state as 5117f0403. DW6's new actor assertion is not what turns it red. At runtime, any word other than the request's own `ourstaff:<id>` is already refused by the adapter, so DW6 only adds a check on the stored word and type.
  - **Cleanup:** the worktree was removed and pruned. No `xr_studio_pf21c_*` database is left, and the main checkout is clean at efaf4f5e1.
- **Suites in the main checkout at efaf4f5e1:** `run-suites.sh --only "check_pf21c_breaches.ts check_pf21b_holds.ts check_aud1b_adapter.ts"` gives check_pf21c_breaches.ts PASS (48 passed, 0 failed), check_pf21b_holds.ts PASS (67/0) and check_aud1b_adapter.ts PASS (44/0).
- **Journey score:** 8.8/10, carried over. Only the stored actor word on one firm-trail line changes; what anyone sees and every route's status are as in round 3, and the notice works again on the merged code.

Verdict: Approve efaf4f5e12e06ca7ffae68e7d25df17ef6166286 (no open Blocker or Major)

## Merge of main (#3189) (diff-only review; the tech lead's round "this merge of main and its conflicts only")

Head 25ec9dacddf858ff3c374e4b2d9198fdbb91fac5, a merge of fdd89a816 (the last Approve) with origin/main ca06ff268 (#3189, PF-21b part 3 data requests, migration 20261123200000_pf21b_data_requests).

- **Only PF-21c's own files differ from main.** `git diff ca06ff268 HEAD --stat` lists 15 files, all of them PF-21c's: its screen records, the breaches feature, module and route files, its migration, the schema, and its test lines in pf12, pf19a, pf19r and pf4s. The diff has 3 deletions. Each is a PF-21c line replacing a main line: the pf12 OWN list, and the pf19a count check that becomes the seeded-template filter.
- **Conflict 1, `platform-register.prisma`: both sides are kept whole.**
  - `git show --cc` shows the breach block (4 enums, `PlatBreach`, `PlatBreachEvent`, `PlatBreachNotice`) followed by #3189's block (3 enums, `PlatDataRequest`, `PlatDataRequestEvent`). The only line that differs from both parents is a blank separator.
  - `PlatBreachNotice` has its closing brace back. The file has 22 `{` and 22 `}`, and no model or enum name appears twice.
  - Against fdd89a816 the merge removes no line. Against main the only "-" line is the file's header comment, which PF-21c rewrote and main never touched, so keeping PF-21c's wording is right.
  - `npx prisma validate` passes.
- **Conflict 2, `check_pf4s_system_signin.ts`: both sides are kept whole.** Appendix A holds `system/breach:manage` [Own] and `system/breach:read` [Own, Aud], then `system/compliance:dsr-manage` [Own]. Nothing is dropped and nothing appears twice. pf4s: 104/104.
- **Migration order and names.**
  - `20261123210000_pf21c_breaches` sorts directly after `20261123200000_pf21b_data_requests`, and the stamp is kept. DW8 passes and reports "newest before: 20261123200000_pf21b_data_requests".
  - I extracted every table, type, index, function, trigger and permission key each migration creates (21 for #3189, 36 for PF-21c). No name appears in both: every object uses its own `plat_data_request*` or `plat_breach*` prefix, and the keys are `system/compliance:dsr-manage` and `system/breach:*`.
  - The objects both migrations touch are shared ones: an insert into `plat_system_role_permission`, and GRANT/REVOKE CREATE ON SCHEMA public for `xr_wall_reader`. Both use the same grant-then-revoke pattern, and each leaves the grant as it found it.
- **Auto-merged files.** Since the merge base, only the two conflicted files were changed on both sides.
  - The pf12 OWN list keeps main's `plat_data_request` and `plat_legal_hold` and adds `plat_breach_event` and `plat_breach_notice`.
  - pf19r keeps main's senders and adds the breaches service.
  - pf19a's seeded-template filter has no conflict with #3189, which seeds no `msg_` row.
- **Schema matches both migrations.** PF-21c DW8 "prisma migrate diff … is empty" passes, and so does PF-21b DW6's equivalent.
- **Suites at 25ec9dacd.** `run-suites.sh --only "check_pf21c_breaches.ts check_pf4s_system_signin.ts check_pf21b_requests.ts check_pf12_walls.ts"` exits 0:

  | Suite | Result |
  |---|---|
  | check_pf12_walls.ts | 110/0 |
  | check_pf21b_requests.ts | 27/0 |
  | check_pf21c_breaches.ts | 48/0 |
  | check_pf4s_system_signin.ts | 104/104 |

- **Nit (not blocking).** The schema header still reads "complaints, legal holds and breaches (later data requests)", but data requests are now in this file. This is a one-word fix for a later row.
- **Seen on main, not this PR.** #3189 did not add `plat_data_request_event` to the pf12 OWN list. Its own DW6 does check the table forced with no policy, so this is for the tech lead to note, not a finding here.
- **Journey score:** 8.8/10, carried over. The merge changes no route, screen or wording of PF-21c.

Verdict: Approve 25ec9dacddf858ff3c374e4b2d9198fdbb91fac5 (no open Blocker or Major)
