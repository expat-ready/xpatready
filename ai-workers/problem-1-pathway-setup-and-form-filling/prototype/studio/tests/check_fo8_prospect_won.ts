// FO-8 (map row 72; brief design/build-lead-c-briefs/FO-8.md; P-560; contract v0.1 §4, §5): the case side takes
// `prospect.won`. Named cases FO-8 DW1-DW7 and the undo answer, each a pass and a fail, on an isolated copy (the
// configured checkpoint): real leads, prospects and Converts through the front office's own services, the subscriber and
// the catch-up called as a delivery would, and an in-process app with the case opening, PF-4's sign-in and guard and this
// row's one route. No browser, no model call (US$0).
//   zsh studio/tools/isolated.sh fo8_won 4642 start && tsx studio/tests/check_fo8_prospect_won.ts 4642 xr_studio_fo8_won
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { AuditPort } from "../ports/audit.ts";
import { EVENT } from "../ports/events.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const PORT = Number(process.argv[2] ?? 4642), COPY = process.argv[3] ?? "xr_studio_fo8_won";
process.env.DATABASE_URL = `postgresql://xr_studio@127.0.0.1:54329/${COPY}`;   // core.ts reads it once, when first imported
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];
const BIN = "/opt/homebrew/opt/postgresql@18/bin";
const sql = (q: string) => execFileSync(join(BIN, "psql"), [process.env.DATABASE_URL!, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));
type Res = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- responses read loosely, as in the other checks
const call = async (base: string, method: string, path: string, o: { token?: string; actor?: string; body?: unknown } = {}): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.actor) headers["x-actor"] = o.actor;
  const r = await fetch(`${base}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const t = await r.text(); let j: unknown = t; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: j };
};
const thrown = async (fn: () => Promise<unknown>) => { try { await fn(); return ""; } catch (e) { return String((e as Error)?.message ?? e) || "error"; } };
const copyBase = `http://127.0.0.1:${PORT}`;
const comboId = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id)`);
if (!comboId()) { const l = await call(copyBase, "POST", "/api/demo/load", { actor: "user-A", body: { sample: "configured" } }); if (l.status >= 300) { console.error("STOP  the configured checkpoint did not load", l.status); process.exit(2); } }
const VV = comboId();

const { ConfigReadGuard, Db, Workspace, Audit } = await import("../api/src/core.ts");
const { Programs } = await import("../api/src/programs.ts");
const { Runtime, RuntimeController } = await import("../api/src/runtime.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { PgEntitlements } = await import("../api/src/platform/entitlements/limits.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
const { dutiesOf } = await import("../api/src/platform/identity/keys.ts");
const { auditEvent, platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../api/src/platform/settings.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { foPersonPort } = await import("../api/src/front-office/people/fo-person-port.ts");
const { FO_PERSON_PORT } = await import("../ports/fo-person.ts");
const { Leads } = await import("../api/src/front-office/sales/leads.ts");
const { Prospects } = await import("../api/src/front-office/sales/prospects.ts");
const { clearingConflicts } = await import("./lib/conflict-clear.ts");
const { Corporate } = await import("../api/src/front-office/sales/corporate/service.ts");
const { catchUpProspectsWon, offerOf, onProspectWon, OFFER_REFUSED, PROSPECT_WON_ACTOR } = await import("../api/src/case-clients/prospect-won.ts");
type StaffContext = import("../api/src/platform/identity/keys.ts").StaffContext;
type Deps = import("../api/src/case-clients/prospect-won.ts").ProspectWonDeps;

const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo8-check-signing-key-0123456789abcdef0", () => clock.now());
const providers = [Db, Workspace, Audit, { provide: Programs, useValue: { startableMissing: async () => [] } }, Runtime, { provide: FO_PERSON_PORT, useValue: foPersonPort }, { provide: APP_GUARD, useClass: ConfigReadGuard },
  { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard }];
@Module({ controllers: [RuntimeController, PlatformIdentityController] as never[], providers: providers as never[] }) class TestApp {}
const nest = await NestFactory.create(TestApp, { logger: false, abortOnError: false });
await nest.listen(0, "127.0.0.1");
const BASE = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
try {
  const db = nest.get(Db), tag = `${process.pid}-${Date.now().toString(36)}`;
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  nest.get(Runtime).useEntitlements((tx) => new PgEntitlements(tx));   // PF-15c: the real limits on the Sample plans (P-710), bound explicitly (this app loads no features/platform-entitlements.ts)
  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), B = firm("sample-solo");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), T = ctxOf("user-T"), SOLO = ctxOf("user-S");
  const auditWs = await platformAuditWorkspaceId(db as never);
  for (const f of [A, B]) await writeSetting(db, { firmId: f, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: auditWs });
  const ports = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports), pros = new Prospects(db, ports), corp = new Corporate(db, ports);
  clearingConflicts(db, { prospects: Prospects.prototype });   // FO-13c: the conflict check first
  const deps: Deps = { workspaceId: await nest.get(Workspace).id(), foPerson: foPersonPort, audit: auditEvent };
  // A service of firm A on the released combination, so a lead can be "interested in" it (firm-seed makes these from releases).
  const service = sql(`select id from fo_service where firm_id = '${A}' and combination_id = '${VV}'`)
    || sql(`insert into fo_service (firm_id, label, combination_id, sort_order, created_by) values ('${A}', 'Sample service', '${VV}', 900, 'seed:fo8-test') returning id`);
  let n = 0;
  const lead = async (given: string, who: StaffContext = R, extra: Record<string, unknown> = {}) => (await leads.add(who, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}-${tag}-${++n}@example.com`, source: "Phone call", ...extra })) as { id: string; person: { id: string } };
  /** A converted person prospect (its `prospect.won` is in the outbox, not delivered). */
  const wonPerson = async (given: string, who: StaffContext = R, extra: Record<string, unknown> = {}) => { const l = await lead(given, who, extra); const p = await pros.engage(who, l.id) as { id: string }; await pros.convert(who, p.id, {}); return { id: p.id, personId: l.person.id }; };
  const event = (prospectId: string) => { const [firmId, payload] = sql(`select firm_id || '~' || payload::text from module_event where type = '${EVENT.PROSPECT_WON}' and subject_id = '${prospectId}' order by seq desc limit 1`).split("~"); return { type: EVENT.PROSPECT_WON as string, firmId, payload: JSON.parse(payload) }; };
  /** The outbox refuses edits (insert-only), so a test alters a stored row with the triggers off. */
  const alter = (prospectId: string, path: string, json: string) => sql(`set session_replication_role = replica; update module_event set payload = jsonb_set(payload, '${path}', '${json}'::jsonb) where type = '${EVENT.PROSPECT_WON}' and subject_id = '${prospectId}'`);
  const clientOf = (prospectId: string) => sql(`select id from case_client where prospect_id = '${prospectId}'`);
  const written = (prospectId: string) => [count("case_client", `prospect_id = '${prospectId}'`), count("module_event", `type = '${EVENT.CLIENT_CREATED}' and payload->>'prospect_id' = '${prospectId}'`), count("audit_event", `entity = 'fo_prospect' and entity_key = '${prospectId}' and action = '${EVENT.CLIENT_CREATED}'`)].join(":");
  const counter = (key = "sample-firm") => sql(`select coalesce((select next_value from case_client_counter where firm_key = '${key}' and workspace_id = '${deps.workspaceId}'), 0)`);
  const tokenOf = async (actorId: string, firmKey: string) => { const r = await call(BASE, "POST", "/api/platform/session/local", { body: { firmKey, actorId, secondStep: true } }); if (r.status !== 200) throw new Error(`sign-in ${actorId}: ${JSON.stringify(r.body)}`); return r.body.token as string; };
  const TR = await tokenOf("user-R", "sample-firm"), TS = await tokenOf("user-S", "sample-solo");
  const openCase = (clientId: string, token: string | null = TR, body: Record<string, unknown> = { clientActor: "user-P", representative: "user-R", caseOfficers: ["user-O"] }, actor?: string) => call(BASE, "POST", `/api/runtime/clients/${clientId}/open-case`, { token: token ?? undefined, actor, body });
  const casesOf = (clientId: string) => count("runtime_case", `client_id = '${clientId}'`);
  const opened = (prospectId: string) => count("module_event", `type = '${EVENT.CASE_OPENED}' and payload->>'prospect_id' = '${prospectId}'`);

  // ------------------------------------------------------------------------------------------ DW1: one client, once
  const ana = await wonPerson("Ana", R, { interestedIn: service });
  const first = await onProspectWon(db, event(ana.id), deps);
  const row = () => sql(`select row_to_json(k)::text from (select display_name, display_kind, fo_person_id, fo_company_id, file_owner, firm_id, firm_key, created_by from case_client where prospect_id = '${ana.id}') k`);
  const c = JSON.parse(row());
  ok("FO-8 DW1 pass: one prospect.won makes exactly one client: the person's name, PERSON, linked to the front-office person, the file owner the prospect's owner, made by system:prospect.won; one client.created, one audit line",
    first?.made === true && written(ana.id) === "1:1:1" && c.display_name === "Ana Sample" && c.display_kind === "PERSON" && c.fo_person_id === ana.personId && c.fo_company_id === null && c.file_owner === R.staffId && c.firm_id === A && c.created_by === PROSPECT_WON_ACTOR
    && /^CL-\d{5}$/.test(first!.clientNumber), [first, written(ana.id), c]);
  const ev = sql(`select payload::text from module_event where type = '${EVENT.CLIENT_CREATED}' and subject_id = '${first!.clientId}'`);
  ok("FO-8 DW1 pass: client.created carries { firm_id, prospect_id, client_id, client_number } and no name; the audit line holds ids and the client code, never the name outside its after values",
    JSON.stringify(Object.keys(JSON.parse(ev)).sort()) === JSON.stringify(["client_id", "client_number", "firm_id", "prospect_id"]) && !ev.includes("Ana")
    && !sql(`select summary || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(detail) e(k, v) where k !~ '_(before|after)$')::text from audit_event where entity_key = '${ana.id}' and action = '${EVENT.CLIENT_CREATED}'`).includes("Ana"), ev);
  // R1.8 (QA-594, P-687): the client's name is the line's after value, in full, and nowhere else on it.
  ok("FO-8 DW1 pass (R1.8): the client.created line holds the new client's name as an after value", sql(`select detail::text from audit_event where entity_key = '${ana.id}' and action = '${EVENT.CLIENT_CREATED}'`).includes("Ana Sample"));
  const n0 = counter(), again = await onProspectWon(db, event(ana.id), deps);
  ok("FO-8 DW1 fail: the same event delivered again makes none: the same client answered, no second client, event, audit line or client number", again?.made === false && again.clientId === first!.clientId && written(ana.id) === "1:1:1" && counter() === n0, [again, written(ana.id)]);
  const bo = await wonPerson("Bo"), three = await Promise.all([0, 1, 2].map(() => onProspectWon(db, event(bo.id), deps)));
  ok("FO-8 DW1 fail: three deliveries at once make one client (one made, two found)", three.filter((r) => r?.made).length === 1 && new Set(three.map((r) => r?.clientId)).size === 1 && written(bo.id) === "1:1:1", three);
  const cy = await wonPerson("Cy");
  const other = await onProspectWon(db, { ...event(cy.id), type: EVENT.PROSPECT_LOST }, deps), bad = await thrown(() => onProspectWon(db, { ...event(cy.id), payload: { prospect_id: cy.id } }, deps));
  ok("FO-8 DW1 fail: another event type is ignored, and a payload that is not prospect.won's is refused: nothing written", other === null && !!bad && written(cy.id) === "0:0:0", [other, bad.slice(0, 120)]);

  // Review M1, breaker M1, m1-m3: the delivery is a signal; the outbox's own newest row decides what is made.
  const dan = await lead("Dan"), danP = await pros.engage(R, dan.id) as { id: string };
  const forged = await onProspectWon(db, { ...event(ana.id), payload: { ...event(ana.id).payload, prospect_id: danP.id } }, deps);
  ok("FO-8 DW1 fail (breaker m3): a delivery for a prospect that was never won makes nothing", forged === null && written(danP.id) === "0:0:0", forged);
  const una = await wonPerson("Una"), stale = event(una.id);
  await pros.undoConvert(R, una.id, { reason: "Converted by mistake" });
  const afterUndo = await onProspectWon(db, stale, deps), swept = await catchUpProspectsWon(db, deps);
  ok("FO-8 DW1 fail (review M1): a prospect.won delivered after its Convert was undone makes nothing, and the catch-up leaves it alone (not made, not failed)",
    afterUndo === null && written(una.id) === "0:0:0" && !swept.results.some((r) => r.prospectId === una.id) && !swept.failed.some((r) => r.prospectId === una.id), [afterUndo, swept.failed]);
  await pros.convert(R, una.id, {});
  const renamed = await onProspectWon(db, { ...stale, payload: { ...stale.payload, answers: { ...stale.payload.answers, "person.given_names": "Forged" }, owner_staff_id: SOLO.staffId } }, deps);
  ok("FO-8 DW1 pass (review M1, breaker m3): converted again, the client is made from the outbox's own row: a delivered copy with another name and another firm's staff member as owner changes nothing",
    renamed?.made === true && sql(`select display_name || '|' || file_owner from case_client where prospect_id = '${una.id}'`) === `Una Sample|${R.staffId}`, renamed);
  const long = await wonPerson("L".repeat(100), R, { familyName: "M".repeat(100), interestedIn: service }), longClient = await onProspectWon(db, event(long.id), deps);
  const longCase = await openCase(longClient!.clientId);
  ok("FO-8 DW1 pass (breaker m1, m2): a name at the front office's own limit (100 + 100) still makes the client (cut to 200), and the offer pre-fills a principal the opening accepts (120)",
    longClient?.made === true && sql(`select length(display_name) from case_client where id = '${longClient.clientId}'`) === "200" && longCase.status === 201
    && sql(`select length(label) from answer_subject s join case_participant p on p.subject_id = s.id where p.case_id = '${longCase.body?.id}' and p.role = 'principal'`) === "120", [longClient, longCase.status, longCase.body?.detail]);

  // ------------------------------------------------------------------------------------------ DW2: a company client
  const lena = await lead("Lena"), pine = await corp.engage(R, lena.id, { companyName: `Pine Bakery ${tag} Ltd` }) as { id: string };
  await pros.convert(R, pine.id, {});
  const realSubject = JSON.stringify(event(pine.id).payload.subject);
  alter(pine.id, "{subject}", JSON.stringify({ subject: "PERSON", personId: lena.person.id }));
  const asPerson = await thrown(() => onProspectWon(db, event(pine.id), deps));
  alter(pine.id, "{subject}", realSubject);
  ok("FO-8 DW2 fail: a company prospect's event that says it is a person is refused by the person port; no client", /company/i.test(asPerson) && written(pine.id) === "0:0:0", asPerson.slice(0, 200));
  const co = await onProspectWon(db, event(pine.id), deps);
  const k = JSON.parse(sql(`select row_to_json(k)::text from (select display_name, display_kind, fo_person_id, fo_company_id, contact from case_client where prospect_id = '${pine.id}') k`));
  ok("FO-8 DW2 pass: a company prospect makes a COMPANY client named after the company, linked to the front-office company, with its contact person by id (A44)",
    co?.made === true && written(pine.id) === "1:1:1" && k.display_kind === "COMPANY" && k.display_name === `Pine Bakery ${tag} Ltd` && k.fo_person_id === null
    && k.fo_company_id === sql(`select subject_company_id from fo_prospect where id = '${pine.id}'`) && k.contact?.contactPersonId === lena.person.id && !JSON.stringify(k.contact).includes("Lena"), k);

  await pros.undoConvert(R, pine.id, { reason: "It is the person, not the company" });
  const retyped = await corp.changeType(R, pine.id, { type: "INDIVIDUAL" }).then(() => "", (e) => String(e?.response?.detail ?? e));
  await pros.convert(R, pine.id, {});
  const sweep = await catchUpProspectsWon(db, deps), follows = sweep.results.find((r) => r.prospectId === pine.id), again2 = await catchUpProspectsWon(db, deps), k2 = JSON.parse(sql(`select row_to_json(k)::text from (select display_name, display_kind, fo_person_id, fo_company_id, contact from case_client where prospect_id = '${pine.id}') k`));
  ok("FO-8 DW2 fail (breaker M2): won again as an individual, the catch-up takes the same client (no case yet) again and it follows the prospect, once: PERSON, the person's name and record, no company left on it, one audit line; no second client or client.created",
    retyped === "" && follows?.made === false && follows.clientId === co!.clientId && k2.display_kind === "PERSON" && k2.display_name === "Lena Sample" && k2.fo_person_id === lena.person.id && k2.fo_company_id === null && k2.contact === null
    && written(pine.id) === "1:1:1" && count("audit_event", `entity_key = '${pine.id}' and action = 'client.subject_changed'`) === 1 && !again2.results.some((r) => r.prospectId === pine.id), [retyped, follows, k2]);

  // Breaker round 2 (R2-M1, R2-M2): won again as the other type, a click before or during the client's update opens nothing.
  const bia = await lead("Bia", R, { interestedIn: service }), birch = await corp.engage(R, bia.id, { companyName: `Birch ${tag} Ltd` }) as { id: string };
  await pros.convert(R, birch.id, {});
  const birchClient = (await onProspectWon(db, event(birch.id), deps))!.clientId;
  await pros.undoConvert(R, birch.id, { reason: "It is the person" }); await corp.changeType(R, birch.id, { type: "INDIVIDUAL" }); await pros.convert(R, birch.id, {});
  const early = await openCase(birchClient);
  ok("FO-8 DW2 fail (breaker R2-M1): a click before the client has followed its prospect opens nothing (409 OFFER_CHANGED, plain words)",
    early.status === 409 && early.body?.code === "OFFER_CHANGED" && early.body?.detail === OFFER_REFUSED.CHANGED && count("runtime_case", `client_id = '${birchClient}'`) === 0, [early.status, early.body]);
  const slowAudit: AuditPort<never> = { async record(tx, e) { if (e.action === "client.subject_changed") await new Promise((r) => setTimeout(r, 1500)); return auditEvent.record(tx, e); } };
  const slow = onProspectWon(db, event(birch.id), { ...deps, audit: slowAudit as never });
  await new Promise((r) => setTimeout(r, 400));
  const during = await openCase(birchClient);
  await slow;
  const after = await openCase(birchClient);
  ok("FO-8 DW2 fail (breaker R2-M2): a click while the client is being updated waits for it and opens nothing (409 OFFER_CHANGED); the client is the person with no case; the next click opens the case with the person as principal",
    during.status === 409 && during.body?.code === "OFFER_CHANGED" && sql(`select display_kind || '|' || display_name from case_client where id = '${birchClient}'`) === "PERSON|Bia Sample" && after.status === 201 && count("runtime_case", `client_id = '${birchClient}'`) === 1
    && sql(`select label from answer_subject s join case_participant p on p.subject_id = s.id where p.case_id = '${after.body?.id}' and p.role = 'principal'`) === "Bia Sample", [during.status, during.body, after.status, after.body?.detail]);
  // Review N2: the firm's opening lock itself, on the direct route (the offer route is refused before it gets there).
  const cia = await lead("Cia", R, { interestedIn: service }), cedar = await corp.engage(R, cia.id, { companyName: `Cedar ${tag} Ltd` }) as { id: string };
  await pros.convert(R, cedar.id, {});
  const cedarClient = (await onProspectWon(db, event(cedar.id), deps))!.clientId;
  await pros.undoConvert(R, cedar.id, { reason: "It is the person" }); await corp.changeType(R, cedar.id, { type: "INDIVIDUAL" }); await pros.convert(R, cedar.id, {});
  let tChanged = 0, tDirect = 0;
  const changing = onProspectWon(db, event(cedar.id), { ...deps, audit: slowAudit as never }).then(() => { tChanged = Date.now(); });
  await new Promise((r) => setTimeout(r, 400));
  const directDuring = await call(BASE, "POST", "/api/runtime/cases", { actor: "user-O", body: { combinationId: VV, clientId: cedarClient, clientActor: "user-P", principal: { displayName: "Cia Sample" }, representative: "user-R", caseOfficers: ["user-O"] } }).then((r) => { tDirect = Date.now(); return r; });
  await changing;
  ok("FO-8 DW2 fail (review N2, breaker R2-M2): a case opened by the direct route while the client is being updated waits for the update's commit (the firm's opening lock), so no case is ever opened on a client that then changes under it",
    directDuring.status === 201 && tDirect >= tChanged && sql(`select display_kind from case_client where id = '${cedarClient}'`) === "PERSON" && count("audit_event", `entity_key = '${cedar.id}' and action = 'client.subject_changed'`) === 1, [directDuring.status, tDirect - tChanged]);
  const acc = await wonPerson("q\u0301".repeat(50), R, { familyName: "q\u0301".repeat(50), interestedIn: service, email: `acc-${tag}@example.com` }), accCase = await openCase((await onProspectWon(db, event(acc.id), deps))!.clientId);
  const accName = sql(`select label from answer_subject s join case_participant p on p.subject_id = s.id where p.case_id = '${accCase.body?.id}' and p.role = 'principal'`);
  ok("FO-8 DW1 pass (breaker R2-m2): a cut name never ends on a letter that lost its accent (q + U+0301 has no composed form, so a code-point cut would end on the bare q)", accCase.status === 201 && accName.length <= 120 && accName.length >= 118 && accName.endsWith("q\u0301"), [accCase.status, accCase.body?.detail, accName.length]);
  const emo = await wonPerson(`A${"\u{1F600}".repeat(70)}`, R, { interestedIn: service, email: `emo-${tag}@example.com` }), emoClient = (await onProspectWon(db, event(emo.id), deps))!.clientId;
  const emoCase = await openCase(emoClient);
  const emoName = sql(`select label from answer_subject s join case_participant p on p.subject_id = s.id where p.case_id = '${emoCase.body?.id}' and p.role = 'principal'`);
  ok("FO-8 DW1 pass (breaker R2-m1, R2-m2): a name of emoji past the opening's 120 (counted as the opening counts) is cut at a whole character and the case opens", emoCase.status === 201 && emoName.length <= 120 && emoName.length >= 118 && !/[\uD800-\uDBFF]$/.test(emoName), [emoCase.status, emoCase.body?.detail, emoName.length]);

  // ------------------------------------------------------------------------------------------ DW3: "Open a case?"
  const anaClient = first!.clientId;
  ok("FO-8 DW3 pass: the offer opens nothing by itself: after the client is made there is no case and no case.opened", casesOf(anaClient) === 0 && opened(ana.id) === 0);
  const closed = await Promise.all([openCase(anaClient, null), openCase(anaClient, null, undefined, "user-R"), openCase(anaClient, await (async () => { const s = await db.platformStaff.create({ data: { firmId: A, actorId: `fo8-ro-${tag}`, email: `fo8-ro-${tag}@sample.invalid`, displayName: "Sample Reader" } }); await db.platformRoleGrant.create({ data: { firmId: A, staffId: s.id, role: "READ_ONLY", grantedBy: "seed:fo8" } }); return tokenOf(`fo8-ro-${tag}`, "sample-firm"); })())]);
  ok("FO-8 DW3 fail: open-case needs a staff session with agent/case:create: no token or x-actor alone → 401, a Read-only session → 403; nothing opened", closed[0].status === 401 && closed[1].status === 401 && closed[2].status === 403 && casesOf(anaClient) === 0, closed.map((r) => r.status));
  const mgr = await db.platformStaff.create({ data: { firmId: A, actorId: `fo8-mgr-${tag}`, email: `fo8-mgr-${tag}@sample.invalid`, displayName: "Sample Case Manager" } });
  await db.platformRoleGrant.create({ data: { firmId: A, staffId: mgr.id, role: "CASE_MANAGER", grantedBy: "seed:fo8" } });
  const unlinked = await openCase(anaClient, await tokenOf(`fo8-mgr-${tag}`, "sample-firm"));
  ok("FO-8 DW3 fail: a staff member with no case user yet → 409 NO_CASE_USER in plain words; nothing opened", unlinked.status === 409 && unlinked.body?.code === "NO_CASE_USER" && casesOf(anaClient) === 0, [unlinked.status, unlinked.body]);
  const extra = await Promise.all([openCase(anaClient, TR, { clientActor: "user-P", representative: "user-R", caseOfficers: ["user-O"], clientId: randomUUID() }), openCase(anaClient, TR, { clientActor: "user-P", surprise: 1 }), openCase(anaClient, TR, { clientActor: 7 })]);
  ok("FO-8 DW3 fail (CS-V1): the body is read through its strict schema: a client id, an unknown field or a wrong type is 400 naming the field; nothing opened",
    extra.every((r) => r.status === 400) && /clientId/.test(JSON.stringify(extra[0].body)) && /surprise/.test(JSON.stringify(extra[1].body)) && /clientActor/.test(JSON.stringify(extra[2].body)) && casesOf(anaClient) === 0, extra.map((r) => [r.status, r.body?.detail ?? r.body]));
  const numbers = () => sql(`select coalesce(string_agg(next_value::text, ',' order by year), '') from firm_case_counter where firm_key = 'sample-firm'`);
  const one = await openCase(anaClient);
  const co1 = sql(`select payload::text from module_event where type = '${EVENT.CASE_OPENED}' and subject_id = '${one.body?.id}'`);
  ok("FO-8 DW3 pass: the call opens one case for the client, pre-filled (the combination the lead was interested in, the principal the client's name), with no payment asked; case.opened and its audit line written once",
    one.status === 201 && one.body?.client_record?.id === anaClient && one.body?.combination_id === VV && casesOf(anaClient) === 1 && opened(ana.id) === 1
    && JSON.parse(co1 || "{}").case_number === one.body?.case_number && JSON.parse(co1 || "{}").client_id === anaClient && JSON.parse(co1 || "{}").firm_id === A
    && sql(`select label from answer_subject s join case_participant p on p.subject_id = s.id where p.case_id = '${one.body?.id}' and p.role = 'principal'`) === "Ana Sample"
    && count("audit_event", `entity_key = '${ana.id}' and action = '${EVENT.CASE_OPENED}' and case_id = '${one.body?.id}'`) === 1, [one.status, one.body?.detail ?? one.body?.message, co1]);
  ok("FO-8 DW4 pass: case.opened was written in the opening's own transaction (the case row and the event share one transaction id)",
    sql(`select (select xmin::text from runtime_case where id = '${one.body?.id}') = (select xmin::text from module_event where type = '${EVENT.CASE_OPENED}' and subject_id = '${one.body?.id}')`) === "t");
  const num1 = numbers(), second = await openCase(anaClient);
  ok("FO-8 DW3 fail: a second call refuses (409 OFFER_USED, plain words): no second case, no second case.opened, no case number spent",
    second.status === 409 && second.body?.code === "OFFER_USED" && second.body?.detail === OFFER_REFUSED.USED && casesOf(anaClient) === 1 && opened(ana.id) === 1 && numbers() === num1, [second.status, second.body]);
  const boClient = clientOf(bo.id), race = await Promise.all([0, 1].map(() => openCase(boClient, TR, { clientActor: "user-P", representative: "user-R", caseOfficers: ["user-O"], combinationId: VV })));
  ok("FO-8 DW3 fail: two calls at once open one case (one 201, one 409 OFFER_USED; the refused one's case and number are rolled back)",
    race.map((r) => r.status).sort().join() === "201,409" && race.find((r) => r.status === 409)?.body?.code === "OFFER_USED" && casesOf(boClient) === 1 && opened(bo.id) === 1, race.map((r) => [r.status, r.body?.code ?? r.body?.detail]));
  const noInterest = await onProspectWon(db, event(cy.id), deps), unchosen = await openCase(noInterest!.clientId);
  ok("FO-8 DW3 fail: a prospect interested in no service pre-fills no combination: the call asks for one (400 on combinationId), nothing opened", unchosen.status === 400 && /combination/i.test(JSON.stringify(unchosen.body)) && casesOf(noInterest!.clientId) === 0, [unchosen.status, unchosen.body]);
  const offerOfAna = () => offerOf(db, { id: anaClient, firmId: A, prospectId: ana.id, displayName: "Ana Sample", displayKind: "PERSON" });
  const shown = await offerOfAna();
  sql(`set session_replication_role = replica; update combination set retired_at = now() where id = '${VV}'`);
  const retired = await offerOfAna();
  sql(`set session_replication_role = replica; update combination set retired_at = null where id = '${VV}'`);
  ok("FO-8 DW3 fail (breaker m6): the offer names the lead's combination only while it can open a case: released → named; retired → none", shown?.combinationId === VV && retired?.combinationId === null && retired?.state === "USED", [shown, retired]);
  const direct = await call(BASE, "POST", "/api/runtime/cases", { actor: "user-O", body: { combinationId: VV, clientActor: "user-P", principal: { displayName: "Sample Direct" }, representative: "user-R", caseOfficers: ["user-O"] } });
  const noOffer = await openCase(direct.body?.client_record?.id);
  ok("FO-8 DW3 fail: a client that came from no prospect has no offer (409 OFFER_NO_OFFER)", direct.status === 201 && noOffer.status === 409 && noOffer.body?.code === "OFFER_NO_OFFER", [direct.status, noOffer.status, noOffer.body]);

  // ------------------------------------------------------------------------------------------ DW4: one transaction
  ok("FO-8 DW4 pass: the client row, client.created and the audit line were written in one transaction (one transaction id)",
    sql(`select count(distinct x) from (select xmin::text x from case_client where id = '${anaClient}' union all select xmin::text from module_event where type = '${EVENT.CLIENT_CREATED}' and subject_id = '${anaClient}' union all select xmin::text from audit_event where entity_key = '${ana.id}' and action = '${EVENT.CLIENT_CREATED}') t`) === "1");
  const dee = await wonPerson("Dee"), n1 = counter();
  const failing: AuditPort<never> = { async record() { throw new Error("forced audit failure"); } };
  const rolled = await thrown(() => onProspectWon(db, event(dee.id), { ...deps, audit: failing as never }));
  ok("FO-8 DW4 fail: a failure after the client row (the audit line refused) rolls all of it back: no client, no event, and the client number is given back", /forced audit failure/.test(rolled) && written(dee.id) === "0:0:0" && counter() === n1, [rolled.slice(0, 120), written(dee.id), n1, counter()]);
  const retried = await onProspectWon(db, event(dee.id), deps);
  ok("FO-8 DW4 pass: the next delivery of that event makes the client, with the next number and no gap", retried?.made === true && written(dee.id) === "1:1:1" && Number(counter()) === Number(n1) + 1, [retried, counter()]);

  // ------------------------------------------------------------------------------------------ DW5: firm walls
  const eve = await wonPerson("Eve"), sol = await wonPerson("Sol", SOLO);
  const crossed = await thrown(() => onProspectWon(db, { ...event(eve.id), firmId: B }, deps));
  const wrongKey = event(eve.id); wrongKey.payload = { ...wrongKey.payload, firm_key: "sample-solo" };
  const keyed = await thrown(() => onProspectWon(db, wrongKey, deps));
  ok("FO-8 DW5 fail: firm A's event never makes a client in firm B: delivered as firm B's, or naming firm B's key, it is refused and nothing is written", !!crossed && !!keyed && written(eve.id) === "0:0:0" && count("case_client", `firm_key = 'sample-solo' and prospect_id = '${eve.id}'`) === 0, [crossed.slice(0, 120), keyed.slice(0, 120)]);
  const solo = await onProspectWon(db, event(sol.id), deps), mine = await onProspectWon(db, event(eve.id), deps);
  ok("FO-8 DW5 pass: each firm's event makes a client of its own firm, with its own firm's number", solo?.made === true && mine?.made === true && sql(`select firm_key || ':' || firm_id from case_client where id = '${solo.clientId}'`) === `sample-solo:${B}` && sql(`select firm_key from case_client where id = '${mine.clientId}'`) === "sample-firm");
  const wasB = sql(`select status from platform_firm where id = '${B}'`);
  sql(`set session_replication_role = replica; update platform_firm set status = 'DELETED' where id = '${B}'`);
  const gone = await wonPerson("Sam", SOLO).then((p) => onProspectWon(db, event(p.id), deps).then((r) => [r, written(p.id)]));
  sql(`set session_replication_role = replica; update platform_firm set status = '${wasB}' where id = '${B}'`);
  ok("FO-8 DW5 fail (breaker m4): a deleted firm's event makes no client", gone[0] === null && gone[1] === "0:0:0", gone);
  const walled = await openCase(mine!.clientId, TS, { clientActor: "user-P", combinationId: VV });
  ok("FO-8 DW5 fail: staff of firm B get 404 \"No such client.\" on firm A's client; nothing opened", walled.status === 404 && /No such client\./.test(JSON.stringify(walled.body)) && casesOf(mine!.clientId) === 0, [walled.status, walled.body]);
  const own = await openCase(solo!.clientId, TS, { clientActor: "user-P", combinationId: VV });
  ok("FO-8 DW5 pass: firm B's own staff open firm B's offer", own.status === 201 && own.body?.client_record?.id === solo!.clientId && sql(`select firm_key from runtime_case where id = '${own.body?.id}'`) === "sample-solo", [own.status, own.body?.detail ?? own.body?.message]);

  // ------------------------------------------------------------------------------------------ DW6: the representative
  const hex = (x: number) => x.toString(16).padStart(64, "0"), TPL = randomUUID();
  sql(`insert into fo_retainer_template (id, firm_id, name, kind, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${TPL}', '${A}', 'Retainer (Sample ${tag})', 'RETAINER', 'retainer-templates/${TPL}/v1.docx', '${hex(1)}', '{client.name}', 'seed:fo8-test', 'seed:fo8-test', now())`);
  /** A person prospect with a signed retainer, then converted: the signed version's merge values are `values`, and the retainer row is changed after signing to name `row`. */
  const signedThenWon = async (given: string, values: Record<string, unknown>, row: StaffContext) => {
    const l = await lead(given, R, { interestedIn: service }), p = await pros.engage(R, l.id) as { id: string }, RET = randomUUID(), VER = randomUUID();
    sql(`insert into fo_retainer (id, firm_id, kind, prospect_id, subject, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at) values ('${RET}', '${A}', 'RETAINER', '${p.id}', 'PERSON', '${l.person.id}', '${row === R ? T.staffId : R.staffId}', '${TPL}', 1, 'retainer-templates/${TPL}/v1.docx', 'staff:${R.staffId}', now());
      insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${VER}', '${A}', '${RET}', 1, '${JSON.stringify(values)}', 'retainers/${RET}/v1.docx', '${hex(11)}', 'staff:${R.staffId}');
      update fo_retainer_version set sent_at = now() where id = '${VER}'; update fo_retainer set status = 'SENT' where id = '${RET}'; update fo_retainer set status = 'CLIENT_SIGNED' where id = '${RET}'; update fo_retainer set status = 'SIGNED' where id = '${RET}';
      set session_replication_role = replica; update fo_retainer set representative_staff_id = '${row.staffId}' where id = '${RET}'`);   // the row changed after signing
    await pros.convert(R, p.id, {});
    return { id: p.id, retainer: RET, client: (await onProspectWon(db, event(p.id), deps))!.clientId };
  };
  const fay = await signedThenWon("Fay", { "client.name": "Fay Sample", "representative.staff_id": T.staffId }, R);
  const fayCase = await openCase(fay.client, TR, { clientActor: "user-P", caseOfficers: ["user-O"] });
  ok("FO-8 DW6 pass: the representative of record comes from the signed version's merge values (user-T), though the retainer row, changed after signing, and the event's own copy name user-R",
    fayCase.status === 201 && sql(`select user_id from case_team_member where case_id = '${fayCase.body?.id}' and role = 'LEAD_REPRESENTATIVE' and ended_at is null`) === "user-T"
    && event(fay.id).payload.retainer_id === fay.retainer && event(fay.id).payload.representative_actor_id === "user-R", [fayCase.status, fayCase.body?.detail ?? fayCase.body, event(fay.id).payload.representative_actor_id]);
  const gus = await signedThenWon("Gus", { "client.name": "Gus Sample" }, T);
  const gusCase = await openCase(gus.client, TR, { clientActor: "user-P", caseOfficers: ["user-O"] });
  ok("FO-8 DW6 fail: a signed version that names no representative pre-fills none: the retainer row's and the event's user-T is never used; the case opens with the firm's own default (user-R), as any opening does",
    gusCase.status === 201 && sql(`select user_id from case_team_member where case_id = '${gusCase.body?.id}' and role = 'LEAD_REPRESENTATIVE' and ended_at is null`) === "user-R" && event(gus.id).payload.representative_actor_id === "user-T", [gusCase.status, gusCase.body?.detail, event(gus.id).payload.representative_actor_id]);

  // ------------------------------------------------------------------------------------------ the undo answer (brief point 4)
  const hal = await wonPerson("Hal", R, { interestedIn: service }), halClient = (await onProspectWon(db, event(hal.id), deps))!.clientId;
  await pros.undoConvert(R, hal.id, { reason: "Converted by mistake" });
  const withdrawn = await openCase(halClient);
  ok("FO-8 undo fail: after Undo convert the offer is withdrawn (409 OFFER_WITHDRAWN, plain words) and the client stays; nothing opened", withdrawn.status === 409 && withdrawn.body?.code === "OFFER_WITHDRAWN" && withdrawn.body?.detail === OFFER_REFUSED.WITHDRAWN && written(hal.id) === "1:1:1" && casesOf(halClient) === 0, [withdrawn.status, withdrawn.body]);
  await pros.convert(R, hal.id, {});
  const reWon = await onProspectWon(db, event(hal.id), deps), reOpened = await openCase(halClient);
  ok("FO-8 undo pass: converted again, the new prospect.won makes no second client and the offer stands again: the call opens the case", reWon?.made === false && reWon.clientId === halClient && written(hal.id) === "1:1:1" && reOpened.status === 201 && casesOf(halClient) === 1, [reWon, reOpened.status, reOpened.body?.detail]);

  // ------------------------------------------------------------------------------------------ DW7: the catch-up
  const [ida, jon, kim] = [await wonPerson("Ida"), await wonPerson("Jon"), await wonPerson("Kim")];
  const breakJon = (key: string) => alter(jon.id, "{firm_key}", `"${key}"`);
  breakJon("no-such-firm");
  const caught = await catchUpProspectsWon(db, deps);
  ok("FO-8 DW7 fail: the catch-up names the one prospect that fails, in words, and does not stop the others",
    caught.failed.length === 1 && caught.failed[0].prospectId === jon.id && caught.failed[0].firmId === A && /no-such-firm/.test(caught.failed[0].error) && written(jon.id) === "0:0:0" && written(ida.id) === "1:1:1" && written(kim.id) === "1:1:1", caught.failed);
  ok("FO-8 DW7 pass: the catch-up makes good every missed delivery (Ida, Kim, and the earlier ones never delivered), and never a prospect that already has its client",
    [ida.id, kim.id].every((p) => caught.results.some((r) => r.prospectId === p && r.made)) && !caught.results.some((r) => [ana.id, bo.id, hal.id].includes(r.prospectId)) && written(ana.id) === "1:1:1", caught.results.length);
  breakJon("sample-firm");
  const mended = await catchUpProspectsWon(db, deps), quiet = await catchUpProspectsWon(db, deps);
  ok("FO-8 DW7 pass: once mended, the next run makes the failed one; a run with nothing missed makes nothing", mended.results.length === 1 && mended.results[0].prospectId === jon.id && mended.failed.length === 0 && quiet.results.length === 0 && quiet.failed.length === 0 && written(jon.id) === "1:1:1", [mended, quiet]);
} finally {
  await nest.close().catch(() => undefined);
}
process.exit(summary() ? 1 : 0);
