// CS-D5 part 2 (R1.68, map row 68; concept screens/CS-D5/concept.md r2.1, approved by the tech lead on #3005): the staff
// preview panel, walked by screens like a person on an isolated copy (its own database and port, never :4400), on the
// Visitor visa of acceptance pack 4. Part 1's API checks stay in tests/check_csd5_preview.ts. A pass and a fail per rule:
//   BR-1 a stored PDF opens from its name on the line / a link refused as "Checking for viruses…" (409) or "Removed —
//        infected file" (410) shows those words in the panel with no bytes fetched. Case files have no scan state until
//        PF-F3 (R1.66), so main's API never answers 409/410 yet: those two answers are injected at the network layer, and
//        the panel must never say "Checked: clean" for a file the API calls NOT_SCANNED.
//   BR-2 the network log holds one link request and bytes only from /document-previews/; no <iframe>, <embed>, <object>
//   BR-3 DW6: a PDF whose /OpenAction is JavaScript renders, its marker never appears, no dialog opens, the "Contains
//        scripts" warning shows / a plain PDF shows none
//   BR-4 a person of another firm asking for the same link gets the download's 404 words
//   BR-5 one "previewed" line after three page turns and a zoom (audit trail) / a second GET of the used link → 404, no line
//   BR-6 rotate, close, reopen → upright; the stored file's SHA-256 is unchanged
//   BR-7 a link used up before its one fetch is asked for once more and the file opens / used up twice → "could not open"
//   BR-8 Accept is CS-D1 part 2's route, not on main: no Accept and no Reject show in the panel (question on the PR)
//   W1   keyboard only: from the line, open, page, zoom, rotate, Escape, focus back on the file name; axe 0 serious;
//        375/1024/1440 px with no sideways page scroll; page 150 of 200 drawn within 2 s of Next page while the toolbar
//        answers; at 1440 px 9 pt print on an A4 page draws at least 11 px at Fit width; at 1024 px 200% only the page
//        area scrolls
// Synthetic Sample documents only; US$0, no model call.
//   zsh studio/tools/isolated.sh csd5_browser 4493 start && tsx studio/tests/check_csd5_preview_browser.ts 4493 xr_studio_csd5_browser
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4493), DBNAME = process.argv[3] ?? "xr_studio_csd5_browser", NAME = DBNAME.replace(/^xr_studio_/, "");
const BASE = `http://127.0.0.1:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "CS-D5", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
process.argv[2] = String(PORT); process.argv[3] = DBNAME;
const { FAMILY, OFFICER, call, ok, openCase, rec, sql } = await import("../acceptance/lib/m3.ts");
const { upload } = await import("../acceptance/lib/fixtures.ts");

// ------------------------------------------------------------------------------------------------ Sample PDFs
/** A PDF with one page per entry, Helvetica at `pt`, on A4 (595 x 842 pt); `js` adds an /OpenAction JavaScript (DW6). */
function pdf(pages: string[][], pt = 10, js?: string, box: [number, number] = [595, 842]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objs: string[] = [`<< /Type /Catalog /Pages 2 0 R${js ? " /OpenAction 4 0 R" : ""} >>`, "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", js ? `<< /S /JavaScript /JS (${esc(js)}) >>` : "<< >>"];
  const kids: number[] = [];
  for (const lines of pages) {
    const content = ["BT", `/F1 ${pt} Tf`, "40 800 Td", `${pt + 3} TL`, ...lines.map((l) => `(${esc(l)}) '`), "ET"].join("\n");
    objs.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${box[0]} ${box[1]}] /Contents ${objs.length} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    kids.push(objs.length);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n"; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const SPEC = "SYNTHETIC SPECIMEN - MADE-UP TEST DOCUMENT - NOT VALID";
