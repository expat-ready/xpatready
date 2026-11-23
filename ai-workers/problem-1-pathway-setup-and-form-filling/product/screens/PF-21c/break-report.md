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

## Round 2 (head `cc7e9a4be2d24bd140e977afde0e6d606c9bfc3f`; scope: `git diff 06bc784e..cc7e9a4b` only)

**How:** I ran the row's own suite at this head: 46 passed, 0 failed. Then I ran a scratch script that reuses its harness: scratch Postgres databases, a Nest app on an ephemeral port, fake jobs, 2 Platform Owners plus Support, Admin, Auditor and a firm token. I also ran live checks on an isolated copy (`isolated.sh br21c 4631`, with local stand-ins) for the key, the role walls and a real notice. Nothing was left behind: the scratch databases and files are gone, and the copy is stopped. Live AI was off.

### Findings
**R2-1 — Minor (what is left of B3): a firm's session can still forge its own notice, or block it for good, by writing the outbox row first.**
- **Repro, as `xr_app` with `app.firm_id = A`:**
  1. Insert into `msg_outbox` with `idempotency_key = 'breach-notice:<breach>:<A owner id>'`, `state = 'SUPPRESSED'` and `subject_kind = 'STAFF'`. **Accepted.**
  2. Run `plat_breach_notice_record('<breach>', A, '[{"staffId":"<A owner>","outboxId":"<that row>"}]', '<real tpl>', 'staff:<Platform Owner id>')`. **The notice is recorded.**
  3. The real `POST …/notices {firmId:A}` then answers **409 ALREADY_NOTIFIED**, and nobody is emailed.
- If step 2 is skipped, the pre-written SUPPRESSED row is returned by `send()`'s idempotency lookup (`messages.ts:99-100`). The real send then answers NOT_DELIVERABLE every time, even after the suppression is lifted.
- **Cause:** the check at `migration.sql:400-407` asks only that a row with the key exists. It does not ask that the row was written by this transaction or that it is QUEUED.
- **Fixed:** the sender now needs an ACTIVE person holding the manage key. A deactivated person, an ended grant and an upper-cased id are all refused. A firm version under the platform template is refused by `msg_template_version_in_firm`.
- **Why Minor, not Major:** the attack needs the breach's id. A firm's session reads 0 register rows and first sees a breach id in its trail only after its own notice. The Owner's staff id is in the firm's own trail (`detail.staffId`, `by`) after any earlier notice.

**R2-2 — Minor (B6, partly fixed): many characters that show nothing still pass `plain()` (`service.ts:61`).**
- **Refused (422):** zero-width characters, U+FEFF, U+2028, LRM, and a lone surrogate at either end.
- **Still 201 as a description made only of them:** U+3164, U+2800, U+034F, U+180E, U+FE0F, U+2061-2064, U+115F/U+1160, U+FFA0, U+17B4, and Unicode tag characters (U+E0041…).
- `"Sample ok"` followed by 200 tag characters (hidden ASCII text) → 201. That text is quoted in the firm's email.
- On PATCH, `rootCause: "ㅤ"` → 200 and `containment: "⠀"` → 200. Containment is also quoted in the email.

**R2-3 — Minor (side effect of the B2 fix): each NOT_DELIVERABLE attempt leaves the rendered notice in the firm's file store.**
- **Repro:** a firm whose Owner and Admin are both suppressed, then 3 sends at once.
- **Observed:** 3× 409 NOT_DELIVERABLE, with 0 notice, outbox, trail or event rows (correct). But there are **6 orphan `msg/<firm>/outbox/<id>.json` files**, holding the breach description and the suppressed addresses.
- **Cause:** `send()` writes the file at `messages.ts:118`, before the transaction that `service.ts:242-244` rolls back. Nothing ever removes the files, so each retry adds two more.

**R2-4 — Minor (B7, partly fixed): `detail.rule` still reaches the description.**
- **Repro:** from-alert with `rule: "Jane.Doe_1985-04-12_passport_AB123456"` → 201. The description reads "…(audit_chain_break, rule Jane.Doe_1985-04-12_passport_AB123456)…" (`service.ts:149`).
- `PATCH {status:"RECORDED", description:<the draft words unchanged>}` → 200. Those words are then what the firm is emailed.
- `entity` and `entityKey` are now kept out of the text (fixed). `sourceAlert` still keeps `firmId` in upper case, verbatim; it is internal only.

