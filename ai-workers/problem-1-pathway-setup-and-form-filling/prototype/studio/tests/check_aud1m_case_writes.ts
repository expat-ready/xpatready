// AUD-1m part 1 (map row 8, R1.8; SA-11-2, AG-13-40, SA-11 BR-3; case-side contract §2.5; P-607 (3) fail-closed): the
// case side's Audit.log (api/src/core.ts) keeps its signature and writes through AuditPort (ports/audit.ts CaseEntry,
// platform/audit/audit-event.ts), so a case or configuration line carries the request's or job's firm, its correlation
// id, its actor type and, when its entity or key names a case, its case id. CW1-CW7, a pass and a fail each. A scratch
// database (every migration), no server, no browser, no model call (US$0). The scratch database is dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud1m_case_writes.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fakeAlerts } from "../ports/alert.ts";
import { AuditEntry, CaseEntry, fakeAudit } from "../ports/audit.ts";
import { SAMPLE_FIRMS_SQL } from "./runtime/sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), API = join(STUDIO, "api", "src");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_aud1m_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const rejects = async (f: () => Promise<unknown>, test: (e: unknown) => boolean = () => true) => { try { await f(); return false; } catch (e) { return test(e); } };

// ---------------------------------------------------------------------------------- CW1: the direct writes left (no DB)
/** Every direct `auditEvent.create` under api/src outside the adapter, as file → count. */
const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? files(join(d, x.name)) : x.name.endsWith(".ts") ? [join(d, x.name)] : []));
const ADAPTER = "platform/audit/audit-event.ts";
function directWrites(tree: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [f, text] of Object.entries(tree)) { const n = text.split("auditEvent.create").length - 1; if (n && f !== ADAPTER) out[f] = n; }
  return out;
}
/** What parts 1, 2a, 2b and 2c leave: nothing. Part 1 removed core.ts's own; part 2a the case, document and person writes;
 *  part 2b the form, library, review and lifecycle writes (Audit.log through AuditPort) and identity/audit.ts's two; part 2c
 *  platform/settings.ts's writeSetting (AuditPort.record; tests/check_pf0a_audit_port.ts). Only the adapter writes. */
const LEFT: Record<string, number> = {};
const same = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const tree = Object.fromEntries(files(API).map((f) => [relative(API, f), readFileSync(f, "utf8")]));
const left = directWrites(tree), total = Object.values(left).reduce((a, b) => a + b, 0);
ok(`AUD-1m CW1 pass: the direct auditEvent.create writes left are exactly what parts 1, 2a, 2b and 2c leave: none (${total} in ${Object.keys(left).length} files; core.ts's Audit.log has none)`, same(left, LEFT) && !left["core.ts"], left);
ok("AUD-1m CW1 fail: one new direct write (or core.ts's own back) is caught", !same(directWrites({ ...tree, "new-thing.ts": "await tx.auditEvent.create({ data })" }), LEFT) && !same(directWrites({ ...tree, "core.ts": `${tree["core.ts"]}\nthis.db.auditEvent.create({})` }), LEFT));

// ------------------------------------------------------------------- CW2: the two entries never pass for each other (no DB)
const W = "0a0a0a0a-0000-4000-8000-00000000a1d1";
const caseLine = (o: Partial<CaseEntry> = {}): CaseEntry => ({ workspaceId: W, actor: "user-O", action: "answered", entity: "case fact", entityKey: "person.name", summary: "x", ...o });
ok("AUD-1m CW2 pass: a case line parses as a CaseEntry (simulated staff, a client, person:, system:, seed:, staff:)", ["user-O", "user-A", "user-P", "person:p1", "system:rules", "seed:demo", "staff:s1"].every((actor) => CaseEntry.safeParse(caseLine({ actor })).success));
ok("AUD-1m CW2 fail: a case line of an area entity, a bare word (test, system, rules) or an unknown simulated id is refused; a platform entry of a case entity is refused",
  ["platform_staff", "fo_retainer", "money_line"].every((entity) => !CaseEntry.safeParse(caseLine({ entity })).success)
  && ["test", "system", "rules", "user-Z", "", "staff:"].every((actor) => !CaseEntry.safeParse(caseLine({ actor })).success)
  && !AuditEntry.safeParse({ firmId: W, actor: "staff:s1", action: "case.answered", entity: "case fact", entityKey: "k", summary: "x" }).success
  && !AuditEntry.safeParse({ ...caseLine(), firmId: W }).success);
{ const fake = fakeAudit();
  await fake.record({}, caseLine()); await fake.record({}, { firmId: W, actor: "system:x", action: "retainer.sent", entity: "fo_retainer", entityKey: "r1", summary: "Sent." });
  ok("AUD-1m CW2 pass: the fake keeps case lines apart from platform lines", fake.caseEntries.length === 1 && fake.entries.length === 1 && fake.caseEntries[0].entity === "case fact" && fake.entries[0].entity === "fo_retainer");
  ok("AUD-1m CW2 fail: the fake refuses a case line of an area entity, and keeps nothing", await rejects(() => fake.record({}, caseLine({ entity: "platform_staff" }))) && fake.caseEntries.length === 1); }

