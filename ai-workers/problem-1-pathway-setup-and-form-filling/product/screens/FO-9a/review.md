# FO-9a part 1 — independent review (PR #2062, commit 28ac4d42)

Reviewer: Opus, fresh context, did not build it. Judged against the BACKLOG row FO-9a (main), the brief `lead-b-briefs/FO-9a.md` (lead-b-front-office), the trace text (AG-2-16, -78, -96; P-574 (2) from DECISIONS) and STANDARDS §9. Postgres on :54329 only, never :4400.

**Verdict: Changes needed** (one Major, M1)

## What I ran
* `tests/check_fo9a_duplicates.ts`: **36 passed, 0 failed** (p95 75 ms). I also ran `check_pf12_walls.ts` (100/100) and `check_fo2_leads_prospects.ts` (113/113).
* A scratch probe of my own (scratch databases, all dropped afterwards):
  * **P1:** the service through the real walled `Db` (xr_app, RLS forced) inside `withFirm(A)` names Lena. Under another firm's scope it returns `{matches:[],hidden:0}`.
  * **P2:** a person who is only a contact of a company R sees (added with Add contact, no lead of their own) is named to R with `useExisting:{personId}`. `Leads.add(R, {personId})` with that body is refused **404 "No such person in your firm."**
  * **P3:** 60 "Mira Okafor" leads owned by T are created, then R's own "Mira Okafor", with "everyone sees all" off. R's check returns `named 0, hidden 50`, and R's own record is not offered.
  * **P4/P6:** EXPLAIN ANALYZE of the service's real person query (literal values, as the pg adapter's custom plans see it) shows a **BitmapOr of the email, phone and trigram indexes**, at 250 per firm and also at 20,250 people in one firm (6.7 ms). 20 parallel checks at 20,250 people in one firm took 119-124 ms.
  * **Demo copy:** I copied `xr_studio_demo` and ran `prisma migrate deploy`. It applies cleanly. `migrate diff` names no fo_ table (only drift that was already there). A hand-written down script (drop the trigger, functions, indexes, column and extension) runs clean inside a rolled-back transaction. The trigger function is `SECURITY DEFINER`, owned by `xr_wall_reader`. The other two functions are owned by the migration role and are not definer.
  * **Phone pairs:** I compared FO-2's `phone()` with `phoneE164()` on six inputs.

## Done-when lines: is each proven by a pass and a fail?
| Done-when line | Pass / fail in the test | Holds? |
|---|---|---|
| `+1 (416) 555-0101` and `416.555.0101` match | :96-100 | yes |
| same first name only scores below the threshold | :104-111 | yes |
| a match the viewer may not see is never named | :115-123, :143-144; P1 | yes: no id or name, and no count across firms (firm filter at service.ts:41 plus RLS) |
| "use the existing one" links to the existing person and creates nothing | :128-136 | **only for a person with a visible lead** (M1) |
| the public form answers the same either way | :159-163 | yes |
| 20 parallel checks under the speed budget at 100 firms | :166-183; P6 | yes, honest: the real query uses the indexes, and it holds well beyond the Sample size |

## Findings
**Major**
* **M1. Some named matches carry a "use the existing one" body that the routes it is meant for refuse.**
  * Where: `duplicates/service.ts:79-91` (`seenPeople`; links at :84 and :89) and `:66` (`useExisting`).
  * The check treats a person as visible when they are a contact of *any* company the caller sees. Its own contract (`ports/matching.ts:48`, service.ts header) says `{personId}` is the body for Add a lead and Add contact. But:
    * Add a lead accepts a `personId` only when one of that person's leads is visible (`sales/leads.ts:164-166`).
    * Add contact accepts it only for a contact of *this* company or a person with a visible lead (`corporate/service.ts:209`).
  * Failure scenario (P2): R engages Pine Bakery and adds Zed as a contact. A check on zed@… names Zed with `useExisting:{personId}`. Add a lead with it gives 404. So does Add contact on another company.
  * The row's line ("links the new activity to the existing person") is false for this whole class, and the test proves it only for a person with a visible lead.
  * Fix (either one, with a pass and a fail in the test):
    * (a) offer `useExisting` only when the consumer's own rule accepts it: a visible lead with its owner read through `activeOf`, as Add a lead does; or a body per kind of caller;
    * (b) widen the consumers' rules to the check's rule, and record that in the PR. That touches FO-2 or FO-2b, so it belongs to part 2.

**Minor**
* **m1. A visible match can be crowded out, and the hidden count is capped.**
  * Where: `service.ts:45` takes 50 rows (`limit 50`) *before* visibility is applied (:64, :73).
  * Failure scenario (P3): with 50 or more similar names the caller cannot open, ranked first by `created_at`, the caller's own record is not offered and `hidden` reads 50.
  * Exact email or phone matches rank first, so in practice only matches on the name alone are affected.
  * Fix: apply visibility in SQL, or keep reading until 10 visible matches are found. Count the hidden ones separately.
