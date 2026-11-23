# CS-D7c + CS-D7 break report (PR #3180, head 157dfdb6d)

Breaker, 23 Nov 2026. Isolated copy `brk_csd7` on :4482 (never :4400), seeded once with `tests/check_csd5_flags.ts 4482 xr_studio_brk_csd7` (28/28). Live AI off, US$0. Copy stopped afterwards.
Spec used: BACKLOG rows CS-D7c and CS-D7, plus the module rows. There is no `concept.md` for CS-D7, so the backlog rows are the "what gets built" list.
In the repros below, `DOC` is a current case document on the passport type (cited `REQUIRED_IF_NOT_EN_FR`), `OTH` is a current document on a type with no rule, and `POST flags` means `POST /api/runtime/documents/:id/flags` with `x-actor: user-O`.

## Findings

**M1 (Major): after a 409, the panel's next Save silently overwrites the other session's change.** `web/src/pages/case/document-flags/panel.tsx:25,32-38,47,50`. `<Form>` has no `key`, so the 409 refetch gives it the new `version` but its `useState` fields keep the stale values. The panel also always sends every field.
- Repro (Playwright, 1440 px):
  1. user-O opens the line menu, then **Document flags…** on `OTH` (language German, version 12).
  2. A second session posts `{version:12, language:"pt"}` and gets 200.
  3. In the dialog, set Notarisation to Required and press Save. The dialog shows "changed after you opened them (version 13 now)…". The language select still shows **de**.
  4. Press Save again: 200 and the dialog closes. The request was `{"version":13,"language":"de",…}`.
- Expected: after the 409 the form reloads to the stored values (pt), or the retry is refused.
- Actual: the stored language goes back to German. The audit shows "Portuguese → German", a change the first user never saw or chose. The version check (409) is undone with one extra click.

**M2 (Major): readiness reads neither the warnings nor the translation lines.** Row CS-D7 (4) says "Readiness (C7.6) reads the warning as an item, not a stop".
- Searching `api/src/readiness*.ts` and `engine/runtime/readiness.ts` for `flag_warnings`, `translation` or `expires` finds nothing. `translations` exists only in `case-checklist.ts` and `web/src/runtime/checklist.tsx`.
- Translation lines are worked out when the checklist is read, not stored as `checklist_line` rows, so `readiness-inputs.ts:128` never sees them.
- Effect: a filing with an expired passport and a needed translation shows nothing on Ready to file. No `challenge.md` records this as deferred.

**m1 (Minor): `expires_on` "0000-01-01" gives a 500.** `case-document-flags.ts:89`. `POST flags {version:v, expires_on:"0000-01-01"}` returns 500 "Something went wrong on the server". Postgres has no year 0. The transaction rolls back (no audit line, version unchanged).
- Also accepted: "0001-01-01" and "9999-12-31". Expected: 400 with a plausible date range.

**m2 (Minor): three-letter and made-up language codes are accepted, and English as "eng" asks for a translation.** `:84` allows `^[a-z]{2,3}$`, `:32` checks only `en` and `fr`, and the comment at `:29` says "two-letter". `POST flags {language:"eng"}` on `DOC` gives `translation: REQUIRED`, `language_name: "eng"`, and a "Translation + translator's affidavit" line. The same happens for "fra" and "zz".

**m3 (Minor): a line marked not applicable still asks for a translation.** On `DOC` set `{language:"es"}` (translation line, state "needed"). Then `POST /runtime/checklist-lines/<passport line>/not-applicable {reason, version}` returns 200 and the line state becomes `not_applicable`.
- Actual: `translations` still lists the document as "needed", and the line keeps its `flag_warnings`.
- Cause: `case-checklist.ts` (the `translationLines(docs.filter(subject))` call) reads every current document, whatever the line state.

**m4 (Minor): through the panel, switching to English keeps a staff-set Required line, and it reads "in English".**
- On `DOC`, staff set translation Required. Then save in the panel with Language English and the Translation select left on Required. The panel always sends `translation`, so `:134` never resets it.
- Response: the line "Translation + translator's affidavit … For Passport … (passport2.pdf), **in English**".
- The API-only test passes because it omits `translation`.

