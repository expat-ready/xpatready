# R1.62 break report: PF-4p part 1 (client plane, /api/portal guard, own cases)

Breaker, 25 Nov. Code broken: `3e506f8d8`, then re-run where it matters at `dded96722` (person rule as a trigger); `2e8acf698`
only renames the migration folder (the rollback's `_prisma_migrations` name follows it; checked) and adds card rows.
Scope: `shape.md` part 1 and BACKLOG PF-4p's part 1 items (schema, guard, client plane, own cases). Activation, invitations,
password, suspend/revoke routes, PF-27's `firmAllows` and FO-14 are part 2 or later and are not findings.

**How:** a copy of the commit (`git archive`) in my own scratch folder, its own `node_modules`; `isolated.sh brk4p 4441`
(database `xr_studio_brk4p`, app as `xr_app`), started three ways: `PLATFORM_IDENTITY=local` with a known
`PLATFORM_LOCAL_SECRET` (to forge tokens), the same plus `PLATFORM_SYSTEM_IDENTITY=local`, and with `PLATFORM_IDENTITY`
unset. Fixture as the builder's (Client A, B, a suspended client in `sample-firm`; Client C in `sample-solo`; cases A1, B1,
C1), written as the owner. Probes with curl and two tsx scripts. Never :4400. Copy stopped and dropped at the end. The
builder's own test passes on the copy: 50/50 at `3e506f8d8`, 51/51 at `dded96722`.

## Findings (no Blocker, no Major)

