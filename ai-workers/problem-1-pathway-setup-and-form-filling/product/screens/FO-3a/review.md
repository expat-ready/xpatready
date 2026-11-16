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