**m5 (Minor): the opposite case, a staff decision dropped when the language changes.** `:134`. On `OTH` (no rule), post `{language:"es", translation:"REQUIRED"}`, then `{language:"pt"}`. Translation becomes `null` ("Not set"), with audit "Required → not set". Spanish to Portuguese is not a change to English or French, and no type default replaces the staff value.

**m6 (Minor): Provided → Required keeps the old Provided detail as the reason.** `:52`. On `DOC`, post `{translation:"PROVIDED", translation_detail:"Translator X, affidavit 2026-11-01"}`, then `{translation:"REQUIRED"}`. `translation_words` reads "Required: set by staff (Translator X, affidavit 2026-11-01)."

**m7 (Minor): long details are cut off in the audit line, and emoji are split.** `:147` uses `.slice(0,600)` on UTF-16 units.
- Repro on `OTH`: set `translation_detail` to `"a"+"😀"*149`, then to `"aa"+"😀"*149`.
- The second audit summary loses the new value and ends in U+FFFD (checked with `summary like '%'||chr(65533)||'%'`, which is true).
- Any change from one 300-character detail to another loses the "after" value.

**m8 (Minor): a superseded document's flags can still be changed through the API.** `reach()` (`:99-106`) does not check `current`. Upload a new passport on the line, so `DOC` becomes `current:false`. Then `POST flags {version:14, language:"es", expires_on:"2020-01-01"}` on the old file returns 200 and writes audit lines, which edits history. The UI offers the menu only for current files.

**m9 (Minor): "today" is UTC, not the firm's day.** `:112` and `case-checklist.ts:156` use `new Date().toISOString()`. P-607 says the firm's zone through the clock port (`deadlineDay`, `case-stages.ts:77`). A document expiring on 23 Nov shows "Expired" from 19:00 Toronto time on 23 Nov.

**m10 (Minor): "older than max_age_days" is measured from the upload date.** `:60`. A police certificate issued two years ago and uploaded today gets no warning. The row says "a document older than the type's max_age_days"; no issue date is stored.

**m11 (Minor): the SQL citation check is weaker than the API.** `20261123100000…/migration.sql`: `btrim` trims spaces only.
- In a transaction, `update document_type set has_expiry=false, defaults_source_quote=E'\t\n', defaults_source_file=E'\t' where … status='PUBLISHED'` gives `UPDATE 1`.
- The same holds for `U&'\200B'` / `U&'\00A0'`, and a 1-character quote passes too.
- The API takes any 3-character quote and file ("abc"/"abc"). Rule 4 also asks for a date, which is not stored.
- The same `btrim` gap applies to `case_document_*_provided_check`: `translation_detail=E'\t'` is accepted.

**m12 (Minor): the expert signs a defaults line that shows only the source file name.** `engine/validate.ts` `defaultsLine` prints "(source: Test source (break) p2)" and not the quote, on the release review's `needs_sme` item.

**m13 (Minor): raw validation-library messages reach the user.** `{version:1.5}` gives "Invalid input: expected int, received number". `{expires_on:20261231}` gives "Invalid input: expected string, received number".

**m14 (Minor, test gap): the migration checks run on rows created after the migration.**
- `check_csd5_flags.ts:56` checks two documents uploaded after migrating.
- `check_csd5c_type_defaults.ts:38` checks types loaded after migrating.
- Neither holds a row that existed before the migration, which the rev 16.7 amendment asks for.

