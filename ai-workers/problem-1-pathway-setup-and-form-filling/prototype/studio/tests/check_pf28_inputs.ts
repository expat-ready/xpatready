// PF-28 part 1 (R1.10, map row 10, the PF/FO half; AG-18-57, AG-16-28, AG-10-32; STANDARDS §6): every platform and
// front-office door checks its input, proven by a sweep. Two halves:
//   (a) the code: every body or query a route under /api/platform, /api/front-office, /api/system, /api/public or
//       /api/hooks takes reaches a zod parse (tests/lib/routes.ts follows it into the service; `parseInput` counts);
//   (b) a running copy: every route the app serves under those paths (read from the app's own feature list, the way PF-4's
//       start-up rule reads it) is asked, with the Owner's token (none on public doors), an unknown field, a wrong type, a
//       missing field and a 1 MB string where it takes a body, an unknown query field where it takes a query, and
//       "not-a-uuid" in each path parameter. Each must answer 400, 404, 413 or 422 (an empty body may pass only when it
//       changes nothing), never 2xx and never 500, and the PF/FO tables' row counts are unchanged.
// What fails today is the reviewed allow-list tests/pf28-allow-list.json, each entry naming its fix part; it only shrinks
// (an entry fixed or gone fails, an entry with no fix part fails). Named cases DW1-DW7 (DW8 is the PR's browser run).
// Field errors answer 422 (Lead B rev 17.21; FIELD_ERROR_STATUS; question on #2619). US$0, no model call.
//   zsh studio/tools/isolated.sh runtime_pf28 4487 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf28_inputs.ts 4487 xr_studio_runtime_pf28
// (by hand, from studio/: tsx --tsconfig api/tsconfig.json tests/check_pf28_inputs.ts 4487 xr_studio_runtime_pf28; run-suites.sh adds it)
import "reflect-metadata";
import { MODULE_METADATA, PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants.js";
import { Reflector } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { follows, routes as codeRoutes } from "./lib/routes.ts";
import { planted } from "./lib/ts-files.ts";

const PORT = Number(process.argv[2] ?? 4487), DB = process.argv[3] ?? "xr_studio_runtime_pf28", BASE = `http://localhost:${PORT}`;
const STUDIO = join(import.meta.dirname, ".."), API = join(STUDIO, "api", "src"), LIST = join(import.meta.dirname, "pf28-allow-list.json");
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const sql = (q: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${DB}`, "-X", "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
export const DOORS = /^\/api\/(platform|front-office|system|public|hooks)(\/|$)/;
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 700)}` : ""}`); };

// ------------------------------------------------------------------------------------------------- the allow-list
/** "<file> <VERB> <path> <body|query>[(key)]" (code) or "<VERB> <path> <probe>" (running copy) → "PF-28 part N (area)". */
export type AllowList = { unparsed: Record<string, string>; probes: Record<string, string>; exceptions?: { unparsed?: Record<string, string>; probes?: Record<string, string> } };
/** PF-28 part 2c: a line that answers otherwise by design, with its written reason for the tech lead to accept ("except
 *  lines with a written reason the Lead accepts"). It still must fail the way it says (a fixed or gone one fails, as on the
 *  list); it counts in no fix ceiling. */
export const REASON = /^By design \(awaiting the tech lead\): .{40,}$/;
export const unreasoned = (l: AllowList) => [...Object.entries(l.exceptions?.unparsed ?? {}), ...Object.entries(l.exceptions?.probes ?? {})].filter(([, v]) => !REASON.test(String(v ?? ""))).map(([k]) => k);
export const FIX_PART = /^PF-28 part [2-9] \((platform|front-office sales|booking|retainers|money)\)$/;
/** DW7: every entry names its fix part. */
export const unnamed = (l: AllowList) => [...Object.entries(l.unparsed), ...Object.entries(l.probes)].filter(([, v]) => !FIX_PART.test(String(v ?? ""))).map(([k]) => k);
/** The fix part of an area, by the route's file (code) or path (running copy). */
export function partOf(where: string): string {
  if (/\/money\/|^front-office\/money/.test(where)) return "PF-28 part 6 (money)";
  if (/retainer/.test(where)) return "PF-28 part 5 (retainers)";
  if (/booking|availability|time-off|consult|\/api\/public\/(firms|bookings)/.test(where)) return "PF-28 part 4 (booking)";
  if (/front-office|\/api\/public\/(forms|embed)/.test(where)) return "PF-28 part 3 (front-office sales)";
  return "PF-28 part 2 (platform)";
}
/** The list only shrinks: what fails and is not listed, and what is listed but passes now (or is gone). */
export function judge(failing: Iterable<string>, seen: Iterable<string>, listed: Record<string, string>) {
  const f = new Set(failing), s = new Set(seen);
  return { unlisted: [...f].filter((k) => !(k in listed)), fixedButListed: Object.keys(listed).filter((k) => !s.has(k) || !f.has(k)) };
}
const allow: AllowList = JSON.parse(readFileSync(LIST, "utf8"));

// ------------------------------------------------------------------------------------- (a) the code: every input parses
type CodeInput = { key: string; parsedAt: string | null };
export function inputs(dir: string): CodeInput[] {
  return codeRoutes(dir).filter((r) => DOORS.test(r.path)).flatMap((r) => r.inputs.filter((i) => i.kind !== "param")
    .map((i) => ({ key: `${r.file} ${r.verb} ${r.path} ${i.kind}${i.key ? `(${i.key})` : ""}`, parsedAt: follows(dir, r.controller, r.node, i.name) })));
}
/** The signed webhook doors (amendment 1) keep their raw body: the signature is checked first and the schema after, so the
 *  static follower, which never reads a raw body as parsed, does not judge them; each has its named signature-and-schema
 *  check instead. Only these two (review r15-1; the tech lead's ask, Lead 4 16:02 IST 22 Nov, done in #3039): Stripe's, judged over HTTP by DW6
 *  below; SNS's (SES notices, text/plain read off the request), judged by tests/check_pf19b2_ses.ts "PF-28 fail: a signed
 *  notice whose envelope breaks the schema" (its schema `SnsNotice` runs through parseInput after the signature); the
 *  "PF-28 HOOK" check below ties that exemption to its proof (review m1 on #3039). */
const HOOK = new Set(["platform/billing/routes.ts POST /api/hooks/stripe body", "platform/messages/public-routes.ts POST /api/public/messages/ses-notices body",
  "client-money/card/routes.ts POST /api/hooks/stripe-connect body",   // FO-7c part 1 (Lead B on #2938): its signature and schema pairs over HTTP are in check_fo7c_card_payments.ts
  "front-office/signing/hooks.ts POST /api/hooks/signing/:provider body"]);   // FO-6 part 3 (#3065): the signature first (unverified 400), then the port's strict schema; pairs in check_fo6_signing_api.ts W1 and B
// Review m1 (#3039): the SNS exemption holds only while its proof does: the door parses SnsNotice after verify, and the
// named case in check_pf19b2_ses.ts exists (a deleted or renamed case fails here).
{ const b = readFileSync(join(API, "platform/messages/channels/email/bounces.ts"), "utf8"), v = b.indexOf("await this.verify(n);"), p = b.indexOf("parseInput(SnsNotice, n)");
  const ses = readFileSync(join(import.meta.dirname, "check_pf19b2_ses.ts"), "utf8");
  ok("PF-28 HOOK pass: the SNS door parses SnsNotice after its signature, and check_pf19b2_ses keeps the case that proves it", v > 0 && p > v && ses.includes("PF-28 fail: a signed notice whose envelope breaks the schema") && ses.includes("PF-28 pass: AWS's documented"), { v, p }); }
const found = inputs(API), unparsed = found.filter((x) => !x.parsedAt && !HOOK.has(x.key)).map((x) => x.key);
console.log(`code: ${found.length} inputs under the PF/FO doors, ${unparsed.length} reach no zod parse (allow-listed: ${Object.keys(allow.unparsed).length})`);
const jc = judge(unparsed, found.map((x) => x.key), { ...allow.unparsed, ...allow.exceptions?.unparsed });
ok("PF-28 (a) pass: every PF/FO body and query reaches a zod parse, or is on the allow-list", jc.unlisted.length === 0, jc.unlisted);
ok("PF-28 (a) pass: the code list only shrinks (no entry parses now or is gone)", jc.fixedButListed.length === 0, jc.fixedButListed);

// DW1: a throwaway route with an unparsed body fails the sweep; the same route given a schema passes.
const thing = (line: string) => `import { Body, Controller, Inject, Injectable, Param, Post } from "@nestjs/common";
import { parseInput, strict, text } from "../../platform/http/input.ts";
const Thing = strict({ name: text(100) });
@Injectable() export class Things { async put(id: string, body: unknown) { ${line} return { id }; } }
@Controller("api/front-office") export class ThingsController {
  constructor(@Inject(Things) private readonly t: Things) {}
  @Post("things/:id") put(@Param("id") id: string, @Body() b: unknown) { return this.t.put(id, b); }
}`;
const dw1bad = judge(inputs(planted({ "front-office/things/routes.ts": thing("const b = body as { name?: string };") })).filter((x) => !x.parsedAt).map((x) => x.key), [], {});
const dw1good = inputs(planted({ "front-office/things/routes.ts": thing("const b = parseInput(Thing, body);") }));
ok("PF-28 DW1 fail: a throwaway front-office route with an unparsed body fails the sweep", dw1bad.unlisted.join() === "front-office/things/routes.ts POST /api/front-office/things/:id body", dw1bad);
ok("PF-28 DW1 pass: the same route reading its body through parseInput(strict schema) passes", dw1good.length === 1 && dw1good[0].parsedAt === "Things.put", dw1good);
// Part 2c (review m4): the code follower follows `extends`. A controller calling a method its service inherits is followed
// into the parent class: parsed there → passes; the parent never parsing it → still fails.
const heir = (line: string) => `import { Body, Controller, Inject, Injectable, Param, Post } from "@nestjs/common";
import { parseInput, strict, text } from "../../platform/http/input.ts";
const Thing = strict({ name: text(100) });
export class BaseThings { async put(id: string, body: unknown) { ${line} return { id }; } }
@Injectable() export class Things extends BaseThings {}
@Controller("api/front-office") export class ThingsController {
  constructor(@Inject(Things) private readonly t: Things) {}
  @Post("things/:id") put(@Param("id") id: string, @Body() b: unknown) { return this.t.put(id, b); }
}`;
const inheritedGood = inputs(planted({ "front-office/things/routes.ts": heir("const b = parseInput(Thing, body);") })), inheritedBad = inputs(planted({ "front-office/things/routes.ts": heir("const b = body as { name?: string };") }));
ok("PF-28 part 2c pass (review m4): a body parsed in the method a service inherits from its parent class counts as parsed", inheritedGood.length === 1 && inheritedGood[0].parsedAt === "BaseThings.put", inheritedGood);
ok("PF-28 part 2c fail (review m4): the same inherited method without a parse still fails the sweep", inheritedBad.length === 1 && inheritedBad[0].parsedAt === null, inheritedBad);

// DW7: the allow-list is checked in and every entry names its fix part; one with no part fails.
ok("PF-28 DW7 pass: every allow-list entry names its fix part (PF-28 part 2-6, by area)", unnamed(allow).length === 0, unnamed(allow));
ok("PF-28 DW7 pass (part 2c): every by-design exception carries its written reason (at least 40 characters)", unreasoned(allow).length === 0, unreasoned(allow));
ok("PF-28 DW7 fail (part 2c): an exception without a reason, or with a fix part instead, fails", unreasoned({ unparsed: {}, probes: {}, exceptions: { probes: { "GET /api/platform/x query-unknown": "PF-28 part 2 (platform)", "GET /api/platform/y query-unknown": "By design (awaiting the tech lead): short" } } }).length === 2);
/** The list only shrinks (review m1): its size as committed in part 1; a fix part lowers these numbers, never raises them. */
const PROBES_CEILING = 0, UNPARSED_CEILING = 0, EXCEPTIONS_CEILING = 21;   // R1.10 A4 (Lead 28 on #3487, 24 Nov): + the two system staff doors whose reason the code makes optional (reactivate, end-sessions); before:   // part 5 (retainers), merged after the SNS line (#3039): its 23 probe and 8 code lines leave (23 → 0, 8 → 0: both lists are empty), two by-design lines join the exceptions (Prepare retainer and the download link, accepted by Lead 4; 17 → 19); earlier: the SNS body (part 2's last code line) leaves: its schema runs after the signature, judged by check_pf19b2_ses (9 → 8); earlier: part 4 (booking), merged after parts 3a-3b: its 70 probe lines leave (93 → 23), two by-design lines join the exceptions (the cancel by link and the consult record take {} as a valid body; 15 → 17, awaiting the tech lead); earlier: part 3b (the rest of front-office sales) lowers them to 93 and 9 and moves to the exceptions "confirm missing" ({} confirms a check whose result is set) and the public form's 4 probe lines (the sweep has no live form; check_fo4_sales_browser and check_fo2_leads_prospects prove the door): 10 → 15; part 3a (sales/routes.ts: leads, prospects, calls, notes, web-form settings) lowers them from 161 and 44 to 131 and 24 (124 with part 6's 7 lines gone, #2883), and moves "convert missing" to the exceptions ({} is a valid Convert: 9 → 10); re-based at the merge of main after part 2a (#2787): part 1 as merged added 6 probe lines for part 4 (#2750's booking timings; their 2 code lines leave, the extends follow sees their parse) and part 2a's callback "missing" line moved to the exceptions; earlier: part 1 committed 238 and 81; part 2a (identity doors) 207 and 71; part 2b (platform settings, complaints, logs) 171 and 61; part 2c (sign-up; 9 by-design lines moved to exceptions; the code follower now follows `extends`, so 15 booking inputs a parent class already parsed leave; the SNS body stays a part-2 fix, review M2) 157 and 44; the exceptions are pinned at 8 (review m1); each fix part lowers both 161: DEMO-LINK (#2687) seeds a Sample type, so the two public booking doors are reached (their 'unreached' entries go; their probes stay listed for part 4)
const excepted = Object.keys(allow.exceptions?.unparsed ?? {}).length + Object.keys(allow.exceptions?.probes ?? {}).length;
ok("PF-28 DW7 fail: the allow-list never grows past its committed size (the by-design exceptions included)", Object.keys(allow.unparsed).length <= UNPARSED_CEILING && Object.keys(allow.probes).length <= PROBES_CEILING && excepted <= EXCEPTIONS_CEILING, { unparsed: Object.keys(allow.unparsed).length, probes: Object.keys(allow.probes).length, exceptions: excepted });
ok("PF-28 DW7 fail: an entry added without its fix part (or with another row's id) fails", unnamed({ unparsed: { "x.ts POST /api/platform/x body": "" }, probes: { "POST /api/platform/x unknown": "PF-5 part 3" } }).length === 2);

// The rule's own words (break m1-m3): a missing field and a wrong type say different things; "constructor" is named like
// any field; a "__proto__" key is refused; a long unknown key name is cut to 64 characters; never the value.
const { parseInput, strict: strictOf, text: textOf } = await import("../api/src/platform/http/input.ts");
const refusal = (v: unknown) => { try { parseInput(strictOf({ name: textOf(50) }), v); return null; } catch (e) { return (e as { getResponse(): { status: number; fields: Record<string, string>; detail: string } }).getResponse(); } };
const [missing, wrong, ctor, proto, long, good] = [{}, { name: 7 }, { name: "a", constructor: 1 }, JSON.parse('{"name":"a","__proto__":{"x":1}}'), { name: "a", ["k".repeat(300)]: "secret value" }, { name: "Sample" }].map(refusal);
ok("PF-28 rule pass: a missing field says it is required; a wrong type says what it must be", missing?.fields.name === "This is required." && wrong?.fields.name === "This must be text.", [missing?.fields, wrong?.fields]);
ok("PF-28 rule fail (break m2): \"constructor\" and \"__proto__\" are refused and named, never accepted or \"0 fields\"", Object.hasOwn(ctor?.fields ?? {}, "constructor") && Object.hasOwn(proto?.fields ?? {}, "__proto__") && !/^0 fields/.test(ctor?.detail ?? "0"), [ctor?.detail, proto?.detail]);
ok("PF-28 rule fail (break m3): an unknown key's name is cut to 64 characters and the value is never repeated; a good body passes", Object.keys(long?.fields ?? {}).every((k) => k.length <= 64) && !JSON.stringify(long).includes("secret value") && good === null && long?.status === 422, long?.fields);

// PF-28 part 2a (batch 44935069729: check_forms_qa53, check_qa621): the local sign-in door's own gate comes before its body
// is read. Closed (PLATFORM_IDENTITY not local, as in production) → 403 LOCAL_SIGN_IN_OFF whatever the body; open → a bad
// body is 422 naming the field. Through the route's own controller with stand-in ports: the gate and the parse run before any query.
{
  const { PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
  const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
  const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
  const answer = async (port: unknown, body: unknown) => { try { await new PlatformIdentityController(new PlatformIdentity(null as never, port as never, { now: () => Date.now() } as never)).local(body as never); return null; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => { code?: string; fields?: Record<string, string> } }; return { status: x.getStatus?.(), ...x.getResponse?.() }; } };
  const closed = await answer({ via: "cognito", verify: async () => { throw new Error("not used"); } }, { pf28Unknown: "x" }), closedEmpty = await answer({ via: "cognito", verify: async () => { throw new Error("not used"); } }, {});
  const open = await answer(new LocalIdentity("pf28-test-secret", () => Date.now()), { pf28Unknown: "x" });
  ok("PF-28 part 2a fail (batch 44935069729): the closed local sign-in door answers 403 LOCAL_SIGN_IN_OFF before reading the body (an unknown field or {} is never a 422 there)", closed?.status === 403 && closed.code === "LOCAL_SIGN_IN_OFF" && closedEmpty?.status === 403 && closedEmpty.code === "LOCAL_SIGN_IN_OFF", [closed, closedEmpty]);
  ok("PF-28 part 2a pass: the open door still reads its body through the one rule (an unknown field → 422 naming it)", open?.status === 422 && Object.hasOwn(open.fields ?? {}, "pf28Unknown"), open);
}

// ------------------------------------------------------------------------------------- (b) a running copy: the probes
process.env.PLATFORM_ENVIRONMENT ??= "local";   // PF-24w: required, no default (the feature files read the loader at import)
const { registerFeatures } = await import("../api/src/features.ts");
const { PLATFORM_ACCESS } = await import("../api/src/platform/identity/keys.ts");
const { SYSTEM_ACCESS } = await import("../api/src/platform/system-identity/keys.ts");
const { FIELD_ERROR_STATUS } = await import("../api/src/platform/http/input.ts");
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD", "SEARCH"];
type Door = { method: string; path: string; body: boolean; query: boolean; keys: string[] | null; open: boolean; system: boolean };
/** Every route the app serves under the doors, with what it reads (Nest's own argument metadata: @Body 3, @Query 4). */
export function doors(controllers: unknown[]): Door[] {
  const out: Door[] = [], reflector = new Reflector();
  for (const c of controllers as (new (...a: never[]) => object)[]) {
    if (!c?.prototype) continue;
    for (const base of ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, c) ?? "")) for (const key of Object.getOwnPropertyNames(c.prototype)) {
      const h = (c.prototype as Record<string, unknown>)[key];
      if (key === "constructor" || typeof h !== "function" || Reflect.getMetadata(METHOD_METADATA, h) === undefined) continue;
      const args = Object.keys(Reflect.getMetadata(ROUTE_ARGS_METADATA, c, key) ?? {}).map((k) => Number(k.split(":")[0]));
      const access = reflector.getAllAndOverride<{ kind: string; keys?: string[] }>(PLATFORM_ACCESS, [h as () => unknown, c]);
      // PF-4s: our own staff's routes (SystemGuard) need a session of our own staff pool, which no Sample firm token is;
      // their sign-in door (kind "sign-in") is open and probed as any open door.
      const sys = reflector.getAllAndOverride<{ kind: string }>(SYSTEM_ACCESS, [h as () => unknown, c]);
      for (const p of ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, h) ?? "")) {
        const path = `/${[base, p].join("/")}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
        if (DOORS.test(path)) out.push({ method: METHODS[Reflect.getMetadata(METHOD_METADATA, h) as number] ?? "?", path, body: args.includes(3), query: args.includes(4), keys: access?.kind === "keys" ? access.keys! : null, open: !access && (!sys || sys.kind === "sign-in"), system: !!sys && sys.kind !== "sign-in" });
      }
    }
  }
  return out;
}
class Features {}
await registerFeatures(Features);
const all = doors(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, Features) ?? []);
console.log(`running copy: ${all.length} routes under the PF/FO doors (${all.filter((d) => d.body).length} take a body, ${all.filter((d) => d.query).length} a query, ${all.filter((d) => /:/.test(d.path)).length} path parameters)`);
ok("PF-28 (b): the sweep reads every PF/FO route the app serves, the open doors and functionally registered controllers included", all.length >= 150 && all.some((d) => d.path === "/api/public/firms/:firmKey/book") && all.some((d) => d.path.startsWith("/api/public/signup")), all.length);

