# PF-28 part 4 (booking): independent review (PR #2908, head 6b8ca678d23bf2e20b26b9344fe10b2487f0d5e5)

Reviewer: Opus 5.5, 22 Nov. Scope: only `git diff origin/main...6b8ca678d` (34 files). Judged against BACKLOG row PF-28, the brief `design/lead-b-briefs/PF-28.md` and the one rule `api/src/platform/http/input.ts` (unchanged here). Field errors are 422 (Lead B rev 17.21). 400 stays only for an unparseable body or a bad webhook signature. A malformed id is 404 before the body is read. The body is read before the record is looked up. I changed no code. Live AI was off; cost US$0.

This is an API row with two one-line web changes. It adds no screen, so D1–D20 and the BIC table are N/A. The screens whose server answers changed were walked: see `journey-test-reviewer-2026-11-22-part-4.md` (**10/10, pass**).

## Checks run (isolated copy `rev_pf28p4` on :4491, `PLATFORM_IDENTITY=local`; never :4400; now stopped)
- **Sweep** `check_pf28_inputs.ts 4491 xr_studio_rev_pf28p4`: **44/44**.
  - Code half: 107 inputs, 44 unparsed (44 listed).
  - Running copy: 207 routes, 504 probes, 102 not answering as the rule says (91 listed + 11 exceptions). No 500; row counts unchanged.
  - The three new part-4 cases pass.
- **Builder's walk** `part-4-walk/walk.cjs` on my copy: 4/4.
- **Live probes (curl):**
  - Booking ids. A malformed booking, type, set or person id with a bad body gives 404 on reschedule, attendance, cancel, type PATCH, timings, preview, hours sets, host set and time off.
  - Body before look-up. A well-formed unknown link or id with a bad body gives 422 (cancel by link `{"reason":5}`, time off).
  - Strict queries. An unknown key on the list, feed, public slots and web-address availability gives 422 with the key named. A repeated key gives "This must be text."
  - Ranges. The feed and preview range refusals name `to`.
- **Callers.**
  - `web/src` has no `=== 400` on any booking door; the two public pages are switched. Staff screens read `fields`/`issues`/`detail` whatever the status: `types-page.tsx:132`, `timings-page.tsx:63`, `availability-page.tsx:134,276`, `consult-record.tsx:176`, `bookingWrite`.
  - The query keys the web sends (`type-page.tsx:43` from/to/tz, `manage-page.tsx:135` tz, `calendar-page.tsx:34` view/from/to, `new-booking.tsx:64` and `types-page.tsx:237` from/to/tz) are all in the strict schemas.
  - No web caller sends `web-address/availability`.
- **Tests.**
  - I grepped every test, journey, qa walk and `.cjs` under `tests/` and `product/` that touches a booking door. No 400 expectation is left on a booking door.
  - `j_13.ts:71` accepts any 4xx. `j_4.ts:88` and `qa/check_r14_walls_gate_a.ts:85` are on the leads door (part 3), not this part.
  - The changed suites only swap 400 for 422; no assertion was weakened.
- **`refused()` callers now 422** (`service.ts:90`). The checks are listed below. My view: under "400 only for an unparseable body or a bad signature", 422 is the right family for all of them.
  - Field checks: mode, phone, consent id, host, past start, zone.
  - Range checks: `:272`, `:338`, `:449`.
  - The honeypot (`:291`) and the form-stamp checks (`:977-980`). The honeypot answer is word for word the same as the too-fast stamp answer, so a bot learns nothing. See m2 on their empty `fields`.
- **Exceptions (9→11).** Both are honest. `{}` is a valid cancel by link and a valid first consult record, so the sweep's random link or id can only answer 404. I verified both. In each, an unknown field and a wrong type are refused first. Both are marked "awaiting the tech lead".
- **Other parts' files.**
  - `platform/web-address/routes.ts` is a platform file, but the sweep's path rule (`check_pf28_inputs.ts:48`, "availability") filed its line under part 4, and part 2 has merged. Acceptable.
  - #2883 (part 6) touches none of this PR's source files. It does edit the same `PROBES_CEILING` line (`check_pf28_inputs.ts:108`) and `pf28-allow-list.json`, so whichever PR merges second must re-base both ceilings.

