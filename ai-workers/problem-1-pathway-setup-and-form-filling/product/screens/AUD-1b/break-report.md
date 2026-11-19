# AUD-1b break report (breaker, 18 Nov 2026)

**Target:** PR #2124, branch `claude/runtime-aud1b`, commit `dac6a7a08`. The files under attack are `api/src/platform/audit/{audit-event,context}.ts`, `observability/{log,hook}.ts` and `ports/audit.ts`.
**How:** a scratch test, `break_aud1b.ts` (kept in the session scratchpad, not in the repo). It uses its own DB `xr_studio_aud1b_break_<pid>` (dropped at the end), and Nest on a random port (35051, 36341, 37543; never 4400 or the lane ports). It mounts PF-4's guard and session routes, PF-23's middleware, PF-12's `FirmWallsInterceptor`, FO-2's `SalesController` and `Leads`, and a real `PlatformJobs` (pg-boss). There is also one probe route that records through `auditEvent` in a transaction, across `setTimeout` and `setImmediate`. US$0, no browser, no model.
**Baseline:** `check_aud1b_adapter.ts` 29/29 on this commit.
**Scope:** API only. Keyboard, 1024 px, zoom, uploads, budgets, and reload/back do not apply.

## Findings

**M1 (Major): the actor check matches the exact actor string only, so a request's lines can name any actor type.**
`audit-event.ts:44` refuses only when `ctx.actor === e.actor`. It never compares the entry's actor with the request's actor. The code comment (`:43`, "a line is never written with a type its actor did not act as") and the `AuditRefused` doc (`:31`) promise more than that. So do SA-11-2 and AG-13-40 ("actor … captured automatically"). Reproductions, all with the probe signed in as firm A's `user-R`:
* Body `{actor:"system:anything"}` gives **200**. The line is `firmA|SYSTEM|b5-req|system:anything`: a signed-in staff change recorded as a system act (B5a).
* Body `{actor:"seed:anything"}` gives **200**, written as `SEED` (B5b).
* Body `{actor:"staff:<firm B's user-S id>"}` gives **200**. Firm A's trail now names firm B's staff member as having done it (B5c).
* DW3 bypass (B5d). Inside `requestScope.run({…, audit: () => auditOf({platform:{staffId:R, firmId:A, ourStaff:true}})})`, three entries are all **written**:
  * `staff:<R's id in UPPER CASE>` is written as `FIRM_STAFF`. The trigger regex accepts upper case.
  * `system:support` is written as `SYSTEM`.
  * `staff:<another staff id>` is written as `FIRM_STAFF`.

  DW3 claims "our staff's line is never written as FIRM_STAFF", and these are exactly that.

Why Major and not Blocker: no staff route on main passes a non-request actor today (grep of `system:`/`seed:` callers: all are public doors, webhooks or jobs). `ourStaff` is set by no guard on main yet (PF-4s). The hole opens the day PF-4s or a careless caller lands.

**m1 (Minor): the caller's X-Request-Id becomes the audit correlation id unchecked, including the `job:` prefix and ids already used by another firm.**
`hook.ts:23` accepts any `[A-Za-z0-9_.:-]{1,128}`. AUD-1b now writes it to `audit_event.correlation_id`.
* Firm A's request with `X-Request-Id: job:b2-job-0` stores `…|FIRM_STAFF|job:b2-job-0|…`. That is the same correlation as a real pg-boss job's lines (B4a).
* `context.ts:27` takes the `job:` prefix as proof of a job. A public request with `job:forged` gets context `actorType: "SYSTEM"` (B4d).
* Firm A and firm B both sending `b4-shared` leave two firms' lines with one correlation id (B4b). This is the case DW5's fail line says never happens.
* Odd ids that pass, sent back and stored as-is: `-`, `.`, `:`, `0`, 128 × `x`, `staff:<uuid>`, `--..::__`.

Nothing reads `correlation_id` yet (grep), so it is Minor. It becomes a forensic forgery path once AUD-2/AUD-3 read it.

