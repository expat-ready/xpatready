# FO-3sr review: the staff booking routes behind PF-4's guard (permissions row, API only)

Independent Opus reviewer (P-303, P-278), 15 Nov 2026. I did not build it. Commit **e96a6f5a656ff75defd37f5adc2078c7082e5416**, branch `claude/awesome-fermi-sc45t5`, PR #1811.
* **Read:** the brief `lead-b-briefs/FO-3sr.md` (below `---`); `git diff origin/main...e96a6f5a` (3 files); the PR body (DW1..DW10, W1, three Questions); `booking/service.ts` staff section (270-341), `staffBooking` (629-635), `need` (722); `identity/keys.ts`, `guard.ts`; `retainers/routes.ts` (the pattern).
* **Not applicable:** there is no screen, so the walks, 1024 px / 200 %, menu words, D1-D20 and the BIC table are N/A (FO-3 and FO-3f precedent). The graph (`graph.mjs`, exit 0) covers screens only and lists no front-office API routes.
* **Journey test:** `journey-test-reviewer-2026-11-15.md`, **9.3 / 10, pass** (6.5 of 7 applicable criteria, no 0).

## What I ran (never :4400)
* **Suite:** `tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo3sr_routes.ts` gave **28 passed, 0 failed**. I ran it twice, about 4.4 s each.
* **Neighbours, unchanged:** `check_fo3_booking` 133/0 · `check_fo1b_booking_schema` 80/0 · `check_pf23w_jobs_wired` 31/0 · `check_pf4_identity` **118/118**. Part B ran against an isolated copy of the real `main.ts` with every feature (`isolated.sh fo3srrev 4436`, runtime ports), and the copy was stopped and dropped afterwards. So the real app boots, with PF-4's start-up check accepting the seven new routes (DW9 on the real app, not only the test app).
* **Type check:** `typecheck.mjs` adds no error from this PR's files. The one "new" error is `tests/tmp_breaker_fo3sr.ts:287`, an **untracked** breaker scratch file that is not in the commit (see n2).
* **Mutations.** I used scratchpad copies of the controller and test with absolute imports, so the branch was untouched. In every row the harness itself fails 1 line (the feature-identity check); the table counts only the extra failures.

