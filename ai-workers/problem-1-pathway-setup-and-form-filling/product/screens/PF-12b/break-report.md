# PF-12b part 1 — break report (PR #2029, `claude/runtime-pf12b-bypass-audit` @ ccbc1825b)

Row: every bypass use that crosses firms writes one `platform.bypass` audit_event line per firm it touches, in that firm's
transaction, or is refused. Method: own scratch database `xr_break_pf12b_<pid>` on 127.0.0.1:54329, every migration in
order, `seedSampleFirms`, the app's client through `WalledPool` as xr_app (as `tests/check_pf12b_bypass_audit.ts`). The
PR's own check: 22 passed, 0 failed. Attack script (scratch, not committed) ran each attempt below; outputs are quoted.
Firms: FIRST = `sample-firm`, SECOND = `sample-solo` (readSampleFirms order).

## Findings

**M1 (Major): crossing firms without a line is not refused; it depends on each call site remembering touchFirm.**
`asBypass` (firm-scope.ts:150-159) checks the use and route only; nothing checks that a "per-firm" use touched the firms it
read. Repro: `inRequest({method:"POST",path:"/api/demo/x"}, () => asBypass("platform.demo.reset", () => db.platformStaff.findMany()))`
returned staff of 2 firms, 0 lines. The same through `platform.identity.authenticate` on any `/api/` route (firm-scope.ts:104),
also nested inside `platform.demo.inbox` on its own route: 2 firms, 0 lines. The PR's own DW1 first check
(tests/check_pf12b_bypass_audit.ts:85) proves the same and calls it the "before" state. The doors are part 2's, but
`platform.demo.reset` is a per-firm use and allowed on every `POST /api/demo/*` route (`/api/demo/anything-at-all`: allowed).
Expected per the row: a line or a refusal. Actual: neither.

