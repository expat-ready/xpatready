// J-10 (map row 10, R1.10: checking every input), written by the qa lane (22 Nov) ahead of PF-28 parts 3-5 (#2909, #2931,
// #2908, #2933), because no j_10 was on main. Done when (CAPABILITIES R1.10): every PF/FO route checks body, query and
// params against one schema; wrong type, missing, unknown and over-long fields each answer a field error in Problem
// Details naming the field in plain words; qa probes every route in the route table. Status as ruled by the tech lead
// (#2619, comment 7056094303): 422 on the platform and front-office doors, 400 on the case side; a malformed id is 404,
// a 1 MB body 413; never 2xx for a bad input and never 500.
// It walks an isolated copy of the running app (its own database and port, never :4400):
//   W1 (screen) the firm's Owner signs in on the sign-in card, opens Offices, Add an office, chooses Outside Canada and
//      types "1234" as the country: Save answers "Not saved" and the Country field itself says what is wrong in plain
//      words (the server's field error, shown on its field); nothing is stored.
//   W2 the sweep, one line per area (platform, front-office sales, booking, retainers, money): every route the app serves
//      under /api/platform, /api/front-office, /api/system, /api/public and /api/hooks (read from the app's own feature
//      list), asked as the Sample firm's representative (no token on public doors) with an unknown field, a wrong type,
//      a missing field and a 1 MB string (body), an unknown query field (query), and "not-a-uuid" in each path
//      parameter. A body or query probe answered 404 (a random record looked up before the input was read) proves
//      nothing, so it counts as not passing, as in PF-28's own check. Each line lists the routes that do not answer as
//      ruled. Routes whose keys no Sample token holds are named as not tested; the allow-list's by-design exceptions
//      (each with a written reason awaiting the tech lead) are not counted.
//   W3 over-long fields, per field: where the missing-field probe names required fields, each of them (at most three a
//      route) is sent alone as a 20,000-character string: a field error naming that field, never 2xx, 413 or 500.
//   W4 nothing stored by any probe (the PF/FO tables' row counts before and after), and no probe answered 500.
//   W5 the case side (/api/runtime, CS-V1, done; /api/link reads its link token first): an unknown field on its parameter-free routes answers 400
//      naming the field, and "not-a-uuid" in an id is 404; never 500.
//   W6 QA-507: a JSON body with an unknown charset, and with an unknown Content-Encoding, answers a 4xx problem in words,
//      never 500.
//   W7 DW6 (if /api/hooks/stripe is served): a body that is not a Stripe event, unsigned, is refused 4xx and stores nothing.
//   W8 the reviewed allow-list tests/pf28-allow-list.json holds no fix line (only by-design exceptions with a written
//      reason): its lines are the parts not yet built.
// Sample data only; US$0, no model call, live AI off. Screenshots: product/screens/J-10/screenshots/.
// Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j10 4472 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j10 4472 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_10.ts j10 4472
import "reflect-metadata";
import { MODULE_METADATA, PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants.js";
import { Reflector } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { recorder } from "../runtime/api.ts";

const NAME = process.argv[2] ?? "j10", PORT = Number(process.argv[3] ?? 4472), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-10", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const sql = (q: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, "-X", "-q", "-Atc", q], { encoding: "utf8" }).trim();
process.env.PLATFORM_ENVIRONMENT ??= "local";   // the feature files read the loader at import
const { registerFeatures } = await import("../../api/src/features.ts");
const { PLATFORM_ACCESS } = await import("../../api/src/platform/identity/keys.ts");
const { FIELD_ERROR_STATUS } = await import("../../api/src/platform/http/input.ts");

type Answer = { status: number; body: Record<string, unknown> | null };
const call = async (method: string, path: string, o: { token?: string; body?: string; headers?: Record<string, string> } = {}): Promise<Answer> => {
  const bodyless = ["GET", "HEAD", "OPTIONS", "DELETE"].includes(method);
  try {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(bodyless ? {} : { "content-type": "application/json" }), ...o.headers }, body: bodyless ? undefined : (o.body ?? "{}") });
    const t = await r.text(); let body: Record<string, unknown> | null = null; try { body = JSON.parse(t); } catch { /* not JSON */ }
    return { status: r.status, body };
  } catch { return { status: 0, body: null }; }
};
/** Named in the answer: PF/FO's `fields` object, or the case side's `errors[].field`. */
const named = (a: Answer, k: string) => (typeof a.body?.fields === "object" && a.body.fields !== null && k in (a.body.fields as object))
  || ((a.body?.errors as { field?: string; message?: string }[] | undefined) ?? []).some((e) => e.field === k || (e.message ?? "").includes(k));
