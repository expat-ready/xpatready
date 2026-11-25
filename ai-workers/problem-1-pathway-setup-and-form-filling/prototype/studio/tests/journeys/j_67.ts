// J-67 (map row 67, R1.67: file-type check): CS-D1t's journey (brief build-lead-c-briefs/CS-D1t.md). The two case upload
// doors, a checklist line's and the person's document with no line, judge a file by PF-F4's one check (`checkFile`,
// api/src/platform/files/file-type.ts), walked on an isolated copy of the running app (its own database and port, never
// :4400) on the Visitor visa of acceptance pack 4, on screen at 1440 px and through the API.
//   DW1: both doors call `checkFile` (shown by what they refuse and correct, which only that check does); the same judge fails on a
//        stand-in door that skips the check (it lets a GIF named passport.png through) and on the old check (contracts'
//        `mediaOf`, which takes a PNG cut off after its signature and never corrects a name);
//   DW2: a refusal stores nothing (no row, no file, no audit line) through each door; the same judge fails after a
//        stored upload;
//   W1..W7: the case officer on the case's Documents panel: a real PDF on a person's line is stored; a GIF named
//        passport.png, an empty file, a truncated PDF, a damaged image and a 30 MB PDF are each refused in words on that
//        line with nothing stored; the case's client uploads a JPEG on their line and the walk ends at the next
//        capability's first step, the line showing the stored file.
// The truncated PDF is refused by the doors' own read (`pdfOpens`, the reader tools/check_pdf_opens.py): `checkFile`
// reads no PDF structure. One line differs from the brief, said in the PR: the client's upload goes through the API,
// as the Documents panel is staff only and no client screen uploads yet.
// Sample people and synthetic files only; US$0, no model call.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j67 4467 start --ttl 40 && trap 'zsh studio/tools/isolated.sh j67 4467 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_67.ts j67 4467
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { textPdf } from "../../acceptance/lib/fixtures.ts";
import { mediaOf } from "../../contracts/documents.ts";
import { NOTHING_STORED } from "../../api/src/platform/files/file-type.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j67", Number(process.argv[3] ?? 4467)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://127.0.0.1:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-67", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
// The pack's helpers read the copy's port and database from the command line (their own usage: <port> <database>).
process.argv[2] = String(PORT); process.argv[3] = DBNAME;
const { FAMILY, OFFICER, CLIENT, answer, call, ok, openCase, rec, sql } = await import("../../acceptance/lib/m3.ts");

type Bytes = Uint8Array<ArrayBuffer>;
type File = { name: string; bytes: Bytes };
type Ans = { status: number; detail: string; id?: string };
const fixture = (n: string): Bytes => new Uint8Array(readFileSync(join(STUDIO, "tests", "fixtures", "file-types", n)));
const text = (s: string): Bytes => new TextEncoder().encode(s);
const padded = (head: Bytes, size: number): Bytes => { const b = new Uint8Array(size); b.set(head); return b; };
const PDF: Bytes = new Uint8Array(textPdf(["SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID", "Sample synthetic document (J-67)"])), JPG = fixture("sample.jpg"), PNG = fixture("sample.png");
const GIF: File = { name: "passport.png", bytes: text("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;") };
const EMPTY: File = { name: "passport.pdf", bytes: new Uint8Array() };
const TRUNCATED: File = { name: "passport.pdf", bytes: PDF.slice(0, Math.floor(PDF.length * 0.6)) };
const CUT_OFF: File = { name: "passport.png", bytes: PNG.slice(0, 12) };
const WRONG_NAME: File = { name: "passport.png", bytes: JPG };
const BIG: File = { name: "bank-statements.pdf", bytes: padded(PDF, 30 * 1024 * 1024) };

// ------------------------------------------------------------------------------------------------ setup (Sample)
const hasVisa = () => sql("select count(*) from canonical_field where canonical_field_key='person.travels_with'") !== "0" && sql("select count(*) from document_type where document_type_key='letter_of_authorization_for_a_minor'") === "1";
if (!hasVisa()) for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"])
  try { execFileSync(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, f), String(PORT), DBNAME], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 }); }
  catch { /* the setups exit 1 on their own known gaps (pack 4 S2w, S7, S7a); what this walk needs is asked below */ }
