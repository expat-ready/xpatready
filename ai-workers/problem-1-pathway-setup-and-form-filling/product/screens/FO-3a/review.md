# Review: FO-3a part 1a, booking-type settings API (API only, PR #1918)

Reviewer: Opus 5.5, high effort. I did not build this. Date: 16 Nov. Commit reviewed: `c11de56465390ec26886da87496490940b103ca4` (diff `origin/main...c11de564`, 8 files, +704/−7).
The bar I reviewed against:
* the brief `lead-b-briefs/FO-3a.md` "Part 1a" (DW1-DW11), plus amendment A2 (`origin/lead-b-front-office:…/P-626-order.md`);
* AG-4-9, AG-4-10 and AG-4-8 (from the trace tool);
* concept `fo-3-booking` §5 (words) and §6;
* the [M] lines of STANDARDS §3-§8.

The working tree now holds the builder's uncommitted edits after c11de564 (`service.ts`, `types.ts`). I did not review them. Every result below comes from clean worktrees at c11de564.

## Suites at this commit
I ran each one in a clean worktree, on scratch databases on :54329 (never :4400). Live AI was off and nothing was paid for.
* `check_fo3a_booking_types`: 37 passed, 0 failed (9 s)
* `check_fo1b_booking_schema`: 80 passed, 0 failed (the migrate diff is clean)
* `check_fo3_booking`: 133 passed, 0 failed
* `check_fo3pa_public_answers`: 45 passed, 0 failed
* `check_fo3sa_any_time`: 39 passed, 0 failed
* `check_fo3sr_routes`: 29 passed, 0 failed

The branch merges cleanly with `origin/main` 74b0a25fb. `main` has no newer migration than `20261116090000`, and no change to these files since the merge base.

