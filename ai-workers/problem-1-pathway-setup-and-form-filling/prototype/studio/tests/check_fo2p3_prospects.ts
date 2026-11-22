// FO-2 part 3 (wave 1 Sales sheet, design/lead-b-briefs/wave1-sales.md; contracts §2.1, §2.6, §7; AG-2-26, -44, -47,
// -75; concept fo-4-sales r2 BR-7, -8, -9, -11; R1.30, R1.31): Individual prospects, `FO-2p3 DW1..DW6`, each with a pass
// and a fail, on one scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end. US$0.
//   tsx studio/tests/check_fo2p3_prospects.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeAudit } from "../ports/audit.ts";
import { EVENT } from "../ports/events.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { Corporate } from "../api/src/front-office/sales/corporate/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { NOT_SIGNED, Prospects, WON_REFUSED } from "../api/src/front-office/sales/prospects.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { SalesController } from "../api/src/front-office/sales/routes.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, TIME_ZONE, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo2p3_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

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
const events = (subject: string, type: string) => count("module_event", `subject_id = '${subject}' and type = '${type}'`);

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-2p3 setup: both Sample firms have both pipelines", fo.failed.length === 0 && count("fo_stage", "pipeline = 'INDIVIDUAL'") === 16);

  const firm = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
  const A = firm("sample-firm"), B = firm("sample-solo");
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), T = ctxOf("user-T"), O = ctxOf("user-O"), SOLO = ctxOf("user-S");
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });

  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports), pros = new Prospects(db, ports), corp = new Corporate(db, ports);
  clearingConflicts(db, { prospects: Prospects.prototype });   // FO-13c: the conflict check first
  let n = 0;
  const lead = async (given: string, who: StaffContext = R) => (await leads.add(who, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}@example.com`, source: "Phone call" })) as { id: string; number: string; person: { id: string } };
  const stage = (key: string, pipeline = "INDIVIDUAL", f = A) => sql(`select id from fo_stage where firm_id = '${f}' and pipeline = '${pipeline}' and key = '${key}'`);
  const reason = (kind: string, key: string, f = A) => sql(`select id from fo_reason where firm_id = '${f}' and kind = '${kind}' and key = '${key}'`);

  // ------------------------------------------------------------------------------------- DW1: Engage (Individual)
  const ana = await lead("Ana", T);
  const p1 = await pros.engage(R, ana.id);
  ok("FO-2p3 DW1 pass: Engage makes one INDIVIDUAL prospect in the Individual pipeline's Engaged stage, the subject the lead's person, owned by the lead's owner (T), the lead ENGAGED; not marked as a second one",
    p1.type === "INDIVIDUAL" && p1.stage.key === "ENGAGED" && p1.person?.id === ana.person.id && p1.ownerStaffId === T.staffId && p1.again === false && !("message" in p1)
      && sql(`select state from fo_lead where id = '${ana.id}'`) === "ENGAGED" && /^P-\d{5}$/.test(p1.number) && p1.version !== "0", p1);
  ok("FO-2p3 DW1 pass: lead.engaged in the outbox (Individual, the person as subject), one audit line on the prospect and one on the lead, one move from nowhere",
    events(p1.id, EVENT.LEAD_ENGAGED) === 1 && count("module_event", `subject_id = '${p1.id}' and payload->>'type' = 'INDIVIDUAL' and payload->>'subjectPersonId' = '${ana.person.id}'`) === 1
      && audits(p1.id, "lead.engaged") === 1 && audits(ana.id, "lead.engaged") === 1 && count("fo_stage_move", `prospect_id = '${p1.id}' and from_stage_id is null and cause = 'PERSON'`) === 1);
  const p1b = await pros.engage(R, ana.id);
  ok("FO-2p3 DW1 pass: a second Engage of the same lead makes a second prospect and says so, naming the first",
    p1b.id !== p1.id && p1b.again === true && typeof p1b.message === "string" && p1b.message.includes(p1.number) && count("fo_prospect", `lead_id = '${ana.id}'`) === 2, p1b);
  const una = await lead("Una");
  sql(`update fo_lead set owner_staff_id = null where id = '${una.id}'`);
  const pu = await pros.engage(T, una.id);
  ok("FO-2p3 DW1 pass: Engage on an Unassigned lead gives the prospect and the lead to the clicker, with the take line",
    pu.ownerStaffId === T.staffId && sql(`select owner_staff_id from fo_lead where id = '${una.id}'`) === T.staffId && count("audit_event", `entity_key = '${una.id}' and action = 'lead.taken' and detail->>'via' = 'ENGAGE'`) === 1);
  const closedLead = await lead("Cleo");
  await leads.close(R, closedLead.id, { reasonId: reason("LEAD_CLOSE", "NOT_INTERESTED") });
  const onClosed = await refusal(() => pros.engage(R, closedLead.id));
  ok("FO-2p3 DW1 fail: Engage on a closed lead → 409 LEAD_CLOSED, nothing made", onClosed?.status === 409 && onClosed.body.code === "LEAD_CLOSED" && count("fo_prospect", `lead_id = '${closedLead.id}'`) === 0, onClosed);
  const fromB = await refusal(() => pros.engage(SOLO, ana.id));
  ok("FO-2p3 DW1 fail: firm B engaging firm A's lead → 404, nothing made", fromB?.status === 404 && count("fo_prospect", `lead_id = '${ana.id}'`) === 2, fromB);

  // ------------------------------------------------------------------------------------- DW2: moves
  const v0 = p1.version;
  const moved = await pros.move(R, p1.id, { stageId: stage("QUALIFIED"), cause: "PERSON", version: v0 });
  ok("FO-2p3 DW2 pass: a person's move with its cause is saved (stage, a PERSON move from Engaged), audited once, and in the outbox; the version moves on",
    moved.stage.key === "QUALIFIED" && moved.version !== v0 && count("fo_stage_move", `prospect_id = '${p1.id}' and cause = 'PERSON' and from_stage_id = '${stage("ENGAGED")}' and to_stage_id = '${stage("QUALIFIED")}'`) === 1
      && audits(p1.id, EVENT.PROSPECT_STAGE_MOVED) === 1 && count("audit_event", `entity_key = '${p1.id}' and action = '${EVENT.PROSPECT_STAGE_MOVED}' and actor = 'staff:${R.staffId}'`) === 1
      && count("module_event", `subject_id = '${p1.id}' and type = '${EVENT.PROSPECT_STAGE_MOVED}' and payload->>'fromStageKey' = 'ENGAGED' and payload->>'stageKey' = 'QUALIFIED' and payload->>'cause' = 'PERSON'`) === 1, moved);
  const back = await pros.move(R, p1.id, { stageId: stage("ENGAGED"), version: moved.version });
  ok("FO-2p3 DW2 pass: back to an earlier open stage is a move too (AG-2-26 rule 1)", back.stage.key === "ENGAGED" && count("fo_stage_move", `prospect_id = '${p1.id}'`) === 3);
  const stale = await refusal(() => pros.move(T, p1.id, { stageId: stage("CONSULT"), version: v0 }));
  ok("FO-2p3 DW2 fail: a stale version → 409 STALE naming who moved it and where, nothing changed",
    stale?.status === 409 && stale.body.code === "STALE" && String(stale.body.detail).includes("moved this to Engaged") && String(stale.body.detail).includes("Reload") && sql(`select key from fo_stage s join fo_prospect p on p.stage_id = s.id where p.id = '${p1.id}'`) === "ENGAGED" && count("fo_stage_move", `prospect_id = '${p1.id}'`) === 3, stale);
  const toWon = await refusal(() => pros.move(R, p1.id, { stageId: stage("RETAINER_SIGNED"), version: back.version }));
  ok("FO-2p3 DW2 fail: a person's move into the WON stage → 422 with AG-2-26 rule 3's words; nothing moved (BR-8)",
    toWon?.status === 422 && toWon.body.code === "WON_BY_EVENT" && toWon.body.detail === WON_REFUSED && count("fo_stage_move", `prospect_id = '${p1.id}'`) === 3, toWon);
  const toLost = await refusal(() => pros.move(R, p1.id, { stageId: stage("LOST"), version: back.version }));
  const toNurture = await refusal(() => pros.move(R, p1.id, { stageId: stage("NURTURE"), version: back.version }));
  const otherPipe = await refusal(() => pros.move(R, p1.id, { stageId: stage("QUALIFIED", "CORPORATE"), version: back.version }));
  const noVersion = await refusal(() => pros.move(R, p1.id, { stageId: stage("CONSULT") }));
  const sysCause = await refusal(() => pros.move(R, p1.id, { stageId: stage("CONSULT"), cause: "BOOKING", version: back.version }));
  ok("FO-2p3 DW2 fail: into LOST (Mark lost), NURTURE (Park), another pipeline's stage, no version or a system cause → 422, nothing moved",
    toLost?.body.code === "USE_MARK_LOST" && toNurture?.body.code === "USE_PARK" && otherPipe?.status === 422 && noVersion?.status === 422 && sysCause?.status === 422 && count("fo_stage_move", `prospect_id = '${p1.id}'`) === 3, { toLost, toNurture, otherPipe, noVersion, sysCause });
  // Break M1: four moves at once with the same version → one saved, the others 409 STALE (never 404).
  const racer = await pros.engage(R, (await lead("Rae")).id);
  const race = await Promise.all(["QUALIFIED", "CONSULT", "PROPOSAL", "RETAINER_SENT"].map((k) => refusal(() => pros.move(R, racer.id, { stageId: stage(k), version: racer.version }))));
  ok("FO-2p3 DW2 fail (break M1): four moves at once on the same version → one saved, three 409 STALE, none 404",
    race.filter((x) => x === null).length === 1 && race.filter((x) => x?.status === 409 && x.body.code === "STALE").length === 3 && count("fo_stage_move", `prospect_id = '${racer.id}'`) === 2, race.map((x) => x?.status ?? 200));
  const convRace = await Promise.all([0, 1, 2].map(() => refusal(() => pros.convert(R, racer.id, {}))));
  ok("FO-2p3 DW4 fail (break M1): three Converts at once → one, the others 409 ALREADY_WON", convRace.filter((x) => x === null).length === 1 && convRace.filter((x) => x?.body.code === "ALREADY_WON").length === 2, convRace.map((x) => x?.status ?? 200));
  ok("FO-2p3 pass (break m1): a version counts this prospect's own moves only", (await pros.read(R, racer.id)).version === "3");
  const failing = new Prospects(db, { ...ports, audit: fakeAudit({ failOn: () => true }) });
  const forced = await refusal(() => failing.move(R, p1.id, { stageId: stage("CONSULT"), version: back.version }));
  ok("FO-2p3 DW2 fail: a forced audit failure rolls the move back (stage, move and event unchanged)",
    forced !== null && sql(`select key from fo_stage s join fo_prospect p on p.stage_id = s.id where p.id = '${p1.id}'`) === "ENGAGED" && count("fo_stage_move", `prospect_id = '${p1.id}'`) === 3 && events(p1.id, EVENT.PROSPECT_STAGE_MOVED) === 2, forced);
  const unseen = await refusal(async () => { await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws }); try { return await pros.move(R, p1.id, { stageId: stage("CONSULT"), version: back.version }); } finally { await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws }); } });
  ok("FO-2p3 DW2 fail: with \"everyone sees all\" off, moving another person's prospect → 404 (the read's answer)", unseen?.status === 404, unseen);

  // ------------------------------------------------------------------------------------- DW3: Mark lost
  const noReason = await refusal(() => pros.lost(R, p1b.id, { note: "No reason given" }));
  const leadReason = await refusal(() => pros.lost(R, p1b.id, { reasonId: reason("LEAD_CLOSE", "NOT_INTERESTED") }));
  const bReason = await refusal(() => pros.lost(R, p1b.id, { reasonId: reason("PROSPECT_LOST", "PRICE", B) }));
  const mergeReason = await refusal(() => pros.lost(R, p1b.id, { reasonId: reason("PROSPECT_LOST", "COMBINED_PROSPECT") }));
  ok("FO-2p3 DW3 fail: Mark lost without a reason → 422 at the field; a reason from the lead list, another firm's or a merge's → 422; nothing changed",
    noReason?.status === 422 && (noReason.body.fields as Record<string, string>)?.reasonId !== undefined && leadReason?.status === 422 && bReason?.status === 422 && mergeReason?.status === 422
      && sql(`select s.kind from fo_stage s join fo_prospect p on p.stage_id = s.id where p.id = '${p1b.id}'`) === "ACTIVE", { noReason, leadReason, bReason, mergeReason });
  const lost = await pros.lost(R, p1b.id, { reasonId: reason("PROSPECT_LOST", "DUPLICATE_PROSPECT"), note: "Two Engage clicks" });
  ok("FO-2p3 DW3 pass: Mark lost with a prospect reason (the system's Duplicate one may be chosen) → the LOST stage with the reason and note; audited; prospect.lost with the key, never the note",
    lost.stage.kind === "LOST" && lost.lostReason?.key === "DUPLICATE_PROSPECT" && lost.lostNote === "Two Engage clicks" && audits(p1b.id, EVENT.PROSPECT_LOST) === 1
      && count("module_event", `subject_id = '${p1b.id}' and type = '${EVENT.PROSPECT_LOST}' and payload->>'lostReasonKey' = 'DUPLICATE_PROSPECT' and payload::text not like '%Two Engage%'`) === 1, lost);
  // Mark lost from NURTURE (AG-2-44 rule 4): parked by hand here (Park, AG-2-45, is not built), then lost.
  const parked = await pros.engage(R, (await lead("Pia")).id), nur = stage("NURTURE");
  sql(`begin; update fo_prospect set stage_id = '${nur}' where id = '${parked.id}'; insert into fo_stage_move (firm_id, prospect_id, from_stage_id, to_stage_id, cause, by_actor) values ('${A}', '${parked.id}', '${stage("ENGAGED")}', '${nur}', 'PERSON', 'test'); commit`);
  const fromNurture = await pros.lost(R, parked.id, { reasonId: reason("PROSPECT_LOST", "NOT_READY") });
  ok("FO-2p3 DW3 pass: a parked (NURTURE) prospect can be marked lost", fromNurture.stage.kind === "LOST" && fromNurture.lostReason?.key === "NOT_READY", fromNurture);
  const listed = await pros.list(R, {}), lostList = await pros.list(R, { stage: "LOST" });
  ok("FO-2p3 DW3 pass: the default list leaves a lost prospect out; the Lost filter lists it", !listed.some((p) => p.id === p1b.id) && listed.some((p) => p.id === p1.id) && lostList.length === 2 && lostList.some((x) => x.id === p1b.id && x.lostReason?.key === "DUPLICATE_PROSPECT"), { listed: listed.length, lostList });
  const lostMove = await refusal(() => pros.move(R, p1b.id, { stageId: stage("CONSULT"), version: lost.version }));
  const lostAgain = await refusal(() => pros.lost(R, p1b.id, { reasonId: reason("PROSPECT_LOST", "PRICE") }));
  ok("FO-2p3 DW3 fail: a lost prospect does not move and is not lost twice (409)", lostMove?.status === 409 && lostAgain?.status === 409, { lostMove, lostAgain });
  const badStage = await refusal(() => pros.list(R, { stage: "WHATEVER" }));
  ok("FO-2p3 DW3 fail: an unknown stage filter → 422 naming the stages (PF-28 part 3a: a field error is 422)", badStage?.status === 422 && String(badStage.body.detail).includes("LOST"), badStage);

  // ------------------------------------------------------------------------------------- DW4: Convert and Undo
  const conv = await pros.convert(R, p1.id, {});
  ok("FO-2p3 DW4 pass: Convert to client → WON, wonVia CONVERTED, the \"Retainer not signed\" warning; one CONVERT move into WON; prospect.won with the PERSON subject",
    conv.stage.kind === "WON" && conv.wonVia === "CONVERTED" && conv.wonAt !== null && conv.warning === NOT_SIGNED && conv.retainerSigned === false
      && count("fo_stage_move", `prospect_id = '${p1.id}' and cause = 'CONVERT'`) === 1 && audits(p1.id, EVENT.PROSPECT_WON) === 1
      && count("module_event", `subject_id = '${p1.id}' and type = '${EVENT.PROSPECT_WON}' and payload->>'won_via' = 'CONVERTED' and payload->'subject'->>'subject' = 'PERSON' and payload->>'retainerSigned' = 'false'
        and payload->>'firm_key' = 'sample-firm' and payload->>'firm_id' = '${A}' and payload->>'lead_id' = '${ana.id}' and payload->'answers'->>'person.given_names' = 'Ana'
        and payload->'answers'->>'person.email' like 'ana%@example.com' and payload->'answers'->'person.current_residence_country' = 'null'::jsonb and payload->>'retainer_id' is null
        and jsonb_typeof(payload->'consent_ids') = 'array'`) === 1, sql(`select payload from module_event where subject_id = '${p1.id}' and type = '${EVENT.PROSPECT_WON}'`));
  const twice = await refusal(() => pros.convert(R, p1.id, {}));
  ok("FO-2p3 DW4 fail: Convert twice → 409 ALREADY_WON, no second prospect.won", twice?.status === 409 && twice.body.code === "ALREADY_WON" && events(p1.id, EVENT.PROSPECT_WON) === 1, twice);
  const wonMove = await refusal(() => pros.move(R, p1.id, { stageId: stage("CONSULT"), version: conv.version }));
  ok("FO-2p3 DW4 fail: a won prospect does not move back by hand (409, AG-2-26 rule 2)", wonMove?.status === 409 && String(wonMove.body.detail).startsWith("A won prospect cannot go back"), wonMove);
  const noWhy = await refusal(() => pros.undoConvert(R, p1.id, {}));
  ok("FO-2p3 DW4 fail: Undo convert without a reason → 422 at the field, still WON", noWhy?.status === 422 && sql(`select won_via from fo_prospect where id = '${p1.id}'`) === "CONVERTED", noWhy);
  const undone = await pros.undoConvert(R, p1.id, { reason: "Converted by mistake" });
  ok("FO-2p3 DW4 pass: Undo convert while the client is empty → back to the stage before WON (Engaged), WON cleared, the reason kept as an INTERNAL note (not in the audit line), prospect.unconverted",
    undone.stage.key === "ENGAGED" && undone.wonVia === null && undone.wonAt === null && !("warning" in undone)
      && count("fo_note", `prospect_id = '${p1.id}' and visibility = 'INTERNAL' and text = 'Convert undone: Converted by mistake'`) === 1
      && audits(p1.id, EVENT.PROSPECT_UNCONVERTED) === 1 && count("audit_event", `entity_key = '${p1.id}' and detail::text like '%mistake%'`) === 0 && events(p1.id, EVENT.PROSPECT_UNCONVERTED) === 1, undone);
  const notWon = await refusal(() => pros.undoConvert(R, p1.id, { reason: "Again" }));
  ok("FO-2p3 DW4 fail: Undo convert on a prospect that is not won → 409", notWon?.status === 409 && notWon.body.code === "NOT_WON", notWon);
  // A signed retainer on the prospect (FO-5's tables, as FO-2b's check makes one): Undo is refused after it.
  await pros.convert(R, p1.id, {});
  const TPL = randomUUID(), RET = randomUUID(), VER = randomUUID(), hex = (k: number) => k.toString(16).padStart(64, "0");
  sql(`insert into fo_retainer_template (id, firm_id, name, kind, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${TPL}', '${A}', 'Retainer (Sample)', 'RETAINER', 'retainer-templates/${TPL}/v1.docx', '${hex(1)}', '{client.name,fees}', 'seed:FO-2p3-test', 'seed:FO-2p3-test', now())`);
  sql(`insert into fo_retainer (id, firm_id, kind, prospect_id, subject, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at) values ('${RET}', '${A}', 'RETAINER', '${p1.id}', 'PERSON', '${ana.person.id}', '${R.staffId}', '${TPL}', 1, 'retainer-templates/${TPL}/v1.docx', 'staff:${R.staffId}', now()); insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${VER}', '${A}', '${RET}', 1, '{"client.name":"Ana Sample"}', 'retainers/${RET}/v1.docx', '${hex(11)}', 'staff:${R.staffId}')`);
  sql(`update fo_retainer_version set sent_at = now() where id = '${VER}'; update fo_retainer set status = 'SENT' where id = '${RET}'; update fo_retainer set status = 'CLIENT_SIGNED' where id = '${RET}'; update fo_retainer set status = 'SIGNED' where id = '${RET}'`);
  const afterSigned = await refusal(() => pros.undoConvert(R, p1.id, { reason: "Too late" }));
  ok("FO-2p3 DW4 fail: after a signed retainer, Undo convert → 409 SIGNED saying so; still WON", afterSigned?.status === 409 && afterSigned.body.code === "SIGNED" && String(afterSigned.body.detail).includes("signed retainer") && sql(`select won_via from fo_prospect where id = '${p1.id}'`) === "CONVERTED", afterSigned);
  ok("FO-2p3 DW4 pass: with the retainer signed, the read shows it and drops the warning", await pros.read(R, p1.id).then((x) => x.retainerSigned === true && !("warning" in x)));
  const lostConv = await refusal(() => pros.convert(R, p1b.id, {}));
  ok("FO-2p3 DW4 fail: a lost prospect cannot be converted (409)", lostConv?.status === 409, lostConv);

  // ------------------------------------------------------------------------------------- DW5: board totals per currency
  const bea = await lead("Bea"), cal = await lead("Cal"), dov = await lead("Dov", T);
  const [pb, pc, pd] = [await pros.engage(R, bea.id), await pros.engage(R, cal.id), await pros.engage(T, dov.id)];
  sql(`update fo_prospect set value_cents = 150000, currency = 'CAD' where id = '${pb.id}'; update fo_prospect set value_cents = 250000, currency = 'CAD' where id = '${pu.id}'; update fo_prospect set value_cents = 99900, currency = 'USD' where id = '${pc.id}'; update fo_prospect set value_cents = 500, currency = 'USD' where id = '${pd.id}'`);
  await pros.move(R, pd.id, { stageId: stage("CONSULT"), version: pd.version });
  const board = await corp.board(R, "INDIVIDUAL") as unknown as { totals: { currency: string; valueCents: number; count: number }[]; stages: { key: string; totals: { currency: string; valueCents: number }[]; prospects: { id: string }[] }[] };
  const engaged = board.stages.find((s) => s.key === "ENGAGED")!, consult = board.stages.find((s) => s.key === "CONSULT")!;
  ok("FO-2p3 DW5 pass: the Individual board through FO-2b's route carries totals per currency, CAD and USD apart, per stage and over the open stages",
    JSON.stringify(board.totals) === JSON.stringify([{ currency: "CAD", valueCents: 400000, count: 2 }, { currency: "USD", valueCents: 100400, count: 2 }])
      && JSON.stringify(engaged.totals) === JSON.stringify([{ currency: "CAD", valueCents: 400000, count: 2 }, { currency: "USD", valueCents: 99900, count: 1 }])
      && JSON.stringify(consult.totals.map((t) => [t.currency, t.valueCents])) === JSON.stringify([["USD", 500]]) && engaged.prospects.some((p) => p.id === pb.id), board.totals);
  ok("FO-2p3 DW5 fail: no total ever adds CAD to USD (no line of 500400 or 500900), and a Corporate prospect is not on the Individual board",
    ![...board.totals, ...board.stages.flatMap((s) => s.totals)].some((t) => t.valueCents === 500400 || t.valueCents === 499900 || t.valueCents === 400500) && board.stages.every((s) => s.prospects.every((p) => (p as { type?: string }).type === "INDIVIDUAL")) && board.stages.some((s) => s.prospects.length > 0));
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });
  const ownBoard = await corp.board(T, "INDIVIDUAL") as unknown as { totals: { currency: string; valueCents: number }[] };
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });
  ok("FO-2p3 DW5 fail: with \"everyone sees all\" off, T's totals count only T's prospects (CAD 2500.00 of Una's, USD 5.00 of Dov's)", JSON.stringify(ownBoard.totals.map((t) => [t.currency, t.valueCents])) === JSON.stringify([["CAD", 250000], ["USD", 500]]), ownBoard.totals);

  // ------------------------------------------------------------------------------------- DW6: leads owner and date filters
  // The "all" view lists open leads: three fresh ones (one T's) for the owner and date filters.
  const tia = await lead("Tia", T), eli = await lead("Eli"), fay = await lead("Fay");
  const mine = await leads.list(R, "all", undefined, { owner: T.staffId });
  ok("FO-2p3 DW6 pass: the owner filter lists only that person's leads", mine.length === 1 && mine[0].id === tia.id, mine.map((l) => l.ownerStaffId));
  sql(`update fo_lead set arrived_at = '2026-11-02 03:30:00+00' where id = '${eli.id}'`);   // 1 Nov 23:30 in Toronto
  sql(`update fo_lead set arrived_at = '2026-11-02 05:30:00+00' where id = '${fay.id}'`);   // 2 Nov 00:30 in Toronto
  await writeSetting(db, { firmId: A, key: TIME_ZONE.key, value: "America/Toronto", by: "system:test", workspaceId: ws });
  const nov1 = await leads.list(R, "all", undefined, { from: "2026-11-01", to: "2026-11-01" }), nov2 = await leads.list(R, "all", undefined, { from: "2026-11-02", to: "2026-11-02" });
  ok("FO-2p3 DW6 pass: the date filter reads the arrival day in the firm's zone (23:30 Toronto is 1 Nov; 00:30 is 2 Nov)",
    nov1.map((l) => l.id).join() === eli.id && nov2.map((l) => l.id).join() === fay.id, { nov1: nov1.map((l) => l.number), nov2: nov2.map((l) => l.number) });
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });
  const oWithR = await leads.list(O, "all", undefined, { owner: R.staffId }), oProspects = await pros.list(O, { owner: R.staffId });
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });
  ok("FO-2p3 DW6 fail: the filters narrow inside the visibility: own-only O filtering on R's leads or prospects gets none", oWithR.length === 0 && oProspects.length === 0, { oWithR, oProspects });
  const bLeads = await leads.list(SOLO, "all", undefined, { from: "2026-11-01", to: "2030-01-01" }), bPros = await pros.list(SOLO, {});
  const bOwner = await refusal(() => leads.list(SOLO, "all", undefined, { owner: R.staffId }));
  ok("FO-2p3 DW6 fail: firm B never sees firm A's leads or prospects, and naming firm A's staff as owner → 422",
    !bLeads.some((l) => [tia.id, eli.id, fay.id].includes(l.id)) && !bPros.some((p) => p.id === p1.id) && bOwner?.status === 422 && bOwner.body.code === "UNKNOWN_OWNER", { bOwner });
  const badDay = await refusal(() => leads.list(R, "all", undefined, { from: "2026-13-01" })), backwards = await refusal(() => leads.list(R, "all", undefined, { from: "2026-11-02", to: "2026-11-01" }));
  const year0 = await refusal(() => leads.list(R, "all", undefined, { from: "0000-01-01" })), year9 = await refusal(() => pros.list(R, { to: "9999-12-31" }));
  ok("FO-2p3 DW6 fail: a date that is not a day, from after to, or a year outside 1900-2999 (break m2: was 500) → 422 (PF-28 part 3a: a field error is 422)", badDay?.status === 422 && backwards?.status === 422 && year0?.status === 422 && year9?.status === 422, { badDay, backwards, year0, year9 });
  ok("FO-2p3 DW6 pass: the prospects list filters by owner and engaged day too", (await pros.list(R, { owner: T.staffId })).every((p) => p.ownerStaffId === T.staffId) && (await pros.list(R, { from: "2000-01-01", to: "2000-01-02" })).length === 0);
  const readB = await refusal(() => pros.read(SOLO, p1.id));
  ok("FO-2p3 DW6 fail: firm B reading firm A's prospect → 404", readB?.status === 404, readB);

  // ------------------------------------------------------------------------------------- the routes' keys
  const keysOf = (m: string) => (Reflect.getMetadata(PLATFORM_ACCESS, (SalesController.prototype as unknown as Record<string, object>)[m]) as { keys?: string[] } | undefined)?.keys?.join(",");
  const want: Record<string, string> = { engage: "agent/prospect:edit", prospectList: "agent/prospect:show", prospectRead: "agent/prospect:show", move: "agent/prospect:edit", lost: "agent/prospect:lose", convert: "agent/prospect:convert", undoConvert: "agent/prospect:convert" };
  ok("FO-2p3 pass: every new route declares its seeded agent/prospect:* key", Object.entries(want).every(([k, v]) => keysOf(k) === v), Object.keys(want).map((k) => `${k}=${keysOf(k)}`));
  const readOnly = sql(`select string_agg(permission_key, ',') from platform_role_permission where role = 'READ_ONLY'`).split(",");
  ok("FO-2p3 fail: a Read-only person holds none of the write keys (403 at the guard)", ["engage", "move", "lost", "convert", "undoConvert"].every((k) => !readOnly.includes(keysOf(k)!)) && readOnly.includes("agent/prospect:show"));
} catch (e) {
  fail++;
  console.log(`FAIL  FO-2p3: the check stopped — ${String((e as Error).stack ?? e).slice(0, 1200)}`);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-2p3 Individual prospects: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
