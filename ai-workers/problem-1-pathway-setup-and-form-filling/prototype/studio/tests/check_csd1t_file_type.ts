// CS-D1t (R1.67, file-type check): the two case upload doors, a checklist line's (POST /runtime/checklist-lines/:id/documents)
// and the person's document with no line (POST /runtime/cases/:id/documents), judge a file by PF-F4's one check
// (api/src/platform/files/file-type.ts `checkFile`, through `checkedCaseFile` in api/src/case-checklist.ts). Each
// refusal reason goes through each door: the status its reason calls for, PF-F4's words ending "Nothing was stored.",
// and nothing written (no row, no file, no audit line). Each has a passing case beside it. A PDF must also open (the
// reader tools/check_pdf_opens.py, through `pdfOpens`): one cut short is refused as damaged, and when the reader cannot
// be run the file is not stored unchecked (503). On the Visitor visa of acceptance pack 4, as check_c64_storage_api.ts.
// Synthetic files only (Sample); no model call (US$0).
//   zsh studio/tools/isolated.sh runtime_csd1t 4447 start && tsx studio/tests/check_csd1t_file_type.ts 4447 xr_studio_runtime_csd1t
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAMILY, OFFICER, CLIENT, PORT, DB, answer, call, main, ok, openCase, sql } from "../acceptance/lib/m3.ts";
import { textPdf } from "../acceptance/lib/fixtures.ts";
import { CASE_FILE_KINDS, checkedCaseFile, pdfOpens, PDF_READERS, PDF_READERS_WAITING } from "../api/src/case-checklist.ts";
import { PY } from "../api/src/core.ts";
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
const PDF: Bytes = new Uint8Array(textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", "Sample synthetic document (CS-D1t)"])), JPG = fixture("sample.jpg"), PNG = fixture("sample.png");
// A PDF that opens, with the names PF-F4 flags after its end marker (a byte scan finds them; a reader ignores them).
const SCRIPTED: Bytes = new Uint8Array(Buffer.concat([PDF, Buffer.from("\n% /OpenAction << /S /JavaScript /JS (Sample) >>\n", "latin1")]));
const MB = 1024 * 1024;
// Break M1: files with an encryption entry. Made by the app's own reader library (pypdf), from the PDF above.
const locked = (how: string): Bytes => new Uint8Array(Buffer.from(execFileSync(PY, ["-I", "-c", `
import base64, io, sys
from pypdf import PdfReader, PdfWriter
w = PdfWriter(); w.append(PdfReader(io.BytesIO(base64.b64decode(sys.argv[1])))); ${how}
out = io.BytesIO(); w.write(out); print(base64.b64encode(out.getvalue()).decode())`, Buffer.from(PDF).toString("base64")], { encoding: "utf8" }).trim(), "base64"));
const NEEDS_PASSWORD = locked('w.encrypt(user_password="Sample-open", owner_password="Sample-owner")'), EDIT_PROTECTED = locked('w.encrypt(user_password="", owner_password="Sample-owner")');
// A forged one: a PDF header, a trailer that only claims encryption, no pages (the break's file).
const FORGED = text("%PDF-1.4\n<html><script>Sample</script></html>\ntrailer\n<< /Size 1 /Encrypt << /Filter /Standard /V 1 /R 2 /O (Sample) /U (Sample) /P -1 >> /ID [(Sample) (Sample)] >>\nstartxref\n0\n%%EOF\n");
const REFUSED: { reason: string; name: string; bytes: Bytes; status: number; words: RegExp }[] = [
  { reason: "NOT_ALLOWED_TYPE", name: "passport.png", bytes: text("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;"), status: 415, words: /^This type of file is not accepted\./ },
  { reason: "NOT_ALLOWED_TYPE (a real Word file)", name: "letter.pdf", bytes: fixture("sample.docx"), status: 415, words: /^This file is a Word file, which this upload does not accept\./ },
  { reason: "ZIP", name: "documents.pdf", bytes: padded(new Uint8Array([0x50, 0x4b, 5, 6]), 22), status: 415, words: /^Upload the files inside one by one\./ },
  { reason: "MACROS", name: "letter.pdf", bytes: fixture("macro.docm"), status: 415, words: /^Files with macros/ },
  { reason: "EMPTY", name: "passport.pdf", bytes: new Uint8Array(), status: 400, words: /^This file is empty\./ },
  { reason: "DAMAGED", name: "passport.png", bytes: PNG.slice(0, 12), status: 400, words: /^This image could not be read: it may be damaged\./ },
  { reason: "DAMAGED (a PDF cut short: it does not open)", name: "passport.pdf", bytes: PDF.slice(0, Math.floor(PDF.length * 0.6)), status: 400, words: /^This file could not be read: it may be damaged\./ },
  { reason: "DAMAGED (a PDF 10 bytes short of its end: the reader alone would rebuild it)", name: "passport.pdf", bytes: PDF.slice(0, PDF.length - 10), status: 400, words: /^This file could not be read: it may be damaged\./ },
  { reason: "DAMAGED (zeros after the PDF's end: no end marker where a reader looks)", name: "passport.pdf", bytes: padded(PDF, PDF.length + 2000), status: 400, words: /^This file could not be read: it may be damaged\./ },
  { reason: "DAMAGED (break M1: a forged file that only claims to be encrypted, no pages)", name: "passport.pdf", bytes: FORGED, status: 400, words: /^This (file could not be read: it may be damaged|PDF needs a password to open)/ },
  { reason: "DAMAGED (break M1: an encrypted PDF cut short)", name: "statement.pdf", bytes: EDIT_PROTECTED.slice(0, EDIT_PROTECTED.length - 10), status: 400, words: /^This file could not be read: it may be damaged\./ },
  { reason: "locked (a PDF that needs a password to open: its pages cannot be read)", name: "statement.pdf", bytes: NEEDS_PASSWORD, status: 400, words: /^This PDF needs a password to open, so it could not be read\. Save a copy without the password/ },
  { reason: "DAMAGED (a PDF header with nothing behind it)", name: "passport.pdf", bytes: text("%PDF-1.4\n% Sample\n%%EOF\n"), status: 400, words: /^This file could not be read: it may be damaged\./ },
  { reason: "TOO_LARGE", name: "scan.jpg", bytes: padded(JPG, MAX_BYTES.image + 1), status: 413, words: /^This file is 10 MB; the limit for images is 10 MB\./ },
  { reason: "TOO_MANY_PIXELS", name: "photo.png", bytes: fixture("bomb.png"), status: 413, words: /^This image is too large to open safely/ },
];

await main("CS-D1t", "the case upload doors use the one file-type check (R1.67)", async () => {
  ok("setup: the Visitor visa with pack 4's document lines is released on this copy", hasLetter());
  ok("CS-D1t: the case side's kinds are PDF, JPEG and PNG, in one list", CASE_FILE_KINDS.join() === "pdf,jpeg,png", CASE_FILE_KINDS);
  // The reader itself: a PDF that opens, one cut short, and a reader that cannot be run (never taken for "opens").
  ok("CS-D1t pass: the reader says a well-formed PDF opens", (await pdfOpens(PDF)) === "opens");
  ok("CS-D1t fail: the reader says a PDF cut short is damaged", (await pdfOpens(PDF.slice(0, PDF.length - 20))) === "damaged");
  ok("CS-D1t fail: a reader that cannot be run answers \"unchecked\", never \"opens\"", (await pdfOpens(PDF, "/nonexistent/python")) === "unchecked");
  ok("CS-D1t fail (break M1): a PDF that needs a password is \"locked\", never \"opens\"; one protected only against editing opens", (await pdfOpens(NEEDS_PASSWORD)) === "locked" && (await pdfOpens(EDIT_PROTECTED)) === "opens");
  // Break M2 and m1, with stand-in readers (shell scripts that answer like the reader, slowly): how many run at once,
  // how many wait, and what a read that never ends answers.
  const dir = mkdtempSync(join(tmpdir(), "csd1t-")), mark = join(dir, "marks");
  const standIn = (name: string, body: string) => { const f = join(dir, name); writeFileSync(f, `#!/bin/sh\ncat > /dev/null\n${body}\n`); chmodSync(f, 0o755); return f; };
  try {
    const slow = standIn("slow", `echo s >> ${mark}; sleep 1; echo e >> ${mark}; echo '{"ok": true}'`);
    const many = PDF_READERS + PDF_READERS_WAITING + 3, t0 = Date.now();
    const answers = await Promise.all(Array.from({ length: many }, () => pdfOpens(PDF, slow)));
    let most = 0, now = 0; for (const m of readFileSync(mark, "utf8").trim().split("\n")) { now += m === "s" ? 1 : -1; most = Math.max(most, now); }
    ok(`CS-D1t fail (break M2): of ${many} PDFs at once, never more than ${PDF_READERS} readers run, ${PDF_READERS_WAITING} wait their turn, and the 3 beyond that are answered "unchecked" at once`,
      most === PDF_READERS && answers.filter((a) => a === "opens").length === PDF_READERS + PDF_READERS_WAITING && answers.filter((a) => a === "unchecked").length === 3 && Date.now() - t0 >= 4_500, { most, answers, ms: Date.now() - t0 });
    ok("CS-D1t pass (break M2): afterwards the places are free again", (await pdfOpens(PDF)) === "opens");
    const never = await pdfOpens(PDF, standIn("never", "sleep 30"), 500);
    ok("CS-D1t fail (break m1): a read that does not end in time is \"unchecked\" (not the file's fault), never \"damaged\" or \"opens\"", never === "unchecked", never);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const unchecked = await checkedCaseFile({ buffer: Buffer.from(PDF), originalname: "passport.pdf" }, async () => "unchecked" as const).then(() => null, (e: { getStatus?: () => number; message?: string }) => ({ status: e.getStatus?.(), words: String(e.message) }));
  ok("CS-D1t fail: with the reader down a PDF is not stored unchecked: refused (503) in words that do not blame the file", unchecked?.status === 503 && /could not be checked just now.*Nothing was stored\.$/.test(unchecked.words), unchecked);
  const image = await checkedCaseFile({ buffer: Buffer.from(JPG), originalname: "scan.jpg" }, async () => "unchecked" as const).then((r) => r.kind, () => null);
  ok("CS-D1t pass: an image never asks the PDF reader", image === "jpeg", image);
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
    // Break M1, the passing side: a PDF protected only against editing (as IRCC's own forms are) opens with no password.
    let before = await stored(), u = await door.send({ name: "statement.pdf", bytes: EDIT_PROTECTED });
    ok(`${D} pass: a PDF protected only against editing is read and stored (201)`, u.status === 201 && Number((await stored()).rows) === Number(before.rows) + 1, { status: u.status, detail: u.body?.detail });
    // The door's own 20 MB limit stays (C6.4 break m5): a PDF over it is refused before PF-F4's 25 MB is reached.
    before = await stored(); u = await door.send({ name: "big.pdf", bytes: padded(PDF, 20 * MB + 1) });
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
