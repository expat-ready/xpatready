# PF-5fp break report: the firm profile API (R1.92)

**Verdict: Changes** on `180c6706b46594db53e59e6e24f641d091c76f15` (PR #3003, branch `claude/sharp-johnson-ztwuoq`).
There is no Blocker. Two valid inputs end in a 500. The website takes control and invisible characters, which the phone refuses.
Permissions, firm isolation, all-or-nothing, the version check under load and audit-on-refusal all held.

Where it ran: an isolated copy `br192` on :4794 (`AI_LIVE=off PLATFORM_IDENTITY=local`), database `xr_studio_br192`, and never :4400. The copy is stopped now.
The PR's own check `tests/check_r192_firm_profile.ts 4794 xr_studio_br192` passed 30/30 before any attack. Cost US$0, no model call.
Sign-in: `POST /api/platform/session/local` as user-R (Owner), user-O (Case Officer), user-T (Admin, given by the check) and the sample-solo Owner.
Every PUT below is `PUT /api/platform/firm/profile` with `{ "version": <current>, ... }`.

## Major

**M1. A website with `@` and then a dotted name gives a 500, and each attempt raises an audit-failure alert.**
Repro (Owner or Admin): `{"version":v,"website":"https://medium.com/@sample.firm"}` gives 500. These give 500 too: `https://www.example.ca/team/@jane.doe` and `https://www.example.ca/contact?to=info@example.ca`.
`https://medium.com/@samplefirm` (no dot after `@`) gives 200.
Expected: 200, because these are ordinary public web addresses. If they must be refused, a 422 on `website` that says why.
Actual: 500 "Something went wrong on the server". The log shows `audit_write_failed` with a ZodError and fires the BR-5 `alert`.
Cause: `WEBSITE` is not `personal` (`service.ts:45-49`), so `writeSetting` puts its from/to in `detail` (`settings.ts:181-183`). The `detail` refine rejects anything shaped like an email (`ports/audit.ts:15,22`).
The transaction rolls back, so nothing is half-written. But the save cannot succeed, and an Admin can raise audit alerts at will.

**M2. A billing email with capitals gives a 500.**
Repro (Owner): `{"version":v,"billingEmail":"BILLING-X@SAMPLE-FIRM.EXAMPLE.CA"}` gives 500. The combined save `{publicPhone, timeZone, billingEmail:"Owner@Sample-Firm.example.ca"}` also gives 500.
Expected: 200 with the address saved in lower case, or a 422 in words on `billingEmail`.
Actual: 500 with a DriverAdapterError. The DB check `platform_firm_billing_email_lower` (`prisma/migrations/20261114015002_pf3_platform_tables/migration.sql:355`) needs `billing_email = lower(btrim(billing_email))`.
`Email` (`service.ts:31`, used at `:130`) trims but never lowercases. The check passes only because every test address is lower case.
Rollback held: the phone, time zone and billing email were unchanged and no audit line was written. The public email accepts `A@X.CA` as typed, so the two email fields behave differently.

**M3. The website stores control, bidi and invisible characters, and is checked as one address but stored as another.**
Repro (Owner), each 200 and stored exactly as sent:
- `"https://exa\nmple.ca"` and `"https://exa\tmple.ca/"`
- `"https://example.ca/‮gnp.exe"` (right-to-left override)
- `"https://exa­mple.ca"` (soft hyphen) and `"https://exa​mple.ca"` (zero-width space)

Expected: a 422 on `website`, as the phone gives (`no control or invisible characters`). `PUBLIC_PHONE` uses `INVISIBLE` (`service.ts:27,29`).
Actual: `Website` (`service.ts:33`) checks `new URL(s)` but stores the raw `s`. WHATWG URL drops tab and newline and maps away the soft hyphen, so the check passes on `example.ca` while the stored text differs.
The website is shown to clients (AG-12-109, `service.ts:4`). A newline or RLO there can spoof a link or break an email header. The same raw string goes into the audit `detail`.

## Minor

**m1. Owner-only details can be read by every role.**
GET as the Case Officer gives 200 with `ownerOnly.billingEmail` and the full `businessAddress`, including `phone` (`service.ts:79,99`).
Every role with `agent/settings:list` gets the same: Case Manager, Case Officer, Billing/Finance, Read-only (pf3 migration lines 1093-1098).
The address's existing reader, `GET /api/platform/billing`, needs `agent/subscription:pay` (Owner, Admin; `billing/routes.ts:69`). This route widens who can read it.
AG-16 §3.1 says "Owner only" for editing only, so a founder ruling or `challenge.md` should settle reading. STANDARDS §5 asks for personal data to be minimised, and the billing email is the Owner's sign-up email (`firms/signup.ts:230`).

**m2. Built-in object names are treated as read-only fields.**
Repro: `{"version":v,"constructor":"x"}` (also `toString`, `valueOf`, `hasOwnProperty`, `__proto__`) gives 422 "Some of these details are not changed here".
The answer has `fields:{}` and `issues:["constructor: function Object() { [native code] }"]`.
Cause: `k in READ_ONLY` follows the object prototype (`service.ts:115`). Expected: "This field is not allowed here", like `firmId`. `Object.hasOwn` would do it.

**m3. Some refusals are not in words.**
- `billingEmail:null` gives "Invalid input: expected string, received null".
- `publicPhone:4165550100` gives "Invalid input: expected string, received number".
- `language:"EN"` gives `Invalid option: expected one of "en"|"fr"`, and `currency:"cad"` gives the same shape.

These are zod's built-in messages (`service.ts:126,131`), against STANDARDS §6 (field-level messages in words). Lower-case `cad` or `EN` could be accepted, or refused in words.

**m4. The website allows `http:` and private hosts.**
`http://insecure.example.ca`, `http://127.0.0.1`, `http://10.0.0.1:8080/admin` and `https://1.2` all give 200 (`service.ts:33`).
The message promises "a web address starting https://". Nothing fetches the address today, so this is a mismatch, not a server-side request risk.

**m5. The phone accepts punctuation-only shapes.**
`((((((((1234567` and `........1234567` give 200 (`service.ts:30`). The regex allows any run of brackets and dots.

**m6. The format check runs before the Owner check.**
Admin with `billingEmail:"notanemail"` gets 422 (format named), not 403 (`service.ts:133` before `:134`). It reveals nothing sensitive.
Related: an Admin whose save carries the unchanged billing email gets 403 for the whole save. A screen that sends every field breaks Admin saves unless it drops the field when `canChange.ownerOnly` is false. Worth one line in the contract.

## What held

- **Role gate:** Case Officer PUT (version only, billing email or legal name) gives 403 at the door (`agent/settings:edit`), with no audit line. No session gives 401.
- **Admin and the billing email:** Admin billing email gives 403 OWNER_ONLY even when it equals the current value, with a stale version, or with a website in the same body. Nothing is written.
- **Firm isolation:**
  - Firm B sending firm A's version gets 409 carrying firm B's own `latest`.
  - `firmKey` or `firmId` in the body gives 422.
  - `?firmId=<A>` and `?firmKey=sample-firm` in the query are ignored: firm B reads and writes only firm B.
  - Firm A's settings are unchanged by firm B's saves.
- **Read-only fields:** `legalName`, `operatingName`, `countryCode`, `key` and `businessAddress` are refused in words. This takes priority over the Owner-only 403.
- **Bodies:**
  - `null`, a string, a number or garbage gives 400 BODY_NOT_JSON. `[]`, `[{}]` or an empty body gives 422 on `version`.
  - A number for `version`, or a version over 100 characters, gives 422.
  - 2 MB and 20 MB bodies give 413 quickly.
  - 20,000 unknown keys gives 422 with a 1.8 KB answer (capped). Nesting 5,000 deep gives 422.
- **Concurrency:**
  - 10 and 60 parallel saves from one version: exactly one 200, the rest 409, one audit line (60 in 669 ms; no transaction timeout).
  - Two different fields saved at once by Owner and Admin: 200 and 409.
  - Two parallel billing-email saves: 200 and 409. The row lock (`service.ts:139`) works.
  - A then B then A again: because the version is a hash of the content, a save from the first version succeeds. Nothing is lost, since that person's view equals the current state.
- **Audit:**
  - Refusals (422, 403, 409, 500) write no line. A same-value save writes none.
  - One `platform.setting.change` line per changed key. The public phone and email are marked `personal` (values held as before/after). The billing email line has before and after.
  - No personal value appeared in `api.log`, including in the 500 traces.
- **Email edge cases:** zero-width characters, Unicode local parts, IDN domains, IP literals, quoted local parts, `..`, a header newline and `%0a` are all refused. Spaces are trimmed.
- **Website edge cases:** `javascript:`, `data:`, user or password in the address are refused. IDN (`https://例え.テスト/パス`) and 490 characters are accepted; 500+ characters are refused.
- **Phone edge cases:** full-width and Arabic-Indic digits, a no-break space, zero-width and RLO characters, numbers, arrays, objects and booleans are all refused.
