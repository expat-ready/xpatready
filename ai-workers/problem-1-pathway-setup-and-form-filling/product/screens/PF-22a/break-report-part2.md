# PF-22a part 2: break report, round 1 (R1.95, branch claude/runtime-pf22a-routes, head 614a425d9)

Scope: the diff `origin/claude/nice-turing-ue036e..HEAD`. That is the API only: `ports/custom-fields.ts`, `api/src/platform/custom-fields/{service,routes,registry}.ts`, `front-office/sales/custom-field-entities.ts` and the feature file. There is no screen, so keyboard, 1024 px, zoom, uploads and reload/back do not apply.

How I tested: scratch scripts `/tmp/claude-0/pf22a-break/break{,2,3}.mts`, modelled on `tests/check_pf22a_custom_fields.ts`. Each run uses a fresh database `xr_break_pf22a2_<pid>` on 127.0.0.1:54329 with every migration plus the PF-3 and FO-1a Sample seeds. The Nest app is built from the feature behind PF-4's guard, with PF-28's `inputBodyLimit` (256 KB) mounted, and staff sign in through LocalIdentity. Firm A has "everyone sees all" off. Staff: Owner, two CASE_OFFICER Agents (Agent, Other), Read-only, and Owner B plus Agent B in firm B. All databases are dropped.

## Findings

**M1 (Major): a field whose key looks like a secret can never take a value. Every save of it is a 500 and raises an audit alarm.**
- Cause: the PUT puts the field *keys* into the audit line's before/after (`service.ts:267`). `ports/audit.ts:37` `SECRET_FIELD` then refuses any key that matches `credential|salt|otp|hash|token|cookie|session_?id|login_?url|…`. The audit write is fail-closed, so the whole transaction rolls back. Keys come from labels (`keyFromLabel`, `ports/custom-fields.ts:39`) and a key never changes.
- Repro: as Owner, `POST {kind:"fo_prospect", label:"Educational credential assessment", type:"TEXT"}` gives 201. As Agent, `PUT /values/fo_prospect/<id> {version, values:{educational_credential_assessment:"yes"}}` gives **500**. The log shows `audit_write_error ZodError … rule BR-5`.
- The same happens for "Salt Lake office", "Carbon footprint" (fo**otp**rint), "Hashtag", "Session ID", "Cookie consent", "Login URL" and "Token number": every one is added (201) and every save is a 500.
- "Educational credential assessment" (ECA) is an everyday immigration term. If the field is also `required: true`, every custom-field save on every record of that kind is blocked: leaving it empty gets 422 "Fill in …", and filling it gets 500. The only way out is to archive the field.
- Expected: the value is saved and audited, or the label is refused at add time in plain words.

