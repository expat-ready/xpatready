// PF-0a (AUD-1m part 2b; Lead 94's ruling on #2289, option (A)): the platform's identity audit lines (platform/identity/
// audit.ts auditStaff, auditInvitation) go through AuditPort.record inside the caller's transaction, with no other
// behaviour change than the strict AuditEntry's: a free-text reason holding an email address is refused (ids and facts
// only). platform/settings.ts's writeSetting follows in part 2c. A pass and a fail each:
//   PA1/PA2 each write lands through the port (a spy on auditEvent.record sees it, and the line is written with its firm,
//           actor type, the platform's workspace and the firm's key in detail); with a stand-in direct write (the code before
//           this part) the spy sees nothing.
//   PA3     fail-closed: a failing audit write rolls the change back (a forced failure and a real refusal), one alert.
//   PA4     the one behaviour change: a reason with an email address is refused; the same reason without one is written.
// A scratch database (every migration), no server, no browser, no model call (US$0). Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf0a_audit_port.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAlerts } from "../ports/alert.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf0a_scratch_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { auditStaff, auditInvitation, actorWord, platformAuditWorkspaceId } = await import("../api/src/platform/identity/audit.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { useAlerts } = await import("../api/src/platform/observability/alerts.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const alerts = fakeAlerts(); const restoreAlerts = useAlerts(alerts);
const failed = () => alerts.raised.filter((a) => a.kind === "audit_write_failed");

// The spy: wraps the one port instance identity/audit.ts calls (the same object), counting each line and optionally failing.
type Tx = Prisma.TransactionClient;
const realRecord = auditEvent.record.bind(auditEvent);
const seen: { entity: string; entityKey: string }[] = [];
let forceFail = false;
(auditEvent as { record: typeof auditEvent.record }).record = async (tx, entry) => {
  const e = entry as { entity: string; entityKey: string };
  seen.push({ entity: e.entity, entityKey: e.entityKey });
  if (forceFail) throw new Error("forced audit failure (PF-0a check)");
  return realRecord(tx, entry);
};
/** The stand-in: the identity write before this part, straight to the table (no port). */
const directStaff = async (tx: Tx, l: { firmId: string; firmKey: string; actor: string; action: string; entityKey: string; summary: string }) =>
  tx.auditEvent.create({ data: { workspaceId: await platformAuditWorkspaceId(tx), firmId: l.firmId, actor: l.actor, action: l.action, entity: "platform_staff", entityKey: l.entityKey, summary: `Firm ${l.firmKey}: ${l.summary}`, detail: { firmId: l.firmId, firmKey: l.firmKey } } });
const lineOf = (key: string) => db.auditEvent.findFirst({ where: { entityKey: key }, orderBy: { at: "desc" } });

