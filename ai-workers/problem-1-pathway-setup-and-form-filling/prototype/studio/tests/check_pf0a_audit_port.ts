// PF-0a (AUD-1m part 2b; Lead 94's ruling on #2289, option (A)): the platform's identity audit lines (platform/identity/
// audit.ts auditStaff, auditInvitation) go through AuditPort.record inside the caller's transaction, with no other
// behaviour change than the strict AuditEntry's: a free-text reason holding an email address is refused (ids and facts
// only). Part 2c (Lead 94's rulings (A) and (A1)) moves platform/settings.ts's writeSetting the same way (PS lines).
// A pass and a fail each:
//   PA1/PA2 each write lands through the port (a spy on auditEvent.record sees it, and the line is written with its firm,
//           actor type, the platform's workspace and the firm's key in detail); with a stand-in direct write (the code before
//           this part) the spy sees nothing.
//   PA3     fail-closed: a failing audit write rolls the change back (a forced failure and a real refusal), one alert.
//   PA4     the one behaviour change: a reason with an email address is refused; the same reason without one is written.
//   PS1     writeSetting's line lands through the port (spy), on the platform's workspace; the stand-in direct write is not seen.
//   PS2     fail-closed: a forced audit failure rolls the setting back.
//   PS3     who: a typed word as given, the reset's "system" as system:demo-reset, user-R as staff:<id>; an unknown word refused.
//   PS4     (A1) round trip: 7-day business hours are kept as pieces of at most 200 characters that join back exactly; a
//           stand-in that drops a piece is caught.
//   PS5     (A1) a long reason is cut to 200 in detail only; the summary keeps it (to 600, as before).
//   PS6     R1.88: the line carries firm A's id (firm A's view reads it); firm B's view does not, and firm A's setting
//           written in firm B's request is refused (nothing changes).
// A scratch database (every migration), no server, no browser, no model call (US$0). Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf0a_audit_port.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
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
const { writeSetting, readSetting, registerSetting, joinPieces, SettingRefused, BUSINESS_HOURS, CURRENCY, LANGUAGE } = await import("../api/src/platform/settings.ts");
const { requestScope } = await import("../api/src/platform/observability/log.ts");

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
  const base = { firmId: R.firmId, firmKey: R.firm.key, actor: actorWord(R.id), before: null, after: null };   // R1.8: the helpers take before and after

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

  // ------------------------------------------------------------------------------------- part 2c: writeSetting (PS)
  const B = await db.platformFirm.findFirstOrThrow({ where: { key: "sample-solo" }, select: { id: true } });
  const setLines = () => db.auditEvent.findMany({ where: { entity: "platform_firm_setting" }, orderBy: { at: "asc" } });
  n = seen.length;
  await writeSetting(db, { firmId: R.firmId, key: CURRENCY.key, value: "USD", by: "seed:pf0a", workspaceId: ws });
  const p1 = (await setLines()).at(-1), d = p1?.detail as Record<string, unknown> | undefined;
  ok("PF-0a PS1 pass: writeSetting's line lands through the port (spy), on the platform's workspace, with its firm, SYSTEM-typed seed word, from and to",
    seen.length === n + 1 && seen.at(-1)?.entity === "platform_firm_setting" && p1?.workspaceId === ws && p1.firmId === R.firmId && p1.actor === "seed:pf0a"
    && d?.from === "CAD" && d?.to === "USD" && d?.firmId === R.firmId && d?.key === CURRENCY.key, { p1, seen: seen.length - n });
  n = seen.length;
  await db.$transaction(async (tx) => { await tx.auditEvent.create({ data: { workspaceId: ws, firmId: R.firmId, actor: "seed:pf0a", action: "platform.setting.change", entity: "platform_firm_setting", entityKey: "pf0a-setting-direct", summary: "x" } }); });
  ok("PF-0a PS1 fail: with the stand-in direct write the spy sees nothing", seen.length === n && !!(await lineOf("pf0a-setting-direct")));

  forceFail = true;
  const sForced = await writeSetting(db, { firmId: R.firmId, key: CURRENCY.key, value: "CAD", by: "seed:pf0a", workspaceId: ws }).then(() => false, () => true);
  forceFail = false;
  ok("PF-0a PS2 pass: a forced audit failure rolls the setting back (still USD)", sForced && (await readSetting(db, R.firmId, CURRENCY.key)) === "USD");

  await writeSetting(db, { firmId: R.firmId, key: LANGUAGE.key, value: "fr", by: "system", workspaceId: ws, reason: "demo reset" });
  const sys = (await setLines()).at(-1);
  await writeSetting(db, { firmId: R.firmId, key: LANGUAGE.key, value: "en", by: "user-R", workspaceId: ws });
  const usr = (await setLines()).at(-1);
  ok("PF-0a PS3 pass: the reset's bare \"system\" is written as system:demo-reset (SYSTEM), and user-R as staff:<their staff id> (FIRM_STAFF)",
    sys?.actor === "system:demo-reset" && sys.actorType === "SYSTEM" && usr?.actor === `staff:${R.id}` && usr.actorType === "FIRM_STAFF", [sys?.actor, usr?.actor]);
  const unknown = await writeSetting(db, { firmId: R.firmId, key: LANGUAGE.key, value: "fr", by: "user-Z", workspaceId: ws }).then(() => false, (e) => e instanceof SettingRefused && /not a known staff member/.test(String((e.getResponse() as { detail?: string }).detail)));
  ok("PF-0a PS3 fail: a Sample id with no staff row (user-Z) or an untyped word (test) is refused, and nothing changes",
    unknown && (await writeSetting(db, { firmId: R.firmId, key: LANGUAGE.key, value: "fr", by: "test", workspaceId: ws }).then(() => false, () => true)) && (await readSetting(db, R.firmId, LANGUAGE.key)) === "en");

  const WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => ({ day, opens: "08:30", closes: "18:15" }));
  await writeSetting(db, { firmId: R.firmId, key: BUSINESS_HOURS.key, value: WEEK, by: "seed:pf0a", workspaceId: ws });
  const bh = (await setLines()).at(-1)?.detail as Record<string, unknown>;
  const toPieces = bh?.toJson as string[] | undefined, fromPieces = bh?.fromJson as string[] | undefined;
  const roundTrip = (det: Record<string, unknown>) => JSON.stringify(joinPieces(det, "to")) === JSON.stringify(WEEK);
  ok(`PF-0a PS4 pass (A1): 7-day business hours (${JSON.stringify(WEEK).length} characters) are kept as ${toPieces?.length} pieces of at most 200 that join back exactly; from (the default) too`,
    Array.isArray(toPieces) && toPieces.length > 1 && toPieces.every((x) => x.length <= 200) && !("to" in bh) && roundTrip(bh)
    && JSON.stringify(joinPieces(bh, "from")) === JSON.stringify(await (async () => BUSINESS_HOURS.default)()) && Array.isArray(fromPieces), bh);
  ok("PF-0a PS4 fail (A1): a stand-in that drops a piece is caught by the same round-trip judge", !(() => { try { return roundTrip({ ...bh, toJson: toPieces!.slice(0, -1) }); } catch { return false; } })());
  ok(`PF-0a PS4 pass (A1, Lead 94's condition): the hours value (${JSON.stringify(WEEK).length} characters) comes back byte for byte`, JSON.stringify(joinPieces(bh, "to")) === JSON.stringify(WEEK) && toPieces!.join("") === JSON.stringify(WEEK));
  const { AuditEntry } = await import("../ports/audit.ts");
  const entryWith = (toJson: string[]) => ({ firmId: R.firmId, actor: "seed:pf0a", action: "platform.setting.change", entity: "platform_firm_setting", entityKey: "k", summary: "s", detail: { toJson } });
  registerSetting({ key: "check.pf0a_long", ownerModule: "check", description: "check only", schema: z.string().max(20_000), default: "", changePermission: "agent/settings:edit" });
  const tooLong = await writeSetting(db, { firmId: R.firmId, key: "check.pf0a_long", value: "y".repeat(10_001), by: "seed:pf0a", workspaceId: ws }).then(() => false, (e) => e instanceof SettingRefused);
  ok("PF-0a PS4 fail (A1, Lead 94's condition): a piece over 200 characters or more than 50 pieces is refused by the strict port, and a value needing more than 50 pieces is refused before any write (nothing stored)",
    !AuditEntry.safeParse(entryWith(["x".repeat(201)])).success && !AuditEntry.safeParse(entryWith(Array.from({ length: 51 }, () => "x"))).success && AuditEntry.safeParse(entryWith(toPieces!)).success
    && tooLong && (await readSetting(db, R.firmId, "check.pf0a_long")) === "");
  const EMOJI = `${"a".repeat(198)}${"📁".repeat(150)}`;
  const emWritten = await writeSetting(db, { firmId: R.firmId, key: "check.pf0a_long", value: EMOJI, by: "seed:pf0a", workspaceId: ws }).then(() => true, () => false);
  const em = (await setLines()).at(-1)?.detail as Record<string, unknown>, emPieces = (em?.toJson ?? []) as string[];
  const whole = (t: string) => !/[\uD800-\uDBFF]$/.test(t) && !/^[\uDC00-\uDFFF]/.test(t);
  ok("PF-0a PS4 pass (review 2c minor 2): a value of characters outside the basic plane is kept as pieces that each end on a whole character, stored and joined back byte for byte",
    emWritten && emPieces.length > 1 && emPieces.every((x) => x.length <= 200 && whole(x)) && joinPieces(em, "to") === EMOJI && (await readSetting(db, R.firmId, "check.pf0a_long")) === EMOJI, emPieces.map((x) => x.length));
  const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-Atc", q], { encoding: "utf8" }).trim();
  ok("PF-0a PS4 pass (A1): the database joins the pieces back to the stored value (check_pf4_identity's trail query)",
    sql(`select count(*) from platform_firm_setting s join audit_event a on a.entity_key = s.firm_id || ':' || s.key where s.key = '${BUSINESS_HOURS.key}' and a.detail ? 'toJson' and (select string_agg(p, '' order by n) from jsonb_array_elements_text(a.detail->'toJson') with ordinality as t(p, n))::jsonb = s.value`) === "1");

  const longReason = `Sample reason ${"x".repeat(400)} end`;
  await writeSetting(db, { firmId: R.firmId, key: CURRENCY.key, value: "CAD", by: "seed:pf0a", workspaceId: ws, reason: longReason });
  const lr = (await setLines()).at(-1);
  ok("PF-0a PS5 pass (A1): a long reason is cut to 200 characters in detail, and the summary keeps it (to 600 characters, as before)",
    ((lr?.detail as Record<string, unknown>)?.reason as string)?.length === 200 && longReason.startsWith((lr?.detail as Record<string, string>).reason) && lr!.summary.includes(longReason.slice(0, 300)), lr?.summary.length);
  ok("PF-0a PS5 fail: the line is never refused for the reason's length (the change committed: currency CAD)", (await readSetting(db, R.firmId, CURRENCY.key)) === "CAD");

  const viewOf = (firmId: string) => db.auditEvent.count({ where: { firmId, entity: "platform_firm_setting", entityKey: `${R.firmId}:${CURRENCY.key}` } });
  ok("PF-0a PS6 pass (R1.88): firm A's setting lines carry firm A's id, so firm A's own audit view (firm_id = A) reads them (USD, then CAD with the long reason)", (await viewOf(R.firmId)) === 2, await viewOf(R.firmId));
  const crossed = await requestScope.run({ correlationId: "pf0a-ps6", firmId: () => B.id }, () => writeSetting(db, { firmId: R.firmId, key: CURRENCY.key, value: "USD", by: "seed:pf0a", workspaceId: ws })).then(() => false, () => true);
  ok("PF-0a PS6 fail (R1.88): firm B's view reads none of them, and firm A's setting written in firm B's request is refused (still CAD)",
    (await viewOf(B.id)) === 0 && crossed && (await readSetting(db, R.firmId, CURRENCY.key)) === "CAD");
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