**M2 (Major): LONG_TEXT accepts up to 5,000 characters, but any value over 4,000 is a 500.**
- Cause: `LIMITS.longText = 5000` (`ports/custom-fields.ts:22`, `readValue` at :92, and the database's `pf_custom_value_ok`), but `AuditValues` caps a string at 4,000 (`ports/audit.ts:38`).
- Repro: a LONG_TEXT field "Case notes". A PUT of `"x".repeat(4000)` gives 200, while 4,001 and 5,000 give **500**, each with an `audit_write_error` alarm.
- Expected: either 5,000 saves, or the API refuses anything over 4,000 with 422 at the field. The suite has no LONG_TEXT case above 4,000.

**m1 (Minor): NUL and lone surrogates reach the database and come back as 500 (or a wrong 404).**
- Text value `"a\u0000b"` gives 500: Postgres 22P05, `\u0000 cannot be converted to text`. Production's ProblemErrors does not map it either.
- Text value `"a\ud800b"` gives 500: Prisma "JSON Error: unexpected end of hex escape".
- Label `"A\u0000B"` and help text `"h\u0000"` give 500 in the harness. In production they hit `main.ts:224` ("invalid byte sequence for encoding") and come back as **404 "Not found (it may have been removed by a reset)"** on a POST.
- Option `"x\u0000y"` gives 500.
- Label `"x\ud800"` is saved silently as `"x�"`.
- Expected: 422 at the field.

**m2 (Minor): the JS and database value checks disagree on year 0000, and the user gets a retry loop.**
`readValue(DATE, "0000-01-01")` accepts the value, but `pf_custom_value_ok` returns false. The PUT therefore answers **409 STALE_VERSION** "A value no longer fits its field. Reload and try again" (`service.ts:56`). Reloading and retrying gives the same 409 forever. Expected: 422 "Pick a real date".

**m3 (Minor): archiving a field without the confirm can still archive one that has a value (a race).**
`change()` counts values (`service.ts:154`) under the kind lock. A PUT does not take that lock, and its first insert is not yet visible to the count. The archive UPDATE then waits for the PUT's FOR SHARE and goes through.
- Repro: create a field, then send the PUT `{key:"v"}` and the PATCH `{archived:true}` (no confirm) together, with the PATCH delayed 0–21 ms. In 15 of 40 tries both answered 200 and a value was kept.
- The audit line says `valueCount: 0` and the summary leaves out "(n values kept)". Values are kept, so no data is lost; only the confirm rule and the audit count are wrong. Expected: 409 FIELD_IN_USE.

**m4 (Minor): the field list shows value and choice counts from records the caller cannot see.**
`GET ?kind=` is `@AnyStaff` (`routes.ts:19`). It returns `valueCount` and `optionUse` aggregated over the whole firm (`service.ts:85`). Repro: Other (view.own, everyone-sees-all off) lists fo_prospect and gets `tier: {Silver: 1}`, `langs: {English: 1}`, but gets 404 on the only prospect that holds those values. With small numbers this reveals values behind the own-vs-all wall ("a field never shows more than its record does"). Expected: counts only for `agent/custom-field:manage`, or counts limited to the records the caller sees.

**m5 (Minor): unbounded or silent answers to hostile `values` keys.**
- `values:{"__proto__":{"notes":"poison"}}` gives **200**: nothing is saved and no error comes back. PF-28's `__proto__` refusal looks only at the top level of the body. No global pollution was seen.
- 9,000 unknown keys (a 256 KB body) give 422 listing all 9,000 in `fields`: a 720 KB answer. `fieldsOf` caps at 20, but the service's `fieldsError` path (`service.ts:251`) does not.

**m6 (Minor): invisible characters pass as content.**
- Both sides accept TEXT that is only U+2060, U+3164 or U+200D, and a label `"ㅤ"` (201).
- EMAIL `a​b@example.com` and `a\u0085b@example.com`, and URL `https://a​b.com`, are stored. Neither JS `\s` nor `[[:space:]]` covers U+200B inside a value, which opens the door to look-alike addresses.

**m7 (Minor): a no-op change is audited.**
`PATCH {position: 3}` on an archived field returns 200 and writes a `custom_field.changed` line, but nothing changed. `place()` is skipped for an archived field, while `moved` is still computed (`service.ts:186-187`).

## What held
- **Walls:** Owner B gets 404 on firm A's values (GET and PUT) and on PATCH of A's field. B's list shows 0 of A's fields. A's key used on B's prospect gives 422 "not on this record".
- **Own vs all:** Other gets 404 on Agent's prospect and person (GET and PUT). A person id under `fo_prospect` gives 404. A company with no prospects is visible to its creator (200) and gives 404 to Other and to Read-only.
- **Roles:** Read-only PUT gives 404 (sees-all off); Read-only POST and Agent PATCH give 403.
- **Races:** two PUTs on one version give 200 and 409 STALE_VERSION. Four adds at 48 active fields give two 201s and two 422 LIMIT_REACHED (exactly 50). Two adds with the same label give 201 and 422.
- **More races:** in 20 tries each of type change vs first value and option removal vs PUT, no row was left that fails `pf_custom_value_ok`. Answers were 409 STALE_VERSION, 409 OPTION_IN_USE or 422, never a 500 or a deadlock. In 20 tries of value update vs option change, there was no deadlock. Clear vs archive gave 409 FIELD_ARCHIVED.
- **Value checks:** 2025-02-29 and `+02026-01-01` refused; 2024-02-29 and 9999-12-31 accepted. Numbers: `1e-7`, 0.1+0.2, `5e-324`, 999999999999999 and -0 accepted; `"1e3"`, Arabic digits and 20-digit strings refused. Strings with many decimals round to a double, consistently on both sides. Text: 500 emoji accepted, 501 refused; 500 NFD "é" accepted after NFC.
- **Choices:** SELECT with NBSP padding is trimmed to "Gold". MULTI_SELECT duplicates are de-duplicated; a case mismatch, a nested list and a number for SELECT are refused; NFD "café" matches its option.
- **Other inputs:** fullwidth phone digits refused. `constructor`, `toString` and `hasOwnProperty` keys are named in the 422. A 300 KB body gives 413. Options over 80 characters give 422.
- **Labels and keys:** labels that differ only by case or a trailing ZWSP give 422. Re-adding a label after archive gets a new key (`notes_3`). Un-archiving while the label is taken gives 422. An archived key in a PUT gives 422.
- **Position:** position -1 or 1.5 gives 422; 1000 clamps to the end and the list renumbers 0..n.
- **Audit:** the summary never holds a value. Values sit in `detail` as `<key>_before/_after`, the platform's R1.8 shape, not a leak.
- **Budgets:** 50 fields × 400 records (20,000 values): GET list 45–67 ms, PATCH 54–99 ms, reorder 78–161 ms, one record's values 12–16 ms.

Verdict: Changes 614a425d9