| Mutation (staff.controller.ts) | Result |
|---|---|
| none (harness baseline) | 0 extra |
| `POST /` `@PermissionKeys(create)` → `@AnyStaff` | DW1 fail FAILS (code `NOT_ALLOWED` from the service, not the guard's `MISSING_PERMISSION`) |
| `GET /` `@AnyStaff` → `@PermissionKeys(list)` | DW3 fail FAILS (403) |
| `GET /:id` `@AnyStaff` → `@PermissionKeys(list)` | DW4 pass, DW4 fail and DW8 FAIL |
| `POST /:id/attendance` → `@PermissionKeys(edit)` | DW5 pass and DW5 too-early FAIL |
| `GET /attendance-due` → `@PermissionKeys(list)` | DW6 pass and fail FAIL |
| `attendance-due` moved after `:id` | the order check and DW6 FAIL (404 "No such booking") |
| no `@HttpCode(200)` on reschedule / attendance | DW2 / DW5 and W1 FAIL (201) |
| **`reschedule` `@PermissionKeys(edit)` → `@AnyStaff`** | **survives** (27/28, only the harness line), see m1 |
| **`cancel` `@PermissionKeys(edit)` → `@AnyStaff`** | **survives**, see m1 |

## Brief checks
* **Declarations match the table:** yes, line for line (`staff.controller.ts` 20-39). The `AnyStaff` reasons are the brief's words, and `:id` reuses `OWN` ("same reason").
* **`staffOf(r)` on every handler:** yes, all 7.
* **No rule in the controller:** yes. Only `body ?? {}` and `.outcome` are taken. Keys, own/other, 404-not-403, too-early and not-active all stay in `service.ts`.
* **`attendance-due` registered before `:id`:** yes (lines 31-36). The test pins it (line 108) and the mutation confirms it.
* **HTTP codes:** create 201 (the Nest default); reschedule, cancel and attendance 200 via `@HttpCode(200)`; GETs 200. Errors: 401, 403, 404, 409 and 400 as briefed.
* **Touch list:** exactly the 3 files. `service.ts` is untouched (`git diff --stat` is empty for it). **P-610:** 250 added and 2 removed, 252 changed lines (< 800).
* **Duplicate check line:** present in the PR body.

## DW ticks (each has a pass and a fail in `tests/check_fo3sr_routes.ts`)
* [x] **DW1** (115-118): 4 roles → 201; BILLING_FINANCE and READ_ONLY → 403, nothing saved. The test asserts `MISSING_PERMISSION`, the guard's real code (`guard.ts` 63), not the brief's `NOT_ALLOWED`. The builder raised this as Question 2. The brief's wording is wrong, not the build.
* [x] **DW2** (125-132): 4 roles → 200 on reschedule and cancel; BILLING_FINANCE and READ_ONLY → 403, booking unchanged (DB re-read). Weakness: m1.
* [x] **DW3** (138-142): OWNER sees the firm's bookings and `staff=` filters them; the BILLING_FINANCE host gets 200 with own only, and `staff=OWNER` gives the same ids. On the copy I confirmed BILLING_FINANCE holds no `agent/booking:*` key at all.
* [x] **DW4** (143-147): another host's booking → 404, byte-identical to an unknown id's 404; own booking and a list-key role (READ_ONLY) → 200.
* [x] **DW5** (173-184): BILLING_FINANCE host on own → 200; READ_ONLY non-host → 403, nothing recorded; before the start → 409 `too-early`; cancelled and started → 409 `not-active`; unknown outcome → 400.
* [x] **DW6** (163-170): 29 min after the end not due, 31 min due; the host without the list key gets exactly `[own]`; the list key gives the firm's.
* [x] **DW7** (150-153): 401 `NOT_SIGNED_IN` on all 7 routes. The pass line (153) is thin (side effects only), but each route is called with a token elsewhere in the file (n1).
* [x] **DW8** (156-160): firm B's token on firm A's booking → 404 on get, reschedule, cancel and attendance, the same body as an unknown id; the row is byte-identical after; B's list omits it. This is the mirror of the brief's direction, and it is equivalent.
* [x] **DW9** (99-106): the test app starts with `PlatformGuard.onModuleInit`; 7 routes found, each declared; the stripped list is refused naming `BookingStaffController.list`; no second app. The real `main.ts` boot is confirmed separately (PF-4 part B above).
* [x] **DW10** (119-121): no `manageToken`, nothing token-shaped in the body, `fo_booking_token` count 0.
* [x] **W1** (187-198): create, list, reschedule, past the start, Attended; `booking.completed` is last in `module_event`, and the second booking ends with `booking.cancelled`. The fail line checks there is no cross-contamination.

## Findings
No Blocker. No Major.
* **m1 Minor:** the route declarations on reschedule and cancel are not pinned by any test. Evidence: mutants m1 and m3 pass, because `service.ts` 290 and 297 `need(ctx, "agent/booking:edit")` still answer 403 (code `NOT_ALLOWED`), and DW2 fail (`check_fo3sr_routes.ts:130`) asserts only `status === 403`. Behaviour stays correct (the guard and the service both check), so this is defence-in-depth coverage only. Fix (test only): assert `x.body.code === "MISSING_PERMISSION"` at line 130, or have DW9 (line 101) compare each route's `access` against the brief's table.
* **m2 Minor (not this row's to fix):** `POST /:id/attendance` with no `outcome` answers 400 with the issue `"body: Invalid option…"` instead of naming `outcome`. Evidence: live copy :4436. Cause: `service.ts` 305 parses the bare value passed by `staff.controller.ts:39`. Fixing it touches `service.ts`, which is outside the touch list, so I am noting it for FO-3's owner and not asking for it here.
* **n1 Note:** DW7 pass (line 153) proves no side effect rather than "answers with a token". This is acceptable because DW1-DW6 call every route with a token.
* **n2 Note:** the untracked `prototype/studio/tests/tmp_breaker_fo3sr.ts` in this working tree fails the type check (line 287). It is not in e96a6f5a. It must not be committed with this PR.
* **Questions 1-3 in the PR body:** they are correctly raised and not settled silently. Q1 (AG-4-67 rule 2 vs 4) goes to the founder; the build follows the brief and FO-3's merged service.

## Could not check
CI on this head (not run here); the suites of the other CI shards; a real screen reader or an intended user's walk (no screen; D17/D20 stay with the founder); Cognito sign-in (local stand-in only).

**Verdict: Approve** (e96a6f5a656ff75defd37f5adc2078c7082e5416). There is no open Blocker or Major. m1 is recommended as a test-only follow-up, in this PR or the next.