## What held
- **Roles on the flags route:** user-O, user-R and user-T (same firm) get 200. user-S (other firm) gets 404 in the same words as an unknown id. user-P, user-Q, user-A, user-B and user-C get 403 before any lookup. No header or an unknown actor gets 401.
- **Cross-firm documents:** user-S's own case document is 404 for user-O, user-R and user-T. Body errors return 400 before the lookup, the same for real and random ids, so there is no existence oracle. Upper-case ids resolve.
- **Concurrent saves:** 3 rounds of 8 parallel saves on one version each gave exactly one winner and 409s, with one audit line per winner. The extra 200s were no-op saves of the value already stored.
- **Inputs:** `version` as a string, negative, missing or fractional gets 400. Extra keys are refused (strict). Control characters and lone surrogates are refused. A detail over 300 characters is refused, including a 3 MB body. Whitespace or zero-width-only details count as empty, so Provided is refused. Arabic, Japanese and emoji are stored. Feb 29 is checked correctly. `null` clears and a missing key keeps the value.
- **Warnings never block:** line state and `current` are unchanged by the expired and too-old warnings.
- **Audit:** no line for a refusal (400, 409, 500 rollback) or a no-op save. One line per changed flag. No file contents.
- **Defaults roles:** only user-A proposes. user-B, user-C, user-O, user-P and user-S get 403. Runtime people get 403 on GET. Self-approve gets 403. Only the proposer withdraws, with a 3–300 character reason.
- **Citation:** an uncited value gets 400 `DEFAULTS_UNCITED`. Clearing needs no citation and stores none. SQL refuses a published version with a value and null or space-only citation, and enum and range values that are out of bounds.
- **Defaults races:** 6 concurrent proposals made 1 change (201 plus 409s). Approve, approve and return in parallel gave one APPROVED and two 409s. Approve against withdraw ended safe (the withdraw got 409, the draft stayed consistent). Withdraw after approve put the draft back to before. A second withdraw got 409.
- **Release:** the change goes RELEASED with the combination release. The cleared type's snapshot entry is byte-identical to the original release (md5 `2c6c21bc…`, v1 = v4), and the `document_types` of v2 and v4 are identical. Types without defaults carry no `defaults` key.

Verdict: Changes

