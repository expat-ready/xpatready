// CS-D1t (R1.67, file-type check): the two case upload doors, a checklist line's (POST /runtime/checklist-lines/:id/documents)
// and the person's document with no line (POST /runtime/cases/:id/documents), judge a file by PF-F4's one check
// (api/src/platform/files/file-type.ts `checkFile`, through `checkedCaseFile` in api/src/case-checklist.ts). Each
// refusal reason goes through each door: the status its reason calls for, PF-F4's words ending "Nothing was stored.",
// and nothing written (no row, no file, no audit line). Each has a passing case beside it. On the Visitor visa of
// acceptance pack 4, as check_c64_storage_api.ts. Synthetic files only (Sample); no model call (US$0).
//   zsh studio/tools/isolated.sh runtime_csd1t 4447 start && tsx studio/tests/check_csd1t_file_type.ts 4447 xr_studio_runtime_csd1t
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FAMILY, OFFICER, CLIENT, PORT, DB, answer, call, main, ok, openCase, sql } from "../acceptance/lib/m3.ts";
import { CASE_FILE_KINDS } from "../api/src/case-checklist.ts";
import { MAX_BYTES, NOTHING_STORED, SCRIPTS_FLAG } from "../api/src/platform/files/file-type.ts";

type Bytes = Uint8Array<ArrayBuffer>;
type Ans = { status: number; body: { detail?: string; document?: { id: string; file_name: string; media_type: string; size_bytes: number } | null } | null };
const studio = join(import.meta.dirname, "..");
const fixture = (n: string): Bytes => new Uint8Array(readFileSync(join(studio, "tests", "fixtures", "file-types", n)));
const text = (s: string): Bytes => new TextEncoder().encode(s);
const padded = (head: Bytes, size: number): Bytes => { const b = new Uint8Array(size); b.set(head); return b; };

const hasLetter = () => sql("select count(*) from canonical_field where canonical_field_key='person.travels_with'") !== "0" && sql("select count(*) from document_type where document_type_key='letter_of_authorization_for_a_minor'") === "1";
if (!hasLetter()) for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"])
  try { execFileSync(join(studio, "node_modules", ".bin", "tsx"), ["--tsconfig", join(studio, "api", "tsconfig.json"), join(studio, f), String(PORT), DB], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 }); }
  catch { /* the setups exit 1 on their own known gaps (pack 4 S2w, S7, S7a); what this check needs is asked below */ }

// The files (Sample, synthetic). PDF, JPEG and PNG that pass; then one file per refusal reason.
const PDF = text("%PDF-1.4\n% Sample synthetic document (CS-D1t)\n%%EOF\n"), JPG = fixture("sample.jpg"), PNG = fixture("sample.png");
const SCRIPTED = text("%PDF-1.4\n1 0 obj << /S /JavaScript /JS (app.alert\\(1\\)) >> endobj\n% Sample synthetic document (CS-D1t)\n%%EOF\n");
const MB = 1024 * 1024;
const REFUSED: { reason: string; name: string; bytes: Bytes; status: number; words: RegExp }[] = [
  { reason: "NOT_ALLOWED_TYPE", name: "passport.png", bytes: text("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;"), status: 415, words: /^This type of file is not accepted\./ },
  { reason: "NOT_ALLOWED_TYPE (a real Word file)", name: "letter.pdf", bytes: fixture("sample.docx"), status: 415, words: /^This file is a Word file, which this upload does not accept\./ },
  { reason: "ZIP", name: "documents.pdf", bytes: padded(new Uint8Array([0x50, 0x4b, 5, 6]), 22), status: 415, words: /^Upload the files inside one by one\./ },
  { reason: "MACROS", name: "letter.pdf", bytes: fixture("macro.docm"), status: 415, words: /^Files with macros/ },
  { reason: "EMPTY", name: "passport.pdf", bytes: new Uint8Array(), status: 400, words: /^This file is empty\./ },
  { reason: "DAMAGED", name: "passport.png", bytes: PNG.slice(0, 12), status: 400, words: /^This image could not be read: it may be damaged\./ },
  { reason: "TOO_LARGE", name: "scan.jpg", bytes: padded(JPG, MAX_BYTES.image + 1), status: 413, words: /^This file is 10 MB; the limit for images is 10 MB\./ },
  { reason: "TOO_MANY_PIXELS", name: "photo.png", bytes: fixture("bomb.png"), status: 413, words: /^This image is too large to open safely/ },
];

