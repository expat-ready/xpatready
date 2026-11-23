// FO-2w (brief design/lead-b-briefs/FO-2w.md on lead-b-front-office; contracts §7 §2.6; AG-2-26 rule 3, AG-2-47; R1.72's
// chain): every win raises `prospect.won`, through the one helper `winProspect` (sales/prospects.ts), once per prospect, in
// the win's transaction. Signed offline (retainers/service.ts) and Convert both call it. Each check has a pass and a fail,
// on one scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end. US$0.
//   tsx studio/tests/check_fo2w_won_event.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditPort } from "../ports/audit.ts";
import { EVENT, ProspectWonPayload } from "../ports/events.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { Retainers } from "../api/src/front-office/retainers/service.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";
import type { Tx } from "../api/src/front-office/sales/common.ts";
import { Corporate } from "../api/src/front-office/sales/corporate/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects, winProspect } from "../api/src/front-office/sales/prospects.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const SERVICE = join(STUDIO, "api", "src", "front-office", "retainers", "service.ts");
const MUTANT = join(STUDIO, "api", "src", "front-office", "retainers", `.fo2w-mutant-${process.pid}.ts`);
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo2w_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `fo2w-check-${process.pid}`);

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
const won = (pid: string) => count("module_event", `subject_id = '${pid}' and type = '${EVENT.PROSPECT_WON}'`);
const stageOf = (pid: string) => sql(`select s.kind || ':' || coalesce(p.won_via::text, '-') from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${pid}'`);
const moves = (pid: string) => count("fo_stage_move", `prospect_id = '${pid}'`);
const pdf = (s = "signed") => { const b = Buffer.from(`%PDF-1.4\n% ${s}\n%%EOF\n`); return { bytes: new Uint8Array(b), size: b.length }; };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-2w setup: the Sample firms have their pipelines", fo.failed.length === 0 && count("fo_stage", "kind = 'WON'") === 4);

  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: "sample-firm", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R");
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });

  // An audit port that fails on one action: the forced failure after the stage move (the line is written after it).
  const failingOn = (action: string): AuditPort<Tx> => ({ record: async (tx, e) => { if (e.action === action) throw new Error(`forced failure on ${action}`); return auditEvent.record(tx, e); } } as AuditPort<Tx>);
  const salesPorts = (audit: AuditPort<Tx> = auditEvent): SalesPorts => ({ audit, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" });
  const leads = new Leads(db, salesPorts()), pros = new Prospects(db, salesPorts()), corp = new Corporate(db, salesPorts());
  const store = new LocalFiles(join(WORK, "files")), clock = { now: () => Date.now() };
  const svc = new Retainers(db, store, clock);
  clearingConflicts(db, { prospects: Prospects.prototype, retainers: Retainers.prototype });   // FO-13c: the conflict check first

  // A prospect (Individual, Engaged) with a DRAFT retainer on it (FO-5's tables, as FO-2p3's check makes one).
  const TPL = randomUUID(), hex = (k: number) => k.toString(16).padStart(64, "0");
  sql(`insert into fo_retainer_template (id, firm_id, name, kind, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${TPL}', '${A}', 'Retainer (Sample)', 'RETAINER', 'retainer-templates/${TPL}/v1.docx', '${hex(1)}', '{client.name,fees}', 'seed:FO-2w-test', 'seed:FO-2w-test', now())`);
  let n = 0;
  const prospect = async (given: string) => {
    const l = (await leads.add(R, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}@example.com`, source: "Phone call" })) as { id: string; person: { id: string } };
    const p = await pros.engage(R, l.id);
    return { id: p.id, personId: l.person.id };
  };
  const retainer = (p: { id: string; personId: string }, companyId: string | null = null) => {
    const RET = randomUUID();
    sql(`insert into fo_retainer (id, firm_id, kind, prospect_id, subject, company_id, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at) values ('${RET}', '${A}', 'RETAINER', '${p.id}', '${companyId ? "COMPANY" : "PERSON"}', ${companyId ? `'${companyId}'` : "null"}, '${p.personId}', '${R.staffId}', '${TPL}', 1, 'retainer-templates/${TPL}/v1.docx', 'staff:${R.staffId}', now()); insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${randomUUID()}', '${A}', '${RET}', 1, '{"client.name":"Sample"}', 'retainers/${RET}/v1.docx', '${hex(++n + 10)}', 'staff:${R.staffId}')`);
    return RET;
  };
  const signOffline = (s: Retainers, id: string) => s.signedOffline(R, id, { expectedVersion: "1", reason: "Signed at the office" }, pdf());

  // ------------------------------------------------------------- W1: a paper-signed retainer raises prospect.won once
  const p1 = await prospect("Ana"), r1 = retainer(p1);
  const off = await signOffline(svc, r1);
  const ev = await db.moduleEvent.findFirst({ where: { subjectId: p1.id, type: EVENT.PROSPECT_WON } });
  const payload = ev ? ProspectWonPayload.safeParse(ev.payload) : null;
  ok("FO-2w W1 pass: Signed offline wins the prospect (WON, SIGNED_OFFLINE) and raises exactly one prospect.won",
    off.prospectWon === true && stageOf(p1.id) === "WON:SIGNED_OFFLINE" && won(p1.id) === 1, { off: off.prospectWon, stage: stageOf(p1.id), won: won(p1.id) });
  ok("FO-2w W1 pass: its payload is contracts §2.6's, won via SIGNED_OFFLINE, naming this retainer and its representative, with the subject part (the person)",
    payload?.success === true && payload.data.won_via === "SIGNED_OFFLINE" && payload.data.retainer_id === r1 && payload.data.retainerSigned === true
      && payload.data.representative_staff_id === R.staffId && payload.data.subject.subject === "PERSON" && (payload.data.subject as { personId?: string }).personId === p1.personId, payload);
  ok("FO-2w W1 pass: retainer.signed_offline is still raised beside it, one stage move with cause SIGNED_OFFLINE, one prospect.won audit line",
    count("module_event", `type = '${EVENT.RETAINER_SIGNED_OFFLINE}' and payload->>'retainerId' = '${r1}'`) === 1
      && count("fo_stage_move", `prospect_id = '${p1.id}' and cause = 'SIGNED_OFFLINE'`) === 1 && count("audit_event", `entity_key = '${p1.id}' and action = 'prospect.won'`) === 1);
  ok("FO-2w W1 pass: the event's row sits in the same transaction as the win (same xmin as the prospect row)",
    sql(`select (select xmin::text from fo_prospect where id = '${p1.id}') = (select xmin::text from module_event where subject_id = '${p1.id}' and type = '${EVENT.PROSPECT_WON}')`) === "t");

  // ------------------------------------------------------------- W2: a second win raises nothing more
  const again = await refusal(() => signOffline(svc, r1));
  ok("FO-2w W2 fail: a second offline sign of the same retainer → 409, no second prospect.won", again?.status === 409 && won(p1.id) === 1, { again, won: won(p1.id) });
  const conv = await refusal(() => pros.convert(R, p1.id, {}));
  ok("FO-2w W2 fail: Convert after the paper win → 409 ALREADY_WON, no second prospect.won, no move", conv?.status === 409 && conv.body.code === "ALREADY_WON" && won(p1.id) === 1 && moves(p1.id) === 2, { conv, won: won(p1.id) });
  const direct = await db.$transaction((tx) => winProspect(tx, R, p1.id, { via: "E_SIGNED", at: new Date(), audit: async () => { throw new Error("must not be called"); } }));
  ok("FO-2w W2 fail: the helper itself on a WON prospect (FO-6's e-signature after a paper win) → null, writes nothing, no audit",
    direct === null && won(p1.id) === 1 && moves(p1.id) === 2 && stageOf(p1.id) === "WON:SIGNED_OFFLINE");
  // Converted first, then signed on paper: the retainer is filed, the prospect stays CONVERTED, no second event.
  const p2 = await prospect("Bea");
  await pros.convert(R, p2.id, {});
  const r2 = retainer(p2), off2 = await signOffline(svc, r2);
  ok("FO-2w W2 fail: a paper sign after Convert files the retainer but raises no second prospect.won (prospectWon false, still CONVERTED)",
    off2.status === "SIGNED_OFFLINE" && off2.prospectWon === false && won(p2.id) === 1 && stageOf(p2.id) === "WON:CONVERTED", { off2: off2.prospectWon, won: won(p2.id) });
  // Both at once: a paper sign and a Convert race on one prospect; the row lock lets one win.
  const p3 = await prospect("Cal"), r3 = retainer(p3);
  const race = await Promise.allSettled([signOffline(svc, r3), pros.convert(R, p3.id, {})]);
  ok("FO-2w W2 pass: a paper sign and a Convert at once → exactly one prospect.won and one WON move",
    won(p3.id) === 1 && count("fo_stage_move", `prospect_id = '${p3.id}' and cause in ('SIGNED_OFFLINE', 'CONVERT')`) === 1 && race.some((x) => x.status === "fulfilled"), race.map((x) => x.status));

  // ------------------------------------------------------------- W3: one transaction: a failure after the move undoes both
  const p4 = await prospect("Dov"), r4 = retainer(p4);
  const broken = new Retainers(db, store, clock, failingOn("retainer.signed_offline"));
  const f4 = await refusal(() => signOffline(broken, r4));
  ok("FO-2w W3 fail: Signed offline fails after the stage move (its retainer audit line) → the prospect is not won, no move, no prospect.won, retainer still DRAFT",
    f4 !== null && stageOf(p4.id) === "ACTIVE:-" && moves(p4.id) === 1 && won(p4.id) === 0 && sql(`select status from fo_retainer where id = '${r4}'`) === "DRAFT", { f4, stage: stageOf(p4.id), won: won(p4.id) });
  const okAfter = await signOffline(svc, r4);
  ok("FO-2w W3 pass: the same sign then succeeds and raises one prospect.won", okAfter.prospectWon === true && won(p4.id) === 1);
  const p5 = await prospect("Eli");
  const f5 = await refusal(() => new Prospects(db, salesPorts(failingOn(EVENT.PROSPECT_WON))).convert(R, p5.id, {}));
  ok("FO-2w W3 fail: Convert fails after the stage move (its audit line) → not won, no move, no prospect.won",
    f5 !== null && stageOf(p5.id) === "ACTIVE:-" && moves(p5.id) === 1 && won(p5.id) === 0, { f5, stage: stageOf(p5.id) });

  // ------------------------------------------------------------- W4: Convert still raises once
  await pros.convert(R, p5.id, {});
  const ev5 = await db.moduleEvent.findFirst({ where: { subjectId: p5.id, type: EVENT.PROSPECT_WON } });
  const pl5 = ev5 ? ProspectWonPayload.safeParse(ev5.payload) : null;
  ok("FO-2w W4 pass: Convert raises exactly one prospect.won, won via CONVERTED, no retainer, the subject part, one CONVERT move",
    won(p5.id) === 1 && pl5?.success === true && pl5.data.won_via === "CONVERTED" && pl5.data.retainer_id === null && pl5.data.retainerSigned === false
      && pl5.data.subject.subject === "PERSON" && count("fo_stage_move", `prospect_id = '${p5.id}' and cause = 'CONVERT'`) === 1 && stageOf(p5.id) === "WON:CONVERTED", pl5);
  const twice = await refusal(() => pros.convert(R, p5.id, {}));
  ok("FO-2w W4 fail: a second Convert → 409, still one prospect.won", twice?.status === 409 && won(p5.id) === 1);

  // ------------------------------------------------------------- W4c: a Corporate paper win carries the company subject
  const gil = (await leads.add(R, { requestId: randomUUID(), givenNames: "Gil", familyName: "Sample", email: `gil${++n}@example.com`, source: "Phone call" })) as { id: string; person: { id: string } };
  const pc = await corp.engage(R, gil.id, { companyName: "Cedar Works Ltd" }) as { id: string; company?: { id: string } | null };
  const rc = retainer({ id: pc.id, personId: gil.person.id }, pc.company!.id);
  const offC = await signOffline(svc, rc);
  const evC = await db.moduleEvent.findFirst({ where: { subjectId: pc.id, type: EVENT.PROSPECT_WON } });
  const plC = evC ? ProspectWonPayload.safeParse(evC.payload) : null;
  const subjC = plC?.success ? plC.data.subject as { subject: string; company?: { id: string }; contacts?: { personId: string; primaryContact: boolean }[] } : null;
  ok("FO-2w W4c pass: a Corporate prospect signed on paper raises one prospect.won, type CORPORATE, the COMPANY subject with its company and its primary contact",
    offC.prospectWon === true && won(pc.id) === 1 && plC?.success === true && plC.data.type === "CORPORATE" && subjC?.subject === "COMPANY" && subjC.company?.id === pc.company?.id
      && subjC.contacts?.some((c) => c.personId === gil.person.id && c.primaryContact) === true, plC);
  ok("FO-2w W4c fail: Convert afterwards on the Corporate prospect → 409, still one prospect.won", (await refusal(() => pros.convert(R, pc.id, {})))?.status === 409 && won(pc.id) === 1);

  // ------------------------------------------------------------- W5: the suite catches a Signed offline without the helper
  const src = readFileSync(SERVICE, "utf8");
  const callAt = src.indexOf("prospectWon = (await winProspect(");
  ok("FO-2w W5 pass: Signed offline calls winProspect, and in the front office (the emitters; the case side's consumer is FO-8's) prospect.won is named only in the helper's file and Signed offline's audit line",
    callAt > src.indexOf("async signedOffline(") && src.indexOf("async signedOffline(") > 0
      && execFileSync("grep", ["-rlE", "--include=*.ts", "EVENT\\.PROSPECT_WON|\"prospect\\.won\"", join(STUDIO, "api", "src", "front-office")], { encoding: "utf8" }).trim().split("\n").map((f) => f.slice(STUDIO.length + 1)).sort().join(",")
        === ["api/src/front-office/retainers/on-signing-completed.ts", "api/src/front-office/retainers/service.ts", "api/src/front-office/sales/prospects.ts"].join(","));   // FO-6 part 3: the e-signature win's audit line
  // The mutant: the same service with the helper call taken out (prospectWon stays false), run on a fresh prospect.
  const end = src.indexOf("!== null;", callAt) + "!== null;".length;
  writeFileSync(MUTANT, src.slice(0, callAt) + "prospectWon = false;" + src.slice(end));
  try {
    const { Retainers: Mutant } = await import(MUTANT) as { Retainers: typeof Retainers };
    clearingConflicts(db, { retainers: Mutant.prototype });   // FO-13c: the conflict check first
    const p6 = await prospect("Fay"), r6 = retainer(p6);
    await signOffline(new Mutant(db, store, clock), r6);
    ok("FO-2w W5 fail: with the helper call removed from Signed offline, W1's check fails (no prospect.won, prospect not won)", won(p6.id) === 0 && stageOf(p6.id) === "ACTIVE:-", { won: won(p6.id), stage: stageOf(p6.id) });
  } finally { rmSync(MUTANT, { force: true }); }
} catch (e) {
  fail++; console.log(`FAIL  FO-2w: ${(e as Error).stack ?? String(e)}`);
} finally {
  await db.$disconnect();
  rmSync(MUTANT, { force: true });
  rmSync(WORK, { recursive: true, force: true });
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
}
console.log(`\nFO-2w: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
