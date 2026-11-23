// J-24 (map row 24, R1.24: each firm's own web address), written by the qa lane (23 Nov) ahead of PF-25w and J-24, because
// no j_24 was on main. PF-25 (#1763: the address, its rules, availability, suggestion, host routing, the 90-day redirect)
// and PF-8b (#2748: wildcard record and certificate; host suffix #2827) are on main; PF-25w (the staff-only change's route,
// our staff's `system/firm:address` key, PF-4s on main) and FO-3w's booking pages on the firm's address (no module calls
// `registerPublicPath` yet) are not. It walks an isolated copy of the running app (its own database and port, never :4400)
// in a browser by the firm's address (`<address>.localhost:<port>`, the local suffix of `<address>.expatready.com`; Chromium
// sends it to this machine), with the API and the database read underneath.
// Done when (CAPABILITIES R1.24): `<firm>.expatready.com` opens that firm's public pages only; a taken, reserved or
// malformed address refused in words; another firm's address never shows this firm's data. J-24's own walk (BACKLOG J-24):
// a firm address opens its booking page, to row 37's first step.
//   Setup (Sample): the two Sample firms (sample-firm = A, sample-solo = B) and their front office; each gets a public
//   consultation type named for the run, so a page of one firm that shows the other's type name is caught. Our own staff
//   (PF-4s's plat_system_staff, Sample rows written to the copy's database, as j_104 writes its Sample rows): a Platform
//   Admin (holds system/firm:address) and a Support member (does not).
//   W0 fails on the fake (P-606): before the change, the run's new address `j24-<run>` serves nothing (the one plain
//      not-found) and its availability says it is free.
//   W1 (screen) a visitor opens A's address `/book`: A's public booking page, with A's type and A's name, not B's.
//   W2 public pages only: on A's address the studio's own pages and API (`/account`, `/platform/branding`,
//      `/api/platform/branding`) and an unknown address each give the one plain not-found ("This page is not available.").
//   W3 another firm's address never shows this firm's data: B's address `/book` shows B's type and none of A's (name or
//      type); `/api/public/site` answers each address with its own; an X-Forwarded-Host naming A, or A's firm key in the
//      path, on B's address never serves A.
//   W4 refused in words: availability of a taken address (a third Sample firm's), a reserved one (`www`), and malformed ones (`Maple`,
//      `-maple`, `ma`, `maple_law`) each answers not available with the rule's own plain words (and a suggestion where one
//      is made); the staff change with the same values is refused on its address field (422) and changes nothing.
//   W5 the staff-only change (PF-25w): the Platform Admin changes A's address to `j24-<run>` with a reason; the new address
//      opens A's booking page; the old one sends the visitor there (301, same path); one audit line. Support (no key) is
//      refused 403, the firm's own Owner cannot reach the route, no reason is refused on its field, an unknown firm is 404.
//      The route is looked for at PUT|PATCH|POST /api/system/firms/:id/web-address (PF-25w names no path: if its PR picks
//      another, that PR changes this line).
//   W6 the walk ends at row 37's first step: on the new address the visitor chooses A's type and sees "Choose a time".
//   W7 the booking page on the address at 400, 1024 and 1440 px: no sideways scroll, axe WCAG 2.2 A/AA clean; no page error.
// Re-runnable on one copy (each run makes its own address and type names). Sample firms and values only. US$0, no model
// call, no live mail, no DNS (the local suffix). Our staff's sign-in needs PLATFORM_SYSTEM_IDENTITY=local on the copy. Screenshots: product/screens/J-24/screenshots/. Run from prototype/
// (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j24 4424 start --ttl 30 PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j24 4424 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_24.ts j24 4424
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { request } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { firmInTransaction } from "../../api/src/platform/firm-scope.ts";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j24", PORT = Number(process.argv[3] ?? 4424), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-24", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const one = async (q: string) => String(((await db.$queryRawUnsafe(q)) as Record<string, unknown>[])[0]?.v ?? "");
const run = Date.now().toString(36);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => Promise<boolean>, ms = 60_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(400); } return false; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
type Ans = { status: number; body: any; headers: Record<string, string | string[] | undefined> };
/** One HTTP call with the Host header set by hand (fetch cannot set Host), no redirect followed. */
const call = (host: string, method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Ans> => new Promise((resolve) => {
  const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const req = request({ host: "127.0.0.1", port: PORT, method, path, headers: { host, ...(data ? { "content-type": "application/json" } : {}), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.headers ?? {}) } }, (res) => {
    let text = ""; res.setEncoding("utf8"); res.on("data", (c) => (text += c));
    res.on("end", () => { let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ } resolve({ status: res.statusCode ?? 0, body: b, headers: res.headers }); });
  });
  req.on("error", (e) => resolve({ status: 0, body: String(e), headers: {} })); if (data) req.write(data); req.end();
});
const MAIN = `localhost:${PORT}`;
const hostOf = (address: string) => `${address}.localhost:${PORT}`;
const urlOf = (address: string, path = "/book") => `http://${hostOf(address)}${path}`;
const NOT_FOUND = "This page is not available.";
const plainNotFound = (a: Ans) => a.status === 404 && JSON.stringify(a.body).includes(NOT_FOUND);
/** Is it there within ms? (a missing part answers false, never throws) */
const seen = (l: Locator, ms = 8_000) => l.first().waitFor({ timeout: ms }).then(() => true, () => false);

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firm = async (key: string) => ({ key, id: await one(`select id as v from platform_firm where key = '${key}'`), name: await one(`select operating_name as v from platform_firm where key = '${key}'`) });
const A = await firm("sample-firm"), B = await firm("sample-solo");
const addressOf = (id: string) => one(`select coalesce((select address from platform_firm_web_address where firm_id = '${id}'), '') as v`);
// The addresses are given at the app's start (PF-25's catch-up): wait for both.
await until(async () => !!(await addressOf(A.id)) && !!(await addressOf(B.id)), 30_000);
const addrA0 = await addressOf(A.id), addrB = await addressOf(B.id);
// A third Sample firm holding an ordinary address, so "taken" is judged on an address no other rule refuses (a Sample
// firm's own `sample-…` address is refused first by the Sample rule).
const TAKEN = `j24-taken-${run}`;
await db.$transaction(async (tx) => {
  const id = crypto.randomUUID(); await firmInTransaction(tx, id);
  await tx.platformFirm.create({ data: { id, key: `j24-c-${run}`, operatingName: `Cedar Sample J24 ${run}`, countryCode: "CA", status: "ACTIVE", ownerName: "Client C", ownerEmail: `c.${run}@example.com`, billingEmail: `c.${run}@example.com`, contactEmail: `c.${run}@example.com` } });
  await tx.platformFirmWebAddress.create({ data: { firmId: id, address: TAKEN, setBy: "seed:J-24" } });
});
const TYPE_A = `Consultation J24 A ${run}`, TYPE_B = `Consultation J24 B ${run}`, SLUG = `j24-${run}`;
for (const [f, typeName] of [[A, TYPE_A], [B, TYPE_B]] as const) {
  const host = await one(`select s.id as v from platform_staff s where s.firm_id = '${f.id}' order by s.created_at limit 1`);
  await copyFirmHoursTo(db, f.id, [host]);   // once per person: a later run adds nothing
  await db.foConsultationType.create({ data: { firmId: f.id, slug: SLUG, name: typeName, modes: ["VIDEO"], hostStaffIds: [host], minutes: 30, windowDays: 60 } });
}
// Our own staff (PF-4s), Sample rows: a Platform Admin (system/firm:address) and a Support member (no such key).
const ours = async (role: string, label: string) => {
  const email = `j24.${label}.${run}@expatready.example`;
  const id = await one(`insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${email}', 'Sample ${label} J24') returning id::text as v`);
  await db.$executeRawUnsafe(`insert into plat_system_role_grant (id, staff_id, role_code) values (gen_random_uuid(), '${id}', '${role}')`);
  return (await call(MAIN, "POST", "/api/system/session/local", { body: { email, secondStep: true } })).body?.token as string | undefined;
};
const adminTok = await ours("platform-admin", "admin").catch(() => undefined), supportTok = await ours("platform-support", "support").catch(() => undefined);
const ownerEmail = await one(`select email as v from platform_staff where actor_id = 'user-R'`);
const ownerTok = (await call(MAIN, "POST", "/api/platform/session/local", { body: { firmKey: "sample-firm", email: ownerEmail, secondStep: true } })).body?.token as string | undefined;
ok("J-24 setup: the two Sample firms have their own web addresses; each has the run's public type; our Platform Admin and Support and the firm's Owner can sign in",
  !!addrA0 && !!addrB && addrA0 !== addrB && fo.failed.length === 0 && !!adminTok && !!supportTok && !!ownerTok, { addrA0, addrB, admin: !!adminTok, support: !!supportTok, owner: !!ownerTok });

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }).catch(() => undefined);
const newPage = async (width = 1440) => { const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }); const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
/** What a firm's public booking page on an address shows: its type cards, and whether A's or B's name or type is on it. */
async function bookingOn(p: Page, address: string, path = "/book") {
  const r = await p.goto(urlOf(address, path)).catch(() => null);
  const cards = await seen(p.locator("[data-type-card]"), 20_000);
  const text = await p.locator("body").innerText().catch(() => "");
  return { status: r?.status() ?? 0, url: p.url(), cards, typeA: text.includes(TYPE_A), typeB: text.includes(TYPE_B), nameA: text.includes(A.name), nameB: A.name !== B.name && text.includes(B.name), notFound: text.includes(NOT_FOUND) };
}
const CHANGE_PATH = (firmId: string) => `/api/system/firms/${firmId}/web-address`;
/** The staff change, by whichever verb PF-25w gives it (a route absent under all three: 404 from each). */
async function change(token: string | undefined, firmId: string, body: unknown): Promise<Ans> {
  let last: Ans = { status: 0, body: "no token", headers: {} };
  for (const m of ["PUT", "PATCH", "POST"]) { last = await call(MAIN, m, CHANGE_PATH(firmId), { token, body }); if (last.status !== 404 || !/Cannot (PUT|PATCH|POST)/.test(JSON.stringify(last.body))) return last; }
  return last;
}
const routeMissing = (a: Ans) => a.status === 404 && /Cannot (PUT|PATCH|POST)/.test(JSON.stringify(a.body));
const audits = () => one(`select count(*)::text as v from audit_event where entity_key like '%${A.id}%' and action ilike '%address%'`).catch(() => "?");

