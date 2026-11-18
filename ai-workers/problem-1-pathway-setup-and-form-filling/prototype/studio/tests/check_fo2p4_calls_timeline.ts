// FO-2 part 4 (wave 1 Sales sheet, design/lead-b-briefs/wave1-sales.md; contracts §2.1; AG-2-37a, AG-2-26 rule 7; concept
// fo-4-sales r2 BR-6): Log a call, Add a note and the timeline, `FO-2p4 DW1..DW4`, each with a pass and a fail, on one
// scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end. US$0.
//   tsx studio/tests/check_fo2p4_calls_timeline.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAudit } from "../ports/audit.ts";
import { EVENT, TimelineLine } from "../ports/events.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { Activity } from "../api/src/front-office/sales/calls.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { SalesController } from "../api/src/front-office/sales/routes.ts";
import { Timeline } from "../api/src/front-office/sales/timeline.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo2p4_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    if (!x.getStatus) return { status: 0, body: { error: String(e) } };
    return { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> };
  }
}
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-2p4 setup: both Sample firms have their front office", fo.failed.length === 0);

  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), T = ctxOf("user-T"), O = ctxOf("user-O"), SOLO = ctxOf("user-S");
  const ws = await platformAuditWorkspaceId(db as never);
  const seesAll = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "system:test", workspaceId: ws });
  await seesAll(true);

  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports), pros = new Prospects(db, ports), act = new Activity(db, ports), tl = new Timeline(db, leads, pros);
  let n = 0;
  const lead = async (given: string, who: StaffContext = R) => (await leads.add(who, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}@example.com`, source: "Phone call" })) as { id: string; number: string; person: { id: string } };
  const firstResponse = (id: string) => sql(`select coalesce(to_char(first_response_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), '') || '|' || coalesce(first_response_kind::text, '') || '|' || coalesce(first_response_by, '') from fo_lead where id = '${id}'`);

  // ------------------------------------------------------------------------------------- DW1: the first response
  const ana = await lead("Ana");
  const at1 = "2026-11-18T09:15:00.000Z";
  const c1 = await act.logCall(R, { kind: "lead", id: ana.id }, { direction: "OUT", outcome: "NO_ANSWER", when: at1 });
  ok("FO-2p4 DW1 pass: the first logged call sets the lead's first response once: its time (the edited `when`), kind CALL, who",
    c1.firstResponse === true && firstResponse(ana.id) === `2026-11-18T09:15:00|CALL|staff:${R.staffId}` && count("fo_call", `lead_id = '${ana.id}' and outcome = 'NO_ANSWER'`) === 1, firstResponse(ana.id));
  const c2 = await act.logCall(T, { kind: "lead", id: ana.id }, { direction: "IN", outcome: "CONNECTED", seconds: 300, notes: "Wants a study permit." });
  ok("FO-2p4 DW1 fail: a second call does not change the first response", c2.firstResponse === false && firstResponse(ana.id) === `2026-11-18T09:15:00|CALL|staff:${R.staffId}` && count("fo_call", `lead_id = '${ana.id}'`) === 2, firstResponse(ana.id));
  const noWhen = await act.logCall(R, { kind: "lead", id: (await lead("Ben")).id }, { outcome: "BUSY" });
  ok("FO-2p4 DW1 pass: `when` defaults to now and the direction to OUT", noWhen.direction === "OUT" && Math.abs(noWhen.startedAt.getTime() - Date.now()) < 60_000);
  const bob = await lead("Bob");
  const badOutcome = await refusal(() => act.logCall(R, { kind: "lead", id: bob.id }, { outcome: "HUNG_UP" }));
  const future = await refusal(() => act.logCall(R, { kind: "lead", id: bob.id }, { outcome: "CONNECTED", when: new Date(Date.now() + 3_600_000).toISOString() }));
  const badSecs = await refusal(() => act.logCall(R, { kind: "lead", id: bob.id }, { outcome: "CONNECTED", seconds: -5 }));
  ok("FO-2p4 DW1 fail: an outcome not among the seven, a call in the future or negative seconds → 422 at the field; nothing saved, no first response",
    badOutcome?.status === 422 && (badOutcome.body.fields as Record<string, string>)?.outcome !== undefined && future?.status === 422 && badSecs?.status === 422
      && count("fo_call", `lead_id = '${bob.id}'`) === 0 && firstResponse(bob.id) === "||", { badOutcome, future, badSecs });
  const failing = new Activity(db, { ...ports, audit: fakeAudit({ failOn: () => true }) });
  const forced = await refusal(() => failing.logCall(R, { kind: "lead", id: bob.id }, { outcome: "CONNECTED" }));
  ok("FO-2p4 DW1 fail: a forced audit failure rolls the call and the first response back", forced !== null && count("fo_call", `lead_id = '${bob.id}'`) === 0 && firstResponse(bob.id) === "||", forced);
  ok("FO-2p4 DW1 pass: each call has one audit line (typed actor), ids and outcome only", count("audit_event", `entity_key = '${ana.id}' and action = 'call.logged'`) === 2
    && count("audit_event", `entity_key = '${ana.id}' and action = 'call.logged' and actor like 'staff:%' and detail::text like '%Wants a study%'`) === 0);

  // ------------------------------------------------------------------------------------- DW2: a call never moves a stage
  const cleo = await lead("Cleo");
  const p = await pros.engage(R, cleo.id);
  const moves = count("fo_stage_move", `prospect_id = '${p.id}'`);
  const pc = await act.logCall(R, { kind: "prospect", id: p.id }, { outcome: "CONNECTED", when: "2026-11-18T10:00:00Z" });
  const after = await pros.read(R, p.id);
  ok("FO-2p4 DW2 pass: a call on a prospect is saved on the prospect and leaves its stage, version and moves unchanged (AG-2-26 rule 7)",
    count("fo_call", `prospect_id = '${p.id}'`) === 1 && after.stage.key === p.stage.key && after.version === p.version && count("fo_stage_move", `prospect_id = '${p.id}'`) === moves, after);
  ok("FO-2p4 DW2 pass: a prospect's first call is its lead's first response when the lead had none (BR-6: a lead fact)", pc.firstResponse === true && firstResponse(cleo.id).startsWith("2026-11-18T10:00:00|CALL"));
  await act.logCall(R, { kind: "prospect", id: p.id }, { outcome: "BUSY" });
  ok("FO-2p4 DW2 fail: a second call on the prospect moves nothing and keeps the first response", count("fo_stage_move", `prospect_id = '${p.id}'`) === moves && firstResponse(cleo.id).startsWith("2026-11-18T10:00:00|CALL") && (await pros.read(R, p.id)).stage.key === p.stage.key);

  // ------------------------------------------------------------------------------------- DW3: the timeline
  const dan = await lead("Dan");
  sql(`update fo_lead set owner_staff_id = null where id = '${dan.id}'`);
  await leads.take(T, dan.id);
  await act.logCall(T, { kind: "lead", id: dan.id }, { outcome: "LEFT_VOICEMAIL" });
  const note = await act.addNote(T, { kind: "lead", id: dan.id }, { text: "Prefers email after 6 pm." });
  const t = await tl.lead(R, dan.id);
  const kinds = t.lines.map((l) => `${l.kind}:${l.type}`);
  ok("FO-2p4 DW3 pass: the lead's timeline lists its arrival, the take, the call and the note, oldest first",
    JSON.stringify(kinds) === JSON.stringify([`AUDIT:${EVENT.LEAD_CREATED}`, `AUDIT:${EVENT.LEAD_TAKEN}`, "CALL:call", "NOTE:note"]) && t.more === false, kinds);
  ok("FO-2p4 DW3 pass: every line is the one shared shape (ports/events.ts TimelineLine), in time order, naming who",
    t.lines.every((l) => TimelineLine.safeParse(l).success) && t.lines.every((l, i, a) => i === 0 || a[i - 1].at <= l.at)
      && t.lines.find((l) => l.kind === "CALL")?.summary === "Outgoing call: left a voicemail" && t.lines.find((l) => l.kind === "NOTE")?.summary === "Prefers email after 6 pm."
      && t.lines.filter((l) => l.kind !== "AUDIT" || l.type === EVENT.LEAD_TAKEN).every((l) => l.actorName !== null), t.lines);
  ok("FO-2p4 DW3 fail: no line twice: an event with its own audit line and a call's or note's audit line are not repeated",
    !t.lines.some((l) => l.kind === "EVENT") && !t.lines.some((l) => l.type === "call.logged" || l.type === "note.added") && count("module_event", `subject_id = '${dan.id}'`) >= 2);
  const pt = await tl.prospect(R, p.id);
  // The first prospect call was logged as made at 10:00 UTC (an edited `when`), so it sits by that time, before the Engage line.
  ok("FO-2p4 DW3 pass: the prospect's timeline lists its engage and its two calls, each by when it happened", pt.lines.map((l) => l.kind === "AUDIT" ? l.type : l.kind).sort().join() === ["CALL", "CALL", EVENT.LEAD_ENGAGED].sort().join()
    && pt.lines[0].kind === "CALL" && pt.lines[0].at === "2026-11-18T10:00:00.000Z" && pt.lines.every((l, i, a) => i === 0 || a[i - 1].at <= l.at), pt.lines.map((l) => `${l.kind}:${l.type}@${l.at}`));
  const emptyNote = await refusal(() => act.addNote(R, { kind: "lead", id: dan.id }, { text: "   " }));
  const clientNote = await refusal(() => act.addNote(R, { kind: "lead", id: dan.id }, { text: "Hello", visibility: "CLIENT_VISIBLE" }));
  ok("FO-2p4 DW3 fail: an empty note, or one marked for the client, → 422; nothing saved", emptyNote?.status === 422 && clientNote?.status === 422 && count("fo_note", `lead_id = '${dan.id}'`) === 1, { emptyNote, clientNote });
  ok("FO-2p4 DW3 pass: a note is INTERNAL and its audit line carries no words", note.visibility === "INTERNAL" && count("audit_event", `action = 'note.added' and entity_key = '${dan.id}' and summary not like '%6 pm%' and detail::text not like '%6 pm%'`) === 1);

  // ------------------------------------------------------------------------------------- DW4: firms and visibility
  const fromB = await Promise.all([
    refusal(() => act.logCall(SOLO, { kind: "lead", id: dan.id }, { outcome: "CONNECTED" })),
    refusal(() => act.addNote(SOLO, { kind: "lead", id: dan.id }, { text: "Not mine" })),
    refusal(() => tl.lead(SOLO, dan.id)), refusal(() => tl.prospect(SOLO, p.id)),
    refusal(() => act.logCall(SOLO, { kind: "prospect", id: p.id }, { outcome: "CONNECTED" })),
  ]);
  ok("FO-2p4 DW4 fail: another firm's lead or prospect → 404 for calls, notes and the timeline; nothing written",
    fromB.every((x) => x?.status === 404) && count("fo_call", `lead_id = '${dan.id}'`) === 1 && count("fo_note", `lead_id = '${dan.id}'`) === 1, fromB.map((x) => x?.status));
  await seesAll(false);
  const ownOnly = await Promise.all([refusal(() => tl.lead(O, dan.id)), refusal(() => act.logCall(O, { kind: "lead", id: dan.id }, { outcome: "BUSY" })), refusal(() => tl.prospect(O, p.id))]);
  const own = await tl.lead(T, dan.id);
  await seesAll(true);
  ok("FO-2p4 DW4 fail: with \"everyone sees all\" off, another person's lead or prospect → 404 (the read's answer)", ownOnly.every((x) => x?.status === 404), ownOnly.map((x) => x?.status));
  ok("FO-2p4 DW4 pass: the owner still reads their own lead's timeline", own.lines.length === 4);
  const bad = await refusal(() => tl.lead(R, "not-a-uuid"));
  ok("FO-2p4 DW4 fail: an id that is not one → 404", bad?.status === 404, bad);

  // ------------------------------------------------------------------------------------- the routes' keys
  const keysOf = (m: string) => (Reflect.getMetadata(PLATFORM_ACCESS, (SalesController.prototype as unknown as Record<string, object>)[m]) as { keys?: string[] } | undefined)?.keys?.join(",");
  const want: Record<string, string> = { leadCall: "agent/prospect:log-call", prospectCall: "agent/prospect:log-call", leadNote: "agent/prospect:edit", prospectNote: "agent/prospect:edit", leadTimeline: "agent/prospect:show", prospectTimeline: "agent/prospect:show" };
  ok("FO-2p4 pass: every new route declares its seeded agent/prospect:* key", Object.entries(want).every(([k, v]) => keysOf(k) === v), Object.keys(want).map((k) => `${k}=${keysOf(k)}`));
  const readOnly = sql(`select string_agg(permission_key, ',') from platform_role_permission where role = 'READ_ONLY'`).split(",");
  ok("FO-2p4 fail: a Read-only person may read a timeline but not log a call or add a note (403 at the guard)", ["leadCall", "prospectCall", "leadNote", "prospectNote"].every((k) => !readOnly.includes(keysOf(k)!)) && readOnly.includes("agent/prospect:show"));
} catch (e) {
  fail++;
  console.log(`FAIL  FO-2p4: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-2p4 calls, notes and the timeline: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
