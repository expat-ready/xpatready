# AUD-1a review: the audit trail in its own audit.prisma, insert-only at the database (runtime lane, R1.8 part 1)

Reviewer: fresh Opus 5.5 reviewer and breaker (P-278, P-303); I did not build this. Commit reviewed: **061823ebcf8ad9f18d9f9fc8ae7047dcd9bb4d07** (PR #2003). The PR head has since moved to 25c67eeb6 (one comment line in `audit.prisma`); that commit is not covered here.
Bar: the Build Lead C brief (`build-lead-c-briefs/AUD-1a.md` on `claude/build-lead-c-647b40`, which wins), the draft brief `design/briefs/AUD-1a.md` (touch list, delete exception, actor mapping, DW1-DW6), SA-11-3 and the recorded departures, and D1-D20 where they apply. This row has no screen, so the BIC table and D8-D14 are N/A.
Summary verdict: **Changes needed** (1 Blocker, 3 Majors). The last line holds the verdict.

## What I ran (own copy `rev_aud1a`, port 4608; never :4400)
* `check_aud1a_insert_only.ts 4608 xr_studio_rev_aud1a`: **31 passed, 0 failed**, 29.8 s.
* `check_prisma_schema.ts` (static, scratch shadow database): 8/8. A full `prisma migrate diff` on the demo-data copy names nothing of `audit_event` or `AuditActorType`. Its only output is drift that was already on `main` and is listed in that check's KNOWN list (`canonical_field_name`, four `id` defaults).
* Breaker probes, run as `xr_app` on the copy, all rolled back or on the throw-away copy:
  * An unknown word (`check`, `staff:`) is refused, naming the word. `system:test` maps to SYSTEM.
  * The grant: `xr_app` has no UPDATE or TRUNCATE on `audit_event`, but keeps DELETE (the recorded departure) and keeps DELETE on `workspace`.
  * The real reset (`POST /demo/reset`) removes a demo line carrying the `sample-firm` id.
  * A demo line carrying a non-Sample firm makes the reset fail with a bare 500 and changes nothing.
  * The orphan route in M1 below.
* Browser walk of Demo › Reset demo… at 1440 and 1024 px (Playwright, headless Chromium): done in 888 and 846 ms, no sideways scroll, no console or page errors.
* Code read: the full diff, every audit writer on `main`, and every test that writes, changes or deletes `audit_event`.

## Judged against the brief
* **Delete exception** (`migration.sql:94-101`): matches the ruled rule (key `demo`, firm null or `sample-firm`/`sample-solo`, the setting local to the transaction). It goes slightly further: the orphan branch also applies the firm rule (stricter, fine). DW2's breaker cases hold. See M1 for the gap.
* **Actor mapping** (`migration.sql:32-39`): exactly the ruling of Lead 61. App writers on `main` all pass mapped words:
  * `Audit.log` callers pass an `actor.id` from `ACTORS`/`RUNTIME_ACTORS`, `"rules"` or `"system"`.
  * `person-link.ts` passes `person:<id>`; `writeSetting`'s one app caller passes `RESET_ACTOR = "system"`; AuditPort writers are limited to `staff:`, `system:` and `seed:` by its schema.
* **Writers unchanged**: `@default(dbgenerated())` keeps `actorType` optional in `create`, and `migrate diff` is empty for the trail.
* **SA-11-3**: UPDATE and TRUNCATE are revoked from `xr_data`, `xr_app` and PUBLIC. DELETE is kept, as the brief records. DW1 runs every later migration first, so a later blanket GRANT would be caught.
* **Do the DW tests fail when they should?** I checked each against the change that would break it. Each one fails:
  * DW1: dropping the UPDATE branch or the REVOKE.
  * DW2: dropping the setting, demo-key or firm check.
  * DW3: dropping the `set_config` line in `wipe` (the reset returns 500).
  * DW3b: dropping the sweep's own transaction (the ghost line stays).
  * DW4: putting main's `deleteMany` back (500, not 409).
  * DW5: a changed mapping, or no fill trigger (NOT NULL error).
  * DW6: no migration.
* **DW4 dropping `library_change_one_open`** (`check_aud1a_insert_only.ts:178`): acceptable. That unique index already refuses the second writer, so the withdraw branch at `form-library.ts:282` cannot be reached in the real schema; the test can only reach it this way. It puts the index back at line 190, but not in a `finally` (see m3).
* **`governance.prisma:1` still says "the audit log"**, and so does `DEVELOPING.md:16`, with no row for `audit.prisma`. The brief says nothing else in `governance.prisma` changes, so the builder is right not to touch it. This is m4, for the row owner to allow a fix.
* **`check_fo2v_lead_visibility.ts` and the open Question**: it is one of the seven files in B1. The builder's proposal is the right shape:
  * Word-only changes to `system:<door>`. Widening the mapping to `test`/`check*` would infer a type, which SA-11 BR-3 forbids.
  * For fo2v's two UPDATEs: owner-only `session_replication_role = replica` on its scratch database.
  * The decision belongs to Build Lead C. Until then the Done-when list is not met.

## D1-D20 (where they apply)
D1 Partly: the build matches the brief, but the departures the brief requires are not recorded in the PR body (M2). · D2 Partly: insert-only holds; the platform lines can still be deleted (M1). · D3 N/A · D4 N/A · D5 Met: Reset works; a non-Sample line fails closed with nothing changed (m2). · D6 Met: every line gets `actor_type`. · D7 N/A · D8-D14 N/A (no screen; the Reset dialog is unchanged) · D15 Met: reset 0.2-0.3 s on the server; one query per table in the sweep. · D16 Partly: DW1-DW6 each pass and fail as named, but two Done-when suites are red (B1). · D17 simulated only · D18 Met: actor type, `firm_id` and `case_id` back-filled. · D19 N/A · D20 simulated only.

## Journey score (reviewer role; the one score for this check): **8.5 / 10**, no 0
Journeys walked: the content publisher resets the demo (main path, 1440 and 1024 px); reset with a Sample firm's line and with a non-Sample firm's line (error); two people propose a form role at once (DW4, real route); a writer with an unknown word (error); the orphan sweep after a raced reset.

Scores: task completed 1 · next step obvious 1 · plain words 1 · feedback and state 1 · correct data ½ (M1) · error recovery ½ (a bare 500 "Something went wrong" when a demo line carries a non-Sample firm, m2) · accessibility and sizes 1 (no UI change, no sideways scroll; axe not run) · speed 1 · visual 1 · trust and sources ½ (departures not recorded, M2).
The report is `screens/AUD-1a/journey-test-reviewer-2026-11-16.md`.

## Could not check
* The real shared demo database's `select distinct actor` (the local copies here are empty). If it holds a word outside the mapping, the migration stops the deploy, which is by design.
* A real screen reader and an intended user (D17/D20).
* `graph.mjs`: not run, because it rewrites `qa/graph.json`. The row adds no page or route.
* The suites other than this row's (run separately, as asked).

### Blockers
* **B1. Done-when suites fail at this commit.** The cause is the fill trigger (`migration.sql:76`) refusing test actor words written through `writeSetting` (`api/src/platform/settings.ts:134` writes `actor: w.by`).
  * Failure scenarios:
    * `check_pf4_identity.ts:458` uses `by: "check"`, so every accepted time zone returns false and the check at 461 fails.
    * `check_pf3_platform_schema.ts:187,190`: `aud_event_fill` fires before PF-3's own trigger, so the check sees the wrong refusal. Both suites are on the brief's Done-when list.
  * Also red, per the builder's own run and my reading:
    * `check_fo2_leads_prospects.ts` (206 and seven more lines)
    * `check_fo5_retainers.ts` (488, 672, 825)
    * `check_pf21v_views.ts:85`
    * `check_pf6b_permission_rules.ts:200`
    * `check_fo2v_lead_visibility.ts:51,101,105,127`
  * Fix: Build Lead C answers the open "Question for the tech lead", then the word-only changes land in this PR. Do not widen the mapping.

### Majors
* **M1. A platform-audit line can be deleted through the orphan branch** (`migration.sql:96-99`).
  * Failure scenario, run as `xr_app` in one transaction:
    1. `delete from workspace where key='platform-audit'`
    2. `set_config('app.audit_sample_reset','on',true)`
    3. `delete from audit_event where workspace_id = <its old id>`

    This removed the platform line whose `firm_id` was null (DELETE 1).
  * Every platform line written after this migration has `firm_id` null, because `audit-event.ts:30` puts the firm only in `detail.firmId` until AUD-1b. So the whole post-migration platform trail is open this way. That contradicts the departure as written ("never … a platform-audit line", P-571 (1)) and DW2.
  * The brief's reasoning ("that workspace is never deleted") is not enforced, and this PR's own `check_pf0p_ports.ts:291,299` deletes exactly that row.
  * Fix (in the migration): take the firm from `coalesce(OLD.firm_id, a uuid-shaped OLD.detail->>'firmId')` in both branches, or refuse a delete of the `platform-audit` workspace row. Add a breaker case for it to DW2/DW3b.
* **M2. The PR body lacks what the brief requires there.** Missing:
  * the departures from SA-11-3, SA-11 BR-1 and SA-11-14, word for word (Unconfirmed: no counsel)
  * the SEED departure
  * the two-way actor measurement
  * the count of non-uuid `firmId` lines left null
  * the contract gap
  * the screens-lane confirmation of the move
  * "Done when"
  Failure scenario: `pr-rules` is red on this sha ("MISSING: no Done when"), and the departure is undocumented when the release holder reads the migration (P-600 (5)).
* **M3. `module-cards` is red on this sha.** `form-library.ts` changed but `MODULE.forms.md` did not, and the PR body has no `Card unchanged: <reason>` line. Done-when requires the module-card check to pass. Fix: add that line to the PR body. The card is outside the touch list, so do not edit it.

### Minors
* **m1.** `check_pf0p_ports.ts:291,299` deletes the platform-audit workspace row instead of following the brief ("unique entity keys per run and count deltas"). It leaves orphaned platform lines that a reset would sweep on a shared database. Today it runs on a scratch database, so there is no harm yet. Fix: follow the brief.
* **m2.** `demo.ts:557`: one demo line with a non-Sample `firm_id` makes Reset a bare 500 with no words. In `demo.ts:598` the sweep's `catch` skips such an orphan silently on every pass. Neither is reachable until AUD-1b fills `firm_id`. Fix: a 409 in words, or a log line.
* **m3.** `check_aud1a_insert_only.ts:178-190`: the dropped index and the test trigger are put back only on success. A failure in between leaves the copy without `library_change_one_open`. Fix: a `finally`.
* **m4.** `governance.prisma:1` and `DEVELOPING.md:16` still name the audit log in `governance.prisma` (see above). This is for the row owner.

Verdict: Changes needed

---

## Re-review round 2: the diff `061823ebc..1bf3608a6` only (P-277). Head 1bf3608a6807893e183d02b7b20848ae6020bcf9

I read the diff of five commits: 25c67eeb6, 420d740a5, b146acb8d, 35d3b53e5 and 1bf3608a6.

I did not re-run the suites:
* `batch.done` was absent. The shared Prisma client is generated from main's schema, and checking out the head would change files the coordinator's runs use.
* Instead I applied the head's migrations, from `git archive`, to a scratch database (`xr_studio_rev_aud1a_r2`, dropped afterwards).
* I probed the triggers there as `xr_app`. The builder reports `check_aud1a_insert_only` 34/34 at 35d3b53 and the eight touched suites green.

**Earlier findings**
* **B1 closed.** The test words in the 7 files are now word-only (`system:test`, `system:check`, `system:check-pf21v`, `system:force-audit-failure` in both places in pf3), as Build Lead C ruled in comment 6924926768.
  * fo2v:101 and fo2v:105 back-date with `session_replication_role = replica` on the suite's own scratch database, then go back to `origin`, with the one-line comment.
  * `check_screen01_api.ts:222` uses the same pattern on the suite's own isolated copy (argv `DB`). It is the same kind of UPDATE, in a file on the touch list. Accepted.
* **M1 closed** (`migration.sql:104-106`). The firm is `coalesce(firm_id, detail->>'firmId')`, matched to a Sample firm by id (lower-cased) or by key. Probed as `xr_app`: delete the `platform-audit` workspace row, set the reset setting, then delete. A line whose `detail.firmId` is a real firm (upper-case uuid) is **refused**.
  * Every writer of platform lines on main writes `detail.firmId`: AuditPort (its schema requires it), `identity/audit.ts` and `settings.ts`.
  * Demo deletes still go through: a line with a Sample firm id, a key-valued firm, a JSON-array detail, and the case-close line (`case-close.ts:93` writes `detail.firmId`).
  * DW3b's new case (the "gonePlat" line) fails if the fix is taken out.
  * DW2b (1bf3608) passes on the workspace-key rule alone, so it does not guard M1. DW3b does.
* **M2 closed in substance.** The departures are word for word (SA-11-3, BR-1, SA-11-14), with "Unconfirmed: no counsel". The SEED departure, both measurements, the back-fill counts, the contract gap and "Done when" are in the body.
* **M3 closed.** The body has a `Card unchanged:` line for `MODULE.forms.md`.
* **m3 closed.** The index and the test trigger are put back in `finally`.
* **Breaker items:**
  * An explicit `actor_type` that is not the word's own type is refused (probe: `user-P` as OUR_STAFF).
  * The id after a prefix must have AuditPort's shape (`^(staff|system|seed):[A-Za-z0-9][A-Za-z0-9._:/-]*$`, and the same for `person:`).
  * Every actor word on main fits: `staff:<uuid>`, `person:<uuid>`, `system:sign-up`, `system:firm-created`, `system:complaint-ack-reminder`, `system:web-form`, `system:invitation-accept`, `seed:*`.
  * The new DW5 cases fail against the old code.

**Still open (Minor; none blocks)**
* **m1, m2, m4:** unchanged, as stated. They are Build Lead C's call and outside the touch list.
* **m5, new.** The orphan branch still lets a platform line be deleted, but only one with no firm at all or a Sample firm's.
  * Failure scenario: someone deletes the `platform-audit` workspace row and sets the setting. Then a Sample firm's settings lines, which reset writes on every run, can be deleted. My probe deleted exactly that line.
  * P-571 (1) says platform lines are never deleted. No path on main deletes that workspace row, and no writer on main writes a platform line without a firm.
  * Fix: AUD-1b fills `firm_id`, or a later row refuses deleting the `platform-audit` workspace row.
* **m6, the PR body is stale against the head** (read at 18:19 UTC). Update it before the label:
  * The delete-exception and departure text still say "`firm_id` null or Sample". The code now reads `detail.firmId` too, which is stricter.
  * The section Build Lead C requires is missing: "Outside the touch list (row owner's OK, comment 6924926768)", with the 7 files and their line counts.
  * The Question is still marked "(open)".
  * "Checks" is at 25c67eeb6, and the breaker changes and DW2b are not described.
  * I could not find the note the coordinator mentions recording m1, m2 and m4 as not changed.

**Could not check:** a run of `check_aud1a_insert_only` at 1bf3608 on my own copy (see above), and CI at the head (`module-cards` queued; `pr-rules` cancelled).

Reviewer: Approve 1bf3608a6807893e183d02b7b20848ae6020bcf9

Verdict: Approve