## Findings
### Blocker
None.
### Major
- **M1. The consult-record save reads the body before it checks the id's shape, against the stated rule and the PR's own module line.**
  - Where: `consult/service.ts:121-130`. The order is the object check (`:123`), then `ConsultBody` (`:126`), then `booking()` (`:130`), which is the first place the uuid is checked.
  - Verified: `PUT /api/front-office/bookings/not-a-uuid/consult-record` with `{"x":1}` gives **422** naming `x`, and with `[]` gives **422**. Only `{}` gives 404.
  - The rule says a malformed id is the one not-found before the body. `MODULE.rows/PF-28-part4.md:1` claims it "for every booking door … a malformed booking … id … is the one not-found before the body". The sweep cannot see this, because its bad-id probe sends a valid body.
  - Failure scenario: a client, or the breaker, that sends a typo'd id with a stale body gets field errors for a record that cannot exist, instead of the one not-found. This is the exact precedence this part exists to make uniform.
  - Fix:
    - At the top of `put`, check the id's shape (as `idShape` does in `service.ts:179`, or `if (!UUID.test(bookingId)) return notInFirm("booking")`), before the object check.
    - Add a fail case to `check_pf28_inputs.ts`: a malformed id with an unknown field gives 404.

### Minor (Should)
- **m1. The booking doors' own parsers accept a `__proto__` key without a word.**
  - Where: `service.ts:172`, `types.ts:104`, `availability.ts:66`, `consult/service.ts:126`, `feed.ts:42`. These keep their own `safeParse`. The one rule refuses `__proto__` before the schema (`input.ts` `parseInput`, part 1 break m2).
  - Verified:
    - `PUT …/<random uuid>/consult-record {"__proto__":{"x":1},"notes":"x"}` gives 404, so the body passed.
    - The public cancel with `{"__proto__":{…}}` gives 404.
    - Staff create names no `__proto__`.
  - There is no pollution: zod 4 drops the key, and I checked that the output's prototype is `Object.prototype`. But it is an unknown field accepted where the rule refuses one.
  - Fix: the same `Object.hasOwn(value, "__proto__")` refusal in these parsers, or a shared helper from `input.ts`.
- **m2. Several 422 `INVALID` answers carry `fields: {}`.**
  - Where: `refused()` with no issues (`service.ts:90`). This covers the 62- and 92-day range refusals (`:272`, `:338`, `:449`), which name no field, while the feed and preview now name `to`.
  - The honeypot and form-stamp refusals (`:291`, `:977-980`) also carry `fields: {}`. That is right for anti-bot checks, but it should be said in the `refused` comment.
  - The default derivation also has a latent bug. An issue string without `": "` produces `fields.body = i.slice(1)`, the text minus its first character. No caller passes one today.
  - Fix: pass `{ to: … }` on the three range refusals, document the anti-bot empty `fields`, and handle the `indexOf === -1` case.
- **n1 (nit).**
  - Stale words: `feed.ts:29` ("a year outside 2000-2099 is a 400") and `check_fo3a_hours_timings.ts:246` ("the 400s").
  - New `fields` values such as `to: "at most 62 days after from"` and `phone: "required for a phone call"` are lower-case fragments, not the rule's sentences. No screen reads them.
  - Four regenerated `fo-3-booking/screenshots/fo3st1-*.png` files ride along. They are outside the touch list, but harmless.

## What held
- Id or link shape is checked before the body; the body is read before the look-up.
  - Every booking path value except M1's.
  - The link doors: the rate limit, then `linkShape`, then the body or query, then `byToken`.
- `manageSlots` now reads the query before the not-by-link and too-late checks (409). This only changes the answer for a malformed query. The page always sends the booking's own stored zone, so a person never meets it.
- Permission still comes first: `need()` runs before `idShape` in `staffReschedule`. The guards handle the hours and types doors, and `target()` does no authorisation, so reading the body before it is safe.
- No per-row requests, no migrations, no concurrency change.
- Would a test fail if the rule were removed? Mostly yes:
  - Removing `linkShape`, or moving `parse` after `byToken`, fails `badLink` or the link-door probes (now reached with a well-formed unknown token).
  - Reverting the order in `availability.ts` fails `randomHost`.
  - The 422 swaps fail the area suites.
  - The gap is M1, which no case covers.

