// J-23 (map row 23, R1.23: the firm's logo, colour, sender name, favicon and banner), written by the qa lane (22 Nov) ahead
// of the build, as the acceptance journey for the row: PF-13 parts 1a and 1b (the branding API, images and the email
// layout) are on main; part 2, the Branding page, is #2910; no part yet draws the brand on a client page. It walks on an
// isolated copy of the running app (its own database and port, never :4400), as the firm's Owner, by screens only.
// Done when (CAPABILITIES R1.23): an Owner sets all five; a colour below WCAG AA and a wrong file type or size refused on
// the field; client pages and emails show them.
//   W0 fails on the fake (P-606): before anything is set, the firm's public booking page draws no logo, banner or favicon
//      of the firm's, and its public branding read has no image.
//   W1 the Owner signs in on the sign-in card and reaches Branding from My account's menu (no address typed).
//   W2 the Owner sets all five on the page: a logo, a favicon and a banner (PNGs made in this file, Sample), the colour
//      #1f4e79 and the sender name "Maple Law Sample J23"; Save says "Branding saved."; the API read holds each value as
//      entered and one audit line per changed key.
//   W3 refusals on the field, nothing stored: the colour #ffcc00 (contrast 1.5:1 on white) on the colour field in plain
//      words with the ratio and 4.5:1; an SVG (named .png) on the logo field ("PNG or JPEG"); a logo of 2 MB + 1 byte on
//      the logo field ("2 MB"); the read is unchanged after each.
//   W4 the client page shows them: the firm's public booking page draws its logo and banner, uses its favicon, and paints
//      the brand colour.
//   W5 an email shows them: a visitor books on that page; the confirmation in the demo inbox is from the sender name, with
//      the logo and the brand colour in its header.
//   W6 the wrong role: the Case Officer has no Branding entry, sees the plain refusal by address and no values, and the
//      API refuses the change (403).
//   W7 keyboard only (Tab to the sender name, type, Enter saves), 400, 1024 and 1440 px with no sideways scroll, axe
//      clean (WCAG 2.2 A/AA) on the page; no page error.
// When the page cannot set the values (main today), the walk sets the same values by the API, said in its own line, so W4
// and W5 still judge their own clause (the client page and the email), never the page's.
// Sample data only; US$0, no model call, live AI off, no live mail (the local email adapter, read at GET
// /api/demo/platform-inbox). Screenshots: product/screens/J-23/screenshots/. Run from prototype/ (HEADED=1: visible):
//   zsh studio/tools/isolated.sh j23 4474 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j23 4474 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_23.ts j23 4474
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { chromium, type Locator, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j23", PORT = Number(process.argv[3] ?? 4474), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-23", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const one = async (q: string) => String(((await db.$queryRawUnsafe(q)) as Record<string, unknown>[])[0]?.v ?? "");
const run = Date.now().toString(36);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => Promise<boolean>, ms = 60_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(400); } return false; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
type Ans = { status: number; body: any };
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ } return { status: r.status, body: b };
};
const upload = async (t: string, kind: string, bytes: Uint8Array, name: string, type: string): Promise<Ans> => {
  const form = new FormData(); form.append("file", new Blob([bytes.slice().buffer], { type }), name);
  const r = await fetch(`${BASE}/api/platform/branding/${kind}`, { method: "PUT", headers: { authorization: `Bearer ${t}` }, body: form });
  const text = await r.text(); let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ } return { status: r.status, body: b };
};
/** Is it there within ms? (a missing part answers false, never throws) */
const seen = (l: Locator, ms = 8_000) => l.first().waitFor({ timeout: ms }).then(() => true, () => false);