type Answer = { status: number; body: Record<string, unknown> | null };
const call = async (method: string, path: string, o: { token?: string; body?: string } = {}): Promise<Answer> => {
  const bodyless = method === "GET" || method === "HEAD" || method === "OPTIONS" || method === "DELETE";
  try {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(bodyless ? {} : { "content-type": "application/json" }) }, body: bodyless ? undefined : (o.body ?? "{}") });
    const t = await r.text(); let body: Record<string, unknown> | null = null; try { body = JSON.parse(t); } catch { /* not JSON */ }
    return { status: r.status, body };
  } catch { return { status: 0, body: null }; }
};
const reached = (await call("GET", "/api/public/plans")).status !== 0;
ok(`PF-28 (b): a copy answers on :${PORT}`, reached, reached ? undefined : `start it: zsh studio/tools/isolated.sh runtime_pf28 ${PORT} start`);
if (!reached) { console.log(`${pass}/${pass + fail} passed`); process.exit(1); }
const signIn = async (actorId: string, firmKey = "sample-firm") => (await call("POST", "/api/platform/session/local", { body: JSON.stringify({ firmKey, actorId, secondStep: true }) })).body?.token as string;
const tR = await signIn("user-R"), keysR = new Set<string>(((await call("GET", "/api/platform/me", { token: tR })).body?.keys as string[]) ?? []);

