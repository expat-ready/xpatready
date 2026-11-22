# PF-28 part 3b — break report (PR #2931, head eb471eee2)

Breaker: Opus 5.5, 22 Nov. I ran an isolated copy, `brk_pf28b` on :4491 (`PLATFORM_IDENTITY=local`, ttl 60), seeded with `var/pf28-walk-seed.ts`. I switched on the Sample form with `var/pf28-walk-form.ts` and stopped the copy when done. The staff tokens were `user-R` (Owner + Case Manager) and `user-O` (Case Officer), both with `secondStep`. The fixtures were made through the API: 2 leads taken, 1 individual prospect, 1 corporate prospect with its company, and contacts. Public probes were spaced at least 2.1 s apart so they stayed under the 30/min limit. After each one I counted the rows in `fo_lead`, `fo_person`, `fo_arrival_receipt` and `fo_lead_attribution`. Live AI was off, so the cost was US$0. My scratch scripts are in the session scratchpad (`pub.mjs`, `conc.mjs`, `deep.mjs`, `staff.mjs`, `t1`–`t5.mjs`).

Scope: the `*.ts` diff a9fc53bf..eb471eee. That covers the public door (`sales/public.ts`), identity, conflict, assignment and sharing, duplicates, the corporate routes, prospect value and person phone.

## Findings

### M1 (Major, older than this PR but on the door it changes): a deeply nested JSON value gives an anonymous 500 on `POST /api/public/forms/:token/submissions`
- **Repro:** POST `{"zz":[[[…]]]}` with 5,000 nested arrays (10 KB) to the submissions door, with `origin: http://localhost:4491`. A valid token answers **500**, and so does a made-up 28-character token. The value can be under any key: `website` (the trap field), an unknown key, or a known one. Depths of 1,000, 2,000 and 3,000 answer 422 or 404 as they should.
- **Cause:** the API log shows `RangeError at JSON.stringify` at `public.ts:101`. This is the size check `Buffer.byteLength(JSON.stringify(body ?? null))`. It runs before the form lookup and before `parseInput`, so the new schema never sees the body. The same line was on the base commit (`public.ts:92`), so this PR did not cause it.
- **Expected (PF-28 row: "never 500"; the sweep wants 400/404/413/422):** 400 or 413. Nothing is stored and the process stays up. Each hit writes an error-level log line, limited to 30/min per address.
- **Same probe on the staff doors (256 KB parser):** 100,000 levels deep on `duplicates/check`, `PATCH people/:id` and `assignment-rules` answer 422, because those doors never call stringify on the body. The 500 happens only on the public door.

### m1 (Minor, regression): an attribution value of 32,001 characters is now refused
- **Repro:** a valid post plus `attribution.landingPage` = 32,001 ASCII characters. The whole body is still under 32 KB.
- **Actual:** 422 `attribution.landingPage: This is too long: at most 32000 characters.` On the base commit, `attributionOf` cut the value to 2,000 and stored it.
- **Where:** `public.ts:48` (`max(32_000)`). The comment at `public.ts:42-45` says "never refused for length". The embed script cuts to 2,000 itself, so only a hand-made post can reach this.

### m2 (Minor, regression): an `attribution.__proto__` key is now accepted without a word, while any other unknown attribution key is refused
- **Repro:** `"attribution":{"utmSource":"real","__proto__":{"utmMedium":"evil","clickIdKind":"ZZZ"}}`.
- **Actual:** 201. The stored row has `utm_source=real` and `utm_medium`/`click_id_kind` null, so nothing is polluted. By contrast, `attribution.utmFoo` answers 422 naming its field, and a top-level `__proto__` answers 422 (`input.ts:63`).
- **Base commit:** `attributionOf`'s `Object.keys` check refused a nested `__proto__` with 400. zod's `strictObject` skips that key, and `parseInput` checks own `__proto__` keys at the top level only. This is the same gap as part 1's m2, now one level down on the open door.

### m3 (Minor): a missing or oversized `submissionId`/`loadStamp` gets a field error a visitor cannot act on
- **Repro:**
  - `loadStamp` left out → 422 `fields.loadStamp: "This is required."`
  - `loadStamp` of 501 characters, or a number → 422.
  - `submissionId` left out → 422.
