// FO-5b (BACKLOG row FO-5b; P-566 (3), P-567 (2); contracts §7): the retainer checklist from the regulator's Code
// (SOR/2022-128 s. 24(3)(a)-(z)). One test per business rule, each with a pass and a fail: the data file holds the Code's
// 26 paragraphs word for word with section, URL and "current to" date; each item is present or missing by its
// placeholders or clause marker; the markers are known placeholders that print nothing; the checklist never blocks a
// send; each version keeps its own list until sent; a sent retainer's list never changes; tenancy and the route's key.
// One scratch database with every migration and the Sample firms; the real FilesPort (scratch folder) and docxtemplater;
// no server, no browser, no model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo5b_retainer_checklist.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { CODE_FILE, CODE_ITEMS, markedLetters } from "../api/src/front-office/retainers/code-checklist.ts";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { PLACEHOLDERS } from "../api/src/front-office/retainers/placeholders.ts";
import { RetainersController } from "../api/src/front-office/retainers/routes.ts";
import { Retainers } from "../api/src/front-office/retainers/service.ts";
import { PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { Reflector } from "@nestjs/core";
import { readCatalogue } from "../api/src/platform/identity/catalogue.ts";
import { PlatformGuard } from "../api/src/platform/identity/guard.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo5b_${process.pid}`, WORK = join(STUDIO, "var", `fo5b-check-${process.pid}`);
const urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const refused = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
const fails = async (f: () => Promise<unknown>, status: number, re: RegExp = /./) => {
  try { await f(); return false; } catch (e) {
    const r = e as { getResponse?: () => unknown; getStatus?: () => number }, body = JSON.stringify(r.getResponse?.() ?? String(e));
    const okay = r.getStatus?.() === status && re.test(body);
    if (!okay) console.log(`      (refused ${r.getStatus?.()}: ${body.slice(0, 300)})`);
    return okay;
  }
};
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const docx = (lines: string[]) => ({ bytes: buildDocx(lines), size: 1000 });
const textOf = (b: Uint8Array) => new PizZip(b).file("word/document.xml")!.asText().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const BASE = ["# Retainer", "Client: {client.name} ({client.email})", "{#fees}", "{label}: {amount} ({when}{due_on})", "{/fees}"];
const markers = (except: string[] = []) => LETTERS.filter((l) => !except.includes(l)).map((l) => `Clause ${l}. {code.s24_3_${l}}`);

// ------------------------------------------------------------------------------------------------- the data file (DW1)
/** The data file's own check: 26 paragraphs (a)-(z), no gap, no duplicate, each with its section, text, URL and dates. */
function fileProblems(f: { source: Record<string, string>; legalReading: string; items: { letter: string; section: string; text: string; url: string; currentTo: string; readOn: string; marks: { clauseMarker: string } }[] }): string[] {
  const p: string[] = [], letters = f.items.map((i) => i.letter);
  if (letters.join("") !== LETTERS.join("")) p.push(`letters ${letters.join("")}`);
  for (const i of f.items) {
    if (i.section !== `24(3)(${i.letter})`) p.push(`${i.letter}: section ${i.section}`);
    if (!i.text?.trim()) p.push(`${i.letter}: empty text`);
    if (!i.url?.startsWith("https://laws-lois.justice.gc.ca/eng/regulations/SOR-2022-128/")) p.push(`${i.letter}: url`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.currentTo ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(i.readOn ?? "")) p.push(`${i.letter}: dates`);
    if (i.marks?.clauseMarker !== `code.s24_3_${i.letter}`) p.push(`${i.letter}: marker`);
  }
  if (f.legalReading !== "Unconfirmed: no counsel") p.push("legalReading");
  return p;
}
const file = JSON.parse(readFileSync(CODE_FILE, "utf8"));
ok("FO-5b DW1 pass: the data file has the Code's 26 paragraphs (a)-(z), each with section, text, official URL, \"current to\" and read dates, and its marker", fileProblems(file).length === 0 && CODE_ITEMS.length === 26, fileProblems(file));
const gap = structuredClone(file); gap.items.splice(10, 1);
const dup = structuredClone(file); dup.items[11] = { ...dup.items[10] };
ok("FO-5b DW1 fail: a file with a gap (no (k)) or a duplicate letter is caught by the same check", fileProblems(gap).some((x) => /letters/.test(x)) && fileProblems(dup).some((x) => /letters/.test(x)));
// Three paragraphs as read on the page (current to 2026-10-29, read 21 Nov 2026): an edit to the Code's words fails here.
const AS_READ: Record<string, string> = {
  k: "any goods and services tax, harmonized sales tax or other tax or levy to be charged to the client;",
  o: "if applicable, a description of any conflict of interest or potential conflict of interest relating to the client;",
  z: "any other terms agreed to.",
};
ok("FO-5b DW1 pass: (k), (o) and (z) are the Code's words as read, and the source is SOR/2022-128 s. 24(3), current to 2026-10-29",
  Object.entries(AS_READ).every(([l, t]) => CODE_ITEMS.find((i) => i.letter === l)?.text === t) && file.source.instrument === "SOR/2022-128" && file.source.section === "24(3)" && file.source.currentTo === "2026-10-29");
const asRead = (items: { letter: string; text: string }[]) => Object.entries(AS_READ).every(([l, t]) => items.find((i) => i.letter === l)?.text === t);
const para = structuredClone(file); para.items[10].text = "any taxes charged to the client;";
ok("FO-5b DW1 fail: a copy of the file with (k) paraphrased fails the as-read comparison", asRead(file.items) && !asRead(para.items));

// ------------------------------------------------------------------------------------------------- the service
const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
try {
  for (const d of all) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "pipe", "pipe"] });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
  await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key='sample-firm'`), B = sql(`select id from platform_firm where key='sample-solo'`);
  const sid = (actor: string) => sql(`select id from platform_staff where actor_id='${actor}'`);
  const ctxOf = (actor: string, firmId: string, firmKey: string): StaffContext => ({ staffId: sid(actor), firmId, firmKey, roles: [], keys: [], duties: [], authTime: 0, via: "local" });
  const R = ctxOf("user-R", A, "sample-firm"), S = ctxOf("user-S", B, "sample-solo");
  const store = new LocalFiles(join(WORK, "files")), svc = new Retainers(db, store, { now: () => Date.parse("2026-11-24T14:00:00Z") });
  clearingConflicts(db, { retainers: Retainers.prototype });
  const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const stage = sql(`select id from fo_stage where firm_id = '${A}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'`);
  const client = (n: number, given: string | null) => {
    const p = u(100 + n), L = u(200 + n), id = u(300 + n);
    sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${p}', '${A}', ${given ? `'${given}'` : "null"}, ${given ? "'Sample'" : "null"}, 'c${n}@example.com', 'test', now())`);
    sql(`insert into fo_lead (id, firm_id, person_id, door, source, created_by, updated_at) values ('${L}', '${A}', '${p}', 'MANUAL', 'WEBSITE', 'test', now()); update fo_lead set state = 'ENGAGED', engaged_at = now(), engaged_by = 'test' where id = '${L}'`);
    sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at) values ('${id}', '${A}', '${L}', 'INDIVIDUAL', '${stage}', '${p}', '${p}', '${R.staffId}', 'test', now())`);
    sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
    return id;
  };
  const FEE = [{ label: "Professional fee", amountMinor: 250000, when: "ON_SIGNING" }];
  const shown = async (id: string) => { const x = await db.foRetainer.findUniqueOrThrow({ where: { id } }); return { expectedVersion: x.currentVersion, expectedStatus: x.status }; };

  // ----------------------------------------------------------------------------- DW2: each item present or missing
  const plain = await svc.uploadTemplate(R, { name: "No markers" }, docx(BASE));
  const cPlain = await svc.templateChecklist(R, plain.id);
  ok("FO-5b DW2 pass: a template with no markers shows (i) present by its fee rows and the other 25 missing, each with section and Code text",
    cPlain.marked === 1 && cPlain.total === 26 && cPlain.summary === "1 of 26 items marked in this template" && cPlain.items.find((i) => i.letter === "i")?.marked === true
    && cPlain.items.filter((i) => !i.marked).length === 25 && cPlain.items.every((i) => i.section === `24(3)(${i.letter})` && i.text.length > 0), cPlain);
  let each = 0;
  for (const l of LETTERS) {   // every one of the 26 items, alone missing
    const t = await svc.uploadTemplate(R, { name: `All but ${l}` }, docx([...BASE, ...markers([l])]));
    const c = await svc.templateChecklist(R, t.id), miss = c.items.filter((i) => !i.marked).map((i) => i.letter);
    // (i) is also marked by the fee rows, so a template without {code.s24_3_i} still has (i) present.
    if (l === "i" ? miss.length === 0 && c.marked === 26 : JSON.stringify(miss) === JSON.stringify([l]) && c.marked === 25 && c.items.find((i) => i.letter === l)?.section === `24(3)(${l})`) each++;
    else console.log(`      (${l}: missing ${miss.join("")})`);
  }
  ok("FO-5b DW2 pass: for each of the 26 items, a template carrying every marker but that one shows exactly that item missing ((i) stays present by its fee rows)", each === 26, each);
  const full = await svc.uploadTemplate(R, { name: "All markers" }, docx([...BASE, ...markers()]));
  ok("FO-5b DW2 pass: a template with all 26 markers shows 26 of 26", (await svc.templateChecklist(R, full.id)).marked === 26);
  const noK = await svc.uploadTemplate(R, { name: "Missing k" }, docx([...BASE, ...markers(["k"])]));
  const dK = await svc.draft(R, client(1, "Client A"), { templateId: noK.id, fees: FEE });
  ok("FO-5b DW2 pass: the draft's quiet line shows each item present or missing in its template ((k) missing, 25 of 26) and links the checklist",
    dK.codeChecklist?.marked === 25 && dK.codeChecklist.items.filter((i) => !i.present).map((i) => i.letter).join("") === "k" && dK.codeChecklist.link === `/api/front-office/retainer-templates/${noK.id}/checklist`
    && dK.codeChecklist.line === "Code s. 24(3): 25 of 26 items marked in this agreement's template.", dK.codeChecklist);
  ok("FO-5b DW2 fail: an item is never present by a placeholder that is not its own ({client.email} marks neither (a) nor (b))", JSON.stringify(markedLetters(["client.name", "client.email", "representative.name"])) === "[]");

  // ----------------------------------------------------------------------------- DW3: markers are known placeholders
  ok("FO-5b DW3 pass: the known placeholder list carries the 26 clause markers", LETTERS.every((l) => PLACEHOLDERS.some((p) => p.name === `code.s24_3_${l}`)));
  ok("FO-5b DW3 fail: an unknown marker ({code.s24_3_zz}) is refused 422 UNKNOWN_PLACEHOLDER naming it", await fails(() => svc.uploadTemplate(R, { name: "Bad marker" }, docx([...BASE, "{code.s24_3_zz}"])), 422, /UNKNOWN_PLACEHOLDER.*code.s24_3_zz|code.s24_3_zz.*UNKNOWN_PLACEHOLDER/));
  ok("FO-5b DW3 fail: a marker used as a section ({#code.s24_3_k} … {/code.s24_3_k}, which would hide the clause) is refused", await fails(() => svc.uploadTemplate(R, { name: "Section marker" }, docx([...BASE, "{#code.s24_3_k}Tax clause{/code.s24_3_k}"])), 422, /UNKNOWN_PLACEHOLDER/));
  ok("FO-5b DW3 fail: the kept list's name ({code.marked}) is not a placeholder", await fails(() => svc.uploadTemplate(R, { name: "Kept name" }, docx([...BASE, "{code.marked}"])), 422, /UNKNOWN_PLACEHOLDER/));
  const v1 = await db.foRetainerVersion.findFirstOrThrow({ where: { retainerId: dK.id, n: 1 } });
  const txt = textOf((await store.get(A, v1.fileKey))!.bytes);
  ok("FO-5b DW3 pass: a clause marker prints nothing in the agreement (\"Clause a. \" then nothing), the client's name prints", /Clause a\.\s+Clause b\./.test(txt) && !/code\.s24_3|\{|\}/.test(txt) && /Client A Sample/.test(txt), txt.slice(0, 300));
  const dPlain = await svc.draft(R, client(2, "Client B"), { templateId: plain.id, fees: FEE });
  const txtPlain = textOf((await store.get(A, (await db.foRetainerVersion.findFirstOrThrow({ where: { retainerId: dPlain.id, n: 1 } })).fileKey))!.bytes);
  ok("FO-5b DW3 pass: a template with no markers renders as before (no marker text, no stray value)", /Client: Client B Sample/.test(txtPlain) && !/code|undefined|\[object/.test(txtPlain), txtPlain);

  // ----------------------------------------------------------------------------- DW4: never blocking a send
  const sent = await svc.send(R, dPlain.id, { expectedVersion: 1 });
  ok("FO-5b DW4 pass: a draft whose template has 25 items missing is sent (status SENT); the checklist says blocksSend false and adds no blocker",
    sent.status === "SENT" && sent.codeChecklist?.marked === 1 && sent.codeChecklist.blocksSend === false && !Object.keys(dPlain.blockers).some((k) => /code/.test(k)) && dPlain.canSend === true, sent);
  const dNoFee = await svc.draft(R, client(3, "Client C"), { templateId: full.id, fees: [{ label: "Fee", amountMinor: null, when: "ON_SIGNING" }] });
  const dNoName = await svc.draft(R, client(4, null), { templateId: full.id, fees: FEE });
  ok("FO-5b DW4 fail: with all 26 items marked, AG-5-9's two checks still refuse a send with no fee or no client name (unchanged)",
    await fails(() => svc.send(R, dNoFee.id, { expectedVersion: 1 }), 422, /Fee is missing/) && await fails(() => svc.send(R, dNoName.id, { expectedVersion: 1 }), 422, /Client name is missing/));

  // ----------------------------------------------------------------------------- DW5: versions kept until sent
  const e2 = await svc.edit(R, dK.id, { ...(await shown(dK.id)), templateId: full.id });
  ok("FO-5b DW5 pass: an edit onto the full template makes version 2 with 26 of 26, and version 1 keeps its own list ((k) missing)",
    e2.version.n === 2 && e2.codeChecklist?.marked === 26 && e2.versions[0].codeMarked?.length === 25 && !e2.versions[0].codeMarked?.includes("k") && e2.versions[1].codeMarked?.length === 26, e2.versions.map((v) => v.codeMarked?.join("")));
  ok("FO-5b DW5 fail: version 1's kept list cannot be rewritten (a version never changes)", refused(`update fo_retainer_version set merge_values = merge_values || '{"code.marked": []}'::jsonb where id = '${v1.id}'`, /a version never changes/));

  // ----------------------------------------------------------------------------- DW6: a sent retainer unchanged
  const before = await svc.read(R, dPlain.id);
  await svc.newTemplateVersion(R, plain.id, docx([...BASE, ...markers()]));   // the template now marks all 26
  const after = await svc.read(R, dPlain.id);
  ok("FO-5b DW6 pass: after its template gains every marker, the sent retainer still shows its own list (1 of 26) and the same file hash, while the template shows 26",
    JSON.stringify(after.codeChecklist?.items) === JSON.stringify(before.codeChecklist?.items) && after.codeChecklist?.marked === 1 && after.version.sha256 === before.version.sha256
    && JSON.stringify(after.versions[0].codeMarked) === '["i"]' && after.codeChecklist?.templateChanged === true && after.codeChecklist.templateVersion === 1 && after.codeChecklist.templateCurrentVersion === 2 && (await svc.templateChecklist(R, plain.id)).marked === 26, after.codeChecklist);
  const sentV = await db.foRetainerVersion.findFirstOrThrow({ where: { retainerId: dPlain.id, n: 1 } });
  ok("FO-5b DW6 fail: the sent version's list cannot be changed in the database", refused(`update fo_retainer_version set merge_values = jsonb_set(merge_values, '{code.marked}', '["k"]') where id = '${sentV.id}'`, /a version never changes/));

  // ----------------------------------------------------------------------------- DW7: our words, the source line
  const ours = [cPlain.summary, cPlain.source.line, file.source.readNote, dK.codeChecklist!.line, ...cPlain.items.map((i) => i.howWeCheck), ...PLACEHOLDERS.filter((p) => p.name.startsWith("code.s24_")).map((p) => p.label)];
  ok("FO-5b DW7 pass: the source line names the Code, SOR/2022-128, s. 24(3), its official URL and \"current to 2026-10-29\"; legalReading is \"Unconfirmed: no counsel\"",
    /Code of Professional Conduct for College of Immigration and Citizenship Consultants Licensees \(SOR\/2022-128\), s\. 24\(3\), current to 2026-10-29: https:\/\/laws-lois\.justice\.gc\.ca\/eng\/regulations\/SOR-2022-128\//.test(cPlain.source.line)
    && cPlain.legalReading === "Unconfirmed: no counsel" && dK.codeChecklist!.legalReading === "Unconfirmed: no counsel", cPlain.source);
  ok("FO-5b DW7 fail: none of our words (summary, source line, notes, labels, the draft line) says \"required\", \"must\" or \"correct\" (AG-05 rule 7; the Code's own text is not scanned)",
    ours.every((s) => !/\b(required|must|correct)\b/i.test(s)), ours.filter((s) => /\b(required|must|correct)\b/i.test(s)));

  // ----------------------------------------------------------------------------- DW8: firm walls and the key
  ok("FO-5b DW8 fail: firm B reading firm A's template checklist → 404; a malformed id → 404",
    await fails(() => svc.templateChecklist(S, full.id), 404, /NOT_FOUND/) && await fails(() => svc.templateChecklist(R, "x"), 404, /NOT_FOUND/));
  const keys = (Reflect.getMetadata(PLATFORM_ACCESS, (RetainersController.prototype as unknown as Record<string, object>).checklist) as { keys?: string[] } | undefined)?.keys;
  ok("FO-5b DW8 pass: GET retainer-templates/:id/checklist declares agent/retainer:list (default deny for anyone without it)", JSON.stringify(keys) === JSON.stringify(["agent/retainer:list"]), keys);
  // Review m2: PF-4's guard on the route itself: a person without agent/retainer:list gets 403, one with it passes.
  const guard = new PlatformGuard(new Reflector(), {} as never, { authenticate: async (t?: string) => ({ ...R, keys: t === "with" ? ["agent/retainer:list"] : ["agent/retainer:show"] }), catalogue: () => readCatalogue(db), isLicensed: async () => true } as never);
  const call = async (token: string) => {
    const req = { method: "GET", path: `/api/front-office/retainer-templates/${full.id}/checklist`, headers: { authorization: `Bearer ${token}` } };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => RetainersController.prototype.checklist, getClass: () => RetainersController };
    try { return (await guard.canActivate(ctx as never)) ? 200 : 0; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? String(e); }
  };
  const [without, withKey] = [await call("without"), await call("with")];
  ok("FO-5b DW8 fail/pass: through PF-4's guard, a person without agent/retainer:list gets 403 on the checklist; with it, the route opens", without === 403 && withKey === 200, { without, withKey });
  // Review m5: a version made before FO-5b (no kept list) shows the list of the template version it was made from.
  const mvOf = svc as unknown as { mergeValues: (...a: unknown[]) => Promise<Record<string, unknown>> }, realMv = mvOf.mergeValues;
  mvOf.mergeValues = async function (this: unknown, ...a: unknown[]) { const v = await realMv.apply(this, a); delete v["code.marked"]; return v; };
  const old = await svc.draft(R, client(5, "Client E"), { templateId: noK.id, fees: FEE });
  mvOf.mergeValues = realMv;
  ok("FO-5b DW5 pass: a version with no kept list (made before FO-5b) shows its template version's items ((k) missing) and codeMarked null",
    old.codeChecklist?.marked === 25 && old.codeChecklist.items.filter((i) => !i.present).map((i) => i.letter).join("") === "k" && old.versions[0].codeMarked === null, old.codeChecklist);
  // Review m3: a consultation template's answer says s. 24(3) does not apply; the retainer's says it does.
  const consult = await svc.uploadTemplate(R, { name: "Consultation", kind: "CONSULTATION" }, docx(BASE));
  const cc = await svc.templateChecklist(R, consult.id);
  ok("FO-5b DW8 pass/fail: a retainer template's checklist applies (applies true), a consultation template's does not (applies false, appliesTo RETAINER)",
    cc.applies === false && cc.appliesTo === "RETAINER" && (await svc.templateChecklist(R, full.id)).applies === true, cc);
  await db.$disconnect();
} catch (e) {
  fail++;
  console.log(`FAIL  FO-5b: the check stopped — ${String((e as { stderr?: string }).stderr ?? "").trim().slice(0, 600)} ${String((e as Error).stack ?? e).slice(0, 600)}`);
} finally {
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* reported by the next run's createdb */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\nFO-5b retainer checklist: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