/** The PF/FO tables' row counts by table (exact counts, so a probe that stored anything shows). Left out: the session
 *  table (sign-in) and msg_firm, the key row the messages module inserts on first read (PF-19a, ON CONFLICT DO NOTHING). */
const rows = async () => { return Object.fromEntries(sql(`select string_agg(relname || ':' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', relname), false, true, '')))[1]::text, ',') from pg_stat_user_tables where (relname ~ '^(platform_|fo_|money_|msg_|plat_|auto_)' or relname in ('module_event', 'webhook_receipt')) and relname not in ('platform_session_revocation', 'msg_firm')`).split(",").map((x) => x.split(":"))); };
const before = await rows();

const MB = "a".repeat(1024 * 1024);
/** What each probe must answer (Lead B rev 17.21): an unknown field 422 naming it; a wrong type and a missing field 422 (an
 *  empty body may pass when nothing is required: the row counts judge it); a 1 MB string 413; a malformed id 404. A body
 *  or query probe answered 404 (a random record looked up before the input was read) proves nothing, so it does not pass
 *  (review M1): such a route is on the allow-list until its fix part reads the input first or the sweep gets a real id. */
export function fine(probe: string, withIds: boolean, a: { status: number; body: Record<string, unknown> | null }): boolean {
  const named = (k: string) => typeof a.body?.fields === "object" && a.body.fields !== null && k in (a.body.fields as object);
  if (probe === "1mb") return a.status === 413;
  if (probe.startsWith("id:")) return a.status === 404;
  void withIds;
  if (probe === "unknown" || probe === "query-unknown") return a.status === FIELD_ERROR_STATUS && named("pf28Unknown");
  if (probe === "missing" && a.status >= 200 && a.status < 300) return true;
  return a.status === FIELD_ERROR_STATUS;
}
/** Path keys that are not record ids (break M1): a random uuid there makes every probe a 404 that proves nothing, so the
 *  Sample firm's real key, form token and a public consultation type's slug are used. A door whose key has no real value
 *  here (a booking link's or an invitation's token) is "unreached": on the allow-list until its fix part reaches it. */
