// FO-10 part 1 (BACKLOG row FO-10; P-574 (3); AG-2-13a, -13b, -13d; R1.32): the firm's assignment rules for new leads.
// A lead from each door follows its rule or lands in Unassigned; round robin takes fair turns under parallel arrivals
// and skips anyone not active; a service rule beats a door rule; a rule naming an inactive person leaves the lead
// Unassigned with the reason on its timeline; Take it and Assign on a rule-placed lead write who and when; a person
// without the key cannot keep rules or reassign. Each with a pass and a fail, on one scratch database (every migration,
// PF-3's and FO-1a's Sample seeds), dropped at the end. US$0.
//   tsx studio/tests/check_fo10_assignment.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAudit } from "../ports/audit.ts";
import { AssignmentRules } from "../api/src/front-office/assignment/rules.ts";
import { AssignmentRulesController } from "../api/src/front-office/assignment/routes.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { arrive } from "../api/src/front-office/sales/arrival.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { SalesController } from "../api/src/front-office/sales/routes.ts";
import { Timeline } from "../api/src/front-office/sales/timeline.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { assertEveryRouteDeclared } from "../api/src/platform/identity/guard.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo10_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    if (!x.getStatus) throw e;
    return { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> };
  }
}

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-10 setup: both Sample firms have a front office", fo.results.length === 2 && fo.failed.length === 0, fo);

  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), S = firm("sample-solo");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), O = ctxOf("user-O"), T = ctxOf("user-T"), SOLO = ctxOf("user-S");
  const addStaff = (name: string, role: string, status = "ACTIVE", f = A) => { const id = sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${f}', '${name.toLowerCase()}@fo10.example.com', '${name} (Sample)', '${status}', now()) returning id`); sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${f}', '${id}', '${role}', 'seed:FO-10-test')`); return id; };
  const addStaffGrant = (id: string, role: string) => sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:FO-10-test')`);
  // Firm A gets a second solo-like staff member in firm S, so firm S is no one-user firm (X-4 would place every lead).
  const S2 = addStaff("Helper", "CASE_OFFICER", "ACTIVE", S);

  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), now: () => Date.now(), publicOrigin: "http://localhost:4400", formKey: Buffer.from("fo10-test (Sample, not a secret)") };
  const rules = new AssignmentRules(db, ports), leads = new Leads(db, ports), timeline = new Timeline(db, leads, new Prospects(db, ports));
  const webForm = (f: string) => sql(`select id from fo_web_form where firm_id = '${f}' limit 1`);
  const service = sql(`insert into fo_service (firm_id, label, sort_order, created_by) values ('${A}', 'Study permit (Sample)', 1, 'seed:FO-10-test') returning id`);
  const serviceS = sql(`insert into fo_service (firm_id, label, sort_order, created_by) values ('${S}', 'Visitor visa (Sample)', 1, 'seed:FO-10-test') returning id`);
  let n = 0;
  /** One arrival by a door through the one arrival path every door uses (sales/arrival.ts). */
  const arrival = (door: "WEB_FORM" | "BOOKING", o: { firmId?: string; serviceId?: string | null; audit?: SalesPorts["audit"] } = {}) => {
    const f = o.firmId ?? A, i = n++, key = door === "WEB_FORM" ? `form:${webForm(f)}:${randomUUID()}` : `booking:${randomUUID()}`;
    return db.$transaction((tx) => arrive(tx, { firmId: f, door, intakeKey: key, ...(door === "WEB_FORM" ? { webFormId: webForm(f) } : {}), person: { givenNames: `Person${i}`, familyName: "Sample", email: `p${i}@fo10.example.org`, phone: null }, source: door === "WEB_FORM" ? "WEBSITE" : "BOOKING", interestedInServiceId: o.serviceId ?? null, actor: "system:fo10-test", payloadHash: String(i) }, { audit: o.audit ?? ports.audit, consent: ports.consent }), { timeout: 30_000 });
  };
  const ownerOf = (leadId: string | null) => sql(`select coalesce(owner_staff_id::text, 'none') from fo_lead where id = '${leadId}'`);
  const createdLine = (leadId: string | null) => sql(`select summary || '|' || coalesce(detail->>'assignmentRuleId', '') || '|' || coalesce(detail->>'assignmentFallback', '') from audit_event where entity = 'fo_lead' and entity_key = '${leadId}' and action = 'lead.created'`);

  // ------------------------------------------------------------------------------------------- import order (merge batch #2500)
  const loadsFirst = (file: string) => { try { return execFileSync(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, "tests", "lib", "load-first.ts"), join(STUDIO, file)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().endsWith("loaded"); } catch { return false; } };
  ok("FO-10 fail (batch #2500): loading the public door or the person edit first never meets an import cycle (SALES_PORTS uninitialised)", loadsFirst("api/src/front-office/sales/public.ts") && loadsFirst("api/src/front-office/people/edit.ts") && loadsFirst("api/src/features/front-office-sales.ts"));

  // ------------------------------------------------------------------------------------------- no rule: Unassigned
  const bare = await arrival("WEB_FORM"), bareB = await arrival("BOOKING");
  ok("FO-10 fail: with no rule, a web-form lead and a booking lead land in Unassigned leads, and the audit line names no rule", ownerOf(bare.leadId) === "none" && ownerOf(bareB.leadId) === "none" && createdLine(bare.leadId).endsWith("||"), createdLine(bare.leadId));
  ok("FO-10 pass: an Unassigned lead is in the Unassigned list", (await leads.list(R, "unassigned")).some((l) => (l as { id: string }).id === bare.leadId));

  // ------------------------------------------------------------------------------------------- keeping the rules
  const keysOf = (C: object, m: string) => (Reflect.getMetadata(PLATFORM_ACCESS, (C as unknown as Record<string, object>)[m]) as { keys?: string[] } | undefined)?.keys?.join(",");
  ok("FO-10 pass: list, save and switch off declare agent/prospect:configure-source, held by Owner and Admin", ["list", "save", "off"].every((m) => keysOf(AssignmentRulesController.prototype, m) === "agent/prospect:configure-source") && R.keys.includes("agent/prospect:configure-source") && sql(`select string_agg(role::text, ',' order by role) from platform_role_permission where permission_key = 'agent/prospect:configure-source'`) === "OWNER,ADMIN");
  ok("FO-10 fail: a Case Officer and a Case Manager without Owner hold no key to keep rules (403 at the guard)", !O.keys.includes("agent/prospect:configure-source") && !T.keys.includes("agent/prospect:configure-source"));
  const routes = ([["list", "GET", ""], ["save", "POST", ""], ["off", "POST", "/:id/off"]] as const).map(([m, method, tail]) => ({ name: `AssignmentRulesController.${m}`, method, path: `/api/front-office/assignment-rules${tail}`, access: Reflect.getMetadata(PLATFORM_ACCESS, (AssignmentRulesController.prototype as unknown as Record<string, object>)[m]) }));
  ok("FO-10 pass: PF-4's start-up rule accepts every rule route", (() => { try { assertEveryRouteDeclared(routes); return true; } catch { return false; } })());
  ok("FO-10 fail: a rule for leads added by hand → refused at the field (the adder owns them, AG-2-4 rule 8)", (await refusal(() => rules.save(R, { door: "MANUAL", strategy: "ROUND_ROBIN" })))?.status === 422);
  const away = addStaff("Away", "CASE_MANAGER", "SUSPENDED"), viewer = addStaff("Viewer", "READ_ONLY");
  ok("FO-10 fail: one person who is suspended → refused at the field", (await refusal(() => rules.save(R, { door: "WEB_FORM", strategy: "OWNER", ownerStaffId: away })))?.status === 422);
  ok("FO-10 fail: a turn naming a Read-only person (no sales key) or someone of another firm → refused at the field", (await refusal(() => rules.save(R, { door: "WEB_FORM", strategy: "ROUND_ROBIN", eligibleStaffIds: [O.staffId, viewer] })))?.status === 422 && (await refusal(() => rules.save(R, { door: "WEB_FORM", strategy: "ROUND_ROBIN", eligibleStaffIds: [O.staffId, SOLO.staffId] })))?.status === 422);
  ok("FO-10 fail: another firm's service → refused at the field", (await refusal(() => rules.save(R, { serviceId: serviceS, strategy: "OWNER", ownerStaffId: T.staffId })))?.status === 422);
  ok("FO-10 fail: the database refuses an owner of another firm and an OWNER rule with a turn", (await db.$executeRawUnsafe(`insert into fo_assignment_rule (firm_id, criteria_key, strategy, owner_staff_id, created_by, updated_by) values ('${A}', 'ANY:ANY', 'OWNER', '${SOLO.staffId}', 'x', 'x')`).then(() => false, () => true)) && (await db.$executeRawUnsafe(`insert into fo_assignment_rule (firm_id, criteria_key, strategy, owner_staff_id, eligible_staff_ids, created_by, updated_by) values ('${A}', 'ANY:ANY', 'OWNER', '${T.staffId}', '{${O.staffId}}', 'x', 'x')`).then(() => false, () => true)));

  // ------------------------------------------------------------------------------------------- round robin
  const trio = [R.staffId, O.staffId, T.staffId].sort();
  const rr = await rules.save(R, { door: "WEB_FORM", strategy: "ROUND_ROBIN", eligibleStaffIds: [T.staffId, O.staffId, R.staffId] });
  ok("FO-10 pass: saving a rule writes one audit line, with its values after and none before (R1.8)", sql(`select count(*) from audit_event where entity = 'fo_assignment_rule' and entity_key = '${rr.id}' and action = 'assignment_rule.saved'`) === "1" && sql(`select (detail->>'strategy_after') || '|' || coalesce(detail->>'strategy_before', 'none') from audit_event where entity = 'fo_assignment_rule' and entity_key = '${rr.id}' and action = 'assignment_rule.saved'`) === "ROUND_ROBIN|none");
  const three = [await arrival("WEB_FORM"), await arrival("WEB_FORM"), await arrival("WEB_FORM")].map((x) => ownerOf(x.leadId));
  ok("FO-10 pass: three leads from the web form go to three people in turn", JSON.stringify(three) === JSON.stringify(trio), three);
  ok("FO-10 pass: the lead's audit line names the rule and round robin; the timeline shows it", createdLine((await arrival("WEB_FORM")).leadId).includes(`by round robin.|${rr.id}|`));
  const viaB = await arrival("BOOKING");
  ok("FO-10 fail: the web-form rule does not place a booking lead (it stays Unassigned)", ownerOf(viaB.leadId) === "none");

  const before = sql(`select last_staff_id from fo_assignment_rule where id = '${rr.id}'`);
  const parallel = await Promise.all(Array.from({ length: 20 }, () => arrival("WEB_FORM")));
  const tally = trio.map((s) => parallel.filter((x) => ownerOf(x.leadId) === s).length);
  ok("FO-10 pass: 20 parallel arrivals give each of three people 6 or 7, never 9", tally.every((c) => c === 6 || c === 7) && tally.reduce((a, b) => a + b, 0) === 20, tally);
  ok("FO-10 pass (AG-2-13d): the cursor is persisted on the rule and moved by the arrivals", sql(`select last_staff_id from fo_assignment_rule where id = '${rr.id}'`) !== before);

  const cursor = sql(`select last_staff_id from fo_assignment_rule where id = '${rr.id}'`);
  const failing = fakeAudit({ failOn: (e) => e.action === "lead.created" });
  const rolled = await arrival("WEB_FORM", { audit: failing as never }).then(() => null, (e) => String(e));
  ok("FO-10 fail: a forced audit failure rolls the arrival back and the cursor with it (no turn lost)", rolled !== null && sql(`select last_staff_id from fo_assignment_rule where id = '${rr.id}'`) === cursor, rolled);

  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${O.staffId}'`);
  const after: string[] = [];
  for (let i = 0; i < 4; i++) after.push(ownerOf((await arrival("WEB_FORM")).leadId));
  ok("FO-10 fail: a deactivated person is skipped; the others alternate", !after.includes(O.staffId) && after.every((x) => x === R.staffId || x === T.staffId) && after[0] !== after[1], after);
  addStaff("Spare", "CASE_OFFICER");   // keeps firm A from being a one-user firm (X-4) while the turn's three are away
  sql(`update platform_staff set status = 'SUSPENDED' where id in ('${R.staffId}', '${T.staffId}')`);
  const nobody = await arrival("WEB_FORM");
  ok("FO-10 fail: nobody in the turn active → Unassigned, the audit line says why", ownerOf(nobody.leadId) === "none" && createdLine(nobody.leadId).endsWith(`|${rr.id}|NO_ELIGIBLE`), createdLine(nobody.leadId));
  sql(`update platform_staff set status = 'ACTIVE' where id in ('${O.staffId}', '${R.staffId}', '${T.staffId}')`);

  // ------------------------------------------------------------------------------------------- specific beats general
  const byService = await rules.save(R, { serviceId: service, strategy: "OWNER", ownerStaffId: T.staffId });
  const forService = await arrival("WEB_FORM", { serviceId: service }), forServiceB = await arrival("BOOKING", { serviceId: service });
  ok("FO-10 pass: a program/service rule beats the web-form rule, on every door", ownerOf(forService.leadId) === T.staffId && ownerOf(forServiceB.leadId) === T.staffId && createdLine(forService.leadId).includes(`default owner rule.|${byService.id}|`));
  const noService = await arrival("WEB_FORM");
  ok("FO-10 fail: a lead with no service is not placed by the service rule (the web-form turn places it)", trio.includes(ownerOf(noService.leadId)) && createdLine(noService.leadId).includes(`|${rr.id}|`));
  const replaced = await rules.save(R, { door: "WEB_FORM", strategy: "ROUND_ROBIN" });
  ok("FO-10 pass: saving the same criteria again replaces the rule (one row, the cursor kept); an empty turn means everyone active with the key", replaced.id === rr.id && sql(`select count(*) from fo_assignment_rule where firm_id = '${A}' and criteria_key = 'WEB_FORM:ANY'`) === "1" && sql(`select coalesce(last_staff_id::text, 'none') from fo_assignment_rule where id = '${rr.id}'`) !== "none");
  const everyone = sql(`select string_agg(s.id::text, ',' order by s.id) from platform_staff s where s.firm_id = '${A}' and s.status = 'ACTIVE' and exists (select 1 from platform_role_grant g join platform_role_permission rp on rp.role = g.role where g.staff_id = s.id and rp.permission_key = 'agent/prospect:edit')`).split(",");
  const wide = await Promise.all(everyone.map(async () => ownerOf((await arrival("WEB_FORM")).leadId)));
  ok("FO-10 fail: the Read-only person is never in the open turn; each active sales person gets one", !wide.includes(viewer) && new Set(wide).size === everyone.length, [wide, everyone]);

  // ------------------------------------------------------------------------------------------- inactive owner
  const bookingRule = await rules.save(R, { door: "BOOKING", strategy: "OWNER", ownerStaffId: O.staffId });
  ok("FO-10 pass: a booking lead follows the booking rule", ownerOf((await arrival("BOOKING")).leadId) === O.staffId);
  sql(`update platform_staff set status = 'SUSPENDED' where id = '${O.staffId}'`);
  const orphan = await arrival("BOOKING");
  ok("FO-10 fail: a rule naming a person no longer active → Unassigned, and the timeline says the rule's person is not active", ownerOf(orphan.leadId) === "none" && createdLine(orphan.leadId).endsWith(`|${bookingRule.id}|OWNER_INACTIVE`));
  const items = (await timeline.lead(R, orphan.leadId!)).lines;
  ok("FO-10 pass: the lead's timeline shows the rule's line", items.some((l) => l.summary?.includes("the rule's person is not active or cannot work leads")), items);
  sql(`update platform_staff set status = 'ACTIVE' where id = '${O.staffId}'`);
  await rules.off(R, bookingRule.id);
  ok("FO-10 fail: a rule switched off places nothing (Unassigned again); its row stays", ownerOf((await arrival("BOOKING")).leadId) === "none" && sql(`select active from fo_assignment_rule where id = '${bookingRule.id}'`) === "f");

  // ------------------------------------------------------------------------------------------- who can work leads (break M1, M2, m4)
  ok("FO-10 fail (break M2): one person who cannot work leads (Read-only) → refused at the field", (await refusal(() => rules.save(R, { door: "BOOKING", strategy: "OWNER", ownerStaffId: viewer })))?.status === 422);
  ok("FO-10 fail (break m4): a field the strategy does not use → refused, never dropped silently", (await refusal(() => rules.save(R, { door: "BOOKING", strategy: "ROUND_ROBIN", ownerStaffId: SOLO.staffId })))?.status === 422 && (await refusal(() => rules.save(R, { door: "BOOKING", strategy: "OWNER", ownerStaffId: O.staffId, eligibleStaffIds: [SOLO.staffId] })))?.status === 422);
  const ender = addStaff("Ender", "CASE_MANAGER");
  const enderRule = await rules.save(R, { door: "BOOKING", strategy: "OWNER", ownerStaffId: ender });
  ok("FO-10 pass: a booking lead goes to the rule's person while they hold a sales role", ownerOf((await arrival("BOOKING")).leadId) === ender);
  sql(`update platform_role_grant set ended_at = now(), ended_by = 'seed:FO-10-test', end_reason = 'role changed' where staff_id = '${ender}'`);
  addStaffGrant(ender, "READ_ONLY");
  const endedLead = await arrival("BOOKING");
  ok("FO-10 fail (break M2): the rule's person whose sales role was ended → Unassigned with the reason, never a lead nobody sees", ownerOf(endedLead.leadId) === "none" && createdLine(endedLead.leadId).endsWith(`|${enderRule.id}|OWNER_INACTIVE`), createdLine(endedLead.leadId));
  ok("FO-10 fail (break M1): a turn naming someone whose sales role was ended → refused at the field", (await refusal(() => rules.save(R, { door: "BOOKING", strategy: "ROUND_ROBIN", eligibleStaffIds: [ender, T.staffId] })))?.status === 422);
  const open2: string[] = [];
  for (let i = 0; i < everyone.length + 1; i++) open2.push(ownerOf((await arrival("WEB_FORM")).leadId));
  ok("FO-10 fail (break M1): the open turn never gives a lead to someone whose sales role was ended", !open2.includes(ender) && open2.every((x) => x !== "none"), open2);
  await rules.off(R, enderRule.id);

  // ------------------------------------------------------------------------------------------- by hand, firms
  const added = await leads.add(T, { requestId: randomUUID(), givenNames: "Hand", email: "hand@fo10.example.org", source: "Phone call", interestedIn: service }) as { id?: string; ownerStaffId?: string };
  ok("FO-10 fail: a lead added by hand belongs to its adder, whatever the rules say", added.ownerStaffId === T.staffId, added);
  const inS = await arrival("WEB_FORM", { firmId: S });
  ok("FO-10 fail: firm A's rules never place firm B's leads", ownerOf(inS.leadId) === "none");
  ok("FO-10 fail: firm B cannot see or switch off firm A's rule (404), and lists only its own", (await refusal(() => rules.off(SOLO, rr.id)))?.status === 404 && (await rules.list(SOLO)).length === 0 && (await rules.list(R)).length === 3 && (await rules.list(R)).every((r) => r.serviceActive !== false));
  void S2;

  // ------------------------------------------------------------------------------------------- take and reassign
  const placed = (await arrival("WEB_FORM", { serviceId: service })).leadId!;   // placed on T by the service rule
  const lost = await refusal(() => leads.take(O, placed));
  ok("FO-10 fail: Take it on a rule-placed lead by someone else → refused (409 naming the owner, or 404 when they may not see it)", lost?.status === 409 || lost?.status === 404, lost);
  await leads.assign(R, placed, { staffId: O.staffId, expectedOwnerStaffId: T.staffId });
  const moved = sql(`select actor || '|' || (detail->>'previousOwnerStaffId') || '|' || (detail->>'ownerStaffId') || '|' || (at is not null)::text from audit_event where entity = 'fo_lead' and entity_key = '${placed}' and action = 'lead.taken' order by at desc limit 1`);
  ok("FO-10 pass: reassigning a rule-placed lead stores who and when (actor, previous and new owner, time) on an audit line", ownerOf(placed) === O.staffId && moved === `staff:${R.staffId}|${T.staffId}|${O.staffId}|true`, moved);
  ok("FO-10 fail: a person without agent/prospect:assign cannot reassign (the route needs the key; a Case Officer lacks it)", keysOf(SalesController.prototype, "assign") === "agent/prospect:assign" && !O.keys.includes("agent/prospect:assign") && R.keys.includes("agent/prospect:assign"));
  const free = (await arrival("BOOKING")).leadId!;
  await leads.take(O, free);
  ok("FO-10 pass: Take it on an Unassigned lead stores who and when", sql(`select actor || '|' || (detail->>'fromUnassigned') from audit_event where entity = 'fo_lead' and entity_key = '${free}' and action = 'lead.taken'`) === `staff:${O.staffId}|true`);
} catch (e) {
  fail++;
  console.log(`FAIL  FO-10: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-10 assignment rules: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