**M2 (Major): an attacker-chosen X-Request-Id is written into a firm's permanent trail, from an unauthenticated door.**
`correlationOf` (observability/hook.ts:23-25) accepts any `[A-Za-z0-9_.:-]{1,128}` that `redactText` leaves alone; names and
dates pass. touchFirm copies it into `detail.correlationId` (firm-scope.ts:188-191); AuditDetail's floor only stops emails
(ports/audit.ts, "ids only, never personal data"). Repro 1: demo inbox with id `Client.A.DOB.1990-01-01.client-of-firm`:
stored verbatim. Repro 2: `POST /api/public/signup` with an existing staff email of FIRST and X-Request-Id
`Client.A.passport.lost` → the background step (it inherits the request scope) wrote FIRST's line with `"correlationId":
"Client.A.passport.lost"`. Anyone who knows one staff email can put free text in that firm's audit trail (3 per email per hour).
Holds: an email-shaped id is refused (randomUUID instead).

**m1 (Minor): the demo reset, SECOND's line failing: FIRST stays reset, SECOND is not, and the demo is half-reset.**
Port that throws only for SECOND's `platform.bypass`: `resetSampleFirmSettings` threw BypassNotRecorded; FIRST
`platform.language` "fr"→"en" committed with 1 `platform.bypass` and 1 `platform.setting.change` line; SECOND still "fr"
(rolled back). So nothing happened without its line (the brief's "at least" holds), but FIRST does not roll back
(demo-reset.ts:22-40, one transaction per firm). In `Demo.wipe` the workspace delete has already committed (demo.ts:545-572)
before the reset step (demo.ts:575): the request answers 500 after the workspace is gone, with no "reset" audit line and
no reset-log.jsonl entry. A retry finishes it.

**m2 (Minor): the catch-up reads other firms' rows that get no line.** `assignIn` (web-address/firm-created.ts:47-51) reads
`platform_firm_web_address` rows of other firms (`address in tries`) and other firms' address history (`firm_id <> id`);
the opening query (:83-88) reads every firm's status, key and module_event. Only the firm given an address is touched (the
wrapper runs inside `audit.record`, routes.ts:39). A firm whose suggestions are all taken returns null and is listed as
failed: its own row was read and no line was written. Also, routes.ts:37-38 says the line "goes first in that transaction";
it is written after the address insert (same transaction, so harmless).

**m3 (Minor, latent): touchFirm with a client that is not a transaction de-duplicates forever.** The dedupe WeakMap is
keyed on whatever `tx` is (firm-scope.ts:176-194). `asBypass("platform.demo.reset", () => touchFirm(db, SECOND))` wrote 1
line; two more separate uses with `db` wrote 0 (the set on `db` lives for the process). The line is also autocommitted:
`db.$transaction(async () => { await touchFirm(db, FIRST); throw … })` kept 1 line for work that rolled back. No caller
passes `db` today; `tx: unknown` lets one. `touchFirm(undefined, …)` holds (BypassNotRecorded).

**m4 (Minor): concurrent touches of one firm in one transaction write duplicates.** `Promise.all` of three
`touchFirm(tx, FIRST)` in one transaction: 3 lines. The set is read before the await and filled after it (firm-scope.ts:185-193).

**m5 (Minor): the sweep writes a line per firm every minute, even when it queues nothing.** One stuck row of FIRST, five
sweeps a minute apart in one hour: queued `[1,0,0,0,0]`, lines 5 (messages.sweep, messages.ts:144; the job key is per
hour, the line per run). A firm held at its daily cap (or with a stuck row) gets about 60 `platform.bypass` lines an hour,
1,440 a day.

**m6 (Minor): touchFirms is one shared transaction, apart from the work.** For the sweep, inbox and sign-up lookup, every
firm's line goes in one transaction of its own (firm-scope.ts:197-201), not "in that firm's transaction": SECOND's failing
line stops FIRST's sweep too, and a line commits before the work (the work then failing leaves a line without work; the
safe way round). The inbox reads `msg_outbox` of every firm before touching (demo-inbox.ts:30-34, the comment says "before any
is read"); it answers 500 on failure, so nothing is shown.

## What held

- Wrong route or scope is BypassRefused: the demo reset on `GET /api/demo/platform-inbox`; `platform.demo.inbox` on
  `POST /api/public/signup`; the catch-up inside any request; `platform.demo.inbox` in a firm's job (`withFirm`);
  `"job:messages.outbox_sweep "` (trailing space); `"__proto__"`. All 6 refused before any query.
- Mixed case: `touchFirm(tx, FIRST.toUpperCase())` then `touchFirm(tx, FIRST)` → 1 line; entity_key and detail.firmId
  lower case.
- Dedupe after a rollback: a transaction that touched FIRST and threw, then a new one: the new `tx` is a different object
  and its line was written (1 line kept, the rolled-back one gone).
- Sign-up background step with the trail down: 0 mails sent; logged `[sign-up] background step failed:
  BypassNotRecorded` with no personal data. With the trail up: the line, then the mail.
- Verify: the new firm's line is in the transaction that creates it, and a failing line makes no firm (PR's DW4, re-run).
- `platform.bypass` lines carry the platform-audit workspace (audit-event.ts:29), so `Demo.wipe`'s
  `auditEvent.deleteMany({ workspaceId })` never deletes them.
- A failed line answers 500 in plain words (`BypassNotRecorded`), never the cause.

## Repro

`/opt/node24/bin` on PATH; from `prototype/studio`: `npx tsx --tsconfig api/tsconfig.json <script>.mts` (an `.mts` file so
top-level await works outside `tests/`). Set up as check_pf12b_bypass_audit.ts lines 61-77, then the calls quoted above.
Swap the trail with `onBypassAudit({ record: async (tx, e) => { if (e.firmId === SECOND) throw new Error("down"); return
auditEvent.record(tx, e); } })`. Scratch database dropped at the end.