**Mutation spot-checks** (STANDARDS §7: a rule's test must fail when the rule is removed):
* Removing the version check fails DW6, DW8 and DW10.
* Removing `deletedAt: null` from staff create, from the public door or from the public list fails DW4 in each case.
* Removing the reserved-slug skip in `freeSlug` stops the suite with a 500.
* Dropping `firmScope` in `find` fails DW10 twice.
* Removing the audit call in `change` fails DW10.
* **Removing `FOR UPDATE` (`types.ts:276`) still gives 37/37.** My 8-way same-version race also stayed green without it. The lock is correct, but nothing proves it.

## Real app and API journeys (isolated copy :4438, real start-up, `PLATFORM_IDENTITY=local`, Sample seed)
* The feature file mounts: with no token the route answers 401, and a wrong path answers 404.
* As the Owner (user-R): create → 201, slug `free-consultation`, version 1. Then:
  * preview → 200, 8 days, with plain reasons. The Sample owner has no hours, so most days say "No host hours".
  * the public list shows the type.
  * PATCH with version 1 → 200. A second PATCH with version 1 → 409 with the concept's words and `version: 2`.
  * duplicate → "First consultation (copy)", slug `first-consultation-copy`.
  * switch-off → the public link gives the one not-found and the type leaves the list.
  * delete → 200 with `futureBookings`; the type is gone from the staff list.
* A Case Manager (user-T) editing, and a Case Officer (user-O) deleting → 403 `MISSING_PERMISSION`.
* A bad create → 400, with all three field messages at their fields.
* The database underneath: one audit line per action, each with before and after. The deleted row is kept, `version` is 4 and `created_by_staff_id` is set. Every call took 25 ms or less.

## Probes (a test harness copy at c11de564)
* 8 parallel PATCHes with one version → exactly one 200 and seven 409s; the version moved by one and one audit line was written.
* 4 parallel creates asking for one slug → one 201 and three 409s.
* Delete racing a PATCH resolves cleanly. A second delete → 404.
* A deleted type answers 404 to duplicate, switch-on, preview and PATCH.
* Unknown fields (`firmId`, `deletedAt`, `createdByStaffId`) → 400.
* 6 parallel creates of one name → three 201s and three P2002 failures, after the 3-try limit at `types.ts:261`. In the real app the error filter (`main.ts:210`) turns these into 409. In a bare module they are 500s.
* The rest are listed under Minors.

## The builder's seven choices, judged
1. **`this.booking["slotsFor"]` read by brackets: accepted.** TypeScript still type-checks the name, so a rename breaks the build. DW9 proves the preview equals the public slots. The PR should name it, and 1b, which may touch `service.ts` reads, should make it a public method.
2. **Two extra empty-day reasons: accepted.** Without them, a day inside the notice would be mislabelled "Fully booked" or "No host hours". But the words are not in concept §5, and past days also say "Inside the shortest notice". Name both for Lead B and FO-3st3 (m5).
3. **Colours C1-C8 as Sample: correct.** No `code/` capture exists in this copy. The PR body must say so (M3).
4. **PAID_CONSULT refused with 400: matches the brief.** Lead B must confirm it in the PR (M3).
5. **OTHER not public: not accepted (M1).** It deviates silently from AG-4-10 rule 4. The PR's own schema comment says the opposite. The change is inside A2's scope, since it is the `where` of the same lookups.
6. **Audit detail: sound.** Free text is kept as "<n> characters"; that is the AuditPort's ids-and-facts rule (`ports/audit.ts:15-22`). But the summary still carries the raw name (m4).
7. **`created_by_staff_id` without a foreign key: accepted.** It is history only, staff rows are never deleted, it matches `fo_time_off.created_by`, and the migration says so.

## Checks asked for
* **Permissions: no gap.** Every route declares its key and the guard denies by default. Results:
  * Case Manager: 403 on every write, 200 on reads and preview.
  * Billing and finance: 403 on list and preview.
  * No sign-in: 401.
  * The service has no `need()` check of its own (BookingService does); this is not required.
* **Cross-firm:** reads, writes and preview of another firm's type all give 404. Another firm's host → 400. `change`'s update at `types.ts:280` uses a bare `{ id }`, but only after a firm-scoped find and a firm-scoped lock in the same transaction, so it is safe.
* **Slug:**
  * "manage" is refused on create and on edit (400).
  * A made slug skips it ("Manage" → `manage-2`).
  * A database CHECK backs this up.
  * The partial unique index frees a deleted type's slug (DW2, DW11).
  * No `upsert` on `firmId_slug` exists anywhere, so the partial index is safe with Prisma.
* **A deleted type is never bookable** (door, list, staff create). Its bookings stay manageable by id and by link (`byToken`, `move` and `cancelBooking` read the type by id, as rule 5 wants).
* **Refused writes write no audit line:** DW10, plus my probe on guard denials.

## Journey score (reviewer; the one score for this check): 7½/10, below the pass mark
API journeys, not a browser. Accessibility and visual quality are N/A for an API and are counted 1. FO-3st3 carries them.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Create, edit, duplicate, switch, delete and preview all worked on the real app |
| Next step obvious | ½ | `version`, `onBookingPage` and `futureBookings` are given. An OTHER type with "Show on booking page" on answers `onBookingPage:false` with no reason |
| Plain words | ½ | The concept's words are used, but the two extra reasons are not concept words, and past days say "Inside the shortest notice" |
| Feedback and state | 1 | A 409 carries the current version; field errors come back per field |
| Correct data | ½ | OTHER is never public (M1); a NUL byte in a description is not refused at its field (M2) |
| Error recovery | ½ | Stale and slug conflicts recover cleanly. NUL → 404 "Not found". 4 or more parallel same-name creates are refused |
| Accessibility, sizes | 1 | N/A (API only) |
| Speed | 1 | 25 ms or less per call |
| Visual quality | 1 | N/A (API only) |
| Trust and sources | ½ | Sample colours are labelled in the schema, but not in the PR |

What would raise it, most valuable first: M1, then M2, then M3, then m5.

## Blockers
None.

## Majors
* **M1. OTHER can never be public** (AG-4-10 rule 4: "Other (OTHER): public").
  * Where: `service.ts:213, 231` and `types.ts:108` accept FREE_CONSULT only, while `front-office-booking.prisma:18` says "FREE_CONSULT and OTHER may be public".
  * Effect: an Owner can save an OTHER type with "Show on booking page" on, and it silently never shows.
  * Fix: add OTHER to the two `where`s and to `isPublic` (inside A2), with a DW7 pass case. Otherwise name the hold in the PR, get Lead B's confirmation, and correct the comment.
* **M2. Description has no character rule** (`types.ts:69`).
  * Effect: a NUL byte reaches Postgres. `main.ts:213` maps "invalid byte sequence" to 404 "Not found", and nothing is saved. Control and bidirectional characters save with 201 (break-report M2).
  * This breaks STANDARDS §4 [M] (Problem Details with field-level messages) and §8 [M] (validation).
  * Fix: apply the rule the name and the cancel reason already use (`service.ts:145-151`), keeping line breaks. Answer 400 on `description`, with a pass and a fail test.
* **M3. The PR body is still the draft plan.** The brief requires:
  * the DW1-DW11 list first (P-606);
  * which colour values were used ("say which in the PR");
  * Lead B's confirmation of PAID_CONSULT.

  It must also name the holds the reviewer and Lead B decide on: choices 1, 2 and 5, and m8 below.

## Minors (fix or name; none blocks)
* **m1. Parallel creates or duplicates of one name** fail after 3 tries (`types.ts:248-262`): 409 in the real app, 500 in a bare module. There is no duplicate row and no data at risk, and it needs 4 or more writers at once, so I rate it Minor, not the breaker's Major. Fix: a per-firm lock around `freeSlug` and the create.
- m2. Nothing proves the `FOR UPDATE` row lock (see mutations). Add a parallel stale-save case.
- m3. A no-op PATCH (`{version}` only) or a repeated switch-on bumps the version and writes an audit line with `fields: []` (`types.ts:280-282`). It makes another editor's open form stale for nothing.
- m4. An email-shaped name is redacted in `detail`, but the summary keeps it word for word (`types.ts:158, 182, 282`).
* **m5. Preview reasons:**
  * past days say "Inside the shortest notice" (`types.ts:218`);
  * the two extra reasons need concept words;
  * a switched-off, case or hidden type previews slots with `reason: null`, though a visitor gets the not-found (AG-4-8 rule 1, "exactly the slots a visitor will see"). Give a top-level reason.
- m6. A non-active staff member is accepted as a host (`types.ts:239-243`). The preview then says "This type has no host".
- m7. Name and description lengths count UTF-16 units, not characters. Duplicate's `slice(0, 73)` can split an emoji (`types.ts:60, 69, 178`; break-report m2-m4, read but not re-run by me).
- m8. The type is read outside the booking's transaction (`service.ts:213/344` → `create` at :430). A switch-off or delete that commits in between still books. Writes are outside A2, so name this for 1b or FO-3vr.
- m9. The duplicate's audit line leaves out the per-type timings it copies: `AUDITED` (`types.ts:118`) has no gap, notice or window field.
- m10. Idempotent creates (STANDARDS §3 [M]): a double submit makes two types (`x`, `x-2`) and there is no key. Name it for FO-3st3 or add a key.
- m11. Names with no Latin letter all get slugs `type`, `type-2`, … (`types.ts:102-105`). Name it as a known limit.
- m12. `graph.mjs` G3 lists 7 booking-types routes as reached by no test. This is a false positive: the test builds its paths in `T()`, and I saw every route answer. Literal paths would let the graph see them.

## Could not check
* No browser, axe, widths or keyboard: the row is API only.
* No real screen reader or intended user (D17 and D20 stay with the founder).
* I did not read the demo database for an existing `manage` slug. The migration's CHECK would stop on one; no seed makes it.
* I did not run the qa walk suites that need their own copies (`check_r1_fo3_tz_walk`, `check_r140_*`, `check_qa470_*`), and I did not see CI.
* I did not run graph.mjs in this folder, because it rewrites `qa/GRAPH.md`. It ran in a scratch worktree.

Verdict: Changes requested

## Re-review at `eff3e4a8ad88cf3881d4154d7072ff65f32bb2db` (diff `c11de564..eff3e4a8` only, P-277)

**Suites at this head.** I ran each one in a clean worktree on scratch databases on :54329 (never :4400).
* `check_fo3a_booking_types`: 46/46
* FO-1b: 80/80
* FO-3: 133/133
* FO-3pa: 45/45
* FO-3sa: 39/39
* FO-3sr: 29/29

**Mutations.** Each fix's test fails when the fix is removed:
* `FOR UPDATE` → DW6, the 6-way race test
* `slugLock` in insert → "break M1 pass"
* OTHER in the door's `where` → "break M3 pass"
* `TEXT_CONTROL` → "break M2 fail"
* the ACTIVE host check → "break m6 fail"
* the no-op return → "break m5 fail"

The one exception is `said()`: making it a no-op still gives 46/46 (m13).

**My first-pass findings**
* **M1 is closed.** `service.ts:213, 231` and `isPublic` accept FREE_CONSULT and OTHER, and the schema comment matches. My probe: an OTHER type is listed and bookable; changed to FOLLOW_UP it leaves the list at once.
* **M2 is closed.** A description refuses control characters (line breaks and tabs are kept), bidirectional and invisible characters, and lone surrogates, answering 400 on the field. Names do the same, and lengths count code points, as the database's `char_length` does.
* **M3 is closed.** The PR body now has:
  * the Done-when list first;
  * the checks;
  * colours named Sample;
  * the choices named;
  * questions to Lead B (PAID_CONSULT, the empty-day reasons).
* **m1-m7 and m9 are closed.** The probes behind that:
  * a slug edit racing 4 same-name creates gives 200 / 409 `SLUG_USED` / four 201s (no deadlock: row lock, then the firm lock, never the other way round);
  * a no-op save with a stale version still answers 409;
  * an email-shaped name is masked in both summaries.
* **Named in the PR for later:** m8 (1b or FO-3vr), m10 (FO-3st3), m11 (known limit), m12 (graph). Accepted.

**New in this diff**
* **M4 (Major). A type with a suspended host can no longer be duplicated.**
  * Cause: `duplicate` (`types.ts:191`) sends every copied host through `insert` → `checkHosts` (`types.ts:269`), which now counts only ACTIVE staff (`types.ts:259`).
  * Probe: a type with hosts [Owner, Admin]; Admin suspended; `POST /:id/duplicate` → 400 "Choose hosts from your firm's staff." on `hostStaffIds`. That field is not in the request, since the route takes no body.
  * Why it is Major: AG-4-9 rule 3 and DW3 say a duplicate copies every field and child row. A suspended host is a normal state, and the edit path already keeps existing hosts (break m6's own rule: "a host already on the type stays").
  * Fix: copied hosts skip the ACTIVE check (check only hosts not on the source), with a DW3 pass case "duplicate of a type with a suspended host copies its hosts".
* m13 (Minor). No test fails when `said()` is removed. Add an email-shaped name to the DW10 audit case.
* m14 (Minor). Reordering the same hosts counts as an edit: the version goes up and an audit line is written. This is harmless, but FO-3st3 should send hosts in a stable order.
* **The new words** "In the past" and "Description cannot hold control or invisible characters." are not concept words. "In the past" is already put to Lead B in the PR. The description message should join that question.

**Journey score at this head: 9½/10.**
* Correct data stays ½, because of M4.
* Next step obvious, plain words, error recovery and trust each go to 1.
* Plain words is 1 only on the condition that Lead B rules on the words.

**Blockers:** none. **Majors:** M4. **Minors:** m13, m14 (m8, m10-m12 are named in the PR).

Verdict: Changes requested

## Re-review 2 at `6ea08284c84bc364102055cacbb3b674fb7a688d` (diff `eff3e4a8..6ea08284` only, P-277)

**Suites at this head.** I ran them in a clean worktree on scratch databases on :54329.
* `check_fo3a_booking_types`: 48/48
* `check_fo1b_booking_schema`: 80/80

`service.ts` is unchanged since eff3e4a, so the FO-3, FO-3pa, FO-3sa and FO-3sr results from Re-review 1 still hold.

**M4 is closed.** `insert` (`types.ts:269`) now skips the host check for a duplicate (`fromId` set). The source's hosts were checked in the firm when they were set, and the source is read under `firmScope`, so no other firm's staff can come in this way.
* Test: "DW3 pass: duplicating a type whose host was suspended since copies its hosts".
* Putting the check back for duplicates makes that test fail (47/48).

**m13 is closed.** Test: "DW10 fail: an email-shaped type name is kept in neither the audit summary nor its detail". Making `said()` a no-op makes it fail (47/48).

**m14 is withdrawn.** The host order decides which free host takes a slot (AG-4-12 rules 2 and 5, `slots.ts`). So a reorder is a real change, and it is right that it is versioned and audited.

**Words, Minor, not blocking.** The PR's questions to Lead B name "In the past" (in choice 3). The description message "Description cannot hold control or invisible characters." is not in the PR body yet. Add it to the same question before the label.

**Journey score at this head: 10/10.** Correct data goes to 1 now that M4 is closed. As before, accessibility and visual quality are counted as met because they are N/A for an API; FO-3st3 carries them.

**Blockers:** none. **Majors:** none. **Minors open:** the description wording question above. m8, m10, m11 and m12 are named in the PR for later.

Verdict: Approve 6ea08284c84bc364102055cacbb3b674fb7a688d

## Re-review 3 at `42360d87c1977f8bd15ba7e73fc2b101d8d5df22` (diff `10045039..42360d87` only, P-277)

**What the diff is.** `1004503` is a records commit; against `6ea0828`, which I approved, it changes no code. The diff is one line: `types.ts:253`, in `futureBookings`. The status list for Prisma's `in` loses `as const` (a readonly tuple, which CI's `types` check refused with TS2322) and becomes a mutable `("SCHEDULED" | "RESCHEDULED")[]`. The values are the same and the query is the same, so behaviour does not change.

**Type check** (`product/tools/typecheck.mjs`, run in a clean worktree):
* At the parent: 9 new errors. One is the CI error: `settings/types.ts(253): TS2322 … readonly ["SCHEDULED", "RESCHEDULED"]`.
* At this head: 8 new errors, none in a file this PR touches.
* All 8 are "Cannot find module 'ajv' / '@anthropic-ai/sdk'" (TS2307), with two follow-on TS7006 errors, in `../p2/*` and `../contracts/portal-capture.ts`. They come from this cloud copy, which lacks those packages, and they are identical at the parent. CI installs those packages, so its result is the one that counts.
* `tsc web`: 0 errors.

**Test:** `check_fo3a_booking_types` passes 48/48 at this head. No other suite's inputs changed.

**Blockers:** none. **Majors:** none. **Minors open:** as in Re-review 2 (the description wording question for Lead B).

Verdict: Approve 42360d87c1977f8bd15ba7e73fc2b101d8d5df22

## Re-review 4 at `27749b65ae280d5f268c978cbac2e4a3046b31ea` (merge of `main` ddc6e919c, FO-3m #1831; P-270)

**Parents.** The merge's first parent is `b38c4fa`, a records commit with no code change from `42360d8`, which I approved. Its second parent is `ddc6e919c`.

**Was the resolution right?** I re-merged the two parents mechanically with `git merge-tree`.
* Only `front-office/MODULE.md` conflicts; `service.ts` merges by itself.
* The committed merge differs from that automatic merge in `MODULE.md` alone: the conflict block is resolved and nothing else changes.
* On the card, the **Tests.** line keeps both `check_fo3m_answers.ts` (from main) and `check_fo3a_booking_types.ts` (from this branch).
* Both new invariant lines are kept: FO-3a's deleted-type line and FO-3m's attendance line.
* Nothing from either side was lost: compared with main, the card differs only by FO-3a's entry points, its invariant and its test.

**`service.ts` compared with main** (`git diff ddc6e919c 27749b65`): exactly the three `where` lines, as A2 allows.
* the public type: `deletedAt: null`, purpose FREE_CONSULT or OTHER;
* the public list: the same;
* staff create: `deletedAt: null`.

FO-3m adds no new lookup that picks a bookable type. Every other type read still goes by the booking's own id, so a deleted type's bookings stay manageable.

The PR still touches the same 8 files compared with main (+769/−7). Its migration `20261116090000` is still the newest.

**Suites on the merged tree** (clean worktree, scratch databases on :54329, never :4400):
* `check_fo3a_booking_types`: 48/48
* `check_fo3m_answers`: 14/14
* FO-3: 133/133
* FO-3pa: 45/45
* FO-3sa: 39/39
* FO-3sr: 29/29
* FO-1b: 80/80, with the migrate diff clean

**Type check** (`typecheck.mjs`, 8 GB heap):
* `tsc web`: 0 errors.
* `tsc api`: the same 8 environment-only errors as in Re-review 3, all missing `ajv` or `@anthropic-ai/sdk` in `../p2` and `../contracts`.
* No error in a studio file.

**Blockers:** none. **Majors:** none. **Minors open:** as in Re-review 2 (the description wording question for Lead B).

Verdict: Approve 27749b65ae280d5f268c978cbac2e4a3046b31ea

## Re-review 5 at `1d66488c529665dfa8094dab3e9a1088498b5df3` (merge of `main` b1161b4df, FO-2v #1933; P-270)

**Parents.**
* First parent: `8e62f9d`, a records commit with no code change from `27749b6`, which I approved in Re-review 4.
* Second parent: `b1161b4df`.

**Was the resolution right?** I re-merged the two parents mechanically with `git merge-tree`.
* Only `front-office/MODULE.md` conflicts.
* The committed merge differs from that automatic merge in `MODULE.md` alone: the conflict block is resolved and nothing else changes.
* The **Tests.** line keeps main's `check_fo2v_lead_visibility.ts` and this branch's `check_fo3a_booking_types.ts`.
* Main's new FO-2v invariant (lead visibility) and FO-3a's deleted-type line are both kept.
* Compared with main, the card differs only by FO-3a's entry points, its invariant and its test.

**`service.ts` compared with main** (`git diff b1161b4df 1d66488c`): still exactly the three `where` lines. Between `ddc6e919c` and `b1161b4df`, main changed nothing under `api/src/front-office/booking/`, `prisma/` or `ports/`; its changes are FO-2v sales, the web modules, packages and tests. The PR still touches the same 8 files compared with main (+769/−7), and `20261116090000` is still the newest migration.

**Suites on the merged tree** (clean worktree, scratch databases on :54329, never :4400):

| Suite | Result |
|---|---|
| `check_fo3a_booking_types` | 48/48 |
| `check_fo3m_answers` | 14/14 |
| `check_fo2v_lead_visibility` | 14/14 |
| FO-3 | 133/133 |
| FO-3pa | 45/45 |
| FO-3sa | 39/39 |
| FO-3sr | 29/29 |
| FO-1b | 80/80, migrate diff clean |

**FO-3w browser suite: not re-run by me.**
* In a worktree, the sandbox refuses the path to the database's data folder, which `isolated.sh` checks.
* In this working copy, the suite would rewrite tracked screenshots in `screens/fo-3-booking/screenshots`, and I am not to edit other files.
* So 67/67 at :4531 is the builder's evidence, not mine. CI's run is the one that counts.
* The suite builds its types by direct database writes and does not depend on the purpose filter. Its header comment ("The schema has one purpose (FREE_CONSULT) … a retired type stands in", `check_fo3w_booking_browser.ts:9`) is out of date now that CASE_REVIEW exists. That is a follow-up for FO-3w's row, not this PR's.

**Blockers:** none. **Majors:** none. **Minors open:** as in Re-review 2 (the description wording question for Lead B).

Verdict: Approve 1d66488c529665dfa8094dab3e9a1088498b5df3

## Re-review 6 at `4941dc7aa4211982a2f30f56250eba6ff6fe9584` (merge of `main` 5932cf516: FO-4sf #1962, PF-12 firm walls and others; P-270)

**Parents.**
* First parent: `c739039`, a records commit with no code change from `1d66488`, which I approved in Re-review 5.
* Second parent: `5932cf516`.

**Was the resolution right?** I re-merged the two parents mechanically with `git merge-tree`.
* Only `front-office/MODULE.md` conflicts; `service.ts` merges by itself.
* The committed merge differs from that automatic merge in `MODULE.md` alone.
* A word diff of the card against main shows exactly FO-3a's three additions, and nothing of main's is dropped:
  * the booking-type routes sentence, after "create takes `hostStaffId` (an active host of the type).";
  * the deleted-type invariant line;
  * `tests/check_fo3a_booking_types.ts` on the **Tests.** line.
* Main's new FO-4sf `source` filter, `GET leads/sources`, the PF-12 walls invariant line and `check_fo4sf_source_filter.ts` are all kept.

**Correction to the request: main did change `booking/service.ts`.**
* PF-12 changed it: `publicFirm` and `byToken` now find their firm through `asBypass` and then `enterFirm`.
* It merged by itself, and against main the file still differs only by the three `where` lines (A2).
* The PR still touches the same 8 files compared with main (+769/−7).
* PF-12's `20261116013000_pf12_firm_walls` comes before `20261116090000_fo3a_booking_types`, so ours is still the newest migration.

**The PF-12 walls and this PR.**
* PF-12 forces row-level security on `fo_consultation_type`. The API now connects as `xr_app`, with the firm taken from PF-4's guard for each request.
* This PR adds no table; it only alters the columns of an already-walled one. So no new policy is owed (`check_pf12_walls`: "every later firm table ships its policy").
* The proof the new routes run behind the walls: I removed `firmScope` from the service's `find` and `list` (`types.ts:248`, the list's `where`). The cross-firm DW10 cases still passed, 48/48, because the database hid firm B's rows. At c11de564 the same mutation failed DW10.
* Raw `FOR UPDATE`, the advisory slug lock and the preview's shared `slotsFor` all run in the request's firm (a transaction keeps the firm of the context that opened it, as `firm-scope.ts` says).

