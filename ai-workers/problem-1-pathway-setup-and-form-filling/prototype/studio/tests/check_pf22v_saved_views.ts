// PF-22v (R1.95, map row 95; AG-2-23 rules 5-7, failure states and edge cases; BACKLOG PF-22v "Done when"): saved views
// of the front office's lists, and the custom-field filter on them. Named cases, each with a pass and a fail:
//   V1 the port: a list registers once with a schema, a share key and a check; the real rule and the fake agree;
//   V2 personal: an Agent saves a personal view and another Agent cannot see, change or delete it (404);
//   V3 shared: sharing without agent/prospect:configure-pipeline → 403; with it every staff member sees it; changing a
//      shared view needs the key (403); a shared "All open" view opened by a view.own Agent shows only their prospects;
//   V4 dropped: a view naming a removed stage opens with "1 filter part no longer applies" and the rest applied;
//   V5 invalid: a filter with an unknown field, a stage that does not exist, or a cf value that does not fit → 400;
//   V6 names and leavers: two views with one name are both kept, each with its owner; a leaver's shared view stays;
//   V7 walls: firm A's views never list for firm B, and firm A's view is a 404 to firm B;
//   V8 custom-field filter: the pipeline filters by cf.referral_partner, inside the visibility; a cf key that names no
//      field or a value not listed → 422; the leads list filters by the person's field; an archived field is dropped.
// One scratch database (every migration, PF-3's and FO-1a's Sample seeds) and a Nest app built from the custom-field,
// saved-view and sales features behind PF-4's guard. No browser, no model call (US$0). The database is dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf22v_saved_views.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { droppedLine, fakeSavedViews, ListRegistry, type SavedViewPort } from "../ports/saved-views.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf22v_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };

// ------------------------------------------------------------------ V1: the port (no database)
const contract = (name: string, port: SavedViewPort) => {
  const reg = { filterSchema: z.record(z.string(), z.string()), shareKey: "agent/thing:share", check: async (_c: unknown, f: Record<string, string | string[]>) => ({ filter: f, dropped: [] }) };
  port.registerList("fo.things", reg);
  const refused = (k: string, r: unknown) => { try { port.registerList(k, r as never); return false; } catch { return true; } };
  ok(`PF-22v V1 pass (${name}): a list registers and is read back`, port.lists().join() === "fo.things" && port.listOf("fo.things") === reg);
  ok(`PF-22v V1 fail (${name}): a second registration, a bad name, a missing check or share key is refused`,
    refused("fo.things", reg) && refused("Bad List", reg) && refused("fo.other", { ...reg, check: undefined }) && refused("fo.other2", { ...reg, shareKey: "share" }) && port.listOf("fo.none") === undefined);
};
contract("fake", fakeSavedViews());
contract("real rule", new ListRegistry());
ok("PF-22v V1: the dropped line says one part or several", droppedLine(1) === "1 filter part no longer applies" && droppedLine(2) === "2 filter parts no longer apply" && droppedLine(0) === null);

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = urlOf(DB);
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];
process.env.PLATFORM_ENVIRONMENT = "local";

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { dutiesOf } = await import("../api/src/platform/identity/keys.ts");
const { auditEvent, platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../api/src/platform/settings.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { Leads } = await import("../api/src/front-office/sales/leads.ts");
const { Prospects } = await import("../api/src/front-office/sales/prospects.ts");
const { SALES_PORTS } = await import("../api/src/front-office/sales/public.ts");
const { SalesController } = await import("../api/src/front-office/sales/routes.ts");
const { Activity } = await import("../api/src/front-office/sales/calls.ts");
const { Timeline } = await import("../api/src/front-office/sales/timeline.ts");
const { clearingConflicts } = await import("./lib/conflict-clear.ts");
const fields = (await import("../api/src/features/platform-custom-fields.ts")).default;
const views = (await import("../api/src/features/platform-saved-views.ts")).default;

const db = new Db();
let app: { close(): Promise<void> } | undefined;
const local = new LocalIdentity("pf22v-check-signing-key-0123456789abcdef", () => Date.now());
type Res = { status: number; body: any };
let BASE = "";
const call = async (method: string, path: string, token: string, body?: unknown): Promise<Res> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};
const V = "/api/platform/saved-views";

