// J-68 (map row 68, R1.68: "Preview for staff review"), written by the qa lane (qa 10, 24 Nov) on CS-D5 part 2's head
// (#3500, b9612365c) before it merges, so qa only has to run it when it does. Persona: the Sample firm's case officer,
// who opens a client's uploaded file from its checklist line and reads it beside the case without downloading it; on an
// isolated copy of the running app (its own database and port, never :4400), by screens, and on the routes and the
// database underneath.
// Done when (CAPABILITIES R1.68, "Staff preview an uploaded document without downloading it"; CS-D5's row, as tests):
//   W1 the officer clicks the file's name on its line (a button "Preview <name>", CS-D5 part 2): a panel beside the case
//      shows the file's name as its heading, its type, size and upload date, and draws page 1 of 3 on a canvas (dark
//      pixels, not a blank page); a file with no scan yet says "Not scanned yet", never "Checked: clean".
//   W2 "without downloading it": the browser asked for one preview link (POST /api/runtime/documents/:id/preview-link)
//      and fetched bytes only from /api/runtime/document-previews/; never the download route (/documents/:id/file); no
//      download began; no <iframe>, <embed> or <object> holds the file.
//   W3 the opening writes one "previewed" line naming the officer and the document (CS-D6's one trail), and no
//      "viewed" line; turning pages, zooming and rotating write none.
//   W4 view only: Next page shows "Page 2 of 3", Previous back to 1; Zoom 200% and Rotate redraw the page; Close
//      returns focus to the file's name; the stored file's SHA-256 is unchanged.
//   W5 the link (CS-D5 part 1, #3188, merged): served inline with nosniff and the CSP sandbox, no firm or person name in
//      the URL; used once (a second fetch 404); another firm's staff asking it 404; the case's client 403 or 404 asking
//      for a link, as for the download.
//   W6 keyboard only: Tab to the file's name, Enter opens, Escape closes, focus back on the name.
//   W7 400, 1024 and 1440 px with the panel open: nothing cut off sideways, axe clean; no page error.
//   W8 the walk ends at R1.69's first step: the line's ⋯ → "File details…" shows "Read by" with the officer's
//      preview in words ("Previewed"), where R1.69's read log continues.
// Fails on main today only where CS-D5 part 2 is not merged (P-606): each failing label names it. Not walked (said):
// "Checking for viruses…" and "Removed — infected file" (case files have no scan state until PF-F3, R1.66) and a PDF
// whose script must not run (the builder's check_csd5_preview_browser.ts proves it on the same head). Sample values
// only; US$0, no model call, live AI off. Screenshots: product/screens/J-68/screenshots/.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed):
//   zsh studio/tools/isolated.sh j68 4476 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j68 4476 stop' EXIT && npx --prefix studio tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_68.ts j68 4476
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j68", Number(process.argv[3] ?? 4476)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-68", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { call } = client(PORT, DBNAME);
const PSQL = ["/opt/homebrew/opt/postgresql@18/bin/psql", "/usr/local/bin/psql", "/usr/bin/psql"].find((p) => existsSync(p)) ?? "psql";
const sql = (q: string) => execFileSync(PSQL, [`postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, "-X", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n")[0].trim();
const run = Date.now().toString(36);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const OFFICER = "user-O", REP = "user-R", CLIENT = "user-P", OTHER_FIRM = "user-S";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });

// A three-page Sample PDF (text only; no script): page turning needs more than one page.
function pdf(pages: string[][]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objs: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kids: number[] = [];
  for (const lines of pages) {
    const content = ["BT", "/F1 12 Tf", "40 800 Td", "15 TL", ...lines.map((l) => `(${esc(l)}) '`), "ET"].join("\n");
    objs.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${objs.length} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
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
const BYTES = new Uint8Array(pdf([1, 2, 3].map((n) => [SPEC, `Sample bank statement (J-68 ${run}), page ${n} of 3`, ...Array.from({ length: 40 }, (_, i) => `Line ${i + 1}: Sample entry 100.00 CAD`)])));
const FILE = "bank-statements.pdf";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const vv = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id and r.status = 'RELEASED')`);
if (!vv()) await call("POST", "/demo/load", { sample: "configured" }, "user-A");
const VV = vv();
const caseA = (await call("POST", "/runtime/cases", { combinationId: VV, reference: `J68-${run}`, clientActor: CLIENT, principal: { displayName: `Sample Client J68 ${run}` }, representative: REP, caseOfficers: [OFFICER] }, OFFICER)).body?.id as string | undefined;
type Line = { id: string; state: string };
const lines = ((await call("GET", `/runtime/cases/${caseA}/checklist`, undefined, OFFICER)).body?.people as { lines: Line[] }[] | undefined)?.[0]?.lines ?? [];
const line = lines.find((l) => l.state === "not_requested");
const fd = new FormData(); fd.append("file", new Blob([BYTES as Uint8Array<ArrayBuffer>]), FILE);
const up = line ? await fetch(`${BASE}/api/runtime/checklist-lines/${line.id}/documents`, { method: "POST", headers: { "x-actor": OFFICER }, body: fd }) : null;
const doc = ((await up?.json().catch(() => null)) as { document?: { id: string; sha256: string } } | null)?.document;
ok("J-68 setup: the Visitor visa is released; a case of the Sample firm with a document line; the officer uploads a three-page Sample PDF, stored with its fingerprint",
  !!VV && !!caseA && !!line && up?.status === 201 && !!doc?.id && doc.sha256 === sha(BYTES), { VV, caseA, line: line?.id, upload: up?.status });
const docId = doc?.id ?? "00000000-0000-0000-0000-000000000000";
const count = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}' and entity = 'case document' and entity_key = '${docId}'`));
const fileOf = () => execFileSync("find", [join(STUDIO, "var", `isolated-${NAME}`), "-type", "f", "-path", `*/${sql(`select path from case_document where id = '${docId}'`)}`], { encoding: "utf8" }).trim().split("\n").filter(Boolean)[0] ?? "";

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
try {
  // ---------------------------------------------------------------------------------------------- W1 open from the line
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true });
  await ctx.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* private window */ } }, OFFICER);
  const p: Page = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  const asked: string[] = []; let downloads = 0;
  p.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/runtime/document")) asked.push(`${r.method()} ${u.pathname}`); });
  p.on("download", () => { downloads++; });
  const row = p.locator(`[data-line="${line?.id}"]`);
  await p.goto(`/cases/${caseA}`);
  await row.filter({ hasText: FILE }).waitFor({ timeout: 30_000 }).catch(() => undefined);
  const name = row.getByRole("button", { name: `Preview ${FILE}` });
  const hasName = (await name.count()) === 1;
  const viewed0 = count("viewed"), previewed0 = count("previewed");
  if (hasName) await name.click();
  const region = p.getByRole("region").filter({ has: p.getByRole("heading", { name: FILE }) });
  const shown = hasName && await region.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const canvas = region.locator("canvas").first();
  await p.waitForFunction(() => { const c = document.querySelector("[data-document-preview] canvas, [role=region] canvas") as HTMLCanvasElement | null; return !!c && c.width > 0; }, undefined, { timeout: 15_000 }).catch(() => undefined);
  await p.waitForTimeout(500);
  const dark = shown ? await canvas.evaluate((c: HTMLCanvasElement) => { const x = c.getContext("2d"); if (!x || !c.width) return 0; const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 300 && d[i + 3] > 0) n++; return n; }).catch(() => 0) : 0;
  const regionText = shown ? (await region.innerText()).replace(/\s+/g, " ") : "";
  await p.screenshot({ path: join(SHOTS, "w1-preview-1440.png") }).catch(() => undefined);
  ok("J-68 W1 (part missing: CS-D5 part 2): the officer clicks the file's name on its line (\"Preview bank-statements.pdf\") and a panel beside the case shows the name as its heading, type, size and upload date, and draws page 1 of 3 (dark pixels on the canvas)",
    shown && /PDF/i.test(regionText) && /KB|MB|bytes/i.test(regionText) && /Uploaded/i.test(regionText) && /Page 1 of 3/.test(regionText) && dark > 200, { button: hasName, panel: shown, dark, text: regionText.slice(0, 220) });
  ok("J-68 W1 fail (part missing: CS-D5 part 2): a file with no scan yet says \"Not scanned yet\" and never \"Checked: clean\" (PF-F3 is R1.66's part)", shown && /Not scanned yet/.test(regionText) && !/Checked: clean/.test(regionText), { text: regionText.slice(0, 220) });

  // ---------------------------------------------------------------------------------------------- W2 without downloading it
  const links = asked.filter((a) => a === `POST /api/runtime/documents/${docId}/preview-link`).length, bytesReq = asked.filter((a) => a.startsWith("GET /api/runtime/document-previews/")).length;
  const downloadReq = asked.filter((a) => a.includes(`/documents/${docId}/file`)).length, frames = await p.locator("iframe, embed, object").count();
  ok("J-68 W2 (part missing: CS-D5 part 2): without downloading it: one preview link asked, bytes fetched only from /document-previews/, never the download route, no download began, no iframe, embed or object",
    shown && links === 1 && bytesReq === 1 && downloadReq === 0 && downloads === 0 && frames === 0, { asked, downloads, frames });

  // ---------------------------------------------------------------------------------------------- W3 one "previewed" line
  const pv = sql(`select coalesce(string_agg(actor || '|' || entity_key, ';'), '') from audit_event where action = 'previewed' and entity = 'case document' and entity_key = '${docId}'`);
  ok("J-68 W3 (part missing: CS-D5 part 2): the opening writes one \"previewed\" line naming the officer and the document, and no \"viewed\" line",
    shown && count("previewed") === previewed0 + 1 && pv === `${OFFICER}|${docId}` && count("viewed") === viewed0, { previewed: [previewed0, count("previewed")], viewed: [viewed0, count("viewed")], pv });

  // ---------------------------------------------------------------------------------------------- W4 view only
  const pageWords = async () => (await region.innerText().catch(() => "")).match(/Page \d+ of \d+/)?.[0] ?? "";
  const shot = async () => canvas.evaluate((c: HTMLCanvasElement) => `${c.width}x${c.height}`).catch(() => "");
  let paged = "", back = "", sized: string[] = [], focusBack = false;
  if (shown) {
    await region.getByRole("button", { name: "Next page" }).click(); await p.waitForTimeout(400); paged = await pageWords();
    await region.getByRole("button", { name: "Previous page" }).click(); await p.waitForTimeout(400); back = await pageWords();
    const s0 = await shot();
    const zoom = region.getByRole("group", { name: "Zoom" }).getByRole("button", { name: /200/ });
    if (await zoom.count()) { await zoom.first().click(); await p.waitForTimeout(500); }
    const s1 = await shot();
    await region.getByRole("button", { name: "Rotate" }).click(); await p.waitForTimeout(500);
    sized = [s0, s1, await shot()];
    await p.screenshot({ path: join(SHOTS, "w4-zoom-rotate-1440.png") }).catch(() => undefined);
    await region.getByRole("button", { name: "Close" }).click();
    await region.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
    focusBack = await p.evaluate((n) => document.activeElement?.getAttribute("aria-label") === n, `Preview ${FILE}`);
  }
  const fp = fileOf(), onDisk = fp ? sha(new Uint8Array(readFileSync(fp))) : "";
  ok("J-68 W4 (part missing: CS-D5 part 2): view only: Next page shows Page 2 of 3 and Previous Page 1 of 3; Zoom 200% and Rotate redraw the page (its size changes each time); turning, zooming and rotating write no more lines",
    paged === "Page 2 of 3" && back === "Page 1 of 3" && sized.length === 3 && !!sized[0] && sized[0] !== sized[1] && sized[1] !== sized[2] && count("previewed") === previewed0 + 1, { paged, back, sized, previewed: count("previewed") });
  ok("J-68 W4 (part missing: CS-D5 part 2): Close returns focus to the file's name; the stored file is unchanged (its SHA-256 is the upload's)", focusBack && onDisk === sha(BYTES), { focusBack, same: onDisk === sha(BYTES) });

  // ---------------------------------------------------------------------------------------------- W5 the link (part 1, merged)
  const mint = async (actor: string) => { const r = await fetch(`${BASE}/api/runtime/documents/${docId}/preview-link`, { method: "POST", headers: { "x-actor": actor } }); return { status: r.status, body: (await r.json().catch(() => null)) as { url?: string } | null }; };
  const L = await mint(OFFICER);
  const get = (url: string, actor: string) => fetch(`${BASE}${url}`, { headers: { "x-actor": actor } });
  const other = L.body?.url ? await get(L.body.url, OTHER_FIRM) : null;
  const first = L.body?.url ? await get(L.body.url, OFFICER) : null;
  const firstBytes = first ? new Uint8Array(await first.arrayBuffer()) : new Uint8Array();
  const again = L.body?.url ? await get(L.body.url, OFFICER) : null;
  const h = (k: string) => first?.headers.get(k) ?? "";
  const nameless = !!L.body?.url && !/sample|client|j68|bank|statement/i.test(L.body.url);
  ok("J-68 W5 (CS-D5 part 1, #3188, on main): the link is served inline with nosniff and the CSP sandbox, the file's own bytes, with no firm or person name in its URL",
    L.status === 200 && first?.status === 200 && /^inline/i.test(h("content-disposition")) && h("x-content-type-options") === "nosniff" && /sandbox/.test(h("content-security-policy")) && sha(firstBytes) === sha(BYTES) && nameless,
    { mint: L.status, first: first?.status, cd: h("content-disposition"), csp: h("content-security-policy"), nameless });
  const byClient = await mint(CLIENT);
  ok("J-68 W5 fail (CS-D5 part 1, on main): another firm's staff asking the link get 404; the link works once (a second fetch 404); the case's client is refused a link (403 or 404, as for the download)",
    other?.status === 404 && again?.status === 404 && [403, 404].includes(byClient.status), { other: other?.status, again: again?.status, client: byClient.status });

  // ---------------------------------------------------------------------------------------------- W6 keyboard only
  let kbOpen = false, kbBack = false;
  if (hasName) {
    await p.goto(`/cases/${caseA}`); await row.filter({ hasText: FILE }).waitFor({ timeout: 30_000 }).catch(() => undefined);
    for (let i = 0; i < 200; i++) { await p.keyboard.press("Tab"); if (await p.evaluate((n) => document.activeElement?.getAttribute("aria-label") === n, `Preview ${FILE}`)) break; }
    await p.keyboard.press("Enter");
    kbOpen = await region.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    await p.keyboard.press("Escape"); await region.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
    kbBack = (await region.count()) === 0 && await p.evaluate((n) => document.activeElement?.getAttribute("aria-label") === n, `Preview ${FILE}`);
  }
  ok("J-68 W6 (part missing: CS-D5 part 2): keyboard only: Tab reaches the file's name, Enter opens the preview, Escape closes it and focus is back on the name", kbOpen && kbBack, { kbOpen, kbBack });

  // ---------------------------------------------------------------------------------------------- W7 sizes, axe
  for (const w of [400, 1024, 1440]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.goto(`/cases/${caseA}`); await row.filter({ hasText: FILE }).waitFor({ timeout: 30_000 }).catch(() => undefined);
    const open = hasName && await name.click().then(() => region.waitFor({ timeout: 15_000 })).then(() => true, () => false);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const axe = open ? (await new AxeBuilder({ page: p }).include("[role=region]").withTags(TAGS).analyze()).violations.map((v) => `${v.id}(${v.nodes.length})`) : ["no panel"];
    await p.screenshot({ path: join(SHOTS, `w7-preview-${w}.png`) }).catch(() => undefined);
    ok(`J-68 W7 (part missing: CS-D5 part 2): the preview open at ${w} px: nothing cut off sideways, axe clean on the panel`, open && wide <= 0 && axe.length === 0, { wide, axe });
  }
  ok("J-68 W7: no page error in the browser", errors.length === 0, errors.slice(0, 5));

  // ---------------------------------------------------------------------------------------------- W8 R1.69's first step
  await p.setViewportSize({ width: 1440, height: 900 });
  await ctx.addInitScript((a) => { try { localStorage.setItem("xr-actor", a); } catch { /* private window */ } }, REP);
  await p.goto(`/cases/${caseA}`); await row.filter({ hasText: FILE }).waitFor({ timeout: 30_000 }).catch(() => undefined);
  const dialog = p.getByRole("dialog");
  await row.locator("[data-line-menu]").first().click().catch(() => undefined); await p.locator('[data-action="file-details"]').click().catch(() => undefined);
  await dialog.locator("[data-document-reads], [data-sign-in-card]").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  if (await dialog.locator("[data-sign-in-card]").isVisible().catch(() => false)) {
    await dialog.getByLabel("Firm key").fill("sample-firm"); await dialog.getByLabel("Work email").fill(sql(`select email from platform_staff where actor_id = '${REP}'`));
    await dialog.getByRole("button", { name: "Sign in" }).click();
  }
  const reads = await dialog.locator("[data-read-lines]").waitFor({ timeout: 30_000 }).then(() => dialog.locator("[data-read-lines] li").allInnerTexts(), () => [] as string[]);
  await p.screenshot({ path: join(SHOTS, "w8-file-details-read-by-1440.png") }).catch(() => undefined);
  ok("J-68 W8 (part missing: CS-D5 part 2): the walk ends at R1.69's first step: the line's File details shows \"Read by\" with the officer's preview in words (Case officer · Previewed)",
    reads.some((l) => /Case officer/.test(l) && /Previewed/i.test(l)), { reads: reads.slice(0, 5) });
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
