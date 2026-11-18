// FO-2v (QA-477, QA-479; R1.6; brief rev 16.53): one own-versus-all rule for leads, the one retainers follow (AG-2-64
// rules 2-3, SA-6-24, PF-6b ruling 4): all = agent/prospect:view.all AND the firm's "everyone sees all" on, else their
// own; no Owner/Admin override. Take on a lead the person cannot see answers the same 404 as GET (AG-2-86 rule 3 edge
// case), except the real race of rule 3: an Unassigned lead taken by someone else within 10 minutes (Sample) → 409 naming
// who, never their id. One named case per Done when line, a pass and a fail each:
//   DW1 the six seeded roles, the setting on and off, and a role copy without view.all · DW3 Take: 404 / the race 409.
// (DW2, the sweep, is in check_pf6b_permission_rules.ts; DW4 is the other suites.) One scratch database with every
// migration and the Sample seeds; no server, no browser, no model call (US$0). The database is dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo2v_lead_visibility.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo2v_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
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
  ok("FO-2v setup: both Sample firms have a front office", fo.failed.length === 0, fo.failed);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), now: () => Date.now(), publicOrigin: "http://localhost:4400", formKey: Buffer.from("fo2v-test-stamp-key (Sample, not a secret)") };
  const leads = new Leads(db, ports);
  const setAll = async (on: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: on, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });

  // One staff member per seeded role (the six starter roles), each owning one open lead; one Unassigned lead.
  const ROLES = sql(`select string_agg(distinct role::text, ',' order by role::text) from platform_role_permission`).split(",");
  ok("FO-2v setup: the six seeded roles", ROLES.length === 6 && ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"].every((r) => ROLES.includes(r)), ROLES);
  const keysOf = (role: string) => sql(`select string_agg(permission_key, ',') from platform_role_permission where role::text = '${role}'`).split(",");
  let n = 700;
  const person = () => { const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Client ${++n}', 'Sample', 'fo2v${n}@example.com', 'test', now()) returning id`); return p; };
  const lead = (owner: string | null) => sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${person()}', 'MANUAL', 'WEBSITE', ${owner ? `'${owner}'` : "null"}, 'test', now()) returning id`);
  const staffOf = (name: string) => sql(`insert into platform_staff (id, firm_id, email, display_name, updated_at) values (gen_random_uuid(), '${A}', 'fo2v.${name.toLowerCase()}@example.com', '${name} (Sample)', now()) returning id`);
  const ctx = (staffId: string, keys: string[]): StaffContext => ({ staffId, firmId: A, firmKey: "sample-firm", roles: [], keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" });
  const viewers = ROLES.map((role) => { const id = staffOf(role); return { role, c: ctx(id, keysOf(role)), own: lead(id) }; });
  const copyId = staffOf("OFFICER_COPY"), copy = { role: "CASE_OFFICER without view.all", c: ctx(copyId, keysOf("CASE_OFFICER").filter((k) => k !== "agent/prospect:view.all")), own: lead(copyId) };
  const all = [...viewers, copy];
  const owned = new Set(all.map((v) => v.own));
  const seenBy = async (c: StaffContext) => {
    const listed = new Set((await leads.list(c, "all")).map((l) => l.id).filter((id) => owned.has(id)));
    const read = new Set<string>(); for (const id of owned) if (!(await refusal(() => leads.read(c, id)))) read.add(id);
    return { listed, read };
  };
  const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));

  // ------------------------------------------------------------------------------------------- DW1 (QA-477)
  await setAll(false);
  const off: string[] = [];
  for (const v of all) { const s = await seenBy(v.c); if (!same(s.listed, [v.own]) || !same(s.read, [v.own])) off.push(`${v.role}: list ${s.listed.size}, read ${s.read.size}`); }
  ok("FO-2v DW1 pass (QA-477): setting off → every role, the Owner and the Admin included, lists and reads only its own lead, as with retainers", off.length === 0, off);
  const ownerOff = await seenBy(viewers.find((v) => v.role === "OWNER")!.c), adminOff = await seenBy(viewers.find((v) => v.role === "ADMIN")!.c);
  ok("FO-2v DW1 fail (QA-477): setting off → the Owner and the Admin cannot read another person's lead (404), the Owner/Admin override is gone",
    (await refusal(() => leads.read(viewers.find((v) => v.role === "OWNER")!.c, copy.own)))?.status === 404 && ownerOff.read.size === 1 && adminOff.read.size === 1);
  await setAll(true);
  const on: string[] = [];
  for (const v of viewers) { const s = await seenBy(v.c), all_ = v.c.keys.includes("agent/prospect:view.all"); if (!same(s.read, all_ ? [...owned] : [v.own]) || !same(s.listed, all_ ? [...owned] : [v.own])) on.push(`${v.role}: list ${s.listed.size}, read ${s.read.size}`); }
  ok("FO-2v DW1 pass: setting on → every seeded role holding view.all lists and reads every lead", on.length === 0 && viewers.every((v) => v.c.keys.includes("agent/prospect:view.all")), on);
  const copyOn = await seenBy(copy.c);
  ok("FO-2v DW1 fail: a role without view.all sees only its own, the setting on (and off, above)", same(copyOn.read, [copy.own]) && same(copyOn.listed, [copy.own]), { read: copyOn.read.size, listed: copyOn.listed.size });

  // ------------------------------------------------------------------------------------------- DW3 (QA-479)
  await setAll(false);
  const owner = viewers.find((v) => v.role === "OWNER")!, officer = viewers.find((v) => v.role === "CASE_OFFICER")!, manager = viewers.find((v) => v.role === "CASE_MANAGER")!;
  const ownersLead = owner.own;   // owned from the start, never Unassigned
  const no = await refusal(() => leads.take(officer.c, ownersLead));
  const body = JSON.stringify(no?.body ?? {});
  ok("FO-2v DW3 pass (QA-479): a Case Officer's Take on the Owner's own, never-unassigned lead → 404, the same as GET, no name and no id",
    no?.status === 404 && (await refusal(() => leads.read(officer.c, ownersLead)))?.status === 404 && !body.includes("OWNER (Sample)") && !body.includes(owner.c.staffId) && !body.includes("ownerStaffId"), no);
  const race = lead(null);
  await leads.take(manager.c, race);   // someone else took the Unassigned lead a moment ago
  const late = await refusal(() => leads.take(officer.c, race));
  ok("FO-2v DW3 fail (the real race, AG-2-86 rule 3): an Unassigned lead taken a second earlier by someone else → 409 naming who, with no ownerStaffId",
    late?.status === 409 && late.body.detail === "CASE_MANAGER (Sample) already has this lead." && late.body.code === "ALREADY_TAKEN" && !("ownerStaffId" in late.body) && !JSON.stringify(late.body).includes(manager.c.staffId), late);
  // AUD-1a: the trail is insert-only, so back-dating runs as the owner with triggers off on this scratch copy (FO-1a/PF-12 setup pattern); the app's role can never do this.
  sql(`set session_replication_role = replica; update audit_event set at = at - interval '11 minutes' where entity = 'fo_lead' and entity_key = '${race}' and action = 'lead.taken'; set session_replication_role = origin`);
  ok("FO-2v DW3 pass: the same lead taken more than 10 minutes ago (Sample) → 404, no name", (await refusal(() => leads.take(officer.c, race)))?.status === 404);
  const moved = lead(null);
  await leads.take(manager.c, moved);
  sql(`set session_replication_role = replica; update audit_event set at = at - interval '11 minutes' where entity = 'fo_lead' and entity_key = '${moved}' and action = 'lead.taken'; set session_replication_role = origin`);
  await leads.assign(manager.c, moved, { staffId: owner.c.staffId, expectedOwnerStaffId: manager.c.staffId });   // owner to owner, just now
  ok("FO-2v DW3 pass: a lead moved from one owner to another just now (not from Unassigned) → 404, no name", (await refusal(() => leads.take(officer.c, moved)))?.status === 404);
  // Lead B rev 16.55 condition 2 "or a deactivated person": a deactivated owner's lead is Unassigned (AG-2-13c rule 6),
  // so someone taking it a moment ago is the real race too.
  const gone = staffOf("GONE"), orphan = lead(gone);
  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${gone}'`);
  await leads.take(manager.c, orphan);
  const late2 = await refusal(() => leads.take(officer.c, orphan));
  ok("FO-2v DW3 fail (the race through a deactivated owner): their lead, taken a second earlier by someone else → 409 naming who, no ownerStaffId",
    late2?.status === 409 && late2.body.detail === "CASE_MANAGER (Sample) already has this lead." && !("ownerStaffId" in late2.body), late2);
  // Breaker m1 / review Minor 2: a lead moved owner to owner, then its previous owner deactivated → still 404 (the line
  // says whether it left Unassigned as it was at the change).
  const moved2 = lead(manager.c.staffId);
  await leads.assign(manager.c, moved2, { staffId: viewers.find((v) => v.role === "ADMIN")!.c.staffId, expectedOwnerStaffId: manager.c.staffId });
  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${manager.c.staffId}'`);
  const m1 = await refusal(() => leads.take(officer.c, moved2));
  sql(`update platform_staff set status = 'ACTIVE' where id = '${manager.c.staffId}'`);
  ok("FO-2v DW3 pass (breaker m1): moved owner to owner, the previous owner deactivated afterwards → 404, no name", m1?.status === 404, m1);
  // Lead B rev 16.55 condition 3 (review Major 1): a race line in firm B's scope with firm A's lead id is never read.
  const B = sql(`select id from platform_firm where key = 'sample-solo'`), ws = await platformAuditWorkspaceId(db as never);
  const forged = owner.own;
  sql(`insert into audit_event (id, workspace_id, actor, action, entity, entity_key, summary, detail) values (gen_random_uuid(), '${ws}', 'system:test', 'lead.taken', 'fo_lead', '${forged}', 'forged', '{"firmId": "${B}", "previousOwnerStaffId": null, "fromUnassigned": true}')`);
  const fb = await refusal(() => leads.take(officer.c, forged));
  ok("FO-2v DW3 fail (firm B): a take line in firm B's scope naming firm A's lead → 404, firm A's race never reads it", fb?.status === 404 && !JSON.stringify(fb.body).includes("already has"), fb);
  await setAll(true);
  const seen = await refusal(() => leads.take(officer.c, ownersLead));
  ok("FO-2v DW3 pass: with the setting on, a view.all holder who sees the lead hears who has it, with no ownerStaffId", seen?.status === 409 && seen.body.code === "ALREADY_TAKEN" && !("ownerStaffId" in seen.body), seen);
} catch (e) {
  fail++;
  console.log(`FAIL  FO-2v: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-2v lead visibility: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
