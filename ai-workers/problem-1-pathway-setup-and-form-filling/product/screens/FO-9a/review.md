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

## Re-review at c3fb16c9 (c3fb16c95ae2356a9fb017aad5652af4d471e0f9; diff 28ac4d427..c3fb16c95 only, with break-report B1-B8)

**Verdict: Changes needed** (one Major: N1, the breaker's re-check finding, confirmed independently below; every finding from the first round is closed or carried)

**What I ran:** a detached worktree at c3fb16c9.
* `check_fo9a_duplicates.ts`: 48/48 (as the app role: p95 64 ms).
* `check_pf12_walls.ts`: 100/100.
* `check_prisma_schema.ts`: 8/8.
* `check_fo2b_corporate.ts`: 61/61.
* A probe of my own (scratch databases dropped), covering three things:
  * the name key on 17 more awkward inputs;
  * a deactivated owner seen through Unassigned;
  * the plan cache inside the definer function: 12 calls in one xr_app session at 20,000 people in one firm, custom and forced generic.

| Finding | Status at c3fb16c9 | Evidence |
|---|---|---|
| M1 / B4, m6 (use the existing one refused) | **closed** | A person is named only when one of their leads is seen. `fo_sales_person_matches` computes this, and it is the same as FO-2's `sees()` with `activeOf`. A contact-only person now sets the flag and is not named. The test says every named body is accepted by Add a lead and by add contact. One edge remains (r1). |
| m1 / B6 (crowding out) | **closed** | `seen` is ordered first (`ORDER BY 7 DESC`); test "T's own Wanda is still named first". |
| m2 / B5 (phone key) | **partly; accepted as carried** | The typed number now meets the stored key under both rules. Stored `+44 (0)…` and typed `+44 20…` still miss. This needs FO-2's `phone()` to move to libphonenumber. That is part 2, and the row stays open until it lands. |
| m3 (empty guard line) | closed | removed |
| m4 / B1 (walls and index use) | **closed** | The match runs in two definer functions owned by xr_wall_reader, granted only to xr_app (EXECUTE revoked from PUBLIC). They read only the session's firm: under firm B, or with no firm set, as xr_app, they read 0 (tested). The suite times the check through the walled pool. In my plan-cache probe, calls 1-12 took 7-12 ms with no slowdown under a forced generic plan, so plpgsql's plan cache does not hurt. |
| B2 (C-ctype names) | **closed** | `name_key` is set by the trigger (ICU `lower`, NFKD, marks dropped, hex for anything outside a-z0-9). 0 JS/SQL mismatches on 17 more awkward inputs, among them Greek final sigma, the ﬁ ligature, Hangul, dotless ı, ǅ, Arabic presentation forms, Vietnamese, Roman numerals, circled digits and İ. The test proves 李明 meets 李明. |
| B3 (the count links details) | **closed** | `hidden` is 0 or 1, and `DuplicateCheckOut` caps it at 1. Combined questions can no longer tell one guess from two. |
| B7 (null byte) | closed | 422 at the field |
| B8 (UTF-16 limits) | **mostly; r2** | Astral characters are now counted as characters. NFD text is not (r2). |
| m5 (backfill under FORCE RLS) | unchanged, note only | `migration.sql` backfill, now with no WHERE clause. It holds on our superuser migration role. |

**New, opened by the B2 fix (Major):**
* **N1. Different non-Latin names now match each other.**
  * Where: `migration.sql` (`fo_sales_name_key`) and `ports/matching.ts` `personNameKey`.
  * Cause: the hex encoding (`x43e…`) makes the trigrams out of hex digits. Letters of one script share their leading digits, so different names in one script share most of their trigrams.
  * My numbers (pg_trgm on the JS keys):

    | Pair | Similarity |
    |---|---|
    | أحمد خالد ~ محمد خان | 0.69 |
    | Анна Петрова ~ Ольга Петрова | 0.64 |
    | Анна Петрова ~ Олег Петренко | 0.61 |
    | 김민수 ~ 김민준 | 0.71 |
    | the Latin spelling "Anna Petrova ~ Olga Petrova" | 0.44 (not offered) |
    | 李明 ~ 王芳 | 0.05 |

  * Failure scenario: R adds "Ahmed Khaled" and is offered "Mohammed Khan" (score 69) with "use the existing one". Picking it links the new lead to someone else's record.
  * That breaks the row's own line ("a different person … scores below the threshold") for Arabic, Cyrillic and Hangul names, which are common for an immigration firm's clients. The test's only non-Latin fail case is 李明 vs 王芳, which happens to score low.
  * Fix (the builder's choice), with a pass and a fail per script in the test:
    * (a) treat names with non-ASCII letters as companies are treated: an identical key only, until a real similarity exists; or
    * (b) give the database a UTF-8 ctype, so pg_trgm reads the letters themselves, and drop the hex encoding;
    * (c) or any other key under which these pairs score below 0.6.

**Also from the breaker's re-check (Minor, agreed):**
* **N2.** Zero-width and soft-hyphen characters become `x200b` / `xad` and lower the score. Fold this into the N1 fix: drop Unicode format characters (Cf) from the key.
* **N3.** `fo_sales_match_firm` lets any superuser *login* name a firm with no session firm set, even after `SET ROLE xr_app`. No API route reaches this (the API logs in as xr_app). Note it for the jobs runner.

**New or residual (Minor, none blocking):**
* **r1. Deactivated owner: named to an Unassigned viewer, but add contact refuses.**
  * Where: `corporate/service.ts:209` (FO-2b) passes the raw owner to `sees()`, without FO-2's `activeOf`.
  * Failure scenario (probe): O owns Gus's lead and is then deactivated; "everyone sees all" is off. T, who has view.all and assign, gets Gus named. Add contact with that body returns **404**; Add a lead accepts it.
  * The test's "accepted by both" line runs only with active owners and "everyone sees all" on.
  * Safe: a refusal, no leak. Fix in part 2 (it touches add contact): use `activeOf` there, and add the case to the test.
* **r2. NFD text is counted unnormalised.**
  * Where: `ports/matching.ts` `line()` counts `[...v].length` without NFC first. FO-2's `text()` counts after NFC.
  * Failure scenario: 60 "é" typed as NFD (120 code points) are refused by the check (422) but accepted by Add a lead.
  * Fix: `[...v.normalize("NFC")].length`.
* **Note:** a contact-only person reads as "a record you cannot open — ask a manager", even to the person who created them and sees them in the company's contact list. This is safe and follows Add a lead's rule; the wording is the AG-2-78 line, so no change is asked.

**Journey score (reviewer role), updated:**
* task completed ½ (N1: the wrong person is offered), next step 1, plain words 1, feedback and state 1, error recovery 1, speed 1;
* correct data ½ (N1, the phone pair carried, r1), trust and sources ½ (the founder's ruling on similar names is still open);
* accessibility and visual quality N/A.

**6.5 of 8 applicable (8.1/10 scaled), no 0.** Task completed drops to ½ for N1. The open Major blocks regardless.

**Not checked:** CI on GitHub; a real HTTP call through Nest with a session (PF-4's guard is covered by the route metadata and by PF-4's own suites); a hosted Postgres with a non-superuser owner.
