# PF-21c break report: breach register and Security incident notice (schema + permissions)

**Head attacked:** `06bc784e1f2ba49eb5645f1df1247852e2a3a5dc` (PR #3185, branch `claude/eloquent-ptolemy-h9jfsm`). **Scope:** this row has no screen (PF-21rs comes later), so the keyboard, 1024 px, 200 % and upload checks do not apply. I attacked the six routes, the migration's tables, triggers and definers, and the walls.

**How:** I used a scratch script that reuses the harness in `tests/check_pf21c_breaches.ts`:
- Postgres 18 on 127.0.0.1:54329, every migration applied with psql.
- The WalledPool client (`xr_app`), with a NestJS app on an ephemeral port (never :4400).
- Local sign-in for 8 staff tokens: 2 Platform Owners, Admin, Support, Billing, Content publisher, Auditor, and one person holding every role except Owner. Also 3 firm tokens (`user-R`, `user-O`, `user-T`).
- Raw `pg` sessions as `xr_app` for the walls and the race.

I ran it against a `git archive` of 06bc784e. While I worked, the branch moved to `4613f758` and then `fd1b65e0`, so I re-ran the same script there. Each finding below says whether it still holds. All scratch databases were dropped and nothing was committed.

## Findings

**B1 — Major: a breach change racing a notice records a notice the register forbids. If the change wins at the API, the send answers 500.**
Same root cause as the reviewer's M1; I reproduced it independently. `migration.sql:344` reads the breach with no lock, and `plat_breach_notice_allowed` (`:198`) checks against its own snapshot.
- **SQL repro:**
  1. Session 2 (no firm) runs `BEGIN; plat_breach_change(id, '{"decision":"NO_NOTICE","decision_reason":"…"}', 'staff:<owner2>')` and does not commit.
  2. Session 1 (firm G) runs `BEGIN; plat_breach_notice_ready(id, G)`, which answers READY.
  3. Session 1 then runs `plat_breach_notice_record(…)`. Its foreign-key check waits on session 2.
  4. Session 2 commits, then session 1 commits.
- **Observed:** the final state is `decision=NO_NOTICE`, with 1 notice row and its NOTICE_SENT event. That breaks the migration's own rule (`:18-21`) and cannot be corrected, because notices are insert-only.
- **API repro:** 15 rounds of `POST …/:id/notices` alongside `PATCH {decision:"NO_NOTICE"}` (or alongside `PATCH {affectedFirms:[other]}`).
  - **Observed:** 5/15 rounds answered **500**. `refusedByDb` (`service.ts:86`) does not map the trigger's check_violation ("plat_breach_notice_allowed: a notice needs …"). The data stayed consistent: 0 notices and 0 outbox rows.
  - **Expected:** 409, with nothing written.
- **The opposite order holds:** if the notice goes first, the change waits on the foreign-key KEY SHARE lock against its own `FOR UPDATE`, then answers 409 `NOTIFIED_FIRM_KEPT`.
- **At fd1b65e0:** fixed. `FOR SHARE` was added, and the API race now gives 201/409 or 409/200 with no 500.

**B2 — Major: a notice whose recipients are all suppressed is recorded as sent, and it can never be sent again.**
- **Repro:**
  1. Firm B's only Owner address is in `msg_suppression`, for any reason (I used UNSUBSCRIBE; HARD_BOUNCE and STAFF behave the same, since `decide()` suppresses TRANSACTIONAL too).
  2. Send `POST /breaches/:id/notices {firmId:B}`.
- **Observed:** **201**, with `recipients[0].state = "SUPPRESSED"`. The outbox row is SUPPRESSED, and the notice row, the NOTICE_SENT event and the firm-trail line ("sent its Security incident notice … (1)") are all written. I then lifted the suppression and sent again: **409 ALREADY_NOTIFIED**. Even with no unique row in the way, the idempotency key `breach-notice:<breach>:<staff>` (`service.ts:227`) would still return the old SUPPRESSED row.
- **Expected:** a firm with no deliverable Owner or Admin is refused the way NO_RECIPIENTS is (409, nothing recorded), or the notice is recorded as not delivered, with a way to send again. As it stands, the 7-year register says the firm was told (SA-11-25) when nobody was emailed, and no path can correct it.
- **At fd1b65e0:** still present.

**B3 — Major (the reviewer rated this m3): code running as `xr_app` in a firm's session can forge that firm's notice and block the real one.**
- **Repro:** as `xr_app` with `app.firm_id = F`, run `select * from plat_breach_notice_record('<breach>', 'F', '[{"staffId":"nobody"}]', '<random uuid>', 'staff:<AUDITOR id>')`.
- **Observed:**
  - The notice row is inserted.
  - The sender is the Auditor. `:362` checks only that the id exists; it does not check that the person holds `system/breach:manage` or is still active.
  - The template id is not checked against `msg_template_version`.
  - No outbox row is written.
  - The real `POST …/notices {firmId:F}` then answers **409 ALREADY_NOTIFIED**, and F's Owner gets nothing.
- **At fd1b65e0:** partly fixed. Junk recipients are now refused because they must match outbox rows. The sender's key and the template id are still unchecked, and a firm-session caller can still write its own `msg_outbox` rows with the `breach-notice:` key first.

**B4 — Major: creates are not idempotent (STANDARDS §4 [M] "Idempotent creates"), and nothing can void a duplicate, so one incident can email a firm twice.**
- **Repro 1-2:** the same `POST /breaches/from-alert` body 3 times at once → 3 DRAFT breaches; the same `POST /breaches` body 2 times at once → 2 RECORDED breaches.
- **Repro 3:** record a breach twice for firm D, decide NOTIFY_FIRMS on both, and notify D on each. **Observed:** 201 and 201, and **2 emails** to D's Owner for one incident.
- Breaches are never deleted (`plat_breach_kept`), and there is no "duplicate or withdrawn" status, so a double submit stays in the 7-year register for good.
- **Expected:** an idempotency key on create, or a dedupe on the alert's identity for from-alert.
- **At fd1b65e0:** still present.

**B5 — Minor: re-sending the same decision moves "who decided" to someone else but keeps the old time.**
- **Repro:** Owner 1 decides NOTIFY_FIRMS with "Sample: tell again". Owner 2 then sends `PATCH {decision:"NOTIFY_FIRMS", decisionReason:"Sample: tell again"}`.
- **Observed:** `decidedBy` = Owner 2, but `decidedAt` stays at Owner 1's time. `:293` sets `decided_by`, while `:169` keeps `OLD.decided_at` whenever the decision and reason are unchanged. The event does show the change.
- The same path lets anyone rewrite `decision_reason` after notices went out; only the event keeps the reason the notices were sent under. **At fd1b65e0:** still present.

**B6 — Minor: text that looks blank, or is silently altered, gets in.**
- A description made only of U+200B (zero-width space) answers 201 and is stored as `e2808be2808b`. `plain()` (`service.ts:56`) refuses bidi marks and C0/C1 controls but not zero-width characters; `trim()` leaves them, and the database check uses `btrim` with spaces only.
- A lone surrogate (`"abc\ud800def"`) answers 201 and is stored as `abc�def`, changed with no warning. Both texts are quoted in the firm's email. **At fd1b65e0:** still present.

**B7 — Minor: from-alert keeps name-shaped ids, and they reach the stored alert and the description.**
- **Repro:** `detail.entityKey = "Jane.Doe_1985-04-12_passport_AB123456"`. **Observed:** 201.
- That text is stored in `source_alert` and appended to `description` (`service.ts:141`). After the draft is confirmed, the description is what gets emailed. The `Id` regex (`ports/alert.ts`, PF-23) only refuses spaces and "@".
- `detail.firmId: "zzz"`, or an upper-case firm id, is also kept verbatim in `sourceAlert`.
- The extra-field and email-address cases are refused (422).
- **At fd1b65e0:** still present.

**Not a finding for this row (noted only):** the system plane is "no `app.firm_id`", and `xr_app` can set that itself. Inside a firm transaction, `set_config('app.firm_id','',true)` followed by `plat_breach_list` returned 5 rows, and `plat_breach_open(…, 'seed:anything')` was accepted as the opener. This is PF-12/PF-21b's design, not something new here. The table owner (`xr_studio`) can `ALTER TABLE … DISABLE TRIGGER`, or UPDATE `decided_by`/`decision_reason` with no event; that is an owner power.

## What held
- **Role matrix (6 routes × 12 callers):**
  - Support, Admin, Billing and Content publisher: 403 `MISSING_PERMISSION` on every route.
  - Auditor, and the person holding every role except Owner: 200 on list and one; 403 on open, from-alert, patch and notices.
  - All 3 firm tokens: 403 `FIRM_SESSION_REFUSED`, also via `/api/platform/../system/...`.
  - No token, or a junk token: 401.
  - After all of these, the register held 1 row with its description unchanged. Each refusal is logged in `plat_system_audit`.
- **Walls (as `xr_app`):**
  - In firm A's session, all 3 tables read 0 rows. UPDATE touches 0 rows; DELETE and TRUNCATE are denied.
  - `plat_breach_json` on a forged row only sees its own fields, since it runs as the invoker under RLS.
  - Calling ready or record for another firm is refused. The register definers and `plat_breach_system_only` are refused inside a firm.
  - Patch keys `decided_by`, `opened_by` and `created_at` are ignored (`changed:false`).
- **History is kept:** UPDATEs of `opened_by` and `created_at` are refused, even as the owner. DELETE and TRUNCATE are refused on breach, event and notice. A recorded breach cannot go back to DRAFT (422).
- **Notified state is protected:**
  - Removing a notified firm → 409 `NOTIFIED_FIRM_KEPT`.
  - Setting the decision to UNDECIDED or NO_NOTICE after notices went out → 409 `DECISION_KEPT`.
  - Resending after editing the description and the decision → 409.
  - 6 parallel sends by 2 Owners, with mixed-case firm ids → exactly one 201 and five 409s, one email per person, and one firm-trail line.
- **Recipients:** only ACTIVE Owners and Admins. A SUSPENDED Admin is excluded. A firm with only a case officer → 409 `NO_RECIPIENTS`, with 0 outbox rows, 0 audit lines and no notice or event.
- **Preconditions:** an undecided breach, a NO_NOTICE breach and a draft all get no notice. From-alert sends nothing.
- **Input:**
  - 60 malformed bodies and queries answered 4xx: unknown fields, 4001 characters, `__proto__`, duplicate or null array items, 201 firms, the nil uuid → 404 FIRM_NOT_FOUND, no offset, year 1999 or 0000, bidi, NUL, array or string bodies, broken JSON, limit 0/501/abc/repeated, and a bad uuid in the path → 404.
  - A 3 MB body → 413.
  - Arabic, Chinese and Cyrillic text was stored intact.
  - The only 500 was B1's.
- **Volume:** 600 breaches × 200 firms, each with a 3000-character description, were written in 523 ms. The Auditor's list of 500 took 149 ms (5.1 MB, `truncated:true`). A PATCH to 200 firms took 27 ms.

Verdict: Changes 06bc784e1f2ba49eb5645f1df1247852e2a3a5dc