* **m2. The stored phone key is not "E.164 by libphonenumber-js", as the row asks** (deliberate; the PR's Question 3).
  * Where: `migration.sql:13-15` copies FO-2's regex value (`sales/common.ts:44-51`).
  * Failure scenario: `+44 (0) 20 7946 0958`, typed both at storage and at the check, is stored as `+4402079460958` but checked as `+442079460958`. That is no PHONE match for the same input. `416-555-0101 ext 12` is stored unreadable, while the check key is `+14165550101`.
  * This is a missed warning, not a leak. Recommend the FO-2 `phone()` change the PR names, in part 2, with one pass and one fail.
* **m3. The permission "fail" line proves nothing.**
  * Where: `tests/check_fo9a_duplicates.ts:190-191`.
  * It checks that a filtered key list lacks the key; it never calls the guard. Taking the decorator off the route keeps it green only through the pass line at :187.
  * Fix: call PF-4's guard (or the route through the app) with the stripped context and expect 403.
* **m4. The tests do not pin what P1/P4 found.**
  * The suite runs the service on the owner (superuser) client, not the walled `Db` (:48). Its EXPLAIN (:179-183) is a name-only query, not the service's OR query.
  * Both hold today (P1, P6). Add one walled call and an EXPLAIN of the service's own SQL so a regression shows.
* **m5. The backfill needs a superuser migration role.**
  * Where: `migration.sql:26` runs under FORCE RLS with no `app.firm_id`. Under a non-superuser table owner it would update 0 rows without any error.
  * It holds on our clusters (`check_pf12_walls` asserts xr_studio is a superuser) and the demo copy had no fo_person rows. Note only: the hosting gate needs to know this.
* **m6. Ended company links count as visibility** (`service.ts:84`, no `validTo: null`), whereas the company's contact list shows only live links. Fold this into the M1 fix.

## The known, deliberate choices
* **The four handler calls in part 2:** acceptable under the row's "1-2 PRs".
  * The row stays open until part 2 shows "used by Add a lead, Engage, add contact and the arrival path" with FO-2's suites unchanged.
  * The PR's "every Done-when line is already proved here" is too strong while M1 stands.
* **Similar names (P-574 over AG-2-79/-96's "no fuzzy"):** a warn-only build is reasonable. But AGENTS rule 2 sends a conflict between a requirement and a decision to the founder. The tech lead should record it as a founder ruling, not settle it in the PR.
* **phone_e164 from a trigger:** sound design. The writer cannot set it (:61-62), and the definer function is owned by xr_wall_reader. Its gap is m2.
* **No DuplicateCheckPort:** the brief (rows rev 14.1) overrides the row. That is fine.

## SQL and leak checks (passed)
* All values are bound parameters; there is no injection path.
* Nulls are handled with `coalesce` and `is not null`. An empty name is skipped by `<> ''`.
* `set_config(…, true)` is local to the transaction, so the `%` threshold never leaks to a pooled session.
* The JS re-check at or above 0.6 agrees with the float4 `%` at the boundary.
* Hidden records add only to `hidden`. Order and scores come from named rows only, and a different firm sees nothing.

## Journey test (reviewer role)
API only, so the walk was API calls, not a browser:
* R checks before Add a lead (main path);
* T checks R's lead (wrong role);
* firm B checks (another firm);
* an empty body and a wrong type (errors);
* use the existing one (P2), and many similar names (P3).

| criterion | score | evidence |
|---|---|---|
| task completed | ½ | M1: use the existing one fails for contact-only people |
| next step obvious | 1 | `useExisting` body |
| plain words | 1 | AG-2-78's exact hidden line; plain 422 messages |
| feedback and state | 1 | reasons and score per match |
| correct data | ½ | m1 crowd-out, m2 phone pairs |
| error recovery | 1 | field-keyed 422s |
| accessibility, screen sizes | N/A | nothing visible |
| speed | 1 | p95 75 ms; 124 ms at 20k people in one firm |
| visual quality | N/A | nothing visible |
| trust and sources | ½ | threshold labelled Sample; the AG vs P-574 ruling is still open |

**6.5 of 8 applicable (8.1/10 scaled), no 0.** The open Major blocks regardless.

## Not checked
* The screen-review D1-D20 and BIC table: not applicable to an API-only row with no screen.
* A real HTTP call through Nest with a session cookie (the guard was checked only by its metadata).
* CI on GitHub.
* A non-superuser hosted Postgres (m5).