**Suites on the merged tree** (scratch databases on :54329, never :4400):

| Suite | Result |
|---|---|
| `check_fo3a_booking_types` | 48/48 |
| `check_fo3m_answers` | 14/14 |
| FO-3 | 133/133 |
| FO-3pa | 45/45 |
| FO-3sa | 39/39 |
| FO-3sr | 29/29 |
| FO-1b | 80/80, migrate diff clean |
| `check_pf12_walls` | 100/100 |

`check_pf12_walls` was run from this working copy, which is at 4941dc7 and writes no tracked file. In a scratch worktree, its five checks that start their own server stop with a module-path error from the symlinked `node_modules`; that is an environment fault, not the code.

**Blockers:** none. **Majors:** none. **Minors open:** as in Re-review 2 (the description wording question for Lead B).

Verdict: Approve 4941dc7aa4211982a2f30f56250eba6ff6fe9584

## Re-review 7 at `6bdaeb715cdf940c619a919b2cb9e4e39f7a455f` (diff `0017341a..6bdaeb71`: merge of `main` f7dde02c8 plus one test edit)

**The merge (`ea5a08e`) is clean.** `git merge-tree` of its parents gives a tree identical to the commit, with no hand edits.
* `0017341` is a records commit with no code change from `4941dc7`, which I approved in Re-review 6.
* Against main, the PR is the same 8 files plus the FO-3w test edit (9 files, +777/−12).
* `service.ts` still differs from main only by the three `where` lines.
* Main brought `20261116030000_fo7mv_move_list`. Our `20261116090000` still comes after it and is still the newest migration.
* No product code in this PR changed.