const SAMPLE = "(select id from platform_firm where key = 'sample-firm')";
const REAL: Record<string, string> = { ":firmKey": "sample-firm", ":kind": "logo",   // :kind: the public branding image door's enum (logo, favicon, banner)
  ":key": "sales.lead.follow_up",   // PF-19s: a message template's key (api/src/platform/messages/templates/registry.ts KINDS)
  ":slug": sql(`select coalesce(min(slug), '') from fo_consultation_type where firm_id = ${SAMPLE} and active and show_on_booking_page and deleted_at is null`) };
if (all.some((d) => d.path.startsWith("/api/public/forms/:token"))) REAL[":formToken"] = sql(`select coalesce(min(public_token), '') from fo_web_form where firm_id = ${SAMPLE}`);
// PF-28 part 4: a booking link's token in its own shape (<selector uuid>.<43-character verifier>) that no booking has.
// The doors check the shape (else the one not-found), then read the body or query, then look the link up, so a body probe
// here must be a field error: a door that looked the link up first would answer 404 and fail (the rule's M1 holds).
REAL[":linkToken"] = `${randomUUID()}.${"A".repeat(43)}`;
// R1.90: a private sign-up link's token in its own shape (43 base64url characters) that no link has: the invited door
// checks the shape, then reads the body, then looks the link up, so a body probe here is a field error too.
REAL[":inviteToken"] = "A".repeat(43);
const keyOf = (path: string, p: string) => (p === ":token" && path.startsWith("/api/public/forms/") ? ":formToken" : p === ":token" && path.startsWith("/api/public/bookings/") ? ":linkToken" : p === ":token" && path.startsWith("/api/public/signup/") ? ":inviteToken" : p);
const isKey = (path: string, p: string) => keyOf(path, p) in REAL || (path.startsWith("/api/public/") && p !== ":id");
const fill = (path: string, bad?: string) => path.replace(/:[A-Za-z_]+/g, (m) => (m === bad ? "not-a-uuid" : REAL[keyOf(path, m)] || randomUUID()));
/** Whether a 404 may stand for "this random record does not exist": only when some path value is a random id. */
const randomIds = (path: string) => (path.match(/:[A-Za-z_]+/g) ?? []).some((p) => !REAL[keyOf(path, p)]);
const failing: string[] = [], seen: string[] = [], skipped: string[] = [];
const answers = new Map<string, Answer>();
for (const d of all) {
  if (d.keys && !d.keys.every((k) => keysR.has(k))) { skipped.push(`${d.method} ${d.path}`); continue; }   // no Sample token holds them: NOT TESTED, named below
  if (d.system) { skipped.push(`${d.method} ${d.path}`); continue; }   // PF-4s: our own staff's session only: NOT TESTED here; the same probes are asked in check_pf4s_system_signin.ts
  const token = d.open ? undefined : tR, method = d.method === "ALL" ? "POST" : d.method;
  const probes: [string, string, string | undefined][] = [];
  if (d.body) probes.push(["unknown", fill(d.path), JSON.stringify({ pf28Unknown: "x" })], ["wrong-type", fill(d.path), "[1]"], ["missing", fill(d.path), "{}"], ["1mb", fill(d.path), JSON.stringify({ pf28: MB })]);
  if (d.query) probes.push(["query-unknown", `${fill(d.path)}?pf28Unknown=x`, undefined]);
  for (const p of d.path.match(/:[A-Za-z_]+/g) ?? []) probes.push([`id${p}`, fill(d.path, p), d.body ? "{}" : undefined]);
  const unreached = (d.path.match(/:[A-Za-z_]+/g) ?? []).filter((p) => isKey(d.path, p) && !REAL[keyOf(d.path, p)]);
  if (unreached.length && (d.body || d.query)) { const k = `${d.method} ${d.path} unreached`; seen.push(k); failing.push(k); answers.set(k, { status: 0, body: { keys: unreached } }); }
  for (const [probe, url, body] of probes) {
    const key = `${d.method} ${d.path} ${probe}`, a = await call(method, url, { token, body });
    seen.push(key); answers.set(key, a);
    if (!fine(probe, randomIds(d.path), a)) failing.push(key);
  }
}
if (process.env.PF28_DUMP) writeFileSync(process.env.PF28_DUMP, JSON.stringify(Object.fromEntries(answers), null, 1));   // every answer, for writing the allow-list
const after = await rows(), changed = Object.keys({ ...before, ...after }).filter((t) => before[t] !== after[t]).map((t) => `${t} ${before[t]}→${after[t]}`);
console.log(`probes: ${seen.length} on ${all.length - skipped.length} routes; ${failing.length} not as the rule says (allow-listed: ${Object.keys(allow.probes).length}); NOT TESTED (no Sample token holds the keys): ${skipped.length} ${skipped.join(", ")}`);
const jp = judge(failing, seen, { ...allow.probes, ...allow.exceptions?.probes });
ok("PF-28 (b) pass: every probe answers as the rule says (unknown field 422 naming it, wrong type and missing 422, 1 MB 413, bad id 404), or is on the allow-list", jp.unlisted.length === 0, jp.unlisted.map((k) => `${k} → ${answers.get(k)?.status}`));
ok("PF-28 (b) pass: the probe list only shrinks (no entry answers well now or is gone)", jp.fixedButListed.length === 0, jp.fixedButListed.map((k) => `${k} → ${answers.get(k)?.status ?? "gone"}`));
ok("PF-28 (b) pass: no probe answered 500", ![...answers.values()].some((a) => a.status >= 500), [...answers].filter(([, a]) => a.status >= 500).map(([k]) => k));
ok("PF-28 (b) pass: the PF/FO tables' row counts are unchanged after every probe", changed.length === 0, changed);

