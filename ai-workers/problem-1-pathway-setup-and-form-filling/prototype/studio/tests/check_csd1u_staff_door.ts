// CS-D1u (R1.64 part 4; the Lead's shape on #3277): the staff member's upload of a case document with no checklist line
// through the platform's upload rail, door STAFF (api/src/documents/staff-door.ts, registered by
// features/case-document-door.ts). Named tests, a pass and a fail each, on an isolated copy of the app (its own database
// and port, never :4400) with the local staff sign-in:
//   DW1 an authorised staff member (the case officer) stores one document version through the rail (plat_file SCANNING
//       under case-documents/<person>/<upload id>, one case_document with the stored bytes' sha256, one audit line
//       naming the staff member); with no sign-in the rail answers 401 and nothing is staged.
//   DW2 another firm's staff member (sample-solo's Owner) asking for this firm's case → 404 at creation, nothing staged;
//       this firm's Owner is let in.
//   DW3 a staff member without agent/document:create (labelled test data: the second representative's roles ended and
//       Read only given) → 404, nothing staged; a sign-in linked to no case user → 404 too.
//   DW4 a type with its own checklist line → refused in the multipart route's words, nothing staged or stored; the kind
//       with no line is let in (DW1).
//   DW5 bytes of no allowed kind behind a .pdf name → PF-F4's words at the finish, no plat_file row, no document; a PDF
//       that does not open → CS-D1t's words, nothing stored.
//   DW6 a repeated finish (an empty PATCH at the end, then HEAD) → the same file id, no second plat_file row, one version.
//   DW7 a second upload of the type keeps one current per person and type, the earlier kept as history.
//   DW8 the multipart route still stores (other suites use it); the checklist read lists the person's documents with no
//       line and the kinds staff may add.
// Sample people and synthetic files only; US$0, no model call. Run from prototype/:
//   zsh studio/tools/isolated.sh csd1u 4463 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh csd1u 4463 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_csd1u_staff_door.ts 4463 xr_studio_csd1u
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { textPdf } from "../acceptance/lib/fixtures.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4463), DBNAME = process.argv[3] ?? "xr_studio_csd1u", NAME = DBNAME.replace(/^xr_studio_/, "");
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://127.0.0.1:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const { ok, summary } = recorder();
const { call, sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0]?.trim() ?? "";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const OFFICER = "user-O", REP = "user-R", REP2 = "user-T", OTHER = "user-S", CLIENT = "user-P";
const UPLOADS = "/api/platform/files/uploads";