| # | Sev | What I did | Expected | Actual | Where |
|---|---|---|---|---|---|
| m1 | Minor | At `dded96722`, as `xr_app` in firm A: `delete from fo_person where id = <a person with an ACTIVE portal account>` (committed), then signed in with that account's email | the account cannot outlive its person (`3e506f8d8`'s key had `ON DELETE RESTRICT`) | `DELETE 1`. The account stays ACTIVE, signs in, and `/api/portal/me` answers 200 with `name: null`. The trigger only checks on insert and update. It relies on "fo_person rows are never deleted", but nothing in the database enforces that (`fo_person` has only `fo_person_firm_fixed`, `0_pf12_firm_first` and `fo_person_keys`). No code deletes a person today; a later eraser or merge that does would leave a live login. | migration (head) :34, :41-46 |
| m2 | Minor | Two inserts in one firm with `normalize('josé@example.test', NFC)` and `normalize(..., NFD)`, and one with `'nbsp@example.test' \|\| chr(160)` | "one per (firm, email)", "stored lower case and trimmed" | All three accepted: two accounts for one visible email, and one email that ends in a no-break space. `normalEmail` (NFC, JS `trim`) can never match the NBSP row. The check uses `btrim`, which strips spaces only, and does not check NFC. Part 2's writes go through `normalEmail`, so today this weakens only the database's own promise. | migration :27; service.ts:51 |
| m3 | Minor | `POST /api/portal/session/local` with a 4 MB JSON body (no token: the public door), and the same body on `/api/platform/session/local` | the same input limit as the other platform doors (PF-28: 256 KB, Sample) | The portal door parses the whole 4 MB and answers 422; the staff door answers 413. `/api/portal` is not in `INPUT_PATHS`, so the unauthenticated door takes the app-wide 5 MB. | api/src/platform/http/input.ts:20 (not touched by the PR; `/api/portal` needs to join the list) |
| m4 | Minor | `GET /API/PORTAL/ME` and `/API/SYSTEM/me` with a client token | the same guarded answer in any letter case (keys.ts says so) | 200 `text/html`: the web app's index, because the static catch-all `/^\/(?!api\/)/` is case-sensitive. Nothing is read, so it fails closed. `/api/PORTAL/me` and `/api/Portal/me` do reach the guard (200 for the client, 401 for a staff token). This is PF-4pc's known pattern; the comment claims more than it does. | main.ts:261; client-identity/keys.ts:13 |
| m5 | Minor | Code reading of the sign-in race: an account REVOKED between the first read and the row lock | refused with the revoked words, and the refusal recorded like the other refused sign-ins | Answers "Your access to the portal is paused" (`refuseStatus("SUSPENDED")` is hard-coded) and writes no `sign_in_refused` line. Not reproduced over HTTP: the window is one transaction wide. | service.ts:101, :107 |
| m6 | Minor | Sign-in by firm key + email for an unknown email, then a SUSPENDED, a REVOKED and a PENDING account | (part 1 has no password by design; local only) | Four different codes (`UNKNOWN_CLIENT` / `CLIENT_PAUSED` / `CLIENT_REVOKED` / `CLIENT_NOT_ACTIVE`): whether an email has an account, and its state, is readable without a password. Each refused try of a known account also writes one audit line, with no limit on how many. Acceptable for the local-only door. Part 2 has to check the password before `refuseStatus` answers, or it inherits this oracle. | service.ts:94-97 |
| m7 | Minor | Read `ports/audit.ts` | one meaning per actor word | `AuditActor` now documents `person:<fo_person id>` (the portal client), while `CaseActor` keeps `person:<party id>` (the case side's application subject on a link, person-link.ts:306-402). One prefix now covers two id namespaces, so an audit reader cannot tell which a `person:` line names. It is not exploitable: every caller builds its actor from a staff id or a constant (settings.ts:149 `auditActorOf`, legal hold, consent; case-side `actorOf` accepts only the simulated ids). | ports/audit.ts:12-15 vs :82-86 |
| m8 | Minor | As `xr_app` in firm A: `delete from platform_client_account where id = <an ACTIVE account>` | refused ("Never deleted: a revoked account is kept", AG-15-6) | `DELETE 1` (rolled back). Only the invitation key's RESTRICT stops it, and only when invitations exist. | migration :7 |

## What held
* **Planes.** Staff token on `/api/portal/me`, `/cases`, `/session/end` → 401 `TOKEN_REFUSED`. Client token on
  `/api/platform/me`, `/api/front-office/money/invoices`, `/api/front-office/prospect-currencies` → 401. On `/api/system/me` → 401
  (with and without `PLATFORM_SYSTEM_IDENTITY=local`). On `/api/runtime/cases` and `/api/session` → 403 link-only. On `/api/link/me` → 401.
  An our-staff (system) token on `/api/portal/*` → 403 `SYSTEM_SESSION_ELSEWHERE` (PF-4s's wall): refused, though as a 403, not a 401.
  Two `Authorization` headers (staff + client) → 401.
* **Forged tokens** (signed with the derived client key unless noted): alg `none`, `HS512` header, an extra `kid`, signed with the raw
  `PLATFORM_LOCAL_SECRET` or with the system secret, `plane: staff`, `token_use: id`, expired by 1 s, `exp` as a string,
  a payload that is an array, `sub` with a space or SQL text, the `Basic` scheme, `Bearer a b` → all 401. An upper-case `sub` → the
  same account (lower-cased). A `__proto__` key changes nothing. An `exp` a year out is accepted, but only someone holding the key can make one.
* **Own cases.** Client A sees only A1. B1 (same firm), C1 (other firm), a random id, a malformed id, 5,000 characters,
  Chinese characters, `%00`, a leading space, `.json`, `?id=` → the same 404 byte for byte (138 bytes). Median time for
  another client's id vs a random one is 6.1 vs 6.1 ms (30 each). Firm B's client gets 404 on firm A's case. A trailing slash and `/CASES/`
  reach the same own case. `../` and `%2e%2e` → plain 404. The one-CURRENT-stage index makes `stage` deterministic.
* **Sessions.** Sign-out on device 1 ends device 2 as well. A second sign-out with the dead token → 401. 30 rounds of sign-out run in parallel with
  re-sign-in: the old token never survived (0/30), and the new token always worked. 25 parallel sign-ins → 25 distinct auth
  times, none ahead of the clock. `auth_time*1000` round-trips exactly (checked over 10^6 consecutive milliseconds), so the same-millisecond case holds.
  Reads already in flight during a sign-out finish; the next read is 401. SUSPENDED, REVOKED, PENDING and NOT_INVITED set by
  SQL → the live token gets 401 at its next request, each with its own words. A firm set to DELETED → 401 `FIRM_CLOSED`; the other firm states
  are allowed, as on the staff guard (held and locked firms wait on PF-27's stub; pending, not a finding). Setting a revoked account back to ACTIVE by SQL revives
  its old token, so part 2's revoke has to set `sessions_ended_at` (noted for part 2).
* **Local door.** With `PLATFORM_IDENTITY` unset: sign-in → 403 `LOCAL_SIGN_IN_OFF`, a stand-in token → 401
  `SIGN_IN_NOT_SET_UP`, and the app starts. `PLATFORM_IDENTITY=local` outside `PLATFORM_ENVIRONMENT=local` is refused by PF-24's loader.
* **Database as `xr_app`.** With no firm set, nothing is read. Inserting firm B's account while scoped to firm A → refused by the RLS policy. Naming another
  firm's person, or an unknown one → refused (the trigger, at head). Moving an account to another person → refused. `platform_client_account_firm`
  returns only the firm id (null for an unknown id), runs `SECURITY DEFINER` as `xr_wall_reader` with a fixed `search_path`, and is executable
  only by `xr_app` and `xr_staff_bypass`.
* **Audit and logs.** 105 sign-in, 32 sign-out and 4 refused lines, all `CLIENT`. No email in any line. `api.log` holds no email
  and no token, and logs routes only as `/api/portal/cases/:id`. No staff path can write a `person:` line from request input.
* **Load.** `/api/portal/cases` with 50,000 `case_client` rows in the firm: p50 14 ms, p95 19 ms. This is a sequential scan, because
  `case_client` has no index on `fo_person_id` (the case side's table: a note, not this PR's).