const THREE = pdf([1, 2, 3].map((n) => [SPEC, `Sample bank statement, page ${n} of 3`, ...Array.from({ length: 50 }, (_, i) => `Line ${i + 1}: Sample entry 100.00 CAD`)]));
const SCRIPTED = pdf([[SPEC, "Sample form with a script (DW6)"]], 10, "window.__csd5_ran = 1; app.alert('ran');");
const LONG = pdf(Array.from({ length: 200 }, (_, i) => [SPEC, `Sample long document, page ${i + 1} of 200`]));
const HUGE = pdf([[SPEC, "Sample scanner-app page, 2480 x 3508 pt"]], 10, undefined, [2480, 3508]);
const A4 = pdf([[SPEC, "Sample A4 letter in 9 pt print: Balance 12,345.67 CAD, account holder SAMPLE CLIENT A"]], 9);
// A 2 x 1 PNG (red, blue), so a quarter turn shows as a 1 x 2 picture.
const chunk = (type: string, data: Buffer) => { const t = Buffer.concat([Buffer.from(type, "latin1"), data]), n = Buffer.alloc(4), k = Buffer.alloc(4); n.writeUInt32BE(data.length); k.writeUInt32BE(crc32(t)); return Buffer.concat([n, t, k]); };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", Buffer.from([0, 0, 0, 2, 0, 0, 0, 1, 8, 2, 0, 0, 0])), chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 0, 0, 255]))), chunk("IEND", Buffer.alloc(0))]);

// ------------------------------------------------------------------------------------------------ setup (Sample)
const vvOf = () => sql("select id from combination where combination_key='vv.single'") || null;
if (!vvOf()) for (const f of ["tests/runtime/setup_visitor_visa.ts", "acceptance/lib/setup_vv_m3.ts"])
  try { execFileSync(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), join(STUDIO, f), String(PORT), DBNAME], { stdio: ["ignore", "ignore", "inherit"], timeout: 900_000 }); }
  catch { /* the setups exit 1 on their own known gaps; what this walk needs is asked below */ }
