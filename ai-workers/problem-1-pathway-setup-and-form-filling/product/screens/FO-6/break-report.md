# FO-6 part 1: break report (schema and migration, P-303)

Head attacked: d1590f23b5289ea89da77f01a1b5f0a3e0491b41. I started on cc9e6b9; the only change since then is the GRANT/REVOKE CREATE pair around `$readers$`, re-checked below. Method: one scratch database (`xr_studio_fo6brk_main`, PostgreSQL 18.3 at :54329). All 142 migration folders were applied in order from `git archive` of the head. Two Sample firms and their staff were inserted as `xr_studio`. Attacks ran as `xr_studio` (superuser), as `xr_app` with `app.firm_id` set in the transaction (as in check_pf12_walls.ts), and as `xr_app` under `SET ROLE xr_staff_bypass`. Concurrent cases used two psql sessions. The database was dropped at the end. No code was edited, and nothing touched :4400 or any other database.
`M` = prisma/migrations/20261122020000_fo6_signing_tables/migration.sql.

## Findings (no Blocker, no Major)

**m1 (Minor): the "expires on its day, never before it" rule (review m5) holds only if the caller supplies a truthful `ended_at`** (M:153-159, M:272).
`update fo_signature_request set status='EXPIRED', ended_at=expires_at where id=<SENT request sent just now>` gives `EXPIRED`, 14 days early. Likewise `... set status='CANCELLED', cancel_reason='WITHDRAWN', ended_at='9999-01-01'` is accepted.
Expected: the end time is bounded by the clock, for example `ended_at <= now() + skew`, or the doc says the database trusts the injected clock. Actual: any finite `ended_at >= sent_at` is accepted. The "pass" case in tests/check_fo6_signing.ts:131 does exactly this right after sending, so it proves the early expiry rather than the rule.

**m2 (Minor): a signer's moments are not bounded by the request's window** (M:179-182, M:280-317).
On a SENT request, `update fo_signer set consent_text_version='v1', consented_at='2000-01-01', signed_at='2000-01-01' where id=<client>` is accepted (before `sent_at`). So is `consented_at = signed_at = now()+interval '30 days'` (after `expires_at`) and `'3000-01-01'`.
A signature after `expires_at` that lands before the expiry job runs then makes the request impossible to expire (the BR-16 rule refuses it).
Expected: `signed_at` falls within `sent_at..expires_at`, or this is left to the API with a note. Actual: no bound.

**m3 (Minor): the firm can sign a request that has no client signer** (M:312-315).
On a request whose only signer is the firm, `update fo_signer set consent_text_version='v1', consented_at=now(), signed_at=now() where id=<firm signer>` returns 1. "Firm signs last" is satisfied vacuously.
After that, no client can be added (M:292-295), so the request is stuck with an orphan firm signature until it expires or is cancelled. Not unsafe, but the firm "signed" something no client will ever sign.
Expected: the firm signs only once at least one client has signed. Actual: accepted.