try {
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const firmOf = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firmOf("sample-firm"), B = firmOf("sample-solo");
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });   // each Agent sees their own
  type Role = "OWNER" | "CASE_OFFICER" | "READ_ONLY";
  const person = async (name: string, role: Role, firm = A) => {
    const s = await db.platformStaff.create({ data: { firmId: firm, email: `${name}@pf22v.example.com`, displayName: `Sample ${name}`, actorId: `pf22v-${name}`, status: "ACTIVE" } });
    await db.platformRoleGrant.create({ data: { firmId: firm, staffId: s.id, role, grantedBy: "seed:pf22v" } });
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role = '${role}'`).split(",");
    const ctx = { staffId: s.id, firmId: firm, firmKey: firm === A ? "sample-firm" : "sample-solo", roles: [role], keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" as const };
    return { id: s.id, ctx, token: local.issue(s.id, { authTimeMs: Date.now() - 60_000, secondStep: true }) };
  };
  const admin = await person("admin", "OWNER"), agent = await person("agent", "CASE_OFFICER"), other = await person("other", "CASE_OFFICER");
  const leaver = await person("leaver", "OWNER"), adminB = await person("admin-b", "OWNER", B);

  const ports = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports as never), pros = new Prospects(db, ports as never);
  clearingConflicts(db, { prospects: Prospects.prototype });
  let n = 0;
  const prospectOf = async (who: { ctx: unknown }, given: string) => {
    const l = await leads.add(who.ctx as never, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}.pf22v@example.com`, source: "Phone call" }) as { id: string; person: { id: string } };
    return { lead: l, prospect: (await pros.engage(who.ctx as never, l.id)) as { id: string } };
  };
  const mine = await prospectOf(agent, "Ana"), mine2 = await prospectOf(agent, "Ben"), theirs = await prospectOf(other, "Cleo");
  // an open lead (an engaged one leaves the leads list) for the person-field filter
  const openLead = await leads.add(agent.ctx as never, { requestId: randomUUID(), givenNames: "Dee", familyName: "Sample", email: "dee.pf22v@example.com", source: "Phone call" }) as { id: string; person: { id: string } };
  const openLead2 = await leads.add(agent.ctx as never, { requestId: randomUUID(), givenNames: "Eve", familyName: "Sample", email: "eve.pf22v@example.com", source: "Phone call" }) as { id: string; person: { id: string } };

  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    { provide: SALES_PORTS, useValue: ports }, Leads, Prospects, Activity, Timeline, ...fields.providers, ...views.providers];
  @Module({ controllers: [SalesController, ...fields.controllers, ...views.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false });
  await nest.listen(0, "127.0.0.1"); app = nest;
  BASE = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;

  // a custom field to filter by, with values on two prospects (one of the Agent's, one of the other Agent's)
  const ref = await call("POST", "/api/platform/custom-fields", admin.token, { kind: "fo_prospect", label: "Referral partner", type: "SELECT", options: ["Maple Law", "Northgate Legal"] });
  const put = async (who: { token: string }, kind: string, id: string, values: Record<string, unknown>) => {
    const v = await call("GET", `/api/platform/custom-fields/values/${kind}/${id}`, who.token);
    return call("PUT", `/api/platform/custom-fields/values/${kind}/${id}`, who.token, { version: v.body.version, values });
  };
  await put(agent, "fo_prospect", mine.prospect.id, { referral_partner: "Maple Law" });
  await put(other, "fo_prospect", theirs.prospect.id, { referral_partner: "Maple Law" });
  const FO = "/api/front-office";

  // ------------------------------------------------------------------ V8: the custom-field filter on the lists
  const pipe = await call("GET", `${FO}/prospects?cf.referral_partner=${encodeURIComponent("Maple Law")}`, agent.token);
  ok("PF-22v V8 pass: the pipeline filters by cf.referral_partner = Maple Law, inside the Agent's visibility (their one prospect, not the other Agent's)",
    pipe.status === 200 && pipe.body.length === 1 && pipe.body[0].id === mine.prospect.id, pipe.body);
  const noField = await call("GET", `${FO}/prospects?cf.nothing_here=x`, agent.token), offList = await call("GET", `${FO}/prospects?cf.referral_partner=Someone`, agent.token), stray = await call("GET", `${FO}/prospects?colour=red`, agent.token);
  ok("PF-22v V8 fail: a cf key naming no field or a value not listed → 422 INVALID_FILTER (named); another unknown key → 422 named",
    noField.status === 422 && !!noField.body.fields?.["cf.nothing_here"] && offList.status === 422 && /listed choices/.test(offList.body.fields?.["cf.referral_partner"]) && stray.status === 422 && !!stray.body.fields?.colour, [noField.body, offList.body, stray.body]);
  const nick = await call("POST", "/api/platform/custom-fields", admin.token, { kind: "fo_person", label: "Nickname", type: "TEXT" });
  await put(agent, "fo_person", openLead.person.id, { nickname: "Benny" });
  await put(agent, "fo_person", openLead2.person.id, { nickname: "Eve" });
  const leadList = await call("GET", `${FO}/leads?view=all&cf.nickname=benn`, agent.token);
  ok("PF-22v V8 pass: the leads list filters by the person's field (contains, any case)", nick.status === 201 && leadList.status === 200 && leadList.body.length === 1 && leadList.body[0].id === openLead.id, leadList.body);

  // ------------------------------------------------------------------ V2: personal views
  const save = (who: { token: string }, body: Record<string, unknown>) => call("POST", V, who.token, { requestId: randomUUID(), ...body });
  const p1 = await save(agent, { list: "fo.pipeline.individual", name: "My referrals", filter: { "cf.referral_partner": "Maple Law" } });
  ok("PF-22v V2 pass: an Agent saves a personal view with a custom-field filter; it lists for them, owned by them", p1.status === 201 && p1.body.shared === false && p1.body.owner?.id === agent.id
    && (await call("GET", `${V}?list=fo.pipeline.individual`, agent.token)).body.personal.some((v: { id: string }) => v.id === p1.body.id), p1.body);
  const otherList = await call("GET", `${V}?list=fo.pipeline.individual`, other.token);
  const otherPatch = await call("PATCH", `${V}/${p1.body.id}`, other.token, { name: "Mine now" }), otherDel = await call("DELETE", `${V}/${p1.body.id}`, other.token);
  ok("PF-22v V2 fail: another Agent does not see the personal view, and gets 404 changing or deleting it", !otherList.body.personal.length && !otherList.body.shared.length && otherPatch.status === 404 && otherDel.status === 404, [otherList.body, otherPatch.status, otherDel.status]);
  const renamed = await call("PATCH", `${V}/${p1.body.id}`, agent.token, { name: "Maple referrals", filter: { "cf.referral_partner": ["Maple Law", "Northgate Legal"] } });
  ok("PF-22v V2 pass: its owner renames it and replaces its filter; audited", renamed.status === 200 && renamed.body.name === "Maple referrals" && Array.isArray(renamed.body.filter["cf.referral_partner"])
    && sql(`select count(*) from audit_event where entity_key = '${p1.body.id}' and action in ('saved_view.created', 'saved_view.changed')`) === "2", renamed.body);

  // ------------------------------------------------------------------ V3: shared views
  const shareNo = await save(agent, { list: "fo.pipeline.individual", name: "All open", filter: {}, shared: true });
  ok("PF-22v V3 fail: sharing without agent/prospect:configure-pipeline → 403 SHARE_NOT_ALLOWED, nothing saved", shareNo.status === 403 && shareNo.body.code === "SHARE_NOT_ALLOWED" && sql(`select count(*) from plat_saved_view where name = 'All open'`) === "0", shareNo.body);
  const allOpen = await save(admin, { list: "fo.pipeline.individual", name: "All open", filter: {}, shared: true });
  const seenBy = await Promise.all([agent, other].map((w) => call("GET", `${V}?list=fo.pipeline.individual`, w.token)));
  ok("PF-22v V3 pass: with the key an Admin shares \"All open\"; every staff member sees it, unable to change it", allOpen.status === 201 && allOpen.body.shared && seenBy.every((r) => r.body.shared.some((v: { id: string; canChange: boolean }) => v.id === allOpen.body.id && !v.canChange)), seenBy.map((r) => r.body));
  const agentChange = await call("PATCH", `${V}/${allOpen.body.id}`, agent.token, { name: "Mine" }), agentDel = await call("DELETE", `${V}/${allOpen.body.id}`, agent.token);
  ok("PF-22v V3 fail: changing or deleting a shared view without the key → 403", agentChange.status === 403 && agentDel.status === 403, [agentChange.body, agentDel.status]);
  const opened = await call("GET", `${FO}/prospects?${new URLSearchParams(seenBy[0].body.shared[0].applies)}`, agent.token);
  const adminOpened = await call("GET", `${FO}/prospects?${new URLSearchParams(seenBy[0].body.shared[0].applies)}`, admin.token);
  ok("PF-22v V3 pass: the shared \"All open\" view opened by a view.own Agent shows only their own prospects (2), never the other Agent's",
    opened.status === 200 && opened.body.length === 2 && opened.body.every((p: { ownerStaffId: string }) => p.ownerStaffId === agent.id) && adminOpened.body.length === 0, [opened.body.length, adminOpened.body.length]);

  // ------------------------------------------------------------------ V4: a part that no longer applies
  sql(`insert into plat_saved_view (id, firm_id, owner_staff_id, list_kind, name, filter, columns, created_by, updated_at) values ('${randomUUID()}', '${A}', '${agent.id}', 'fo.pipeline.individual', 'Gone stage', '{"stage": "CONSULT_OLD", "cf.referral_partner": "Maple Law"}', '[]', '${agent.id}', now())`);
  const withGone = (await call("GET", `${V}?list=fo.pipeline.individual`, agent.token)).body.personal.find((v: { name: string }) => v.name === "Gone stage");
  ok("PF-22v V4 pass: a view naming a removed stage opens with \"1 filter part no longer applies\" (the stage named) and the rest applied; the stored filter kept",
    withGone?.droppedLine === "1 filter part no longer applies" && withGone.dropped[0].part === "stage" && /CONSULT_OLD/.test(withGone.dropped[0].label) && withGone.applies["cf.referral_partner"] === "Maple Law" && !("stage" in withGone.applies) && withGone.filter.stage === "CONSULT_OLD", withGone);
  ok("PF-22v V4 fail: a view whose parts all apply names none", (await call("GET", `${V}?list=fo.pipeline.individual`, agent.token)).body.personal.find((v: { id: string }) => v.id === p1.body.id)?.dropped.length === 0);

  // ------------------------------------------------------------------ V5: invalid filters refused
  const unknownField = await save(agent, { list: "fo.pipeline.individual", name: "Bad", filter: { colour: "red" } });
  const badStage = await save(agent, { list: "fo.pipeline.individual", name: "Bad", filter: { stage: "NOPE" } });
  const badValue = await save(agent, { list: "fo.pipeline.individual", name: "Bad", filter: { "cf.referral_partner": "Someone" } });
  const typeOnPipeline = await save(agent, { list: "fo.pipeline.individual", name: "Bad", filter: { type: "CORPORATE" } });
  const unknownList = await save(agent, { list: "case.things", name: "Bad", filter: {} });
  ok("PF-22v V5 fail: an unknown field, a stage that does not exist, a value not listed, a type on a pipeline's view → 400 INVALID_FILTER (part named); an unknown list → 400",
    [unknownField, badStage, badValue, typeOnPipeline].every((r) => r.status === 400 && r.body.code === "INVALID_FILTER") && !!unknownField.body.fields?.colour && !!badStage.body.fields?.stage && unknownList.status === 400 && unknownList.body.code === "UNKNOWN_LIST"
      && sql(`select count(*) from plat_saved_view where name = 'Bad'`) === "0", [unknownField.body, badStage.body, badValue.body, typeOnPipeline.body, unknownList.body]);
  const goodStage = await save(agent, { list: "fo.pipeline.individual", name: "Qualified", filter: { stage: "QUALIFIED", owner: agent.id, from: "2026-01-01" } });
  ok("PF-22v V5 pass: a filter of the list's own words (stage, owner, from) saves", goodStage.status === 201 && goodStage.body.dropped.length === 0, goodStage.body);

  // ------------------------------------------------------------------ V6: same names, leavers
  const twinA = await save(admin, { list: "fo.leads", name: "Hot leads", filter: { view: "all" }, shared: true });
  const twinB = await save(leaver, { list: "fo.leads", name: "Hot leads", filter: { view: "mine" }, shared: true });
  const twins = (await call("GET", `${V}?list=fo.leads`, agent.token)).body.shared.filter((v: { name: string }) => v.name === "Hot leads");
  ok("PF-22v V6 pass: two views with one name are both kept, each labelled with who made it", twinA.status === 201 && twinB.status === 201 && twins.length === 2 && new Set(twins.map((v: { createdBy: { name: string } }) => v.createdBy.name)).size === 2, twins);
  sql(`update platform_staff set status = 'DEACTIVATED' where id = '${leaver.id}'`);
  const afterLeave = (await call("GET", `${V}?list=fo.leads`, agent.token)).body.shared.find((v: { id: string }) => v.id === twinB.body.id);
  ok("PF-22v V6 pass: a leaver's shared view stays with the firm, its maker shown as no longer active", afterLeave && afterLeave.createdBy.active === false, afterLeave);
  const unshare = await call("PATCH", `${V}/${twinB.body.id}`, agent.token, { shared: false });
  const take = await call("PATCH", `${V}/${twinB.body.id}`, admin.token, { shared: false });
  ok("PF-22v V6 fail/pass: an Agent cannot take a shared view back (403); an Admin can, and it becomes theirs", unshare.status === 403 && take.status === 200 && take.body.shared === false && take.body.owner?.id === admin.id, [unshare.body, take.body]);
  const del = await call("DELETE", `${V}/${goodStage.body.id}`, agent.token);
  ok("PF-22v V6 pass: an owner deletes their view; audited", del.status === 200 && sql(`select count(*) from plat_saved_view where id = '${goodStage.body.id}'`) === "0" && sql(`select count(*) from audit_event where entity_key = '${goodStage.body.id}' and action = 'saved_view.deleted'`) === "1");

  // ------------------------------------------------------------------ V9: review and break round 1 (each a fail test first)
  const rid = randomUUID();
  const first = await call("POST", V, agent.token, { requestId: rid, list: "fo.leads", name: "Once", filter: {} });
  const again = await call("POST", V, agent.token, { requestId: rid, list: "fo.leads", name: "Once", filter: {} });
  const reused = await call("POST", V, agent.token, { requestId: rid, list: "fo.leads", name: "Other", filter: {} });
  ok("PF-22v V9 pass/fail (review M4): the same request again answers the same view, one row; the id reused for another view → 409",
    first.status === 201 && again.body.id === first.body.id && sql(`select count(*) from plat_saved_view where name = 'Once'`) === "1" && reused.status === 409 && reused.body.code === "REQUEST_REUSED", [again.body, reused.body]);
  const ver = first.body.version;
  const r1 = await call("PATCH", `${V}/${first.body.id}`, agent.token, { name: "Once renamed", version: ver });
  const r2 = await call("PATCH", `${V}/${first.body.id}`, agent.token, { name: "Lost edit", version: ver });
  const d1 = await call("DELETE", `${V}/${first.body.id}?version=${encodeURIComponent(ver)}`, agent.token);
  ok("PF-22v V9 fail (review M3): a change or a delete on the version read before → 409 STALE_VERSION with the view as it is; the first change kept",
    r1.status === 200 && r2.status === 409 && r2.body.code === "STALE_VERSION" && r2.body.current?.name === "Once renamed" && d1.status === 409 && sql(`select name from plat_saved_view where id = '${first.body.id}'`) === "Once renamed", [r2.body, d1.body]);
  const sorted = await call("PATCH", `${V}/${first.body.id}`, agent.token, { sort: { by: "arrivedAt", dir: "asc" } });
  const unsorted = await call("PATCH", `${V}/${first.body.id}`, agent.token, { sort: null });
  ok("PF-22v V9 pass (review minor): a sort is set, and null clears it", sorted.body.sort?.by === "arrivedAt" && unsorted.status === 200 && unsorted.body.sort === null, unsorted.body);
  const bad = await Promise.all([{ view: "bogus" }, { from: "31/31/2026" }, { source: "No Such Source" }].map((f) => save(agent, { list: "fo.leads", name: "Bad2", filter: f })));
  const badType = await save(agent, { list: "fo.prospects", name: "Bad2", filter: { type: "SPACESHIP" } });
  ok("PF-22v V9 fail (review M2, break M3): a view, a date, a source or a type the list would refuse → 400 at save, the part named; nothing saved",
    bad.every((r) => r.status === 400 && r.body.code === "INVALID_FILTER") && !!bad[0].body.fields?.view && !!bad[1].body.fields?.from && !!bad[2].body.fields?.source && badType.status === 400 && !!badType.body.fields?.type
      && sql(`select count(*) from plat_saved_view where name = 'Bad2'`) === "0", [...bad.map((r) => r.body), badType.body]);
  const huge = await save(agent, { list: "fo.leads", name: "Huge", filter: { source: Array.from({ length: 40 }, (_, i) => `${i}`.padEnd(480, "x")) } });
  const nulName = await save(agent, { list: "fo.leads", name: "a\u0000b", filter: {} });
  const ctorKey = await save(agent, { list: "fo.leads", name: "Ctor", filter: { constructor: "x" } });
  ok("PF-22v V9 fail (review M6, break m1, m2): an oversized filter, a NUL in a name, a \"constructor\" key → 400/422, never a 500", huge.status === 422 && nulName.status === 422 && ctorKey.status === 400, [huge.status, nulName.status, ctorKey.status]);
  const budget = await call("POST", "/api/platform/custom-fields", admin.token, { kind: "fo_prospect", label: "Budget", type: "NUMBER" });
  await put(agent, "fo_prospect", mine2.prospect.id, { budget: 2500.5 });
  const dec = await call("GET", `${FO}/prospects?cf.budget=1000..2500.75`, agent.token), decOpen = await call("GET", `${FO}/prospects?cf.budget=2500.25..`, agent.token), decOut = await call("GET", `${FO}/prospects?cf.budget=2500.75..`, agent.token);
  ok("PF-22v V9 pass/fail (review M5): decimal ranges work (2500.5 is in 1000..2500.75 and in 2500.25.., not in 2500.75..)",
    budget.status === 201 && dec.status === 200 && dec.body.length === 1 && decOpen.body.length === 1 && decOut.status === 200 && decOut.body.length === 0, [dec.body, decOpen.body, decOut.body]);
  // review M1 / challenge M3: a shared view naming a source the viewer's leads do not have is dropped for them, never a 422
  sql(`update fo_lead set source = 'Web form' where id = '${theirs.lead.id}'`);
  // break round 2 R2-M1: the Admin's own leads lack "Web form" (everyone-sees-all is off), yet it is a source of the firm, so it saves
  const webView = await save(admin, { list: "fo.leads", name: "Web leads", filter: { view: "all", source: "Web form" }, shared: true });
  const agentWeb = (await call("GET", `${V}?list=fo.leads`, agent.token)).body.shared.find((v: { id: string }) => v.id === webView.body.id);
  const agentOpens = await call("GET", `${FO}/leads?${new URLSearchParams(agentWeb?.applies ?? {})}`, agent.token);
  ok("PF-22v V9 pass (review M1, challenge M3): the Admin shares a source view; for an Agent whose leads lack that source the part is dropped and named, and the rest opens (200)",
    webView.status === 201 && agentWeb?.dropped[0]?.part === "source" && /Web form/.test(agentWeb.dropped[0].label) && agentOpens.status === 200, [webView.body, agentWeb, agentOpens.status]);
  ok("PF-22v V9 fail (round 2 R2-1, challenge M3): with none of its sources seen, the view opens empty for the Agent (empty: true), never as all their leads", agentWeb?.empty === true && /shows nothing/.test(agentWeb.dropped[0].label), agentWeb);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });
  const mixed = await save(admin, { list: "fo.leads", name: "Web or phone", filter: { view: "all", source: ["Web form", "Phone call"] }, shared: true });
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });
  const agentMixed = (await call("GET", `${V}?list=fo.leads`, agent.token)).body.shared.find((v: { id: string }) => v.id === mixed.body.id);
  ok("PF-22v V9 pass (round 2 R2-1): a mixed-source view keeps the sources the Agent sees (Phone call) and names only the unseen one",
    mixed.status === 201 && agentMixed?.applies.source === "Phone call" && agentMixed.empty === false && /Web form/.test(agentMixed.dropped[0].label) && /still apply/.test(agentMixed.dropped[0].label), agentMixed);
  const keyRid = randomUUID();
  const k1 = await call("POST", V, agent.token, { requestId: keyRid, list: "fo.pipeline.individual", name: "Two keys", filter: { stage: "QUALIFIED", owner: agent.id, from: "2026-01-01" } });
  const k2 = await call("POST", V, agent.token, { requestId: keyRid, list: "fo.pipeline.individual", name: "Two keys", filter: { from: "2026-01-01", owner: agent.id, stage: "QUALIFIED" } });
  ok("PF-22v V9 pass (round 2 R2-2): a retry with the filter's keys in another order answers the same view (no 409)", k1.status === 201 && k2.status === 201 && k2.body.id === k1.body.id, [k1.status, k2.status, k2.body]);
  const oneBad = await save(agent, { list: "fo.leads", name: "Half dates", filter: { from: "2026-01-01", to: "2026-13-45" } });
  const reversed = await save(agent, { list: "fo.leads", name: "Backwards", filter: { from: "2026-06-01", to: "2026-01-01" } });
  ok("PF-22v V9 fail (break round 2 R2-m5): a reversed range names the end", reversed.status === 400 && /before the start/.test(reversed.body.fields?.to ?? ""), reversed.body);
  ok("PF-22v V9 fail (round 2 R2-4): one bad date names only itself", oneBad.status === 400 && !!oneBad.body.fields?.to && !oneBad.body.fields?.from, oneBad.body);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });
  const adminAll = await call("GET", `${FO}/prospects?${new URLSearchParams(seenBy[0].body.shared[0].applies)}`, admin.token);
  ok("PF-22v V9 pass (review minor, BR-13): with everyone-sees-all, the same shared view shows the Admin every open prospect (3)", adminAll.status === 200 && adminAll.body.length >= 3, adminAll.body.length);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });

  // ------------------------------------------------------------------ V7: walls
  const bList = await call("GET", `${V}?list=fo.pipeline.individual`, adminB.token), bPatch = await call("PATCH", `${V}/${allOpen.body.id}`, adminB.token, { name: "Ours" });
  ok("PF-22v V7 pass: firm B lists none of firm A's views", bList.status === 200 && !bList.body.personal.length && !bList.body.shared.length, bList.body);
  ok("PF-22v V7 fail: firm A's shared view is a 404 to firm B", bPatch.status === 404, bPatch.body);

  // ------------------------------------------------------------------ V8 again: an archived field is dropped
  await call("PATCH", `/api/platform/custom-fields/${ref.body.id}`, admin.token, { archived: true, confirm: true });
  const archivedView = (await call("GET", `${V}?list=fo.pipeline.individual`, agent.token)).body.personal.find((v: { id: string }) => v.id === p1.body.id);
  const archivedFilter = await call("GET", `${FO}/prospects?cf.referral_partner=${encodeURIComponent("Maple Law")}`, agent.token);
  ok("PF-22v V8 pass: once its field is archived, the view opens with that part dropped; the list refuses the archived key (422)",
    archivedView?.dropped[0]?.part === "cf.referral_partner" && archivedView.droppedLine === "1 filter part no longer applies" && archivedFilter.status === 422, [archivedView, archivedFilter.status]);
} catch (e) {
  ok("unexpected", false, String((e as Error)?.stack ?? e));
} finally {
  await app?.close();
  await db.$disconnect?.();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
