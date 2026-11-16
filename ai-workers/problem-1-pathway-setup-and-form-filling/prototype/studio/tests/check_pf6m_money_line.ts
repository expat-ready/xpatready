// PF-6m (QA-478; PF-6b ruling 2 (b); Lead B's brief rev 16.53): one money-keys audit line for both doors that hand out
// roles. A pass and a fail per Done when line:
//   DW1 an accepted Billing/Finance invitation writes one platform.staff.money_keys_granted line naming the money keys;
//       a Read-only one writes none · DW2 a refused provider call rolls the whole accept back, money line included ·
//   DW3 the role-change door's line is byte-for-byte what it wrote before PF-6m (the old formula, frozen below).
// Plus the breaker's two: an invitation with two roles (only one brings money keys) names only that role; a replayed accept
// writes no second line. A scratch database (every migration, the Sample firms) and a Nest app of PF-4's and PF-4b's
// classes with the local stand-ins and a test clock. No server, no browser, no model call (US$0). The database is dropped.
//   tsx studio/tests/check_pf6m_money_line.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf6m_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const call = async (base: string, method: string, path: string, o: { token?: string; body?: unknown } = {}) => {
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { IDENTITY_ADMIN_PORT, LocalIdentityAdmin } = await import("../api/src/platform/identity/session/provider.ts");
const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
const { PlatformSession } = await import("../api/src/platform/identity/session/service.ts");
const { PlatformSessionController, PublicInvitationController } = await import("../api/src/platform/identity/session/routes.ts");
const { moneyKeysOfRoles } = await import("../api/src/platform/identity/catalogue.ts");
const { MONEY_KEYS_GRANTED } = await import("../api/src/platform/identity/money-line.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { t = Date.now(); override now() { return this.t; } })();
const local = new LocalIdentity("pf6m-check-signing-key-0123456789abcdef", () => clock.now());
const admin = new LocalIdentityAdmin(() => clock.now());
const createUser = admin.createUser.bind(admin);
let refuseFor = "";   // the provider refuses this email (DW2)
admin.createUser = async (e: string) => { if (e === refuseFor) throw new Error("provider refused (PF-6m DW2, forced)"); return createUser(e); };

let app: { close(): Promise<void> } | null = null;
try {
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: IDENTITY_ADMIN_PORT, useValue: admin }, { provide: MAIL_PORT, useValue: fakeMail() }, PlatformSession];
  @Module({ controllers: [PlatformIdentityController, PlatformSessionController, PublicInvitationController] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;

  await seedSampleFirms(db);
  const FIRM_A = sql(`select id from platform_firm where key = 'sample-firm'`), R = sql(`select id from platform_staff where actor_id = 'user-R'`), O = sql(`select id from platform_staff where actor_id = 'user-O'`);
  const tR = (await call(base, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", actorId: "user-R", secondStep: true } })).body.token as string;
  const invite = (email: string, roles: string[]) => { const token = randomBytes(32).toString("base64url"), hash = createHash("sha256").update(token).digest("hex");
    sql(`insert into platform_invitation (id, firm_id, email, roles, token_hash, invited_by, created_at, expires_at) values (gen_random_uuid(), '${FIRM_A}', '${email}', '{${roles.join(",")}}', '${hash}', 'staff:${R}', now(), now() + interval '72 hours')`); return token; };
  const accept = (token: string) => call(base, "POST", `/api/public/invitations/${token}/accept`);
  type Line = { actor: string; entity: string; entity_key: string; summary: string; detail: Record<string, any> };
  const linesOf = (staffId: string): Line[] => JSON.parse(sql(`select coalesce(json_agg(json_build_object('actor', actor, 'entity', entity, 'entity_key', entity_key, 'summary', summary, 'detail', detail) order by at), '[]') from audit_event where action = '${MONEY_KEYS_GRANTED}' and entity_key = '${staffId}'`));
  const allLines = () => Number(sql(`select count(*) from audit_event where action = '${MONEY_KEYS_GRANTED}'`));
  const bfMoney = await moneyKeysOfRoles(db as never, ["BILLING_FINANCE"]);
  ok("setup: Billing/Finance carries money keys and Read-only none (the catalogue)", bfMoney.length > 0 && (await moneyKeysOfRoles(db as never, ["READ_ONLY"])).length === 0, bfMoney);

  // ------------------------------------------------------------------------------------- DW1: the invitation door
  const bf = await accept(invite("billing.person@example.com", ["BILLING_FINANCE"])), bfLines = bf.status === 200 ? linesOf(bf.body.staffId) : [];
  ok(`PF-6m DW1 pass: accepting a Billing/Finance invitation writes one ${MONEY_KEYS_GRANTED} line naming the ${bfMoney.length} money keys, by the inviter`,
    bf.status === 200 && bfLines.length === 1 && bfLines[0].detail.moneyKeys.join() === bfMoney.join() && bfLines[0].detail.roles.join() === "BILLING_FINANCE"
    && bfLines[0].actor === `staff:${R}` && bfLines[0].detail.staffId === bf.body.staffId && bfLines[0].detail.firmId === FIRM_A && bfLines[0].summary === `Firm sample-firm: money permissions given with BILLING_FINANCE: ${bfMoney.length} keys`, { bf: bf.body, bfLines });
  const ro = await accept(invite("read.only.person@example.com", ["READ_ONLY"]));
  ok("PF-6m DW1 fail: accepting a Read-only invitation writes no money-keys line", ro.status === 200 && linesOf(ro.body.staffId).length === 0, ro.body);

  // ---------------------------------------------------------------------- DW2: a refused provider call rolls back
  const before = allLines(); refuseFor = "refused.person@example.com";
  const refused = await accept(invite(refuseFor, ["BILLING_FINANCE"])); refuseFor = "";
  ok("PF-6m DW2 fail: a refused provider call fails the accept and leaves no money line, no staff row, no role grant, the invitation unused",
    refused.status >= 500 && allLines() === before && sql(`select count(*) from platform_staff where email = 'refused.person@example.com'`) === "0"
    && sql(`select count(*) from platform_invitation where email = 'refused.person@example.com' and accepted_at is null`) === "1", { status: refused.status, before, after: allLines() });
  const retried = await accept(invite("refused.later@example.com", ["BILLING_FINANCE"]));
  ok("PF-6m DW2 pass: once the provider answers, the same kind of accept commits with its one money line", retried.status === 200 && linesOf(retried.body.staffId).length === 1 && allLines() === before + 1, retried.body);

  // ------------------------------------------------------------------------------------------ the breaker's two
  const twoToken = invite("two.roles@example.com", ["READ_ONLY", "BILLING_FINANCE"]), two = await accept(twoToken), twoLines = two.status === 200 ? linesOf(two.body.staffId) : [];
  ok("PF-6m break pass: an invitation with two roles (Read-only, Billing/Finance) writes one line naming only the role that brings money keys, and only money keys",
    two.status === 200 && twoLines.length === 1 && twoLines[0].detail.roles.join() === "BILLING_FINANCE" && twoLines[0].detail.moneyKeys.join() === bfMoney.join(), twoLines);
  const replayBefore = allLines(), replay = await accept(twoToken);
  ok("PF-6m break fail: a replayed accept answers 410 NOT_VALID and writes no second money line", replay.status === 410 && replay.body.code === "INVITATION_NOT_VALID" && allLines() === replayBefore && linesOf(two.body.staffId).length === 1, replay.body);

  // ---------------------------------------------------------------------------- DW3: the role-change door, unchanged
  // The line as the role-change door wrote it before PF-6m (service.ts at main bf4fbbf6, frozen here): the roles added that
  // bring a money key, the keys of those roles, the actor's staff word, entity platform_staff.
  const frozen = async (actorId: string, firmId: string, firmKey: string, staffId: string, added: string[]) => {
    const moneyRoles: string[] = []; for (const role of added) if ((await moneyKeysOfRoles(db as never, [role])).length) moneyRoles.push(role);
    const money = await moneyKeysOfRoles(db as never, moneyRoles);
    return money.length ? { actor: `staff:${actorId}`, entity: "platform_staff", entity_key: staffId, summary: `Firm ${firmKey}: money permissions given with ${moneyRoles.join(", ")}: ${money.length} keys`.slice(0, 600), detail: { firmId, firmKey, staffId, roles: moneyRoles, moneyKeys: money } } : null;
  };
  const expected = await frozen(R, FIRM_A, "sample-firm", O, ["READ_ONLY", "BILLING_FINANCE"]);
  const toBF = await call(base, "PATCH", `/api/platform/staff/${O}/roles`, { token: tR, body: { roles: ["CASE_OFFICER", "READ_ONLY", "BILLING_FINANCE"] } }), oLines = linesOf(O);
  ok("PF-6m DW3 pass: the role-change door's line is byte-for-byte the line it wrote before (actor, entity, key, summary, detail)",
    toBF.status === 200 && oLines.length === 1 && JSON.stringify(oLines[0]) === JSON.stringify(JSON.parse(sql(`select json_build_object('actor', '${expected!.actor}', 'entity', 'platform_staff', 'entity_key', '${O}', 'summary', '${expected!.summary}', 'detail', '${JSON.stringify(expected!.detail)}'::jsonb)`))), { oLines, expected });
  ok("PF-6m DW3 pass: the two doors write the same line shape (same entity, summary words, detail fields)", !!bfLines[0] && oLines[0]?.entity === "platform_staff" && bfLines[0].entity === "platform_staff" && Object.keys(oLines[0].detail).sort().join() === Object.keys(bfLines[0].detail).sort().join() && oLines[0].summary === bfLines[0].summary, { o: oLines[0], bf: bfLines[0] });
  const T = sql(`select id from platform_staff where actor_id = 'user-T'`);
  const noMoney = await call(base, "PATCH", `/api/platform/staff/${T}/roles`, { token: tR, body: { roles: ["CASE_MANAGER", "READ_ONLY"] } });
  ok("PF-6m DW3 fail: adding a role that brings no money key (Read-only) writes no money line, as before", noMoney.status === 200 && linesOf(T).length === 0 && (await frozen(R, FIRM_A, "sample-firm", T, ["READ_ONLY"])) === null, { noMoney: noMoney.body, n: linesOf(T).length });
  // Case Officer carries money keys too (invoice and expense, the catalogue): an invitation into it writes its line (4 keys).
  const coMoney = await moneyKeysOfRoles(db as never, ["CASE_OFFICER"]), co = await accept(invite("case.officer@example.com", ["CASE_OFFICER"])), coLines = co.status === 200 ? linesOf(co.body.staffId) : [];
  ok(`PF-6m DW1 pass: an invitation into Case Officer (${coMoney.length} money keys in the catalogue) writes its line too, naming those keys`, co.status === 200 && coMoney.length > 0 && coLines.length === 1 && coLines[0].detail.moneyKeys.join() === coMoney.join(), coLines);
} finally {
  await app?.close().catch(() => {});
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