// PF-28 part 5 (retainers): every retainer write door reads its fields through the one rule (an unknown field 422 named)
// before anything is looked up; a malformed id is the one not-found first; the fields' own rules and words are kept.
const retainers = () => sql(`select count(*) from fo_retainer`) + "/" + sql(`select count(*) from fo_retainer_template`), r0 = retainers();
const rDraft = await call("POST", `/api/front-office/prospects/${randomUUID()}/retainers`, { token: tR, body: JSON.stringify({ templteId: randomUUID() }) });
const rSend = await call("POST", `/api/front-office/retainers/${randomUUID()}/send`, { token: tR, body: "{}" });
ok("PF-28 part 5 fail: Prepare retainer with a misspelt field (templteId) → 422 naming it; a send with no expectedVersion → 422 in its own words before a random retainer is looked up; nothing stored",
  rDraft.status === FIELD_ERROR_STATUS && (rDraft.body?.fields as Record<string, string>)?.templteId === "This field is not allowed here." && rSend.status === FIELD_ERROR_STATUS && (rSend.body?.fields as Record<string, string>)?.expectedVersion === "Send the version shown on your page." && retainers() === r0, [rDraft.body?.fields, rSend.body?.fields, r0, retainers()]);
const rFee = await call("POST", `/api/front-office/prospects/${randomUUID()}/retainers`, { token: tR, body: JSON.stringify({ fees: [{ label: "Deposit (Sample)", amountMnor: 1000 }] }) });
const rLink = await call("POST", `/api/front-office/retainers/${randomUUID()}/download-link`, { token: tR, body: JSON.stringify({ version: true }) });
ok("PF-28 part 5 fail (review m1, m2): a fee row with a misspelt amount (amountMnor) → 422 naming fees[0].amountMnor, never dropped; a download link with version true → 422 in plain words, before a random retainer is looked up",
  rFee.status === FIELD_ERROR_STATUS && (rFee.body?.fields as Record<string, string>)?.["fees[0].amountMnor"] === "This field is not allowed here." && rLink.status === FIELD_ERROR_STATUS && (rLink.body?.fields as Record<string, string>)?.version === "A version number.", [rFee.body?.fields, rLink.body?.fields]);
