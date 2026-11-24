// QA-756 (R1.24; AG-04 S3 "https://maple.expatready.com/book/free-consultation"; AG-4-16, AG-4-17; found by j_24 on
// #3183): the booking pages are served on a firm's own address. Over real HTTP on an isolated copy of the whole app (its
// own database and port, the built web app, PF-25's host routing, PF-12's walls), with the Host header set by hand (the
// local suffix `<address>.localhost`). Every line has a passing and a failing case; on main before QA-756 the D1-D4 pass
// lines fail (P-606). Sample firms and values only; a headless browser for D5 (j_24 walks the whole journey), no model call,
// no mail (US$0).
//   D1 the pages and their files: /book, /book/<type>, /book/manage and the bundle the page loads are served on A's
//      address; /book/<a>/<b>, the studio's own pages and an odd path stay the one plain not-found.
//   D2 /api/public/booking-site names the firm the Host names (A on A's, B on B's, B whatever X-Forwarded-Host says);
//      on ExpatReady's own host and on an unknown address it is the one not-found.
//   D3 the doors on A's address answer for A; B's key in the path on A's address is the same one not-found as an
//      unknown type (AG-4-17), never B's page and never the walls' own words; on ExpatReady's own host B is unchanged.
//   D4 a visitor books on A's address and the link works there; the same link on B's address is the one not-found;
//      on ExpatReady's own host it still works.
//   D5 (screen) in a browser on A's address: the list, Choose to the type's times, the booker's page by its link; the link
//      on B's address shows nothing of it; on ExpatReady's own host the pages are as before.
//   zsh studio/tools/isolated.sh rt_qa756 4486 start && tsx studio/tests/check_qa756_booking_on_address.ts 4486 xr_studio_rt_qa756
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { chromium } from "playwright";
import { copyFirmHoursTo } from "../api/src/front-office/booking-seed.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4486), DBNAME = process.argv[3] ?? "xr_studio_rt_qa756";
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const { ok, summary } = recorder();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const one = async (q: string) => String(((await db.$queryRawUnsafe(q)) as Record<string, unknown>[])[0]?.v ?? "");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers are read loosely, as in the other checks
type Ans = { status: number; body: any; text: string; type: string };
/** One HTTP call with the Host header set by hand (fetch cannot set Host), no redirect followed. */
const call = (host: string, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Ans> => new Promise((resolve) => {
  const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const req = request({ host: "127.0.0.1", port: PORT, method, path, headers: { host, ...(data ? { "content-type": "application/json" } : {}), ...(opts.headers ?? {}) } }, (res) => {
    let text = ""; res.setEncoding("utf8"); res.on("data", (c) => (text += c));
    res.on("end", () => { let b: unknown = text; try { b = JSON.parse(text); } catch { /* text */ } resolve({ status: res.statusCode ?? 0, body: b, text, type: String(res.headers["content-type"] ?? "") }); });
  });
  req.on("error", (e) => resolve({ status: 0, body: String(e), text: String(e), type: "" })); if (data) req.write(data); req.end();
});
const MAIN = `localhost:${PORT}`, hostOf = (a: string) => `${a}.localhost:${PORT}`;
const PLAIN = "This page is not available.", DOOR = PLAIN;   // one text on every address (AG-4-17 rule 3; review M1)
const plain = (a: Ans) => a.status === 404 && a.text.includes(PLAIN);
const door404 = (a: Ans) => a.status === 404 && a.body?.detail === DOOR;
const page = (a: Ans) => a.status === 200 && a.type.startsWith("text/html") && a.text.includes('<div id="root">');
const brief = (a: Ans) => `${a.status} ${a.text.slice(0, 90)}`;

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firm = async (key: string) => ({ key, id: await one(`select id as v from platform_firm where key = '${key}'`) });
const A = await firm("sample-firm"), B = await firm("sample-solo");
const addressOf = (id: string) => one(`select coalesce((select address from platform_firm_web_address where firm_id = '${id}'), '') as v`);
for (let i = 0; i < 75 && !((await addressOf(A.id)) && (await addressOf(B.id))); i++) await wait(400);   // PF-25's catch-up at start
const addrA = await addressOf(A.id), addrB = await addressOf(B.id);
const run = Date.now().toString(36), SLUG = `qa756-${run}`, TYPE_A = `Consultation QA756 A ${run}`, TYPE_B = `Consultation QA756 B ${run}`;
for (const [f, name] of [[A, TYPE_A], [B, TYPE_B]] as const) {
  const host = await one(`select id as v from platform_staff where firm_id = '${f.id}' order by created_at limit 1`);
  await copyFirmHoursTo(db, f.id, [host]);
  await db.foConsultationType.create({ data: { firmId: f.id, slug: SLUG, name, modes: ["VIDEO"], hostStaffIds: [host], minutes: 30, windowDays: 60 } });
}
ok("QA-756 setup: the two Sample firms have their own addresses and the run's public type", !!addrA && !!addrB && addrA !== addrB && fo.failed.length === 0, { addrA, addrB });

try {
  // ---------------------------------------------------------------------------------------------- D1 pages and files
  const [list, type, manage] = await Promise.all(["/book", `/book/${SLUG}`, "/book/manage"].map((p) => call(hostOf(addrA), "GET", p)));
  const bundle = [...list.text.matchAll(/(?:src|href)="(\/(?:assets|brand)\/[^"]+)"/g)].map((m) => m[1]);
  const files = await Promise.all(bundle.map((p) => call(hostOf(addrA), "GET", p)));
  ok("QA-756 D1: on A's address /book, /book/<type> and /book/manage serve the booking page (the web app), and every file it loads (script, style, icon) is served",
    page(list) && page(type) && page(manage) && bundle.some((p) => p.endsWith(".js")) && files.every((f) => f.status === 200),
    { list: list.status, type: type.status, manage: manage.status, files: bundle.map((p, i) => `${p} ${files[i].status}`) });
  const font = await call(hostOf(addrA), "GET", "/fonts/inter/inter-latin-wght-normal.woff2");
  ok("QA-756 D1: the page's font is served on A's address", font.status === 200, font.status);
  const closed = await Promise.all([`/book/${A.key}/${SLUG}`, "/account", "/platform/branding", "/api/platform/session", "/book/..%2faccount", "/assets/../index.html", "/fonts/other.woff2", "/brand/x.png", "/book/Manage", `/book/no-such-${run}`, `/assets/missing-${run}.js`, `/brand/missing-${run}.svg`, `/fonts/inter/missing-${run}.woff2`].map(async (p) => [p, await call(hostOf(addrA), "GET", p)] as const));
  ok("QA-756 D1 (fail cases): on A's address /book/<a>/<b>, the studio's pages and API, an odd path, an unlisted file, a type A does not list and a missing built file stay the one plain not-found",
    closed.every(([, a]) => plain(a)), closed.map(([p, a]) => `${p} ${a.status}`));
  const typeOnA = await call(hostOf(addrA), "GET", `/book/no-such-${run}`), typeNowhere = await call(hostOf(`nobody-${run}`), "GET", `/book/no-such-${run}`);
  const bType = await call(hostOf(addrA), "GET", `/book/${SLUG}x`);
  ok("QA-756 D1 (AG-4-17 rule 3): an unknown type on A's address gives the same bytes and status as an unknown address (review M1)",
    typeOnA.status === 404 && typeOnA.status === typeNowhere.status && typeOnA.text === typeNowhere.text && typeOnA.type === typeNowhere.type && plain(bType), { onA: brief(typeOnA), nowhere: brief(typeNowhere) });

  // ---------------------------------------------------------------------------------------------- D2 which firm
  const siteA = await call(hostOf(addrA), "GET", "/api/public/booking-site"), siteB = await call(hostOf(addrB), "GET", "/api/public/booking-site");
  const spoof = await call(hostOf(addrB), "GET", "/api/public/booking-site", { headers: { "x-forwarded-host": hostOf(addrA) } });
  ok("QA-756 D2: /api/public/booking-site names A's key on A's address and B's on B's, also with an X-Forwarded-Host naming A",
    siteA.status === 200 && siteA.body?.firmKey === A.key && siteB.body?.firmKey === B.key && spoof.body?.firmKey === B.key && Object.keys(siteA.body ?? {}).join() === "firmKey",
    { siteA: siteA.body, siteB: siteB.body, spoof: spoof.body });
  const siteMain = await call(MAIN, "GET", "/api/public/booking-site"), siteNobody = await call(hostOf(`nobody-${run}`), "GET", "/api/public/booking-site");
  ok("QA-756 D2 (fail cases): on ExpatReady's own host it is the booking door's one not-found; on an unknown address the plain not-found",
    door404(siteMain) && plain(siteNobody), { main: brief(siteMain), nobody: brief(siteNobody) });

  // ---------------------------------------------------------------------------------------------- D3 the doors
  const listA = await call(hostOf(addrA), "GET", `/api/public/firms/${A.key}/book`);
  const slotsA = await call(hostOf(addrA), "GET", `/api/public/firms/${A.key}/book/${SLUG}/slots`);
  const typesA: string[] = (listA.body?.types ?? []).map((t: { name: string }) => t.name);
  ok("QA-756 D3: on A's address A's doors answer: its list with A's type and none of B's, and the type's free times",
    listA.status === 200 && typesA.includes(TYPE_A) && !typesA.includes(TYPE_B) && slotsA.status === 200 && (slotsA.body?.slots?.length ?? 0) > 0,
    { list: listA.status, typesA, slots: slotsA.status, n: slotsA.body?.slots?.length });
  const crossList = await call(hostOf(addrA), "GET", `/api/public/firms/${B.key}/book`), crossSlots = await call(hostOf(addrA), "GET", `/api/public/firms/${B.key}/book/${SLUG}/slots`);
  const unknownType = await call(hostOf(addrA), "GET", `/api/public/firms/${A.key}/book/nope-${run}/slots`);
  ok("QA-756 D3 (fail cases): B's key in the path on A's address is the same one not-found as an unknown type (AG-4-17), nothing of B's",
    door404(crossList) && door404(crossSlots) && door404(unknownType) && crossList.text === unknownType.text && !crossList.text.includes(TYPE_B),
    { crossList: brief(crossList), crossSlots: brief(crossSlots), unknownType: brief(unknownType) });
  const siteNowhere = await call(hostOf(`nobody-${run}`), "GET", `/api/public/firms/${A.key}/book`);
  ok("QA-756 D3 (AG-4-17 rule 3): the doors' not-found on A's address is the same bytes and type as an unknown address's",
    crossList.text === siteNowhere.text && unknownType.text === siteNowhere.text && crossList.type === siteNowhere.type, { cross: crossList.text, nowhere: siteNowhere.text, types: [crossList.type, siteNowhere.type] });
  const listBMain = await call(MAIN, "GET", `/api/public/firms/${B.key}/book`);
  ok("QA-756 D3: on ExpatReady's own host B's list is unchanged", listBMain.status === 200 && (listBMain.body?.types ?? []).some((t: { name: string }) => t.name === TYPE_B), listBMain.status);

  // ---------------------------------------------------------------------------------------------- D4 a booking and its link
  const slot = slotsA.body?.slots?.[0];
  await wait(3_300);   // the form's minimum fill time (AG-4-20 rule 3)
  const booked = await call(hostOf(addrA), "POST", `/api/public/firms/${A.key}/book/${SLUG}/bookings`, { body: { givenNames: "Client", familyName: `QA756 ${run}`, email: `qa756.${run}@example.com`, mode: "VIDEO", startsAt: slot?.startsAt, timeZone: "America/Toronto", formStamp: slotsA.body?.formStamp } });
  const token = String(booked.body?.manageToken ?? "");
  const viewA = token ? await call(hostOf(addrA), "GET", `/api/public/bookings/${token}`) : booked, icsA = token ? await call(hostOf(addrA), "GET", `/api/public/bookings/${token}/ics`) : booked;
  ok("QA-756 D4: a visitor books A's type on A's address (201), and its link opens there (the booking and its calendar file)",
    booked.status === 201 && !!token && viewA.status === 200 && viewA.body?.typeName === TYPE_A && icsA.status === 200 && icsA.type.startsWith("text/calendar"),
    { booked: brief(booked), view: viewA.status, ics: icsA.status });
  const viewB = await call(hostOf(addrB), "GET", `/api/public/bookings/${token}`), slotsB = await call(hostOf(addrB), "GET", `/api/public/bookings/${token}/slots`);
  const badToken = await call(hostOf(addrA), "GET", `/api/public/bookings/00000000-0000-4000-8000-000000000000.${"x".repeat(43)}`);
  ok("QA-756 D4 (fail cases): A's link on B's address is the same one not-found as a link that does not exist, nothing of A's",
    door404(viewB) && door404(slotsB) && door404(badToken) && viewB.text === badToken.text && !viewB.text.includes(TYPE_A),
    { viewB: brief(viewB), slotsB: brief(slotsB), bad: brief(badToken) });
  const viewMain = token ? await call(MAIN, "GET", `/api/public/bookings/${token}`) : booked;
  ok("QA-756 D4: on ExpatReady's own host the same link still opens", viewMain.status === 200 && viewMain.body?.typeName === TYPE_A, viewMain.status);

  // ---------------------------------------------------------------------------------------------- D5 the pages in a browser
  const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {});
  try {
    const errors: string[] = [];
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(`http://${hostOf(addrA)}/book`);
    const cardA = await p.getByRole("link", { name: `Choose ${TYPE_A}` }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    const textA = await p.locator("body").innerText();
    if (cardA) await p.getByRole("link", { name: `Choose ${TYPE_A}` }).click();
    const timeSeen = await p.getByRole("heading", { name: "Choose a time" }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    ok("QA-756 D5 (screen): on A's address /book lists A's type and nothing of B's; Choose stays on A's address at /book/<type> and shows \"Choose a time\"",
      cardA && !textA.includes(TYPE_B) && timeSeen && p.url() === `http://${hostOf(addrA)}/book/${SLUG}`, { cardA, timeSeen, url: p.url() });
    await p.goto(`http://${hostOf(addrA)}/book/manage#${token}`);
    const manageSeen = await p.getByText(TYPE_A).first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
    await p.goto(`http://${hostOf(addrB)}/book/manage#${token}`);
    const manageOnB = await p.getByText(TYPE_A).first().waitFor({ timeout: 6_000 }).then(() => true, () => false);
    ok("QA-756 D5 (screen): the booker's page /book/manage#<link> on A's address shows the booking; the same link on B's address shows nothing of it",
      manageSeen && !manageOnB, { manageSeen, manageOnB });
    await p.goto(`http://${MAIN}/book/${A.key}`);
    const mainCard = await p.getByRole("link", { name: `Choose ${TYPE_A}` }).waitFor({ timeout: 20_000 }).then(() => true, () => false);
    if (mainCard) await p.getByRole("link", { name: `Choose ${TYPE_A}` }).click();
    const mainTime = await p.getByRole("heading", { name: "Choose a time" }).waitFor({ timeout: 20_000 }).then(() => true, () => false), mainUrl = p.url();
    await p.goto(`http://${MAIN}/book`);
    const mainBare = await p.getByText(PLAIN).first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
    ok("QA-756 D5 (screen): on ExpatReady's own host /book/<firm key> still lists and Choose goes to /book/<firm key>/<type>; /book alone is not available",
      mainCard && mainTime && mainUrl === `http://${MAIN}/book/${A.key}/${SLUG}` && mainBare, { mainCard, mainTime, mainUrl, mainBare });
    ok("QA-756 D5: no page error", errors.length === 0, errors.slice(0, 3));
  } finally { await browser.close(); }
} catch (e) {
  ok("QA-756: the check ran to its end", false, String(e).slice(0, 400));
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
