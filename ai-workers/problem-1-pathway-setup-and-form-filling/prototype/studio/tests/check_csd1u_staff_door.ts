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
//       Read only given), a sign-in linked to no case user, or to a client login (B6) → 403 in words, nothing staged;
//       a sample-solo session bridged to a sample-firm case user → 404 (the door's own firm check); with roles back → 201.
//   DW4 a type with its own checklist line → refused in the multipart route's words, nothing staged or stored; the kind
//       with no line is let in (DW1).
//   DW5 bytes of no allowed kind behind a .pdf name → PF-F4's words at the finish, no plat_file row, no document; a PDF
//       that does not open → CS-D1t's words, nothing stored.
//   DW6 a repeated finish (an empty PATCH at the end, then HEAD) → the same file id, no second plat_file row, one version.
//   DW7 a second upload of the type keeps one current per person and type, the earlier kept as history.
//   DW8 the multipart route still stores (other suites use it); the checklist read lists the person's documents with no
//       line and the kinds staff may add.
//   DW9 a role ended between creation and finish → 403 in words at the finish; no row, no stored bytes, no staging copy.
//   DW10 the case documents' 20 MB limit: 20 MB + 1 declared → 413 in words, nothing staged; exactly 20 MB opens.
//   DW11 a sound PDF whose check takes longer than 5 s (90,000 pages) is stored: the check runs outside the transaction.
//   DW12 names come through the rail as sent (no latin1 "repair").
// Sample people and synthetic files only; US$0, no model call. Run from prototype/:
//   zsh studio/tools/isolated.sh csd1u 4433 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh csd1u 4433 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_csd1u_staff_door.ts 4433 xr_studio_csd1u
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { textPdf } from "../acceptance/lib/fixtures.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4433), DBNAME = process.argv[3] ?? "xr_studio_csd1u", NAME = DBNAME.replace(/^xr_studio_/, "");
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
  const firmAId = sql(`select id from platform_firm where key = 'sample-firm'`).toLowerCase();
  /** The FilesPort copy of an upload's bytes (the local adapter's folder), whether or not a row names it. */
  const storedBytes = (id: string) => !!id && existsSync(join(STUDIO, "var", `isolated-${NAME}`, "front-office-files", firmAId, "case-documents", person, id));
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
  ok("CS-D1u DW3 fail: a staff member of the firm whose only role is Read only (no agent/document:create) → 403 in words (\"Your role cannot add documents to cases. Nothing was stored.\"), nothing staged",
    !!tReadOnly && ro.status === 403 && ro.text === "Your role cannot add documents to cases. Nothing was stored." && !idOf(ro), { signedIn: !!tReadOnly, status: ro.status, text: ro.text });
  rawSql(`update platform_staff set actor_id = null where id = '${rep2}'; update platform_role_grant set ended_at = null, ended_by = null, end_reason = null where staff_id = '${rep2}' and role <> 'READ_ONLY'; update platform_role_grant set ended_at = now(), ended_by = 'CS-D1u test (Sample)', end_reason = 'Sample: roles back' where staff_id = '${rep2}' and role = 'READ_ONLY'`);
  const tUnlinked = await signIn(REP2, "sample-firm", sql(`select email from platform_staff where id = '${rep2}'`));
  const unlinked = tUnlinked ? await create(tUnlinked, bytes1.length) : null;
  ok("CS-D1u DW3 fail: a sign-in with the upload right but linked to no case user → 403 in words at creation", unlinked?.status === 403 && /not linked to a case user/.test(unlinked.text), { status: unlinked?.status, text: unlinked?.text });
  // B6 (labelled test data): the sign-in linked to a client login is no staff case user → 403 in the same words.
  rawSql(`update platform_staff set actor_id = '${CLIENT}' where id = '${rep2}'`);
  const tAsClient = await signIn(REP2, "sample-firm", sql(`select email from platform_staff where id = '${rep2}'`)), asClient = await create(tAsClient, bytes1.length);
  ok("CS-D1u DW3 fail (B6): a sign-in linked to a client login (not a firm staff case user) → 403 in words, nothing staged", asClient.status === 403 && /not linked to a case user/.test(asClient.text) && !idOf(asClient), { status: asClient.status, text: asClient.text });
  // Review 6 (labelled test data): the door's own firm check. sample-solo's Owner's sign-in linked to a sample-firm case
  // user: Runtime.reach lets that user in, so only the door's check (the case's platform firm is the session's) refuses.
  const soloStaff = sql(`select id from platform_staff where actor_id = '${OTHER}'`);
  rawSql(`update platform_staff set actor_id = null where id = '${rep2}'; update platform_staff set actor_id = '${REP2}' where id = '${soloStaff}'`);
  const tCross = await signIn(OTHER, "sample-solo", sql(`select email from platform_staff where id = '${soloStaff}'`)), cross = await create(tCross, bytes1.length);
  ok("CS-D1u DW3 fail (the door's firm check): a sample-solo session bridged to a sample-firm case user → 404, nothing staged", !!tCross && cross.status === 404 && !idOf(cross), { status: cross.status, text: cross.text });
  rawSql(`update platform_staff set actor_id = '${OTHER}' where id = '${soloStaff}'; update platform_staff set actor_id = '${REP2}' where id = '${rep2}'`);
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
  ok("CS-D1u DW5 fail: a PDF that does not open is refused at the finish in CS-D1t's words; no plat_file row, no document, no stored bytes, no staging copy",
    dmg.c.status === 201 && dmg.p?.status === 400 && /could not be read: it may be damaged/.test(dmg.p.text) && fileRows() === files5 && docRows() === docs5 && !storedBytes(dmg.id) && !staged(dmg.id), { create: dmg.c.status, patch: dmg.p?.status, text: dmg.p?.text, bytes: storedBytes(dmg.id), staged: staged(dmg.id) });
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

  // ------------------------------------------- DW9 (review 1, 6): access lost between creation and finish
  const bytes9 = pdf("dw9"), files9 = fileRows(), docs9 = docRows();
  const tRep2b = await signIn(REP2), c9 = await create(tRep2b, bytes9.length), id9 = idOf(c9);
  rawSql(`update platform_role_grant set ended_at = now(), ended_by = 'CS-D1u test (Sample)', end_reason = 'Sample: role ended mid-upload' where staff_id = '${rep2}' and ended_at is null`);
  const p9 = c9.status === 201 ? await patch(tRep2b, id9, 0, bytes9) : null;
  ok("CS-D1u DW9 fail: a role ended between creation and finish → refused at the finish in words (403); no row, no document, no stored bytes, no staging copy",
    p9?.status === 403 && /Your role cannot add documents/.test(p9.text) && fileRows() === files9 && docRows() === docs9 && !storedBytes(id9) && !staged(id9), { create: c9.status, patch: p9?.status, text: p9?.text, bytes: storedBytes(id9), staged: staged(id9) });
  rawSql(`update platform_role_grant set ended_at = null, ended_by = null, end_reason = null where staff_id = '${rep2}' and role <> 'READ_ONLY'`);

  // ------------------------------------------- DW10 (B2): the case documents' 20 MB limit
  const MAX = 20 * 1024 * 1024, files10 = fileRows();
  const over = await create(tOfficer, MAX + 1), at = await create(tOfficer, MAX);
  ok("CS-D1u DW10 fail: a declared 20 MB + 1 byte is refused at creation (413, in words), nothing staged", over.status === 413 && /at most 20 MB here\. Nothing was stored\./.test(over.text) && !idOf(over) && fileRows() === files10, { status: over.status, text: over.text });
  ok("CS-D1u DW10 pass: exactly 20 MB opens (201)", at.status === 201, at.status);

  // ------------------------------------------- DW11 (B1): a sound PDF slower than 5 s to check is stored
  // The breaker's recipe: ~90,000 pages sharing one content stream (pypdf takes about 7 s; the transaction's limit is 5 s).
  const manyPages = (n: number) => {
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${i + 4} 0 R`).join(" ")}] /Count ${n} >>`, "<< /Length 0 >>\nstream\n\nendstream",
      ...Array.from({ length: n }, () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 3 0 R >>")];
    const parts: string[] = ["%PDF-1.4\n"]; let at = parts[0].length; const offs: number[] = [];
    objs.forEach((o, i) => { offs.push(at); const t = `${i + 1} 0 obj\n${o}\nendobj\n`; parts.push(t); at += t.length; });
    parts.push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`);
    return new Uint8Array(Buffer.from(parts.join(""), "latin1"));
  };
  const slow = manyPages(90_000), docs11 = docRows(), t11 = Date.now();
  const u11 = await send(tOfficer, slow, { filename: "many-pages.pdf" });
  ok(`CS-D1u DW11 pass: a sound ${(slow.length / 1048576).toFixed(1)} MB PDF of 90,000 pages, whose check takes longer than the transaction's 5 s, is stored (204, one version) in ${((Date.now() - t11) / 1000).toFixed(1)} s`,
    u11.p?.status === 204 && docRows() === docs11 + 1 && sql(`select sha256 from case_document where subject_id = '${person}' and document_type = 'letter_of_invitation' and current`) === sha(slow), { create: u11.c.status, patch: u11.p?.status, text: u11.p?.text });

  // ------------------------------------------- DW12 (B5): a name already right is kept as sent
  const u12 = await send(tOfficer, pdf("dw12"), { filename: "Ã©tude.pdf" }), u12b = await send(tOfficer, pdf("dw12b"), { filename: "étude café.pdf" });
  const names = rawSql(`select file_name from case_document where subject_id = '${person}' and document_type = 'letter_of_invitation' order by uploaded_at desc limit 2`).split("\n");
  ok("CS-D1u DW12 pass: names come through the rail as sent (\"étude café.pdf\"; \"Ã©tude.pdf\" is not \"repaired\" to \"étude.pdf\")", u12.p?.status === 204 && u12b.p?.status === 204 && names[0] === "étude café.pdf" && names[1] === "Ã©tude.pdf", names);
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