## Not checked
- The browser suites: the caller reports them running. I did not run them here, because they rewrite checked-in screenshots, which is outside my write scope.
- `graph.mjs`: it rewrites `qa/GRAPH.md`, also outside my scope. This is an API row, and the routes are all covered by the sweep.
- A real screen reader, and an intended user's walk (D17/D20 stay with the founder).

**Verdict: Changes 6b8ca678d23bf2e20b26b9344fe10b2487f0d5e5.** Not an Approve: do not label until M1 is fixed. To fix: M1 (must); m1, m2 (should); n1 (optional).

Reviewer: Changes 6b8ca678d23bf2e20b26b9344fe10b2487f0d5e5

## Round 2 (head 3afa09afabf236f5b01314f4cc3a66b0281f52ab)

Scope: only `git diff 6b8ca678d 3afa09afa`, leaving out the records commit `cc74e9644`. The four `fo3st1-*.png` files are back to main's copies; the PR's only images are now the `part-4-walk` shots. I re-ran everything on a fresh copy `rev_pf28p4` on :4491 (now stopped).

- **Sweep:** **45/45**, with the new case "PF-28 part 4 fail (review M1, m1, m2)" passing. Code half: 44/44 listed. Probes: 504, of which 102 are not as the rule says (91 listed + 11 exceptions). No 500.
- **My journey script:** 20/20 again. J1–J6: a public refusal then booked, reschedule by link, a cut-short link, a reserved slug, time off back to front, the calendar. axe clean; no page errors; the only refused calls were the provoked ones.

**M1: fixed.**
- `consult/service.ts:121-124` now checks the id's shape first (`UUID` is declared at `:32`), then the `__proto__` guard, then the object check.
- Live: `not-a-uuid` gives **404** with `{"x":1}`, with `[]`, and with no body.
- A random uuid with `[]` still gives 422 ("Send the record as a JSON object."), and with `{}` gives 404. That is unchanged and correct.
- The new sweep case would fail if the check were removed.

