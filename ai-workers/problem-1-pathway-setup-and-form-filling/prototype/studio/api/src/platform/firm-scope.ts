// PF-3 (contracts §0.2): the one firm filter. Every read and write of a platform or front-office table goes through
// firmScope(firmId): the firm is the tenant, so a query without it is a bug, and a row of another firm is "not found"
// (404, never 403: an id leaks nothing). The database-enforced walls (row rules) are Lead 37's; these helpers are what
// the code does until then and after.
import { HttpException, HttpStatus } from "@nestjs/common";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown when a firm id is missing or not a uuid: a programming error, never a person's mistake. */
export class FirmScopeError extends Error {}

/** The where clause of one firm's rows: `{ ...where, firmId }`. A where that names another firm is refused (it would
 *  read across the wall), and a missing or malformed firm id is refused before any query runs. The id is used in lower
 *  case (PostgreSQL prints uuids so). It scopes the top-level rows only: an `include` or a relation filter reaching a
 *  list of another table (e.g. a plan's subscriptions) takes its own firmScope. Rows that name a staff member carry the
 *  pair (firm_id, staff_id), so a firm's row can never point at another firm's person. */
export function firmScope<W extends Record<string, unknown>>(firmId: string, where?: W): W & { firmId: string } {
  if (typeof firmId !== "string" || !UUID.test(firmId)) throw new FirmScopeError(`firmScope: "${String(firmId)}" is not a firm id`);
  const id = firmId.toLowerCase();
  const given = where?.firmId;
  if (given !== undefined && (typeof given !== "string" || given.toLowerCase() !== id)) throw new FirmScopeError("firmScope: the where clause names another firm");
  return { ...(where ?? ({} as W)), firmId: id };
}

/** The firm's own row of platform_firm (its id is the firm id). */
export function ownFirm(firmId: string): { id: string } {
  return { id: firmScope(firmId).firmId };
}

/** The 404 every firm-scoped lookup gives for a row that is not in the firm (or does not exist): the same answer, so
 *  firm B's ids tell firm A nothing. */
export function notInFirm(what = "record"): never {
  throw new HttpException({ type: "https://expatready.local/problems/not-found", title: "Not found", status: 404, detail: `No such ${what}.` }, HttpStatus.NOT_FOUND);
}

/** A row read through firmScope, or the 404. Also refuses a row whose firm_id is not the scope's (a guard for a query
 *  that forgot the scope). */
export function inFirm<T extends { firmId: string | null }>(firmId: string, row: T | null | undefined, what?: string): T {
  if (!row || row.firmId !== firmScope(firmId).firmId) return notInFirm(what);
  return row;
}

// ---------------------------------------------------------------------------------------------------------------------
// PF-12 (contracts §0 rule 2, §7; map row 3; AG-1-1, -3, -45): the database walls. Migration 20261116013000_pf12_firm_walls
// forces row-level security on every platform_*, fo_*, money_* and msg_* table (policy: firm_id = the session's firm). The
// API connects as xr_app, which owns no table; every query it sends runs with the firm of the context it was called from:
//   * a staff request: the firm PF-4's guard read from the session (enterRequest, setRequestFirm; FirmWallsInterceptor
//     runs the handler in it again);
//   * a job: its JobRun.firmId (withFirm);
//   * anything else, a public door, a configuration or case request with no platform firm: no firm, so a walled table
//     reads nothing and takes no write. A door resolves its firm first (asBypass, on the named list), then sets it.
// A query sets app.firm_id (and the role) on its pooled connection before it runs, so no firm can leak from one checkout
// to the next. A transaction keeps the firm and role of the context that opened it (as SET LOCAL would).
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { logPort } from "./observability/log.ts";

/** The role the API connects as (migration pf12_firm_walls). */
export const APP_ROLE = "xr_app";
/** Our own staff's bypass role (BYPASSRLS): only asBypass reaches it, for a use on BYPASS_USES. */
export const BYPASS_ROLE = "xr_staff_bypass";

type Scope = { firmId?: string; bypass?: string; route?: string };
const scope = new AsyncLocalStorage<Scope>();

