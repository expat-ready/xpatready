// PF-F4 (map row 67): the one file-type and size check every upload door calls (api/src/platform/files/file-type.ts).
// Every acceptance line of the BACKLOG row, a pass and a fail each: one real sample of each allowed type, the renamed
// .exe, HTML and SVG, .docm and .xlsm, a plain ZIP ("one by one"), the size limits on declared and actual sizes, a ZIP
// declaring a 2 GB entry (never decompressed, under 50 ms), the allowed list in every refusal; batch 5: the PNG bomb
// header, the renamed JPEG corrected, an IRCC form with scripts stored and flagged, an images-only door refusing a PDF,
// and "Nothing was stored." at the end of every refusal. Pure code: no server, database or network. US$0.
// Fixtures: tests/fixtures/file-types/ (make_fixtures.py); no PDF is committed, so PDFs are built here or read from the
// committed IRCC forms under official-sources/.
//   tsx studio/tests/check_pff4_file_type.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import {
  ALL_KINDS, KINDS, MAX_BYTES, MAX_IMAGE_PIXELS, NOTHING_STORED, SCRIPTS_FLAG, checkDeclared, checkFile, correctedName, detect, type FileKind, type Refused,
} from "../api/src/platform/files/file-type.ts";

const FIX = join(import.meta.dirname, "fixtures", "file-types");
const IRCC = join(import.meta.dirname, "..", "..", "..", "official-sources", "ircc", "forms");
const fx = (n: string) => new Uint8Array(readFileSync(join(FIX, n)));
const MB = 1024 * 1024;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const refusals: Refused[] = [];
const refused = (r: { ok: boolean }, reason?: string): r is Refused => {
  if (r.ok) return false; refusals.push(r as Refused); return reason === undefined || (r as Refused).reason === reason;
};

const bytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const pdf = (body = "") => bytes(`%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R ${body}>> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
const padTo = (b: Uint8Array, n: number) => { const o = new Uint8Array(n); o.set(b); return o; };

/** A stored ZIP written here, with an optional lie in an entry's declared sizes (the bomb's shape). */
function zip(entries: { name: string; data: Uint8Array; declared?: number }[]): Uint8Array {
  const parts: Buffer[] = [], cd: Buffer[] = []; let at = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), crc = crc32(e.data), size = e.declared ?? e.data.length;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.declared ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(e.data.length, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.declared ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(e.data.length, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(at, 42);
    parts.push(lh, name, Buffer.from(e.data)); cd.push(ch, name); at += 30 + name.length + e.data.length;
  }
  const cdBuf = Buffer.concat(cd), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(at, 16);
  return new Uint8Array(Buffer.concat([...parts, cdBuf, end]));
}

// ---- (1) one real sample of each allowed type passes; its bytes decide its type ------------------------------------
const samples: [FileKind, Uint8Array, string][] = [
  ["pdf", pdf(), "letter.pdf"], ["jpeg", fx("sample.jpg"), "photo.jpg"], ["png", fx("sample.png"), "scan.png"], ["heic", fx("sample.heic"), "phone.heic"],
  ["tiff", fx("sample.tiff"), "fax.tiff"], ["word", fx("sample.docx"), "cv.docx"], ["excel", fx("sample.xlsx"), "funds.xlsx"],
];
for (const [kind, b, name] of samples) {
  const r = checkFile({ bytes: b, name, mediaType: KINDS[kind].mediaType }, ALL_KINDS);
  ok(`PF-F4: a real ${KINDS[kind].words} sample is accepted as ${KINDS[kind].mediaType}`, r.ok && r.kind === kind && r.mediaType === KINDS[kind].mediaType && !r.corrected && r.name === name, r);
}
ok("PF-F4: a PDF is a PDF only from %PDF- at byte 0 (one byte off: refused)", refused(detect(new Uint8Array([0x20, ...pdf()])), "NOT_ALLOWED_TYPE"));
const avif = bytes("\0\0\0\x1cftypavif\0\0\0\0mif1avifmiaf");
ok("PF-F4: an AVIF (ftyp avif, mif1) is not taken for HEIC", refused(detect(avif), "NOT_ALLOWED_TYPE"));
ok("PF-F4: the HEIC sample's ftyp brand is heic", detect(fx("sample.heic")).ok && String.fromCharCode(...fx("sample.heic").subarray(8, 12)) === "heic");
ok("PF-F4: a big-endian TIFF (MM\\0*) passes too", detect(bytes("MM\0*\0\0\0\x08")).ok);

// ---- an .exe renamed .pdf, HTML and SVG are refused --------------------------------------------------------------
const exe = bytes("MZ\x90\0\x03\0\0\0\x04\0\0\0\xff\xff\0\0This program cannot be run in DOS mode.");
const rExe = checkFile({ bytes: exe, name: "passport.pdf", mediaType: "application/pdf" }, ALL_KINDS);
ok("PF-F4: an .exe renamed passport.pdf (declared application/pdf) is refused", refused(rExe, "NOT_ALLOWED_TYPE"), rExe);
ok("PF-F4: HTML is refused", refused(checkFile({ bytes: bytes("<!doctype html><html><script>alert(1)</script></html>"), name: "a.pdf" }, ALL_KINDS), "NOT_ALLOWED_TYPE"));
ok("PF-F4: SVG is refused", refused(checkFile({ bytes: bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), name: "logo.png", mediaType: "image/png" }, ALL_KINDS), "NOT_ALLOWED_TYPE"));
ok("PF-F4: old binary Word (.doc, OLE) is refused: Word means OOXML", refused(detect(bytes("\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1\0\0")), "NOT_ALLOWED_TYPE"));
ok("PF-F4: an empty file is refused", refused(detect(new Uint8Array()), "EMPTY"));

// ---- macro-enabled office files are refused ------------------------------------------------------------------------
ok("PF-F4: .docm (word/vbaProject.bin) is refused", refused(checkFile({ bytes: fx("macro.docm"), name: "cv.docm" }, ALL_KINDS), "MACROS"));
ok("PF-F4: .xlsm (xl/vbaProject.bin) is refused, even renamed .xlsx", refused(checkFile({ bytes: fx("macro.xlsm"), name: "funds.xlsx" }, ALL_KINDS), "MACROS"));
const xl = (extra: string) => zip([{ name: "[Content_Types].xml", data: bytes("<Types/>") }, { name: "xl/workbook.xml", data: bytes("<w/>") }, { name: extra, data: bytes("x") }]);
ok("PF-F4: an Excel 4 macro sheet (xl/macrosheets/) is refused", refused(detect(xl("xl/macrosheets/sheet1.xml")), "MACROS") && detect(xl("xl/worksheets/sheet1.xml")).ok);
ok("PF-F4: part names are case-insensitive: xl/Macrosheets/ and XL/VBAPROJECT.BIN are refused",
  refused(detect(xl("xl/Macrosheets/sheet1.xml")), "MACROS") && refused(detect(xl("XL/VBAPROJECT.BIN")), "MACROS"));
ok("PF-F4: word/vbaData.xml is refused", refused(detect(zip([{ name: "[Content_Types].xml", data: bytes("<Types/>") }, { name: "word/document.xml", data: bytes("<w/>") }, { name: "word/vbaData.xml", data: bytes("x") }])), "MACROS"));
const pptx = zip([{ name: "[Content_Types].xml", data: bytes("<Types/>") }, { name: "ppt/presentation.xml", data: bytes("<p/>") }]);
const odt = zip([{ name: "mimetype", data: bytes("application/vnd.oasis.opendocument.text") }, { name: "content.xml", data: bytes("<o/>") }]);
const rPptx = detect(pptx), rOdt = detect(odt);
ok("PF-F4: PowerPoint and OpenDocument are \"not accepted\", not told to upload \"one by one\"",
  refused(rPptx, "NOT_ALLOWED_TYPE") && refused(rOdt, "NOT_ALLOWED_TYPE") && !rPptx.message.includes("one by one"), [rPptx, rOdt]);

// ---- a plain ZIP is refused with "one by one" (P-607, Q7) ----------------------------------------------------------
// Built here, not committed: the root .gitignore keeps every *.zip out of git (review B1, 18 Nov).
const plainZip = zip([{ name: "passport.jpg", data: fx("sample.jpg") }, { name: "letter.txt", data: bytes("Sample") }]);
const rZip = checkFile({ bytes: plainZip, name: "documents.zip" }, ALL_KINDS);
ok("PF-F4: a plain ZIP is refused with \"Upload the files inside one by one\"", refused(rZip, "ZIP") && rZip.message.startsWith("Upload the files inside one by one."), rZip);
const rFakeOffice = checkFile({ bytes: zip([{ name: "word/document.xml", data: bytes("<w/>") }]), name: "cv.docx" }, ALL_KINDS);
ok("PF-F4: a ZIP with word/ but no [Content_Types].xml is a plain ZIP, not Word", refused(rFakeOffice, "ZIP"), rFakeOffice);
ok("PF-F4: a ZIP cut before its end record is refused as damaged", refused(detect(plainZip.subarray(0, plainZip.length - 30)), "DAMAGED"));
const office = zip([{ name: "[Content_Types].xml", data: bytes("<Types/>") }, { name: "word/document.xml", data: bytes("<w/>") }]);
ok("PF-F4: the hand-built office ZIP below is Word (the base for the damaged cases)", detect(office).ok);
const withEnd = (b: Uint8Array, put: (v: DataView) => void) => { const c = new Uint8Array(b); put(new DataView(c.buffer, c.length - 22)); return c; };
ok("PF-F4: a directory said to start past the end record is refused as damaged",
  refused(detect(withEnd(office, (v) => v.setUint32(16, office.length, true))), "DAMAGED"));
ok("PF-F4: a ZIP64 entry count (0xffff) is refused as damaged (by the 5,000-entry cap)", refused(detect(withEnd(office, (v) => v.setUint16(10, 0xffff, true))), "DAMAGED"));
const many = zip([{ name: "[Content_Types].xml", data: bytes("<Types/>") }, ...Array.from({ length: 5000 }, (_, i) => ({ name: `word/p${i}.xml`, data: new Uint8Array() }))]);
ok("PF-F4: a real ZIP of 5,001 entries is refused as damaged (the cap), one of 5,000 is read",
  refused(detect(many), "DAMAGED") && detect(zip([{ name: "[Content_Types].xml", data: bytes("<Types/>") }, ...Array.from({ length: 4999 }, (_, i) => ({ name: `word/p${i}.xml`, data: new Uint8Array() }))])).ok);
ok("PF-F4: a directory size running past the end record is refused as damaged (entries themselves in bounds)",
  refused(detect(withEnd(office, (v) => v.setUint32(12, 0xfffffff0, true))), "DAMAGED"));
ok("PF-F4: a directory entry without its signature is refused as damaged",
  (() => { const c = new Uint8Array(office); const cd = new DataView(c.buffer).getUint32(c.length - 6, true); c[cd] = 0; return refused(detect(c), "DAMAGED"); })());
ok("PF-F4: an entry count above what the directory holds is refused as damaged", refused(detect(withEnd(office, (v) => v.setUint16(10, 3, true))), "DAMAGED"));

// ---- size limits: declared at creation, actual at the end ----------------------------------------------------------
const doc25 = padTo(pdf(), 25 * MB), img10 = padTo(fx("sample.jpg"), 10 * MB);
ok("PF-F4: exactly 25 MB as a document passes", checkFile({ bytes: doc25, name: "a.pdf" }, ALL_KINDS).ok);
ok("PF-F4: 25 MB + 1 byte as a document is refused", refused(checkFile({ bytes: padTo(pdf(), 25 * MB + 1), name: "a.pdf" }, ALL_KINDS), "TOO_LARGE"));
ok("PF-F4: exactly 10 MB as an image passes", checkFile({ bytes: img10, name: "a.jpg" }, ALL_KINDS).ok);
const rImg = checkFile({ bytes: padTo(fx("sample.jpg"), 10 * MB + 1), name: "a.jpg" }, ALL_KINDS);
ok("PF-F4: 10 MB + 1 byte as an image is refused (the image limit, not the document one)", refused(rImg, "TOO_LARGE") && rImg.message.includes("limit for images is 10 MB"), rImg);
ok("PF-F4: declared 25 MB application/pdf opens", checkDeclared({ size: 25 * MB, mediaType: "application/pdf" }, ALL_KINDS).ok);
ok("PF-F4: declared 25 MB + 1 application/pdf is refused at creation", refused(checkDeclared({ size: 25 * MB + 1, mediaType: "application/pdf" }, ALL_KINDS), "TOO_LARGE"));
ok("PF-F4: declared 10 MB image/jpeg opens", checkDeclared({ size: 10 * MB, mediaType: "image/jpeg" }, ALL_KINDS).ok);
ok("PF-F4: declared 10 MB + 1 image/jpeg is refused at creation", refused(checkDeclared({ size: 10 * MB + 1, mediaType: "image/jpeg" }, ALL_KINDS), "TOO_LARGE"));
ok("PF-F4: declared 10 MB + 1 photo.jpeg (by name, no type) is refused at creation", refused(checkDeclared({ size: 10 * MB + 1, name: "photo.jpeg" }, ALL_KINDS), "TOO_LARGE"));
ok("PF-F4: an unknown claim at an images-only door uses the image limit", refused(checkDeclared({ size: 10 * MB + 1, name: "x.bin" }, ["jpeg", "png"]), "TOO_LARGE")
  && checkDeclared({ size: 10 * MB + 1, name: "x.bin" }, ALL_KINDS).ok);
ok("PF-F4: a negative or fractional declared size is refused", refused(checkDeclared({ size: -1 }, ALL_KINDS)) && refused(checkDeclared({ size: 1.5 }, ALL_KINDS)));

// ---- a ZIP declaring a 2 GB entry is never decompressed ------------------------------------------------------------
const bomb = zip([{ name: "[Content_Types].xml", data: bytes("<Types/>") }, { name: "word/document.xml", data: new Uint8Array(1024), declared: 2 * 1024 * MB }]);
const t0 = performance.now(); const rBomb = checkFile({ bytes: bomb, name: "big.docx" }, ALL_KINDS); const ms = performance.now() - t0;
ok(`PF-F4: a ZIP declaring a 2 GB entry is read from its directory only, in under 50 ms (${ms.toFixed(2)} ms)`, ms < 50 && rBomb.ok && rBomb.kind === "word", { ms, rBomb });
const plainBomb = zip([{ name: "a.bin", data: new Uint8Array(1024), declared: 2 * 1024 * MB }]);
const t1 = performance.now(); const rPlainBomb = detect(plainBomb); const ms1 = performance.now() - t1;
ok(`PF-F4: a plain ZIP declaring 2 GB is refused as a ZIP in under 50 ms (${ms1.toFixed(2)} ms)`, ms1 < 50 && refused(rPlainBomb, "ZIP"));

// ---- batch 5: the bomb PNG header, the renamed JPEG, scripts flagged ------------------------------------------------
const rPng = checkFile({ bytes: fx("bomb.png"), name: "scan.png" }, ALL_KINDS);
ok(`PF-F4: a PNG header declaring 20000 x 20000 (over ${MAX_IMAGE_PIXELS / 1e6} megapixels) is refused`, refused(rPng, "TOO_MANY_PIXELS"), rPng);
const sof = (w: number, h: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
ok("PF-F4: a JPEG SOF declaring 65000 x 65000 is refused", refused(detect(sof(65000, 65000)), "TOO_MANY_PIXELS"));
ok("PF-F4: a JPEG SOF declaring 9000 x 9000 (81 megapixels) passes", detect(sof(9000, 9000)).ok);
ok("PF-F4: fill bytes between markers are skipped (FF FF FF C0 still finds the frame)",
  (() => { const b = sof(65000, 65000); const c = new Uint8Array([...b.subarray(0, 8), 0xff, 0xff, ...b.subarray(8)]); return refused(detect(c), "TOO_MANY_PIXELS"); })());
// A Huffman table (C4) is not a frame header: read as one, its bytes would declare 0xFFFF x 0xFFFF.
const dhtFirst = new Uint8Array([0xff, 0xd8, 0xff, 0xc4, 0, 7, 0, 0xff, 0xff, 0xff, 0xff, ...sof(100, 100).subarray(8)]);
const notFrame = (m: number) => { const c = new Uint8Array(dhtFirst); c[3] = m; const r = detect(c); return r.ok && r.pixels === 10000; };
ok("PF-F4: DHT (C4), JPG (C8) and DAC (CC) markers are not read as frame headers", notFrame(0xc4) && notFrame(0xc8) && notFrame(0xcc));
ok("PF-F4: restart markers (D0-D7) before the frame header carry no length and are stepped over",
  (() => { const b = sof(65000, 65000); return refused(detect(new Uint8Array([0xff, 0xd8, 0xff, 0xd0, 0xff, 0xd7, ...b.subarray(2)])), "TOO_MANY_PIXELS"); })());
ok("PF-F4: a JPEG with no frame header before its scan is refused as damaged", refused(detect(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])), "DAMAGED"));
const rRen = checkFile({ bytes: fx("sample.jpg"), name: "passport.pdf", mediaType: "application/pdf" }, ALL_KINDS);
ok("PF-F4: a JPEG renamed passport.pdf is stored as image/jpeg named passport.jpg, marked corrected", rRen.ok && rRen.mediaType === "image/jpeg" && rRen.name === "passport.jpg" && rRen.corrected, rRen);
const rDbl = checkFile({ bytes: fx("sample.docx"), name: "C:\\docs\\cv.docx.exe" }, ALL_KINDS);
ok("PF-F4: a double extension is cleaned (cv.docx.exe → cv.docx)", rDbl.ok && rDbl.name === "cv.docx" && rDbl.corrected, rDbl);
ok("PF-F4: trailing dots and spaces do not hide a double extension (passport.exe. → passport.jpg)",
  correctedName("passport.exe.", "jpeg") === "passport.jpg" && correctedName("file.pdf. ", "pdf") === "file.pdf");
ok("PF-F4: direction and zero-width characters are removed (the right-to-left trick)", correctedName("invoice‮gpj.exe", "pdf") === "invoicegpj.pdf" && correctedName("a​b.pdf", "pdf") === "ab.pdf");
ok("PF-F4: a long name is cut on a whole character, never half an emoji", (() => { const n = correctedName("😀".repeat(300) + ".pdf", "pdf"); return n === "😀".repeat(190) + ".pdf" && !/[\ud800-\udbff](?![\udc00-\udfff])/.test(n); })());
const same = (bytesOf: Uint8Array, name: string, mediaType?: string) => { const r = checkFile({ bytes: bytesOf, name, mediaType }, ALL_KINDS); return r.ok && r.name === name && !r.corrected; };
ok("PF-F4: a right name is not \"corrected\": IMG_0001.JPG, photo.jpeg, IMG_0002.HEIC, scan.TIF",
  same(fx("sample.jpg"), "IMG_0001.JPG") && same(fx("sample.jpg"), "photo.jpeg", "image/jpeg") && same(fx("sample.heic"), "IMG_0002.HEIC", "image/heic") && same(fx("sample.tiff"), "scan.TIF"));
ok("PF-F4: an unknown declared type (application/octet-stream) is no disagreement", same(fx("sample.png"), "a.png", "application/octet-stream"));
ok("PF-F4: a known declared type that disagrees is corrected even with a right name",
  (() => { const r = checkFile({ bytes: fx("sample.png"), name: "a.png", mediaType: "image/jpeg" }, ALL_KINDS); return r.ok && r.corrected && r.mediaType === "image/png"; })());
ok("PF-F4: a dot in the name that is no extension is kept (scan.2024.pdf)", correctedName("scan.2024.pdf", "pdf") === "scan.2024.pdf");
ok("PF-F4: a name of only extensions or markup becomes document.<type>", correctedName(".pdf.exe", "pdf") === "document.pdf" && correctedName('<"x">', "png") === "x.png");
const form = new Uint8Array(readFileSync(join(IRCC, "imm5707e.pdf")));
const rForm = checkFile({ bytes: form, name: "imm5707e.pdf" }, ALL_KINDS);
ok("PF-F4: an IRCC form with scripts (IMM 5707) is stored and flagged \"Contains scripts\"", rForm.ok && rForm.flags.includes(SCRIPTS_FLAG) && rForm.activeContent.includes("JavaScript"), rForm.ok ? rForm.activeContent : rForm);
ok("PF-F4: a plain PDF carries no flag", (() => { const r = checkFile({ bytes: pdf(), name: "a.pdf" }, ALL_KINDS); return r.ok && r.flags.length === 0; })());
const esc = detect(pdf("/OpenAction << /S /J#61vaScript /JS (app.alert(1)) >> /AA << >> /Names << /EmbeddedFiles 3 0 R >>"));
ok("PF-F4: plain active names are all found", esc.ok && ["AA", "EmbeddedFiles", "JavaScript", "OpenAction"].every((n) => esc.activeContent.includes(n)), esc);
const escOnly = detect(pdf("/#4F#70enAction 5 0 R /S /J#61vaScript"));
ok("PF-F4: escaped names alone are found (#xx decoded: /#4F#70enAction, /J#61vaScript)", escOnly.ok && escOnly.activeContent.join() === "JavaScript,OpenAction", escOnly);
const nul = detect(pdf("/OpenAction\0 5 0 R /S/JavaScript\0"));
ok("PF-F4: a NUL after a name (PDF whitespace) does not hide it", nul.ok && nul.activeContent.join() === "JavaScript,OpenAction", nul);
ok("PF-F4: /Launch and /XFA are flagged", (() => { const r = detect(pdf("/AcroForm << /XFA 4 0 R >> /A << /S /Launch >>")); return r.ok && r.activeContent.includes("Launch") && r.activeContent.includes("XFA"); })());
ok("PF-F4: /JSON is not taken for /JS", (() => { const r = detect(pdf("/JSON 1")); return r.ok && r.activeContent.length === 0; })());

// ---- each door narrows the kinds; the refusal lists them in words --------------------------------------------------
const images: FileKind[] = ["jpeg", "png", "heic", "tiff"];
const rDoor = checkFile({ bytes: pdf(), name: "letter.pdf" }, images);
ok("PF-F4: a door that allows images only refuses a PDF, the allowed list in words",
  refused(rDoor, "NOT_ALLOWED_TYPE") && rDoor.message === `This file is a PDF file, which this upload does not accept. Allowed here: JPEG, PNG, HEIC and TIFF. ${NOTHING_STORED}`, rDoor);
ok("PF-F4: the same door accepts a PNG", checkFile({ bytes: fx("sample.png"), name: "a.png" }, images).ok);
ok("PF-F4: the refusal at the full door lists all seven types", rExe.ok === false && rExe.message.includes("Allowed here: PDF, JPEG, PNG, HEIC, TIFF, Word and Excel."), rExe);
ok("PF-F4: a one-type door says it plainly", (() => { const r = checkFile({ bytes: exe }, ["pdf"]); return !r.ok && r.message.endsWith(`Allowed here: PDF. ${NOTHING_STORED}`); })());
ok("PF-F4: a door with no kinds is a programming error, not a silent accept", (() => { try { checkFile({ bytes: pdf() }, []); return false; } catch { return true; } })());
// FF D8 FF then 25 MB of FF fill: walking it takes 70-550 ms, the size refusal under 1 ms; 10 ms tells the order apart.
const big = new Uint8Array(25 * MB).fill(0xff); big[1] = 0xd8;
const t2 = performance.now(); const rBig = checkFile({ bytes: big, name: "a.jpg" }, ALL_KINDS); const ms2 = performance.now() - t2;
ok(`PF-F4: a 25 MB JPEG is refused on its size before any whole-file walk (${ms2.toFixed(1)} ms, under 10)`, refused(rBig, "TOO_LARGE") && ms2 < 10, { ms2, rBig });
const hostile = bytes("%PDF-1.7\n" + "/#4a#53".repeat(Math.floor((9 * MB) / 7)));   // the scan's worst case, 9 MB
const t3 = performance.now(); const rHost = checkFile({ bytes: hostile }, images); const ms3 = performance.now() - t3;
ok(`PF-F4: a 9 MB hostile PDF at an images-only door is refused before its whole-file scan (${ms3.toFixed(1)} ms, under 50)`, refused(rHost, "NOT_ALLOWED_TYPE") && ms3 < 50, { ms3 });
ok(`PF-F4: the limits are the built constants (SA-8-58): 25 MB documents, 10 MB images`, MAX_BYTES.document === 25 * MB && MAX_BYTES.image === 10 * MB);

// ---- every refusal lists the allowed types and ends "Nothing was stored." ------------------------------------------
const bad = refusals.filter((r) => !r.message.endsWith(` ${NOTHING_STORED}`) || !/Allowed here: [A-Z]/.test(r.message));
ok(`PF-F4: every refusal (${refusals.length}) lists the allowed types and ends "Nothing was stored."`, refusals.length >= 20 && bad.length === 0, bad);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