**m4 (Minor): a request can be created already past expiry.** The insert takes `sent_at='1990-01-01', expires_at='1990-01-02'` and is born SENT (M:153; the clock is again the caller's). Same root cause as m1.

**m5 (Minor, cross-firm side channel, by design under review M4).** A firm A session (`xr_app`, firm A) that inserts a request with firm B's `provider_document_id` gets `duplicate key value violates unique constraint "fo_signature_request_provider_provider_document_id_key"`. That tells firm A the id exists. Provider ids are random, so practical risk is low; noted only.

**m6 (Minor, informational).**
(a) Case variants are distinct keys. Both `provider_document_id` 'app-1' and 'APP-1' are accepted, and so are receipt `event_id` 'e1' and 'E1' on one request. Whether that is right depends on the provider's id semantics.
(b) An evidence key is not tied to its request: request R's evidence may name `signing/someone-else/sealed.pdf`. FilesPort scopes keys per firm (ports/files.ts:1-2, 22-23), so nothing crosses firms.

## Attacks that held (expected = actual = refused or safe)
- **Status path**:
  - backward moves are refused: CLIENT_SIGNED→VIEWED, VIEWED→SENT.
  - CLIENT_SIGNED→EXPIRED is refused, even with `ended_at=expires_at`.
  - SENT→CLIENT_SIGNED with no signatures is refused.
  - DECLINED needs a signer who declined.
  - a DECLINED request cannot then be CANCELLED.
  - SIGNED is final: `updated_at` alone, `status=status`, a new signer and a second evidence are all refused ("is final").
- **Immutability**:
  - request: `UPDATE` of `id`, `firm_id`, document, version or expiry is refused.
  - signer: `id`, `firm_id`, `request_id`, person/staff and `link_token_sha256` (including an upper-case rewrite) are fixed.
  - viewed and consent cannot be re-set or NULLed.
  - a declined signer cannot be un-declined or signed later. Declined + signed in one statement fails `signed_check`.
- **Cancel and end fields**: CANCELLED without a reason is refused; a cancel reason on VIEWED is refused; `ended_at` on a live request is refused.
- **Signer inserts**:
  - a signer cannot be inserted already signed, with or without consent.
  - `INSERT … ON CONFLICT (id) DO UPDATE` that signs the firm early is refused by "firm signs last".
  - evidence `ON CONFLICT DO UPDATE` is refused ("never changes").
- **Multi-row UPDATE**: signing all three signers in one statement succeeds only because the firm row is processed last. Per-row visibility keeps "firm signs last" true.
- **Evidence**:
  - refused before CLIENT_SIGNED and before the firm signed.
  - once evidence exists, CANCELLED is refused and signer fields are frozen.
  - consent version must match every signer's.
- **Key shapes**: `signing/../x`, `signing//x`, `/signing/x`, `signing\x`, `signing/%2e%2e/x`, `signing/./x`, `Signing/x`, `signing/X`, `signing/x/`, `signing/ x`, `signing/x/..`, `signing/.x`, `signing`, `signing/` and an embedded newline are all refused (only `signing/x..y` is accepted, correctly).
- **Ref and consent fields**: refused for a unicode lookalike, a trailing `\n`, fullwidth characters and 201 characters. Version 0 and an `infinity` expiry are refused.
- **Receipts**: a receipt naming another provider, another request's document or a case-variant document id is refused. Receipt `UPDATE` is refused.
- **Delete and truncate**: refused on all four tables, including as `xr_staff_bypass`. `truncate platform_firm cascade` aborts. Deleting a staff member or firm in use is refused (RESTRICT).
- **Concurrency (two sessions)**:
  - a second live request for one document waits, then fails on `one_live` (1 live row).
  - firm signing while the first client insert is pending: the firm is refused.
  - a client insert after the firm signed is refused.
  - a REPEATABLE READ firm-sign whose snapshot predates a client insert gets "could not serialize".
  - expire racing a client signature: refused ("never expires").
  - client signature racing an expiry: refused ("EXPIRED … final").
  - two sessions signing the same signer: the second is refused, and consent v1 is kept.
- **PF-12 as xr_app**:
  - with no firm set, the session sees 0 rows; firm A sees only firm A's rows.
  - firm A cannot update B's request (0 rows), insert a row for B, attach a signer or receipt to B's request, use B's staff as sender or firm signer (composite FKs), or move a signer to firm B.
  - a firm B session cannot touch A's signer.
  - the full SENT→VIEWED→CLIENT_SIGNED→evidence→SIGNED flow plus a receipt works as xr_app, so the definer triggers run.
  - a temp table shadowing `fo_signature_request` is ignored (`pg_temp` is last).
- **Role escapes**: xr_app is refused `session_replication_role` (also under `xr_staff_bypass`), `DISABLE TRIGGER`, `DROP POLICY`, `TRUNCATE`, `SET ROLE xr_wall_reader`, `CREATE` in public, and calling a trigger function directly. Only the superuser `xr_studio` can bypass with `replica` (expected).
- **d1590f23b's GRANT/REVOKE pair**:
  - after the migration, `public`'s ACL has no `xr_wall_reader` entry, and `has_schema_privilege('xr_app','public','CREATE')` = f.
  - On this superuser cluster, `has_schema_privilege('xr_wall_reader','public','CREATE')` is t only through its existing membership of the database owner `xr_studio` (PF-12, F4 comment). The pair leaves no grant behind.