const rBadId = await call("POST", "/api/front-office/retainers/not-a-uuid/withdraw", { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) });
const rBadProspect = await call("POST", "/api/front-office/prospects/not-a-uuid/retainers", { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) });
const rTemplate = await call("PATCH", `/api/front-office/retainer-templates/${randomUUID()}`, { token: tR, body: JSON.stringify({ active: "yes" }) });
ok("PF-28 part 5 fail: a malformed retainer or prospect id → 404 before the body; a template switch with active as text → 422 naming active before the template is looked up",
  rBadId.status === 404 && rBadProspect.status === 404 && rTemplate.status === FIELD_ERROR_STATUS && Object.hasOwn((rTemplate.body?.fields as object) ?? {}, "active"), [rBadId.status, rBadProspect.status, rTemplate.body?.fields]);

// DW2: a route that parses strictly refuses an unknown field with 422 naming it, and stores nothing.
const s1 = answers.get("POST /api/platform/complaints/:id/handler unknown");
ok("PF-28 DW2 pass: POST /api/platform/complaints/:id/handler (a strict schema, found by the sweep) refuses an unknown field with 422 naming it; the row counts above show nothing stored", s1?.status === FIELD_ERROR_STATUS && fine("unknown", false, s1) && changed.length === 0, s1);
// The fail case names no route (part 3b): parts 4-6 fix theirs in parallel, so it takes the first listed route that still
// answers an unknown field loosely; once every part is in, none is left and the case says so.
const offKey = Object.keys(allow.probes).find((k) => k.endsWith(" unknown") && answers.has(k) && !fine("unknown", false, answers.get(k)!)), off = offKey ? answers.get(offKey) : undefined;
ok(`PF-28 DW2 fail: ${offKey ?? "no route"} still parses loosely (the field not named), so its probe is on the allow-list with its fix part`, offKey === undefined || FIX_PART.test(allow.probes[offKey]), { offKey, off });

// PF-28 part 2c (sign-up): field errors are 422 with each field named in the page's own plain words; a verify body that
// is not { token, code } is 422 by its shape alone.
const su = await call("POST", "/api/public/signup", { body: JSON.stringify({ email: "", pf28Unknown: "x" }) });
const vf = await call("POST", "/api/public/signup/verify", { body: JSON.stringify({ token: 7 }) });
ok("PF-28 part 2c fail: a sign-up with an empty email and an unknown field → 422 CHECK_FIELDS, email in the page's words and the unknown field named; a verify body with a number token → 422 naming token", su.status === FIELD_ERROR_STATUS && su.body?.code === "CHECK_FIELDS" && (su.body?.fields as Record<string, string>)?.email === "Enter your work email." && Object.hasOwn((su.body?.fields as object) ?? {}, "pf28Unknown") && Array.isArray(su.body?.errors) && vf.status === FIELD_ERROR_STATUS && Object.hasOwn((vf.body?.fields as object) ?? {}, "token"), [su.body?.fields, vf.body?.fields]);

// PF-28 part 6 (money: draft invoices and their lines): a field error is 422 with each field named (the money schemas'
// own `errors` list kept), the body read before any lookup, and an invoice id checked before the body.
const invoices = () => sql(`select count(*) from money_invoice`) + "/" + sql(`select count(*) from money_invoice_line`), m0 = invoices();
const mTypo = await call("POST", "/api/front-office/money/invoices", { token: tR, body: JSON.stringify({ personId: randomUUID(), curency: "CAD" }) });
const mList = await call("POST", "/api/front-office/money/invoices", { token: tR, body: "[1]" });
ok("PF-28 part 6 fail: a draft with a misspelt key (curency) → 422 naming it; a body that is a list → 422 naming body; nothing stored", mTypo.status === FIELD_ERROR_STATUS && (mTypo.body?.fields as Record<string, string>)?.curency === "This field is not allowed here." && mList.status === FIELD_ERROR_STATUS && Object.hasOwn((mList.body?.fields as object) ?? {}, "body") && invoices() === m0, [mTypo.body?.fields, mList.body?.fields]);
const mLine = await call("POST", `/api/front-office/money/invoices/${randomUUID()}/lines`, { token: tR, body: JSON.stringify({ kind: "FEE", description: "Sample fee", unitMinor: "100" }) });
const mBadId = await call("POST", "/api/front-office/money/invoices/not-a-uuid/lines", { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) });
ok("PF-28 part 6 fail: a line with unitMinor as text → 422 naming unitMinor before any invoice is looked up (its errors list kept); a malformed invoice id → 404 before the body; nothing stored", mLine.status === FIELD_ERROR_STATUS && Object.hasOwn((mLine.body?.fields as object) ?? {}, "unitMinor") && (mLine.body?.errors as { field: string }[])?.[0]?.field === "unitMinor" && mBadId.status === 404 && invoices() === m0, [mLine.body?.fields, mBadId.status]);

// PF-28 part 2b (platform settings, complaints, logs): each body and query goes through the rule before any lookup.
const cq = await call("GET", "/api/platform/complaints?vew=open", { token: tR });
const cNoKey = await call("POST", "/api/platform/complaints", { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) });
ok("PF-28 part 2b fail: a misspelt query key on the complaints list (vew) → 422 naming it; a complaint body with an unknown field and no Idempotency-Key → 422 for the body first", cq.status === FIELD_ERROR_STATUS && (cq.body?.fields as Record<string, string>)?.vew === "This field is not allowed here." && cNoKey.status === FIELD_ERROR_STATUS, [cq.body?.fields, cNoKey.status]);
const keep = await call("PUT", "/api/platform/keep-periods/closed-client-files", { token: tR, body: JSON.stringify({ years: "seven" }) });
const ack = await call("POST", "/api/platform/complaints/not-a-uuid/acknowledge", { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) });
ok("PF-28 part 2b fail: keep period years as text → 422 naming years, nothing saved; a malformed complaint id → 404 before the body", keep.status === FIELD_ERROR_STATUS && Object.hasOwn((keep.body?.fields as object) ?? {}, "years") && ack.status === 404, [keep.body?.fields, ack.status]);

