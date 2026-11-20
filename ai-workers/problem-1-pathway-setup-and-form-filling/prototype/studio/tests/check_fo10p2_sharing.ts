// FO-10 part 2 (P-773 "Both": P-574's rules stay, AG-02 v2.6's AG-2-85 joins them): round robin gives the next lead to
// the person given one least recently (rule 5); a possible match is placed by no rule and moves no turn (rule 10); a lead
// born from a booking is its host's whatever any rule says (rule 1(b)), and a host no longer active gives no owner (rule
// 18); the firm's "How new leads are shared" (rule 3) is its catch-all rule, below door and service rules, changed with
// agent/firm-capability:manage. Each with a pass and a fail, on one scratch database (every migration, PF-3's and
// FO-1a's Sample seeds), dropped at the end. US$0.
//   tsx studio/tests/check_fo10p2_sharing.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { AssignmentRules } from "../api/src/front-office/assignment/rules.ts";
import { LeadSharingController } from "../api/src/front-office/assignment/routes.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { arrive } from "../api/src/front-office/sales/arrival.ts";
import { PrismaArrival } from "../api/src/front-office/sales/arrival-port.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { assertEveryRouteDeclared } from "../api/src/platform/identity/guard.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo10p2_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

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
  ok("FO-10p2 setup: both Sample firms have a front office", fo.results.length === 2 && fo.failed.length === 0, fo);

  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}' and ended_at is null`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: "sample-firm", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), O = ctxOf("user-O"), T = ctxOf("user-T");
  const addStaff = (name: string, role: string, status = "ACTIVE") => { const id = sql(`insert into platform_staff (id, firm_id, email, display_name, status, updated_at) values (gen_random_uuid(), '${A}', '${name.toLowerCase()}@fo10p2.example.com', '${name} (Sample)', '${status}', now()) returning id`); sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:FO-10p2-test')`); return id; };
  const status = (id: string, s: string) => sql(`update platform_staff set status = '${s}' where id = '${id}'`);

  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), now: () => Date.now(), publicOrigin: "http://localhost:4400", formKey: Buffer.from("fo10p2-test (Sample, not a secret)") };
  const rules = new AssignmentRules(db, ports);
  const webForm = sql(`select id from fo_web_form where firm_id = '${A}' limit 1`);
  const service = sql(`insert into fo_service (firm_id, label, sort_order, created_by) values ('${A}', 'Study permit (Sample)', 1, 'seed:FO-10p2-test') returning id`);
  let n = 0;
  /** One arrival through the one arrival path (sales/arrival.ts); `email` repeats an earlier person to flag a possible match. */
  const arrival = (door: "WEB_FORM" | "BOOKING", o: { email?: string; serviceId?: string; host?: string } = {}) => {
    const i = n++, key = door === "WEB_FORM" ? `form:${webForm}:${randomUUID()}` : `booking:${randomUUID()}`;
    return db.$transaction((tx) => arrive(tx, { firmId: A, door, intakeKey: key, ...(door === "WEB_FORM" ? { webFormId: webForm } : {}), person: { givenNames: `Person${i}`, familyName: "Sample", email: o.email ?? `p${i}@fo10p2.example.org`, phone: null }, source: door === "WEB_FORM" ? "WEBSITE" : "BOOKING", interestedInServiceId: o.serviceId ?? null, ...(o.host ? { bookingHostStaffId: o.host } : {}), actor: "system:fo10p2-test", payloadHash: String(i) }, { audit: ports.audit, consent: ports.consent }), { timeout: 30_000 });
  };
  const ownerOf = (leadId: string | null) => sql(`select coalesce(owner_staff_id::text, 'none') from fo_lead where id = '${leadId}'`);
  const line = (leadId: string | null) => sql(`select summary || '|' || coalesce(detail->>'ownerFact', '') || '|' || coalesce(detail->>'assignmentFallback', '') from audit_event where entity = 'fo_lead' and entity_key = '${leadId}' and action = 'lead.created'`);
  const turnNo = (ruleId: string) => Number(sql(`select turn_no from fo_assignment_rule where id = '${ruleId}'`));
  const take = async (k: number, door: "WEB_FORM" | "BOOKING" = "WEB_FORM") => { const out: string[] = []; for (let i = 0; i < k; i++) out.push(ownerOf((await arrival(door)).leadId)); return out; };

  // ------------------------------------------------------------------------------- least recently given (rule 5)
  const trio = [R.staffId, O.staffId, T.staffId].sort();
  const rr = await rules.save(R, { door: "WEB_FORM", strategy: "ROUND_ROBIN", eligibleStaffIds: trio });
  const first = await take(3);
  ok("FO-10p2 pass (rule 5): three leads, three people, each given one (nobody given one yet: by id)", JSON.stringify(first) === JSON.stringify(trio), first);
  const newcomer = addStaff("Newcomer", "CASE_OFFICER");
  await rules.save(R, { door: "WEB_FORM", strategy: "ROUND_ROBIN", eligibleStaffIds: [...trio, newcomer] });
  ok("FO-10p2 fail (rule 5): a person added to the turn, never given a lead, is next (never behind a stored place in an id order)", (await take(1))[0] === newcomer);
  status(O.staffId, "SUSPENDED");
  const whileAway = await take(3);
  status(O.staffId, "ACTIVE");
  ok("FO-10p2 pass (rules 5, 9): while away the person is passed by; the others take their turns in order of their last lead", !whileAway.includes(O.staffId) && new Set(whileAway).size === 3, whileAway);
  ok("FO-10p2 fail (rule 5): back again, the person given a lead least recently gets the next one (their turn kept)", (await take(1))[0] === O.staffId);
  ok("FO-10p2 pass (AG-2-13d): the turn is kept on the rule: turn_no counts every lead given, turns names each person's last", turnNo(rr.id) === 8 && Number(sql(`select turns->>'${O.staffId}' from fo_assignment_rule where id = '${rr.id}'`)) === 8);
  const br = await rules.save(R, { door: "BOOKING", strategy: "ROUND_ROBIN", eligibleStaffIds: trio });
  const parallel = await Promise.all(Array.from({ length: 20 }, () => arrival("BOOKING")));
  const tally = trio.map((s) => parallel.filter((x) => ownerOf(x.leadId) === s).length);
  ok("FO-10p2 pass: 20 parallel arrivals still give each of three people 6 or 7, never 9", tally.every((c) => c === 6 || c === 7), tally);
  await rules.off(R, br.id);

  // ------------------------------------------------------------------------------- a possible match (rule 10)
  const before = turnNo(rr.id);
  const original = await arrival("WEB_FORM", { email: "client.b@fo10p2.example.org" });
  const repeat = await arrival("WEB_FORM", { email: "client.b@fo10p2.example.org" });
  ok("FO-10p2 pass (rule 10): a possible match is placed by no rule: Unassigned, and its line says why", ownerOf(repeat.leadId) === "none" && line(repeat.leadId).endsWith("||POSSIBLE_MATCH") && line(repeat.leadId).includes("a possible match waits for a person"), line(repeat.leadId));
  ok("FO-10p2 fail (rule 10): the possible match moves nobody's turn; the first enquiry of that person was placed as usual", turnNo(rr.id) === before + 1 && ownerOf(original.leadId) !== "none");
  const one = await rules.save(R, { serviceId: service, strategy: "OWNER", ownerStaffId: T.staffId });
  const matchOwner = await arrival("WEB_FORM", { email: "client.b@fo10p2.example.org", serviceId: service });
  ok("FO-10p2 fail (rule 10): a one-person rule does not place a possible match either", ownerOf(matchOwner.leadId) === "none" && ownerOf((await arrival("WEB_FORM", { serviceId: service })).leadId) === T.staffId);
  await rules.off(R, one.id);

  // ------------------------------------------------------------------------------- a booking's host (rules 1(b), 18)
  const bookingRule = await rules.save(R, { door: "BOOKING", strategy: "OWNER", ownerStaffId: O.staffId });
  const hosted = await arrival("BOOKING", { host: T.staffId });
  ok("FO-10p2 pass (rule 1(b)): a booking lead is its host's, whatever the booking rule says; the line names the fact", ownerOf(hosted.leadId) === T.staffId && line(hosted.leadId).includes("owned by the booking's host") && line(hosted.leadId).split("|")[1] === "BOOKING_HOST", line(hosted.leadId));
  status(T.staffId, "DEACTIVATED");
  const gone = await arrival("BOOKING", { host: T.staffId });
  status(T.staffId, "ACTIVE");
  ok("FO-10p2 fail (rule 18): a host no longer active gives no owner, and no rule steps in", ownerOf(gone.leadId) === "none" && line(gone.leadId).split("|")[1] === "HOST_INACTIVE", line(gone.leadId));
  ok("FO-10p2 fail: a booking arrival naming no host still follows the booking rule", ownerOf((await arrival("BOOKING")).leadId) === O.staffId);
  // The adapter reads the host from the booking row written before the arrival (booking/service.ts create).
  const typeId = sql(`insert into fo_consultation_type (id, firm_id, slug, name, modes, host_staff_ids, minutes, updated_at) values (gen_random_uuid(), '${A}', 'fo10p2', 'Consult (Sample)', '{VIDEO}', '{${R.staffId}}', 30, now()) returning id`);
  const bookingId = sql(`insert into fo_booking (id, firm_id, type_id, staff_id, mode, starts_at, ends_at, visitor_time_zone, updated_at) values (gen_random_uuid(), '${A}', '${typeId}', '${R.staffId}', 'VIDEO', now() + interval '2 days', now() + interval '2 days 30 minutes', 'America/Toronto', now()) returning id`);
  const adapter = new PrismaArrival({ audit: ports.audit, consent: ports.consent });
  const viaPort = await db.$transaction((tx) => adapter.bookingArrived(tx, { firmId: A, bookingId, person: { givenNames: "Booker", familyName: "Sample", email: "booker@fo10p2.example.org" } }));
  ok("FO-10p2 pass (rule 1(b)): through the real ArrivalPort, the booking's host (from fo_booking) owns the new lead", sql(`select coalesce(owner_staff_id::text, 'none') from fo_lead where person_id = '${viaPort.personId}'`) === R.staffId);
  await rules.off(R, bookingRule.id);

  // ------------------------------------------------------------------------------- the sharing setting (rule 3)
  const keysOf = (m: string) => (Reflect.getMetadata(PLATFORM_ACCESS, (LeadSharingController.prototype as unknown as Record<string, object>)[m]) as { keys?: string[] } | undefined)?.keys?.join(",");
  ok("FO-10p2 pass (rule 8): reading and changing the setting need agent/firm-capability:manage, held by Owner and Admin", keysOf("read") === "agent/firm-capability:manage" && keysOf("set") === "agent/firm-capability:manage" && R.keys.includes("agent/firm-capability:manage"));
  ok("FO-10p2 fail (rule 8): a Case Officer and a Case Manager hold no such key (403 at the guard)", !O.keys.includes("agent/firm-capability:manage") && !T.keys.includes("agent/firm-capability:manage"));
  ok("FO-10p2 pass: PF-4's start-up rule accepts both routes", (() => { try { assertEveryRouteDeclared([{ name: "LeadSharingController.read", method: "GET", path: "/api/front-office/lead-sharing", access: Reflect.getMetadata(PLATFORM_ACCESS, LeadSharingController.prototype.read) }, { name: "LeadSharingController.set", method: "PUT", path: "/api/front-office/lead-sharing", access: Reflect.getMetadata(PLATFORM_ACCESS, LeadSharingController.prototype.set) }]); return true; } catch { return false; } })());
  ok("FO-10p2 pass (rule 3): the default is Anyone takes it", (await rules.sharing(R)).mode === "ANYONE");
  await rules.off(R, rr.id);   // no door rule for the web form: the setting decides
  const shared = await rules.setSharing(R, { mode: "ROUND_ROBIN", rotationStaffIds: [R.staffId, T.staffId] });
  const sharedTwo = await take(2);
  ok("FO-10p2 pass (rule 3): Round robin between the people ticked shares new web-form leads between them", shared.mode === "ROUND_ROBIN" && [...sharedTwo].sort().join() === [R.staffId, T.staffId].sort().join(), sharedTwo);
  await rules.setSharing(R, { mode: "ONE_PERSON", onePersonStaffId: O.staffId });
  ok("FO-10p2 pass (rule 6): Always one person gets every new lead no rule or fact owns", (await take(1))[0] === O.staffId && (await take(1, "BOOKING"))[0] === O.staffId);
  const doorRule = await rules.save(R, { door: "WEB_FORM", strategy: "OWNER", ownerStaffId: T.staffId });
  ok("FO-10p2 fail (P-773): a door rule still beats the sharing setting; other doors keep the setting", (await take(1))[0] === T.staffId && (await take(1, "BOOKING"))[0] === O.staffId);
  await rules.off(R, doorRule.id);
  const anyone = await rules.setSharing(R, { mode: "ANYONE" });
  ok("FO-10p2 fail (rule 4): back to Anyone takes it, a new lead has no owner", anyone.mode === "ANYONE" && (await take(1))[0] === "none");
  const viewer = addStaff("Viewer", "READ_ONLY");
  ok("FO-10p2 fail: Always one person naming someone who cannot work leads → refused at the field", (await refusal(() => rules.setSharing(R, { mode: "ONE_PERSON", onePersonStaffId: viewer })))?.status === 422);
  ok("FO-10p2 fail: an unknown mode, an unknown field, or a person with Anyone takes it → refused at the field", (await refusal(() => rules.setSharing(R, { mode: "LOAD_BALANCED" })))?.status === 422 && (await refusal(() => rules.setSharing(R, { mode: "ANYONE", weights: 1 })))?.status === 422 && (await refusal(() => rules.setSharing(R, { mode: "ANYONE", onePersonStaffId: O.staffId })))?.status === 422);
  ok("FO-10p2 pass: each change of the setting writes its audit line with before and after", sql(`select count(*) || '|' || count(*) filter (where exists (select 1 from jsonb_object_keys(detail) k where k like '%\\_after')) from audit_event where entity = 'fo_assignment_rule' and action like 'assignment\\_rule.%' and entity_key = (select id::text from fo_assignment_rule where firm_id = '${A}' and criteria_key = 'ANY:ANY')`) === "3|3");
} catch (e) {
  fail++;
  console.log(`FAIL  FO-10p2: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-10 part 2 sharing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
