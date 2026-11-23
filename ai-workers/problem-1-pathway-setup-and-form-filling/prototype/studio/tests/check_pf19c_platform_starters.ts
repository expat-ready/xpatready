// PF-19c part 2 (R1.46; AG-12-44, -45; SA-05 Appendix A.1 #1 to #3; Lead 1's ruling on #3179, 23 Nov): ExpatReady's three
// lead starters are PLATFORM template rows (migration 20261123030000_pf19c_platform_starters), so a firm that never edits
// one still sends it, and a firm's own published version wins once there is one. Each line has a pass and a fail. One
// scratch database with every migration and the Sample firms; the local email adapter on a fake clock. No server, no
// browser, no model call, nothing leaves the machine (US$0). The database and folder are removed at the end.
//   tsx studio/tests/check_pf19c_platform_starters.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Db } from "../api/src/core.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { PlatformInbox } from "../api/src/platform/messages/demo-inbox.ts";
import { localEmail } from "../api/src/platform/messages/channels/email/local.ts";
import { channelsOf } from "../api/src/platform/messages/send/channels.ts";
import { Messages } from "../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { fakeAlerts } from "../ports/alert.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import type { MessageSend } from "../ports/messages.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), SEED = "20261123030000_pf19c_platform_starters";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf19c_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `pf19c-check-${process.pid}`);
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const psql = (...a: string[]) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql("-Atc", q);
const fails = (q: string) => { try { sql(q); return false; } catch { return true; } };
const uuid = () => crypto.randomUUID(), box = (w: string) => `pf19c.${w}.${uuid().slice(0, 6)}@example.com`;
const KEYS = ["lead.acknowledgement", "lead.follow_up", "lead.going_cold"];

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) psql("-f", join(MIG, d, "migration.sql"));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
try {
  await seedSampleFirms(db);
  const firmA = sql(`select id from platform_firm where key='sample-firm'`), firmB = sql(`select id from platform_firm where key='sample-solo'`);
  const platformRows = () => sql(`select t.key || '|' || t.kind || '|' || v.version || '|' || v.published_by from msg_template t join msg_template_version v on v.template_id = t.id
    where t.owner = 'PLATFORM' and t.firm_id is null and v.firm_id is null and t.channel = 'EMAIL' and t.language = 'en' and t.key like 'lead.%' order by t.key`).split("\n");
  const rows = platformRows();
  ok("PF-19c part 2 pass: the three lead starters are PLATFORM email rows in English, version 1 each, kind automatic or library, published by seed:sa05-a1",
    JSON.stringify(rows) === JSON.stringify(["lead.acknowledgement|automatic|1|seed:sa05-a1", "lead.follow_up|library|1|seed:sa05-a1", "lead.going_cold|library|1|seed:sa05-a1"]), rows);
  psql("-f", join(MIG, SEED, "migration.sql"));
  ok("PF-19c part 2 fail: running the migration again adds no second template or version", JSON.stringify(platformRows()) === JSON.stringify(rows), platformRows());
  const fields = new Set(sql(`select string_agg(v.subject || ' ' || v.body, ' ') from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id is null and t.key like 'lead.%'`).match(/\{\{[^{}]*\}\}/g)?.map((f) => f.slice(2, -2).trim()));
  ok("PF-19c part 2: the starters use only the lead's fields (AG-12-70) and never a passport or financial field (SA-5-63)",
    [...fields].sort().join(",") === "firm_name,lead_first_name,lead_number,owner_name", [...fields]);
  ok("PF-19c part 2 fail: a platform version never changes or goes (write-once trigger)",
    fails(`update msg_template_version set body = 'x' where firm_id is null and version = 1`) && fails(`delete from msg_template_version where firm_id is null`));

  // ------------------------------------------------------------------------------------------- the send path
  for (const f of [firmA, firmB]) await db.msgFirm.upsert({ where: { firmId: f }, create: { firmId: f }, update: {} });
  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock), alerts = fakeAlerts(), files = new LocalFiles(join(WORK, "files"));
  const messages = new Messages({ db, consent: new ConsentStore(auditEvent, clock), files, jobs, alerts: () => alerts, channels: channelsOf([["EMAIL", localEmail]]), clock });
  await messages.register();
  const inbox = new PlatformInbox(db as unknown as Db, files, () => true);
  const values = { lead_first_name: "Amira", lead_number: "L-0042", owner_name: "Jordan Lee", firm_name: "Maple Immigration" };
  const send = async (firmId: string, to: string, templateKey: string, v: Record<string, string> = values) => {
    const m: MessageSend = { firmId, channel: "EMAIL", class: "SERVICE", person: { kind: "FO_PERSON", id: uuid() }, address: to, content: { templateKey, language: "en", values: v }, idempotencyKey: uuid() };
    const r = await db.$transaction((t) => messages.send(t, m));
    await messages.dispatch(firmId, [r.outboxId]); await jobs.runDue();
    return db.msgOutbox.findUniqueOrThrow({ where: { id: r.outboxId } });
  };
  const sent: Record<string, { subject: string; body: string }> = {};
  for (const k of KEYS) { const to = box(k.replace(/\W/g, "")); await send(firmA, to, k); sent[k] = (await inbox.list(to, undefined)).messages[0]; }
  const platformFollowUp = sql(`select v.id from msg_template_version v join msg_template t on t.id = v.template_id where t.firm_id is null and t.key = 'lead.follow_up'`);
  const x1 = box("platform"), r1 = await send(firmB, x1, "lead.follow_up");
  ok("PF-19c part 2 pass: a firm that never edited a starter sends each one, filled (AG-12-44), from the platform's version",
    KEYS.every((k) => sent[k]?.subject && !sent[k].body.includes("{{")) && sent["lead.acknowledgement"].subject === "Thank you for contacting Maple Immigration"
    && sent["lead.follow_up"].body.startsWith("Dear Amira,") && r1.templateVersionId === platformFollowUp, { sent, r1: r1.templateVersionId });
  const refused = await db.$transaction((t) => messages.send(t, { firmId: firmA, channel: "EMAIL", class: "SERVICE", person: { kind: "FO_PERSON", id: uuid() }, address: box("nofield"), content: { templateKey: "lead.follow_up", language: "en", values: { lead_first_name: "A" } }, idempotencyKey: uuid() })).then(() => "", (e: Error) => e.message);
  ok("PF-19c part 2 fail: a send without a value the starter needs is refused, naming the field (nothing half-filled is sent)", /needs the field "(firm_name|owner_name)"/.test(refused), refused);

  const own = await db.msgTemplate.create({ data: { firmId: firmA, owner: "FIRM", key: "lead.follow_up", kind: "library", channel: "EMAIL", language: "en" } });
  const ownV = await db.msgTemplateVersion.create({ data: { firmId: firmA, templateId: own.id, version: 1, subject: "Checking in, {{ lead_first_name }}", body: "Hello {{ lead_first_name }}, from {{ firm_name }}.", publishedBy: "seed:pf19c" } });
  const x2 = box("firm"), r2 = await send(firmA, x2, "lead.follow_up"), x3 = box("other"), r3 = await send(firmB, x3, "lead.follow_up");
  ok("PF-19c part 2 pass: once a firm publishes its own version, its sends use it (AG-12-45); fail: another firm still gets the platform's",
    r2.templateVersionId === ownV.id && (await inbox.list(x2, undefined)).messages[0]?.subject === "Checking in, Amira" && r3.templateVersionId === platformFollowUp, { r2: r2.templateVersionId, r3: r3.templateVersionId });
} finally {
  await db.$disconnect().catch(() => undefined);
  spawnSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