try {
  await seedSampleFirms(db);
  const R = await db.platformStaff.findFirstOrThrow({ where: { actorId: "user-R" }, select: { id: true, firmId: true, displayName: true, firm: { select: { key: true } } } });
  const ws = await platformAuditWorkspaceId(db);
  const base = { firmId: R.firmId, firmKey: R.firm.key, actor: actorWord(R.id) };

  // PA1: auditStaff.
  let n = seen.length;
  await db.$transaction((tx) => auditStaff(tx, { ...base, action: "platform.staff.roles_changed", entityKey: "pf0a-staff", summary: "roles changed (PF-0a check)", detail: { staffId: R.id, before: ["CASE_OFFICER"], after: ["CASE_MANAGER"], reason: "Sample reason" } }));
  const s1 = await lineOf("pf0a-staff"), d1 = s1?.detail as Record<string, unknown> | undefined;
  ok("PF-0a PA1 pass: auditStaff's line lands through the port (the spy sees it), with its firm, FIRM_STAFF, the platform's workspace, its summary and the firm's key and id in detail",
    seen.length === n + 1 && seen.at(-1)?.entity === "platform_staff" && s1?.firmId === R.firmId && s1.actorType === "FIRM_STAFF" && s1.workspaceId === ws
    && s1.summary === `Firm ${R.firm.key}: roles changed (PF-0a check)` && d1?.firmKey === R.firm.key && d1?.firmId === R.firmId && JSON.stringify(d1?.after) === '["CASE_MANAGER"]', { s1, seen: seen.length - n });
  n = seen.length;
  await db.$transaction((tx) => directStaff(tx, { ...base, action: "platform.staff.roles_changed", entityKey: "pf0a-staff-direct", summary: "x" }));
  ok("PF-0a PA1 fail: with the stand-in direct write the line lands but the spy sees nothing (the judge 'through the port' fails on it)", seen.length === n && !!(await lineOf("pf0a-staff-direct")));

  // PA2: auditInvitation.
  n = seen.length;
  await db.$transaction((tx) => auditInvitation(tx, { ...base, action: "platform.invitation.created", entityKey: "pf0a-invitation", summary: "an invitation was sent (PF-0a check)", detail: { invitationId: "pf0a-invitation", roles: ["CASE_OFFICER"], reason: null } }));
  const s2 = await lineOf("pf0a-invitation");
  ok("PF-0a PA2 pass: auditInvitation's line lands through the port, entity platform_invitation, with its firm and FIRM_STAFF", seen.length === n + 1 && seen.at(-1)?.entity === "platform_invitation" && s2?.firmId === R.firmId && s2.actorType === "FIRM_STAFF" && s2.entity === "platform_invitation", s2);
  n = seen.length;
  await db.$transaction(async (tx) => { await tx.auditEvent.create({ data: { workspaceId: ws, firmId: R.firmId, actor: base.actor, action: "platform.invitation.created", entity: "platform_invitation", entityKey: "pf0a-invitation-direct", summary: "x" } }); });
  ok("PF-0a PA2 fail: with the stand-in direct write the spy sees nothing", seen.length === n && !!(await lineOf("pf0a-invitation-direct")));

  // PA3: fail-closed. The change is the staff member's display name; its audit line fails; the name stays.
  const name = () => db.platformStaff.findUniqueOrThrow({ where: { id: R.id }, select: { displayName: true } }).then((x) => x.displayName);
  const before = await name(), a0 = failed().length;
  forceFail = true;
  const forced = await db.$transaction(async (tx) => { await tx.platformStaff.update({ where: { id: R.id }, data: { displayName: "PF-0a renamed" } }); await auditStaff(tx, { ...base, action: "platform.staff.renamed", entityKey: "pf0a-forced", summary: "renamed", detail: { staffId: R.id } }); }).then(() => false, () => true);
  forceFail = false;
  ok("PF-0a PA3 pass: a forced audit failure rolls the change back (the name is as before, no line)", forced && (await name()) === before && !(await lineOf("pf0a-forced")));
  const refused = await db.$transaction(async (tx) => { await tx.platformStaff.update({ where: { id: R.id }, data: { displayName: "PF-0a renamed" } }); await auditStaff(tx, { ...base, action: "platform.staff.renamed", entityKey: "pf0a-refused", summary: "renamed", detail: { staffId: R.id, nested: { not: "flat" } } }); }).then(() => false, () => true);
  ok("PF-0a PA3 fail-closed: a line the port refuses (nested detail) rolls the change back too, with one audit_write_failed alert", refused && (await name()) === before && !(await lineOf("pf0a-refused")) && failed().length === a0 + 1, { refused, alerts: failed().length - a0 });
  await db.$transaction(async (tx) => { await tx.platformStaff.update({ where: { id: R.id }, data: { displayName: before } }); await auditStaff(tx, { ...base, action: "platform.staff.renamed", entityKey: "pf0a-kept", summary: "renamed back", detail: { staffId: R.id } }); });
  ok("PF-0a PA3 pass: the same change with a good line commits both", !!(await lineOf("pf0a-kept")));

  // PA4: the one behaviour change (Lead 94's ruling: refused, as the strict port refuses it).
  const withReason = (key: string, reason: string) => db.$transaction((tx) => auditStaff(tx, { ...base, action: "platform.staff.deactivated", entityKey: key, summary: "a staff member was deactivated", detail: { staffId: R.id, reason } })).then(() => true, () => false);
  ok("PF-0a PA4 pass: a reason with no email address is written", (await withReason("pf0a-reason-ok", "Left the firm (Sample)")) && !!(await lineOf("pf0a-reason-ok")));
  ok("PF-0a PA4 fail: a reason holding an email address is refused and nothing is written (ids and facts only)", !(await withReason("pf0a-reason-email", "Asked by sample.person@example.com")) && !(await lineOf("pf0a-reason-email")));
} catch (e) {
  ok("PF-0a: the check ran to the end", false, String((e as Error)?.stack ?? e));
} finally {
  (auditEvent as { record: typeof auditEvent.record }).record = realRecord;
  restoreAlerts && useAlerts(restoreAlerts);
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
