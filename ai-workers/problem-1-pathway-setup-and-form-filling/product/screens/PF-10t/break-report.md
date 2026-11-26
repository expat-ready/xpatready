# PF-10t break report: people as an import target, the import list, the record's origin (#3705, 984a9219)

Breaker, 26 Nov. Scope: this part's diff only (`git diff origin/claude/happy-bardeen-k0jqsn...HEAD`): `person.ts`, `GET /api/platform/imports`, `GET /api/platform/imports/origin/:kind/:id`. Part 1 (the engine) is out of scope, and so are companies, leads, undo and the screen (parts 3 and 4).
Copy: `tools/isolated.sh brk10t 4431 start PLATFORM_IDENTITY=local` (its own database `xr_studio_brk10t`, stopped afterwards; log in `studio/var/isolated-logs/brk10t-api.log`). Sample firms; user-R (Owner) imported, user-T, user-O and user-S (the other firm) attacked. Calls went through the real HTTP API and the real job worker. Live AI off, US$0. Scripts are in the session scratchpad (`brk/t1.mjs` to `t10.mjs`).

## Findings

### M1 (Major): an existing person whose email the consent store cannot read makes every dry run that names them fail with a 500
- **What I did:** imported `josé@exemple.fr`, `li@例子.中国`, `"mia,c@example.com"` and `ugo@ex_ample.com`. All four were created; `josé` and `ugo` also got a live IMPORT_DECLARED consent. Then I uploaded the same file again and asked for its dry run. In a second test the file had no consent column, a new person and `li@例子.中国`.
- **Expected:** the people already on file are SKIPped or MERGEd, as the PR's "a re-import adds no person and no consent" promises.
- **Actual:** **500 "Something went wrong"** for the whole dry run, in both tests (t2, t10). Nothing in that file can be imported while one such person exists. This also covers people created by FO-2 or FO-1p, because `ports/matching.ts:16` `normaliseEmail` accepts any non-space text with `@` and a dot.
- **Cause:** `find()` always calls `consentState()` (`person.ts:80`), even with no consent column mapped. That calls `ConsentPort.allows()` (`person.ts:87`), whose `normaliseAddress` throws a ZodError for anything outside `EMAIL_KEPT` (ASCII only, `ports/consent.ts`). In the run job the same throw becomes a row marked `write_failed`.
- **Also:** the 500's log line carries the raw address (`"input": "josé@exemple.fr"`, api.log line 70).
- **Also:** the import writes marketing consent for addresses that the consent gate cannot even check (`person.ts:60` accepts what `EMAIL_KEPT` refuses).

### M2 (Major): a consent that was withdrawn is given again through a merged-away person's email
- **What I did:** set up person A (`mona.old@…`, phone P), whose marketing consent was recorded and then withdrawn (STAFF). A was tombstoned into survivor B (`mona.new@…`, same phone, withdrawal written for B too), as FO-9b does for a phone match where the other email is kept. Then I imported `Mona,Loser,mona.old@example.com,,yes` with the declaration ticked.
- **Expected:** the person who withdrew is not given marketing consent again. The PR says "an import never brings back a consent the person withdrew".
- **Actual:**
  - The dry run and the run both show CREATE.
  - A new person C was created with `mona.old@example.com` and a live IMPORT_DECLARED consent.
  - `allows(C, mona.old@…, MARKETING)` returns `{"allowed":true,"reason":"CONSENT"}`.
  - So marketing email can again go to the address of a person who withdrew, and the firm now holds a duplicate of B (t4).
- **Cause:** `find()` drops merged-away people (`person.ts:78`, `mergedIntoId: null`) and never follows `merged_into_id` to the survivor. `create()` records consent without checking any withdrawal at that address (`person.ts:101`). A STAFF withdrawal is per person, not per address, so the gate does not catch it.

### M3 (Major): the same person twice in one file, or a later file that adds the email, makes two people
- **What I did:** imported a file with `Vi,One,,6475550401,` and then `Vi,One,vi@example.com,647-555-0401,yes` (t8). In another run, a phone-only row came before an email row with the same phone (t3, rows 4 and 5).
- **Expected:** one person. AG-18-13 asks for duplicates to be found within the file and against the firm's records, and non-exact possible duplicates to be flagged. X-2 says one person record per real person.
- **Actual:**
  - Both rows are CREATE in the dry run and in the run, with no warning.
  - The result is two `fo_person` rows with the same `phone_e164 +16475550401`, and the consent sits on the second.
  - The same happens when a person known by phone only is imported again from a newer spreadsheet that now has their email.
  - In the opposite order (email row first, then phone only; t3 rows 6 and 7), the dry run says CREATE but the run says SKIP `nothing_new`, so the preview's totals are wrong.
- **Cause:** the natural key is the email whenever there is one, and the phone is never consulted (`person.ts:72`, `person.ts:77`). FO-9a's match flags email OR phone.
- **Note:** this follows "natural key email, else phone" in the backlog row word for word. The finding is the duplicate the rule produces, with no possible-duplicate warning.

