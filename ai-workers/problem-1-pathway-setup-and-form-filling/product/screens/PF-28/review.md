# PF-28 part 1: independent review, round 1 (PR #2619, head 56d2d6bc2fa5acef6abe5e5ac132653de3388e55)

Reviewer: Opus 5.5, effort high, 20 Nov. Read: the brief on `main`, Lead B's ruling on `lead-b-front-office` (422 for field errors, binding), BACKLOG PF-28 with "Amended 18 Nov", `challenge.md`, and the full diff (`git diff origin/main...HEAD`, 8 files, 536+/4-). Live AI off, US$0. I did not change any code. API only: no screen is built, so D1–D20 and the BIC table are N/A. The journey note is at the end.

## Checks run (isolated copy `rev2619` on :4591, started and stopped in one command each time)
- `tsx --tsconfig api/tsconfig.json tests/check_pf28_inputs.ts 4591 xr_studio_rev2619`: **20/20**, run twice. 169 routes, 424 probes, 148 allow-listed, 0 NOT TESTED by keys. DW6 is NOT TESTED.
- `check_pf0bp_body_errors.ts` **13/13** (own server). `check_csv1_inputs.ts` **100/100** on :4591, so the `tests/lib/routes.ts` line does not change CS-V1.
- All-table row counts, read outside the sweep before and after it. The only changes were `audit_event` +1 and `platform_session_revocation` +1 from the sweep's own sign-in (made before its baseline), and `msg_firm` +1 on first read. No probe stored anything, in any table.
- Route coverage: `registerFeatures` is how every PF/FO controller is mounted. AppModule's own controllers serve nothing under the doors. All 129 code-found routes that take an input were probed. No `/api/system` or `/api/hooks` route exists on this head.
- Unit checks of `parseInput` (scratch script) and live breaker probes. Results are in the findings and under "What held".
- All runs ended by 21:00 UTC and used the committed head. Uncommitted edits to `input.ts` and `check_pf28_inputs.ts` appeared in this worktree at 21:01–21:02, made by someone else. They are not reviewed here.
- Read the breaker's untracked `break-report.md` in this folder after my own runs. Its M1, m1 and m2 match mine. Its m4 (the SNS door) is my m5.

## Done when (422 in place of 400, per the ruling)
| Line | Pass case | Fail case | Ticked |
|---|---|---|---|
| DW1 | the planted route with `parseInput(strict…)` is counted as parsed (:77) | the planted route with an unparsed body fails (:76) | yes. Only the code half is tested; the brief allows that |
| DW2 | `POST /api/platform/complaints/:id/handler`: 422 naming `pf28Unknown`, counts unchanged (:173) | `POST /api/platform/staff/invitations` answers 400 without naming the field, and is on the list for part 2 (:175) | yes |
| DW3 | 200 KB is not 413 and not 5xx, and 280 KB is 413 (:181) | 1 MB answers 413 with the size-neutral words (:179) | partly: see m3 |
| DW4 | a non-uuid staff id answers 404 (:186) | another firm's staff id answers the same 404 (:187) | yes |
| DW5 | 49 public probes, none answering 401 (:191) | FO-2's 33 KB form answers its own 413 `TOO_LARGE` (:193) | partly: see M1 (most public body probes are 404s) |
| DW6 | NOT TESTED until `/api/hooks/stripe` exists; then the test fails until it is written (:196-198) | (same) | correct per P-405 |
| DW7 | every entry matches `FIX_PART` (:80) | an entry with no part, or with another row's id, fails (:81) | yes as written. Growth is not guarded: see m1 |
| DW8 | not pasted in the PR | not pasted in the PR | no. This is the builder's step before the label |

## Findings
### Blocker
None.

### Major
**M1: the probe rule passes any 404 on a route with path parameters, so the sweep is green on doors whose body or query is never checked.**
- **Where:** `tests/check_pf28_inputs.ts:141`, with `fill()` at `:146` putting random uuids into every path parameter.
- **Measured:** 65 body and query probes on 22 routes "pass" only because the made-up record does not exist. Examples:
  - `PATCH /api/front-office/retainers/:id` is on the code list as unparsed, yet all three of its running probes pass.
  - The same holds for `POST /api/front-office/leads/:id/assign|close|reopen`, `POST /api/front-office/people/:personId/identity-checks` and `POST /api/platform/staff/invitations/:id/resend`.
  - Public doors: `POST /api/public/forms/:token/submissions` and 6 probes on the booking doors.