**The edit to `check_fo3w_manage_browser.ts` (`6bdaeb7`): it keeps QA-496's intent ("the manage route beats a type slug"). Accepted.**
* Before this PR, a type could be stored under the slug `manage`, and the suite seeded one to show the router still opened the manage page there. This PR's CHECK (`fo_consultation_type_slug_reserved`) now makes such a row impossible. A database holding one could not even run the migration, and no seed or tool makes one (`git grep`). So the seed had to change. Weakening the CHECK would have been wrong.
* The route-order proof still stands:
  * routes.tsx declares `/book/:firmKey/manage` before `/:slug`;
  * on the real app, `/book/maple/manage#<token>` opens the manage page;
  * `/book/maple/manage` with no token must show the manage page's bad-link text.
* That last case still tells the two routes apart: if the type route won, the page would ask for slug `manage`, get the API's 404, and show "This page is not available.", not the bad-link text.
* Its new type, "Manage" at `manage-2`, and the "Choose a time" check add little but do no harm.
* The new fail-side case, "the database refuses a type stored under the slug manage", moves the old premise onto the rule that now carries it.
* The header comment now says why.
* One request: this edits FO-3w's suite, which is outside this PR's touch list. The edit is forced by this PR's database rule, so name it in the PR body and tell FO-3w's row owner (P-606: never widen silently).