### m1 (Minor): a consent is recorded for an address that is suppressed
- **What I did:** suppressed `sup.new@example.com` (COMPLAINT), then imported a new person with that email and `yes`.
- **Actual:** the person was created with a **live** IMPORT_DECLARED consent (t4). The gate still answers SUPPRESSED, so nothing is sent today. But the store now holds a "given" consent for an address the firm suppressed, contrary to "never overrides … a suppression".
- **Held:** for an *existing* suppressed person (`sup.old@…`), the import filled the phone only and wrote no consent.
- **Cause:** `person.ts:101` calls `recordConsent` without asking `allows()`.

### m2 (Minor): a name made only of symbols is dropped without a reason
- **What I did:** imported a given name of 200 × 😀, and another of `ㅤ` (U+3164), each with a family name.
- **Actual:** CREATE, with `given_names` NULL and no reason or warning in the preview (t7). The cause is `person.ts:42`: when `hasWord` is false the value becomes `undefined`.
- **Related:** Persian names written with ZWNJ (`Mehr‌angiz`) and the ZWJ emoji family are refused as `not_text`. That is the same rule FO-2 applies (`ports/fo-person.ts:24`), so it is only noted here, but `fa` is on this target's language list.

### m3 (Minor): the origin endpoint ignores unknown query keys
- **What I did:** called `GET /api/platform/imports/origin/fo_person/<id>?x=1`.
- **Expected:** 422 naming `x`, as PF-28 requires and as the list now does (`?foo=1` gives 422).
- **Actual:** 200 (t6). The route takes no `@Query` and parses none (`routes.ts:43`).

### m4 (Minor): matched rows double the time of a dry run, and all of it runs inside the HTTP request
- **What I did:** a 5,000-row file (the engine's ceiling).
- **Actual:**
  - Dry run with 5,000 new rows: 4.6 s.
  - The same file again, so all 5,000 rows match: **10.3 s**.
  - The run job took 40.6 s.
- **Cause:** each matched row adds a call to `allows()` (suppression, consents, withdrawals and the unsubscribe query: up to 4 queries) through `find()` (`person.ts:80`), one row after another, inside the dry-run request. STANDARDS §9 sets no budget for imports, so this is recorded and not treated as a breach.

## What held
- **Email case and spacing:** `Ana.Case@Example.com` and `  ana.case@example.com  ` give one key. The second row is SKIP `duplicate_in_file`, with one person and one consent (t1).
- **Consent values:** `Yes`, `y`, ` Y `, `TRUE`, `1` and `oui` count as yes. A blank writes nothing. `x`, `Yes.` and `on` are an error, `not_allowed_value`.
- **Declaration and email:** a consent column without the declaration is 422 (suite). Consent on a row without an email is `needs_email`.
- **No double consent:** re-importing people who already have a live consent gives SKIP `nothing_new` and no second consent row. Two batches of the same 41 rows run at the same time give 41 people, 40 consents, no duplicate emails and no double consents; the advisory lock holds (t5).
- **Merges:** filled fields are kept and only empty ones are filled. A person whose consent was withdrawn is SKIPped (suite). An existing suppressed person gets no consent (t4).
- **Phone formats:** `(416) 555-0111`, `+1 416 555 0111`, `1-416-555-0111` and `416.555.0112` match each other in E.164, and so do `+44 20…`, `0044 20…` and `011 44 20…`. Arabic-Indic and full-width digits are read. An extension is refused (`not_phone`). A re-import of phone-only rows in other formats gives SKIP (t3, t8).
- **Names and text:** a 200-character name is kept and 201 is `too_long`. NFD is stored as NFC. A bidi override is refused. Formula and HTML text are stored as plain text. `EN` is read as `en`; `en-CA` is refused.
- **List:**
  - The other firm's Owner sees `total: 0`, so the firm wall holds.
  - Case Officer and Case Manager without `agent/import:view-report` get 403; no session gets 401.
  - `?page=abc` and `?page=-1` give page 1, and `?page=99999999999` gives page 10000.
  - `?page=1&page=2`, `?page[a]=1` and `?foo=1` give 422.
- **Origin:**
  - The other firm gets `{imported:false}`, the same answer as a random id, so it does not reveal whether a record exists.
  - An upper-case UUID is read as lower case.
  - `FO_PERSON`, `person`, `constructor` or an encoded `../` as the kind gives 404; a malformed id gives 404.
  - Without the key the answer is 403.
  - `/imports/origin` and `/imports/list` do not collide with `/imports/:id`.
- **Quiet:** after every test there were no `fo_lead` rows and no `msg_outbox` rows (t5, t10).
- **Not applicable to this API-only part:** keyboard, 1024 px, 200 % zoom, PDF uploads and the 100 programs / 400 combinations budgets.
