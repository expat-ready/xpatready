# Break report: FO-9a part 1, the duplicate check (at 28ac4d427)

Breaker role. Target: commit `28ac4d427` on `claude/charming-darwin-clue3f` (PR #2062). Isolated copy `fo9abrk` on :4471 (`PLATFORM_IDENTITY=local`; the API runs as `xr_app` under PF-12's walls), seeded with `seedSampleFirms` + `seedSampleFirmsFrontOffice`; staff R (Owner), T (Case manager), O (Case officer) of sample-firm, S of sample-solo. Data was added through `POST /api/front-office/leads`, engage and add contact, with bulk rows by SQL (2,000 "Mohammed Khan" leads owned by T, then 98 more firms × 250 people, the row's "100 firms"). Live AI off, US$0. Copy stopped, its databases dropped. The UI parts of the brief (keyboard, 1024 px, zoom, reload or back, uploads) do not apply: this row is API only. Two sessions saving one record does not apply either: the check only reads.
While I was running, the builder pushed `69d91299a` (review fixes) to the same branch. Every finding below was found on 28ac4d427. The **HEAD** lines give a re-run on `5d08598a2` (same code as 69d91299a), made before the copy stopped.

## Breaks

**B1. Major: under the app role, none of the new indexes is used, so the "firm-scoped" trigram match reads the whole table.**
Steps: as `xr_app` with `app.firm_id` = sample-firm (as the API runs), `set_config('pg_trgm.similarity_threshold','0.6',true)`, then `EXPLAIN ANALYZE select id from fo_person where firm_id = A and fo_sales_person_name(given_names, family_name) % 'lena park'`.
Actual: the plan has no `fo_person_name_trgm_idx`. With 76,759 people it does a `Seq Scan on fo_person`, removes 76,758 rows by filter and takes 140 ms. The `lower(email)` index is skipped the same way (seq scan, 10 ms). With 26,759 people it uses `fo_person_firm_id_phone_e164_idx` on firm_id only and runs `%` on every row of the firm, even with `enable_seqscan=off`. Cause: PostgreSQL never uses a qual with a non-leakproof function as an index condition under row-level security. `similarity_op`, `lower`, `btrim` and `regexp_replace` all have `proleakproof = f`.
The test's EXPLAIN (`tests/check_fo9a_duplicates.ts:179-183`) and its 20-check timing (`:172-178`) both run as the owner, which bypasses the walls. So they prove an index use that never happens in the API.
Through the API (HTTP, 20 at once, R): at the row's 100 firms of Sample data, p95 was 139, 150, 155, 156, 174, 177, 188, 201, 206 and 222 ms over ten runs, so 3 of 10 went over STANDARDS §9's 200 ms. With one firm at 52k people, p95 was 955 ms, and a single check with a 200-character name took 658 ms (20 such checks at once: p95 3.2 s). HEAD: same query shape; p95 at 100 firms was 151, 205 and 225 ms.
Expected: the name and email matches use their firm-scoped indexes under `xr_app`, and the speed line is proven as the API runs.
Ref: `migration.sql:34,41-44`; `service.ts:36-49`.

**B2. Major: on a database with C ctype (the cloud and CI clusters), non-Latin names never match, even when spelt exactly.**
Steps: as R, add leads 李明, Ольга Петрова and محمد خان, then check each with exactly the same names.
Actual: `{"matches":[],"hidden":0}` for all three. "José García" matches only itself; "Jose Garcia" scores 0.44, because é and í are dropped as separators. The isolated copy's database is `datctype = C`: `product/tools/cloud-setup.sh:123` runs initdb with no `--locale`, while `studio/tools/new-machine.sh:182` (the Mac) uses `en_US.UTF-8`. On a new database with `--locale=en_US.utf8`, `similarity('李明','李明')` is 1. On this copy it is 0.
Also seen: on C, `lower('ÉLODIE')` is `Élodie`, while `normaliseEmail` lower-cases É, so a non-ASCII email can never match itself.
Expected: the same answer on every machine. For an immigration firm's clients, a non-English name is common, not an edge case. Nothing in the migration or the test pins the locale or proves a non-Latin name.
Ref: `migration.sql:27-29,41`; `ports/matching.ts:15,23`. HEAD: unchanged (李明 still 0 matches).

**B3. Major (privacy): the hidden count links a hidden person's details.**
Steps: set "everyone sees all" off. Lena belongs to R. As T:
- `{email: lena.park@example.org}` gives hidden 1;
- `{givenNames:"Priya", familyName:"Sharma"}` gives 1;
- `{email: lena…, givenNames:"Priya", familyName:"Sharma"}` gives **2**;
- `{email: lena…, givenNames:"Lena", familyName:"Park"}` gives **1**;
- `{email: lena…, phone:"+1 416 555 0101"}` gives **1**.
So T, who may not open Lena, confirms her name and her phone from the count of the union. There is no rate limit: 300 checks in a row were all 200, none 429 (STANDARDS §8 asks for rate limits). Each guess costs about 10 ms.
Expected: AG-2-78 §11's "counted, never named" should hold against combined questions too. For example, one hidden flag rather than a count of distinct people, plus a rate limit.
Ref: `service.ts:73`. HEAD: unchanged (`{email: lena…, Priya Sharma}` as T still gives hidden 2).

**B4. Major (the review's M1, confirmed live): "use the existing one" offered for a person Add a lead refuses.**
Steps: R engages Lena's lead as Corporate ("Pine Bakery Ltd") and adds a new contact, Kai Moss (`kai@pine.example`). R checks `{email: kai@pine.example}` and gets Kai named with `useExisting.personId`. R then posts `POST /leads {personId: <Kai>}`.
Actual: 404 "No such person in your firm." The check names people seen through any company's contact link (`service.ts:89`), while `leads.ts:165-166` accepts only a person with a visible lead.
HEAD: Kai is now hidden 1 to R. That is safe, but R created Kai and sees him in Pine's contact list.

**B5. Major (the review's m2, confirmed live): the same number in two common spellings does not match, because the stored key is not E.164.**
Steps: T adds Omar with `+44 (0)20 7946 0958`. FO-2 stores `+4402079460958`, readable (`sales/common.ts:48` only strips separators), and the trigger copies it as `phone_e164`. Then check `{phone:"+44 20 7946 0958"}` and `{phone:"+44 (0)20 7946 0958"}`.
Actual: both answer `{"matches":[],"hidden":0}`, because libphonenumber reads both as `+442079460958`. The same happens with `+61 (0)4…` and `+7 (8)495…`. On a 200k-person copy, the backfill wrote 50,000 keys starting `+440`.
HEAD: `(0)` typed the same way now matches. `+44 20 7946 0958` still misses the stored `+4402…`, which is the same number.
Ref: `migration.sql:13-15`.

**B6. Minor: a visible match is crowded out, and the hidden count is wrong past 50 (the review's m1, measured).**
Steps: 2,000 "Mohammed Khan" owned by T, plus R's own Mohammed Khan added last. "Everyone sees all" is off. R checks `{givenNames:"Mohammed", familyName:"Khan"}`.
Actual: `matches: []`, `hidden: 50`. R's own record is not named, and the real count is 2,000. The same happens for "Mohamed Khan".
Expected: R's own record is named, and the count is right, or labelled "50+".
Ref: `service.ts:45,73`. HEAD: R's record is named; the count is still capped (hidden 49).

**B7. Minor: a null byte answers 404 "Not found (it may have been removed by a reset)", and is logged with `Errors: 0`.**
Steps: `{"givenNames":"Lena\u0000","familyName":"Park"}` or `{"email":"lena\u0000@example.org"}`.
Expected: a 422 naming the field, as FO-2's `text()` refuses control characters. Other control characters (`\u0007`, `‮`, `​`) are accepted and matched. That is harmless, but it differs from FO-2. HEAD: unchanged (404).

**B8. Minor: the length limits count UTF-16 units, so names FO-2 stored can be refused.**
`z.string().max(100)` (`ports/matching.ts:43`) refuses a 60-character name written in astral characters (120 units), or a 60-character NFD name. FO-2's `text()` takes both, because it counts characters after NFC (`sales/common.ts:25-26`). Result: 422 on Add a lead's own check for a name that Add a lead saved.

## What held
- Firm wall: S (firm B) gets `{"matches":[],"hidden":0,"hiddenLine":null}` for firm A's people. `xr_app` cannot insert a person into another firm (RLS). Timing does not reveal other firms' contents: the firm_id filter runs first.
- Roles: no token gives 401. A forged token gives 401. A deactivated staff member gives 401. A role stripped of `agent/prospect:show` gives 403. `GET` gives 404. The path is not reachable under `/api/public`.
- Input shape: an array or object for a field, a number for the phone, `[]`, an unknown key, `__proto__` and an empty body all give 422. A `null` body gives 400. `%`, `_` and `'); drop table` are plain data with no SQL effect. A lone surrogate is replaced and still matches. Email case and surrounding whitespace are ignored.
- Trigger: as `xr_app`, `update … set phone_e164 = '+19999999999'` keeps the real key. `phone_readable = false` clears the key, and `true` restores it. An insert with a forged `phone_e164` and an unreadable phone stores null. `ALTER TABLE … DISABLE TRIGGER` is refused (not the owner).
- Migration on data: on a copy with 200,000 people (mixed readable, unreadable and empty phones), it applied cleanly in 6.5 s and backfilled 100,000 keys. `tests/check_prisma_schema.ts`: 8/8, with the shadow reset clean.
- Scores: `Math.floor(round3(sim) × 100)` has no off-by-one from 0.600 to 1.000. A score never exceeds 100. The output always passed `DuplicateCheckOut`. The check wrote no rows.
- Load errors: 300 concurrent checks all answered 200 (p95 2.4 s), with no pool or transaction-timeout errors.
