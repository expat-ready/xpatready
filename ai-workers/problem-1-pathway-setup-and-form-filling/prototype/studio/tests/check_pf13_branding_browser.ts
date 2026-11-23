// PF-13 part 2 (concept screens/PF-13, challenged; AG-1-6, AG-1-9, AG-16-2; P-574 (1); R1.23 "firm logo, colour, favicon"):
// My account → Branding walked in a browser on an isolated copy (its own database and port, never :4400), with the API and the
// database read underneath. Each line has a pass and a fail:
//   DW6a the preview changes before Save and nothing is stored (no request leaves, the API read and the audit are unchanged);
//        fail: after Save the read has the values and the audit has one line per changed key;
//   DW6b a colour failing contrast is refused on the field with its ratio, in the server's words, and Save sends nothing; the
//        preview keeps the last acceptable colour; the page's ratio and the server's agree on a list of colours; fail: a passing
//        colour is accepted;
//   DW6c an SVG with a script is refused when chosen (also when named .png), never drawn, its script never runs; the API refuses
//        it (415); the page's file check and the server's walkImage agree on a list of files (challenge M2); fail: a PNG is taken;
//   DW6d a 6 MB logo is refused with "2 MB" when chosen and by the API (413); exactly 2 MB is taken, 2 MB + 1 byte and a favicon
//        of 256 KB + 1 byte are refused (challenge m5);
//   DW6e only Owner and Admin: the Case Officer has no Branding entry and by address sees the plain refusal, no values;
//   DW6f Remove and Discard: a removal shows in the preview and is not stored; Discard puts the form back; Remove + Save stores it;
//   DW6g a partial save (challenge M1): the server refuses the logo after the colour saved → "Saved: brand colour. Not saved:
//        logo.", the read has the colour, the logo is still marked changed, the next Save sends only the logo; an answer that
//        never arrives → "Could not confirm every change; the form shows what is stored now.";
//   DW6h (break report and review, round 1) no field is open while a Save is on its way (an edit made then was thrown away);
//        "Nothing to discard."; a colour pasted with spaces; a very long file name wraps; a refusal is tied to its button; a failed
//        read after Save keeps the form and says so;
//   DW7  keyboard only (Tab to the fields and Save, Enter saves, focus lands on the field in error), axe-core clean (WCAG 2.2
//        A/AA) in every state, 375, 1024 and 1440 px with no sideways scroll; fail: the same axe run finds a planted unlabelled button.
// Sample firms only, on a fresh copy. US$0, no model call; live AI off.
// Screenshots (deviceScaleFactor 1) in product/screens/PF-13/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh pf13s 4441 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf13_branding_browser.ts 4441 xr_studio_pf13s
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
import { contrastOnWhite as serverContrast, ratioWords as serverRatio } from "../api/src/platform/branding/branding.ts";
import { IMAGE_LIMITS as SERVER_LIMITS } from "../api/src/platform/branding/image-setting.ts";
import { walkImage } from "../api/src/platform/branding/image-walk.ts";
import { ACCOUNT_SECTIONS, visibleSections } from "../web/src/modules/platform/account-sections.ts";
import { colourProblem, contrastOnWhite, fileProblem, IMAGE_LIMITS, ratioWords } from "../web/src/modules/platform/branding/contract.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4441), process.argv[3] ?? "xr_studio_pf13s"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-13", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const upload = async (t: string, kind: string, bytes: Uint8Array, name: string, type: string): Promise<Ans> => {
  const form = new FormData(); form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
  const r = await fetch(`${BASE}/api/platform/branding/${kind}`, { method: "PUT", headers: { authorization: `Bearer ${t}` }, body: form });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const signIn = async (firmKey: string, who: { actorId?: string; email?: string }): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, ...who, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${JSON.stringify(who)} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};