**Suites on the merged tree** (scratch databases on :54329, never :4400):

| Suite | Result |
|---|---|
| `check_fo3a_booking_types` | 48/48 |
| FO-3 | 133/133 |
| FO-3pa | 45/45 |
| FO-1b | 80/80 |
| `check_fo3w_manage_browser` | 50/50, all five QA-496 checks passing |

How I ran `check_fo3w_manage_browser`:
* The isolated copy ran on :4439, started from this working copy at 6bdaeb7.
* The suite itself ran from a scratch worktree at the same commit, using that copy's web build, so its screenshots did not touch tracked files.
* I did not re-run `check_fo3w_booking_browser`; its 67/67 is the builder's evidence.

**Blockers:** none. **Majors:** none. **Minors open:**
* the description wording question for Lead B (Re-review 2);
* naming the FO-3w test edit in the PR body.

Verdict: Approve 6bdaeb715cdf940c619a919b2cb9e4e39f7a455f

## Re-review 8 at `048511e810bd94903f388abfde92090fd406a2a2` (merge of `main` bfac889d7, #1997 PF-Fd; P-270)

**Parents.** First parent `2f4ad0a`, a records commit with no code change from `6bdaeb7` (approved in Re-review 7); second parent `bfac889d7`.

**Resolution.** `git merge-tree` of the parents conflicts only on `front-office/MODULE.md`. The commit differs from the automatic merge in that file alone. A word diff of the card against main shows exactly FO-3a's three additions:
* the routes sentence;
* the deleted-type rule;
* `tests/check_fo3a_booking_types.ts`.

