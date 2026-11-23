// PF-23: the one-line hook main.ts calls right after it creates the app (release holder's OK, rows rev 15). It
//  1. makes the JSON logger (log.ts) Nest's logger, so Nest's own messages are JSON and redacted;
//  2. adds the request middleware first, before every route: the correlation id is the caller's X-Request-Id when it is
//     an id (letters, digits, . _ : -, up to 128, and nothing the redaction would change), else a new one; it is sent
//     back as X-Request-Id and stamped on every line written while the request runs; when the response is finished,
//     one request line (metrics.ts) names the method, the route pattern (never the path or query a person typed),
//     the status, the duration and the firm when the request's StaffContext (PF-4's req.platform) names one;
//  3. sends the app's console calls (console.log/info/warn/error/debug) through the same logger, so a console.error(e)
//     in an error filter writes the error's class and frames, never its message.
// Returns restore(), which puts the console and the previous logger back (tests).
import { randomUUID } from "node:crypto";
import { format } from "node:util";
import type { INestApplication } from "@nestjs/common";
import { JsonLog, requestScope, stdSink, useLog, type AuditScope, type Level, type Sink } from "./log.ts";
import { requestLine } from "./metrics.ts";
import { logText, redact, redactText, safeError } from "./redact.ts";

type Req = { method: string; path?: string; baseUrl?: string; headers: Record<string, string | string[] | undefined>; route?: { path?: unknown }; platform?: { firmId?: unknown; staffId?: unknown; supportSessionId?: unknown }; systemStaff?: { staffId?: unknown } };
type Res = { statusCode: number; writableFinished?: boolean; setHeader(name: string, value: string): unknown; on(event: "finish" | "close", fn: () => void): unknown };

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
/** The caller's request id when it is a plain id that redaction leaves as it is; otherwise a new one. A caller never
 *  takes a job's form (`job:…`, observability/jobs.ts), so a request's lines never pass for a job's (AUD-1b, breaker m1). */
export function correlationOf(header: string | string[] | undefined): string {
  const h = Array.isArray(header) ? header[0] : header;
  return typeof h === "string" && ID.test(h) && !/^job:/i.test(h) && redactText(h) === h ? h : randomUUID();
}

/** The route pattern a request matched ("/api/combinations/:id"), "unmatched" for an /api path no route took, "web"
 *  for the web app's pages and files. Never the path itself: it can hold a person's data. */
export function routeOf(req: Req): string {
  const p = req.route?.path;
  if (typeof p === "string") return redactText(`${req.baseUrl ?? ""}${p}`);
  if (p instanceof RegExp) return "web";
  return (req.path ?? "").startsWith("/api") ? "unmatched" : "web";
}

const firmOf = (req: Req): string | undefined => { const f = req.platform?.firmId; return typeof f === "string" && ID.test(f) ? f : undefined; };

const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** AUD-1b: who the request acts as, from the guard's StaffContext (PF-4's req.platform): a staff member of a firm is
 *  FIRM_STAFF, `staff:<id>`. AUD-3a: one of ExpatReady's own staff (PF-4s's guard puts them on req.systemStaff; they have
 *  no firm and never a req.platform) is OUR_STAFF, `ourstaff:<id>`. No staff, no actor. */
export function auditOf(req: Pick<Req, "platform" | "systemStaff">): AuditScope | undefined {
  const ours = req.systemStaff?.staffId;
  if (ours !== undefined) {
    // Fail closed (review n1): a staff id of another shape never leaves the request with no actor, which would let any word pass.
    if (typeof ours !== "string" || !ACTOR_ID.test(ours)) throw new Error("AUD-3a: our staff's id is not an actor id, so no audit line can be written in this request");
    return { actor: `ourstaff:${ours}`, actorType: "OUR_STAFF" };
  }
  const p = req.platform, s = p?.staffId;
  if (typeof s !== "string" || !ACTOR_ID.test(s)) return undefined;
  const support = typeof p?.supportSessionId === "string" && UUID.test(p.supportSessionId) ? { supportSessionId: p.supportSessionId.toLowerCase() } : {};
  return { actor: `staff:${s}`, actorType: "FIRM_STAFF", ...support };
}

export function requestMiddleware() {
  return (req: Req, res: Res, next: () => void) => {
    const t0 = performance.now(), correlationId = correlationOf(req.headers["x-request-id"]);
    res.setHeader("X-Request-Id", correlationId);
    let done = false;
    // A connection closed before the answer was sent is "aborted", status 499 (review m8), never counted as a success.
    const end = () => { if (done) return; done = true; const aborted = res.writableFinished === false; requestLine({ method: req.method, route: routeOf(req), status: aborted ? 499 : res.statusCode, durationMs: performance.now() - t0, correlationId, firmId: firmOf(req), aborted }); };
    res.on("finish", end); res.on("close", end);
    requestScope.run({ correlationId, firmId: () => firmOf(req), audit: () => auditOf(req) }, next);
  };
}

const CONSOLE = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleMethod = (typeof CONSOLE)[number];

/** console.* through the logger: text redacted by pattern, objects by field name, errors reduced to class and frames. */
export function patchConsole(l: JsonLog): () => void {
  const was = Object.fromEntries(CONSOLE.map((m) => [m, console[m]])) as Record<ConsoleMethod, (...a: unknown[]) => void>;
  const level: Record<ConsoleMethod, Level> = { log: "info", info: "info", warn: "warn", error: "error", debug: "debug" };
  for (const m of CONSOLE) {
    console[m] = (...args: unknown[]) => {
      try {
        const isError = (a: unknown) => { try { return a instanceof Error; } catch { return false; } };
        const errors = args.filter(isError).map(safeError);
        const rest = args.filter((a) => !isError(a));
        // Each text argument on its own: a stack written as text keeps its frames only (redact.ts logText).
        const text = rest.filter((a) => typeof a !== "object" || a === null).map((a) => logText(format("%s", a))).join(" ");
        const objects = rest.filter((a) => typeof a === "object" && a !== null).map((a) => redact(a));
        l.write(level[m], "console", { message: text || undefined, ...(objects.length ? { data: objects } : {}), ...(errors.length ? { errors } : {}) });
      } catch { l.write(level[m], "console", { message: "[not logged: unreadable value]" }); } // never throws into the caller (review m1)
    };
  }
  return () => { for (const m of CONSOLE) console[m] = was[m]; };
}

export function observe(app: INestApplication, opts: { sink?: Sink; console?: boolean } = {}): { log: JsonLog; restore: () => void } {
  const l = new JsonLog(opts.sink ?? stdSink);
  const before = useLog(l);
  app.useLogger(l);
  app.use(requestMiddleware());
  const unpatch = opts.console === false ? () => {} : patchConsole(l);
  return { log: l, restore: () => { unpatch(); useLog(before); } };
}