- **Before this PR:** all of these got the 400 "We could not read this form. Please reload the page".
- **Inconsistent today:** `submissionId:"x"` still answers 400 `BAD_REQUEST`, and `loadStamp:"123.abc"` answers 400 `RELOAD`.
- **What a visitor would see:** the hosted page (`web-form-page.tsx` `setErrors(p.fields)`) would show "Please check the form • This is required." with no field to fix. A real page always sends both values, so only hand-made posts reach this.

### m4 (Minor): some refusal words are not plain words
- **"Invalid input":** a union field (prospect `value`, identity `details`) with the wrong type answers `"Invalid input"`. Seen with `PATCH prospects/:id {"value":true}` and identity `{"details":5}`. This is zod's own message, which reaches the caller through `input.ts:45`.
- **"This must be a object.":** an array or string where an object belongs (body `[]`, `attribution:"x"`) answers this, with a grammar slip (`input.ts:40`). It now reaches the public door.

### m5 (Minor): `PATCH people/:personId` checks the body before the path id, unlike the other routes in this diff
- **Repro:** `PATCH people/abc {"zz":1}` answers 422. The other routes answer 404 first: `PATCH prospects/abc {"zz":1}` and `conflict-checks/zzz/confirm {"zz":1}` both answer 404.
- **Where:** `people/edit.ts:82` passes `personId` raw, with no `idParam`. Nothing leaks, because a random uuid with the same body also answers 422.

## What held
- **Public door, order of checks:** a missing, short or made-up token with an unknown field gives the same `404 FORM_NOT_AVAILABLE` as with a valid body. An off-site or missing `origin` gives `403 SITE_NOT_ALLOWED` before any field check.
- **Public door, refused fields:** each of these answers 422 naming its field:
  - `foo`, top-level `__proto__` and `constructor`;
  - `attribution.utmFoo`, an attribution sent as an array or a string, `attribution.utmSource:5`;
  - `givenNames:5`, `consent:null` and `consent:"true"`;
  - 25 unknown keys of 73 characters (capped at 20 fields, names cut to 64).
- **Public door, other answers:** `clickIdKind:"ZZZ"` still answers 400, and a garbage stamp answers `RELOAD`. A trap field `website` holding an object, null or false is thanked with 201 and nothing is stored. Invalid JSON, `"x"`, `null` or `5` as the body answers 400.
- **Nothing stored on a refusal:** row counts were unchanged after every 4xx.
- **Known and unknown people get identical answers:** a known email and an unknown email give byte-identical 201s, identical 422s with a bad field, and identical 422s with an unknown key. Three concurrent sends with one `submissionId` made 1 lead. A replay with a changed name or an extra field stored nothing new.
- **Screen bodies all accepted:**
  - the hosted page (consent true or false);
  - the embed body with all 9 attribution keys, null attribution, and null attribution values;
  - names like "Zoë 王小明 محمد / Ñúñez-Ångström" (from `conc.mjs`);
  - conflict preview, record and confirm; identity multipart with `details` joined, repeated, `details[]` or `details[0]`;
  - duplicate check; phone Edit; value set and cleared; board with repeated `?source=`; corporate engage, add contact, change role and change type.
- **Upper-case ids** were accepted and lower-cased on: value, phone, engage, contacts, role, change-type, identity person id and `requestId`, conflict `prospectId` (both path and body), and conflict `requestId` (an upper-case replay equals the lower-case one: one row).
- **Wrong role:** the Case Officer gets 403 `MISSING_PERMISSION` before any 422 on assignment rules and lead sharing (the guard runs first).
- **Identity uploads:**
  - `documentNumber` still gets the service's own sentence;
  - `__proto__[polluted]` and `constructor[prototype][x]` are refused 422 and `({}).polluted` stays undefined;
  - a refused upload (unknown field, random person) left the file store unchanged;
  - a PDF with planted instructions is stored as an opaque copy, and its text is never read.
- **No 5xx** in 241 logged requests, apart from M1.

## Older than this PR, outside the diff (not scored)
- Sending 2 copies to identity checks answers 413 "Add at most 20 files at a time" when the limit is 1.
- A multer field limit answers 400 ("Too many fields", "Field value too long - methodDetail"), not 422.

Breaker: Changes eb471eee22837d55191194a2edddeef45cf9e429