try {
  // ---------------------------------------------------------------------------------------------- W0 before the change
  const NEW = `j24-${run}`;
  const w0Host = await call(hostOf(NEW), "GET", "/api/public/site"), w0Avail = await call(MAIN, "GET", `/api/public/web-address/availability?address=${NEW}`);
  ok(`J-24 W0 fail (before the change, P-606): the run's new address ${NEW} serves only the plain not-found, and its availability says it is free`,
    plainNotFound(w0Host) && w0Avail.body?.available === true, { host: w0Host.status, avail: w0Avail.body });

  // ---------------------------------------------------------------------------------------------- W1 A's address opens A's booking page
  const v1 = await newPage();
  const b1 = await bookingOn(v1, addrA0);
  await shot(v1, "w1-firm-a-address-book-1440");
  ok(`J-24 W1 (screen): a visitor opens A's address (${addrA0}.localhost/book) and sees A's public booking page: A's type and A's name, nothing of B's (parts missing until FO-3w registers its booking pages on the firm's address)`,
    b1.cards && b1.typeA && b1.nameA && !b1.typeB && !b1.nameB, b1);
  await v1.context().close();

  // ---------------------------------------------------------------------------------------------- W2 public pages only
  const own = await Promise.all(["/account", "/platform/branding", "/api/platform/branding", "/api/platform/session"].map(async (path) => [path, await call(hostOf(addrA0), "GET", path, { token: ownerTok })] as const));
  const unknown = await call(hostOf(`nobody-${run}`), "GET", "/book");
  const v2 = await newPage(); await v2.goto(urlOf(addrA0, "/account")).catch(() => undefined);
  const pageSays = (await v2.locator("body").innerText().catch(() => "")).includes(NOT_FOUND); await shot(v2, "w2-studio-page-on-firm-address-1440"); await v2.context().close();
  ok("J-24 W2: on A's address the studio's own pages and API (/account, /platform/branding, /api/platform/branding, /api/platform/session, even with the Owner's token) give the one plain not-found; so does an unknown address",
    own.every(([, a]) => plainNotFound(a)) && plainNotFound(unknown) && pageSays, { own: own.map(([p, a]) => `${p} ${a.status}`), unknown: unknown.status, pageSays });

  // ---------------------------------------------------------------------------------------------- W3 another firm's address
  const v3 = await newPage();
  const b3 = await bookingOn(v3, addrB);
  await shot(v3, "w3-firm-b-address-book-1440");
  const b3key = await bookingOn(v3, addrB, `/book/${A.key}`);
  await v3.context().close();
  const siteA = await call(hostOf(addrA0), "GET", "/api/public/site"), siteB = await call(hostOf(addrB), "GET", "/api/public/site");
  const spoof = await call(hostOf(addrB), "GET", "/api/public/site", { headers: { "x-forwarded-host": hostOf(addrA0) } });
  ok(`J-24 W3: B's address (${addrB}) shows B's booking page with B's type and nothing of A's (name or type)`, b3.cards && b3.typeB && !b3.typeA && !b3.nameA, b3);
  ok("J-24 W3: /api/public/site answers each address with its own; an X-Forwarded-Host naming A and A's firm key in the path on B's address never serve A",
    siteA.body?.webAddress === addrA0 && siteB.body?.webAddress === addrB && spoof.body?.webAddress === addrB && !b3key.typeA && !b3key.nameA,
    { siteA: siteA.body, siteB: siteB.body, spoof: spoof.body, keyPath: b3key });

  // ---------------------------------------------------------------------------------------------- W4 refused in words
  const cases: [string, RegExp][] = [
    [TAKEN, /^This address is taken\.$/], ["www", /kept for ExpatReady's own pages/], ["Maple", /lower-case letters only/],
    ["-maple", /cannot start or end with a hyphen/], ["ma", /at least \d+ characters/], ["maple_law", /only lower-case letters, digits and hyphens/],
  ];
  const said: Record<string, unknown> = {}; let allSaid = true;
  for (const [typed, re] of cases) {
    const a = await call(MAIN, "GET", `/api/public/web-address/availability?address=${encodeURIComponent(typed)}`);
    const good = a.status === 200 && a.body?.available === false && re.test(String(a.body?.message ?? ""));
    said[typed] = good ? "ok" : a.body; allSaid &&= good;
  }
  ok("J-24 W4: availability refuses a taken address (a third firm's), a reserved one (www) and malformed ones (Maple, -maple, ma, maple_law), each in the rule's own plain words",
    allSaid, said);
  const refusedChange: Record<string, unknown> = {}; let allRefused = true;
  for (const [typed, re] of cases) {
    const a = await change(adminTok, A.id, { address: typed, reason: `J-24 refusal check ${run}` });
    const good = a.status === 422 && re.test(String(a.body?.fields?.address ?? a.body?.errors?.address ?? ""));
    refusedChange[typed] = good ? "ok" : `${a.status} ${JSON.stringify(a.body).slice(0, 120)}`; allRefused &&= good;
  }
  ok("J-24 W4 (PF-25w): the staff change with the same values is refused on its address field (422) in the same words, and A's address is unchanged",
    allRefused && (await addressOf(A.id)) === addrA0, refusedChange);

  // ---------------------------------------------------------------------------------------------- W5 the staff-only change
  const a0 = await audits();
  const bySupport = await change(supportTok, A.id, { address: NEW, reason: `J-24 support ${run}` });
  const byOwner = await change(ownerTok, A.id, { address: NEW, reason: `J-24 owner ${run}` });
  const noReason = await change(adminTok, A.id, { address: NEW });
  const unknownFirm = await change(adminTok, "00000000-0000-4000-8000-000000000000", { address: NEW, reason: `J-24 unknown ${run}` });
  const missing = [bySupport, noReason].every(routeMissing);
  ok("J-24 W5 (PF-25w): Support (no system/firm:address) is refused 403; the firm's own Owner cannot use the route (401/403); no reason is refused on its reason field (422); an unknown firm is 404; nothing changes",
    !missing && bySupport.status === 403 && [401, 403].includes(byOwner.status) && noReason.status === 422 && !!(noReason.body?.fields?.reason) && unknownFirm.status === 404 && (await addressOf(A.id)) === addrA0,
    missing ? "route missing: PF-25w (PUT|PATCH|POST /api/system/firms/:id/web-address answers Cannot …)" : { support: bySupport.status, owner: byOwner.status, noReason: `${noReason.status} ${JSON.stringify(noReason.body?.fields ?? noReason.body).slice(0, 120)}`, unknown: unknownFirm.status });
  const made = await change(adminTok, A.id, { address: NEW, reason: `J-24: the firm asked for its new name (${run})` });
  const changed = (await addressOf(A.id)) === NEW, a1 = await audits();
  ok(`J-24 W5 (PF-25w): our Platform Admin changes A's address to ${NEW} with a reason (2xx); the database holds it; one audit line`,
    made.status >= 200 && made.status < 300 && changed && Number(a1) - Number(a0) === 1, routeMissing(made) ? "route missing: PF-25w" : { status: made.status, body: JSON.stringify(made.body).slice(0, 160), changed, audits: `${a0} → ${a1}` });
  const old = await call(hostOf(addrA0), "GET", "/book?from=j24");
  ok(`J-24 W5: the old address sends the visitor to the new one (301 to ${NEW}.localhost, same path and query)`,
    changed && old.status === 301 && String(old.headers.location ?? "") === `http://${hostOf(NEW)}/book?from=j24`, { status: old.status, location: old.headers.location });

  // ---------------------------------------------------------------------------------------------- W6 to row 37's first step
  const v6 = await newPage();
  const landed = changed ? await bookingOn(v6, addrA0) : { url: "", cards: false, typeA: false };   // by the old address: the redirect lands on the new
  const onNew = landed.url.startsWith(`http://${hostOf(NEW)}/`);
  let chooseTime = false;
  if (landed.cards && landed.typeA) {
    await v6.locator("[data-type-card]", { hasText: TYPE_A }).first().click().catch(() => v6.getByRole("link", { name: new RegExp(TYPE_A) }).first().click().catch(() => undefined));
    chooseTime = await seen(v6.getByRole("heading", { name: "Choose a time" }), 20_000);
  }
  await shot(v6, "w6-choose-a-time-on-new-address-1440");
  await v6.context().close();
  ok(`J-24 W6: a visitor on A's old address lands on ${NEW}'s booking page, chooses A's type and sees "Choose a time" (row 37's first step)`,
    onNew && landed.cards && landed.typeA && chooseTime, { url: landed.url, cards: landed.cards, typeA: landed.typeA, chooseTime });

  // ---------------------------------------------------------------------------------------------- W7 sizes, axe, errors
  const where = changed ? NEW : addrA0;
  for (const width of [400, 1024, 1440]) {
    const q = await newPage(width);
    const b = await bookingOn(q, where);
    const fits = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const bad = b.cards ? (await new AxeBuilder({ page: q }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.map((x) => x.id) : ["no booking page on the address"];
    ok(`J-24 W7: at ${width} px the booking page on the firm's address has no sideways scroll and no WCAG 2.2 A/AA violation (axe)`, b.cards && fits && bad.length === 0, { cards: b.cards, fits, bad });
    if (width === 400) await shot(q, "w7-address-book-400");
    await q.context().close();
  }
  ok("J-24: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  ok("J-24: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