/** The firm the current code runs as (undefined: none, so a walled table reads nothing). */
export function currentFirm(): string | undefined { return scope.getStore()?.firmId; }
/** The bypass use the current code runs under, if any. */
export function currentBypass(): string | undefined { return scope.getStore()?.bypass; }

// Each helper awaits fn inside its scope: a Prisma query is lazy (it runs on its first then), so one handed back
// unawaited would otherwise run in the caller's scope.
/** Runs fn as one firm's code (a job's firm; a test; the case opening's own platform firm, CS-K1 part 2). */
export function withFirm<T>(firmId: string, fn: () => T | Promise<T>): Promise<T> {
  const firm = firmScope(firmId).firmId;
  return scope.run({ route: scope.getStore()?.route, firmId: firm }, async () => await fn());
}
/** A door (a sign-in, a public page, a link): the firm it resolved through asBypass, for the rest of its request.
 *  Refused inside a job's or a bypass's scope; on a direct call with no scope (a suite, a tool) there is nothing to set
 *  and the caller's own client decides what it reads. */
export function enterFirm(firmId: string) {
  const id = firmScope(firmId).firmId, s = scope.getStore();
  if (!s) return;
  if (s.route === undefined || s.bypass) throw new FirmScopeError("enterFirm: only a request's own scope takes a firm");
  if (s.firmId && s.firmId !== id) notInFirm();   // on firm A's own address, firm B's door is not found (review R2)
  s.firmId = id;
}

/** The named list (brief: "used only by routes on a named list in code"): each use, why it may cross the walls, and the
 *  routes ("METHOD /path" patterns) it may run in. `outside: true` lets it run where there is no request (start-up, a
 *  job). `direct: true` lets a door's use run on a direct call with no scope at all (a suite or a tool calling the
 *  service with its own client; never inside a request or a job). Anything else is refused (BypassRefused) before any
 *  query runs. */