- **Neither half covers the public booking doors.** They are registered through the `route()` helper (`front-office/booking/public.controller.ts:51-66`), which `tests/lib/routes.ts` does not read. The code half lists no route there (checked). The breaker showed that `…/book/:slug/slots?pf28Unknown=x` answers **200**, and that an unknown body field answers 400 with no `fields`. Neither is on the allow-list.
- **Effect:** the row's sweep promises "an unknown field and a wrong type expect 422". Once the fix parts empty the code list, a loose schema that runs after the lookup still passes both halves. DW5's public probes mostly prove only a 404.
- **Fix, either way:**
  - fill path parameters with real Sample ids or keys (a parameter-to-row lookup), so the body is actually reached and the row counts judge any write; or
  - report a 404 on a body or query probe of a route with ids as NOT TESTED by name (never green), and allow-list those routes under their fix part.
- **Also:** make the code half read the `route()` helper's `Body()`/`Query()`, or list those five inputs.

**M2: every wrong-type field is worded "This is required."**
- **Where:** `api/src/platform/http/input.ts:35` tests `i.input === undefined`, but zod 4 leaves `input` out of issues unless `reportInput` is set.
- **Measured:** `{name: 123}` gives `fields.name: "This is required."`, and an array body gives `body: This is required.` The "This must be text / a list / a number" branch never runs.
- **Why Major:** this is the row's own deliverable ("a refusal … in plain words", STANDARDS §6). Every fix part will put these words next to fields, and no test pins them.
- **Fix:** tell missing from wrong type another way, for example `safeParse(value, { reportInput: true })` while still never echoing the value. Add one named pass/fail for the words.

### Minor
- **m1: growth of the allow-list is not caught.** `check_pf28_inputs.ts:10` and `:47-50` say the list "only shrinks", but a new failing door added with a valid label (`partOf()` writes one) passes. The brief's parallel-safety rule says the list "may not grow". A pinned count per part, which may only fall, would make growth a visible edit to the test. Also, the DW7 message says "part 2-5", but part 6 (money) exists (`:35`, `:80`).
- **m2: some unknown keys break `fieldsOf`.** A key named like an `Object.prototype` member (`constructor`, `toString`) is dropped by `out[k] ??=` on a plain `{}` (`input.ts:46-49`). The result is `fields: {}` and the words "0 fields need a change:  Nothing was saved." Use `Object.create(null)` or `Object.hasOwn`. Key names also come back unbounded in `fields` (values never do). `__proto__` is dropped by zod and accepted: harmless, no pollution (`({}).polluted` stays undefined).
- **m3: the DW3 pass case does not show success.** Its words say "here 404", but the answer is **422**: notes are capped at 5,000 characters. It proves only that a 200 KB body passes the parser, not that "a 200 KB valid body … still succeeds". No PF/FO field takes 200 KB, so word the case as what it shows (`:180-181`).
- **m4: the row counts miss some tables and all updates.** They leave out `audit_event`, `module_event` and `webhook_receipt`, which are platform-owned (`:130`). The "missing" 2xx exemption (`:143`) relies on counts, which cannot see an UPDATE. Today 0 probes use it. Add those tables to the counts, and drop the exemption or name each use.
- **m5: the SNS notice door takes less JSON than its own limit.** `/api/public/messages/ses-notices` states `NOTICE_MAX_BYTES` 300 KB (`messages/public-routes.ts:18`), but `application/json` bodies over 256 KB there now answer 413. SNS sends `text/plain`, so real traffic is safe. Amendment 1's intent is that webhook doors keep their own limit, so exclude the path or note it.
- **m6: some allow-list entries would force a fix part to change deliberate behaviour.**
  - `GET /api/front-office/pipelines/:type/board id:type`: an enum, where 422 is right.
  - `DELETE /api/platform/complaints/:id id:id`: 405 "complaints are kept".
  - `GET /api/public/invitations/:token id:token`: 200 `NOT_VALID`, which the screen reads.
  - `POST /api/platform/session/callback`: 401.
  - 6 `query-unknown` answers of 200 on GET lists.
  The sweep treats every path parameter as a uuid. Name these as rule exceptions with a reason, or the fix parts may break screens (amendment 2).