## Round 2 (head 2cd403ffd, diff since 157dfdb6d)
Breaker, 23 Nov 2026. Isolated copy `brk_csd7` on :4438 (never :4400), seeded with `check_csd5_flags.ts` (35/35), stopped afterwards. Live AI off, US$0. `DOC` = the current passport file, `F` = its filing.
- **R2-M1 (Major): a passed "too old" warning reopens every day, so a Ready-to-file filing falls back each morning.** `api/src/case-document-flags.ts:60` words the warning `Uploaded ${age} days ago…`, and `engine/runtime/readiness.ts:256` uses those words as the line's `part`, so the pass key changes daily. Repro: set `DOC.uploaded_at` 400 days back; `POST /runtime/filings/F/warnings/document_flag/pass {reason}` gives 200 and the prepare view lists the line under passed. Move `uploaded_at` back one more day (= tomorrow): the line is open again ("Uploaded 401 days ago…") and the old pass covers nothing. `readiness.ts:159` (`now()`) then takes a READY_TO_FILE filing back to Not started. Fix: a stable `part` (e.g. `age|<max_age_days>|<upload day>`, `expired|<date>`, `translation|<doc id>|<language>`), with the changing words kept only in `words`.
- **R2-m1 (Minor): the m8 fix has a race: flags still land on a file replaced at the same moment.** `case-document-flags.ts:141` reads `current` outside the write, and `:161` updates `where {id, flagsVersion}` only. Repro: in psql `begin; update case_document set current=false … where id=DOC; select pg_sleep(3); commit;`, and during the sleep `POST flags {version, language:"ru"}`: 200, and the replaced file ends `current=f, language=ru, flags_version+1`, with an audit line. 30 parallel upload+save pairs gave 5 audit lines stamped after `superseded_at`. Fix: add `current: true` to the `updateMany` where; on count 0, re-read and answer `not_current` or `flags_changed`.
- **R2-m2 (Minor): after a `not_current` 409 the panel says "The form now shows the flags as they are: make your change again", but it cannot.** `web/src/pages/case/document-flags/panel.tsx:56` adds that sentence to every 409. The version does not change, so the form is not re-seeded and still names the old file. Every retry gives the same 409. Repro (Playwright, 1440 px): open Document flags… on `DOC`, upload a newer file through the API, type an expiry, Save: 409. Save again: the same 409, and the dialog stays open on the old file name. Fix: on `code === "not_current"`, say "A newer file was uploaded: close this and open its flags" and offer only Close.
- **R2-m3 (Minor): m11 is only partly fixed. SQL `[[:space:]]` misses Unicode blanks, and a detail needs only 1 character.** In a transaction, a published `document_type` with `has_expiry=false` and a quote and file of `U&'\200B\200B\200B'`, `U&'\00A0\00A0\00A0'` or `U&'\3000\3000\3000'` gives `UPDATE 1`, and so does `'...'`. `translation='PROVIDED', translation_detail=U&'\200B'` also gives `UPDATE 1`. The API also accepts `translation_detail:"x"` with Provided (200), while the hand-over says "at least 3 characters". Fix: in SQL, strip `[\s  -​  　﻿]` (or count `[[:alnum:]]`), and use one minimum, 3, for the detail in both the API and SQL.
- **R2-m4 (Minor): m3 is half fixed. A line marked Not applicable still shows its flag warnings.** Readiness and the translation line drop it (both checked). But `GET checklist` still gives `state:"not_applicable"` with `flag_warnings:["Expired on 2020-01-01…","Uploaded 401 days ago…"]` (`case-checklist.ts:208`). Fix: empty `flag_warnings` when the line is not_applicable or waived, as `flagWarningsOf` does.
- **R2-m5 (Minor): English → Spanish keeps a staff "Not required", so a Spanish passport has no translation line and no readiness item.** Repro: `{language:"en", translation:"NOT_REQUIRED"}`, then `{language:"es"}`: the result is "Not required: set by staff; the document is in Spanish", and prepare lists no translation item (`:152` resets only Required, and only for en/fr). The m5 reasoning ("only a change that matters") applies the other way here. Fix: on a change from en/fr to another language, send a staff Not required back to the type's default (or keep it and add a `document_flag` "check the translation decision" item).
- **R2-m6 (Minor): no readiness item while the language is not set on a type with the rule.** A new upload has `language=null`, and its flags read "Pick the document's language…". `flagWarningsOf` emits nothing (the `translation` is null, not "needed"), so the filing can be Ready to file with the question unanswered. Fix: add "Pick the document's language" to the warnings when `translation_rule = REQUIRED_IF_NOT_EN_FR` and the language is null.
- **R2-m7 (Minor): the migration records no rollback** (STANDARDS §5 [M]; the earlier readiness_pass migrations each record one). A rollback has to deal with `document_flag` rows in the append-only `readiness_pass`. Fix: add the rollback comment, in the same form as `20261109120000_c78…`.
- **R2-n1 (nit): the panel still pre-fills a stored detail that the words now hide** (m6). A detail kept from Provided, or set while not Provided, shows in the Translation detail field and is reused if Provided is picked again.
### Round-1 items
- **Fixed:** M1 (the form re-seeds by version and sends only the changed flags; a 409 at 1440, 1024 and 720 px fits, the alert is read, focus stays in the dialog). M2 (`document_flag` warning, passable, never a block). m1 (1899/2201 and 1900-02-29 give 400; 1900-01-01, 2200-12-31 and 2000-02-29 are stored). m2 ("eng", "zz", "", full-width "ｅｓ" and "es\0" give 400; " ES " is stored as es; SQL refuses 'eng'). m4 (only the language is sent, so Required → type default on English). m5. m6 (in the words). m7 (summary 114 characters, no U+FFFD; the whole 151-character detail is in `detail.after`). m12.
- **Partly fixed:** m3 (R2-m4), m8 (R2-m1), m11 (R2-m3). m13: the version messages are fixed; `expires_on:20261231` and `translation_detail:5` still give "Invalid input: expected string, received number".
- **Open, proposed as follow-up rows in the hand-over (not re-tested):** m9, m10, m14.
### What held (round 2)
- **Migration:** both migrations are applied on a fresh copy. `check_readiness_pass_codes.ts` gives 4/4, and the known-codes list is the c78 list plus `document_flag` (19 = WARN_CODES). The severity check leaves `document_flag` as non-critical. A `document_flag` pass row is stored (append-only).
- **Readiness:** the item is on `owes: staff`. Passes are per key, through the existing route and UI (generic code handling). `readinessOfCase` has one caller, so view, pass and ready agree. Expired and translation-needed keys are stable across days. A line marked not applicable or waived drops both the item and the translation line.

Verdict (round 2): Changes (R2-M1).