// PF-28 part 4 (booking): field errors are 422 with each field named (the booking pages keep their `issues` lines); a path
// value is checked before the body, and the body before the record is looked up.
const bookings = () => sql(`select count(*) from fo_booking`);
const b0 = bookings();   // the public door's own probes are in the sweep above (its per-address limit is 10 in 10 minutes)
const sb = await call("POST", "/api/front-office/bookings", { token: tR, body: JSON.stringify({ typeId: "x", persnId: randomUUID(), mode: "VIDEO", startsAt: "2030-01-07T15:00:00Z", timeZone: "America/Toronto" }) });
ok("PF-28 part 4 fail: a staff booking with a misspelt field (persnId) and a malformed type id → 422 naming persnId, personId and typeId, its issues lines kept for the screen, nothing stored", sb.status === FIELD_ERROR_STATUS && sb.body?.code === "INVALID" && (sb.body?.fields as Record<string, string>)?.persnId === "This field is not allowed here." && (sb.body?.fields as Record<string, string>)?.personId === "This is required." && Object.hasOwn((sb.body?.fields as object) ?? {}, "typeId") && Array.isArray(sb.body?.issues) && bookings() === b0, [sb.body?.fields, b0, bookings()]);
const badLink = await call("POST", "/api/public/bookings/not-a-link/reschedule", { body: JSON.stringify({ pf28Unknown: "x" }) });
const badMove = await call("POST", "/api/front-office/bookings/not-a-uuid/reschedule", { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) });
const randomHost = await call("POST", `/api/front-office/staff/${randomUUID()}/time-off`, { token: tR, body: JSON.stringify({ startsAt: "soon" }) });
ok("PF-28 part 4 fail: a malformed booking link or booking id → 404 before the body; a well-formed unknown person's time off with a bad time → 422 naming startsAt (the body before the look-up)", badLink.status === 404 && badMove.status === 404 && randomHost.status === FIELD_ERROR_STATUS && Object.hasOwn((randomHost.body?.fields as object) ?? {}, "startsAt"), [badLink.status, badMove.status, randomHost.body?.fields]);
// Review round 1: M1, a malformed booking id with an unknown field on the consult record → 404 (the id before the body);
// m1, a "__proto__" key on a booking door → 422 naming it, as the one rule refuses it; m2, a list asked for over 92 days names to.
const consultBadId = await call("PUT", "/api/front-office/bookings/not-a-uuid/consult-record", { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) });
const protoCancel = await call("POST", `/api/public/bookings/${REAL[":linkToken"]}/cancel`, { body: '{"__proto__":{"x":1}}' });
const protoHours = await call("POST", "/api/front-office/me/time-off", { token: tR, body: '{"__proto__":{"x":1}}' });
const longList = await call("GET", "/api/front-office/bookings?from=2030-01-01T00:00:00Z&to=2030-06-01T00:00:00Z", { token: tR });
ok("PF-28 part 4 fail (review M1, m1, m2): a malformed booking id with an unknown field on the consult record → 404; a __proto__ key on a cancel by link and on time off → 422 naming __proto__; a list over 92 days → 422 naming to",
  consultBadId.status === 404 && [protoCancel, protoHours].every((r) => r.status === FIELD_ERROR_STATUS && Object.hasOwn((r.body?.fields as object) ?? {}, "__proto__")) && longList.status === FIELD_ERROR_STATUS && Object.hasOwn((longList.body?.fields as object) ?? {}, "to"),
  [consultBadId.status, protoCancel.status, protoCancel.body?.fields, protoHours.status, longList.body?.fields]);
const longFeed = await call("GET", "/api/front-office/bookings/feed?from=2030-01-01T00:00:00Z&to=2030-06-01T00:00:00Z", { token: tR });
ok("PF-28 part 4 pass: a feed asked for more than 62 days → 422 naming to (a field error, no longer 400)", longFeed.status === FIELD_ERROR_STATUS && Object.hasOwn((longFeed.body?.fields as object) ?? {}, "to"), longFeed.body);

// PF-28 part 2a (identity doors: sign-in, staff, invitations, licence records): each body goes through parseInput before
// any record is read, and a staff id is checked before the body.
const inv = answers.get("POST /api/platform/staff/invitations unknown"), invites = () => sql(`select count(*) from platform_invitation`);
const n0 = invites(), typo = await call("POST", "/api/platform/staff/invitations", { token: tR, body: JSON.stringify({ email: "pf28.sample@example.com", roles: ["CASE_OFFICER"], emial: "x" }) });
ok("PF-28 part 2a fail: an invitation with a misspelt field (emial) → 422 naming it in plain words, and no invitation stored", typo.status === FIELD_ERROR_STATUS && (typo.body?.fields as Record<string, string>)?.emial === "This field is not allowed here." && /Nothing was saved/.test(String(typo.body?.detail)) && invites() === n0 && inv?.status === FIELD_ERROR_STATUS, typo.body);
const badId = await call("POST", "/api/platform/staff/not-a-uuid/deactivate", { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) });
const noFirm = await call("POST", "/api/platform/session/local", { body: JSON.stringify({ email: "owner@example.com", secondStep: true }) });
ok("PF-28 part 2a fail: a malformed staff id → 404 before the body is read; a sign-in without a firm key → 422 naming firmKey", badId.status === 404 && noFirm.status === FIELD_ERROR_STATUS && (noFirm.body?.fields as Record<string, string>)?.firmKey === "This is required.", [badId.status, noFirm.body?.fields]);
// Review of part 2a (m1-m4): a misspelt row field is flagged on its row; a body-less resend is {}; a malformed invitation id
// is 404 before the body; an over-long sign-in code is the "used or expired" 401, not a field error.
const nmae = await call("POST", "/api/platform/staff/invitations/batch", { token: tR, body: JSON.stringify({ rows: [{ email: "pf28.row@example.com", roles: ["CASE_OFFICER"], nmae: "Client B" }] }) });
const rowFlags = ((nmae.body?.rows as { flags: { code: string }[] }[] | undefined)?.[0]?.flags ?? []).map((f) => f.code);
ok("PF-28 part 2a fail (review m1): a batch row with a misspelt field (nmae) → 422 ROWS_FLAGGED with UNKNOWN_FIELD on that row, nothing stored", nmae.status === 422 && nmae.body?.code === "ROWS_FLAGGED" && rowFlags.includes("UNKNOWN_FIELD") && sql(`select count(*) from platform_invitation where email = 'pf28.row@example.com'`) === "0", nmae.body);
const bodyless = await fetch(`${BASE}/api/platform/staff/invitations/${randomUUID()}/resend`, { method: "POST", headers: { authorization: `Bearer ${tR}` } }).then((r) => r.status);
const badInv = await call("POST", "/api/platform/staff/invitations/not-a-uuid/resend", { token: tR, body: JSON.stringify({ pf28Unknown: "x" }) });
ok("PF-28 part 2a fail (review m2, m3): a resend with no body at all reads as {} (a random id → 404, never 422); a malformed invitation id → 404 before the body", bodyless === 404 && badInv.status === 404, [bodyless, badInv.status]);
const longCode = await call("POST", "/api/platform/session/callback", { body: JSON.stringify({ code: "c".repeat(2001) }) });
ok("PF-28 part 2a fail (review m4): a sign-in code over 2,000 characters → 401 SIGN_IN_CODE_REFUSED (the \"used or expired\" words), not a field error", longCode.status === 401 && longCode.body?.code === "SIGN_IN_CODE_REFUSED", longCode.body);

