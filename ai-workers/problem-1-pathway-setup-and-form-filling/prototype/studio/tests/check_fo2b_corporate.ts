// FO-2b (BACKLOG row FO-2b; brief design/lead-b-briefs/FO-2b.md; contracts §2.1, §2.6, §7; AG-2-52, -53, -75, -76, -77,
// -79): Corporate prospects, each Done-when line with a pass and a fail, on one scratch database (every migration, PF-3's
// and FO-1a's Sample seeds), dropped at the end. US$0.
//   tsx studio/tests/check_fo2b_corporate.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAudit } from "../ports/audit.ts";
import { EVENT, ProspectWonSubject } from "../ports/events.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { CorporateController } from "../api/src/front-office/sales/corporate/routes.ts";
import { normaliseCompanyName } from "../api/src/front-office/sales/corporate/match.ts";
import { Corporate, wonSubjectOf } from "../api/src/front-office/sales/corporate/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { assertEveryRouteDeclared } from "../api/src/platform/identity/guard.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo2b_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

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
const audits = (key: string, action: string) => count("audit_event", `entity_key = '${key}' and action = '${action}'`);

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-2b setup: both Sample firms have both pipelines", fo.failed.length === 0 && count("fo_stage", "pipeline = 'CORPORATE'") === 16);

  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), T = ctxOf("user-T"), SOLO = ctxOf("user-S");
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "test", workspaceId: ws });

  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports), corp = new Corporate(db, ports);
  let n = 0;
  const lead = async (given: string, who: StaffContext = R) => (await leads.add(who, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}@pinebakery.example`, source: "Phone call" })) as { id: string; person: { id: string } };

  // ------------------------------------------------------------------------------------- Engage as Corporate
  const lena = await lead("Lena");
  const noName = await refusal(() => corp.engage(R, lena.id, { companyName: "  " }));
  ok("FO-2b fail: Corporate Engage without a company name → refused at the field (422 companyName); the lead stays OPEN, nothing made",
    noName?.status === 422 && (noName.body.fields as Record<string, string>)?.companyName !== undefined && sql(`select state from fo_lead where id = '${lena.id}'`) === "OPEN" && count("fo_prospect") === 0 && count("fo_company") === 0, noName);
  const p1 = await corp.engage(R, lena.id, { companyName: "Pine Bakery Ltd" });
  ok("FO-2b pass: Corporate Engage → one CORPORATE prospect in the Corporate pipeline's Engaged stage, the company made, the lead ENGAGED, owned by the clicker (it had R)",
    p1.type === "CORPORATE" && p1.stage.key === "ENGAGED" && p1.company?.name === "Pine Bakery Ltd" && /^P-\d{5}$/.test(p1.number) && sql(`select state from fo_lead where id = '${lena.id}'`) === "ENGAGED" && p1.ownerStaffId === R.staffId
      && sql(`select s.pipeline from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${p1.id}'`) === "CORPORATE", p1);
  ok("FO-2b pass: the enquirer is linked as PRIMARY, is the prospect's primary contact and stays labelled Lead; the lead reads as Lead",
    p1.contacts.length === 1 && p1.contacts[0].personId === lena.person.id && p1.contacts[0].role === "PRIMARY" && p1.contacts[0].primaryContact && p1.contacts[0].label === "Lead" && (await leads.read(R, lena.id)).label === "Lead", p1.contacts);
  const unowned = await lead("Una");
  sql(`update fo_lead set owner_staff_id = null where id = '${unowned.id}'`);
  const pu = await corp.engage(R, unowned.id, { companyName: "Una Works" });
  ok("FO-2b pass (review m3): Engage on an Unassigned lead makes the clicker its owner and writes the take line on the lead (FO-2v's race answer reads it)",
    pu.ownerStaffId === R.staffId && audits(unowned.id, "lead.taken") === 1 && count("audit_event", `entity_key = '${unowned.id}' and action = 'lead.taken' and detail->>'fromUnassigned' = 'true'`) === 1);
  const firstAt = sql(`select engaged_at || '|' || engaged_by from fo_lead where id = '${lena.id}'`);
  ok("FO-2b fail (review m3): Engage on an owned lead writes no take line", audits(lena.id, "lead.taken") === 0);
  ok("FO-2b pass: lead.engaged is in the outbox with the company (ids only), one stage move from nowhere",
    count("module_event", `type = '${EVENT.LEAD_ENGAGED}' and subject_id = '${p1.id}' and payload->>'subjectCompanyId' = '${p1.company!.id}' and payload->>'type' = 'CORPORATE'`) === 1 && count("fo_stage_move", `prospect_id = '${p1.id}' and from_stage_id is null`) === 1);
  const closed = await lead("Closed");
  await leads.close(R, closed.id, { reasonId: sql(`select id from fo_reason where firm_id = '${A}' and kind = 'LEAD_CLOSE' and not is_system and active order by sort_order limit 1`) });
  ok("FO-2b fail: Engage on a closed lead → 409 LEAD_CLOSED (reopen first, AG-2-75 rule 1)", (await refusal(() => corp.engage(R, closed.id, { companyName: "Closed Co" })))?.body.code === "LEAD_CLOSED");

  // ------------------------------------------------------------------------------------- the company match
  ok("FO-2b pass: the normalised name drops case, punctuation and ltd/inc/corp…", normaliseCompanyName("pine bakery, ltd.") === "pine bakery" && normaliseCompanyName("PINE BAKERY INC") === "pine bakery" && normaliseCompanyName("Co. Inc.") === "co inc");
  ok("FO-2b fail (Devin): vowel marks are kept, so two different Devanagari names never match", normaliseCompanyName("रामा ट्रेडर्स") !== normaliseCompanyName("रीमा ट्रेडर्स"));
  const offered = await corp.match(R, "pine bakery, ltd.");
  ok("FO-2b pass: a near-identical name is offered as a match, with its open prospect", offered.offers.length === 1 && offered.offers[0].companyId === p1.company!.id && offered.offers[0].matchedOn === "ORG_NAME" && offered.offers[0].openProspects[0]?.number === p1.number, offered);
  ok("FO-2b fail: a different name is not offered (no fuzzy match, AG-2-79 §13)", (await corp.match(R, "Pine Bakeries")).offers.length === 0);
  const tomas = await lead("Tomas");
  const companiesBefore = count("fo_company"), linksBefore = count("fo_company_contact");
  const m = await refusal(() => corp.engage(R, tomas.id, { companyName: "pine bakery, ltd." }));
  ok("FO-2b fail: Engage with a matching name and no pick → 409 COMPANY_MATCH with the offer; nothing links by itself (no company, no link, lead OPEN)",
    m?.body.code === "COMPANY_MATCH" && (m.body.offers as { companyId: string }[])[0]?.companyId === p1.company!.id && count("fo_company") === companiesBefore && count("fo_company_contact") === linksBefore && sql(`select state from fo_lead where id = '${tomas.id}'`) === "OPEN", m);
  const p2 = await corp.engage(R, tomas.id, { companyId: p1.company!.id });
  ok("FO-2b pass (review m1): a pick by id with no name typed records no match key, and says it was picked", count("audit_event", `entity_key = '${p2.id}' and action = 'lead.engaged' and detail->>'matchedOn' is null and detail->>'companyPicked' = 'true'`) === 1
    && count("audit_event", `entity_key = '${p1.id}' and action = 'lead.engaged' and detail->>'companyPicked' = 'false'`) === 1);
  ok("FO-2b pass: picking the offered company links the enquirer to it; the company keeps one live PRIMARY (the second enquirer is OTHER)",
    p2.company?.id === p1.company!.id && p2.primaryContactPersonId === tomas.person.id && count("fo_company_contact", `company_id = '${p1.company!.id}' and role = 'PRIMARY' and valid_to is null`) === 1
      && p2.contacts.find((c) => c.personId === tomas.person.id)?.role === "OTHER", p2.contacts);
  const ana = await lead("Ana");
  const p3 = await corp.engage(R, ana.id, { companyName: "Pine Bakery Ltd", newCompany: true });
  ok("FO-2b pass: \"New company\" despite the offer makes a second company on purpose (AG-2-79 rule 7)", p3.company!.id !== p1.company!.id && count("fo_company", `normalised_name = 'pine bakery'`) === 2);

  const again = await corp.engage(R, lena.id, { companyId: p1.company!.id });
  ok("FO-2b pass (review m3): a second Engage on the same lead makes a second prospect and keeps the first engaged time and person", again.id !== p1.id && sql(`select engaged_at || '|' || engaged_by from fo_lead where id = '${lena.id}'`) === firstAt);

  ok("FO-2b pass (Devin): Engage writes its line on the lead too (lead.engaged on fo_lead, naming the prospect), once per Engage", count("audit_event", `entity = 'fo_lead' and entity_key = '${lena.id}' and action = 'lead.engaged'`) === 2
    && count("audit_event", `entity = 'fo_lead' and entity_key = '${lena.id}' and action = 'lead.engaged' and detail->>'prospectId' = '${p1.id}'`) === 1);

  // ------------------------------------------------------------------------------------- contacts and roles
  const twoRoles = await corp.addContact(R, p1.company!.id, { personId: lena.person.id, role: "SIGNATORY" });
  ok("FO-2b pass: one person may hold two roles at one company (Lena PRIMARY and SIGNATORY)", twoRoles.contacts.filter((c) => c.personId === lena.person.id).map((c) => c.role).sort().join() === "PRIMARY,SIGNATORY", twoRoles.contacts);
  const twice = await refusal(() => corp.addContact(R, p1.company!.id, { personId: lena.person.id, role: "SIGNATORY" }));
  ok("FO-2b fail: the same person and role twice → 409 ALREADY_LINKED, one link", twice?.body.code === "ALREADY_LINKED" && count("fo_company_contact", `person_id = '${lena.person.id}' and role = 'SIGNATORY' and valid_to is null`) === 1, twice);
  ok("FO-2b fail: a family role (APPLICANT) → refused at the field (AG-2-77 rule 3)", (await refusal(() => corp.addContact(R, p1.company!.id, { personId: lena.person.id, role: "APPLICANT" })))?.status === 422);
  ok("FO-2b fail: a second PRIMARY by Add → 409 PRIMARY_TAKEN", (await refusal(() => corp.addContact(R, p1.company!.id, { givenNames: "Raj", email: "raj@pinebakery.example", role: "PRIMARY", confirmedNew: true })))?.body.code === "PRIMARY_TAKEN");
  const hr = await corp.addContact(R, p1.company!.id, { givenNames: "Raj", familyName: "Sample", email: "raj@pinebakery.example", role: "HR" });
  ok("FO-2b pass: a new person added as HR gets a person record and a link", hr.contacts.some((c) => c.name === "Raj Sample" && c.role === "HR"), hr.contacts);
  ok("FO-2b fail: the same new person again → 409 KNOWN_PERSON (checked against people first, AG-2-77 rule 5)", (await refusal(() => corp.addContact(R, p1.company!.id, { givenNames: "Raj", email: "raj@pinebakery.example", role: "BILLING" })))?.body.code === "KNOWN_PERSON");
  const known = await refusal(() => corp.addContact(R, p1.company!.id, { givenNames: "Raj", email: "raj@pinebakery.example", role: "BILLING" }));
  ok("FO-2b pass (review m7): KNOWN_PERSON names the person on file the adder may see (a contact here), so they can be picked", (known?.body.matches as { personId: string | null }[])?.[0]?.personId === hr.contacts.find((c) => c.name === "Raj Sample")?.personId, known);
  const lenaPrimary = twoRoles.contacts.find((c) => c.personId === lena.person.id && c.role === "PRIMARY")!;
  ok("FO-2b fail: ending the PRIMARY link → 409 PRIMARY_NEEDED, the link stays", (await refusal(() => corp.endContact(R, lenaPrimary.id)))?.body.code === "PRIMARY_NEEDED" && count("fo_company_contact", `id = '${lenaPrimary.id}' and valid_to is null`) === 1);
  const tomasOther = p2.contacts.find((c) => c.personId === tomas.person.id)!;
  ok("FO-2b fail: ending the only link of an open prospect's primary contact (Tomas, P2) → 409 PRIMARY_NEEDED", (await refusal(() => corp.endContact(R, tomasOther.id)))?.body.code === "PRIMARY_NEEDED");
  const made = await corp.changeRole(R, tomasOther.id, { role: "PRIMARY" });
  ok("FO-2b pass: Make primary: Tomas PRIMARY, Lena kept as OTHER (and SIGNATORY), the company's open prospects that named Lena now name Tomas",
    made.contacts.filter((c) => c.role === "PRIMARY").map((c) => c.personId).join() === tomas.person.id && made.contacts.some((c) => c.personId === lena.person.id && c.role === "OTHER")
      && sql(`select primary_contact_person_id from fo_prospect where id = '${p1.id}'`) === tomas.person.id && count("fo_company_contact", `id = '${tomasOther.id}' and valid_to is not null`) === 1, made.contacts);
  const raj = hr.contacts.find((c) => c.name === "Raj Sample")!;
  const ended = await corp.endContact(R, raj.id);
  ok("FO-2b pass: ending a contact keeps the person and dates the link", !ended.contacts.some((c) => c.id === raj.id) && count("fo_person", `id = '${raj.personId}'`) === 1 && count("fo_company_contact", `id = '${raj.id}' and valid_to is not null`) === 1);

  // ------------------------------------------------------------------------------------- Change type
  const ivo = await lead("Ivo");
  const iv = randomUUID(), consult = sql(`select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'CONSULT'`);
  sql(`update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where id = '${ivo.id}'`);
  sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at) values ('${iv}', '${A}', '${ivo.id}', 'INDIVIDUAL', '${consult}', '${ivo.person.id}', '${ivo.person.id}', '${R.staffId}', 'test', now())`);   // an Individual prospect, as FO-2 part 3's Engage will make it
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) values ('${A}', '${iv}', '${consult}', 'PERSON', 'test')`);
  sql(`insert into fo_note (firm_id, person_id, prospect_id, text, by_actor) values ('${A}', '${ivo.person.id}', '${iv}', 'Called about a hire (Sample).', 'test')`);
  const number = sql(`select number from fo_prospect where id = '${iv}'`);
  const toCorp = await corp.changeType(R, iv, { type: "CORPORATE", companyName: "Ivo Foods Inc" });
  ok("FO-2b pass: Change type Individual → Corporate keeps the number, owner, lead and notes; same stage key (Consult) in the Corporate pipeline; the person linked PRIMARY",
    toCorp.type === "CORPORATE" && toCorp.number === number && toCorp.ownerStaffId === R.staffId && toCorp.leadId === ivo.id && toCorp.stage.key === "CONSULT" && count("fo_note", `prospect_id = '${iv}'`) === 1
      && toCorp.contacts[0]?.personId === ivo.person.id && toCorp.contacts[0].role === "PRIMARY" && count("fo_stage_move", `prospect_id = '${iv}' and cause = 'CHANGE_TYPE'`) === 1
      && count("module_event", `type = '${EVENT.PROSPECT_TYPE_CHANGED}' and subject_id = '${iv}' and payload->>'fromType' = 'INDIVIDUAL'`) === 1, toCorp);
  const back = await corp.changeType(R, iv, { type: "INDIVIDUAL" });
  ok("FO-2b pass: Corporate → Individual: the primary contact is the subject, the company and its link stay", back.type === "INDIVIDUAL" && back.person?.id === ivo.person.id && back.person.label === "Active prospect" && count("fo_company_contact", `company_id = '${toCorp.company!.id}' and valid_to is null`) === 1 && back.number === number, back);
  ok("FO-2b fail: Change type to the type it has → 409 SAME_TYPE", (await refusal(() => corp.changeType(R, iv, { type: "INDIVIDUAL" })))?.body.code === "SAME_TYPE");
  ok("FO-2b fail: Change type to Corporate without a company name → refused at the field, nothing changed", (await refusal(() => corp.changeType(R, iv, { type: "CORPORATE" })))?.status === 422 && sql(`select type from fo_prospect where id = '${iv}'`) === "INDIVIDUAL");

  // A real retainer on the Individual prospect (FO-5's tables): a draft, then sent, then withdrawn.
  const TPL = randomUUID(), RET = randomUUID(), VER = randomUUID(), hex = (k: number) => k.toString(16).padStart(64, "0");
  sql(`insert into fo_retainer_template (id, firm_id, name, kind, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${TPL}', '${A}', 'Retainer (Sample)', 'RETAINER', 'retainer-templates/${TPL}/v1.docx', '${hex(1)}', '{client.name,fees}', 'seed:FO-2b-test', 'seed:FO-2b-test', now())`);
  sql(`insert into fo_retainer (id, firm_id, kind, prospect_id, subject, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at) values ('${RET}', '${A}', 'RETAINER', '${iv}', 'PERSON', '${ivo.person.id}', '${R.staffId}', '${TPL}', 1, 'retainer-templates/${TPL}/v1.docx', 'staff:${R.staffId}', now()); insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${VER}', '${A}', '${RET}', 1, '{"client.name":"Ivo Sample"}', 'retainers/${RET}/v1.docx', '${hex(11)}', 'staff:${R.staffId}')`);
  const onDraft = await refusal(() => corp.changeType(R, iv, { type: "CORPORATE", companyId: toCorp.company!.id }));
  ok("FO-2b fail (review M1): a draft retainer for the current client → 409 RETAINER_OPEN naming it (FO-5 cannot discard a draft); nothing changed", onDraft?.body.code === "RETAINER_OPEN" && onDraft.body.retainerId === RET && sql(`select type from fo_prospect where id = '${iv}'`) === "INDIVIDUAL", onDraft);
  sql(`update fo_retainer_version set sent_at = now() where id = '${VER}'; update fo_retainer set status = 'SENT' where id = '${RET}'`);
  const onSent = await refusal(() => corp.changeType(R, iv, { type: "CORPORATE", companyId: toCorp.company!.id }));
  ok("FO-2b fail: a retainer out for signing → 409 \"Void the retainer in Agreements first.\"", onSent?.body.code === "RETAINER_SENT" && onSent.body.detail === "Void the retainer in Agreements first.", onSent);
  sql(`update fo_retainer_version set ended_at = now(), end_reason = 'WITHDRAWN' where id = '${VER}'; update fo_retainer set status = 'WITHDRAWN', withdrawn_reason = 'Wrong client type (Sample)', withdrawn_at = now(), withdrawn_by = 'staff:${R.staffId}' where id = '${RET}'`);
  const afterWithdraw = await corp.changeType(R, iv, { type: "CORPORATE", companyId: toCorp.company!.id });
  ok("FO-2b pass: once the retainer is withdrawn, Change type goes ahead", afterWithdraw.type === "CORPORATE");
  await corp.changeType(R, iv, { type: "INDIVIDUAL" });

  // A signature exists: P1 won by Signed offline (as FO-5's Signed offline moves it).
  const won = sql(`select id from fo_stage where firm_id = '${A}' and pipeline = 'CORPORATE' and kind = 'WON'`);
  sql(`update fo_prospect set stage_id = '${won}', won_via = 'SIGNED_OFFLINE', won_at = now() where id = '${p1.id}'`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, from_stage_id, to_stage_id, cause, by_actor) select firm_id, id, (select to_stage_id from fo_stage_move where prospect_id = '${p1.id}' order by seq desc limit 1), stage_id, 'SIGNED_OFFLINE', 'test' from fo_prospect where id = '${p1.id}'`);
  const signed = await refusal(() => corp.changeType(R, p1.id, { type: "INDIVIDUAL" }));
  ok("FO-2b fail: Change type after a signature → 409 SIGNED; type, stage and subject unchanged",
    signed?.body.code === "SIGNED" && sql(`select type || '|' || stage_id || '|' || subject_company_id from fo_prospect where id = '${p1.id}'`) === `CORPORATE|${won}|${p1.company!.id}`, signed);

  // ------------------------------------------------------------------------------------- the boards
  const corpBoard = await corp.board(R, "CORPORATE"), indBoard = await corp.board(R, "INDIVIDUAL");
  const on = (b: typeof corpBoard) => b.stages.flatMap((s) => s.prospects.map((p) => p.id));
  ok("FO-2b pass: the Corporate board lists only Corporate prospects (P1 under Won, P2, P3), eight stages in order", corpBoard.stages.map((s) => s.key).join() === "ENGAGED,QUALIFIED,CONSULT,PROPOSAL,RETAINER_SENT,RETAINER_SIGNED,LOST,NURTURE"
    && [p1.id, p2.id, p3.id].every((x) => on(corpBoard).includes(x)) && corpBoard.stages.flatMap((s) => s.prospects).every((p) => p.type === "CORPORATE") && corpBoard.stages.find((s) => s.key === "RETAINER_SIGNED")!.prospects.some((p) => p.id === p1.id), corpBoard.stages.map((s) => s.key));
  ok("FO-2b fail: the Individual board shows no Corporate prospect, and the Corporate board no Individual one", !on(indBoard).some((x) => [p1.id, p2.id, p3.id].includes(x)) && on(indBoard).includes(iv) && !on(corpBoard).includes(iv) && indBoard.stages.flatMap((s) => s.prospects).every((p) => p.type === "INDIVIDUAL"));
  ok("FO-2b fail: a pipeline that is not Individual or Corporate → 422", (await refusal(() => corp.board(R, "PARTNER")))?.status === 422);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "test", workspaceId: ws });
  const tBoard = await corp.board(T, "CORPORATE");
  ok("FO-2b fail: with \"everyone sees all\" off, another person's board holds none of R's prospects, and R's prospect reads 404 to them", !on(tBoard).length && (await refusal(() => corp.read(T, p2.id)))?.status === 404 && (await refusal(() => corp.contacts(T, p1.company!.id)))?.status === 404);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "test", workspaceId: ws });
  ok("FO-2b fail: firm B's staff reading firm A's prospect or company → 404", (await refusal(() => corp.read(SOLO, p2.id)))?.status === 404 && (await refusal(() => corp.addContact(SOLO, p1.company!.id, { personId: lena.person.id, role: "HR" })))?.status === 404);

  // ------------------------------------------------------------------------------------- Make primary never touches a hidden prospect (review M2)
  const xa = await lead("Xena"), ya = await lead("Yuri", T);
  const px = await corp.engage(R, xa.id, { companyName: "Hidden Hollow Ltd" });
  const py = await corp.engage(T, ya.id, { companyId: px.company!.id });
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "test", workspaceId: ws });
  const yLink = py.contacts.find((c) => c.personId === ya.person.id)!;
  const hidden = await refusal(() => corp.changeRole(T, yLink.id, { role: "PRIMARY" }));
  ok("FO-2b fail (review M2): with \"everyone sees all\" off, T's Make primary that would repoint R's prospect → 409 HIDDEN_PROSPECTS, naming no prospect; nothing changed",
    hidden?.body.code === "HIDDEN_PROSPECTS" && !String(hidden.body.detail).includes(px.number) && sql(`select primary_contact_person_id from fo_prospect where id = '${px.id}'`) === xa.person.id && count("fo_company_contact", `id = '${yLink.id}' and valid_to is null`) === 1, hidden);
  const endHidden = await refusal(() => corp.endContact(R, yLink.id));
  ok("FO-2b fail (review m2): R ending Yuri's only link (the primary contact of T's prospect, unseen with the setting off) → 409 PRIMARY_NEEDED that never names T's prospect",
    endHidden?.body.code === "PRIMARY_NEEDED" && !JSON.stringify(endHidden.body).includes(py.number) && count("fo_company_contact", `id = '${yLink.id}' and valid_to is null`) === 1, endHidden);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "test", workspaceId: ws });
  const made2 = await corp.changeRole(R, yLink.id, { role: "PRIMARY" });
  ok("FO-2b pass (review M2): a Make primary by someone who sees both prospects repoints R's prospect with its own audit line and lists it on the role line",
    made2.contacts.find((c) => c.role === "PRIMARY")?.personId === ya.person.id && sql(`select primary_contact_person_id from fo_prospect where id = '${px.id}'`) === ya.person.id
      && audits(px.id, "prospect.primary_contact_changed") === 1 && count("audit_event", `action = 'company_contact.role_changed' and detail->'repointedProspectIds' ? '${px.id}'`) === 1, made2.contacts);

  // Devin: no hidden company or person through a pick (setting off: T sees only T's own prospects).
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "test", workspaceId: ws });
  const zed = await lead("Zed", T);
  const pickHidden = await refusal(() => corp.engage(T, zed.id, { companyId: p3.company!.id }));
  const tOffers = await corp.match(T, "Pine Bakery Ltd");
  ok("FO-2b fail (Devin): T cannot pick a company none of whose prospects T sees (422, as an unknown id), and the match says only that one exists, with no id",
    pickHidden?.status === 422 && sql(`select state from fo_lead where id = '${zed.id}'`) === "OPEN" && tOffers.offers.length === 2 && tOffers.offers.every((o) => o.companyId === null && !o.name.includes("Pine")), [pickHidden, tOffers]);
  const hiddenPerson = await refusal(() => corp.addContact(T, py.company!.id, { personId: lena.person.id, role: "HR" }));
  ok("FO-2b fail (Devin): T cannot add a person T may not see (R's Lena) as a contact by id → 404, no link", hiddenPerson?.status === 404 && count("fo_company_contact", `company_id = '${py.company!.id}' and person_id = '${lena.person.id}'`) === 0, hiddenPerson);
  const tSees = await corp.addContact(T, py.company!.id, { personId: zed.person.id, role: "HR" });
  ok("FO-2b pass: T may add a person whose lead T sees", tSees.contacts.some((c) => c.personId === zed.person.id && c.role === "HR"));
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "test", workspaceId: ws });

  // Devin: a Make primary over more than 50 prospects still writes its lines (each prospect its own; the list capped, the count whole).
  const engaged = sql(`select id from fo_stage where firm_id = '${A}' and pipeline = 'CORPORATE' and key = 'ENGAGED'`);
  sql(`with l as (insert into fo_lead (firm_id, person_id, door, source, state, engaged_at, engaged_by, owner_staff_id, created_by, updated_at)
         select '${A}', '${ya.person.id}', 'MANUAL', 'Phone call', 'ENGAGED', now(), 'test', '${R.staffId}', 'test', now() from generate_series(1, 51) returning id)
       insert into fo_prospect (firm_id, lead_id, type, stage_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
         select '${A}', id, 'CORPORATE', '${engaged}', '${px.company!.id}', '${ya.person.id}', '${R.staffId}', 'test', now() from l`);
  const xOther = (await corp.contacts(R, px.company!.id)).contacts.find((c) => c.personId === xa.person.id && c.role === "OTHER")!;
  const many = await refusal(() => corp.changeRole(R, xOther.id, { role: "PRIMARY" }));
  ok("FO-2b pass (Devin): Make primary over 53 open prospects succeeds with the real audit adapter: 53 prospect lines, the role line's count 53 and its id list capped at 50",
    many === null && count("fo_prospect", `subject_company_id = '${px.company!.id}' and primary_contact_person_id = '${xa.person.id}'`) === 53
      && count("audit_event", `action = 'prospect.primary_contact_changed' and detail->>'toPersonId' = '${xa.person.id}'`) === 53
      && count("audit_event", `action = 'company_contact.role_changed' and detail->>'repointedCount' = '53' and jsonb_array_length(detail->'repointedProspectIds') = 50`) === 1, many);

  // ------------------------------------------------------------------------------------- the won payload's subject
  const subject = await wonSubjectOf(db, A, p1.id);
  ok("FO-2b pass: prospect.won's subject is COMPANY with the company's name and its live contacts with their roles (Tomas PRIMARY and the primary contact; Lena OTHER and SIGNATORY)",
    subject.subject === "COMPANY" && subject.company.name === "Pine Bakery Ltd" && subject.contacts.length === 2
      && subject.contacts.find((c) => c.personId === tomas.person.id)?.roles.join() === "PRIMARY" && subject.contacts.find((c) => c.personId === tomas.person.id)?.primaryContact === true
      && subject.contacts.find((c) => c.personId === lena.person.id)?.roles.sort().join() === "OTHER,SIGNATORY" && !subject.contacts.some((c) => c.personId === raj.personId), subject);
  ok("FO-2b pass: an Individual prospect's won subject is PERSON", (await wonSubjectOf(db, A, iv)).subject === "PERSON");
  ok("FO-2b fail: the won subject contract refuses a company with no contacts or no name", !ProspectWonSubject.safeParse({ subject: "COMPANY", company: { id: p1.company!.id, name: "Pine Bakery Ltd" }, contacts: [] }).success
    && !ProspectWonSubject.safeParse({ subject: "COMPANY", company: { id: p1.company!.id, name: "" }, contacts: subject.subject === "COMPANY" ? subject.contacts : [] }).success);

  // ------------------------------------------------------------------------------------- one audit line per change
  ok("FO-2b pass: every change wrote one audit line through AuditPort (Engage, Change type four times, add, role change, end)",
    audits(p1.id, "lead.engaged") === 1 && audits(iv, "prospect.type_changed") === 4 && count("audit_event", `action = 'company_contact.added'`) === 3 && count("audit_event", `action = 'company_contact.role_changed'`) === 3 && audits(raj.id, "company_contact.ended") === 1);
  const failing = new Corporate(db, { ...ports, audit: fakeAudit({ failOn: () => true }) });
  const dora = await lead("Dora");
  const [pBefore, cBefore, lBefore, eBefore] = [count("fo_prospect"), count("fo_company"), count("fo_company_contact"), count("module_event")];
  const e1 = await refusal(() => failing.engage(R, dora.id, { companyName: "Dora Design Corp" }));
  ok("FO-2b fail: a forced audit failure rolls Engage back (no prospect, company, link or event; the lead OPEN)", e1 !== null && count("fo_prospect") === pBefore && count("fo_company") === cBefore && count("fo_company_contact") === lBefore && count("module_event") === eBefore && sql(`select state from fo_lead where id = '${dora.id}'`) === "OPEN", e1);
  const e2 = await refusal(() => failing.changeType(R, iv, { type: "CORPORATE", companyId: toCorp.company!.id }));
  ok("FO-2b fail: a forced audit failure rolls Change type back", e2 !== null && sql(`select type from fo_prospect where id = '${iv}'`) === "INDIVIDUAL" && count("fo_stage_move", `prospect_id = '${iv}'`) === 5);
  const e3 = await refusal(() => failing.addContact(R, p2.company!.id, { personId: dora.person.id, role: "BILLING" }));
  ok("FO-2b fail: a forced audit failure rolls Add contact back", e3 !== null && count("fo_company_contact") === lBefore);
  const liveNow = count("fo_company_contact", "valid_to is null"), lena2 = (await corp.contacts(R, p1.company!.id)).contacts.find((c) => c.personId === lena.person.id && c.role === "SIGNATORY")!;
  const e4 = await refusal(() => failing.changeRole(R, lena2.id, { role: "BILLING" }));
  ok("FO-2b fail: a forced audit failure rolls Change role back (the link still live, no new link)", e4 !== null && count("fo_company_contact") === lBefore && count("fo_company_contact", "valid_to is null") === liveNow && count("fo_company_contact", `id = '${lena2.id}' and valid_to is null`) === 1);
  const e5 = await refusal(() => failing.endContact(R, lena2.id));
  ok("FO-2b fail: a forced audit failure rolls End contact back", e5 !== null && count("fo_company_contact", `id = '${lena2.id}' and valid_to is null`) === 1);

  // ------------------------------------------------------------------------------------- the routes' keys
  const keysOf = (m: string) => (Reflect.getMetadata(PLATFORM_ACCESS, (CorporateController.prototype as unknown as Record<string, object>)[m]) as { keys?: string[] } | undefined)?.keys?.join(",");
  const want: Record<string, string> = { match: "agent/prospect:edit", engage: "agent/prospect:edit", board: "agent/prospect:show", read: "agent/prospect:show", changeType: "agent/prospect:edit", contacts: "agent/prospect:show", addContact: "agent/prospect:edit", changeRole: "agent/prospect:edit", end: "agent/prospect:edit" };
  ok("FO-2b pass: every route declares a seeded agent/prospect:* key (one grant covers both pipelines, AG-2-52 rule 6)", Object.entries(want).every(([k, v]) => keysOf(k) === v), Object.keys(want).map((k) => `${k}=${keysOf(k)}`));
  const readOnly = sql(`select string_agg(permission_key, ',') from platform_role_permission where role = 'READ_ONLY'`).split(",");
  ok("FO-2b fail: a Read-only person cannot engage, change type or change contacts (403 at the guard)", ["engage", "changeType", "addContact", "changeRole", "end"].every((k) => !readOnly.includes(keysOf(k)!)) && readOnly.includes("agent/prospect:show"));
  ok("FO-2b pass: PF-4's start-up rule accepts every route", (() => { try { assertEveryRouteDeclared(Object.keys(want).map((k) => ({ name: `CorporateController.${k}`, method: "GET", path: "/api/front-office", access: Reflect.getMetadata(PLATFORM_ACCESS, (CorporateController.prototype as unknown as Record<string, object>)[k]) })) as never); return true; } catch { return false; } })());
} catch (e) {
  fail++;
  console.log(`FAIL  FO-2b: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-2b Corporate prospects: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
