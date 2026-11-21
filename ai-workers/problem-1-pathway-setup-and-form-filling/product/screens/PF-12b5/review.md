# PF-12b part 5 review (QA-703): webhook_receipt behind PF-12's firm wall; the guard covers every firm_id table

Reviewed commit `d67f746d74ca89fd4e5c23ef615ce97b0d5815fa` (branch `claude/runtime-pf12b5`). I read only `git diff 0f260fae3 d67f746d`.
I checked it against Lead 17's ruling (QA-703 Minor): an additive later-stamped migration with ENABLE + FORCE RLS and the firm policy; the Stripe door's unmatched-customer path still working on its bypass use; the table on the walled list; the guard widened to every firm_id table; tests first.
I am a fresh session that did not build this row. Postgres was on :54329. The isolated copy used runtime port 4436, never :4400. This is a backend row with no screen, so the screen-only parts of the skill are N/A.

**Timing note.** At 19:20 UTC, during my review, the shared checkout moved to `da611793b`. That commit carries a breaker's fixes to `check_pf12_walls.ts` and `rollback.sql`, plus `break-report.md`. **This verdict covers d67f746d only.** `da611793b` needs its own review. I did not use the break report.

## What I ran
- `check_pf12_walls` **106/0** at d67f746d (the log shows d67f746d's test titles). `check_pf5_signup_billing` **94/0**.
- `check_pf3_platform_schema` 75/0 and `check_pf12b_bypass_audit` 70/0. These and `typecheck.mjs` (PASS, 15 known, 0 new) ran after HEAD moved. The app code, `migration.sql` and these suites are byte-identical between the two commits.
- **Tests first:** I took d67f746d by `git archive` and removed only the new migration. The suite then gave **5 webhook_receipt checks red**: guard pass, the "no silent entry" check, walled+gate, read isolation, write isolation. The 5 server-start reds in that run came from my partial archive, not from the code. The builder said 6; the gap is immaterial.
- **Readers of webhook_receipt** (`git grep` over api, tools, tests): only `billing/webhook.ts`.
  - `receive` runs as `asBypass("platform.billing.stripe-webhook")` (`webhook.ts:62`). `handle` is started synchronously inside that scope by `later()` (`:168`), so the scope carries through.
  - `sweep` runs as `asJob` → `job:platform.billing.webhook_sweep` (`platform-jobs.ts:69`, `firm-scope.ts:113`).
  - No reader runs as a firm or with no firm. Nothing in demo reset, demo-dump or the web reads it. The FO-7c Connect webhook is not built (see the note below).
- **The real walled server** (copy `rev_pf12b5`, the API as `xr_app`):
  - The unmatched event was stored and handled as `no firm matched`, with its firm-less `billing.no-firm-matched` line.
  - The matched event stored the firm, with one `platform.bypass` line on that firm.
  - A repeat was answered as a duplicate.
  - The 19:20 sweep read and updated a firm-less receipt (`retry 1`).
  - Details are in the journey report.
- **Migration** (`migration.sql:10-12`): ENABLE + FORCE, `pf12_firm` USING/WITH CHECK `firm_id = platform_session_firm()`, and the `0_pf12_firm_first` gate.
  - This is the same shape as `platform_subscription` (I compared `pg_policy`). The gate passes the BYPASSRLS roles.
  - No row, column or index changes. Stamp `20261122010000` is later than main's newest (`20261121230000`). The rollback order is right.
- **The nine FIRM_ID_ELSEWHERE entries:** on a database with every migration applied, I measured every non-family table with firm_id. There are exactly ten: the nine on the list plus webhook_receipt.
  - None of the nine can take the platform policy today. Case requests and case-side writers of audit_event and module_event run with no platform firm until CS-W3 and CS-W4. `runtime_case` already carries CS-W1's `xr_case_lookup` policy.
  - **So the list is not too long.** Three of the reasons are worded imprecisely (m3).

## Issues (no Blocker, no Major)
- **m1 (Minor, Should): `unguarded` lost coverage it had on main** (`check_pf12_walls.ts:85-86`).
  - On main its lines were filtered by `FAMILIES.test(l)`, so the family tables on EXCEPTIONS were also checked: the five catalogues, the two later catalogues and `platform_signup_pending`. The checks are an open policy for the app roles, a trigger function not owned by `xr_wall_reader`, and a missing first gate.
  - `walledScope` drops EXCEPTIONS (`:51`), so a plain trigger function on `platform_signup_pending` or `platform_plan` is no longer named.
  - Nothing is affected today: on a full database, the three raw queries return no line for any family table. The guard should still only widen.
  - Fix: in `unguarded`, scope by `(t) => FAMILIES.test(t) || walledScope(db)(t)`. Unchanged at `da611793b`.
- **m2 (Minor, Should): the "no stale entry" check cannot see the stale case it names** (`:119`).
  - It proves only that each entry still has a firm_id column. Its second clause repeats the guard pass at `:117`.
  - When CS-W4 walls `runtime_case` and the rest, those entries stay on the list. They then silently exempt the tables from `unguarded`'s policy, trigger and gate checks.
  - Fix: also require each FIRM_ID_ELSEWHERE table to be unforced (`not relforcerowsecurity`), so a walled table must leave the list and come under the guard. Or the list says CS-W4's twin owns them. Unchanged at `da611793b`.
- **m3 (Minor, Should): three exception reasons are not exact** (`:41-45`).
  - **Case tables:** they cite "CS-W3 owns the case-side walls". CS-W3 sets the firm on each call. The walls are **CS-W4**'s (`BACKLOG.md:1122-1123`, `briefs/CS-W4.md`).
  - **audit_event:** "through AUD-4's firmScope" is not what the code does. AUD-4 reads through its own `where`, with the firm first (`audit/firm-read/service.ts:3-5`). The CS-W4 brief gives audit_event's policy to the audit rows (AUD-1).
  - **module_event:** "read by the module jobs" leaves out that the firm-scoped readers (front-office timeline, billing account) sit beside case-side and cross-firm readers with no platform firm (`case-count.ts:32`, `prospect-won.ts:124`). Those cross-firm readers are why it cannot be walled now.
  - Fix: reword. No behaviour change.
- **Note for the tech lead, not this diff:** `design/briefs/FO-7c.md:42` plans `POST /api/hooks/stripe-connect`. That flow stores in `webhook_receipt` before the firm is found, "then `app.firm_id` set". After this wall, that store must run on its own named bypass use, or happen after the firm is resolved. The brief should say which before FO-7c starts.
- **Note on evidence:** `check_pf5_signup_billing` connects as the owner (`xr_studio`, superuser, `:115`), so its 94/0 does not exercise the wall. The real-server walk and the walls suite's DEMO lines (`:250-259`) do.

## Scores (D1–D20; backend row)
- **D1 9:** every point of the ruling is met. "The walled list" is read as the guard's scope plus the MODULE card invariant (no other list exists in the records).
- **D2 9:** a firm cannot read, write or move another firm's receipt or a firm-less one, at the database. Proven both on DEMO and on the copy.
- **D5 9:** receive, duplicate, handle and sweep all work on the walled server, and the migration is additive with a rollback.
- **D15 9:** one policy predicate per query on an indexed key (the receipt's unique key and firm index). No per-row requests.
- **D16 8:** tests first, with pass and fail for each rule and a probe for the widened guard. m1 and m2 are gaps in the guard's own tests.
- **D18 8:** the MODULE card invariant and `MODULE.rows/PF-12b5.md` are updated. m3 wording.
- **N/A:** D3, D4, D6, D7, D19; D8 to D14 (no UI). **D17 and D20:** simulated only. **BIC-01 to BIC-20:** N/A (no case-side screen).
- **Graph (P-86):** not run. `graph.mjs` rewrites `qa/graph.json`, which is outside my write scope. No route was added.

## Journey score (reviewer, the one score for this check)
**9.5 / 10, pass.** Details: `journey-test-reviewer-2026-11-22.md`.

## Could not check
- The PR body and CI on GitHub.
- `check_pf12b_doors` and `check_pf28_inputs` as whole suites at d67f746d. I ran pf28 against my own copy: 27/27, on the same app code.
- The breaker's findings at `da611793b`: firm_key tables, views, policies that mention the firm without walling. They are for that commit's review.

**Verdict: Approve d67f746d74ca89fd4e5c23ef615ce97b0d5815fa.** No Blocker or Major is open. m1 to m3 are recommended in the next push (they still stand at `da611793b`).

Reviewer: Approve d67f746d74ca89fd4e5c23ef615ce97b0d5815fa

---
## Re-review: head `6a6f14c305c22f6378aca0b1a259e48c86d6025a` (22 Nov 01:2x IST)
I read only `git diff d67f746d 6a6f14c3`, which has two commits: `da611793b` (the breaker's fixes) and `6a6f14c3` (my Minors). `migration.sql` has not changed since d67f746d. The reports were committed unchanged.

**What I ran:**
- `check_pf12_walls` **108/0** at 6a6f14c3 (shared tree, clean).
- **Mutation A:** I put `unguarded` back to `scoped(t)` only (m1 undone).
- **Mutation B:** I dropped the `relforcerowsecurity` clause (m2 undone).
- Both mutants ran **103/5**. The 5 reds are the server-start checks that my `git archive` copies cannot run, as in round 1. No guard check went red.

**The breaker's fixes (`da611793b`): accepted.**
- **M1:** `sideDoors()` names any public view that is not `security_invoker`, any materialized view, and any table or view outside public. Each has a probe at `check_pf12_walls.ts:149-155`. It is measured on the database built from migrations only. pg-boss's own schema, which the job runner creates at run time, is outside that database, so it is correctly not named.
- **M2:** the firm-column scan includes `firm_key`, and `case_client_counter` is listed as case side. The `pol` check now requires one of three exact `WALLING` shapes rather than a regex match. All policies on main match a shape, and the probe policy `... or true` is named.
- **The breaker's m1 and m4:** `Object.hasOwn` is used, and `rollback.sql` now deletes its `_prisma_migrations` row, as csk1's and csdl3's do.
- **The breaker's m2 left unchanged:** a firm session may write its own receipts. Agreed: this is the same policy as every walled table, and no path uses it.

**My Minors (`6a6f14c3`): all three fixed.**
- **m1:** `unguarded` filters by `FAMILIES.test(t) || scoped(t)` again (`:99-100`).
- **m2:** a listed table must be unforced (`:133`).
- **m3:** the reasons now name CS-W4, AUD-4's own filter, and module_event's cross-firm and case-side readers.

**New Minors (no Blocker, no Major):**
- **r1 (Minor, Should): the m1 and m2 fixes have no failing test.** Mutations A and B above both stay green. Fix:
  - add a probe trigger with a plain function on `platform_signup_pending` and expect `unguarded` to name it;
  - force one listed table in the scratch database, for example `case_party_index`, and expect the list check to fail.
- **r2 (Minor, optional): `WALLING` does not care which table a shape is on** (`:56-57`).
  - The `id = platform_session_firm()` shape walls only `platform_firm`.
  - The templates' read of firm-less rows, `r (firm_id IS NULL AND platform_session_firm() IS NOT NULL)`, would be accepted on any table. Given to `webhook_receipt`, it would let every firm read the unmatched receipts.
  - Fix: tie those two shapes to their tables (`platform_firm`, the `msg_template*` tables).
- **r3 (Minor, wording):** module_event's reason says "walled with the case side (CS-W4)". Neither the CS-W4 row nor its brief names module_event (the brief names only AuditEvent, for the audit rows). Say "owner not yet named", or have the tech lead give it to CS-W4.
- **For the tech lead in the PR:** the FO-7c note above. `briefs/FO-7c.md:42` stores into `webhook_receipt` before the firm is known, so it needs a named bypass use or must store after the firm is resolved.

Journey score unchanged: **9.5/10**. The app code and the migration are identical to the round-1 walk.

Verdict: Approve 6a6f14c305c22f6378aca0b1a259e48c86d6025a

Reviewer: Approve 6a6f14c305c22f6378aca0b1a259e48c86d6025a

---
## Re-review: head `7fa9cf464bdd0ac7ec20369d693d43820c5f2b2d` (22 Nov 01:4x IST)
I read only `git diff 6a6f14c3 7fa9cf46`. Only `tests/check_pf12_walls.ts` changed, plus my round-2 note, committed unchanged. The migration and the app code are unchanged.

**What I ran:**
- `check_pf12_walls` **110/0** at 7fa9cf46 (run alone, shared tree clean).
- Three mutants from `git archive` copies. Each turned its own probe red:
  - **A** (undo `FAMILIES.test(t) ||` in `unguarded`): the r1/r2 probe went red, because the trigger on `platform_signup_pending` was not named.
  - **B** (drop the `relforcerowsecurity` clause): the case_stage probe went red.
  - **C** (`walls` accepts any known shape on any table): the r1/r2 probe went red, because the template read on `platform_staff` was not named.
- **A slip on my side, already fixed:** I ran the mutants in parallel, so they clashed on the cluster-wide probe role `xr_pf12_probe_owner` later in the suite. That left the role behind. I dropped it and re-ran the head alone: 110/0, with no role or database left over. The probes above run before that point, so the mutant results stand. **Do not run this suite in parallel on one cluster.**

**My round-2 Minors, all fixed:**
- **r1:** the two probes fail when their rule is removed, as the mutants show. `listHolds()` is checked before and after forcing case_stage, and the table is put back.
- **r2:** `WALLING` now maps each shape to its tables. The id shape counts only on platform_firm, and the template read only on msg_template and msg_template_version. Unknown shapes are rejected through `Object.hasOwn`.
- **r3:** module_event's reason now says its wall has no owner row yet (the tech lead's).

No new findings. The FO-7c note stays with the tech lead in the PR. Journey score unchanged: **9.5/10**.

Verdict: Approve 7fa9cf464bdd0ac7ec20369d693d43820c5f2b2d

Reviewer: Approve 7fa9cf464bdd0ac7ec20369d693d43820c5f2b2d