await main("CS-D1t", "the case upload doors use the one file-type check (R1.67)", async () => {
  ok("setup: the Visitor visa with pack 4's document lines is released on this copy", hasLetter());
  ok("CS-D1t: the case side's kinds are PDF, JPEG and PNG, in one list", CASE_FILE_KINDS.join() === "pdf,jpeg,png", CASE_FILE_KINDS);
  const c = await openCase(sql("select id from combination where combination_key='vv.single'")!, FAMILY);
  const A = c.subjects["Sample Client A"];
  await answer(c.id, c.caseSubject, "case.application_date", new Date().toISOString().slice(0, 10), OFFICER);
  type P = { subject: string; lines: { id: string; label: string; state: string; documents: { id: string; file_name: string }[] }[] };
  const lineOf = async () => ((await call("GET", `/runtime/cases/${c.id}/checklist`, undefined, OFFICER)).body?.people as P[]).find((p) => p.subject === A)!.lines.find((l) => /passport/i.test(l.label))!;
  const line = await lineOf();
  await call("POST", `/runtime/checklist-lines/${line.id}/request`, {}, OFFICER);

  const send = async (path: string, f: { name: string; bytes: Bytes; type?: string }, actor: string, extra: Record<string, string>): Promise<Ans> => {
    const fd = new FormData(); for (const [k, v] of Object.entries(extra)) fd.append(k, v); fd.append("file", new Blob([f.bytes], f.type ? { type: f.type } : {}), f.name);
    const res = await fetch(`http://127.0.0.1:${PORT}/api/runtime/${path}`, { method: "POST", headers: { "x-actor": actor }, body: fd });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const DOORS = [
    { name: "checklist line", send: (f: { name: string; bytes: Bytes; type?: string }, actor = OFFICER) => send(`checklist-lines/${line.id}/documents`, f, actor, {}) },
    { name: "document with no line", send: (f: { name: string; bytes: Bytes; type?: string }, actor = OFFICER) => send(`cases/${c.id}/documents`, f, actor, { subjectId: A, documentType: "letter_of_invitation" }) },
  ];
  // What a refusal must leave as it was: the person's rows, their files on disk, the case's "uploaded" audit lines and the line.
  const stored = async () => ({
    rows: sql(`select count(*) from case_document where subject_id='${A}'`),
    files: execFileSync("find", [join(studio, "var"), "-path", `*/workspaces/demo/people/${A}/documents/*`, "-type", "f"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).length,
    audit: sql(`select count(*) from audit_event where action='uploaded' and entity='case document' and summary like '%case ${c.id.slice(0, 8)}%'`),
    line: (await lineOf()).state,
  });
  const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
  const auditOf = (id: string | undefined) => sql(`select summary from audit_event where action='uploaded' and entity_key='${id}'`) ?? "";

  for (const door of DOORS) {
    const D = `CS-D1t (${door.name})`;
    for (const r of REFUSED) {
      const before = await stored(), u = await door.send({ name: r.name, bytes: r.bytes }), d = String(u.body?.detail ?? "");
      ok(`${D} fail: ${r.reason} is refused (${r.status}) in PF-F4's words, which name the allowed types and end "Nothing was stored."; no row, no file, no audit line, the line as it was`,
        u.status === r.status && r.words.test(d) && d.endsWith(`Allowed here: PDF, JPEG and PNG. ${NOTHING_STORED}`) && same(before, await stored()), { status: u.status, detail: d, before, after: await stored() });
    }
    // The door's own 20 MB limit stays (C6.4 break m5): a PDF over it is refused before PF-F4's 25 MB is reached.
    let before = await stored(), u = await door.send({ name: "big.pdf", bytes: padded(PDF, 20 * MB + 1) });
    ok(`${D} fail: a PDF over the door's 20 MB is refused as too large (413), nothing stored`, u.status === 413 && same(before, await stored()), { status: u.status, detail: u.body?.detail });

    // Passing cases: each allowed kind is stored with the type and the extension of its own bytes.
    for (const p of [{ name: "passport.pdf", bytes: PDF, media: "application/pdf", ext: "pdf" }, { name: "IMG_0001.JPG", bytes: JPG, media: "image/jpeg", ext: "jpg" }, { name: "photo.png", bytes: PNG, media: "image/png", ext: "png" }]) {
      before = await stored(); u = await door.send(p);
      const after = await stored(), id = u.body?.document?.id;
      ok(`${D} pass: a real ${p.ext.toUpperCase()} is stored (201): one more row, file and audit line, the type from its bytes, its name kept`,
        u.status === 201 && Number(after.rows) === Number(before.rows) + 1 && after.files === before.files + 1 && Number(after.audit) === Number(before.audit) + 1
        && sql(`select media_type || '|' || file_name || '|' || (path like '%.${p.ext}') from case_document where id='${id}'`) === `${p.media}|${p.name}|true`, { status: u.status, detail: u.body?.detail, before, after });
    }
    // The bytes decide: a JPEG called .png, sent as image/png, is stored as a JPEG under a corrected name.
    u = await door.send({ name: "../scans/passport<1>.pdf.png", bytes: JPG, type: "image/png" });
    ok(`${D} pass: a JPEG named .png (and declared image/png) is stored as image/jpeg, its name corrected to .jpg and cleaned`,
      u.status === 201 && sql(`select media_type || '|' || file_name || '|' || (path like '%.jpg') from case_document where id='${u.body?.document?.id}'`) === "image/jpeg|passport1.jpg|true", { status: u.status, row: sql(`select media_type || '|' || file_name || '|' || path from case_document where id='${u.body?.document?.id}'`) });
    // A PDF with active content is stored, and its audit line carries PF-F4's flag; an ordinary PDF's does not.
    u = await door.send({ name: "form.pdf", bytes: SCRIPTED });
    const flagged = auditOf(u.body?.document?.id);
    ok(`${D} pass: a PDF with scripts is stored (201) and its audit line says "${SCRIPTS_FLAG}"`, u.status === 201 && flagged.includes(SCRIPTS_FLAG), { status: u.status, flagged });
    u = await door.send({ name: "plain.pdf", bytes: PDF });
    ok(`${D} fail: an ordinary PDF's audit line carries no scripts flag`, u.status === 201 && !!auditOf(u.body?.document?.id) && !auditOf(u.body?.document?.id).includes("scripts"), auditOf(u.body?.document?.id));
    // The case's client goes through the same check.
    before = await stored(); u = await door.send({ name: "passport.png", bytes: REFUSED[0].bytes }, CLIENT);
    ok(`${D} fail: the case's client is refused the same way (415), nothing stored`, u.status === 415 && same(before, await stored()), { status: u.status, detail: u.body?.detail });
  }
});
