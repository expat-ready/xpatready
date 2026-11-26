// PF-22a part 2 (R1.95, map row 95; P-570, P-584 (2); BACKLOG PF-22a "Done when"): CustomFieldPort and the custom-field
// routes. Named cases, each with a pass and a fail:
//   C1 the port: a kind registers once, needs canView and canEdit; the real registry and the fake give the same answers;
//   C2 definitions: an Owner adds a SELECT "Referral partner" to prospects (key made from the label); an Agent without
//      agent/custom-field:manage → 403; an unregistered kind → 400; no choices on a SELECT → 422; the 51st → 422 LIMIT_REACHED;
//   C3 values: a DATE refuses "tomorrow", a SELECT refuses a choice not listed; a required field left empty → 422 on
//      this save; an Agent who cannot see the prospect → 404 on its values; a Read-only person sees them, PUT → 403;
//      a stale version → 409 STALE_VERSION; one audit line per save with the values in before/after, not the summary;
//   C4 archive: with values, without confirm → 409 FIELD_IN_USE naming the count; with confirm the field leaves the
//      record and its value is kept; un-archive shows it again;
//   C5 freeze: a type change with values → 409 TYPE_FROZEN; a choice in use cannot be removed (409 OPTION_IN_USE), a new
//      one can be added;
//   C6 walls: firm B never sees firm A's fields, and firm A's prospect is a 404 to firm B.
// One scratch database (every migration, PF-3's and FO-1a's Sample seeds) and a Nest app built from the feature's own
// classes behind PF-4's guard (as PF-21j's suite does). No browser, no model call (US$0). The database is dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf22a_custom_fields.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EntityRegistry, fakeCustomFields, readValue, keyFromLabel, type CustomFieldPort } from "../ports/custom-fields.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_pf22a2_${process.pid}`;
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };

// ------------------------------------------------------------------ C1: the port (no database)
const contract = async (name: string, port: CustomFieldPort) => {
  const yes = { canView: async () => true, canEdit: async () => false };
  port.registerEntity("fo_thing", yes);
  let twice = false; try { port.registerEntity("fo_thing", yes); } catch { twice = true; }
  let bad = false; try { port.registerEntity("Not A Kind", yes); } catch { bad = true; }
  let half = false; try { port.registerEntity("fo_half", { canView: async () => true } as never); } catch { half = true; }
  ok(`PF-22a C1 pass (${name}): a kind registers and its checks are read back`, port.kinds().join() === "fo_thing" && port.accessOf("fo_thing") === yes);
  ok(`PF-22a C1 fail (${name}): a second registration, a bad name or a missing canEdit is refused; an unknown kind has no checks`, twice && bad && half && port.accessOf("fo_other") === undefined);
};
await contract("fake", fakeCustomFields());
await contract("real rule", new EntityRegistry());
ok("PF-22a C1: keys come from labels, a taken key gets _2", keyFromLabel("Referral partner", []) === "referral_partner" && keyFromLabel("Referral partner", ["referral_partner"]) === "referral_partner_2" && keyFromLabel("2nd visit", []) === "f_2nd_visit");
const sel = { type: "SELECT" as const, options: ["Maple Law", "Northgate Legal"], label: "Referral partner" };
ok("PF-22a C1: the value check mirrors the database (zero-width and U+0085 blanks trimmed; a real date only)",
  JSON.stringify(readValue({ type: "TEXT", options: [], label: "t" }, "​\u0085 x \u0085")) === '{"value":"x"}' && "issue" in readValue({ type: "DATE", options: [], label: "d" }, "2026-02-30")
    && JSON.stringify(readValue(sel, " Maple Law ")) === '{"value":"Maple Law"}' && JSON.stringify(readValue({ type: "URL", options: [], label: "u" }, "example.com")) === '{"value":"https://example.com"}');

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
const { clearingConflicts } = await import("./lib/conflict-clear.ts");
const feature = (await import("../api/src/features/platform-custom-fields.ts")).default;
const { CustomFieldRegistry } = await import("../api/src/platform/custom-fields/registry.ts");