// DW3: a 1 MB string → 413 (the body limit), never 500; a 200 KB valid body on a long-text route still succeeds.
const big = await call("POST", "/api/platform/offices", { token: tR, body: JSON.stringify({ name: MB }) });
ok("PF-28 DW3 fail: a 1 MB string on a platform route → 413 BODY_TOO_LARGE in size-neutral words", big.status === 413 && big.body?.code === "BODY_TOO_LARGE" && big.body?.detail === "This request is larger than this address takes. Nothing was saved or started.", big);
const note = await call("POST", `/api/front-office/leads/${randomUUID()}/notes`, { token: tR, body: JSON.stringify({ text: "Sample long note. ".repeat(11_600) }) }), tooBig = await call("POST", `/api/front-office/leads/${randomUUID()}/notes`, { token: tR, body: JSON.stringify({ text: "Sample long note. ".repeat(16_000) }) });
ok("PF-28 DW3 pass: a 200 KB body passes the 256 KB limit and reaches the route's own rule (here 422: notes are capped at 5,000 characters), never 413 or 500; 280 KB → 413", note.status === 422 && tooBig.status === 413, { note: note.status, tooBig: tooBig.status });

// DW4: a non-uuid staff id → the one not-found; a valid uuid of another firm → the same 404.
const other = sql(`select id from platform_staff where firm_id <> (select id from platform_firm where key = 'sample-firm') limit 1`);
const n1 = await call("GET", "/api/platform/staff/not-a-uuid", { token: tR }), n2 = await call("GET", `/api/platform/staff/${other}`, { token: tR });
ok("PF-28 DW4 pass: a non-uuid staff id → 404", n1.status === 404, n1);
ok("PF-28 DW4 fail: another firm's staff id → the same 404 (no hint it exists)", other !== "" && n2.status === 404 && n2.body?.title === n1.body?.title, [n1.body, n2.body]);

// DW5: the public doors get the same probes with no token; FO-2's 33 KB web-form body keeps FO-2's 413 words.
const publicKeys = seen.filter((k) => / \/api\/public\//.test(k));
ok(`PF-28 DW5 pass: the public doors were probed with no token (${publicKeys.length} probes)`, publicKeys.length >= 10 && publicKeys.every((k) => answers.get(k)!.status !== 401), publicKeys.length);
const form = await call("POST", "/api/public/forms/not-a-token/submissions", { body: JSON.stringify({ message: "x".repeat(33 * 1024) }) });
ok("PF-28 DW5 fail: FO-2's 33 KB web-form body still answers FO-2's own 413 words, not the platform limit's", form.status === 413 && form.body?.code === "TOO_LARGE", form);

// DW6 (AG-10-32, amendment 1): a signed Stripe test event verifies; a one-byte change is refused 400 with nothing stored.
// The copy runs the fake billing (local, no key), whose signature is the fake's own (ports/billing.ts sign).
const hook = all.some((d) => d.path === "/api/hooks/stripe");
if (!hook) console.log("NOT TESTED  PF-28 DW6: /api/hooks/stripe is not served (P-405: never green)");
else {
  const { fakeBilling } = await import("../ports/billing.ts");
  const evId = `evt_pf28${Date.now()}`, ev = JSON.stringify({ id: evId, object: "event", type: "customer.subscription.updated", created: Math.floor(Date.now() / 1000), data: { object: { object: "subscription", id: "sub_pf28nobody", customer: "cus_pf28nobody", metadata: {} } } });
  const post = async (body: string, sig: string) => { const r = await fetch(`${BASE}/api/hooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body }); return { status: r.status, body: await r.json().catch(() => null) as Record<string, unknown> | null }; };
  const receipts = () => sql(`select count(*) from webhook_receipt where event_id like 'evt_pf28%'`);
  const sig = fakeBilling().sign(ev), before6 = receipts();
  const changed = await post(ev.replace('"customer.subscription.updated"', '"customer.subscription.updatee"'), sig), afterChanged = receipts();
  const badEnvelope = ev.replace('"object":"event"', '"object":"not-event"'), afterBad0 = receipts(), bad = await post(badEnvelope, fakeBilling().sign(badEnvelope)), afterBad = receipts();
  const signed = await post(ev, sig);
  ok("PF-28 DW6 fail: a signed Stripe event with one byte changed is refused 400 (the signature), and nothing is stored", changed.status === 400 && changed.body?.code === "SIGNATURE" && afterChanged === before6, { changed, before6, afterChanged });
  ok("PF-28 DW6 fail: a correctly signed body that is not an event envelope is refused 422 by the schema after the signature, and nothing is stored", bad.status === 422 && bad.body?.code === "INVALID" && afterBad === afterBad0, { bad, afterBad0, afterBad });
  ok("PF-28 DW6 pass: the same event, as signed, verifies and is stored once (the schema runs after the signature)", signed.status === 200 && signed.body?.received === true && receipts() === String(Number(before6) + 1), { signed, receipts: receipts() });
}

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