### What held
- **B1:**
  - 20 rounds of a notice to E, a notice to F and `PATCH` (alternating `NO_NOTICE` and dropping E). Outcomes were only 201, 409 (`NOT_DECIDED_TO_NOTIFY`, `NOTIFIED_FIRM_KEPT`, `DECISION_KEPT`), 422 (`BREACH_FIELDS`) and 200.
  - **No 500 and no deadlock.** In the database, no notice was left for a firm that is no longer named or under a decision other than NOTIFY_FIRMS, and there were 0 orphan outbox rows.
  - The suite's held-open change test passes: the notice waits on `FOR SHARE`, then is refused.
- **B2:**
  - Everyone suppressed, 3 sends at once → 3× 409 `NOT_DELIVERABLE`, with nothing recorded.
  - After lifting the Admin's suppression: 201, with states QUEUED and SUPPRESSED, recorded honestly.
  - The suite's lift-then-resend → 201.
- **B4:**
  - 10 creates at once with one key → one 201, nine 200s and one row. The body has no `repeated`/`requestKey`.
  - Reordered JSON keys, or the quoted form of the key → 200, same breach.
  - Another body, the same body from the other Owner, a changed audit reason, or the key reused on from-alert → 422 `IDEMPOTENCY_KEY_REUSED`. The other user's breach id is not revealed.
  - Missing, empty, containing a space, 256 characters, non-ASCII, a lone quote, `""`, or the header sent twice → 400. 255 characters → 201.
  - A key whose first request failed (404 unknown firm) → the corrected body gets 201.
  - 4 concurrent requests with one key but different bodies and users → one 201 and three 422.
  - from-alert ×6 concurrent with one key: unknown firm (the fallback path) → one draft, `affectedFirms:[]`; known firm in upper case → one draft.
  - Repeating after a PATCH → 200 with the current breach. Repeating after the opener's grant ended → 403.
  - In the database:
    - the function is refused in a firm session;
    - a replay with another hash raises "key reused";
    - a malformed key or hash fails `plat_breach_facts_set`;
    - the key and hash appear in no event and no Auditor read.
  - **Live :4631:** missing → 400, 201, then 200 with the same id, the header twice → 400, another body → 422. A real notice → 201, then 409.
- **B5:**
  - Before a notice, the other Owner re-sending the same decision keeps `decidedBy` and `decidedAt` (no new event).
  - After a notice: the same decision and reason (even padded with spaces) → 200, still Owner 1. A new reason, UNDECIDED, or a mixed patch → 409 `DECISION_KEPT`. A description-only patch → 200.
  - Direct `UPDATE` of `decided_by` or `decision_reason` is refused by the trigger; `decided_at` is pinned.
- **m2:** confirming a draft without a description → 422. **m4:** the notice says "2026-11-23 04:30 UTC" for a discovery at 23:30 −05:00.
- **Path and firm id case:** upper-case breach id in the path and upper-case `firmId` → 201.
- **Permissions on every changed path:**
  - The Auditor gets 403 `MISSING_PERMISSION` on create and from-alert, with a fresh or a used key, live and in the harness. Support and Admin get the same.
  - A firm token gets 403 `FIRM_SESSION_REFUSED`, also via `/api/platform/../system/…`. No token or a junk token gets 401.
  - The guard answers before the key is read, so a refused caller cannot probe keys. The Auditor reads (200).
- **Noted, not a finding:**
  - The 400 hint says "the alert's own id is a good one", but the alert body has no id field. Two different keys for the same alert still make two drafts; the key answers B4's double-submit ask.
  - A partly suppressed firm, once notified, cannot be re-sent to the suppressed person. The notice records that person as SUPPRESSED.

Verdict: Approve cc7e9a4be2d24bd140e977afde0e6d606c9bfc3f (no Blocker or Major left; R2-1…R2-4 are Minor follow-ups)