ok("J-67 setup: the Visitor visa with pack 4's document lines is released on this copy", hasVisa());
const c = await openCase(sql("select id from combination where combination_key='vv.single'")!, FAMILY);
const A = c.subjects["Sample Client A"];
await answer(c.id, c.caseSubject, "case.application_date", new Date().toISOString().slice(0, 10), OFFICER);
type Line = { id: string; label: string; state: string; documents: { id: string; file_name: string; current: boolean }[] };
const lines = async () => ((await call("GET", `/runtime/cases/${c.id}/checklist`, undefined, OFFICER)).body?.people as { subject: string; lines: Line[] }[]).find((p) => p.subject === A)!.lines;
const lineOf = async (id: string) => (await lines()).find((l) => l.id === id)!;
const [first, second] = (await lines()).filter((l) => l.state === "not_requested");
ok("J-67 setup: Client A has two document lines not yet requested", !!first && !!second, (await lines()).map((l) => [l.label, l.state]));

const send = async (path: string, f: File, actor: string, extra: Record<string, string>): Promise<Ans> => {
  const fd = new FormData(); for (const [k, v] of Object.entries(extra)) fd.append(k, v); fd.append("file", new Blob([f.bytes]), f.name);
  const res = await fetch(`${BASE}/api/runtime/${path}`, { method: "POST", headers: { "x-actor": actor }, body: fd });
  const body = await res.json().catch(() => null) as { detail?: string; document?: { id: string } } | null;
  return { status: res.status, detail: String(body?.detail ?? ""), id: body?.document?.id };
};
type Door = { name: string; send: (f: File, actor?: string) => Promise<Ans>; row: (id: string | undefined) => string };
const rowOf = (id: string | undefined) => sql(`select media_type || '|' || file_name from case_document where id='${id}'`) ?? "";
const DOORS: Door[] = [
  { name: "the checklist line's door", send: (f, actor = OFFICER) => send(`checklist-lines/${second.id}/documents`, f, actor, {}), row: rowOf },
  { name: "the door for a document with no line", send: (f, actor = OFFICER) => send(`cases/${c.id}/documents`, f, actor, { subjectId: A, documentType: "letter_of_invitation" }), row: rowOf },
];
const stored = () => ({
  rows: Number(sql(`select count(*) from case_document where subject_id='${A}'`)),
  files: execFileSync("find", [join(STUDIO, "var"), "-path", `*/workspaces/demo/people/${A}/documents/*`, "-type", "f"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).length,
  audit: Number(sql(`select count(*) from audit_event where action='uploaded' and entity='case document' and summary like '%case ${c.id.slice(0, 8)}%'`)),
});
const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------------------------------------------------------------ DW1, DW2 (API)
/** DW1's judge of one door: it refuses a GIF named passport.png and a PNG cut off after its signature, and stores a JPEG
 *  named passport.png as a JPEG under a .jpg name. Only a door that calls checkFile does all three. */
const judge1 = async (d: Door) => {
  const gif = await d.send(GIF), cut = await d.send(CUT_OFF), jpg = await d.send(WRONG_NAME);
  return { ok: gif.status === 415 && cut.status === 400 && jpg.status === 201 && d.row(jpg.id) === "image/jpeg|passport.jpg", gif: gif.status, cut: cut.status, jpg: [jpg.status, d.row(jpg.id)] };
};
for (const d of DOORS) { const j = await judge1(d); ok(`J-67 DW1: ${d.name} refuses a GIF named passport.png (415) and a damaged PNG (400), and stores a JPEG named .png as a JPEG named .jpg`, j.ok, j); }
// The stand-ins (P-606): a door that skips the check, and a door with the old check. Neither writes anything: they answer as that door would.
const kept = new Map<string, string>();
const standIn = (name: string, takes: (f: File) => string | null): Door => ({ name, row: (id) => kept.get(id ?? "") ?? "",
  send: async (f) => { const media = takes(f); if (!media) return { status: 415, detail: "" }; const id = `stand-in-${kept.size}`; kept.set(id, `${media}|${f.name}`); return { status: 201, detail: "", id }; } });
const skips = await judge1(standIn("a door that skips the check", () => "application/octet-stream"));
ok("J-67 DW1 stand-in: a door that skips the check lets the GIF named passport.png through, so the same judge fails", !skips.ok && skips.gif === 201, skips);
const old = await judge1(standIn("a door with the old check", (f) => mediaOf(f.bytes)));
ok("J-67 DW1 stand-in: the old check (mediaOf) takes the damaged PNG and keeps the wrong name, so the same judge fails", !old.ok && old.cut === 201 && old.jpg[1] === "image/jpeg|passport.png", old);

/** DW2's judge: what is stored for the person is the same before and after the uploads. */
const judge2 = async (d: Door, files: File[]) => { const before = stored(); const answers = []; for (const f of files) answers.push(await d.send(f)); const after = stored(); return { ok: same(before, after), before, after, answers }; };
for (const d of DOORS) {
  const j = await judge2(d, [GIF, EMPTY, CUT_OFF, TRUNCATED]);
  ok(`J-67 DW2: ${d.name}: four refusals, each ending "${NOTHING_STORED}", leave no row, no file and no audit line`, j.ok && j.answers.every((a) => a.status >= 400 && a.detail.endsWith(NOTHING_STORED)), j);
  const kept2 = await judge2(d, [{ name: "passport.pdf", bytes: PDF }]);
  ok(`J-67 DW2 stand-in: ${d.name}: after a stored upload the same judge fails (one more row, file and audit line)`, !kept2.ok && kept2.after.rows === kept2.before.rows + 1 && kept2.after.files === kept2.before.files + 1 && kept2.after.audit === kept2.before.audit + 1, kept2);
}

// ------------------------------------------------------------------------------------------------ the walk (1440 px)
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* private window */ } }, c.officer);
  const page = await ctx.newPage();
  const shot = (name: string, width = 1440) => page.locator("[data-documents-panel]").screenshot({ path: join(SHOTS, `${name}-${width}.png`) });   // the panel only: the case page is 12,000 px tall
  const open = async () => { await page.goto(`/cases/${c.id}`); await page.locator("[data-documents-panel]").waitFor({ timeout: 30_000 }); await page.locator(`[data-line="${first.id}"]`).waitFor({ timeout: 30_000 }); };
  const row = page.locator(`[data-line="${first.id}"]`), error = row.locator("[data-line-error]");
  const choose = (f: File) => row.locator("[data-upload-input]").setInputFiles({ name: f.name, mimeType: "application/octet-stream", buffer: Buffer.from(f.bytes) });
  /** A file chosen on the line and refused: the words under the line, its state and files as they were, nothing stored. */
  const refusedOnScreen = async (f: File, words: RegExp) => {
    const before = stored(), was = await lineOf(first.id);
    await choose(f);
    // Words that never come are a FAIL line with what the line says instead, and the walk goes on.
    const came = await error.filter({ hasText: words }).waitFor({ timeout: 60_000 }).then(() => true, () => false);
    if (!came) return { ok: false, said: (await error.count()) ? await error.textContent() : "no words on the line", before, after: stored() };
    const said = (await error.textContent()) ?? "", now = await lineOf(first.id);
    return { ok: words.test(said) && said.endsWith(NOTHING_STORED) && same(before, stored()) && now.state === was.state && now.documents.length === was.documents.length && (await row.getAttribute("data-state")) === was.state, said, before, after: stored() };
  };

  // W1: the case officer opens the case and uploads a real PDF on a person's line.
  await open();
  const before = stored();
  await choose({ name: "passport.pdf", bytes: PDF });
  await page.locator(`[data-line="${first.id}"][data-state="received"]`).waitFor({ timeout: 30_000 });
  const got = await lineOf(first.id);
  ok(`J-67 W1: the case officer uploads a real PDF on "${first.label}": Received, the file named on the line, one row and one file stored`,
    got.state === "received" && got.documents.length === 1 && ((await row.textContent()) ?? "").includes("passport.pdf") && stored().rows === before.rows + 1 && stored().files === before.files + 1, { state: got.state, before, after: stored() });
  await shot("W1-pdf-stored");

  // W2..W5: files the check refuses, each in words on the line, nothing stored.
  let r = await refusedOnScreen(GIF, /This type of file is not accepted\. Allowed here: PDF, JPEG and PNG\./);
  ok("J-67 W2: a GIF named passport.png is refused in words on the line (the file's own bytes decide), nothing stored", r.ok, r);
  await shot("W2-gif-refused");
  r = await refusedOnScreen(EMPTY, /This file is empty\./);
  ok("J-67 W3: an empty file is refused in words, nothing stored", r.ok, r);
  r = await refusedOnScreen(TRUNCATED, /This file could not be read: it may be damaged\./);
  ok("J-67 W4: a truncated PDF (it does not open) is refused as damaged, nothing stored", r.ok, r);
  r = await refusedOnScreen(CUT_OFF, /This image could not be read: it may be damaged\./);
  ok("J-67 W4: a damaged image (a PNG cut off after its signature) is refused as damaged, nothing stored", r.ok, r);
  await shot("W4-damaged-refused");
  r = await refusedOnScreen(BIG, /The file is larger than 20 MB\./);
  ok("J-67 W5: a 30 MB PDF is refused as too large, nothing stored", r.ok, r);
  await shot("W5-too-large-refused");
  const axe = await new AxeBuilder({ page }).include("[data-documents-panel]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok("J-67 W5: axe finds no WCAG A/AA violation on the Documents panel with a refusal shown", axe.violations.length === 0, axe.violations.map((v) => v.id));

  // W6: the case's client uploads a JPEG on their line (through the API: no client screen uploads yet).
  const mine = stored(), u = await DOORS[0].send({ name: "IMG_0001.JPG", bytes: JPG }, CLIENT);
  ok("J-67 W6: the case's client uploads a JPEG on their checklist line: stored as image/jpeg under its own name", u.status === 201 && rowOf(u.id) === "image/jpeg|IMG_0001.JPG" && stored().rows === mine.rows + 1, { status: u.status, detail: u.detail, row: rowOf(u.id) });

  // W7: the next capability's first step: the officer's Documents panel shows the client's stored file on its line, at 1440 and 1024 px.
  await open();
  const line2 = page.locator(`[data-line="${second.id}"]`);
  await line2.filter({ hasText: "IMG_0001.JPG" }).waitFor({ timeout: 30_000 });
  ok(`J-67 W7: the walk ends on the Documents panel: "${second.label}" shows the client's stored file`, ((await line2.textContent()) ?? "").includes("IMG_0001.JPG") && (await lineOf(second.id)).documents.some((d) => d.current && d.file_name === "IMG_0001.JPG"));
  await shot("W7-client-file-on-line");
  await page.setViewportSize({ width: 1024, height: 800 });
  await line2.filter({ hasText: "IMG_0001.JPG" }).waitFor({ timeout: 30_000 });
  const wide = await page.evaluate(() => { const p = document.querySelector("[data-documents-panel]")!; return p.scrollWidth > p.clientWidth + 1 || p.getBoundingClientRect().right > window.innerWidth + 1; });
  ok("J-67 W7: at 1024 px the Documents panel fits the page (nothing cut off sideways)", !wide);
  const axe1024 = await new AxeBuilder({ page }).include("[data-documents-panel]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok("J-67 W7: axe finds no WCAG A/AA violation on the Documents panel at 1024 px", axe1024.violations.length === 0, axe1024.violations.map((v) => v.id));
  await shot("W7-client-file-on-line", 1024);
} finally {
  await browser.close();
}
process.exit(rec.summary() ? 1 : 0);