// ------------------------------------------------------------------------------------------------ Sample images, made here
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const enc = (s: string) => new TextEncoder().encode(s);
const chunk = (type: string, data: Uint8Array) => { const head = new Uint8Array(8); new DataView(head.buffer).setUint32(0, data.length); head.set(enc(type), 4); const crc = new Uint8Array(4); new DataView(crc.buffer).setUint32(0, crc32(cat(enc(type), data)) >>> 0); return cat(head, data, crc); };
/** A w × h RGB PNG of one colour, optionally padded with an unknown ancillary chunk to exactly `size` bytes. */
function png(w: number, h: number, rgb: [number, number, number], size?: number): Uint8Array {
  const ihdr = new Uint8Array(13); const v = new DataView(ihdr.buffer); v.setUint32(0, w); v.setUint32(4, h); ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array(h * (1 + 3 * w)); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (1 + 3 * w) + 1 + 3 * x);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array(0))];
  const base = cat(...parts);
  return size === undefined ? base : cat(parts[0], parts[1], chunk("zzPd", new Uint8Array(size - base.length - 12)), parts[2], parts[3]);
}
const LOGO = png(96, 48, [31, 78, 121]), FAVICON = png(32, 32, [31, 78, 121]), BANNER = png(600, 120, [230, 238, 245]);
const TOO_BIG = png(16, 16, [0, 0, 0], 2 * 1024 * 1024 + 1);
const SVG = enc(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>window.__j23_ran = 1</script><rect width="64" height="64" fill="red"/></svg>`);
const file = (name: string, mimeType: string, bytes: Uint8Array) => ({ name, mimeType, buffer: Buffer.from(bytes) });
const COLOUR = "#1f4e79", RGB = "rgb(31, 78, 121)", LOW = "#ffcc00", SENDER = `Maple Law Sample J23 ${run}`;

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = { id: await one(`select id as v from platform_firm where key = 'sample-firm'`), name: await one(`select operating_name as v from platform_firm where key = 'sample-firm'`) };
const staff = async (actor: string) => ({ id: await one(`select id as v from platform_staff where actor_id = '${actor}'`), email: await one(`select email as v from platform_staff where actor_id = '${actor}'`) });
const R = await staff("user-R"), O = await staff("user-O");
if (await one(`select count(*)::text as v from fo_consultation_type where firm_id = '${A.id}' and slug = 'free'`) === "0") {
  await copyFirmHoursTo(db, A.id, [O.id]);
  await db.foConsultationType.create({ data: { firmId: A.id, slug: "free", name: "Free consultation", modes: ["VIDEO"], hostStaffIds: [O.id], minutes: 30, windowDays: 60 } });
}
const token = async (email: string) => (await api(null, "POST", "/platform/session/local", { firmKey: "sample-firm", email, secondStep: true })).body?.token as string;
let TR = await token(R.email), TO = await token(O.email);
/** The Owner's read; null when the read itself is refused (so no judge passes on a refused read). */
const read = async () => { const r = await api(TR, "GET", "/platform/branding"); return r.status === 200 ? r.body : null; };
const audits = async () => Number(await one(`select count(*)::text as v from audit_event where entity = 'platform_firm_setting' and entity_key like '${A.id}:platform.branding.%'`));
const first = await read();
ok("J-23 setup: the Sample firms are seeded; the Owner (user-R) and the Case Officer (user-O) can sign in; the firm's branding is not set yet",
  !!A.id && !!R.email && !!O.email && !!TR && !!TO && fo.failed.length === 0 && first?.colour === null && first?.senderName === null && !first?.images?.logo, { colour: first?.colour, sender: first?.senderName });

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }).catch(() => undefined);
const newPage = async (width = 1440) => { const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }); const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
/** A person signs in on the sign-in card (PF-4's local stand-in: firm key and work email). */
async function signIn(email: string, width = 1440): Promise<Page> {
  const p = await newPage(width);
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 20_000 });
  return p;
}
/** The session the page holds (signing in again ends a person's earlier session, so the walk's API reads use the page's). */
const pageToken = (p: Page) => p.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
/** What the booking page draws of the firm's brand. */
const clientBrand = (p: Page) => p.evaluate((rgb) => {
  const imgs = [...document.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "");
  const icons = [...document.querySelectorAll('link[rel~="icon"]')].map((l) => l.getAttribute("href") ?? "");
  const painted = [...document.querySelectorAll("body *")].some((e) => { const s = getComputedStyle(e); return [s.backgroundColor, s.borderTopColor, s.borderBottomColor, s.color].includes(rgb); });
  return { logo: imgs.some((s) => s.includes("/branding/logo")), banner: imgs.some((s) => s.includes("/branding/banner")) || [...document.querySelectorAll("body *")].some((e) => getComputedStyle(e).backgroundImage.includes("/branding/banner")), favicon: icons.some((h) => h.includes("/branding/favicon")), colour: painted };
}, RGB);
const bookingPage = async (p: Page) => { await p.goto(`${BASE}/book/sample-firm`); return seen(p.locator("[data-type-card]"), 30_000); };

try {
  // ---------------------------------------------------------------------------------------------- W0 before anything is set
  const v0 = await newPage();
  const open0 = await bookingPage(v0), b0 = await clientBrand(v0), pub0 = (await api(null, "GET", "/public/firms/sample-firm/branding")).body;
  ok("J-23 W0 fail (before anything is set, P-606): the firm's booking page draws no logo, banner or favicon of the firm's, and the public branding read has no image",
    open0 && !b0.logo && !b0.banner && !b0.favicon && !pub0?.logo && !pub0?.favicon && !pub0?.banner, { open0, b0 });
  await shot(v0, "w0-booking-page-before-1440"); await v0.context().close();

  // ---------------------------------------------------------------------------------------------- W1 sign in, reach Branding
  const p = await signIn(R.email); TR = await pageToken(p) || TR;
  const entry = p.locator('a[href="/platform/branding"]'), hasEntry = await seen(entry);
  ok("J-23 W1: the Owner signs in on the sign-in card and finds Branding in My account's menu (no address typed)", hasEntry);
  if (hasEntry) await entry.first().click(); else await p.goto(`${BASE}/platform/branding`);
  const form = p.locator("[data-branding-form]"), hasForm = await seen(form, 20_000);
  await shot(p, "w1-branding-1440");
  ok("J-23 W1: the Branding page opens with its form (logo, brand colour, sender name, favicon, banner)",
    hasForm && await seen(p.locator('[data-image-input="logo"]'), 2_000) && await seen(p.locator('[data-image-input="favicon"]'), 2_000) && await seen(p.locator('[data-image-input="banner"]'), 2_000) && await seen(p.locator("[data-colour-text]"), 2_000) && await seen(p.locator("[data-sender-name]"), 2_000), { url: p.url() });

  // ---------------------------------------------------------------------------------------------- W3 refusals on the field
  const read3 = await read(), before3 = JSON.stringify(read3), audits3 = await audits();
  let lowSaid = false, svgSaid = false, bigSaid = false;
  if (hasForm) {
    await p.locator("[data-colour-text]").fill(LOW);
    lowSaid = await seen(p.getByText(/Contrast 1\.\d+:1 on white; at least 4\.5:1 is needed\./), 5_000) && await p.locator("[data-colour-text]").getAttribute("aria-invalid") === "true";
    await p.locator("[data-branding-save]").click().catch(() => undefined); await wait(1500);
    await shot(p, "w3-colour-refused-1440");
    await p.locator("[data-branding-discard]").click().catch(() => undefined);
    await p.locator('[data-image-input="logo"]').setInputFiles(file("logo.png", "image/png", SVG)).catch(() => undefined);
    svgSaid = /PNG or JPEG/.test(await p.locator('[data-image-error="logo"]').innerText({ timeout: 5_000 }).catch(() => ""));
    await shot(p, "w3-svg-refused-1440");
    await p.locator("[data-branding-discard]").click().catch(() => undefined);
    await p.locator('[data-image-input="logo"]').setInputFiles(file("big-logo.png", "image/png", TOO_BIG)).catch(() => undefined);
    bigSaid = /2 MB/.test(await p.locator('[data-image-error="logo"]').innerText({ timeout: 5_000 }).catch(() => ""));
    await p.locator("[data-branding-save]").click().catch(() => undefined); await wait(1500);
    await shot(p, "w3-size-refused-1440");
    await p.locator("[data-branding-discard]").click().catch(() => undefined);
  }
  const unchanged3 = !!read3 && JSON.stringify(await read()) === before3 && await audits() === audits3;
  ok(`J-23 W3: a colour below WCAG AA (${LOW}) is refused on the colour field in plain words, with its ratio and 4.5:1; Save stores nothing`, lowSaid && unchanged3, { lowSaid, unchanged3 });
  ok("J-23 W3: a wrong file type (an SVG named logo.png) is refused on the logo field (\"PNG or JPEG\"); a logo of 2 MB + 1 byte is refused on the field (\"2 MB\"); nothing stored", svgSaid && bigSaid && unchanged3 && !(await p.evaluate(() => (window as unknown as { __j23_ran?: number }).__j23_ran)), { svgSaid, bigSaid });

  // ---------------------------------------------------------------------------------------------- W2 set all five, Save
  let saidSaved = "";
  if (hasForm) {
    await p.locator('[data-image-input="logo"]').setInputFiles(file("logo.png", "image/png", LOGO));
    await p.locator('[data-image-input="favicon"]').setInputFiles(file("favicon.png", "image/png", FAVICON));
    await p.locator('[data-image-input="banner"]').setInputFiles(file("banner.png", "image/png", BANNER));
    await p.locator("[data-colour-text]").fill(COLOUR); await p.locator("[data-sender-name]").fill(SENDER);
    await shot(p, "w2-unsaved-preview-1440");
    await p.locator("[data-branding-save]").click();
    saidSaved = await p.locator("[data-branding-said-text]").innerText({ timeout: 20_000 }).catch(() => "");
    await shot(p, "w2-saved-1440");
  }
  const r2 = await read(), a2 = await audits();
  const stored = r2?.colour === COLOUR && r2?.senderName === SENDER && !!r2?.images?.logo && !!r2?.images?.favicon && !!r2?.images?.banner;
  ok("J-23 W2: the Owner sets all five on the page and Save says \"Branding saved.\"; the read holds the colour and sender name as entered and the three images, with one audit line per changed key",
    saidSaved.includes("Branding saved.") && stored && a2 - audits3 >= 5, { saidSaved, colour: r2?.colour, sender: r2?.senderName, images: r2?.images && Object.fromEntries(Object.entries(r2.images).map(([k, x]) => [k, !!x])), audits: a2 - audits3 });
  if (!stored) {
    // Said, not hidden: the page could not set them, so the walk sets the same values by the Owner's API, and W4 and W5
    // judge the client page and the email on their own.
    const put = await api(TR, "PUT", "/platform/branding", { colour: COLOUR, senderName: SENDER });
    const ups = [await upload(TR, "logo", LOGO, "logo.png", "image/png"), await upload(TR, "favicon", FAVICON, "favicon.png", "image/png"), await upload(TR, "banner", BANNER, "banner.png", "image/png")];
    console.log(`NOTE  J-23 W2 stand-in: the five values set by the Owner's API instead (PUT branding ${put.status}; images ${ups.map((u) => u.status).join(", ")}), so W4 and W5 judge their own clause`);
  }

  // ---------------------------------------------------------------------------------------------- W4 the client page
  const v4 = await newPage();
  const open4 = await bookingPage(v4), b4 = await clientBrand(v4);
  await shot(v4, "w4-booking-page-after-1440");
  ok("J-23 W4: the firm's public booking page shows the brand: its logo and banner drawn, its favicon used, the brand colour painted", open4 && b4.logo && b4.banner && b4.favicon && b4.colour, { open4, ...b4 });

  // ---------------------------------------------------------------------------------------------- W5 an email
  const visitor = `j23.visitor.${run}@example.com`;
  let mail: { from: string; subject: string; html: string } | undefined;
  if (open4) {
    await v4.locator('a[href="/book/sample-firm/free"]').click(); await v4.getByRole("heading", { name: "Choose a time" }).waitFor({ timeout: 20_000 });
    const days = v4.locator('[role="group"] button:not([disabled])');
    for (let i = 0; i < 3 && (await days.count()) === 0; i++) { await v4.getByRole("button", { name: "Next month" }).click(); await wait(800); }
    await days.first().click(); await v4.locator("[data-day-times] li button").first().click();
    await v4.getByRole("heading", { name: "Your details" }).waitFor({ timeout: 20_000 });
    await v4.getByLabel("Given names").fill("Visitor"); await v4.getByLabel("Family name").fill(`Sample ${run}`); await v4.getByLabel("Email").fill(visitor);
    await wait(3500);   // the form's minimum fill time
    await v4.getByRole("button", { name: "Book this time" }).click();
    await seen(v4.locator('[data-public-state="booked"]'), 20_000);
    await until(async () => { mail = ((await api(null, "GET", `/demo/platform-inbox?address=${encodeURIComponent(visitor)}`)).body?.messages ?? [])[0]; return !!mail; }, 90_000);
  }
  await v4.context().close();
  ok("J-23 W5: the booking confirmation the visitor receives is from the sender name, with the firm's logo and the brand colour in its header",
    !!mail && mail.from.startsWith(`${SENDER} <`) && mail.html.includes("/branding/logo") && mail.html.toLowerCase().includes(COLOUR), { from: mail?.from, logo: mail?.html.includes("/branding/logo"), colour: mail?.html.toLowerCase().includes(COLOUR) });

  // ---------------------------------------------------------------------------------------------- W6 the wrong role
  const o = await signIn(O.email); TO = await pageToken(o) || TO;
  const oEntry = await o.locator('a[href="/platform/branding"]').count();
  await o.goto(`${BASE}/platform/branding`);
  const oRefused = await seen(o.getByText("Only an Owner or Admin can change the firm's branding."), 15_000), oValues = await o.getByText(SENDER).count();
  await shot(o, "w6-case-officer-refused-1440");
  const oPut = await api(TO, "PUT", "/platform/branding", { senderName: "Not allowed J23" });
  ok("J-23 W6: the Case Officer has no Branding entry, sees \"Only an Owner or Admin can change the firm's branding.\" by address with no values, and the API refuses the change (403)",
    oEntry === 0 && oRefused && oValues === 0 && oPut.status === 403 && (await read())?.senderName !== "Not allowed J23", { oEntry, oRefused, oValues, put: oPut.status });
  await o.context().close();

  // ---------------------------------------------------------------------------------------------- W7 keyboard, sizes, axe
  let keyed = false;
  if (hasForm) {
    await p.goto(`${BASE}/platform/branding`); await seen(form, 20_000);
    const name = p.locator("[data-sender-name]");
    for (let i = 0; i < 80 && !(await name.evaluate((e) => e === document.activeElement).catch(() => false)); i++) await p.keyboard.press("Tab");
    await p.keyboard.press("ControlOrMeta+a"); await p.keyboard.type(`${SENDER} K`); await p.keyboard.press("Enter");
    keyed = await until(async () => (await read())?.senderName === `${SENDER} K`, 10_000);
  }
  ok("J-23 W7 keyboard: Tab reaches the sender name, typing and Enter save it", keyed);
  for (const width of [400, 1024, 1440]) {
    const q = await signIn(R.email, width); TR = await pageToken(q) || TR;
    await q.goto(`${BASE}/platform/branding`);
    const there = await seen(q.locator("[data-branding-form]"), 20_000);
    const fits = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const bad = there ? (await new AxeBuilder({ page: q }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => x.id) : ["no page"];
    ok(`J-23 W7: at ${width} px the Branding page has no sideways scroll and no WCAG 2.2 A/AA violation (axe)`, there && fits && bad.length === 0, { there, fits, bad });
    if (width === 400) await shot(q, "w7-branding-400");
    await q.context().close();
  }
  ok("J-23: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  ok("J-23: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