**m2 (Minor): inside a job, the request scope's firm and id win over the job's own (`context.ts:27,29`: `scope?.firmId() ?? jobFirm`).**
Reproduction (B2c):
1. Call `requestScope.run({correlationId:"b2c-some-request", firmId:()=>FIRM_A}, () => jobs.runner.handle("aud1b_break.direct", h))`.
2. Enqueue a firm-B job.
3. In the handler, `auditContext()` returns `{firmId: FIRM_A, correlationId: "b2c-some-request", actorType: "SYSTEM"}`. A firm-B job would then be refused on its own firm and allowed on firm A's.

It is reachable only around `PlatformJobs.handle`, which PF-23w DW2 already sweeps for, so it is latent. When `currentJobFirm() !== undefined`, the job's firm should win.

**m3 (Minor): the firm is re-read from `req.platform` at write time (`hook.ts:57`, `firmOf` at `:37`), so code that rewrites it mid-request moves the wall.**
B3c: token A, the handler sets `r.platform.firmId = FIRM_B`, and the entry names firm B. Result: **200**, line `firmB|FIRM_STAFF|…|staff:<R>`. No code on main writes `req.platform` outside `guard.ts:120`. The PF-4s support switch is the likely first writer. Taking a snapshot of the firm once the guard has run would close it.

**m4 (Minor): a refused cross-firm line raises its alert under the target firm, and that alert silences the target firm's real failure.**
`audit-event.ts:50` passes `firmId: idOf(raw.firmId)`, which is the entry's firm, not the acting one. B8 used the real `LogAlerts` on a fixed clock:
1. Firm A's request writes a line for firm B. The line is refused and an alert is **raised for firm B**.
2. Firm B's own job then has a genuine failed write (bad `caseId`). Its alert is **not raised** (`raised:false`, the 5-minute per-firm repeat window at `alerts.ts:34`).

On-call sees "firm B", not the firm whose request misbehaved, and misses firm B's real gap.

## What held
* **DW5 at 500:** 500 concurrent probe requests, firms A/B, waits of 0-28 ms, `setTimeout` and `setImmediate` inside and outside the transaction, 1 in 5 with no X-Request-Id. All 200. 500 lines, each with its own correlation id (the generated ones equal the answer's header), firm and actor. The context read inside the transaction matched too. 2.5 s (B1).
* **pg-boss:** 24 jobs on 4 queues, enqueued from inside staff requests, run while 76 bursts of 40 requests hit both firms. Handlers awaited `setTimeout` and `setImmediate`, before and inside the transaction. Every job line was `jobFirm|SYSTEM|job:<key>`, and the context was the job's before and after the awaits. 0 of 3,040 load lines carried a foreign id (B2).
* A firm-B job's entry naming firm A in upper case was refused with `AuditRefused`. Nothing was written and one alert was raised (B2b).
* **Firm changes mid-request, refused with nothing written and the change rolled back:**
  * token A naming firm B: 500, one alert (B3a);
  * token A with `withFirm(FIRM_B)` naming B (B3b);
  * B in upper case (B3d);
  * 40 interleaved A/B requests all naming B: exactly the 20 firm-B lines landed (B3e).
* **Keep-alive:** 12 sequential requests on one reused socket, alternating firms, every third with no id. No firm or id carried over (B6a). Three pipelined requests in one TCP write (slow A, B with no id, A) each kept their own firm and id (B6b).
* Two `X-Request-Id` headers: one fresh id, the same in the answer and on the line (B4c).
* **FO sales, audit failure forced by trigger on `fo_lead`:**
  * Add a lead: 500. Lead, person, receipt, note, `module_event` and audit counts unchanged. Exactly one `audit_write_failed` with ids only (`rule, firmId, entity, entityKey`) (B7a).
  * The same `requestId` retried after the failure: 201, no stuck receipt (B7b).
  * Close: 500. Lead unchanged, no note, no outbox row, one alert (B7c).
  * Firm B closing firm A's lead: 404 and no line (B7d).
* Upper-case own-firm entry and `caseId` lower-cased (DW6/DW7, rerun in the baseline).

Breaker: 0 Blocker, 1 Major, 4 Minor