// ----------------------------------------------------------------------------------------- the scratch database
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-c", SAMPLE_FIRMS_SQL]);   // a case needs its firm (CS-W1 part 2)
process.env.DATABASE_URL = urlOf(DB);

const { Audit, actorWordOf } = await import("../api/src/core.ts");
const { peopleNames } = await import("../api/src/studio.ts");
const { AuditRefused } = await import("../api/src/platform/audit/audit-event.ts");
const { requestScope } = await import("../api/src/platform/observability/log.ts");
const { useAlerts } = await import("../api/src/platform/observability/alerts.ts");
const { observed } = await import("../api/src/platform/jobs/platform-jobs.ts");
const { firmMayRead } = await import("../api/src/case-feed.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const alerts = fakeAlerts(); const restoreAlerts = useAlerts(alerts);
const failed = () => alerts.raised.filter((a) => a.kind === "audit_write_failed");
const audit = new Audit(db as never);
type Scope = Parameters<typeof requestScope.run>[0];
/** A request's scope, as hook.ts's middleware fills it (firm and actor from the guard's req.platform). */
const inRequest = <T>(s: { id: string; firm?: string; who?: Scope["audit"] }, fn: () => Promise<T>) => requestScope.run({ correlationId: s.id, firmId: () => s.firm, audit: s.who }, fn);
const lineOf = (key: string) => db.auditEvent.findFirst({ where: { entityKey: key }, orderBy: { at: "desc" } });

try {
  const ws = (await db.workspace.create({ data: { key: "demo", label: "AUD-1m check" } })).id;
  const firm = (await db.platformFirm.findFirst({ select: { id: true } }))?.id ?? "3f1c0000-0000-4000-8000-00000000f1a1";
  const CASE = "3185450e-1111-4222-8333-444455556666", OTHER = "9a1b2c3d-1111-4222-8333-444455556666";
  const TWIN_A = "7e7e7e7e-1111-4222-8333-0000000000a1", TWIN_B = "7e7e7e7e-2222-4222-8333-0000000000b2", ELSEWHERE = "5e5e5e5e-1111-4222-8333-444455556666", NO_CASE = "4d4d4d4d-1111-4222-8333-444455556666";

  // CW3: a case action's line carries its case id: real callers' shapes (runtime.ts, fill-case.ts, sections) name the
  // case only in their words ("on case 3185450e"); the case is the one of the line's workspace with that prefix.
  const ws2 = (await db.workspace.create({ data: { key: "aud1m-other", label: "AUD-1m check, another workspace" } })).id;
  const COMBO = "0b0b0b0b-0000-4000-8000-00000000c0b0";
  let cases = 0;
  // A bare case row (the check needs only its id and workspace): the scratch database's own superuser inserts it with
  // foreign keys and triggers off for that one transaction (no combination, release or client behind it).
  const CLIENT = "0c0c0c0c-0000-4000-8000-00000000c11e";
  const newCase = (id: string, workspaceId = ws) => db.$transaction([db.$executeRawUnsafe("SET LOCAL session_replication_role = replica"),
    db.$executeRawUnsafe(`INSERT INTO runtime_case (id, workspace_id, combination_id, case_number, client_actor_id, created_by, client_id) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'user-P', 'user-O', $5::uuid)`,
      id, workspaceId, COMBO, `C-2026-${String(++cases).padStart(5, "0")}`, CLIENT)]);
  await newCase(CASE); await newCase(TWIN_A); await newCase(TWIN_B); await newCase(ELSEWHERE, ws2);
  await audit.log(ws, "user-O", "opened", "case", CASE, `Case officer opened case ${CASE.slice(0, 8)}`);
  await audit.log(ws, "user-O", "answered", "case fact", "person.name", `Case officer answered person.name on case ${CASE.slice(0, 8)} (Agent view)`);
  await audit.log(ws, "user-O", "generated", "form copy", "IMM5257", `Copy 1a2b3c4d of IMM5257 on case ${CASE.slice(0, 8)} generated: 12 form fields written`);
  await audit.log(ws, "user-O", "entered", "section", "s-1", `Case officer marked the section entered on Case ${CASE.slice(0, 8).toUpperCase()}`);
  const real = await db.auditEvent.findMany({ where: { workspaceId: ws, entityKey: { in: [CASE, "person.name", "IMM5257", "s-1"] } }, select: { entity: true, caseId: true } });
  ok("AUD-1m CW3 pass: a case action's line carries its case id (the case entity's key; a case fact, a form copy and a section named only in their words)", real.length === 4 && real.every((l) => l.caseId === CASE), real);
  await audit.log(ws, "user-A", "updated", "form", "IMM5257-cfg", "Configuration author changed IMM 5257");
  await audit.log(ws, "user-O", "answered", "case fact", "cw3-twin", `x on case ${TWIN_A.slice(0, 8)}`);
  await audit.log(ws, "user-O", "answered", "case fact", "cw3-elsewhere", `x on case ${ELSEWHERE.slice(0, 8)}`);
  await audit.log(ws, "user-O", "answered", "case fact", "cw3-none", `x on case ${NO_CASE.slice(0, 8)}`);
  await audit.log(ws, "user-O", "opened", "case", "not-a-uuid", "x opened a case");
  const nulls = await db.auditEvent.findMany({ where: { entityKey: { in: ["IMM5257-cfg", "cw3-twin", "cw3-elsewhere", "cw3-none", "not-a-uuid"] } }, select: { entityKey: true, caseId: true } });
  ok("AUD-1m CW3 fail: no case id for a line naming no case, two cases sharing the 8 characters, another workspace's case, no such case, or a key that is no case (never guessed)", nulls.length === 5 && nulls.every((l) => l.caseId === null), nulls);

  // CW4: a line written with tx disappears when that transaction rolls back.
  await db.$transaction(async (tx) => { await new Audit(tx as never).log(ws, "user-O", "added", "row", "cw4-commit", `Case officer added a row on case ${CASE.slice(0, 8)}`); });
  ok("AUD-1m CW4 pass: a line written with tx in a transaction that commits is kept", !!(await lineOf("cw4-commit")));
  await db.$transaction(async (tx) => { await new Audit(tx as never).log(ws, "user-O", "added", "row", "cw4-rollback", "x"); throw new Error("roll back"); }).catch(() => undefined);
  ok("AUD-1m CW4 fail: a line written with tx in a transaction that rolls back is gone", !(await lineOf("cw4-rollback")));

  // CW5: firm, correlation and actor type from the request or job; null outside both.
  await inRequest({ id: "cw5-request-1", firm }, () => audit.log(ws, "user-O", "answered", "case fact", "cw5-req", "x"));
  await observed("aud1m-check", async () => { await audit.log(ws, "rules", "resolved", "case", "cw5-job", "The rules resolved 1 finding"); })({ name: "aud1m-check", key: "aud1m-cw5", firmId: firm, payload: {}, runAt: new Date(), attempt: 1 } as never);
  await audit.log(ws, "user-P", "answered", "case fact", "cw5-none", "x");
  const req = await lineOf("cw5-req"), job = await lineOf("cw5-job"), none = await lineOf("cw5-none");
  ok("AUD-1m CW5 pass: a request's line carries its firm and correlation id (FIRM_STAFF), a job's its firm and job: id (system:rules, SYSTEM); a client's line is CLIENT",
    req?.firmId === firm && req.correlationId === "cw5-request-1" && req.actorType === "FIRM_STAFF"
    && job?.firmId === firm && job.correlationId?.startsWith("job:") && job.actor === "system:rules" && job.actorType === "SYSTEM"
    && none?.actorType === "CLIENT", [req, job, none].map((l) => l && { firm: l.firmId, corr: l.correlationId, actor: l.actor, type: l.actorType }));
  ok("AUD-1m CW5 fail: outside any request or job the line has no firm and no correlation id (until CS-W1), and the bare words read as before", none?.firmId === null && none.correlationId === null && actorWordOf("system:rules") === "rules" && actorWordOf("system:studio") === "system" && actorWordOf("user-O") === "user-O");
  // The readers that name a stored actor read a mapped word as before: the activity feed's who, and "The studio" in the
  // three history lists (their source names actorWordOf, so reverting one turns this red).
  const readers = ["form-uses.ts", "library-items.ts", "lifecycle.ts"].map((f) => readFileSync(join(API, f), "utf8").includes('actorWordOf(r.actor) === "system" ? "The studio"'));
  ok("AUD-1m CW5 pass: the activity feed reads system:rules as rules and system:studio as system; the three history lists read system:studio as The studio",
    peopleNames("system:rules") === "rules" && peopleNames("system:studio") === "system" && peopleNames("user-O,system:rules") === "Case officer, rules" && readers.every(Boolean), { who: peopleNames("system:rules"), readers });

  // CW6: fail-closed in a signed-in request and in our staff's; an untyped word is refused; one alert, ids only.
  const before = failed().length, n0 = await db.auditEvent.count();
  const signedIn = { id: "cw6-1", firm, who: () => ({ actor: "staff:cw6-staff", actorType: "FIRM_STAFF" as const }) };
  await inRequest(signedIn, () => audit.log(ws, "staff:cw6-staff", "answered", "case fact", "cw6-own", "x"));
  ok("AUD-1m CW6 pass: in a signed-in request a case line by the request's own actor is written, FIRM_STAFF with its firm", (await lineOf("cw6-own"))?.firmId === firm);
  const refusedOther = await rejects(() => inRequest(signedIn, () => audit.log(ws, "user-O", "answered", "case fact", "cw6-other", "x")), (e) => e instanceof AuditRefused);
  const refusedOurs = await rejects(() => inRequest({ id: "cw6-2", firm, who: () => ({ actor: "staff:cw6-ours", actorType: "OUR_STAFF" as const }) }, () => audit.log(ws, "staff:cw6-ours", "answered", "case fact", "cw6-ours", "x")), (e) => e instanceof AuditRefused);
  const refusedWord = await rejects(() => audit.log(ws, "test", "answered", "case fact", "cw6-word", "x"), (e) => e instanceof AuditRefused && /actor word 'test' has no actor type/.test((e as Error).message));
  const refusedArea = await rejects(() => audit.log(ws, "user-O", "answered", "platform_staff", "cw6-area", "x"));
  const alertsNow = failed().slice(before), d = alertsNow[0]?.detail as Record<string, unknown> | undefined;
  ok("AUD-1m CW6 fail: another actor in a signed-in request, our staff's request, a bare word and an area entity are refused, nothing written, one alert each with ids only",
    refusedOther && refusedOurs && refusedWord && refusedArea && (await db.auditEvent.count()) === n0 + 1 && alertsNow.length === 4 && d?.firmId === firm && !JSON.stringify(alertsNow).includes("staff:cw6"),
    { refusedOther, refusedOurs, refusedWord, refusedArea, alerts: alertsNow.length, d });

  // CW7: the firm's case feed reads the same lines as before (case-feed.ts's rule on the stored lines).
  const own = new Set([CASE.slice(0, 8)]), lines = await db.auditEvent.findMany({ where: { workspaceId: ws } });
  const read = (k: string) => { const l = lines.find((x) => x.entityKey === k); return !!l && firmMayRead(l, own); };
  ok("AUD-1m CW7 pass: the firm's own case lines and the configuration line are read by its feed", read(CASE) && read("person.name") && read("IMM5257") && read("IMM5257-cfg") && read("cw4-commit"));
  ok("AUD-1m CW7 fail: another firm's case line is not read, and no line lands in the platform's own workspace", !firmMayRead({ entity: "case fact", entityKey: "k", summary: `x on case ${OTHER.slice(0, 8)}` }, own)
    && !(await db.workspace.findUnique({ where: { key: "platform-audit" } })));
} catch (e) {
  ok("AUD-1m: the check ran to the end", false, String(e).slice(0, 400));
} finally {
  useAlerts(restoreAlerts);
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