Main's new `files.ts` `LocalFiles` entry (PF-Fd) is kept.

**Since the merge base `f7dde02c8`,** main changed only `front-office/files.ts` and the card under front-office, prisma, firm-scope, core and the FO-3w manage suite. Nothing under `booking/` changed. Against main:
* `service.ts` is still the three `where` lines;
* the PR is still 9 files (+777/−12);
* FO-7mv's `20261116030000` is still before our `20261116090000`.

**Suites on the merged tree** (clean worktree, scratch databases on :54329): `check_fo3a_booking_types` 48/48, FO-3 133/133, FO-3pa 45/45, FO-1b 80/80. I did not re-run FO-3m, FO-3sr or FO-3sa: none of their inputs changed since Re-review 7.

**Blockers:** none. **Majors:** none. **Minors open:** as in Re-review 7 (the description wording question; name the FO-3w test edit in the PR body).

Verdict: Approve 048511e810bd94903f388abfde92090fd406a2a2

## Re-review 9 at `5f43cb17283b2853693c6901d3e63ad2db9e2ec0` (diff `3037c7cb..5f43cb17`: the card rewrite `c0557bc` + a merge of `main` e758e1568)

**Merge.** It is clean: `git merge-tree` of the parents gives a tree identical to the commit. `3037c7c` is a records commit with no code change from `048511e` (approved in Re-review 8).