**m1: fixed.**
- Each booking parser now runs `parseInput(z.unknown(), …)` first: `service.ts:175` (every booking door's `parse`), `feed.ts:42`, `types.ts:105` and the preview (`:235`), `availability.ts:67`, `timings.ts:141`, and the consult put.
- Live: a `__proto__` key is refused **422** naming it on staff create, type PATCH, firm timings, attendance, the consult record (random id), the preview query, the public booking and the public cancel. Two of those, the cancel and time off, are in the sweep case.
- With `z.unknown()`, the guard does nothing else, so no other answer changed. Every body that is not `__proto__` reaches the door's own schema as before. A valid feed query still answers 200.
- Accepted as it is: the `__proto__` answer uses the rule's own Problem shape ("Check the details", no `issues`), not the door's title or slug. Only a crafted request meets it. The public page shows its detail through the refusal line.

**m2: fixed.**
- The three range refusals now pass `["to: at most N days after from"]` (`service.ts:275`, `:341`, `:452`). Live: the public slots over 62 days, and the staff list over 92 days in the sweep, both name `to`.
- The `refused` default now maps a line without `": "` to `body: <the whole line>` (`:90`).
- The anti-bot comment is added at `:92-93`. Small nit: it sits as a loose doc comment above `NOT_LISTED`'s, rather than on `refused`, which is the function it describes. No action needed.

**Nits:** fixed (`feed.ts:29`; `check_fo3a_hours_timings.ts:246`).

**New issues:** none. The guard adds no look-up, the order is still id → body → record, and the permission checks are untouched. In `timings.write` the body was already read before the per-field permission check; that is unchanged.

**Verdict: Approve 3afa09afabf236f5b01314f4cc3a66b0281f52ab** (no open Blocker or Major).

Reviewer: Approve 3afa09afabf236f5b01314f4cc3a66b0281f52ab

## Round 3 (head 04b72b8b39904d77cec0e72a9082bdd52bb35430: merge of origin/main after #2883, PF-28 part 6)

Scope: only the conflict resolution, `git diff 8ce9dd85a 04b72b8b3 -- '*check_pf28_inputs.ts' '*pf28-allow-list.json'`. The merge changed no file of part 4's own; the booking, booking-public and web-address files are untouched by it.

- **Both files equal main plus exactly part 4's changes.** I checked with `git diff 5d866c746 04b72b8b3` on the two files.
  - `check_pf28_inputs.ts`: only the ceiling line, the `:linkToken` filler, and the part-4 cases (including round 2's). Part 6's two cases are kept as merged on main.
  - `pf28-allow-list.json`: only the 70 `PF-28 part 4 (booking)` probe lines leave, and the two by-design exceptions join. Part 6's 7 money lines were already gone on main, and nothing came back.
- **Ceilings: `PROBES_CEILING` 84, `EXCEPTIONS_CEILING` 11, `UNPARSED_CEILING` 44.** These are main's 154 − 70, 9 + 2, and 44.
  - The list holds exactly 44 unparsed, 84 probes and 11 exceptions, so every ceiling is met exactly, with no slack for a line to sneak back.
  - No entry names part 4 or part 6.
  - The ceiling comment records the 161 → 154 step from part 6.
- **Sweep on a fresh copy of the merged head** (`rev_pf28p4`, :4491, now stopped): **47/47, exit 0**.
  - Code half: 107 inputs, 44 unparsed (44 listed).
  - Probes: 504 on 207 routes, of which 95 are not as the rule says (84 listed + 11 exceptions).
  - No 500. Part 4's four cases and part 6's two pass.

No new findings.

**Verdict: Approve 04b72b8b39904d77cec0e72a9082bdd52bb35430** (no open Blocker or Major).

Reviewer: Approve 04b72b8b39904d77cec0e72a9082bdd52bb35430

## Round 4 (merge of main after parts 3a-3b; head a16cca4529b2ff33fbdf578edf57a466938b1f6e)

Scope: only the merge `a16cca452`, whose parents are `a061cfbe8` (records only, after round 3's `04b72b8b3`) and main at `71984ae8a`. No copy started: the diffs settle it. The builder reports the sweep at 47/47 and 26 booking suites passing on a fresh copy of this head.

**Resolution: the two files are exactly main plus part 4's own changes** (`git diff 71984ae8a a16cca452`).
- `check_pf28_inputs.ts`: only the ceiling line, the `:linkToken` filler and part 4's cases (round 2's included).
- `pf28-allow-list.json`:
  - The 70 `PF-28 part 4 (booking)` probe lines leave.
  - Part 4's two by-design exceptions join (cancel by link, consult record `missing`).
  - The last retainers line loses its trailing comma. That is the JSON, not a change of entry.
  - Main had already dropped part 3's lines, and none came back. The file parses.

**Ceilings: probes 23, unparsed 9, exceptions 17.** These are main's 93 − 70, 9, and 15 + 2.
- The list holds exactly 9 unparsed, 23 probes and 17 exceptions, so each ceiling is met exactly.
- 0 entries name part 3 or part 4.

**Main's work against part 4's files.**
- `git diff --name-only a061cfbe8 a16cca452` (168 files) shares only three files with part 4's own: the two above, and `api/src/front-office/booking/feed.ts`.
- **`feed.ts`** auto-merged QA-743 (R1.39), which adds `timeOff` to the list answer through a new `offItems`.
  - It sits after part 4's checks, which are unchanged: the `__proto__` guard, the strict `FeedQuery`, and the 422 field and range errors.
  - It reads firm-scoped rows only after the query is parsed and the `team` key is checked.
  - No conflict with part 4's precedence.
- The feed's callers on this head (`calendar-page.tsx:37`, `check_fo3st1_calendar_browser.ts:266`, `j_39.ts:196`) send only `view`, `from` and `to`, all in the strict schema.
- None of main's changed tests expects 400 from a booking door. The one 400 near "stamp" is sign-up's own (`check_pf5_signup_billing.ts:322`), not part 4's.

No new findings.

**Verdict: Approve a16cca4529b2ff33fbdf578edf57a466938b1f6e** (no open Blocker or Major).

Reviewer: Approve a16cca4529b2ff33fbdf578edf57a466938b1f6e