const db = new Db();
let app: { close(): Promise<void>; get<T>(t: unknown): T } | undefined;
const local = new LocalIdentity("pf22a2-check-signing-key-0123456789abcdef", () => Date.now());
type Res = { status: number; body: any };
let BASE = "";
const call = async (method: string, path: string, token: string, body?: unknown): Promise<Res> => {
  const r = await fetch(`${BASE}/api/platform/custom-fields${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

try {
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const firmOf = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firmOf("sample-firm"), B = firmOf("sample-solo");
  type Role = "OWNER" | "CASE_OFFICER" | "READ_ONLY";
  const person = async (name: string, role: Role, firm = A) => {
    const s = await db.platformStaff.create({ data: { firmId: firm, email: `${name}@pf22a.example.com`, displayName: `Sample ${name}`, actorId: `pf22a-${name}`, status: "ACTIVE" } });
    await db.platformRoleGrant.create({ data: { firmId: firm, staffId: s.id, role, grantedBy: "seed:pf22a" } });
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role = '${role}'`).split(",");
    const ctx = { staffId: s.id, firmId: firm, firmKey: firm === A ? "sample-firm" : "sample-solo", roles: [role], keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" as const };
    return { id: s.id, ctx, token: local.issue(s.id, { authTimeMs: Date.now() - 60_000, secondStep: true }) };
  };
  const owner = await person("owner", "OWNER"), agent = await person("agent", "CASE_OFFICER"), other = await person("other", "CASE_OFFICER");
  const reader = await person("reader", "READ_ONLY"), ownerB = await person("owner-b", "OWNER", B);

  // "everyone sees all" is on by default (platform.everyone_sees_all); off here, so each Agent sees their own.
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  const ports = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports as never), pros = new Prospects(db, ports as never);
  clearingConflicts(db, { prospects: Prospects.prototype });
  const lead = await leads.add(agent.ctx as never, { requestId: randomUUID(), givenNames: "Ana", familyName: "Sample", email: "ana.pf22a@example.com", source: "Phone call" }) as { id: string; person: { id: string } };
  const prospect = (await pros.engage(agent.ctx as never, lead.id)) as { id: string };

  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, PlatformClock, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }, ...feature.providers];
  @Module({ controllers: feature.controllers as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false });
  await nest.listen(0, "127.0.0.1"); app = nest as never;
  BASE = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  ok("PF-22a C1 pass: the front office registers its three kinds at start-up", nest.get(CustomFieldRegistry).kinds().join() === "fo_prospect,fo_person,fo_company");

  // ------------------------------------------------------------------ C2: definitions
  const add = (who: { token: string }, body: Record<string, unknown>) => call("POST", "", who.token, body);
  const ref = await add(owner, { kind: "fo_prospect", label: "Referral partner", type: "SELECT", required: true, options: ["Maple Law", "Northgate Legal"] });
  ok("PF-22a C2 pass: an Owner adds a required SELECT \"Referral partner\" to prospects; its key comes from the label; audited",
    ref.status === 201 && ref.body.key === "referral_partner" && ref.body.required === true && ref.body.options.length === 2 && sql(`select count(*) from audit_event where action = 'custom_field.added' and entity_key = '${ref.body.id}'`) === "1", ref);
  const byAgent = await add(agent, { kind: "fo_prospect", label: "Budget", type: "NUMBER" });
  ok("PF-22a C2 fail: an Agent without agent/custom-field:manage cannot add a field (403), nothing made", byAgent.status === 403 && sql(`select count(*) from plat_custom_field where label = 'Budget'`) === "0", byAgent);
  const unknown = await add(owner, { kind: "case_thing", label: "X", type: "TEXT" });
  const unknownRead = await call("GET", "?kind=nope", agent.token);
  ok("PF-22a C2 fail: an unregistered record kind → 400 UNKNOWN_KIND (add and read)", unknown.status === 400 && unknown.body.code === "UNKNOWN_KIND" && unknownRead.status === 400, unknown);
  const noChoices = await add(owner, { kind: "fo_prospect", label: "Tier", type: "SELECT", options: [] });
  const twin = await add(owner, { kind: "fo_prospect", label: "Tier", type: "SELECT", options: ["Gold", " gold"] });
  ok("PF-22a C2 fail: a SELECT with no choices, or the same choice twice, → 422 at options", noChoices.status === 422 && noChoices.body.fields?.options === "Add at least one choice." && twin.status === 422 && /already a choice/.test(twin.body.fields?.options), [noChoices.body, twin.body]);
  const sameLabel = await add(owner, { kind: "fo_prospect", label: "referral PARTNER", type: "TEXT" });
  ok("PF-22a C2 fail: a second active field with the same label → 422 at label", sameLabel.status === 422 && !!sameLabel.body.fields?.label, sameLabel);
  const due = await add(owner, { kind: "fo_prospect", label: "Follow-up date", type: "DATE" });
  ok("PF-22a C2 pass: a DATE field is added after it, in second place", due.status === 201 && due.body.position === 1, due);
  for (let i = 3; i <= 50; i++) await add(owner, { kind: "fo_company", label: `Field ${i}`, type: "TEXT" });
  const filler = await add(owner, { kind: "fo_company", label: "Field 1", type: "TEXT" }), extra = await add(owner, { kind: "fo_company", label: "Field 2", type: "TEXT" });
  const over = await add(owner, { kind: "fo_company", label: "Field 51", type: "TEXT" });
  ok("PF-22a C2 pass: 50 fields fit on companies", filler.status === 201 && extra.status === 201 && sql(`select count(*) from plat_custom_field where entity_kind = 'fo_company' and archived_at is null`) === "50");
  ok("PF-22a C2 fail: the 51st → 422 LIMIT_REACHED naming the limit", over.status === 422 && over.body.code === "LIMIT_REACHED" && /50 fields/.test(over.body.detail), over);
  const list = await call("GET", "?kind=fo_prospect", agent.token);
  ok("PF-22a C2 pass: any staff member reads the definitions in order, with the limit", list.status === 200 && list.body.fields.map((f: { key: string }) => f.key).join() === "referral_partner,follow_up_date" && list.body.limit === 50, list);

  // ------------------------------------------------------------------ C3: values
  const path = `/values/fo_prospect/${prospect.id}`;
  const v0 = await call("GET", path, agent.token);
  ok("PF-22a C3 pass: the prospect's own Agent reads its fields, empty, with canEdit and a version; the required one is missing",
    v0.status === 200 && v0.body.canEdit === true && v0.body.version === "0" && v0.body.fields.length === 2 && v0.body.missing.join() === "referral_partner", v0);
  const tomorrow = await call("PUT", path, agent.token, { version: v0.body.version, values: { referral_partner: "Maple Law", follow_up_date: "tomorrow" } });
  const offList = await call("PUT", path, agent.token, { version: v0.body.version, values: { referral_partner: "Someone else" } });
  ok("PF-22a C3 fail: a DATE refuses \"tomorrow\" and a SELECT refuses a choice not listed (422, the field named), nothing saved",
    tomorrow.status === 422 && /real date/.test(tomorrow.body.fields?.follow_up_date) && offList.status === 422 && /listed choices/.test(offList.body.fields?.referral_partner) && sql(`select count(*) from plat_custom_value`) === "0", [tomorrow.body, offList.body]);
  const blank = await call("PUT", path, agent.token, { version: v0.body.version, values: { follow_up_date: "2026-12-15" } });
  ok("PF-22a C3 fail: the required field left empty → 422 \"Fill in Referral partner: your firm requires it.\"", blank.status === 422 && blank.body.fields?.referral_partner === "Fill in Referral partner: your firm requires it.", blank);
  const saved = await call("PUT", path, agent.token, { version: v0.body.version, values: { referral_partner: "Maple Law", follow_up_date: "2026-12-15" } });
  ok("PF-22a C3 pass: valid values save; the version moves on; one audit line with the values in before/after and none in the summary",
    saved.status === 200 && saved.body.values.referral_partner === "Maple Law" && saved.body.values.follow_up_date === "2026-12-15" && saved.body.version !== "0" && saved.body.missing.length === 0
      && sql(`select count(*) from audit_event where action = 'custom_field.values_set' and entity_key = 'fo_prospect:${prospect.id}'`) === "1"
      && sql(`select count(*) from audit_event where action = 'custom_field.values_set' and summary like '%Maple%'`) === "0" && sql(`select count(*) from audit_event where action = 'custom_field.values_set' and detail::text like '%Maple Law%'`) === "1", saved);
  const stale = await call("PUT", path, agent.token, { version: v0.body.version, values: { follow_up_date: "2026-12-16" } });
  ok("PF-22a C3 fail: a save on the version read before → 409 STALE_VERSION, nothing changed", stale.status === 409 && stale.body.code === "STALE_VERSION" && sql(`select count(*) from plat_custom_value where value = '"2026-12-15"'`) === "1", stale);
  const otherRead = await call("GET", path, other.token), otherPut = await call("PUT", path, other.token, { version: saved.body.version, values: { follow_up_date: "2027-01-01" } });
  ok("PF-22a C3 fail: an Agent who cannot see the prospect gets 404 on its values (read and write)", otherRead.status === 404 && otherPut.status === 404, [otherRead.status, otherPut.status]);
  const personRead = await call("GET", `/values/fo_person/${lead.person.id}`, agent.token), personOther = await call("GET", `/values/fo_person/${lead.person.id}`, other.token);
  ok("PF-22a C3 pass/fail: the person on the Agent's lead is readable to them (challenge m10), a 404 to the other Agent", personRead.status === 200 && personOther.status === 404, [personRead.status, personOther.status]);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  const readerGet = await call("GET", path, reader.token), readerPut = await call("PUT", path, reader.token, { version: saved.body.version, values: { follow_up_date: "2027-01-01" } });
  ok("PF-22a C3 pass/fail: with everyone-sees-all, a Read-only person reads the values (canEdit false) and a PUT → 403", readerGet.status === 200 && readerGet.body.canEdit === false && readerPut.status === 403, [readerGet.body, readerPut.status]);
  const badId = await call("GET", "/values/fo_prospect/not-a-uuid", agent.token), badKind = await call("GET", `/values/case_x/${prospect.id}`, agent.token);
  const emptyPatch = await call("PATCH", `/${ref.body.id}`, owner.token, {});
  ok("PF-22a C3 fail: a malformed id → 404; an unregistered kind in the record's address → 404 (PF-28: a path is an id); a PATCH naming nothing → 422", badId.status === 404 && badKind.status === 404 && emptyPatch.status === 422, [badId.status, badKind.status, emptyPatch.status]);

  // ------------------------------------------------------------------ C4: archive with a confirm
  const archive = await call("PATCH", `/${due.body.id}`, owner.token, { archived: true });
  ok("PF-22a C4 fail: archiving a field with values without confirm → 409 FIELD_IN_USE naming 1 prospect, still active",
    archive.status === 409 && archive.body.code === "FIELD_IN_USE" && archive.body.count === 1 && /1 prospect have/.test(archive.body.detail) && sql(`select archived_at is null from plat_custom_field where id = '${due.body.id}'`) === "t", archive);
  const agentArchive = await call("PATCH", `/${due.body.id}`, agent.token, { archived: true, confirm: true });
  ok("PF-22a C4 fail: an Agent cannot archive (403)", agentArchive.status === 403);
  const archived = await call("PATCH", `/${due.body.id}`, owner.token, { archived: true, confirm: true });
  const after = await call("GET", path, agent.token);
  ok("PF-22a C4 pass: with confirm the field is archived: gone from the record and the list, its value kept",
    archived.status === 200 && archived.body.archivedAt !== null && !after.body.fields.some((f: { key: string }) => f.key === "follow_up_date") && !("follow_up_date" in after.body.values)
      && sql(`select count(*) from plat_custom_value where field_id = '${due.body.id}'`) === "1" && (await call("GET", "?kind=fo_prospect", agent.token)).body.fields.length === 1, [archived.body, after.body]);
  const writeArchived = await call("PUT", path, agent.token, { version: after.body.version, values: { follow_up_date: "2027-02-02" } });
  ok("PF-22a C4 fail: an archived field takes no value (422 at the key)", writeArchived.status === 422 && !!writeArchived.body.fields?.follow_up_date, writeArchived);
  const back = await call("PATCH", `/${due.body.id}`, owner.token, { archived: false });
  const shown = await call("GET", path, agent.token);
  ok("PF-22a C4 pass: un-archive shows the field and its kept value again", back.status === 200 && back.body.archivedAt === null && shown.body.values.follow_up_date === "2026-12-15", [back.status, back.body.archivedAt, shown.body.values]);

  // ------------------------------------------------------------------ C5: type frozen, choices in use kept
  const retype = await call("PATCH", `/${due.body.id}`, owner.token, { type: "TEXT" });
  ok("PF-22a C5 fail: a type change on a field with values → 409 TYPE_FROZEN, type unchanged", retype.status === 409 && retype.body.code === "TYPE_FROZEN" && sql(`select type from plat_custom_field where id = '${due.body.id}'`) === "DATE", retype);
  const unused = await add(owner, { kind: "fo_person", label: "Nickname", type: "TEXT" });
  const retypeUnused = await call("PATCH", `/${unused.body.id}`, owner.token, { type: "LONG_TEXT" });
  ok("PF-22a C5 pass: a field with no values changes its type", retypeUnused.status === 200 && retypeUnused.body.type === "LONG_TEXT", retypeUnused);
  const drop = await call("PATCH", `/${ref.body.id}`, owner.token, { options: ["Northgate Legal"] });
  ok("PF-22a C5 fail: removing a choice in use → 409 OPTION_IN_USE naming it and the count", drop.status === 409 && drop.body.code === "OPTION_IN_USE" && drop.body.option === "Maple Law" && drop.body.count === 1, drop);
  const grow = await call("PATCH", `/${ref.body.id}`, owner.token, { options: ["Maple Law", "Northgate Legal", "Harbour Partners"], position: 1 });
  const defs = await call("GET", "?kind=fo_prospect", owner.token);
  ok("PF-22a C5 pass: a new choice is added to a field in use; it moves to second place; the list counts its use",
    grow.status === 200 && grow.body.options.length === 3 && defs.body.fields[1].key === "referral_partner" && defs.body.fields[1].optionUse["Maple Law"] === 1 && defs.body.fields[1].valueCount === 1, defs.body);

  // ------------------------------------------------------------------ C6: walls
  const bList = await call("GET", "?kind=fo_prospect", ownerB.token), bRead = await call("GET", path, ownerB.token), bPatch = await call("PATCH", `/${ref.body.id}`, ownerB.token, { label: "Taken" });
  ok("PF-22a C6 pass: firm B lists no fields of firm A", bList.status === 200 && bList.body.fields.length === 0, bList.body);
  ok("PF-22a C6 fail: firm A's prospect and field are a 404 to firm B", bRead.status === 404 && bPatch.status === 404, [bRead.status, bPatch.status]);
} catch (e) {
  ok("unexpected", false, String((e as Error)?.stack ?? e));
} finally {
  await app?.close();
  await db.$disconnect?.();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