try {
  // -------------------------------------------------------------------------------------------- setup (Sample)
  await seedSampleFirms(db);
  const vv = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id and r.status = 'RELEASED')`);
  if (!vv()) await call("POST", "/demo/load", { sample: "configured" }, "user-A");
  const VV = vv();
  const opened = await call("POST", "/runtime/cases", { combinationId: VV, reference: `CSD1U-${run}`, clientActor: CLIENT, principal: { displayName: `Sample Client CSD1U ${run}` }, representative: REP, caseOfficers: [OFFICER] }, OFFICER);
  const caseId = opened.body?.id as string;
  const view = async () => (await call("GET", `/runtime/cases/${caseId}/checklist`, undefined, OFFICER)).body;
  const v0 = await view();
  const person = v0?.people?.[0]?.subject as string, lineType = v0?.people?.[0]?.lines?.[0]?.document?.key as string;
  ok("CS-D1u setup: the Visitor visa is released; a Sample case of sample-firm with a person and a checklist line", !!VV && !!caseId && !!person && !!lineType, { VV, caseId, status: opened.status });
  const signIn = async (actor: string, firmKey = "sample-firm", email = sql(`select email from platform_staff where actor_id = '${actor}'`)) => {
    const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
    return ((await r.json().catch(() => ({}))) as { token?: string }).token ?? "";
  };
  const tOfficer = await signIn(OFFICER), tOwner = await signIn(REP), tOther = await signIn(OTHER, "sample-solo");
  if (!tOfficer || !tOwner || !tOther) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }

  // ------------------------------------------------------------------------------------------- the tus calls
  type R = { status: number; headers: Headers; text: string };
  const tus = async (token: string | null, method: string, path: string, headers: Record<string, string> = {}, body?: Uint8Array): Promise<R> => {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "tus-resumable": "1.0.0", ...headers }, ...(body ? { body: Buffer.from(body) } : {}) });
    return { status: r.status, headers: r.headers, text: (await r.text()).trim() };
  };
  const b64 = (s: string) => Buffer.from(s).toString("base64");
  const meta = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k} ${b64(v)}`).join(",");
  const create = (token: string | null, size: number, m: Record<string, string> = {}) => tus(token, "POST", UPLOADS, { "upload-length": String(size),
    "upload-metadata": meta({ door: "STAFF", caseId, subjectId: person, documentType: "letter_of_invitation", filename: "invitation.pdf", filetype: "application/pdf", ...m }) });
  const idOf = (r: R) => (r.headers.get("location") ?? "").split("/").pop() ?? "";
  const patch = (token: string, id: string, offset: number, chunk: Uint8Array) => tus(token, "PATCH", `${UPLOADS}/${id}`, { "upload-offset": String(offset), "content-type": "application/offset+octet-stream" }, chunk);
  const head = (token: string, id: string) => tus(token, "HEAD", `${UPLOADS}/${id}`);
  const send = async (token: string, bytes: Uint8Array, m: Record<string, string> = {}) => { const c = await create(token, bytes.length, m); const id = idOf(c); return { c, id, p: c.status === 201 ? await patch(token, id, 0, bytes) : null }; };
  const staged = (id: string) => !!id && existsSync(join(STUDIO, "var", `isolated-${NAME}`, "upload-staging", `${id}.json`));
  const fileRows = () => Number(sql(`select count(*) from plat_file`));
  const docRows = (type = "letter_of_invitation") => Number(sql(`select count(*) from case_document where subject_id = '${person}' and document_type = '${type}'`));
  const pdf = (tag: string) => new Uint8Array(textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", "Letter of invitation (Sample)", `CS-D1u ${tag} ${run}`]));

  // ---------------------------------------------------------------- DW1: an authorised staff member stores one version
  const before = { files: fileRows(), docs: docRows() };
  const anon = await create(null, 1000);
  ok("CS-D1u DW1 fail: with no staff sign-in the rail answers 401 and nothing is staged", anon.status === 401 && !idOf(anon) && fileRows() === before.files, anon.status);
  const bytes1 = pdf("dw1");
  const u1 = await send(tOfficer, bytes1);
  const f1 = u1.p?.headers.get("upload-file-id") ?? "";
  const row1 = sql(`select key || '|' || door || '|' || scan_state || '|' || sha256 || '|' || size_bytes from plat_file where id = '${f1}'`);
  ok("CS-D1u DW1 pass: the case officer's upload opens (201) and finishes (204) with the stored file's id; plat_file is SCANNING under case-documents/<person>/<upload id>, door STAFF, the original's sha256",
    u1.c.status === 201 && u1.p?.status === 204 && row1 === `case-documents/${person}/${u1.id}|STAFF|SCANNING|${sha(bytes1)}|${bytes1.length}`, { create: u1.c.status, patch: u1.p?.status, text: u1.p?.text, row1 });
  const d1 = sql(`select id || '|' || current || '|' || sha256 || '|' || uploaded_by || '|' || coalesce(checklist_line_id::text, 'none') || '|' || path || '|' || media_type || '|' || file_name from case_document where subject_id = '${person}' and document_type = 'letter_of_invitation' order by uploaded_at desc limit 1`).split("|");
  const onDisk = d1[5] ? join(STUDIO, "var", `isolated-${NAME}`, "workspaces", process.env.STUDIO_WORKSPACE_KEY?.trim() || "demo", d1[5]) : "";
  ok("CS-D1u DW1 pass: one case_document version, current, with no checklist line, the stored bytes' sha256, uploaded by the case user the sign-in is linked to; the file on disk is the original",
    docRows() === before.docs + 1 && d1[1] === "true" && d1[2] === sha(bytes1) && d1[3] === OFFICER && d1[4] === "none" && d1[6] === "application/pdf" && d1[7] === "invitation.pdf" && !!onDisk && existsSync(onDisk) && sha(readFileSync(onDisk)) === sha(bytes1), d1);
  const staffId = sql(`select id from platform_staff where actor_id = '${OFFICER}'`);
  ok("CS-D1u DW1 pass: one audit line \"uploaded\" for the document, naming the signed-in staff member (staff:<id>) and no checklist line",
    sql(`select count(*) || '|' || max(actor) || '|' || max(summary) from audit_event where action = 'uploaded' and entity = 'case document' and entity_key = '${d1[0]}'`).startsWith(`1|staff:${staffId}|Case officer uploaded Letter of invitation (Sample)`), sql(`select actor || ' ' || summary from audit_event where entity_key = '${d1[0]}'`));

  // --------------------------------------------------------------------------- DW2: another firm's staff → 404
  const files2 = fileRows(), docs2 = docRows();
  const other = await create(tOther, bytes1.length);
  ok("CS-D1u DW2 fail: sample-solo's Owner asking to upload to sample-firm's case → 404 at creation, nothing staged or stored",
    other.status === 404 && !idOf(other) && fileRows() === files2 && docRows() === docs2, { status: other.status, text: other.text });
  const owner = await create(tOwner, bytes1.length);
  ok("CS-D1u DW2 pass: sample-firm's Owner (Representative) is let in for the same case (201)", owner.status === 201 && staged(idOf(owner)), owner.status);
  const ownerHead = await head(tOther, idOf(owner));
  ok("CS-D1u DW2 fail: sample-solo's Owner gets 404 on the HEAD of sample-firm's upload id", ownerHead.status === 404, ownerHead.status);

  // ------------------------------------------------------------------- DW3: no agent/document:create → 404
  const rep2 = sql(`select id from platform_staff where actor_id = '${REP2}'`), firmA = sql(`select id from platform_firm where key = 'sample-firm'`);
  rawSql(`update platform_role_grant set ended_at = now(), ended_by = 'CS-D1u test (Sample)', end_reason = 'Sample: no upload right' where staff_id = '${rep2}' and ended_at is null;
    insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${firmA}', '${rep2}', 'READ_ONLY', 'CS-D1u test (Sample)')`);
  const tReadOnly = await signIn(REP2);
  const ro = await create(tReadOnly, bytes1.length);
  ok("CS-D1u DW3 fail: a staff member of the firm whose only role is Read only (no agent/document:create) → 404 at creation, nothing staged",
    !!tReadOnly && ro.status === 404 && !idOf(ro), { signedIn: !!tReadOnly, status: ro.status });
  rawSql(`update platform_staff set actor_id = null where id = '${rep2}'; update platform_role_grant set ended_at = null, ended_by = null, end_reason = null where staff_id = '${rep2}' and role <> 'READ_ONLY'; update platform_role_grant set ended_at = now(), ended_by = 'CS-D1u test (Sample)', end_reason = 'Sample: roles back' where staff_id = '${rep2}' and role = 'READ_ONLY'`);
  const tUnlinked = await signIn(REP2, "sample-firm", sql(`select email from platform_staff where id = '${rep2}'`));
  const unlinked = tUnlinked ? await create(tUnlinked, bytes1.length) : null;
  ok("CS-D1u DW3 fail: a sign-in with the upload right but linked to no case user → 404 at creation", unlinked?.status === 404, unlinked?.status);
  rawSql(`update platform_staff set actor_id = '${REP2}' where id = '${rep2}'`);
  const tRep2 = await signIn(REP2), rep2Ok = await create(tRep2, bytes1.length);
  ok("CS-D1u DW3 pass: the same person with their Case manager role back and their case user linked is let in (201)", rep2Ok.status === 201, rep2Ok.status);

  // ---------------------------------------------------------------- DW4: a type with its own checklist line
  const files4 = fileRows(), lineDocs = docRows(lineType);
  const own = await create(tOfficer, bytes1.length, { documentType: lineType });
  ok("CS-D1u DW4 fail: a type with its own checklist line is refused at creation in words (\"…has its own line on the person's checklist: upload it there. Nothing was stored.\"), nothing staged or stored",
    own.status === 422 && /has its own line on the person's checklist: upload it there\. Nothing was stored\./.test(own.text) && !idOf(own) && fileRows() === files4 && docRows(lineType) === lineDocs, { status: own.status, text: own.text });
  const stranger = await create(tOfficer, bytes1.length, { subjectId: "00000000-0000-4000-8000-000000000000" });
  ok("CS-D1u DW4 fail: a person not on the case → 404 in words", stranger.status === 404 && /not on this case/.test(stranger.text), { status: stranger.status, text: stranger.text });

  // ------------------------------------------------------------------------- DW5: a refused kind, a damaged PDF
  const files5 = fileRows(), docs5 = docRows();
  const notPdf = new TextEncoder().encode(`MZ this is not a PDF (Sample, CS-D1u ${run}) ${"x".repeat(2000)}`);
  const bad = await send(tOfficer, notPdf);
  ok("CS-D1u DW5 fail: bytes of no allowed kind behind a .pdf name pass the declared check (201) and are refused at the finish in PF-F4's words; no plat_file row, no document",
    bad.c.status === 201 && bad.p?.status === 415 && /Allowed here: PDF, JPEG and PNG\./.test(bad.p.text) && /Nothing was stored\./.test(bad.p.text) && fileRows() === files5 && docRows() === docs5, { create: bad.c.status, patch: bad.p?.status, text: bad.p?.text });
  const broken = new TextEncoder().encode(`%PDF-1.4\n% Sample, CS-D1u ${run}: no objects, it does not open\n${"A".repeat(3000)}\n%%EOF\n`);
  const dmg = await send(tOfficer, broken);
  ok("CS-D1u DW5 fail: a PDF that does not open is refused at the finish in CS-D1t's words; no plat_file row, no document",
    dmg.c.status === 201 && dmg.p?.status === 400 && /could not be read: it may be damaged/.test(dmg.p.text) && fileRows() === files5 && docRows() === docs5, { create: dmg.c.status, patch: dmg.p?.status, text: dmg.p?.text });
  ok("CS-D1u DW5 pass: a whole PDF is stored (DW1's)", !!f1 && row1.includes("|SCANNING|"));

  // ----------------------------------------------------------------------------------- DW6: a repeated finish
  const files6 = fileRows(), docs6 = docRows();
  const again = await patch(tOfficer, u1.id, bytes1.length, new Uint8Array(0)), againHead = await head(tOfficer, u1.id);
  ok("CS-D1u DW6 pass: a repeated finish (the empty PATCH at the end, then HEAD) answers the same file id",
    again.status === 204 && again.headers.get("upload-file-id") === f1 && againHead.status === 200 && againHead.headers.get("upload-file-id") === f1, { patch: again.status, id: again.headers.get("upload-file-id"), head: againHead.status });
  ok("CS-D1u DW6 fail: no second plat_file row and no second document version", fileRows() === files6 && docRows() === docs6, { files: [files6, fileRows()], docs: [docs6, docRows()] });

  // --------------------------------------------------------------- DW7: one current per person and type
  const bytes2 = pdf("dw7"), u2 = await send(tOfficer, bytes2, { filename: "invitation-2.pdf" });
  const versions = rawSql(`select current || '|' || (superseded_at is not null) || '|' || sha256 from case_document where subject_id = '${person}' and document_type = 'letter_of_invitation' order by uploaded_at`).split("\n");
  ok("CS-D1u DW7 pass: a second upload of the type is the one current version; the earlier is kept as history (not current, superseded)",
    u2.p?.status === 204 && versions.length === 2 && versions[0] === `false|true|${sha(bytes1)}` && versions[1] === `true|false|${sha(bytes2)}`, versions);
  ok("CS-D1u DW7 fail: never two current versions of one type for one person", Number(sql(`select count(*) from case_document where subject_id = '${person}' and document_type = 'letter_of_invitation' and current`)) === 1);

  // ------------------------------------------------------- DW8: the multipart route stays; the checklist read lists them
  const fd = new FormData(); fd.append("subjectId", person); fd.append("documentType", "letter_of_invitation");
  const bytes3 = pdf("dw8"); fd.append("file", new Blob([bytes3 as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), "invitation-3.pdf");
  const mp = await fetch(`${BASE}/api/runtime/cases/${caseId}/documents`, { method: "POST", headers: { "x-actor": OFFICER }, body: fd });
  const mpb = (await mp.json().catch(() => null)) as { document?: { sha256: string; current: boolean } } | null;
  ok("CS-D1u DW8 pass: the multipart route still stores a version (201), with its audit line naming the simulated person",
    mp.status === 201 && mpb?.document?.sha256 === sha(bytes3) && docRows() === 3 && sql(`select count(*) from audit_event where action = 'uploaded' and entity = 'case document' and actor = '${OFFICER}' and summary like '%no checklist line%'`) === "1", { status: mp.status });
  const fd2 = new FormData(); fd2.append("subjectId", person); fd2.append("documentType", lineType); fd2.append("file", new Blob([bytes3 as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), "x.pdf");
  const mp2 = await fetch(`${BASE}/api/runtime/cases/${caseId}/documents`, { method: "POST", headers: { "x-actor": OFFICER }, body: fd2 });
  ok("CS-D1u DW8 fail: the multipart route still refuses a type with its own line (422, its words)", mp2.status === 422 && /has its own line/.test(await mp2.text()), mp2.status);
  const v1 = await view();
  const others = (v1?.people?.[0]?.other_documents ?? []) as { sha256: string; current: boolean; document_type: string }[];
  ok("CS-D1u DW8 pass: the checklist read lists the person's documents with no line (newest first, three versions, one current) and the kinds staff may add",
    others.length === 3 && others[0].sha256 === sha(bytes3) && others.filter((x) => x.current).length === 1 && (v1?.case_kinds ?? []).some((k: { key: string }) => k.key === "letter_of_invitation"), { n: others.length, kinds: v1?.case_kinds });
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