**Correction to the request.** Main brought more than new `ports/` files:
* `api/src/case-count.ts`, `runtime.ts` and `front-office/render/gotenberg.ts`;
* the platform complaints web pages;
* qa suites, among them `tests/qa/check_r138_r140_booking_page_walk.ts`. That walk seeds its type through Prisma with slug `free` and the default purpose, so it is compatible with this PR.

Nothing under `booking/` or `prisma/` changed. Against main:
* `service.ts` is still the three `where` lines;
* FO-7mv's `20261116030000` is still before our `20261116090000`.

**The card (`api/src/front-office/MODULE.md`): accurate, and complete for this PR. Accepted.**
* Against main, the diff adds 5 lines at the end and changes none of main's lines. Future one-line edits elsewhere on the card will merge by themselves.
* Every fact checked against the code at this head:
  * the routes and their keys match `types.controller.ts` (prefix `api/front-office/booking-types`; list and preview on `agent/booking-event-type:list`, every write on `…:edit`);
  * the invariant matches the three `where` lines, the soft delete, the partial unique index and the version check;
  * `foConsultationType` was already on **Tables.** (no new table);
  * the test is named.
* The card is 39 lines (the limit is 40, STANDARDS §7).
* `module-cards.py tree`: PASS (14 cards). `module-cards.py pr`, with this PR's changed files and body: PASS (2 modules touched; api-features "Card unchanged" with a reason).
* Minor, not blocking: two facts other modules have already tripped on are not on the card. FO-3w's suite hit the first.
  * the slug `manage` is reserved by a database CHECK;
  * the public door takes FREE_CONSULT and OTHER.

  Add both to the existing invariant line, so the card stays at 39 lines.

**Suites on the merged tree** (clean worktree, scratch databases on :54329):
* `check_fo3a_booking_types`: 48/48
* FO-3: 133/133
* FO-3pa: 45/45
* FO-1b: 80/80, migrate diff clean

**Blockers:** none. **Majors:** none. **Minors open:**
* the description wording question for Lead B (Re-review 2);
* naming the FO-3w test edit in the PR body (Re-review 7);
* the two card facts above.

Verdict: Approve 5f43cb17283b2853693c6901d3e63ad2db9e2ec0