export const BYPASS_USES: Readonly<Record<string, { why: string; routes: readonly RegExp[]; outside?: boolean; direct?: boolean }>> = Object.freeze({
  "platform.identity.authenticate": { why: "PF-4's guard reads the session's staff member and firm before any firm is known, on every route that declares staff access (platform, front office, and the case routes that take a staff session)", routes: [/^[A-Z]+ \/api\//i] },
  "platform.identity.sign-in": { why: "the sign-in doors find the firm by its key, then run as it (PF-4, PF-4b)", routes: [/^POST \/api\/platform\/session\/(local|callback)$/i], direct: true },
  "platform.identity.invitation": { why: "the invitation link: the token is the only key, and one sign-in account is one firm's staff member across all firms (PF-4b, BR-4)", routes: [/^(GET|POST) \/api\/public\/invitations\/[^/]+(\/accept)?$/i], direct: true },
  "fo.sales.web-form": { why: "the public enquiry form finds its firm by the form's token, then runs as it (FO-2)", routes: [/^(GET|POST) \/api\/public\/forms\/[^/]+(\/submissions)?$/i], direct: true },
  "fo.booking.public-page": { why: "the public booking page finds its firm by key, then runs as it (FO-3)", routes: [/^(GET|POST) \/api\/public\/firms\/[^/]+\/book(\/[^/]+\/(slots|bookings))?$/i], direct: true },
  "fo.booking.self-service": { why: "the booker's own link finds its firm by the link's token, then runs as it (FO-3)", routes: [/^(GET|POST) \/api\/public\/bookings\/[^/]+(\/(slots|reschedule|cancel|ics))?$/i], direct: true },
  "platform.web-address.host": { why: "the host routing finds the firm a firm address serves, on every request (PF-25)", routes: [/^[A-Z]+ \//] },
  "platform.web-address.catch-up": { why: "at start, every firm with no web address yet gets one (PF-25)", routes: [], outside: true },
  "platform.demo.inbox": { why: "the demo inbox lists every demo firm's mail by address; demo workspace only (PF-19b)", routes: [/^GET \/api\/demo\/platform-inbox$/i], direct: true },
  "platform.firms.signup": { why: "the sign-up door makes a firm that does not exist yet, checking the email across every firm (PF-5)", routes: [/^POST \/api\/public\/signup(\/verify)?$/i], direct: true },
  "job:platform.signup.purge": { why: "pending sign-ups past their 24 hours are deleted (PF-5; no firm yet)", routes: [], outside: true },
  "platform.entitlements.limit-change": { why: "our team lowers a plan's limit for every firm on the plan, and each firm's Owners are told (PF-15 part 2, SA-3-43); PF-4s's system routes once on main, and the service on a direct call", routes: [/^(POST|PATCH) \/api\/system\/plans\//i], direct: true },
  "job:platform.entitlements.storage_daily": { why: "the daily storage measure lists every firm, then measures each in its own firm scope (PF-15, SA-3-40)", routes: [], outside: true },
  "job:messages.outbox_sweep": { why: "the outbox sweep picks up every firm's stuck rows, each firm its own share (PF-19b)", routes: [], outside: true },
  "job:messages.send": { why: "a platform job (JobPort platform: true, no firm) sends one platform account message, a PLATFORM_ACCOUNT row with no firm; a firm's send job runs as its firm (PF-19p)", routes: [], outside: true },
  "platform.account.mail": { why: "a platform account email (sign-up's verification, before any firm exists) writes its PLATFORM_ACCOUNT outbox row, no firm's row (PF-19p)", routes: [/^POST \/api\/public\/signup(\/verify)?$/i], outside: true, direct: true },
  "job:platform.secret_box.reencrypt": { why: "the secret store re-encrypts every firm's secrets under the new key (PF-24)", routes: [], outside: true },
  "cases.prospect-won.catch-up": { why: "at start and every few seconds, every firm's won prospects with no client yet are listed (each is then made a client as its own firm), and at the first run each firm with an unlinked client gets its one-time link job (FO-8, CS-K1 part 2)", routes: [], outside: true },
  "platform.demo.reset": { why: "the demo reset puts every Sample firm's settings back (P-571 (1)); demo routes, and the reset tools outside a request", routes: [/^POST \/api\/demo\//i], outside: true },
});

/** A job with no firm (a platform-wide sweep): on the named list as "job:<queue>" it runs on the bypass; otherwise with no
 *  firm, so it reads no firm's rows (platform-jobs.ts). */
export function asJob<T>(queue: string, fn: () => Promise<T>): Promise<T> {
  return Object.prototype.hasOwnProperty.call(BYPASS_USES, `job:${queue}`) ? asBypass(`job:${queue}`, fn) : fn();
}

/** What a query with no scope at all runs as. In the API server (FirmWallsInterceptor at start-up: wallUnscopedQueries)
 *  it has no firm, so it reads nothing: every request has its scope (PF-4's guard), every job its firm or its named use,
 *  the start-up its named uses. Any other process (a suite seeding its scratch database, a tool) already holds the
 *  owner's address in DATABASE_URL, so there it runs on the bypass role, said once in its log. */
let unscoped: "walled" | "direct" = "direct";
export function wallUnscopedQueries() { unscoped = "walled"; }
export const unscopedMode = () => unscoped;
let saidDirect = false;

/** A bypass use that is not on BYPASS_USES, or not for this route. A programming error: the request stops (500). */
export class BypassRefused extends Error {}

/** The audit line for a bypass use: one platform_bypass line through the one logger (PF-23: redacted, with the request's
 *  correlation id), naming the use and the method only. Never the path: a link's token or a typed value can be in it. */
let bypassLine: (use: string, route: string | undefined) => void = (use, route) => {
  logPort.info("platform_bypass", { use, method: route ? route.slice(0, route.indexOf(" ")) : "none" });
};
/** A test or the logger replaces where bypass lines go. Returns the one before. */
export function onBypassLine(f: (use: string, route: string | undefined) => void) { const was = bypassLine; bypassLine = f; return was; }

/** Runs fn as our own staff's bypass role: every walled table is readable and writable. Only for a use on BYPASS_USES and
 *  a route on that use's list; every use writes one audit line (platform.bypass). */
export async function asBypass<T>(use: string, fn: () => Promise<T> | T): Promise<T> {
  const entry = Object.prototype.hasOwnProperty.call(BYPASS_USES, use) ? BYPASS_USES[use] : undefined;
  const store = scope.getStore(), route = store?.route;
  if (!entry) throw new BypassRefused(`asBypass: "${use}" is not on the named list (firm-scope.ts BYPASS_USES)`);
  // A direct call (no scope at all) only in a suite or tool process: in the API server every request and job has its scope.
  const allowed = route !== undefined ? entry.routes.some((r) => r.test(route)) : store === undefined ? !!(entry.outside || (entry.direct && unscoped === "direct")) : !!entry.outside;
  if (!allowed) throw new BypassRefused(`asBypass: "${use}" is not allowed ${route === undefined ? "outside a request" : `on ${route}`}`);
  bypassLine(use, route);
  return scope.run({ route, bypass: use }, async () => await fn());
}

// ----------------------------------------------------------------------------------------------- the request's firm
type ScopedReq = { method?: string; path?: string; url?: string; [k: symbol]: unknown };
const REQ_FIRM = Symbol("pf12.firm");
/** "METHOD /path" as the router matches it: HEAD answers as GET, and a trailing slash is the same route (breaker m3). */
const routeOf = (req: ScopedReq) => {
  const m = String(req.method ?? "GET").toUpperCase(), path = String(req.path ?? req.url ?? "").split("?")[0];
  return `${m === "HEAD" ? "GET" : m} ${path.length > 1 ? path.replace(/\/+$/, "") || "/" : path}`;
};
/** PF-4's guard, first thing in every request, before any await: a fresh scope (its route, and no firm unless the host
 *  routing found the firm whose address this is) for the rest of the
 *  request. PF-4's guard is reached synchronously from Nest's router (core.ts's ConfigReadGuard returns a boolean), so
 *  the handler, its pipes and every query it makes continue in this scope; nothing of an earlier request survives. */
export function enterRequest(req: object) {
  const firmId = (req as ScopedReq)[REQ_FIRM];   // a firm's own web address: the firm the host routing found (setRequestFirm)
  scope.enterWith({ route: routeOf(req as ScopedReq), firmId: typeof firmId === "string" ? firmId : undefined });
}
/** PF-4's guard: the request's firm, once the session names it (the scope enterRequest opened, and the request itself
 *  for FirmWallsInterceptor). */
export function setRequestFirm(req: object, firmId: string) {
  const id = firmScope(firmId).firmId;
  (req as ScopedReq)[REQ_FIRM] = id;
  const s = scope.getStore();
  if (s && !s.bypass && s.route === routeOf(req as ScopedReq)) s.firmId = id;
}
/** Runs fn in the request's scope: its route, and its firm when the guard set one (FirmWallsInterceptor; a test). */
export function inRequest<T>(req: object, fn: () => T): T {
  const r = req as ScopedReq, firmId = r[REQ_FIRM];
  return scope.run({ route: routeOf(r), firmId: typeof firmId === "string" ? firmId : undefined }, () => {
    const out = fn();
    return (out && typeof (out as { then?: unknown }).then === "function" ? (async () => await out)() : out) as T;
  });
}
// ---------------------------------------------------------------------------------------------- the walled connection
/** The API's database address: APP_DATABASE_URL when set (production gives the app role its own secret), otherwise
 *  DATABASE_URL with the user changed to xr_app (the local demo, CI and test copies: one cluster, trust sign-in). */
export function appDatabaseUrl(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.APP_DATABASE_URL) return env.APP_DATABASE_URL;
  const u = new URL(databaseUrl);
  u.username = APP_ROLE; u.password = "";
  return u.toString();
}

const SET = Symbol("pf12.set"), swallow = () => undefined;   // swallow: pg rejects the query in flight and drops the client; this only stops a late 'error' killing the API
type Tagged = pg.PoolClient & { [SET]?: string };
/** A pg pool whose every checkout first sets the context's firm and role on the connection (once per change). */
export class WalledPool extends pg.Pool {
  override connect(): Promise<pg.PoolClient>;
  override connect(cb: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void): void;
  override connect(cb?: (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void): Promise<pg.PoolClient> | void {
    const s = scope.getStore(), direct = !s && unscoped === "direct";
    if (direct && !saidDirect) { saidDirect = true; logPort.info("platform_bypass", { use: "direct-process", method: "none" }); }
    const firm = s?.bypass || direct ? "" : (s?.firmId ?? ""), role = s?.bypass || direct ? BYPASS_ROLE : "none", want = `${firm}|${role}`;
    const p = (super.connect() as Promise<pg.PoolClient>).then(async (c: Tagged) => {
      if (!c.listeners("error").includes(swallow)) c.on("error", swallow);   // a dropped socket fails its query, never the process (Devin review)
      if (c[SET] === want) return c;
      try { await c.query("select set_config('app.firm_id', $1, false), set_config('role', $2, false)", [firm, role]); c[SET] = want; return c; }
      catch (e) { c.release(e as Error); throw e; }
    });
    if (!cb) return p;
    p.then((c) => cb(undefined, c, (r?: unknown) => c.release(r as Error)), (e) => cb(e as Error, undefined, () => undefined));
  }
  // pg's Pool.query checks a client out through connect(); the adapter calls query with a config object and values.
  override query(...a: unknown[]): never {
    const cb = typeof a[a.length - 1] === "function" ? a.pop() as (e: Error | null, r?: unknown) => void : undefined;
    const p = this.connect().then(async (c) => { try { const r = await (c.query as (...x: unknown[]) => Promise<unknown>)(...a); c.release(); return r; } catch (e) { c.release(e as Error); throw e; } });   // a failed query drops its client, as pg's own Pool.query does
    if (cb) { p.then((r) => cb(null, r), (e) => cb(e as Error)); return undefined as never; }
    return p as never;
  }
}

/** Prisma merges findUnique calls made in the same tick into one query, sent from the first caller's scope: two firms'
 *  lookups would run as one firm, and the other's row would read "not found" (tests/check_pf12_walls.ts shows it). Outside
 *  a transaction each call is sent on its own, in its own caller's firm; a transaction's batch is one caller's and stays
 *  as it is. Stops the start-up if Prisma's batching is not where this expects it (a Prisma upgrade). */
export function oneQueryPerCaller(client: object): void {
  type Loader = { batchBy?: (r: { transaction?: unknown }) => string | undefined };
  const o = (client as { _requestHandler?: { dataloader?: { options?: Loader } } })._requestHandler?.dataloader?.options;
  if (typeof o?.batchBy !== "function") throw new Error("PF-12: Prisma's request batching was not found, so firms' lookups could be merged (firm-scope.ts oneQueryPerCaller; the Prisma client changed)");
  const by = o.batchBy;
  o.batchBy = (r) => (r.transaction ? by(r) : undefined);
}

/** The API's pool (core.ts Db): xr_app, UTC session time zone. */
export function walledPool(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): WalledPool {
  return new WalledPool({ connectionString: appDatabaseUrl(databaseUrl, env), options: "-c TimeZone=UTC" });
}

// --------------------------------------------------------------------------------------------- the start-up check
/** The start-up check (api/src/features/platform-firm-walls.ts): what the app's role may not be: a table or function owner (or a member of one, the bypass role included), a superuser, a BYPASSRLS role. One line per
 *  problem; none means the role is fit to serve. */
export async function appRoleProblems(query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>): Promise<string[]> {
  const { rows: [r] } = await query(`select current_user as role, r.rolsuper as super, r.rolbypassrls as bypass,
      (select count(*)::int from pg_class c where c.relkind in ('r','p','v','m','f') and c.relnamespace = 'public'::regnamespace and pg_has_role(current_user, c.relowner, 'MEMBER')) as owned,
      (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and pg_has_role(current_user, p.proowner, 'MEMBER')) as fns
    from pg_roles r where r.rolname = current_user`);
  const out: string[] = [];
  if (r.super) out.push(`${String(r.role)} is a superuser`);
  if (r.bypass) out.push(`${String(r.role)} has BYPASSRLS`);
  if (Number(r.owned) > 0) out.push(`${String(r.role)} owns (or may act as the owner of) ${String(r.owned)} table(s)`);
  // A role it may become (the bypass role) owning a function could rewrite it (breaker m6): the wall functions are xr_wall_reader's.
  if (Number(r.fns) > 0) out.push(`${String(r.role)} owns (or may act as the owner of) ${String(r.fns)} function(s)`);
  return out;
}