- **m7: two changed files are outside the touch list.** `tests/lib/routes.ts` (one additive line) and `api/src/platform/MODULE.rows/PF-28.md` (the folder's convention, in place of `MODULE.md`). Both are acceptable, and CS-V1 is unchanged (100/100). The brief says to ask, though, so name both in the PR body.
- **m8: the PR body is stale.** It still says "Draft … holds only the question". It does not name DW2's strict route ("named in the PR"), and has no DW8 browser results, which are needed before the label.
- **m9: the ruling's move of existing 400 field errors is deferred.** The ruling has "the sweep PR" move existing 400 field errors to 422, each listed. Part 1 defers this to the fix parts (`challenge.md`), and only the 400s the probes hit are on the list. List the remaining `problem(400…)` field-error sites with their fix part, so none is lost; this waits on the open question.

**Not counted (already on `main`, outside this diff):** a 415 from `charset=latin1` or an unknown `Content-Encoding` answers 500 (`ProblemErrors` maps only 400 and 413). The breaker found it; it deserves a BUGS row.

## What held
- The 256 KB limit sits only on the four prefixes: `/API/PLATFORM` answers 413 and `/api/platformx` answers 404.
- FO-2's 32 KB parser still runs first.
- PF-0bp's `BODY_NOT_JSON` still answers through the new parser.
- Uploads are multipart (`FileInterceptor`) and unaffected. No web screen posts data URLs.
- `text/plain` and `+json` bodies are not parsed, so they cannot get around the limit.
- A body nested 20,000 levels deep, a number where text is expected, and a request with no body each answer 422 on the strict door, never 500.
- `idParam` refuses a NUL byte and a non-uuid with 404.
- The size is 540 changed lines, under 800.

## Journey note (API only; reviewer score; report in `journey-test-reviewer-2026-11-20.md`)
**7.5/10, below the bar of 8.** No criterion scored 0. The two half scores to fix first are plain words (M2) and task completed (M1).

**Could not check:** the browser suites (DW8, the builder's), a real screen reader, and an intended user's walk. I did not run `graph.mjs`, because it rewrites `qa/GRAPH.md`, a file outside this review's write scope.

To fix before Approve: M1, M2. The Minors are recommended in the same round; m8's DW8 results are needed before the label in any case.

Verdict: Changes requested

---

## Round 2: diff only (P-277), `git diff 56d2d6bc2 aeeb5f0728543d22ee7898fda9a14ad333f4b36d`

Reviewer: Opus 5.5, effort high, 20 Nov. I read the diff of `input.ts`, `check_pf28_inputs.ts` and `pf28-allow-list.json`; the rest are records. The worktree was clean at this head before I ran anything. Isolated copy `rev2619` on :4591, started and stopped in one command each time. I did not change any code.

### Checks run
- `check_pf28_inputs.ts`: **24/24**, run twice on the same copy. 169 routes, 430 probes, 220 allow-listed, 0 NOT TESTED by keys.
- Read from the dump, the probes not on the list answer only:
  - 413 (1 MB);
  - 404 (`id:` probes);
  - 422 (unknown, wrong type, missing). The 8 passing unknown-field probes all name `pf28Unknown`.
  No body or query probe passes on a 404 any more.
- All-table counts before and after the sweep: the same three changes as round 1, all from sign-in and the first read. No probe wrote anything.
- Live checks (`ses.mjs`):
  - A 280 KB JSON body to `/api/public/messages/ses-notices`, to the same path with a trailing slash, and to `/API/PUBLIC/MESSAGES/SES-NOTICES?x=1` reaches the door (400 "not verified").
  - `/api/public/messages/ses-noticesx`, `/api/public/signup` and the form door still answer 413.

### Round 1 findings
- **M1: resolved.**
  - `fine()` no longer accepts a 404 on body or query probes (`check_pf28_inputs.ts:154-162`). The 65 probes that passed on a 404 are now on the list under their fix parts.
  - Public doors use the real `sample-firm` key, plus a slug and form token from the database when one exists.
  - A door whose key has no real value gets an `unreached` entry (`:180-181`). It is emitted whatever the door answers, so the entry leaves the list only when the sweep can reach the door for real.
  - The six `unreached` entries cover all five inputs on the `route()`-helper booking doors, plus the web-form door. Not teaching `tests/lib/routes.ts` the helper therefore **does not block**: the running half now judges those doors' real answers before their entries can go.
- **M2: resolved.**
  - `invalid_type` now tells missing from wrong type by zod's message (`input.ts:37`).
  - The new "rule pass" line pins both wordings ("This is required." and "This must be text."). It would fail on round 1's code.
- **m1: mostly resolved.** The list is capped at 71 code entries and 220 probe entries, and DW7's words now say part 2-6. See r2-m1 for what is left.
- **m2 and the breaker's m3: resolved.**
  - Fields are own keys only, so `constructor` is named.
  - A top-level `__proto__` is refused with 422.
  - Field names are cut to 64 characters, with at most 20 fields.
  - Values are never repeated. Unit lines pin all of this.
- **m3 (DW3): resolved.** The case now asserts 422 from the notes rule, and that 280 KB gives 413.
- **m4: accepted as Minor, not Major.**
  - `module_event` and `webhook_receipt` are now counted.
  - `audit_event` stays out for a stated reason, and in both rounds no probe changed it.
  - Updates remain unseen. The "missing" 2xx exemption is used by 0 probes today.
- **m5: resolved.** The SNS door is skipped by the 256 KB parser (`input.ts:75-77`). The anchored path match lets no other path past.
- **m6–m9: not yet done.** They are records the builder will put in the PR body. At this head the PR body is still the round-1 draft text: it names neither the touch-list extras nor the deliberate 405/410/200 behaviours, and has no DW8 results. All of that is needed **before the label**. It does not block approval of this commit.

### New in round 2 (all Minor)
- **r2-m1: the cap still leaves room to grow.** The check uses `<=` (`check_pf28_inputs.ts:84`). Once a fix part removes entries without lowering 71/220, the room it frees could be refilled by labelled entries. Use `===`, so each fix part must lower the numbers in the same PR.
- **r2-m2: the missing-or-wrong-type test depends on zod's wording.** `/received undefined$/` relies on zod's default English message. A schema with its own `error` text, or a zod upgrade that changes the message, would word a missing field as a wrong type. The unit line catches the second case; `safeParse(v, { reportInput: true })` without echoing the value would remove the dependence.
- **r2-m3: one new entry contradicts the SNS exemption.** `POST /api/public/messages/ses-notices 1mb` is on the list as a "part 2 (platform)" fix, but this round deliberately exempts that door. Name it as a rule exception with its reason, so part 2 does not "fix" it back to 413.
- **r2-m4 (existing behaviour, noted only): some id probes still prove little.** On routes with two parameters, an `id:` probe can be a 404 because of the other, random id. The required outcome (404, never 500) still holds.

### Done when, re-ticked
- DW1, DW2, DW4: yes.
- DW3: yes.
- DW5: yes. The public doors are reached with real keys, or listed as `unreached`.
- DW6: NOT TESTED, never green.
- DW7: yes, with the cap (r2-m1).
- DW8: the builder must paste it before the label.

### Journey note (API only)
Re-scored on the diff: 8.5/10, no 0. Task completed goes from ½ to 1, and plain words from ½ to 1. Accessibility, speed and visual quality stay at ½ (N/A for the API, or not timed). That passes the bar of 8.

Verdict: Approve aeeb5f0728543d22ee7898fda9a14ad333f4b36d

---

## Round 3: diff only (P-277), `git diff c4ee7508 4f73b7e0905d206db4e7be5a6528365d70855356`

**Change:** one line in `api/src/platform/MODULE.rows/PF-28.md`.
- `platform/http/input.ts` becomes `api/src/platform/http/input.ts`.
- `tests/pf28-allow-list.json` becomes "the allow-list `check_pf28_inputs.ts` reads".

The facts on the card are unchanged: the 422 status, the 256 KB Sample limit, the four prefixes, the `/api/hooks` exclusion, and the shrink-only invariant.

**No code changed.** `git diff aeeb5f07 4f73b7e09 --name-only` lists only this card row and the three PF-28 records.

**Check:** `check-module-cards.sh` passes locally (exit 0). Round 2's checks still hold, because the code is the same.

Round 2's Minors (r2-m1 to r2-m4) and the PR-body items for before the label (m6–m9, DW8) are unchanged.

Verdict: Approve 4f73b7e0905d206db4e7be5a6528365d70855356