ok("CS-D5 setup: the Visitor visa is released on this copy", !!vvOf());
const c = await openCase(vvOf()!, FAMILY);
const A = c.subjects["Sample Client A"];
type Line = { id: string; state: string; version: number; documents: { id: string; file_name: string; sha256: string; current: boolean }[] };
const lines = async () => ((await call("GET", `/runtime/cases/${c.id}/checklist`, undefined, OFFICER)).body?.people as { subject: string; lines: Line[] }[]).find((p) => p.subject === A)!.lines;
const free = (await lines()).filter((l) => l.state === "not_requested");
ok("CS-D5 setup: Client A has three document lines not yet requested", free.length >= 3, free.length);
/** Stores a file on a line (a later upload replaces the line's current file). */
const put = async (l: Line, file: Buffer, name: string) => {
  const version = (await lines()).find((x) => x.id === l.id)!.version;
  const r = await upload(PORT, `/runtime/checklist-lines/${l.id}/documents`, file, name, OFFICER, { version: String(version) });
  const id = (await lines()).find((x) => x.id === l.id)!.documents.find((d) => d.current)?.id ?? "";
  ok(`CS-D5 setup: ${name} is stored on its line`, !!id, r.status); return id;
};
const [L1, L2, L3] = free;
const previewed = (doc: string) => Number(sql(`select count(*) from audit_event where action='previewed' and entity='case document' and entity_key='${doc}'`) ?? "-1");
// Named by the workspace key, never listed (a folder listing ties every acceptance pack to this check in the selector).
const fileOf = (doc: string) => { const rel = sql(`select path from case_document where id='${doc}'`); const p = rel ? join(STUDIO, "var", `isolated-${NAME}`, "workspaces", process.env.STUDIO_WORKSPACE_KEY?.trim() || "demo", rel) : null; return p && existsSync(p) ? p : null; };
const stored = (doc: string) => { const p = fileOf(doc); return p ? createHash("sha256").update(readFileSync(p)).digest("hex") : null; };

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* private window */ } }, c.officer);
  const page = await ctx.newPage();
  const dialogs: string[] = []; page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
  const net: string[] = []; page.on("request", (r) => { const u = new URL(r.url()).pathname; if (/preview-link|document-previews|\/documents\/[^/]+\/file/.test(u)) net.push(`${r.method()} ${u}`); });
  const panel = page.locator("[data-document-preview]");
  const row = (l: Line) => page.locator(`[data-line="${l.id}"]`);
  const go = async () => { await page.goto(`/cases/${c.id}`); await row(L1).waitFor({ timeout: 30_000 }); };
  const ready = async () => { await page.locator('[data-preview-state="ready"]').waitFor({ timeout: 20_000 }); await page.waitForFunction(() => !document.querySelector("[data-preview-area][aria-busy]") && (document.querySelector("[data-preview-canvas]") as HTMLCanvasElement | null)?.width! > 0, undefined, { timeout: 20_000 }); };
  const openFile = async (doc: string) => { net.length = 0; await page.locator(`[data-preview-open="${doc}"]`).click(); };
  const closePanel = async () => { await page.keyboard.press("Escape"); await panel.waitFor({ state: "detached", timeout: 10_000 }); };

  // W1 / BR-1 pass: the step before (the officer uploads a PDF on the line), then the file's name opens it.
  await go();
  await row(L1).locator("[data-upload-input]").setInputFiles({ name: "bank-statement-sample.pdf", mimeType: "application/pdf", buffer: THREE });
  await page.locator(`[data-line="${L1.id}"][data-state="received"]`).waitFor({ timeout: 30_000 });
  await row(L1).locator("[data-line-busy]").waitFor({ state: "detached", timeout: 30_000 });
  await page.waitForFunction((id) => document.activeElement?.closest(`[data-line="${id}"]`) && document.activeElement?.hasAttribute("data-line-menu"), L1.id, { timeout: 10_000 });
  const d1 = (await lines()).find((l) => l.id === L1.id)!.documents.find((d) => d.current)!.id, sha1 = stored(d1);
  const before = previewed(d1);
  await openFile(d1); await ready();
  ok("CS-D5 BR-1 pass: the stored PDF opens from its name on the line: page 1 of 3 drawn", (await page.locator("[data-preview-page]").textContent()) === "Page 1 of 3");
  ok("CS-D5 BR-1 pass: the panel says what the API says of the scan (\"Not scanned yet\"), never \"Checked: clean\"", (await page.getByText("Not scanned yet").count()) === 1 && (await page.getByText("Checked: clean").count()) === 0);
  ok("CS-D5 BR-1: header facts: type, size, upload day and the uploader", /^PDF · \d+ KB · Uploaded \d{1,2} \w{3} \d{4} by .+/.test((await page.locator("[data-preview-facts]").textContent()) ?? ""), await page.locator("[data-preview-facts]").textContent());
  ok("CS-D5 BR-2: one link request, then the bytes once from /document-previews/ (no download route)", net.length === 2 && /^POST .*\/documents\/[^/]+\/preview-link$/.test(net[0]!) && /^GET \/api\/runtime\/document-previews\/[^/]+$/.test(net[1]!), net);
  ok("CS-D5 BR-2: no <iframe>, <embed> or <object> anywhere in the page", (await page.locator("iframe, embed, object").count()) === 0);
  ok("CS-D5 BR-3 fail case: a plain PDF shows no \"Contains scripts\" warning", (await page.locator("[data-preview-scripts]").count()) === 0);
  await page.screenshot({ path: join(SHOTS, "w1-preview-1440.png") });
  // A4 measure: Fit width at 1440 px; 9 pt print height = canvas CSS width / 595 pt × 9.
  // BR-5: three page turns and a zoom read from memory.
  for (const k of ["next", "next", "prev"]) { await page.locator(`[data-preview-${k}]`).click(); await ready(); }
  await page.locator('[data-preview-zoom="200"]').click(); await ready();
  ok("CS-D5 BR-5 pass: after three page turns and a zoom, still one link and one fetch, and one \"previewed\" line", net.length === 2 && previewed(d1) === before + 1, [net, previewed(d1) - before]);
  const used = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/document-previews/")).pop() ?? "");
  const again = await page.evaluate(async (u) => (await fetch(u, { headers: { "x-actor": localStorage.getItem("xr-actor") ?? "" } })).status, used);
  ok("CS-D5 BR-5 fail: a second GET of the used link → 404 and no second line (single use)", again === 404 && previewed(d1) === before + 1, [again, previewed(d1) - before]);
  // BR-6: rotate, then reopen: upright, the file unchanged.
  await page.locator('[data-preview-zoom="fit"]').click(); await page.locator("[data-preview-rotate]").click(); await ready();
  const turned = await page.locator("[data-preview-canvas]").evaluate((e: HTMLCanvasElement) => e.width > e.height);
  ok("CS-D5 BR-6: Rotate turns the view (an A4 page drawn landscape)", turned && (await page.locator("[data-preview-canvas]").getAttribute("data-rotation")) === "90");
  await closePanel(); await openFile(d1); await ready();
  ok("CS-D5 BR-6 pass: closed and reopened, the page is upright on page 1 at Fit width", (await page.locator("[data-preview-canvas]").getAttribute("data-rotation")) === "0" && (await page.locator("[data-preview-page]").textContent()) === "Page 1 of 3" && (await page.locator('[data-preview-zoom="fit"]').getAttribute("aria-pressed")) === "true");
  ok("CS-D5 BR-6 fail check: the stored file's SHA-256 is unchanged by viewing", !!sha1 && stored(d1) === sha1, [sha1, stored(d1)]);
  ok("CS-D5 BR-8: no Accept and no Reject in the panel (Accept joins with CS-D1 part 2's route)", (await panel.getByRole("button", { name: /accept|reject/i }).count()) === 0);
  await closePanel();

  // BR-3 (DW6) and BR-4.
  const d2 = await put(L2, SCRIPTED, "form-with-script-sample.pdf");
  await go(); await openFile(d2); await ready();
  ok("CS-D5 BR-3 pass (DW6): the PDF with an /OpenAction script renders and its warning shows", await page.locator("[data-preview-scripts]").isVisible());
  await page.waitForTimeout(1000);
  ok("CS-D5 BR-3 pass (DW6): its script never ran: no marker in the page or its frames, no dialog", dialogs.length === 0 && (await Promise.all(page.frames().map((f) => f.evaluate(() => (window as unknown as { __csd5_ran?: number }).__csd5_ran ?? null).catch(() => null)))).every((x) => x === null), dialogs);
  await closePanel();
  const other = await page.evaluate(async (d) => { const r = await fetch(`/api/runtime/documents/${d}/preview-link`, { method: "POST", headers: { "x-actor": "user-S" } }); return [r.status, (await r.json().catch(() => ({}))).message]; }, d2);
  ok("CS-D5 BR-4: a person of another firm gets the download's 404 words for the link", other[0] === 404 && other[1] === "No such document.", other);

  // BR-1 fail (the race): the link answers 409 / 410: the requirement's words in the panel, no bytes fetched.
  for (const [status, words] of [[409, "Checking for viruses…"], [410, "Removed — infected file"]] as const) {
    await page.route("**/preview-link", (r) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify({ statusCode: status, message: words }) }));
    await openFile(d2);
    await page.locator('[data-preview-state="refused"]').waitFor({ timeout: 10_000 });
    ok(`CS-D5 BR-1 fail: a link answered ${status} shows "${words}" in the panel and no bytes are fetched`, (await panel.getByText(words).count()) === 1 && !net.some((n) => n.includes("/document-previews/")), net);
    await page.unroute("**/preview-link"); await closePanel();
  }

  // BR-7: the link is used up before the viewer's one fetch (as an expired one is refused): asked again once.
  const spoil = async (times: number) => {
    let n = 0;
    await page.route("**/document-previews/**", async (r) => { if (n++ < times) await fetch(`${BASE}${new URL(r.request().url()).pathname}`, { headers: { "x-actor": c.officer } }); await r.continue(); });
  };
  const d3 = await put(L3, PNG, "photo-sample.png");
  await go();
  let lines0 = previewed(d3); await spoil(1); await openFile(d3); await ready();
  ok("CS-D5 BR-7 pass: one refused fetch → one new link, the file opens (two links, two \"previewed\" lines)", net.filter((x) => x.includes("preview-link")).length === 2 && previewed(d3) === lines0 + 2, [net, previewed(d3) - lines0]);
  ok("CS-D5 BR-1 pass: a PNG opens too, with no page controls", (await page.locator("[data-preview-page]").count()) === 0 && /^PNG/.test((await page.locator("[data-preview-facts]").textContent()) ?? ""));
  await page.locator("[data-preview-rotate]").click(); await ready();
  ok("CS-D5 BR-6: an image turns too (2 x 1 drawn as 1 x 2)", await page.locator("[data-preview-canvas]").evaluate((e: HTMLCanvasElement) => e.height > e.width));
  await page.unroute("**/document-previews/**"); await closePanel();
  lines0 = previewed(d3); await spoil(2); await openFile(d3);
  await page.locator('[data-preview-state="refused"]').waitFor({ timeout: 10_000 });
  ok("CS-D5 BR-7 fail: refused twice → \"The file could not be opened…\", no third link", (await panel.locator("[data-preview-refused]").textContent())?.startsWith("The file could not be opened.") === true && net.filter((x) => x.includes("preview-link")).length === 2, net);
  await page.unroute("**/document-previews/**"); await closePanel();
  // Review M1: a file changed on disk since upload (the API's 409 in its own words) is "could not open", never the scan's state.
  const f3 = fileOf(d3); ok("CS-D5 setup: the stored PNG is found on this copy", !!f3); if (f3) appendFileSync(f3, Buffer.from([0]));
  await openFile(d3); await page.locator('[data-preview-state="refused"]').waitFor({ timeout: 10_000 });
  ok("CS-D5 BR-1 fail: the panel still names the file and its facts when it cannot be opened (break m4)", (await page.getByRole("heading", { name: "photo-sample.png" }).count()) === 1 && /^PNG · /.test((await page.locator("[data-preview-facts]").textContent()) ?? ""));
  ok("CS-D5 BR-1 fail: a file changed on disk shows \"The file could not be opened…\", not \"Checking for viruses…\", no Try again", (await panel.locator("[data-preview-refused]").textContent())?.startsWith("The file could not be opened.") === true && (await panel.getByText("Checking for viruses…").count()) === 0 && (await panel.getByRole("button", { name: "Try again" }).count()) === 0);
  await closePanel();

  // W1: the A4 bar at 1440 px, the 200-page fixture, keyboard only, axe, widths.
  const LONGNAME = `IMG_20261121_bank_statement_SAMPLE_CLIENT_A_${"scanned_at_branch_".repeat(8)}letter-a4-sample.pdf`;
  const d4 = await put(L2, A4, LONGNAME), d5 = await put(L3, LONG, "long-document-sample.pdf");
  await go(); await openFile(d4); await ready();
  const px = await page.locator("[data-preview-canvas]").evaluate((e: HTMLCanvasElement) => (parseFloat(e.style.width) / 595) * 9);
  ok("CS-D5 W1: at 1440 px, 9 pt print on an A4 page draws at least 11 px tall at Fit width", px >= 11, px.toFixed(2));
  await closePanel();
  await openFile(d5); await ready();
  for (let i = 1; i < 149; i++) await page.locator("[data-preview-next]").click();
  await ready();
  const t0 = Date.now(); await page.locator("[data-preview-next]").click();
  const answered = await page.locator('[data-preview-zoom="100"]').click({ timeout: 2_000 }).then(() => true, () => false);
  await page.waitForFunction(() => document.querySelector("[data-preview-page]")?.textContent === "Page 150 of 200" && !document.querySelector("[data-preview-area][aria-busy]"), undefined, { timeout: 5_000 });
  const ms = Date.now() - t0;
  ok("CS-D5 W1: page 150 of 200 is drawn within 2 s of Next page, and the toolbar answers a click meanwhile", ms <= 2000 && answered, ms);
  await page.locator("[data-preview-next]").dblclick(); await ready();
  ok("CS-D5 W1: two quick clicks on Next turn two pages and never break the panel (break m1)", (await page.locator("[data-preview-page]").textContent()) === "Page 152 of 200" && (await page.locator('[data-preview-state="ready"]').count()) === 1, await page.locator("[data-preview-page]").textContent());
  await closePanel();
  // Break M1: a very large page at 200% is drawn into a canvas of at most 2^25 pixels (Mozilla's viewer's cap).
  const d6 = await put(L3, HUGE, "scanner-app-page-sample.pdf");
  await go(); await openFile(d6); await ready(); await page.locator('[data-preview-zoom="200"]').click(); await ready();
  const px2 = await page.locator("[data-preview-canvas]").evaluate((e: HTMLCanvasElement) => [e.width * e.height, parseFloat(e.style.width)]);
  ok("CS-D5 W1: a 2480 x 3508 pt page at 200% draws at full CSS size into at most 2^25 canvas pixels", px2[0]! <= 2 ** 25 && px2[1]! > 6000, px2);
  await closePanel();
  // Keyboard only, from the line's file name (the start point is focused; everything in the panel is reached by Tab).
  const tabTo = async (sel: string) => { for (let i = 0; i < 25; i++) { if (await page.evaluate((q) => !!document.activeElement?.matches(q), sel)) return true; await page.keyboard.press("Tab"); } return false; };
  await page.locator(`[data-preview-open="${d1}"]`).focus(); await page.keyboard.press("Enter"); await ready();
  const area = page.locator("[data-preview-area]");
  const tabbed = await tabTo('[data-preview-zoom="200"]'); await page.keyboard.press("Enter"); await ready();
  ok("CS-D5 W1: Tab reaches the zoom control inside the panel", tabbed);
  ok("CS-D5 W1: Tab reaches the page area", await tabTo("[data-preview-area]"));
  await page.keyboard.press("PageDown"); await page.waitForTimeout(200);
  const stillOne = (await page.locator("[data-preview-page]").textContent()) === "Page 1 of 3";
  for (let i = 0; i < 30 && (await page.locator("[data-preview-page]").textContent()) === "Page 1 of 3"; i++) { await page.keyboard.press("PageDown"); await page.waitForTimeout(100); }
  await ready();
  ok("CS-D5 W1: PageDown scrolls the page area first, and turns to page 2 only at its bottom", stillOne && (await page.locator("[data-preview-page]").textContent()) === "Page 2 of 3");
  ok("CS-D5 W1: Tab (from the page area round the panel) reaches Rotate", await tabTo("[data-preview-rotate]")); await page.keyboard.press("Enter"); await ready();
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  ok("CS-D5 W1: axe finds no serious or critical WCAG A/AA violation in the panel", axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").length === 0, axe.violations.map((v) => `${v.id}:${v.impact}`));
  await page.keyboard.press("Escape"); await panel.waitFor({ state: "detached" });
  const back = await page.waitForFunction((d) => document.activeElement?.getAttribute("data-preview-open") === d, d1, { timeout: 5_000 }).then(() => true, () => false);
  ok("CS-D5 W1: keyboard only: open, zoom, page, rotate, Escape; focus back on the file's name", back, await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
  // Widths: no sideways page scroll; at 1024 px and 200% only the page area scrolls.
  const fit = async (p: Page, w: number) => {
    await p.setViewportSize({ width: w, height: w < 600 ? 812 : 800 }); await p.locator(`[data-preview-open="${d4}"]`).click(); await ready();
    if (w === 1024) { await p.locator('[data-preview-zoom="200"]').click(); await ready(); }
    const m = await p.evaluate(() => { const a = document.querySelector("[data-preview-area]")!, body = a.closest('[role="dialog"]')!.querySelector(".overflow-y-auto")!; const d = a.closest('[role="dialog"]')!.getBoundingClientRect(), t = a.closest('[role="dialog"]')!.querySelector("h2")!.getBoundingClientRect(); return { title: t.right <= d.right + 1 && t.height > 30, page: document.documentElement.scrollWidth <= innerWidth + 1, area: a.scrollWidth > a.clientWidth, body: body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1 }; });
    await p.screenshot({ path: join(SHOTS, `w1-preview-${w}.png`) }); await closePanel(); return m;
  };
  for (const w of [375, 1024, 1440]) {
    const m = await fit(page, w);
    ok(`CS-D5 W1: at ${w} px the page has no sideways scroll and the panel body does not scroll (only the page area)`, m.page && m.body, m);
    ok(`CS-D5 W1: at ${w} px a long file name wraps inside the panel header (review M4)`, m.title, m);
    if (w === 1024) ok("CS-D5 W1: at 1024 px and 200% the page area scrolls sideways (the 9 pt print readable by zoom)", m.area, m);
  }
  ok("CS-D5 end: back on the line, where the next step (deciding on the file) starts", await row(L1).isVisible());
} finally {
  await browser.close();
}
process.exit(rec.summary() ? 1 : 0);
