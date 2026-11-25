// AUD-1b (SA-11-2: each line has actor type, tenant id, correlation id; AG-13-40: actor and request facts captured
// automatically; case-side contract §2.5): the one reader of the audit context. It reuses PF-23's request scope
// (observability/log.ts, filled by hook.ts's middleware from the guard's req.platform; a job's run by observeJob) and
// PF-14's job firm (jobs/pgboss-jobs.ts): no second AsyncLocalStorage. Outside any request or job it returns undefined.
import { currentJobFirm } from "../jobs/pgboss-jobs.ts";
import { requestScope, type AuditScope } from "../observability/log.ts";

export type AuditActorType = AuditScope["actorType"];
export type AuditContext = {
  /** The firm the request or job acts for (the guard's firm, a job's firm); undefined before the guard or for a platform-wide job. */
  firmId?: string;
  /** The actor word the request acts as (`staff:<id>`); undefined for a job, a public door or before the guard. */
  actor?: string;
  /** FIRM_STAFF or OUR_STAFF for a signed-in request, SYSTEM for a job; undefined when neither is known. */
  actorType?: AuditActorType;
  /** The request's correlation id (X-Request-Id, or a new one) or the job's (`job:<id>`); undefined in a job run outside observeJob. */
  correlationId?: string;
  /** The support session the request runs under (AUD-3b; undefined until then). */
  supportSessionId?: string;
  /** That session's reason or ticket (AUD-3b part 1: carried on each of its lines as detail.supportReason). */
  supportReason?: string;
};

/** The context of the running request or job, or undefined outside both. Reading the firm or the actor never fails
 *  silently: an error from either is thrown on, so the audit write fails closed. */
export function auditContext(): AuditContext | undefined {
  const scope = requestScope.getStore(), jobFirm = currentJobFirm();
  if (!scope && jobFirm === undefined) return undefined;
  const inJob = jobFirm !== undefined || (scope?.correlationId.startsWith("job:") ?? false);
  const who = scope?.audit?.();
  // Inside a job the job's own firm wins over any request scope it was started from (breaker m2).
  const firmId = jobFirm !== undefined ? jobFirm ?? undefined : scope?.firmId();
  const ctx: AuditContext = {};
  if (firmId) ctx.firmId = firmId.toLowerCase();
  if (who) { ctx.actor = who.actor; ctx.actorType = who.actorType; if (who.supportSessionId) ctx.supportSessionId = who.supportSessionId; if (who.supportReason) ctx.supportReason = who.supportReason; }
  else if (inJob) ctx.actorType = "SYSTEM";
  if (scope) ctx.correlationId = scope.correlationId;
  return ctx;
}

/** An actor word's own type (the audit_event insert trigger's mapping, AUD-1a, for the words AuditPort accepts, and
 *  AUD-1m: a case line's person:<id> and the simulated people, FIRM_STAFF or CLIENT as the trigger maps them). */
export function actorTypeOfWord(actor: string): AuditActorType {
  if (actor.startsWith("person:") || actor === "user-P" || actor === "user-Q") return "CLIENT";
  if (/^user-[ABCORTS]$/.test(actor)) return "FIRM_STAFF";
  if (actor.startsWith("ourstaff:")) return "OUR_STAFF";   // AUD-3a: ExpatReady's own staff (PF-4s)
  return actor.startsWith("staff:") ? "FIRM_STAFF" : actor.startsWith("system:") ? "SYSTEM" : "SEED";
}
