// PF-17 part 2 (R1.93; SA-10 v2.8 §3.2, §10 SA10-D8; AG-16-63; Lead 1's ruling on #3155, 23 Nov): our team's support queue,
// GET /api/system/support/tickets, GET /api/system/support/tickets/:id and POST /api/system/support/tickets/:id/replies,
// behind PF-4s's @SystemKeys("system/support:list") and ("system/support:manage"). Each "Done when" line passes and fails:
// DW1 who may read and reply (the migration's Sample roles: list Owner, Admin, Support, Auditor; manage Owner, Support;
// Billing, Content publisher, a firm's token and no token refused); DW2 the queue lists every firm's tickets, each with its
// own firm, subject, raiser and message count, as stored (j_93 W4's API line); DW3 the order (waiting on us first, the
// longest waiting first, then waiting on the firm, then closed) and ?status= / ?firm= / ?page=, a wrong query 422; DW4 one
// ticket with its messages in order and their authors' names, an unknown or malformed id 404; DW5 a reply writes one
// SUPPORT message, moves the ticket to "Waiting on firm", writes one line on the firm's trail and nothing else, and is
// refused whole (nothing written) for a blank body, an extra field, a closed ticket or a missing key; DW6 one PF-4s line
// per call (a refusal too), the queue's one firm-less bypass line, one ticket's line on its own firm's trail only; DW7 the
// two bypass uses are declared beside the module for these routes only and refused anywhere else; DW8 the migration seeds
// exactly these rows. One process, a scratch database (dropped at the end), a small Nest app. No model call (US$0).
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf17_support.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf17s_${process.pid}`;
const urlOf = (db: string, user = "xr_studio") => `postgresql://${user}@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };
const throwsLike = async (f: () => unknown, test: (e: unknown) => boolean) => { try { await f(); return false; } catch (e) { return test(e); } };
type Res = { status: number; body: any };
const call = async (base: string, path: string, token?: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<Res> => {
  const r = await fetch(`${base}${path}`, { method, headers: { "user-agent": "pf17s-check/1", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

const MIGRATION = "20261124030000_pf17_support_keys";
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const migrations = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
// Rev 16.7: the seed is measured right before and right after its own migration, never assuming it is the newest.
const keyRows = () => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-q", "-Atc", "select count(*) from plat_system_role_permission"], { encoding: "utf8" }).trim();
let beforeOurs = "", afterOurs = "";
for (const d of migrations) {
  if (d === MIGRATION) beforeOurs = keyRows();
  execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  if (d === MIGRATION) afterOurs = keyRows();
}
process.env.DATABASE_URL = urlOf(DB);
for (const k of Object.keys(process.env)) if (/^PLATFORM_/.test(k)) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { BYPASS_USES, BypassRefused, asBypass, bypassUses, inRequest, wallUnscopedQueries } = await import("../api/src/platform/firm-scope.ts");
const { SUPPORT_QUEUE, SUPPORT_TICKET } = await import("../api/src/platform/system-console/support.bypass.ts");
const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { requestMiddleware } = await import("../api/src/platform/observability/hook.ts");
const { SystemLocalIdentity } = await import("../api/src/platform/system-identity/local.ts");
const { SYSTEM_IDENTITY_PORT, SystemIdentity } = await import("../api/src/platform/system-identity/service.ts");
const { SystemGuard, SystemPlaneWall } = await import("../api/src/platform/system-identity/guard.ts");
const { SystemIdentityController } = await import("../api/src/platform/system-identity/routes.ts");
const { SystemSupport, QUEUE_PAGE_SIZE, SUPPORT_NAME } = await import("../api/src/platform/system-console/support.ts");
const { SystemSupportController } = await import("../api/src/platform/system-console/support-routes.ts");
const { SupportService, subjectOf } = await import("../api/src/platform/support/support.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const feature = (await import("../api/src/features/platform-system-support.ts")).default;

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const apps: { close(): Promise<void> }[] = [];
const unused = new Proxy({}, { get: () => { throw new Error("not used by the reply"); } }) as never;
try {
  // ------------------------------------------------------------------------------------- DW8: the migration's rows
  const seeded = sql(`select permission_key || '=' || string_agg(role_code, ',' order by role_code) from plat_system_role_permission where permission_key like 'system/support:%' group by permission_key order by 1`).split("\n");
  ok("PF-17 DW8 pass (Lead 1's ruling, Sample): the migration seeds system/support:list for Owner, Admin, Support, Auditor and system/support:manage for Owner, Support, and nothing else",
    seeded.join(" ") === "system/support:list=platform-admin,platform-auditor,platform-owner,platform-support system/support:manage=platform-owner,platform-support"
    && Number(afterOurs) === Number(beforeOurs) + 6, { seeded, beforeOurs, afterOurs });
  const text = readFileSync(join(MIG, MIGRATION, "migration.sql"), "utf8");
  ok("PF-17 DW8 fail: the BACKLOG row's system/support:reply is not seeded, Billing and Content publisher hold no support key, and the migration says the mapping is Unconfirmed (SA10-X3 pending)",
    sql(`select count(*) from plat_system_role_permission where permission_key = 'system/support:reply' or (permission_key like 'system/support:%' and role_code in ('platform-billing-ops', 'platform-content-publisher'))`) === "0" && /Unconfirmed: SA10-X3 pending/.test(text) && !/CREATE|ALTER TABLE "plat_system_role_permission" ADD/i.test(text.replace(/--[^\n]*/g, "")));

  await seedSampleFirms(owner);
  const firmA = sql(`select id from platform_firm where key = 'sample-firm'`), firmS = sql(`select id from platform_firm where key = 'sample-solo'`);
  const nameOf = (f: string) => sql(`select operating_name from platform_firm where id = '${f}'`);
  const staffOf = (f: string) => sql(`select id || '|' || display_name from platform_staff where firm_id = '${f}' order by display_name limit 1`).split("|") as [string, string];
  const [staffA, staffAName] = staffOf(firmA), [staffS] = staffOf(firmS);
  const run = Date.now().toString(36);
  // Four tickets, oldest first (each raised as PF-18b raises one: the ticket and its first message), a second message on t3.
  const raise = async (firmId: string, raisedBy: string, body: string, page: string) => {
    const t = await owner.platformSupportTicket.create({ data: { firmId, raisedBy, page } });
    await owner.platformSupportMessage.create({ data: { firmId, ticketId: t.id, authorKind: "FIRM_STAFF", authorId: raisedBy, body } });
    await new Promise((r) => setTimeout(r, 15));
    return t.id;
  };
  const t1 = await raise(firmA, staffA, `Sample ${run} one: the licences page\nsecond line`, "/platform/licences");
  const t2 = await raise(firmS, staffS, `Sample ${run} two: a booking question`, "/front-office/bookings");
  const t3 = await raise(firmA, staffA, `Sample ${run} three: an invoice`, "/front-office/invoices");
  await owner.platformSupportMessage.create({ data: { firmId: firmA, ticketId: t3, authorKind: "FIRM_STAFF", authorId: staffA, body: "Sample: any news?" } });
  const t4 = await raise(firmS, staffS, `Sample ${run} four: done already`, "/platform/me");
  sql(`update platform_support_ticket set status = 'CLOSED' where id = '${t4}'`);

  const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
  const firmLocal = new LocalIdentity("pf17s-firm-standin-key-0123456789abcde", () => clock.now());
  const systemLocal = new SystemLocalIdentity("pf17s-system-standin-key-0123456789ab", () => clock.now());
  @Module({ controllers: [PlatformIdentityController, SystemIdentityController, SystemSupportController] as never[],
    providers: [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: firmLocal }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
      { provide: SYSTEM_IDENTITY_PORT, useValue: systemLocal }, SystemIdentity, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard },
      { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor },
      { provide: SupportService, useFactory: (db: InstanceType<typeof Db>) => new SupportService({ db, files: unused, audit: auditEvent, mail: unused }), inject: [Db] },
      ...feature.providers] as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use(requestMiddleware());
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  ok("PF-17 pass: the feature registers the support queue controller and its service (bound to PF-18b's SupportService)",
    feature.controllers.includes(SystemSupportController) && (feature.providers as { provide?: unknown; inject?: unknown[] }[]).some((p) => p.provide === SystemSupport && p.inject?.includes(SupportService)));

  const person = async (name: string, roles: string[]) => (await owner.platSystemStaff.create({ data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}.pf17s@expatready.example`, displayName: `Sample ${name}`, grants: { create: roles.map((roleCode) => ({ roleCode })) } } })).id;
  const tokenOf = async (id: string) => { const email = (await owner.platSystemStaff.findUniqueOrThrow({ where: { id } })).email; const r = await (await fetch(`${base}/api/system/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, secondStep: true }) })).json(); return r.token as string; };
  const roles = { owner: "platform-owner", admin: "platform-admin", support: "platform-support", billing: "platform-billing-ops", auditor: "platform-auditor", publisher: "platform-content-publisher" } as const;
  const tokens: Record<keyof typeof roles, string> = {} as never, ids: Record<keyof typeof roles, string> = {} as never;
  for (const [k, r] of Object.entries(roles)) { ids[k as keyof typeof roles] = await person(`${k} PF17S`, [r]); tokens[k as keyof typeof roles] = await tokenOf(ids[k as keyof typeof roles]); }
  const ticketBypass = (f: string) => Number(sql(`select count(*) from audit_event where firm_id = '${f}' and action = 'platform.bypass' and detail->>'use' = '${SUPPORT_TICKET.name}'`));
  const firmToken = (await (await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true }) })).json()).token as string;
  const sysLines = () => Number(sql(`select count(*) from plat_system_audit`));
  const Q = "/api/system/support/tickets";
  const msgs = (t: string) => Number(sql(`select count(*) from platform_support_message where ticket_id = '${t}'`));
  const statusOf = (t: string) => sql(`select status from platform_support_ticket where id = '${t}'`);
  const replied = (f: string) => Number(sql(`select count(*) from audit_event where firm_id = '${f}' and action = 'support.ticket.replied'`));

  // ---------------------------------------------------------------------------------------- DW1: who may read and reply
  const readers = await Promise.all((["owner", "admin", "support", "auditor"] as const).map((k) => call(base, Q, tokens[k])));
  ok("PF-17 DW1 pass: Platform Owner, Admin, Support and Auditor (system/support:list) → 200 with the queue",
    readers.every((r) => r.status === 200 && Array.isArray(r.body.tickets) && r.body.total === 4), readers.map((r) => [r.status, r.body.total]));
  const bil = await call(base, Q, tokens.billing), pub = await call(base, Q, tokens.publisher), firm = await call(base, Q, firmToken), none = await call(base, Q);
  const bilOne = await call(base, `${Q}/${t1}`, tokens.billing), firmOne = await call(base, `${Q}/${t1}`, firmToken);
  ok("PF-17 DW1 fail: Billing and a Content publisher (no system/support:list) → 403 MISSING_PERMISSION, a firm's token → 403, no token → 401; the same on one ticket",
    bil.status === 403 && bil.body.code === "MISSING_PERMISSION" && pub.status === 403 && firm.status === 403 && none.status === 401 && bilOne.status === 403 && firmOne.status === 403,
    { bil: bil.status, pub: pub.status, firm: firm.body, none: none.status, bilOne: bilOne.status, firmOne: firmOne.status });
  const upper = await call(base, "/API/System/Support/Tickets", firmToken);
  ok("PF-17 DW1 fail: a firm token on a mixed-case path is refused too (403)", upper.status === 403, upper);
  const m0 = msgs(t2);
  const adminReply = await call(base, `${Q}/${t2}/replies`, tokens.admin, { body: "Sample: from an Admin" });
  const audReply = await call(base, `${Q}/${t2}/replies`, tokens.auditor, { body: "Sample: from an Auditor" });
  const firmReply = await call(base, `${Q}/${t2}/replies`, firmToken, { body: "Sample: from a firm" });
  ok("PF-17 DW1 fail: Admin and Auditor (list only, no system/support:manage) and a firm token cannot reply (403); nothing is written",
    adminReply.status === 403 && adminReply.body.code === "MISSING_PERMISSION" && audReply.status === 403 && firmReply.status === 403 && msgs(t2) === m0 && statusOf(t2) === "OPEN",
    { admin: adminReply.status, aud: audReply.status, firm: firmReply.status, m: [m0, msgs(t2)] });

  // ---------------------------------------------------------------------------------------- DW2: every firm's tickets, with the firm
  const all = (await call(base, Q, tokens.support)).body;
  const byId = new Map<string, any>(all.tickets.map((t: any) => [t.id, t]));
  const fits = (id: string, f: string, key: string, body: string, page: string, n: number) => {
    const t = byId.get(id);
    return !!t && t.firm.id === f && t.firm.key === key && t.firm.name === nameOf(f) && t.subject === subjectOf(body) && t.page === page && t.messages === n && t.raisedByName === sql(`select display_name from platform_staff where id = (select raised_by from platform_support_ticket where id = '${id}')`);
  };
  ok("PF-17 DW2 pass (j_93 W4's API line): the queue lists both firms' tickets, each with its own firm (id, key, name), subject (the first line), page, raiser and message count, as stored",
    all.tickets.length === 4 && fits(t1, firmA, "sample-firm", `Sample ${run} one: the licences page`, "/platform/licences", 1) && fits(t2, firmS, "sample-solo", `Sample ${run} two: a booking question`, "/front-office/bookings", 1)
    && fits(t3, firmA, "sample-firm", `Sample ${run} three: an invoice`, "/front-office/invoices", 2) && byId.get(t1).subject === `Sample ${run} one: the licences page`, all.tickets);
  ok("PF-17 DW2 fail: no ticket carries another firm's name or key (firm A's tickets never show firm B, and the other way round)",
    all.tickets.every((t: any) => sql(`select firm_id from platform_support_ticket where id = '${t.id}'`) === t.firm.id) && byId.get(t2).firm.id !== firmA && byId.get(t1).firm.id !== firmS);

  // ---------------------------------------------------------------------------------------- DW5: our reply
  const s0 = sysLines(), mA = msgs(t1), rA = replied(firmA), rS = replied(firmS), bA = ticketBypass(firmA), bS = ticketBypass(firmS);
  const reply = await call(base, `${Q}/${t1}/replies`, tokens.support, { body: "Sample: we have looked at it.\nIt is fixed." });
  const last = JSON.parse(sql(`select row_to_json(a) from (select method, route, outcome from plat_system_audit order by at desc, id desc limit 1) a`));
  const stored = JSON.parse(sql(`select row_to_json(m) from (select author_kind, author_id, body from platform_support_message where ticket_id = '${t1}' order by created_at desc, id desc limit 1) m`));
  ok("PF-17 DW5 pass: Support's reply → 201 with the ticket: one SUPPORT message (author 'support', the body as sent), status WAITING_ON_FIRM, named ExpatReady support",
    reply.status === 201 && reply.body.status === "WAITING_ON_FIRM" && statusOf(t1) === "WAITING_ON_FIRM" && msgs(t1) === mA + 1 && stored.author_kind === "SUPPORT" && stored.author_id === "support" && stored.body === "Sample: we have looked at it.\nIt is fixed."
    && reply.body.messages.at(-1).authorName === SUPPORT_NAME && reply.body.firm.id === firmA, { reply, stored });
  ok("PF-17 DW5 pass: the reply writes one support.ticket.replied line on firm A's trail, none on firm B's, and one PF-4s line (ALLOWED, the route) for the call",
    replied(firmA) === rA + 1 && replied(firmS) === rS && sysLines() === s0 + 1 && last.method === "POST" && last.route === "/api/system/support/tickets/:id/replies" && last.outcome === "ALLOWED", { rA, now: replied(firmA), s0, s1: sysLines(), last });
  const line = JSON.parse(sql(`select row_to_json(a) from (select actor, actor_type from audit_event where firm_id = '${firmA}' and action = 'support.ticket.replied' order by at desc, id desc limit 1) a`));
  ok("PF-17 DW5 pass (AUD-3a): the reply's line on firm A's trail names the Support person, ourstaff:<id> (OUR_STAFF), never system:support",
    line.actor === `ourstaff:${ids.support}` && line.actor_type === "OUR_STAFF", line);
  ok("PF-17 DW5 pass (review m1): the reply writes firm A's own platform.bypass line (the ticket use) and none on firm B's", ticketBypass(firmA) === bA + 1 && ticketBypass(firmS) === bS, { bA, now: ticketBypass(firmA), bS });
  const ownerReply = await call(base, `${Q}/${t3}/replies`, tokens.owner, { body: "Sample: the Platform Owner answers" });
  ok("PF-17 DW5 pass: the Platform Owner (system/support:manage) replies too", ownerReply.status === 201 && statusOf(t3) === "WAITING_ON_FIRM", ownerReply.status);
  const m2 = msgs(t2), r2 = replied(firmS);
  const blank = await call(base, `${Q}/${t2}/replies`, tokens.support, { body: " ​\n " });
  const extra = await call(base, `${Q}/${t2}/replies`, tokens.support, { body: "Sample", priority: "HIGH" });
  const notText = await call(base, `${Q}/${t2}/replies`, tokens.support, { body: 42 });
  const arr = await call(base, `${Q}/${t2}/replies`, tokens.support, ["Sample"]);
  const tooLong = await call(base, `${Q}/${t2}/replies`, tokens.support, { body: "x".repeat(5001) });
  ok("PF-17 DW5 fail: a blank body, an extra field (priority), a body that is not text, a list and a body over 5,000 characters → 422 naming the field; nothing written",
    [blank, extra, notText, arr, tooLong].every((r) => r.status === 422) && extra.body.fields?.priority && blank.body.fields?.body && msgs(t2) === m2 && replied(firmS) === r2 && statusOf(t2) === "OPEN",
    [blank, extra, notText, arr, tooLong].map((r) => [r.status, r.body.fields]));
  const m4 = msgs(t4);
  const closed = await call(base, `${Q}/${t4}/replies`, tokens.support, { body: "Sample: too late" });
  const ghost = await call(base, `${Q}/00000000-0000-4000-8000-00000000abcd/replies`, tokens.support, { body: "Sample" });
  const badId = await call(base, `${Q}/not-a-ticket/replies`, tokens.support, { body: "Sample" });
  ok("PF-17 DW5 fail: a closed ticket → 409 (nothing written); an unknown or malformed ticket → 404, never 500",
    closed.status === 409 && msgs(t4) === m4 && statusOf(t4) === "CLOSED" && ghost.status === 404 && badId.status === 404, [closed.status, ghost.status, badId.status]);

  // ---------------------------------------------------------------------------------------- DW3: order and filters
  const order = (await call(base, Q, tokens.support)).body.tickets.map((t: any) => t.id);
  ok("PF-17 DW3 pass (SA-10 §3.2): waiting on us first, the longest waiting first (t2 OPEN), then those waiting on the firm by how long (t1, t3), then closed (t4)",
    JSON.stringify(order) === JSON.stringify([t2, t1, t3, t4]), { order, want: [t2, t1, t3, t4] });
  await owner.platformSupportMessage.create({ data: { firmId: firmA, ticketId: t1, authorKind: "FIRM_STAFF", authorId: staffA, body: "Sample: still broken" } });
  sql(`update platform_support_ticket set status = 'WAITING_ON_SUPPORT' where id = '${t1}'`);
  const order2 = (await call(base, Q, tokens.support)).body.tickets.map((t: any) => t.id);
  ok("PF-17 DW3 fail: the firm writes again on t1 (WAITING_ON_SUPPORT) → it joins the tickets waiting on us, after the older t2, before those waiting on the firm",
    JSON.stringify(order2) === JSON.stringify([t2, t1, t3, t4]) && order2.indexOf(t1) < order2.indexOf(t3), order2);
  const onlyFirm = (await call(base, `${Q}?status=WAITING_ON_FIRM`, tokens.support)).body, onlyA = (await call(base, `${Q}?firm=${firmA}`, tokens.support)).body;
  const page2 = (await call(base, `${Q}?page=2`, tokens.support)).body;
  ok("PF-17 DW3 pass: ?status=WAITING_ON_FIRM → t3 only; ?firm=<firm A> → firm A's two tickets only; ?page=2 → none, the same total",
    onlyFirm.total === 1 && onlyFirm.tickets[0].id === t3 && onlyA.total === 2 && onlyA.tickets.every((t: any) => t.firm.id === firmA) && page2.tickets.length === 0 && page2.total === 4 && page2.pageSize === QUEUE_PAGE_SIZE, { onlyFirm, onlyA: onlyA.total, page2 });
  const wrong = await Promise.all([`${Q}?status=nope`, `${Q}?firm=x`, `${Q}?page=0`, `${Q}?priority=HIGH`, `${Q}?firm=${encodeURIComponent("1' or '1'='1")}`].map((p) => call(base, p, tokens.support)));
  ok("PF-17 DW3 fail: a wrong status, firm, page, an unknown filter (priority) or a SQL-looking firm → 422 naming the field, never 500", wrong.every((r) => r.status === 422 && r.body.code === "SUPPORT_QUERY"), wrong.map((r) => [r.status, r.body.fields]));

  // ---------------------------------------------------------------------------------------- DW4: one ticket
  const one = await call(base, `${Q}/${t1}`, tokens.auditor);
  ok("PF-17 DW4 pass: one ticket (Auditor, read only) with its firm and every message in order: the raiser named from firm A's staff, ours as ExpatReady support",
    one.status === 200 && one.body.firm.id === firmA && one.body.messages.length === msgs(t1) && one.body.messages[0].authorName === staffAName && one.body.messages[0].body.startsWith(`Sample ${run} one`)
    && one.body.messages[1].authorKind === "SUPPORT" && one.body.messages[1].authorName === SUPPORT_NAME && one.body.messages.at(-1).body === "Sample: still broken", one.body);
  const unknown = await call(base, `${Q}/00000000-0000-4000-8000-00000000abcd`, tokens.support), bad = await call(base, `${Q}/not-a-ticket`, tokens.support), sqlish = await call(base, `${Q}/${encodeURIComponent("1' or '1'='1")}`, tokens.support);
  ok("PF-17 DW4 fail: an unknown ticket id and a malformed one (a SQL-looking one too) → 404 \"No such support ticket.\", never 500",
    [unknown, bad, sqlish].every((r) => r.status === 404 && r.body.detail === "No such support ticket."), [unknown, bad, sqlish].map((r) => [r.status, r.body.detail]));

  // ---------------------------------------------------------------------------------------- DW6: audit lines
  const trail = (f: string) => Number(sql(`select count(*) from audit_event where firm_id = '${f}'`));
  const bypassOn = (f: string) => Number(sql(`select count(*) from audit_event where firm_id = '${f}' and action = 'platform.bypass' and detail->>'use' = '${SUPPORT_TICKET.name}'`));
  const queueLines = () => Number(sql(`select count(*) from audit_event where firm_id is null and action = 'platform.bypass' and detail->>'use' = '${SUPPORT_QUEUE.name}'`));
  const a0 = trail(firmA), b0 = trail(firmS), q0 = queueLines(), y0 = sysLines();
  await call(base, Q, tokens.support);
  ok("PF-17 DW6 pass: a queue call writes one PF-4s line and one firm-less bypass line, and nothing on any firm's own trail", sysLines() === y0 + 1 && queueLines() === q0 + 1 && trail(firmA) === a0 && trail(firmS) === b0, { y: [y0, sysLines()], q: [q0, queueLines()] });
  const y1 = sysLines();
  await call(base, Q, tokens.billing);
  const refused = JSON.parse(sql(`select row_to_json(a) from (select route, outcome, code from plat_system_audit order by at desc, id desc limit 1) a`));
  ok("PF-17 DW6 fail: a refused call writes exactly one PF-4s line (REFUSED, MISSING_PERMISSION) and no bypass line", sysLines() === y1 + 1 && refused.outcome === "REFUSED" && refused.code === "MISSING_PERMISSION" && queueLines() === q0 + 1, refused);
  const pA = bypassOn(firmA), pS = bypassOn(firmS);
  await call(base, `${Q}/${t1}`, tokens.support);
  ok("PF-17 DW6 pass: opening firm A's ticket writes firm A's own platform.bypass line (its use named) and none for firm B", bypassOn(firmA) === pA + 1 && bypassOn(firmS) === pS, { pA, now: bypassOn(firmA), pS });

  // ---------------------------------------------------------------------------------------- DW7: the bypass uses
  const qUse = bypassUses()[SUPPORT_QUEUE.name], tUse = bypassUses()[SUPPORT_TICKET.name];
  ok("PF-17 DW7 pass: the two uses are declared in support.bypass.ts (not on the frozen BYPASS_USES): the queue for its list only (platform audit), one ticket for its read and its reply (per-firm)",
    qUse === SUPPORT_QUEUE.entry && tUse === SUPPORT_TICKET.entry && !(SUPPORT_QUEUE.name in BYPASS_USES) && !(SUPPORT_TICKET.name in BYPASS_USES) && qUse.audit === "platform" && tUse.audit === "per-firm"
    && qUse.routes.length === 1 && qUse.routes[0].test(`GET ${Q}`) && !qUse.routes[0].test(`GET ${Q}/${t1}`) && !qUse.routes[0].test(`POST ${Q}`)
    && tUse.routes.some((r) => r.test(`GET ${Q}/${t1}`)) && tUse.routes.some((r) => r.test(`POST ${Q}/${t1}/replies`)) && !tUse.routes.some((r) => r.test(`GET ${Q}`) || r.test(`DELETE ${Q}/${t1}`) || r.test(`POST ${Q}/${t1}`) || r.test(`GET ${Q}/${t1}/replies/x`) || r.test(`PATCH ${Q}/${t1}/replies`)));
  const byName = await throwsLike(() => inRequest({ method: "GET", path: Q }, () => asBypass(SUPPORT_QUEUE.name, async () => 1)), (e) => e instanceof BypassRefused);
  const svc = new SystemSupport({ db: owner, support: new SupportService({ db: owner, files: unused, audit: auditEvent, mail: unused }) });
  const caller = { staffId: "pf17s", keys: ["system/support:list", "system/support:manage"] };
  const m1 = msgs(t2);
  const elsewhere = await throwsLike(() => inRequest({ method: "GET", path: "/api/system/firms" }, () => svc.list(caller, {})), (e) => e instanceof BypassRefused);
  const elsewhereReply = await throwsLike(() => inRequest({ method: "POST", path: `/api/platform/support/tickets/${t2}/messages` }, () => svc.reply(caller, t2, { body: "Sample" })), (e) => e instanceof BypassRefused);
  wallUnscopedQueries();
  const unscoped = await throwsLike(() => svc.one(caller, t2), (e) => e instanceof BypassRefused);
  ok("PF-17 DW7 fail: a use run by its name alone, or the service called on any other route (a firm's support route too) or with no request at all, is refused (BypassRefused); nothing written",
    byName && elsewhere && elsewhereReply && unscoped && msgs(t2) === m1, { byName, elsewhere, elsewhereReply, unscoped });
  const noKey = await throwsLike(() => inRequest({ method: "POST", path: `${Q}/${t2}/replies` }, () => svc.reply({ staffId: "pf17s", keys: ["system/support:list"] }, t2, { body: "Sample" })), (e: any) => e?.status === 403);
  ok("PF-17 DW7 fail: the service itself refuses a reply without system/support:manage (403), whatever the route's guard did", noKey && msgs(t2) === m1);
  const noList = await throwsLike(() => inRequest({ method: "GET", path: Q }, () => svc.list({ staffId: "pf17s", keys: ["system/support:manage"] }, {})), (e: any) => e?.status === 403);
  const noOne = await throwsLike(() => inRequest({ method: "GET", path: `${Q}/${t2}` }, () => svc.one({ staffId: "pf17s", keys: [] }, t2)), (e: any) => e?.status === 403);
  ok("PF-17 DW7 fail (review m2): the service itself refuses the queue and one ticket without system/support:list (403), whatever the route's guard did", noList && noOne, { noList, noOne });
} catch (e) {
  fail++; console.log(`FAIL  unexpected error — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  await owner.$disconnect().catch(() => undefined);
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for the cleanup tool */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