// ------------------------------------------------------------------------------------------------ fixtures (built here)
const fx = (f: string) => new Uint8Array(readFileSync(join(STUDIO, "tests", "fixtures", "file-types", f)));
const PNG = fx("sample.png"), JPG = fx("sample.jpg");
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const enc = (s: string) => new TextEncoder().encode(s);
const pngChunk = (type: string, data: Uint8Array) => { const head = new Uint8Array(8); new DataView(head.buffer).setUint32(0, data.length); head.set(enc(type), 4); const crc = new Uint8Array(4); new DataView(crc.buffer).setUint32(0, crc32(cat(enc(type), data)) >>> 0); return cat(head, data, crc); };
/** A valid PNG of exactly n bytes: an unknown ancillary chunk pads it after IHDR (the server's walk drops it). */
const pngOfSize = (n: number) => cat(PNG.subarray(0, 33), pngChunk("zzPd", new Uint8Array(n - PNG.length - 12)), PNG.subarray(33));
/** The sample PNG with its header rewritten to declare w × h (its CRC redone): a pixel bomb's header on a small file. */
const pngDeclaring = (w: number, h: number) => { const ihdr = PNG.slice(16, 29); new DataView(ihdr.buffer).setUint32(0, w); new DataView(ihdr.buffer).setUint32(4, h); return cat(PNG.subarray(0, 8), pngChunk("IHDR", ihdr), PNG.subarray(33)); };
/** The sample JPEG with its frame marker made arithmetic-coded (SOF9). */
const jpgArithmetic = () => { const b = JPG.slice(); for (let i = 2; i < b.length - 1; i++) if (b[i] === 0xff && [0xc0, 0xc1, 0xc2].includes(b[i + 1])) { b[i + 1] = 0xc9; break; } return b; };
const SVG = enc(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>window.__pf13_ran = 1</script><rect width="64" height="64" fill="red" onload="window.__pf13_ran = 1"/></svg>`);
const MB = 1024 * 1024, KB = 1024;
const file = (name: string, mimeType: string, bytes: Uint8Array) => ({ name, mimeType, buffer: Buffer.from(bytes) });

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start; this only waits for it
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const lines = () => Number(sql(`select count(*) from audit_event where entity = 'platform_firm_setting' and entity_key like '${A}:platform.branding.%'`));
if (lines() !== 0) { console.error("STOP  sample-firm already has branding changes: start a fresh isolated copy (isolated.sh <name> <port> stop, then start)"); process.exit(2); }
const TOWNER = await signIn("sample-firm", { actorId: "user-R" }), TOFF = await signIn("sample-firm", { actorId: "user-O" });
const bStaff = sql(`select email from platform_staff where firm_id = '${B}' and status = 'ACTIVE' order by created_at limit 1`);
const TB = await signIn("sample-solo", { email: bStaff });
const FIRM = (await api(null, "GET", "/public/firms/sample-firm/branding")).body?.name as string;
const read = async (t = TOWNER) => (await api(t, "GET", "/platform/branding")).body;
const first = await read();
ok("PF-13 setup: the Sample firms, the Owner (user-R) and the Case Officer (user-O) signed in; firm A's branding is not set (neutral colour, no images, no audit line)",
  !!A && !!B && !!FIRM && first?.colour === null && first?.senderName === null && first?.images?.logo === null && typeof first?.neutral?.colour === "string", { FIRM, first });
const NEUTRAL = first.neutral.colour as string;
const LOW = colourProblem("#ffcc00") ?? "";   // "Contrast 1.5:1 on white; at least 4.5:1 is needed."

// ------------------------------------------------------------------------------------------------ pure parity (no browser)
const COLOURS = ["#000000", "#1f4e79", "#767676", "#777777", "#ffcc00", "#ffffff", "#0b6e4f", "#e63946", "#959595", "#595959"];
ok("R1.23 PF-13 DW6b: the page's contrast ratio and its words are the server's for ten colours (4.47:1 is never shown as 4.5)",
  COLOURS.every((c) => contrastOnWhite(c) === serverContrast(c) && ratioWords(contrastOnWhite(c)) === serverRatio(serverContrast(c))) && ratioWords(contrastOnWhite("#777777")) === "4.47:1" && colourProblem("#777777") === "Contrast 4.47:1 on white; at least 4.5:1 is needed." && colourProblem("#767676") === null);
ok("R1.23 PF-13 DW6d: the page's size limits are the server's (logo 2 MB, favicon 256 KB, banner 2 MB)", JSON.stringify(IMAGE_LIMITS) === JSON.stringify(SERVER_LIMITS), IMAGE_LIMITS);
const FILES: [string, Uint8Array][] = [["a good PNG", PNG], ["a good JPEG", JPG], ["a PNG cut short", PNG.subarray(0, PNG.length - 20)], ["a JPEG cut short", JPG.subarray(0, JPG.length - 40)],
  ["a PNG declaring 20,000 × 20,000", pngDeclaring(20000, 20000)], ["a PNG declaring 70,000 wide", pngDeclaring(70000, 10)], ["an arithmetic-coded JPEG", jpgArithmetic()], ["an SVG with a script", SVG], ["text", enc("hello")]];
const both = FILES.map(([name, b]) => ({ name, page: fileProblem("logo", b.length, b) === null, server: walkImage(b).ok }));
ok("R1.23 PF-13 DW6c (challenge M2): the page's file check and the server's walkImage give the same yes or no for nine files (two good; cut short, oversized header, arithmetic JPEG, SVG and text refused)",
  both.every((x) => x.page === x.server) && both.filter((x) => x.page).length === 2, both.filter((x) => x.page !== x.server));

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const open = async (p: Page) => { await p.goto(`${BASE}/platform/branding`); await p.locator("[data-branding-form], [data-branding-refused], [data-branding-error]").first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `pf13-${name}.png`), fullPage: true });
const axe = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const ids = (v: { id: string; nodes: { target: unknown }[] }[]) => v.map((x) => `${x.id}: ${x.nodes[0]?.target}`);
const reach = async (p: Page, target: Locator, max = 80) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
const menuHas = (p: Page) => p.locator('nav[aria-label="My account"] [data-account-section="/platform/branding"]').count();
const said = async (p: Page, text: string | RegExp) => { await p.locator("[data-branding-said-text]").filter({ hasText: text }).waitFor({ timeout: 30_000 }); return p.locator("[data-branding-said-text]").innerText(); };
const previewColour = (p: Page) => p.locator("[data-branding-preview]").getAttribute("data-preview-colour");
const choose = (p: Page, kind: string, f: ReturnType<typeof file>) => p.locator(`[data-image-input="${kind}"]`).setInputFiles(f);
const imageError = async (p: Page, kind: string) => { await p.locator(`[data-image-error="${kind}"]`).waitFor({ timeout: 15_000 }); return p.locator(`[data-image-error="${kind}"]`).innerText(); };
const state = async (p: Page, kind: string, text: string | RegExp) => { await p.locator(`[data-image-state="${kind}"]`).filter({ hasText: text }).waitFor({ timeout: 15_000 }); };

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- DW6e
  const po = await tab(TOFF); await open(po);
  const officerKeys = (await api(TOFF, "GET", "/platform/me")).body.keys as string[];
  ok("R1.23 PF-13 DW6e: the Case Officer has no Branding entry; by address the page says \"Only an Owner or Admin can change the firm's branding.\" with no form, no preview and no values; their PUT is 403",
    await menuHas(po) === 0 && !visibleSections(ACCOUNT_SECTIONS, officerKeys).some((s) => s.path === "/platform/branding") && (await po.locator("[data-branding-refused]").innerText()) === "Only an Owner or Admin can change the firm's branding."
      && await po.locator("[data-branding-form], [data-branding-preview]").count() === 0 && (await api(TOFF, "PUT", "/platform/branding", { colour: "#0b6e4f" })).status === 403);
  const vRefused = await axe(po); ok("R1.23 PF-13 DW7: the refusal has no WCAG 2.2 A/AA violation", vRefused.length === 0, ids(vRefused));
  await shot(po, "1-refused-case-officer-1440"); await po.context().close();

  // ---------------------------------------------------------------------------------------------- DW6a
  const p = await tab(TOWNER);
  const writes: string[] = [];
  p.on("request", (r) => { if (r.method() !== "GET" && r.url().includes("/api/")) writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await open(p); await p.locator("[data-preview-sender]").filter({ hasText: FIRM }).waitFor({ timeout: 15_000 });
  ok("R1.23 PF-13 DW6e fail: the Owner has the Branding entry and the form; not set, the preview shows the neutral colour, the firm's name as the sender and no logo",
    await menuHas(p) === 1 && await previewColour(p) === NEUTRAL && (await p.locator("[data-preview-sender]").innerText()) === FIRM && await p.locator("[data-preview-logo]").count() === 0, { colour: await previewColour(p) });
  const vClean = await axe(p); ok("R1.23 PF-13 DW7: the page not yet set has no WCAG 2.2 A/AA violation", vClean.length === 0, ids(vClean));
  await shot(p, "2-not-set-1440");
  await p.locator("[data-colour-text]").fill("#0B6E4F");
  await p.locator("[data-sender-name]").fill("Maple Leaf Immigration");
  await choose(p, "logo", file("logo.png", "image/png", PNG)); await state(p, "logo", /not saved yet/);
  await choose(p, "favicon", file("favicon.jpg", "image/jpeg", JPG)); await state(p, "favicon", /not saved yet/);
  await choose(p, "banner", file("banner.png", "image/png", PNG)); await state(p, "banner", /not saved yet/);
  const button = await p.locator("[data-preview-button]").evaluate((el) => getComputedStyle(el).backgroundColor);
  const before = await read();
  ok("R1.23 PF-13 DW6a: before Save the preview already shows the new colour (#0b6e4f on the client page's button), the sender name on the email, the logo on all three previews, the favicon and the banner",
    await previewColour(p) === "#0b6e4f" && button === "rgb(11, 110, 79)" && (await p.locator("[data-preview-sender]").innerText()) === "Maple Leaf Immigration" && await p.locator("[data-preview-logo]").count() === 3
      && await p.locator("[data-preview-favicon]").count() === 1 && await p.locator("[data-preview-banner]").count() === 1 && await p.locator("[data-branding-unsaved]").isVisible(), { button });
  ok("R1.23 PF-13 DW6a: and nothing is stored: no request left the page, the API read is unchanged (colour, sender name and images not set) and the audit has no line",
    writes.length === 0 && before.colour === null && before.senderName === null && before.images.logo === null && before.images.favicon === null && before.images.banner === null && lines() === 0, { writes, lines: lines() });
  const vDirty = await axe(p); ok("R1.23 PF-13 DW7: the form with unsaved changes has no WCAG 2.2 A/AA violation", vDirty.length === 0, ids(vDirty));
  await shot(p, "3-unsaved-preview-1440");
  await p.locator("[data-branding-save]").click();
  const savedWords = await said(p, "Branding saved.");
  const after = await read();
  ok("R1.23 PF-13 DW6a fail: after Save the read has the colour (lower case), the sender name and the three images, the audit has one line per changed key (5), and the form has no unsaved changes",
    savedWords === "Branding saved." && after.colour === "#0b6e4f" && after.senderName === "Maple Leaf Immigration" && after.images.logo?.mediaType === "image/png" && after.images.favicon?.mediaType === "image/jpeg" && !!after.images.banner
      && lines() === 5 && await p.locator("[data-branding-unsaved]").count() === 0 && writes.length === 4, { writes, lines: lines() });
  const logoLink = await p.locator('[data-preview="email"] [data-preview-logo]').getAttribute("src");
  const served = await fetch(`${BASE}${logoLink}`);
  ok("R1.23 PF-13 DW6a fail: the preview now draws the stored logo from its public link, which answers the image", /^\/api\/public\/firms\/sample-firm\/branding\/logo\?v=/.test(logoLink ?? "") && served.status === 200 && served.headers.get("content-type") === "image/png", { logoLink });
  const other = await read(TB);
  ok("R1.23 PF-13: firm B's branding is untouched (not set)", other.colour === null && other.senderName === null && other.images.logo === null);
  const vSaved = await axe(p); ok("R1.23 PF-13 DW7: the saved page has no WCAG 2.2 A/AA violation", vSaved.length === 0, ids(vSaved));
  await shot(p, "4-saved-1440");

  // ---------------------------------------------------------------------------------------------- DW6b
  writes.length = 0;
  await p.locator("[data-colour-text]").fill("#ffcc00");
  await p.getByText(LOW).waitFor({ timeout: 15_000 });
  const invalid = await p.locator("[data-colour-text]").getAttribute("aria-invalid"), kept = await previewColour(p);
  await p.locator("[data-branding-save]").click(); await said(p, /Not saved/);
  const onColour = await p.waitForFunction(() => document.activeElement?.hasAttribute("data-colour-text"), undefined, { timeout: 5_000 }).then(() => true, () => false);
  const byApi = await api(TOWNER, "PUT", "/platform/branding", { colour: "#ffcc00" });
  ok(`R1.23 PF-13 DW6b: #ffcc00 is refused on the field with its ratio (${JSON.stringify(LOW)}), the preview keeps #0b6e4f, Save sends nothing and puts focus on the field; the API refuses it in the same words (422); the stored colour is unchanged`,
    invalid === "true" && kept === "#0b6e4f" && writes.length === 0 && onColour && byApi.status === 422 && /^Contrast \d+(\.\d+)?:1 on white; at least 4\.5:1 is needed\.$/.test(LOW) && byApi.body?.detail === LOW && (await read()).colour === "#0b6e4f", { invalid, kept, writes, onColour, api: byApi.text.slice(0, 160) });
  const vErr = await axe(p); ok("R1.23 PF-13 DW7: the form with a refused colour has no WCAG 2.2 A/AA violation", vErr.length === 0, ids(vErr));
  await shot(p, "5-contrast-refused-1440");
  await p.locator("[data-colour-text]").fill("#777777"); await p.getByText("Contrast 4.47:1 on white; at least 4.5:1 is needed.").waitFor({ timeout: 15_000 });
  await p.locator("[data-colour-text]").fill("#767676"); await p.locator("[data-colour-line]").filter({ hasText: "Contrast 4.54:1 on white." }).waitFor({ timeout: 15_000 });
  await p.locator("[data-branding-save]").click(); await said(p, "Branding saved.");
  ok("R1.23 PF-13 DW6b fail: #777777 (4.47:1) is refused, #767676 (4.54:1) is accepted, shown in the preview and saved", await previewColour(p) === "#767676" && (await read()).colour === "#767676" && await p.locator('[data-colour-text][aria-invalid="true"]').count() === 0);

  // ---------------------------------------------------------------------------------------------- DW6c
  writes.length = 0;
  const blobs: string[] = []; p.on("request", (r) => { if (r.url().startsWith("blob:")) blobs.push(r.url()); });
  const logoBefore = await p.locator('[data-preview="page"] [data-preview-logo]').getAttribute("src");
  await choose(p, "logo", file("logo.svg", "image/svg+xml", SVG)); const svgWords = await imageError(p, "logo");
  await choose(p, "logo", file("logo.png", "image/png", SVG)); await p.waitForTimeout(300); const svgAsPng = await imageError(p, "logo");
  const ran = await p.evaluate(() => (window as unknown as { __pf13_ran?: number }).__pf13_ran ?? null);
  const svgApi = await upload(TOWNER, "logo", SVG, "logo.svg", "image/svg+xml");
  ok("R1.23 PF-13 DW6c: an SVG with a script is refused when chosen (\"Use a PNG or JPEG file.\"), also when named logo.png and declared image/png; it is never drawn (no blob address made, the preview keeps the stored logo), its script never runs, nothing is sent; the API refuses it too (415)",
    svgWords === "Use a PNG or JPEG file." && svgAsPng === "Use a PNG or JPEG file." && blobs.length === 0 && ran === null && writes.length === 0 && await p.locator('[data-preview="page"] [data-preview-logo]').getAttribute("src") === logoBefore
      && await p.locator("[data-branding-unsaved]").count() === 0 && svgApi.status === 415 && (await read()).images.logo?.mediaType === "image/png", { svgWords, blobs, ran, api: svgApi.status });
  await choose(p, "logo", file("bomb.png", "image/png", pngDeclaring(20000, 20000))); await p.getByText(/too large to open safely \(400 megapixels/).waitFor({ timeout: 15_000 });
  ok("R1.23 PF-13 DW6c (challenge M2): a small PNG whose header declares 20,000 × 20,000 is refused before it is drawn, in the server's words", blobs.length === 0 && await p.locator("[data-branding-unsaved]").count() === 0);
  const vFile = await axe(p); ok("R1.23 PF-13 DW7: the form with a refused file has no WCAG 2.2 A/AA violation", vFile.length === 0, ids(vFile));
  await shot(p, "6-file-refused-1440");
  await choose(p, "logo", file("photo.jpg", "image/jpeg", JPG)); await state(p, "logo", "New: photo.jpg");
  ok("R1.23 PF-13 DW6c fail: a real JPEG is taken: the refusal goes, the preview draws it from the browser's own copy, and it is marked not saved yet",
    await p.locator('[data-image-error="logo"]').count() === 0 && (await p.locator('[data-preview="page"] [data-preview-logo]').getAttribute("src"))?.startsWith("blob:") === true && blobs.length >= 1 && writes.length === 0);
  await p.locator('[data-image-undo="logo"]').click();

  // ---------------------------------------------------------------------------------------------- DW6d
  const six = pngOfSize(6 * MB);
  await choose(p, "logo", file("big.png", "image/png", six)); const bigWords = await imageError(p, "logo");
  const bigApi = await upload(TOWNER, "logo", six, "big.png", "image/png");
  ok("R1.23 PF-13 DW6d: a 6 MB logo is refused when chosen with its limit (\"The logo can be at most 2 MB.\"), nothing is sent and nothing changes; the API refuses it too (413, naming 2 MB)",
    bigWords === "The logo can be at most 2 MB." && writes.length === 0 && await p.locator("[data-branding-unsaved]").count() === 0 && bigApi.status === 413 && /at most 2 MB/.test(bigApi.body?.detail ?? "") && bigApi.body?.limit === "2 MB", { bigWords, api: bigApi.text.slice(0, 160) });
  await shot(p, "7-too-large-1440");
  await choose(p, "logo", file("over.png", "image/png", pngOfSize(2 * MB + 1))); await p.waitForTimeout(300); const over = await imageError(p, "logo");
  await choose(p, "favicon", file("fav.png", "image/png", pngOfSize(256 * KB + 1))); const fav = await imageError(p, "favicon");
  await choose(p, "logo", file("exact.png", "image/png", pngOfSize(2 * MB))); await state(p, "logo", "New: exact.png (2.0 MB)");
  const exactApi = await upload(TB, "logo", pngOfSize(2 * MB), "exact.png", "image/png");
  ok("R1.23 PF-13 DW6d (challenge m5): 2 MB + 1 byte and a favicon of 256 KB + 1 byte are refused with their limits; exactly 2 MB is taken by the page and by the API (firm B, 200)",
    over === "The logo can be at most 2 MB." && fav === "The favicon can be at most 256 KB." && await p.locator('[data-image-error="logo"]').count() === 0 && exactApi.status === 200, { over, fav, exact: exactApi.status });
  await p.locator('[data-image-undo="logo"]').click();

  // ---------------------------------------------------------------------------------------------- DW6g
  writes.length = 0;
  const refuse415 = JSON.stringify({ type: "https://expatready.local/problems/not-taken", title: "Not taken", status: 415, detail: "Use a PNG or JPEG file.", code: "NOT_PNG_OR_JPEG" });
  await p.route("**/api/platform/branding/logo", (r) => (r.request().method() === "PUT" ? r.fulfill({ status: 415, contentType: "application/problem+json", body: refuse415 }) : r.continue()));
  await p.locator("[data-colour-text]").fill("#1f4e79");
  await choose(p, "logo", file("new-logo.jpg", "image/jpeg", JPG)); await state(p, "logo", "New: new-logo.jpg");
  await p.locator("[data-branding-save]").click();
  const partWords = await said(p, /Not saved: logo/);
  const part = await read();
  ok("R1.23 PF-13 DW6g (challenge M1): the server refuses the logo after the colour saved → \"Saved: brand colour. Not saved: logo.\"; the read has the colour, the stored logo is the old one, the logo is still marked changed with the server's words on it",
    partWords === "Saved: brand colour. Not saved: logo." && part.colour === "#1f4e79" && part.images.logo?.mediaType === "image/png" && (await imageError(p, "logo")) === "Use a PNG or JPEG file."
      && await p.locator('[data-image-state="logo"]').filter({ hasText: "not saved yet" }).count() === 1 && await p.locator("[data-branding-unsaved]").isVisible(), { partWords, colour: part.colour });
  const vPart = await axe(p); ok("R1.23 PF-13 DW7: the partly saved form has no WCAG 2.2 A/AA violation", vPart.length === 0, ids(vPart));
  await shot(p, "8-part-saved-1440");
  await p.unroute("**/api/platform/branding/logo"); writes.length = 0;
  await p.locator("[data-branding-save]").click(); await said(p, "Branding saved.");
  ok("R1.23 PF-13 DW6g fail: the next Save sends only the logo (one request) and stores it", writes.join() === "PUT /api/platform/branding/logo" && (await read()).images.logo?.mediaType === "image/jpeg", writes);
  await p.route("**/api/platform/branding/banner", (r) => (r.request().method() === "DELETE" ? r.abort("connectionreset") : r.continue()));
  await p.locator('[data-image-remove="banner"]').click();
  await p.locator("[data-branding-save]").click();
  const lostWords = await said(p, /Could not confirm/);
  await p.unroute("**/api/platform/branding/banner");
  ok("R1.23 PF-13 DW6g (challenge M1): an answer that never arrives → \"Could not confirm every change; the form shows what is stored now.\"; the form shows the stored banner again with no unsaved change",
    lostWords === "Could not confirm every change; the form shows what is stored now." && await p.locator("[data-preview-banner]").count() === 1 && await p.locator("[data-branding-unsaved]").count() === 0 && !!(await read()).images.banner, { lostWords });

  // ---------------------------------------------------------------------------------------------- DW6h (break report, review m1, m2, m5, m6)
  writes.length = 0;
  let release: () => void = () => undefined; const held = new Promise<void>((r) => { release = r; });
  await p.route("**/api/platform/branding/logo", async (r) => { if (r.request().method() === "PUT") await held; await r.continue(); });
  await choose(p, "logo", file("slow.png", "image/png", PNG)); await state(p, "logo", "New: slow.png");
  await p.locator("[data-branding-save]").click();
  await p.locator('[data-branding-save][aria-busy="true"]').waitFor({ timeout: 15_000 });
  const locked = { sender: await p.locator("[data-sender-name]").isDisabled(), colour: await p.locator("[data-colour-text]").isDisabled(), pick: await p.locator("[data-colour-pick]").isDisabled(), choose: await p.locator('[data-image-choose="favicon"]').isDisabled(), remove: await p.locator('[data-image-remove="banner"]').isDisabled() };
  release(); await said(p, "Branding saved."); await p.unroute("**/api/platform/branding/logo");
  const openAgain = await p.locator("[data-sender-name]").isEnabled();
  await p.locator("[data-sender-name]").fill("After the save");
  ok("R1.23 PF-13 DW6h (break Major): while a Save is on its way no field can be typed in or chosen (sender name, colour, picker, Choose and Remove are disabled), so no edit is thrown away; fail: once it ends they are open again and a new edit is marked unsaved",
    Object.values(locked).every(Boolean) && openAgain && await p.locator("[data-branding-unsaved]").isVisible() && (await read()).senderName !== "After the save", locked);
  p.once("dialog", (d) => void d.accept()); await p.locator("[data-branding-discard]").click(); await said(p, "Changes discarded. Nothing was saved.");
  await p.locator("[data-branding-discard]").click(); const nothing = await said(p, "Nothing to discard.");
  await p.locator("[data-colour-text]").fill("  #1F4E79  ");
  const spaced = await p.locator('[data-colour-text][aria-invalid="true"]').count(), spacedPreview = await previewColour(p);
  await p.locator("[data-colour-text]").fill((await read()).colour ?? "");
  ok("R1.23 PF-13 DW6h (review m2, break): Discard changes with nothing changed says \"Nothing to discard.\"; a colour pasted with spaces around it is taken (trimmed), not cut and refused", nothing === "Nothing to discard." && spaced === 0 && spacedPreview === "#1f4e79", { spaced, spacedPreview });
  await choose(p, "logo", file(`${"x".repeat(400)}.png`, "image/png", PNG)); await state(p, "logo", /not saved yet/);
  const noScroll = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await choose(p, "logo", file("again.svg", "image/svg+xml", SVG)); await imageError(p, "logo");
  const described = await p.locator('[data-image-choose="logo"]').evaluate((el) => (el.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" | "));
  ok("R1.23 PF-13 DW6h (break, review m1): a 400-character file name wraps (no sideways scroll); a refusal is tied to its Choose button (its description holds the refusal's words)", noScroll && described.includes("Use a PNG or JPEG file."), { noScroll, described: described.slice(-80) });
  await p.locator('[data-image-undo="logo"]').click();
  let failRead = true;
  await p.route("**/api/platform/branding", (r) => (r.request().method() === "GET" && failRead ? r.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ status: 500, title: "Error", detail: "Something went wrong on our side. Please try again." }) }) : r.continue()));
  await p.locator("[data-sender-name]").fill("Stored but not read back");
  await p.locator("[data-branding-save]").click();
  const unread = await said(p, /Could not confirm/);
  failRead = false; await p.unroute("**/api/platform/branding");
  ok("R1.23 PF-13 DW6h (review m6, break): when the read after Save fails the form stays (never \"Could not load the branding\") and says \"Could not confirm every change. Please reload the page to see what is stored.\"; the value is in fact stored",
    unread === "Could not confirm every change. Please reload the page to see what is stored." && await p.locator("[data-branding-form]").count() === 1 && await p.locator("[data-branding-error]").count() === 0 && (await read()).senderName === "Stored but not read back", { unread });
  await open(p); await p.locator("[data-preview-sender]").filter({ hasText: "Stored but not read back" }).waitFor({ timeout: 15_000 });

  // ---------------------------------------------------------------------------------------------- DW6f
  writes.length = 0;
  await p.locator('[data-image-remove="logo"]').click(); await state(p, "logo", "will be removed when you save");
  const goneInPreview = await p.locator("[data-preview-logo]").count(), stillStored = !!(await read()).images.logo;
  p.once("dialog", (d) => void d.accept());
  await p.locator("[data-branding-discard]").click(); await said(p, "Changes discarded. Nothing was saved.");
  ok("R1.23 PF-13 DW6f: Remove takes the logo out of the three previews and stores nothing; Discard changes (after its question) puts it back, with no request sent",
    goneInPreview === 0 && stillStored && await p.locator("[data-preview-logo]").count() === 3 && writes.length === 0 && await p.locator("[data-branding-unsaved]").count() === 0, { goneInPreview, writes });
  await p.locator('[data-image-remove="logo"]').click(); await p.locator("[data-colour-neutral]").click(); await p.locator("[data-sender-name]").fill("");
  await p.locator("[data-branding-save]").click(); await said(p, "Branding saved.");
  const cleared = await read();
  ok("R1.23 PF-13 DW6f fail: Remove, Use the neutral colour and an empty sender name, then Save: the read has no logo, no colour and no sender name; the preview is back to the neutral colour and the firm's name",
    cleared.images.logo === null && cleared.colour === null && cleared.senderName === null && await previewColour(p) === NEUTRAL && (await p.locator("[data-preview-sender]").innerText()) === FIRM && await p.locator("[data-preview-logo]").count() === 0, { colour: cleared.colour });
  await p.context().close();

  // ---------------------------------------------------------------------------------------------- DW7 keyboard only
  const k = await tab(TOWNER); await open(k);
  await reach(k, k.locator("[data-colour-text]")); await k.keyboard.type("#ffcc00"); await k.keyboard.press("Enter");
  await said(k, /Not saved/);
  const kOnColour = await k.waitForFunction(() => document.activeElement?.hasAttribute("data-colour-text"), undefined, { timeout: 5_000 }).then(() => true, () => false);
  await k.keyboard.press("ControlOrMeta+a"); await k.keyboard.type("#8a1c7c");
  await reach(k, k.locator("[data-sender-name]")); await k.keyboard.type("Keyboard & Co");
  for (const kind of ["logo", "favicon", "banner"]) await reach(k, k.locator(`[data-image-choose="${kind}"]`));
  await reach(k, k.locator("[data-branding-save]")); await k.keyboard.press("Enter"); await said(k, "Branding saved.");
  const kRead = await read();
  ok("R1.23 PF-13 DW7: by keyboard only: Tab reaches the colour, Enter with a failing colour puts focus back on it, a new colour and a sender name are typed, Tab reaches each Choose a file button and Save, Enter saves",
    kOnColour && kRead.colour === "#8a1c7c" && kRead.senderName === "Keyboard & Co", { kOnColour, colour: kRead.colour, senderName: kRead.senderName });
  await k.context().close();

  // ---------------------------------------------------------------------------------------------- DW7 three widths
  for (const w of [375, 1024, 1440]) {
    const q = await tab(TOWNER, w); await open(q);
    await choose(q, "logo", file("logo.png", "image/png", PNG)); await state(q, "logo", /not saved yet/);
    const v = await axe(q), wide = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const beside = await q.evaluate(() => { const f = document.querySelector("[data-branding-form]")!.getBoundingClientRect(), pr = document.querySelector("[data-branding-preview]")!.getBoundingClientRect(); return pr.left >= f.right - 1; });
    ok(`R1.23 PF-13 DW7: Branding at ${w} px has no WCAG 2.2 A/AA violation and no sideways scroll; the preview is ${w >= 1024 ? "beside" : "under"} the fields`, v.length === 0 && wide && beside === (w >= 1024), { v: ids(v), wide, beside });
    await shot(q, `9-branding-${w}`);
    if (w === 375) {
      await q.evaluate(() => { document.querySelector("[data-branding-form]")!.appendChild(document.createElement("button")); });
      const bad = await axe(q);
      ok("R1.23 PF-13 DW7 fail: the same axe run finds the unlabelled button we add (the check can fail)", bad.some((x) => x.id === "button-name"), bad.map((x) => x.id));
    }
    await q.context().close();
  }
  ok("R1.23 PF-13: no page error in any tab", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  PF-13: the check stopped: ${(e as Error).stack?.slice(0, 600)}`);
} finally {
  await browser.close();
}
process.exit(summary() + failed ? 1 : 0);