const plainWords = (a: Answer, k: string) => { const f = (a.body?.fields as Record<string, unknown> | undefined)?.[k]; return typeof f === "string" ? /^[^{}<>]{3,200}$/.test(f) && !/zod|invalid_type|Expected /i.test(f) : true; };

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD", "SEARCH"];
type Door = { method: string; path: string; body: boolean; query: boolean; keys: string[] | null; open: boolean };
const PFFO = /^\/api\/(platform|front-office|system|public|hooks)(\/|$)/, CASE = /^\/api\/runtime(\/|$)/;   // /api/link doors read their link first (an unknown link is 404 by design)
function doors(controllers: unknown[], within: RegExp): Door[] {
  const out: Door[] = [], reflector = new Reflector();
  for (const c of controllers as (new (...a: never[]) => object)[]) {
    if (!c?.prototype) continue;
    for (const base of ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, c) ?? "")) for (const key of Object.getOwnPropertyNames(c.prototype)) {
      const h = (c.prototype as Record<string, unknown>)[key];
      if (key === "constructor" || typeof h !== "function" || Reflect.getMetadata(METHOD_METADATA, h) === undefined) continue;
      const args = Object.keys(Reflect.getMetadata(ROUTE_ARGS_METADATA, c, key) ?? {}).map((k) => Number(k.split(":")[0]));
      const access = reflector.getAllAndOverride<{ kind: string; keys?: string[] }>(PLATFORM_ACCESS, [h as () => unknown, c]);
      for (const p of ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, h) ?? "")) {
        const path = `/${[base, p].join("/")}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
        if (within.test(path)) out.push({ method: METHODS[Reflect.getMetadata(METHOD_METADATA, h) as number] ?? "?", path, body: args.includes(3), query: args.includes(4), keys: access?.kind === "keys" ? access.keys! : null, open: !access });
      }
    }
  }
  return out;
}
/** The area a route belongs to, as PF-28's parts are cut (by path). */
const areaOf = (path: string) => /\/money\//.test(path) ? "money" : /retainer/.test(path) ? "retainers"
  : /booking|availability|time-off|consult|\/api\/public\/(firms|bookings)/.test(path) ? "booking"
    : /front-office|\/api\/public\/(forms|embed)/.test(path) ? "front-office sales" : "platform";
const AREAS = ["platform", "front-office sales", "booking", "retainers", "money"];

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
try {
  const reached = (await call("GET", "/api/public/plans")).status !== 0;
  ok(`J-10 setup: the copy answers on :${PORT}`, reached);
  if (!reached) throw new Error("no copy");

  // ------------------------------------------------------------------------------------------------ W1: on screen
  const owner = sql(`select s.email from platform_staff s join platform_role_grant g on g.staff_id = s.id join platform_firm f on f.id = s.firm_id where f.key = 'sample-firm' and g.role = 'OWNER' and s.status = 'ACTIVE' order by s.created_at limit 1`);
  const offices = () => sql(`select count(*) from platform_office`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(owner); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 20_000 });
  await p.goto(`${BASE}/platform/offices`); await p.locator("main h1").first().waitFor({ timeout: 20_000 });
  const o0 = offices();
  await p.getByRole("button", { name: "Add an office" }).click();
  await p.locator("[data-office-name]").fill("Sample Office J10");
  await p.locator("[data-office-abroad]").check();
  await p.locator("[data-office-country]").fill("1234");
  const zone = p.locator("[data-office-zone]"); if (await zone.count()) await zone.selectOption({ index: 1 }).catch(() => undefined);
  await p.locator("[data-office-save]").click();
  await p.locator("[data-office-problem]").waitFor({ timeout: 15_000 }).catch(() => undefined);
  const country = p.getByLabel("Country (two-letter code, for example GB)");
  const invalid = await country.getAttribute("aria-invalid"), problem = await p.locator("[data-office-problem]").innerText().catch(() => "");
  const fieldWords = await country.evaluate((el) => (el.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim()).catch(() => "");
  await shot(p, "w1-office-country-refused-1440");
  ok("J-10 W1 (screen): an Owner adds an office outside Canada with country \"1234\": \"Not saved\", the Country field itself is marked and says what is wrong in plain words; nothing stored",
    invalid === "true" && problem.length > 0 && fieldWords.length > 0 && offices() === o0, { invalid, problem, fieldWords, owner: !!owner });
  await ctx.close();

  // ------------------------------------------------------------------------------------------------ W2-W4: the sweep
  class Features {}
  await registerFeatures(Features);
  const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, Features) ?? [];
  const all = doors(controllers, PFFO);
  ok(`J-10 W2: the route table read from the app's own feature list: ${all.length} PF/FO routes (${all.filter((d) => d.body).length} take a body, ${all.filter((d) => d.query).length} a query)`, all.length >= 150, all.length);
  const signIn = async (actorId: string) => (await call("POST", "/api/platform/session/local", { body: JSON.stringify({ firmKey: "sample-firm", actorId, secondStep: true }) })).body?.token as string;
  const tR = await signIn("user-R"), keysR = new Set<string>(((await call("GET", "/api/platform/me", { token: tR })).body?.keys as string[]) ?? []);
  const rows = () => sql(`select coalesce(string_agg(relname || ':' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', relname), false, true, '')))[1]::text, ',' order by relname), '') from pg_stat_user_tables where (relname ~ '^(platform_|fo_|money_|msg_|plat_|auto_)' or relname in ('module_event', 'webhook_receipt')) and relname not in ('platform_session', 'msg_firm')`);
  const before = rows();
  const REAL: Record<string, string> = { ":firmKey": "sample-firm", ":kind": "logo", ":slug": sql(`select coalesce(min(slug), '') from fo_consultation_type where firm_id = (select id from platform_firm where key = 'sample-firm') and active and show_on_booking_page and deleted_at is null`) };
  const formToken = sql(`select coalesce(min(public_token), '') from fo_web_form where firm_id = (select id from platform_firm where key = 'sample-firm')`);
  const keyOf = (path: string, m: string) => (m === ":token" && path.startsWith("/api/public/forms/") ? ":formToken" : m);
  if (formToken) REAL[":formToken"] = formToken;
  const fill = (path: string, bad?: string) => path.replace(/:[A-Za-z_]+/g, (m) => (m === bad ? "not-a-uuid" : REAL[keyOf(path, m)] || randomUUID()));
  const MB = "a".repeat(1024 * 1024), LONG = "a".repeat(20_000);
  // The reviewed by-design exceptions (each with its written reason, awaiting the tech lead) are not counted as failing.
  const excepted = new Set(Object.keys((JSON.parse(readFileSync(join(STUDIO, "tests", "pf28-allow-list.json"), "utf8")) as { exceptions?: { probes?: Record<string, string> } }).exceptions?.probes ?? {}));
  const failing: Record<string, string[]> = Object.fromEntries(AREAS.map((a) => [a, []])), probed: Record<string, number> = Object.fromEntries(AREAS.map((a) => [a, 0]));
  const notTested: string[] = [], five: string[] = [], overLong: string[] = [];
  let overLongTried = 0;
  for (const d of all) {
    if (d.keys && !d.keys.every((k) => keysR.has(k))) { notTested.push(`${d.method} ${d.path}`); continue; }
    const token = d.open ? undefined : tR, method = d.method === "ALL" ? "POST" : d.method, area = areaOf(d.path), route = `${d.method} ${d.path}`;
    const bad = (probe: string, a: Answer) => { if (excepted.has(`${route} ${probe}`)) return; failing[area].push(`${route} ${probe} → ${a.status}`); if (a.status >= 500) five.push(`${route} ${probe}`); };
    if (d.body) {
      const u = await call(method, fill(d.path), { token, body: JSON.stringify({ pf28Unknown: "x" }) }); probed[area]++;
      if (!(u.status === FIELD_ERROR_STATUS && named(u, "pf28Unknown") && plainWords(u, "pf28Unknown"))) bad("unknown", u);
      const w = await call(method, fill(d.path), { token, body: "[1]" }); probed[area]++;
      if (w.status !== FIELD_ERROR_STATUS) bad("wrong-type", w);
      const m = await call(method, fill(d.path), { token, body: "{}" }); probed[area]++;
      if (!(m.status === FIELD_ERROR_STATUS || (m.status >= 200 && m.status < 300))) bad("missing", m);
      const big = await call(method, fill(d.path), { token, body: JSON.stringify({ pf28: MB }) }); probed[area]++;
      if (big.status !== 413) bad("1mb", big);
      // W3: each required field the missing probe names, alone and over-long.
      const required = m.status === FIELD_ERROR_STATUS ? Object.keys((m.body?.fields as object) ?? {}).filter((k) => /^[A-Za-z][A-Za-z0-9_]*$/.test(k)).slice(0, 3) : [];
      for (const f of required) {
        overLongTried++;
        const l = await call(method, fill(d.path), { token, body: JSON.stringify({ [f]: LONG }) });
        if (!(l.status === FIELD_ERROR_STATUS && named(l, f))) { overLong.push(`${route} ${f} → ${l.status}`); if (l.status >= 500) five.push(`${route} long:${f}`); }
      }
    }
    if (d.query) {
      const q = await call(method, `${fill(d.path)}?pf28Unknown=x`, { token, body: d.body ? "{}" : undefined }); probed[area]++;
      if (!(q.status === FIELD_ERROR_STATUS && named(q, "pf28Unknown"))) bad("query-unknown", q);
    }
    for (const prm of d.path.match(/:[A-Za-z_]+/g) ?? []) {
      if (REAL[prm] !== undefined || d.path.startsWith("/api/public/")) continue;   // a key, not a record id
      const i = await call(method, fill(d.path, prm), { token, body: d.body ? "{}" : undefined }); probed[area]++;
      if (i.status !== 404) bad(`id${prm}`, i);
    }
  }
  for (const area of AREAS) {
    const f = failing[area], routes = [...new Set(f.map((x) => x.split(" ").slice(0, 2).join(" ")))];
    ok(`J-10 W2 ${area}: every probe answers as ruled (${FIELD_ERROR_STATUS} naming the field, 413, 404) — ${probed[area]} probes, ${f.length} not as ruled on ${routes.length} routes`, f.length === 0 && probed[area] > 0, f.slice(0, 12));
  }
  console.log(`NOT TESTED  J-10 W2: ${notTested.length} routes whose keys no Sample token holds: ${notTested.join(", ")}`);
  ok(`J-10 W3: every required field sent alone at 20,000 characters answers a field error naming it (${overLongTried} fields tried)`, overLongTried > 0 && overLong.length === 0, overLong.slice(0, 12));
  const after = rows();
  const changed = before.split(",").filter((x) => !after.split(",").includes(x));
  ok("J-10 W4: nothing stored by any probe (the PF/FO tables' row counts are unchanged)", changed.length === 0, changed);
  ok("J-10 W4: no probe answered 500", five.length === 0, five);

  // ------------------------------------------------------------------------------------------------ W5: the case side
  const cs = doors(controllers, CASE), csBad: string[] = [];
  let csProbes = 0;
  for (const d of cs) {
    const method = d.method === "ALL" ? "POST" : d.method, params = d.path.match(/:[A-Za-z_]+/g) ?? [];
    if (!params.length && d.body && method !== "GET") { csProbes++; const a = await call(method, d.path, { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) }); if (!(a.status === 400 && named(a, "pf28Unknown"))) csBad.push(`${d.method} ${d.path} unknown → ${a.status}`); }
    if (!params.length && d.query && method === "GET") { csProbes++; const a = await call(method, `${d.path}?pf28Unknown=x`, { token: tR }); if (!(a.status === 400 && named(a, "pf28Unknown"))) csBad.push(`${d.method} ${d.path} query-unknown → ${a.status}`); }
    for (const prm of params.filter((x) => /id$/i.test(x))) { csProbes++; const a = await call(method, d.path.replace(/:[A-Za-z_]+/g, (m) => (m === prm ? "not-a-uuid" : randomUUID())), { token: tR, body: d.body ? "{}" : undefined }); if (a.status >= 500 || a.status === 0) csBad.push(`${d.method} ${d.path} id${prm} → ${a.status}`); }
  }
  ok(`J-10 W5 case side (${cs.length} routes, ${csProbes} probes): an unknown field answers 400 naming it; a malformed id never 500`, cs.length > 0 && csProbes > 0 && csBad.length === 0, csBad.slice(0, 12));

  // ------------------------------------------------------------------------------------------------ W6: QA-507
  const sign = JSON.stringify({ firmKey: "sample-firm", actorId: "user-R", secondStep: true });
  const charset = await call("POST", "/api/platform/session/local", { body: sign, headers: { "content-type": "application/json; charset=klingon" } });
  const encoding = await call("POST", "/api/platform/session/local", { body: sign, headers: { "content-encoding": "zstd-nope" } });
  ok("J-10 W6 (QA-507): a JSON body with an unknown charset, and one with an unknown Content-Encoding, each answer a 4xx problem in words, never 500",
    [charset, encoding].every((a) => a.status >= 400 && a.status < 500 && typeof a.body?.detail === "string"), { charset: charset.status, encoding: encoding.status });

  // ------------------------------------------------------------------------------------------------ W7: DW6
  if (!all.some((d) => d.path === "/api/hooks/stripe")) console.log("NOT TESTED  J-10 W7: /api/hooks/stripe is not served");
  else {
    const receipts = () => sql(`select count(*) from webhook_receipt`), r0 = receipts();
    const h = await call("POST", "/api/hooks/stripe", { body: JSON.stringify({ pf28Unknown: "x" }), headers: { "stripe-signature": "t=1,v1=00" } });
    ok("J-10 W7 (DW6): an unsigned body that is not a Stripe event is refused 4xx and stores nothing", h.status >= 400 && h.status < 500 && receipts() === r0, h);
  }

  // ------------------------------------------------------------------------------------------------ W8: the allow-list
  const allow = JSON.parse(readFileSync(join(STUDIO, "tests", "pf28-allow-list.json"), "utf8")) as { unparsed: Record<string, string>; probes: Record<string, string> };
  const byPart: Record<string, number> = {};
  for (const v of [...Object.values(allow.unparsed), ...Object.values(allow.probes)]) byPart[v] = (byPart[v] ?? 0) + 1;
  ok("J-10 W8: the PF-28 allow-list holds no fix line (only by-design exceptions remain): every input of every PF/FO route is read through the one rule", Object.keys(allow.unparsed).length + Object.keys(allow.probes).length === 0, byPart);
  ok("J-10: no page error during the walk", errors.length === 0, errors);
} catch (e) {
  ok("J-10: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
