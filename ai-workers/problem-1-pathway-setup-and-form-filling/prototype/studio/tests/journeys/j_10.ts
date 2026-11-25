// J-10 (map row 10, R1.10: checking every input), written by the qa lane (22 Nov) ahead of PF-28 parts 3-5 (#2909, #2931,
// #2908, #2933), because no j_10 was on main. Done when (CAPABILITIES R1.10): every PF/FO route checks body, query and
// params against one schema; wrong type, missing, unknown and over-long fields each answer a field error in Problem
// Details naming the field in plain words; qa probes every route in the route table. Status as ruled by the tech lead
// (#2619, comment 7056094303): 422 on the platform and front-office doors, 400 on the case side; a malformed id is 404,
// a 1 MB body 413; never 2xx for a bad input and never 500.
// It walks an isolated copy of the running app (its own database and port, never :4400):
//   W1 (screen) the firm's Owner signs in on the sign-in card, opens Offices, Add an office, chooses Outside Canada and
//      types "1234" as the country: Save answers "Not saved" and the Country field itself shows the server's own field
//      error (the words the POST answered for country, read from that answer), not the field's hint; nothing is stored.
//   W2 the sweep, one line per area (platform, front-office sales, booking, retainers, money): every route the app serves
//      under /api/platform, /api/front-office, /api/system, /api/public and /api/hooks (read from the app's own feature
//      list), asked as the Sample firm's representative (no token on public doors). Body: an unknown field (named); a
//      missing field ({}: a field error naming each required field in plain words, or 2xx when nothing is required);
//      a wrong type, one field at a time (each field the route's schema declares, and each required field the missing
//      probe names, sent alone as an object {"pf28":1}, or as a number when the field is itself an object: a field
//      error naming that field in plain words, not the unknown-field refusal; a field declared `ignored` is skipped); the whole body of the wrong type ("[1]", its own probe, labelled wrong-type); a 1 MB
//      string (413). Query: an unknown query field (named). Path: "not-a-uuid" in each record id (404). A body or query
//      probe answered 404 (a random record looked up before the input was read) proves nothing, so it counts as not
//      passing, as in PF-28's own check. Each line lists the probes that do not answer as ruled; the allow-list's
//      by-design exceptions (each with a written reason awaiting the tech lead) are not counted.
//      W2 every route: a route left unprobed because no Sample token holds its keys FAILS that line, named.
//      The fields a route declares are read from its code: the zod schema its body or query reaches (the same follower
//      as PF-28's check, tests/lib/routes.ts), its keys taken from strict({..}), z.object({..}), z.strictObject({..}),
//      query(..) and their .extend/.pick/.omit/.refine chains.
//   W3 over-long fields, by length, never by type: every field a route declares (required and optional; body and query)
//      is sent alone at 20,000 characters (query: 2,000): a field error naming it in plain words, never 2xx, 413 or 500.
//      A field the answer calls "must be a number / a list / ..." is not a string field and is not counted; a route
//      whose fields are all of that kind is listed as having no string field, not counted as passed. Path keys that
//      are strings (firm key, slug, token, kind) are sent at 600 characters: 404 (or 410 for a token) or a field error,
//      never 2xx or 500. W3 schema: a body or query that reaches no zod parse FAILS that line, named (the SNS notice door,
//      read only after a signature over its raw text, is a NOTE while the allow-list's signature-first line stands); one that reaches a
//      schema this walk cannot take apart (built at run time) is named in a NOTE, with what is still probed (a body's
//      required fields, a query's required keys); W3 run-time schemas FAILS if their count grows past the reviewed 19.
//      Every field is probed, no cap. A field probe answered 429 is left unjudged (NOT TESTED) only on the sign-up door,
//      whose own rate limit is by design; a 429 anywhere else counts as not as ruled.
//      Path keys with no Sample value (a booking link's token, an invitation's token) get a random value, so their
//      body and query probes answer 404 and count as not passing: a builder who seeds a real Sample value for such a
//      key adds it to REAL below (as ":formToken" is today).
//   W4 nothing stored by any probe (the PF/FO tables' row counts before and after), and no probe answered 500.
//   W5 the case side (/api/runtime, CS-V1, done; /api/link reads its link token first): an unknown field on its
//      parameter-free routes answers 400 naming the field, and "not-a-uuid" in an id answers 404 (the one not-found).
//   W6 QA-507: a JSON body with an unknown charset, and with an unknown Content-Encoding, answers a 4xx problem in words,
//      never 500.
//   W7 DW6 (if /api/hooks/stripe is served): a body that is not a Stripe event, unsigned, is refused 4xx and stores nothing.
//   W8 the reviewed allow-list tests/pf28-allow-list.json holds no fix line (only by-design exceptions with a written
//      reason): its lines are the parts not yet built.
// Probes as ruled by the tech lead (Lead 19 on #3377, B1-B7; nothing loosened, each change shows a planted fault caught):
//   B1 /api/system routes are asked with a Sample operator of our own staff (every system role, signed in afresh per route);
//   B2 the case side is asked with the session each door takes (a firm token where it declares keys, else its actor), and one
//      firm token on an actor door must stay 403; B3 token doors get a real Sample value (a sign-up link made by the operator, a
//      booking's manage token, the template registry's key, the Sample web form live for this copy's origin); B4 the public
//      booking and sign-up doors' probes come from loopback addresses 127.0.0.10-49, the seed booking from .250 and the control
//      from .200 (Linux has them all; macOS once: `for n in $(seq 10 49) 200 250; do sudo ifconfig lo0 alias 127.0.0.$n; done`),
//      and a control proves the per-address limit still answers 429 to an 11th booking; B5, B6 W3 reads the allow-list's
//      by-design lines by exact route and status; B7 a schema name is read in its own file and through its imports.
// Sample data only; US$0, no model call, live AI off. Screenshots: product/screens/J-10/screenshots/.
// Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j10 4410 start --ttl 30 PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j10 4410 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_10.ts j10 4410
import "reflect-metadata";
import { MODULE_METADATA, PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants.js";
import { Reflector } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import ts from "typescript";
import { recorder } from "../runtime/api.ts";

const NAME = process.argv[2] ?? "j10", PORT = Number(process.argv[3] ?? 4410), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-10", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const BIN = ["/opt/homebrew/opt/postgresql@18/bin", "/usr/lib/postgresql/18/bin"].find((b) => existsSync(join(b, "psql"))) ?? "";
const sql = (q: string) => execFileSync(join(BIN, "psql"), [`postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, "-X", "-q", "-Atc", q], { encoding: "utf8" }).trim();
process.env.PLATFORM_ENVIRONMENT ??= "local";   // the feature files read the loader at import
let PLATFORM_ACCESS = "", SYSTEM_ACCESS = "", FIELD_ERROR_STATUS = 422;   // set from the app's own modules inside the walk (a failed import is a FAIL line)

type Answer = { status: number; body: Record<string, unknown> | null };
/** One request; a dropped connection (status 0: a socket the server closed after a 413) is tried once more. */
type CallOpts = { token?: string; body?: string; headers?: Record<string, string>; from?: string };
const call = async (method: string, path: string, o: CallOpts = {}): Promise<Answer> => {
  const a = await call1(method, path, o);
  return a.status === 0 ? call1(method, path, o) : a;
};
const call1 = async (method: string, path: string, o: CallOpts = {}): Promise<Answer> => {
  const bodyless = ["GET", "HEAD", "OPTIONS", "DELETE"].includes(method);
  if (o.from) return fromAddress(method, path, o, bodyless);
  try {
    const r = await fetch(`${BASE}${path}`, { method, headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(bodyless ? {} : { "content-type": "application/json" }), ...o.headers }, body: bodyless ? undefined : (o.body ?? "{}") });
    const t = await r.text(); let body: Record<string, unknown> | null = null; try { body = JSON.parse(t); } catch { /* not JSON */ }
    return { status: r.status, body };
  } catch { return { status: 0, body: null }; }
};
/** R1.10 (B4): one request from a given loopback source address (127.0.0.x), so a per-address limit sees another client; the
 *  limit itself is untouched (the walk's control probe proves an 11th booking from one address is still 429). An address the
 *  host cannot bind (macOS without `sudo ifconfig lo0 alias 127.0.0.x`) answers status -1, judged as not as ruled. */
const fromAddress = (method: string, path: string, o: CallOpts, bodyless: boolean) => new Promise<Answer>((done) => {
  const body = bodyless ? undefined : (o.body ?? "{}");
  const rq = httpRequest({ host: "127.0.0.1", port: PORT, path, method, localAddress: o.from, headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(bodyless ? {} : { "content-type": "application/json", "content-length": String(Buffer.byteLength(body!)) }), ...o.headers } }, (rs) => {
    let t = ""; rs.setEncoding("utf8"); rs.on("data", (c) => (t += c));
    rs.on("end", () => { let b: Record<string, unknown> | null = null; try { b = JSON.parse(t); } catch { /* not JSON */ } done({ status: rs.statusCode ?? 0, body: b }); });
  });
  rq.on("error", (e: NodeJS.ErrnoException) => done({ status: e.code === "EADDRNOTAVAIL" ? -1 : 0, body: null }));
  rq.end(body);
});
/** Named in the answer: PF/FO's `fields` object, or the case side's `errors[].field`. */
const named = (a: Answer, k: string) => (typeof a.body?.fields === "object" && a.body.fields !== null && k in (a.body.fields as object))
  || ((a.body?.errors as { field?: string; message?: string }[] | undefined) ?? []).some((e) => e?.field === k || (e?.message ?? "").includes(k));
/** The words the answer gives for field k (PF/FO `fields`, else the case side's `errors`). */
const wordsOf = (a: Answer, k: string): string => {
  const f = (a.body?.fields as Record<string, unknown> | undefined)?.[k];
  if (typeof f === "string") return f;
  const errs = (a.body?.errors as unknown[] | undefined) ?? [];
  const e = errs.find((x) => typeof x === "object" && x !== null && (x as { field?: string }).field === k) as { message?: string } | undefined;
  if (e?.message) return e.message;
  const s = errs.find((x) => typeof x === "string" && x.startsWith(`${k}:`)) as string | undefined;
  return s ? s.slice(k.length + 1).trim() : "";
};
const plainWords = (a: Answer, k: string) => { const f = wordsOf(a, k); return /^[^{}<>]{3,200}$/.test(f) && !/zod|invalid_type|undefined|\[object/i.test(f) && !/Expected |Invalid option|Invalid input|received /.test(f); };
const NOT_ALLOWED = /not allowed|not a field|not part of/i, NOT_TEXT = /must be (a |an )?(number|list|boolean|true|integer|date|object|whole|yes)/i;
/** A field error naming k in plain words, and not the unknown-field refusal (k is a field of this route). */
const fieldError = (a: Answer, k: string) => a.status === FIELD_ERROR_STATUS && named(a, k) && plainWords(a, k) && !NOT_ALLOWED.test(wordsOf(a, k));

// ------------------------------------------------------------------------- the fields a route declares, read from its code
type Declared = { body: string[] | null; query: string[] | null };
const API_SRC = join(STUDIO, "api", "src"), SCHEMA_DIRS = [API_SRC, join(STUDIO, "ports")];   // schemas live in api/src and the shared ports
const tsFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? tsFiles(p) : /\.ts$/.test(f) && !/\.(test|spec)\.ts$/.test(f) ? [p] : []; });
// R1.10 (B7): a name is read where it is used: the file's own constant, else the one its import names, else the one constant of
// that name in the code; two of the same name and no import (LINK, ROLE, LinkBody) is never guessed (first-wins picked another file's).
const consts = new Map<string, Map<string, ts.Expression>>(), imports = new Map<string, Map<string, { from: string; name: string }>>();
const anywhere = new Map<string, ts.Expression[]>(), classNodes = new Map<string, ts.ClassDeclaration>(), classFile = new Map<string, string>();
const resolveFrom = (file: string, spec: string) => { if (!spec.startsWith(".")) return ""; const b = join(file, "..", spec); return [b, `${b}.ts`, join(b, "index.ts")].find((x) => existsSync(x) && statSync(x).isFile()) ?? ""; };
function index() {
  if (classNodes.size) return;
  for (const file of SCHEMA_DIRS.filter((d) => existsSync(d)).flatMap(tsFiles)) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const own = new Map<string, ts.Expression>(), imp = new Map<string, { from: string; name: string }>();
    consts.set(file, own); imports.set(file, imp);
    for (const st of sf.statements) if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      const from = resolveFrom(file, st.moduleSpecifier.text);
      if (from) for (const el of st.importClause.namedBindings.elements) imp.set(el.name.text, { from, name: (el.propertyName ?? el.name).text });
    }
    ts.forEachChild(sf, function walk(n) {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        if (!own.has(n.name.text)) own.set(n.name.text, n.initializer);
        anywhere.set(n.name.text, [...(anywhere.get(n.name.text) ?? []), n.initializer]);
      }
      if (ts.isClassDeclaration(n) && n.name && !classNodes.has(n.name.text)) { classNodes.set(n.name.text, n); classFile.set(n.name.text, file); }
      ts.forEachChild(n, walk);
    });
  }
}
/** The expression a name stands for in a file, and the file it is written in. */
function lookup(name: string, file: string, depth = 0): { e: ts.Expression; file: string } | null {
  const own = consts.get(file)?.get(name);
  if (own) return { e: own, file };
  const im = imports.get(file)?.get(name);
  if (im && depth < 6) return lookup(im.name, im.from, depth + 1);
  const all = anywhere.get(name) ?? [];
  if (all.length !== 1) return null;
  const f = [...consts].find(([, m]) => m.get(name) === all[0])?.[0] ?? file;
  return { e: all[0], file: f };
}
/** The keys of a zod object schema expression, or null when it is not one this reader knows. */
function keysOf(e: ts.Expression | undefined, file: string, depth = 0): string[] | null {
  if (!e || depth > 6) return null;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  if (ts.isIdentifier(e)) { const l = lookup(e.text, file); return l ? keysOf(l.e, l.file, depth + 1) : null; }
  if (!ts.isCallExpression(e)) return null;
  const callee = e.expression, name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
  // A field declared `ignored` (money's taxMinor, amountMinor: a client-sent value is dropped by design, j_59) takes any value.
  const lit = (x: ts.Expression | undefined) => (x && ts.isObjectLiteralExpression(x) ? x.properties.flatMap((p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && !(ts.isPropertyAssignment(p) && ts.isIdentifier(p.initializer) && p.initializer.text === "ignored") ? [p.name.text] : [])) : null);
  if (["strict", "strictObject", "object", "looseObject"].includes(name)) return lit(e.arguments[0]);
  if (name === "query") return e.arguments.flatMap((a) => (ts.isStringLiteral(a) ? [a.text] : []));
  if (name === "union" || name === "discriminatedUnion") {
    const arr = e.arguments.find((a) => ts.isArrayLiteralExpression(a)) as ts.ArrayLiteralExpression | undefined;
    const ks = arr?.elements.map((x) => keysOf(x, file, depth + 1));
    return ks && ks.length && ks.every(Boolean) ? [...new Set(ks.flat() as string[])] : null;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    const base = keysOf(callee.expression, file, depth + 1);
    if (name === "extend" || name === "merge") { const more = lit(e.arguments[0]) ?? keysOf(e.arguments[0], file, depth + 1); return base && more ? [...new Set([...base, ...more])] : null; }
    if (name === "pipe") return keysOf(e.arguments[0], file, depth + 1);   // B7: a piped schema's fields are its output's
    if (name === "pick" || name === "omit") { const sel = lit(e.arguments[0]); return base && sel ? base.filter((k) => (name === "pick") === sel.includes(k)) : null; }
    return base;   // .strict(), .refine(), .superRefine(), .transform(), .optional(), .default() ...
  }
  return null;
}
/** The object schemas that parse one of the method's own parameters in "<Class>.<method>" (a parse call as
 *  tests/lib/routes.ts recognises one, whose value is a parameter, `p ?? {}`, `p || {}` or `p as …`; a parse that builds
 *  an answer from an object literal is not the input's), their keys merged; null when none this reader can read. */
function parsedKeys(at: string): string[] | null {
  const [cls, fn] = at.split("."), c = classNodes.get(cls);
  const m = c?.members.find((x) => ts.isMethodDeclaration(x) && !!x.name && ts.isIdentifier(x.name) && x.name.text === fn) as ts.MethodDeclaration | undefined;
  if (!m?.body) return null;
  const params = new Set(m.parameters.flatMap((p) => (ts.isIdentifier(p.name) ? [p.name.text] : [])));
  const isParam = (x: ts.Expression | undefined): boolean => {
    if (!x) return false;
    while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x)) x = x.expression;
    if (ts.isBinaryExpression(x) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(x.operatorToken.kind)) return isParam(x.left);
    return ts.isIdentifier(x) && params.has(x.text);
  };
  const found: string[][] = [];
  ts.forEachChild(m.body, function walk(n) {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      let schema: ts.Expression | undefined, value: ts.Expression | undefined;
      if (ts.isIdentifier(e) && ["parse", "parsed", "parseInput"].includes(e.text) && n.arguments.length >= 2) [schema, value] = [n.arguments[0], n.arguments[1]];
      else if (ts.isPropertyAccessExpression(e) && /^(safeP|p)arse(Async)?$/.test(e.name.text) && !(ts.isIdentifier(e.expression) && /^(JSON|Date|Number)$/.test(e.expression.text))) [schema, value] = [e.expression, n.arguments[0]];
      if (schema && isParam(value)) { const k = keysOf(schema, classFile.get(cls) ?? ""); if (k) found.push(k); }
    }
    ts.forEachChild(n, walk);
  });
  return found.length ? [...new Set(found.flat())] : null;
}
/** Per route: its fields as declared ("unread" when its input reaches a parse whose schema this reader cannot take
 *  apart, e.g. one built with Object.fromEntries; "unparsed" when its input reaches no zod parse at all). */
async function declaredFields(): Promise<Map<string, Declared & { bodyHow: string; queryHow: string }>> {
  index();
  const { routes, follows } = await import("../lib/routes.ts");
  const out = new Map<string, Declared & { bodyHow: string; queryHow: string }>();
  for (const r of routes(API_SRC)) {
    const key = `${r.verb} ${r.path}`, d = out.get(key) ?? { body: null, query: null, bodyHow: "none", queryHow: "none" };
    for (const i of r.inputs.filter((x) => x.kind !== "param")) {
      const at = follows(API_SRC, r.controller, r.node, i.name), k = at ? parsedKeys(at) : null;
      const how = k ? "read" : at ? "unread" : "unparsed";
      if (i.kind === "body") { d.body = k ?? d.body; d.bodyHow = how; } else { d.query = k ?? d.query; d.queryHow = how; }
    }
    out.set(key, d);
  }
  return out;
}

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD", "SEARCH"];
type Door = { method: string; path: string; body: boolean; query: boolean; keys: string[] | null; open: boolean; system: string[] | null };
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
      // B1: an /api/system route declares its own access (system/* keys, any of our staff, or the sign-in door).
      const sys = SYSTEM_ACCESS ? reflector.getAllAndOverride<{ kind: string; keys?: string[] }>(SYSTEM_ACCESS, [h as () => unknown, c]) : undefined;
      for (const p of ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, h) ?? "")) {
        const path = `/${[base, p].join("/")}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
        if (within.test(path)) out.push({ method: METHODS[Reflect.getMetadata(METHOD_METADATA, h) as number] ?? "?", path, body: args.includes(3), query: args.includes(4), keys: access?.kind === "keys" ? access.keys! : null, open: sys ? sys.kind === "sign-in" : !access, system: sys && sys.kind !== "sign-in" ? (sys.keys ?? []) : null });
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
/** The only door whose own rate limit (10 a client in 10 minutes, by design) may leave a field probe unjudged; a 429
 *  anywhere else is judged like any other answer (not as ruled). */
const SIGN_UP = /^\/api\/public\/signup(\/|$)/;
/** Reviewed 22 Nov (round 2 of #2937): inputs whose schema is built at run time; the line fails if the count grows. */
const RUNTIME_SCHEMAS = 19;

let browser: Browser | null = null;
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
try {
  const { registerFeatures } = await import("../../api/src/features.ts");
  ({ PLATFORM_ACCESS } = await import("../../api/src/platform/identity/keys.ts"));
  ({ SYSTEM_ACCESS } = await import("../../api/src/platform/system-identity/keys.ts"));
  ({ FIELD_ERROR_STATUS } = await import("../../api/src/platform/http/input.ts"));
  browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
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
  const answered = p.waitForResponse((r) => r.url().endsWith("/api/platform/offices") && r.request().method() === "POST", { timeout: 15_000 }).catch(() => null);
  await p.locator("[data-office-save]").click();
  const res = await answered, server = res ? ((await res.json().catch(() => ({}))) as { fields?: Record<string, string> }).fields?.country ?? "" : "";
  await p.locator("[data-office-problem]").waitFor({ timeout: 15_000 }).catch(() => undefined);
  const country = p.getByLabel("Country (two-letter code, for example GB)");
  const invalid = await country.getAttribute("aria-invalid"), problem = await p.locator("[data-office-problem]").innerText().catch(() => "");
  const fieldWords = await country.evaluate((el) => (el.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim()).catch(() => "");
  await shot(p, "w1-office-country-refused-1440");
  ok("J-10 W1 (screen): an Owner adds an office outside Canada with country \"1234\": \"Not saved\", the Country field itself is marked and shows the server's own field error for country (read from the POST's answer), in plain words; nothing stored",
    res?.status() === FIELD_ERROR_STATUS && server.length > 0 && invalid === "true" && problem.length > 0 && fieldWords.includes(server) && offices() === o0, { status: res?.status(), server, fieldWords, invalid, problem });
  await ctx.close();

  // ------------------------------------------------------------------------------------------------ W2-W4: the sweep
  class Features {}
  await registerFeatures(Features);
  const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, Features) ?? [];
  const all = doors(controllers, PFFO);
  ok(`J-10 W2: the route table read from the app's own feature list: ${all.length} PF/FO routes (${all.filter((d) => d.body).length} take a body, ${all.filter((d) => d.query).length} a query)`, all.length >= 150, all.length);
  const signIn = async (actorId: string) => (await call("POST", "/api/platform/session/local", { body: JSON.stringify({ firmKey: "sample-firm", actorId, secondStep: true }) })).body?.token as string;
  const tR = await signIn("user-R"), keysR = new Set<string>(((await call("GET", "/api/platform/me", { token: tR })).body?.keys as string[]) ?? []);
  // B1 (Lead 19 on #3377): our own staff, a Sample operator of this run holding every system role, signed in afresh for each
  // /api/system route (a change asks for a sign-in in the last 5 minutes). The stand-in needs PLATFORM_SYSTEM_IDENTITY=local.
  const run = randomUUID().slice(0, 8), opEmail = `j10.operator.${run}@expatready.example`;
  const opId = sql(`with s as (insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${opEmail}', 'Sample Operator J10') returning id) select id from s`);
  sql(`insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), '${opId}', code from plat_system_role`);
  const opSignIn = async () => (await call("POST", "/api/system/session/local", { body: JSON.stringify({ email: opEmail, secondStep: true }) })).body?.token as string | undefined;
  const tS0 = await opSignIn(), keysS = new Set<string>(tS0 ? (((await call("GET", "/api/system/me", { token: tS0 })).body?.keys as string[]) ?? []) : []);
  // B3: a real Sample value for each door whose path key is a token, made before the row counts are taken.
  const plan = sql(`select coalesce(min(code), '') from platform_plan where active`);
  const signUp = tS0 ? await call("POST", "/api/system/signup-links", { token: tS0, body: JSON.stringify({ email: `j10.signup.${run}@example.com`, countryCode: "CA", planCode: plan, period: "MONTHLY", reason: "J-10: a real sign-up link for the input probes" }) }) : null;
  const signUpToken = /#token=([A-Za-z0-9_-]+)/.exec(String(signUp?.body?.link ?? ""))?.[1] ?? "";
  // A real booking through the public page (its own address, after the page's minimum fill time): it opens the firm's front
  // office (seeded on its first booking, with its web form) and its answer carries the manage token the token doors need.
  const sampleFirm = sql(`select id from platform_firm where key = 'sample-firm'`);
  const slug0 = sql(`select coalesce(min(slug), '') from fo_consultation_type where firm_id = '${sampleFirm}' and active and show_on_booking_page and deleted_at is null`);
  let bookingToken = "";
  const seedBooking = { id: "", state: "" };
  if (slug0) {
    const page = await call("GET", `/api/public/firms/sample-firm/book/${slug0}/slots`, { from: "127.0.0.250" });
    const slot = (page.body?.slots as { startsAt: string }[] | undefined)?.[0], type = page.body?.type as { modes?: string[] } | undefined;
    if (slot && page.body?.formStamp) {
      await new Promise((r) => setTimeout(r, 3_200));
      const mode = type?.modes?.includes("VIDEO") ? "VIDEO" : (type?.modes?.[0] ?? "VIDEO");
      const made = await call("POST", `/api/public/firms/sample-firm/book/${slug0}/bookings`, { from: "127.0.0.250", body: JSON.stringify({ givenNames: "Sample", familyName: "Booker J10", email: `j10.booker.${run}@example.com`, ...(mode === "PHONE" ? { phone: "+1 416 555 0100" } : {}), mode, startsAt: slot.startsAt, timeZone: String(page.body.timeZone ?? "America/Toronto"), formStamp: page.body.formStamp }) });
      bookingToken = String(made.body?.manageToken ?? "");
      seedBooking.id = sql(`select coalesce((select booking_id::text from fo_booking_token where id = '${bookingToken.split(".")[0].replace(/[^0-9a-f-]/g, "")}'), '')`);
    }
  }
  if (seedBooking.id) seedBooking.state = sql(`select status || ',' || starts_at::text from fo_booking where id = '${seedBooking.id}'`);
  // The Sample web form, live for this copy with its own address as an allowed site (the door checks the page's origin); a live
  // form needs a consent wording (fo_web_form_consent_check): the firm's own.
  const wording = sql(`select coalesce((select id::text from msg_consent_wording where firm_id = '${sampleFirm}' order by published_at limit 1), '')`);
  if (wording) sql(`update fo_web_form set enabled = true, consent_wording_version_id = coalesce(consent_wording_version_id, '${wording}'), allowed_sites = array_append(array_remove(allowed_sites, '${BASE}'), '${BASE}') where firm_id = '${sampleFirm}'`);
  const templateKey = sql(`select 'sales.lead.acknowledgement'`);   // a key of the template registry (platform/messages/templates/registry.ts)
  const rows = () => sql(`select coalesce(string_agg(relname || ':' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', relname), false, true, '')))[1]::text, ',' order by relname), '') from pg_stat_user_tables where (relname ~ '^(platform_|fo_|money_|msg_|plat_|auto_)' or relname in ('module_event', 'webhook_receipt')) and relname not in ('platform_session', 'msg_firm', 'plat_system_audit')`);
  // The seed booking's confirmation is sent by a job (its outbox row and the email's link token come a moment later): the counts
  // are taken once they hold still (two equal reads 2 s apart, at most 30 s), so W4 compares the probes' effect alone.
  let before = rows();
  for (let n = 0; n < 15; n++) { await new Promise((r) => setTimeout(r, 2_000)); const again = rows(); if (again === before) break; before = again; }
  // Path keys that are not record ids, with the Sample firm's real values; a key with no value here gets a random one
  // (see the header: a builder who seeds one adds it here).
  const REAL: Record<string, string> = { ":firmKey": "sample-firm", ":kind": "logo", ":slug": sql(`select coalesce(min(slug), '') from fo_consultation_type where firm_id = (select id from platform_firm where key = 'sample-firm') and active and show_on_booking_page and deleted_at is null`) };
  const formToken = sql(`select coalesce(min(public_token), '') from fo_web_form where firm_id = (select id from platform_firm where key = 'sample-firm')`);
  const keyOf = (path: string, m: string) => m === ":token" && path.startsWith("/api/public/forms/") ? ":formToken"
    : m === ":token" && path.startsWith("/api/public/signup/") ? ":signUpToken"
      : m === ":token" && path.startsWith("/api/public/bookings/") ? ":bookingToken"
        : m === ":key" && path.startsWith("/api/platform/templates/") ? ":templateKey" : m;
  if (formToken) REAL[":formToken"] = formToken;
  if (signUpToken) REAL[":signUpToken"] = signUpToken;
  if (bookingToken) REAL[":bookingToken"] = bookingToken;
  REAL[":templateKey"] = templateKey;
  const fill = (path: string, bad?: string) => path.replace(/:[A-Za-z_]+/g, (m) => (m === bad ? "not-a-uuid" : REAL[keyOf(path, m)] || randomUUID()));
  const MB = "a".repeat(1024 * 1024), LONG = "a".repeat(20_000), QLONG = "a".repeat(2_000), PLONG = "a".repeat(600);
  const declared = await declaredFields();
  // The reviewed by-design exceptions (each with its written reason, awaiting the tech lead) are not counted as failing.
  const excepted = new Set(Object.keys((JSON.parse(readFileSync(join(STUDIO, "tests", "pf28-allow-list.json"), "utf8")) as { exceptions?: { probes?: Record<string, string> } }).exceptions?.probes ?? {}));
  const failing: Record<string, string[]> = Object.fromEntries(AREAS.map((a) => [a, []])), probed: Record<string, number> = Object.fromEntries(AREAS.map((a) => [a, 0]));
  const notTested: string[] = [], five: string[] = [], overLong: string[] = [], noString: string[] = [], unread: string[] = [], unparsed: string[] = [], limited: string[] = [], multipart: string[] = [];
  let overLongTried = 0;
  // B4: loopback source addresses for the public booking doors (127.0.0.10 up; 127.0.0.200 is the control's).
  let sent = 0;
  const nextFrom = () => `127.0.0.${10 + Math.floor(sent++ / 8) % 40}`;   // 127.0.0.10-49 (the header names them)
  // B5, B6 (Lead 19 on #3377): W3 reads the same allow-list, by exact route and status: an over-long probe of these keys is by
  // design only while the named allow-list line stands and only with the status that line's reason gives.
  const W3_BY_DESIGN: Record<string, [string, number]> = {
    "GET /api/public/invitations/:token :token": ["GET /api/public/invitations/:token id:token", 200],
    "POST /api/platform/session/callback code": ["POST /api/platform/session/callback missing", 401],
  };
  const byDesign = (probe: string, status: number) => { const w = W3_BY_DESIGN[probe]; return !!w && excepted.has(w[0]) && status === w[1]; };
  // R1.10 A2 (as ruled on #3487's hand-over): a door whose body is read only after a signature over its raw text reaches its
  // schema through a value this walk cannot follow; it is excused from W3 schema only while the allow-list's own line for
  // that route, saying the signature comes first, stands (exact route; named in a NOTE, never counted as passed).
  const W3_SCHEMA_BY_DESIGN: Record<string, string> = { "POST /api/public/messages/ses-notices": "POST /api/public/messages/ses-notices missing" };
  const schemaExcused: string[] = [];
  const auditAt = sql(`select now()::text`);
  for (const d of all) {
    if (d.keys && !d.keys.every((k) => keysR.has(k))) { notTested.push(`${d.method} ${d.path} (keys ${d.keys.join(", ")})`); continue; }
    if (d.system && !(tS0 && d.system.every((k) => keysS.has(k)))) { notTested.push(`${d.method} ${d.path} (system keys ${d.system.join(", ") || "any of our staff"}: ${tS0 ? "not held by the Sample operator" : "no operator session: start the copy with PLATFORM_SYSTEM_IDENTITY=local"})`); continue; }
    const token = d.open ? undefined : d.system ? await opSignIn() : tR, method = d.method === "ALL" ? "POST" : d.method, area = areaOf(d.path), route = `${d.method} ${d.path}`;
    // B3: the web form's door checks the page's origin; B4: the public booking doors count per address, so their probes come
    // from a new loopback address every 8 requests (another client each time; the limit stays as it is, see the control below).
    const origin = d.path.startsWith("/api/public/forms/") ? { origin: BASE } : undefined, spread = /^\/api\/public\/(firms|bookings|signup)(\/|$)/.test(d.path);
    const ask = (m: string, pth: string, o: CallOpts) => call(m, pth, { ...o, headers: { ...o.headers, ...origin }, ...(spread ? { from: nextFrom() } : {}) });
    const bad = (probe: string, a: Answer) => { if (excepted.has(`${route} ${probe}`)) return; failing[area].push(`${route} ${probe} → ${a.status}`); if (a.status >= 500) five.push(`${route} ${probe}`); };
    if (d.body) {
      const u = await ask(method, fill(d.path), { token, body: JSON.stringify({ pf28Unknown: "x" }) }); probed[area]++;
      if (!(u.status === FIELD_ERROR_STATUS && named(u, "pf28Unknown") && plainWords(u, "pf28Unknown"))) bad("unknown", u);
      const w = await ask(method, fill(d.path), { token, body: "[1]" }); probed[area]++;
      if (w.status !== FIELD_ERROR_STATUS) bad("wrong-type", w);   // the whole body of the wrong type ("[1]")
      // A by-design "missing" line means {} is a valid action there (a cancel, a resend): with a real Sample value it would act, so
      // it is not sent; its answer was never judged (the allow-list's line stands for it).
      const skipM = excepted.has(`${route} missing`);
      const m: Answer = skipM ? { status: 0, body: null } : await ask(method, fill(d.path), { token, body: "{}" }); if (!skipM) probed[area]++;
      const required = m.status === FIELD_ERROR_STATUS ? Object.keys((m.body?.fields as object) ?? {}).filter((k) => /^[A-Za-z][A-Za-z0-9_]*$/.test(k) && k !== "body") : [];   // "body": the whole body, not a field
      const namedMissing = Object.keys((m.body?.fields as object) ?? {});   // "body" counts here: {} refused as a whole, named
      if (!skipM && !((m.status === FIELD_ERROR_STATUS && namedMissing.length > 0 && namedMissing.every((k) => plainWords(m, k))) || (m.status >= 200 && m.status < 300))) bad("missing", m);
      const big = await ask(method, fill(d.path), { token, body: JSON.stringify({ pf28: MB }) }); probed[area]++;
      if (big.status !== 413) bad("1mb", big);
      // One field of the wrong type at a time: each declared field and each required one, sent alone as an object.
      const decl = declared.get(route)?.body ?? null, fields = [...new Set([...(decl ?? []), ...required])];   // every field, no cap
      const how = declared.get(route)?.bodyHow ?? "unparsed";
      if (how === "unparsed") { if (W3_SCHEMA_BY_DESIGN[route] && excepted.has(W3_SCHEMA_BY_DESIGN[route])) schemaExcused.push(route); else unparsed.push(route); } else if (how === "unread") unread.push(route);
      for (const f of [...fields]) {
        let t = await ask(method, fill(d.path), { token, body: JSON.stringify({ [f]: { pf28: 1 } }) }); probed[area]++;
        // A field that is itself an object (the answer names "<f>.<inner>") gets a number as its wrong type instead.
        if (Object.keys((t.body?.fields as object) ?? {}).some((k) => k.startsWith(`${f}.`))) t = await ask(method, fill(d.path), { token, body: JSON.stringify({ [f]: 12345 }) });
        if (t.status === 429 && SIGN_UP.test(d.path)) { limited.push(`${route} ${f}`); fields.splice(fields.indexOf(f), 1); continue; }
        // A field only the missing probe named, which the JSON body refuses as unknown, is a multipart part (a file):
        // not a JSON field; named in the note line, not probed further.
        if (!decl?.includes(f) && NOT_ALLOWED.test(wordsOf(t, f))) { multipart.push(`${route} ${f}`); fields.splice(fields.indexOf(f), 1); continue; }
        if (!fieldError(t, f)) bad(`wrong-type(${f})`, t);
      }
      // W3: over-long, by length: each field alone at 20,000 characters; a field the answer calls "must be a
      // number / a list / ..." is not a string field and is not counted.
      let strings = 0;
      for (const f of fields) {
        const l = await ask(method, fill(d.path), { token, body: JSON.stringify({ [f]: LONG }) });
        if (l.status === 429 && SIGN_UP.test(d.path)) { limited.push(`${route} long:${f}`); continue; }
        if (l.status === FIELD_ERROR_STATUS && named(l, f) && NOT_TEXT.test(wordsOf(l, f))) continue;
        strings++; overLongTried++;
        if (!fieldError(l, f) && !byDesign(`${route} ${f}`, l.status)) { overLong.push(`${route} ${f} → ${l.status}${wordsOf(l, f) ? ` "${wordsOf(l, f).slice(0, 60)}"` : ""}`); if (l.status >= 500) five.push(`${route} long:${f}`); }
      }
      if (fields.length && strings === 0 && !limited.some((x) => x.startsWith(`${route} `))) noString.push(route);
    }
    if (d.query) {
      const q = await ask(method, `${fill(d.path)}?pf28Unknown=x`, { token, body: d.body ? "{}" : undefined }); probed[area]++;
      if (!(q.status === FIELD_ERROR_STATUS && named(q, "pf28Unknown"))) bad("query-unknown", q);
      const qd = declared.get(route)?.query ?? null;
      const qhow = declared.get(route)?.queryHow ?? "unparsed";
      if (qhow === "unparsed") unparsed.push(`${route} (query)`); else if (qhow === "unread") unread.push(`${route} (query)`);
      // A query schema built at run time: its required keys, as the route names them when the query is sent empty.
      let qfields = qd ?? [];
      if (qd === null && qhow === "unread") { const e = await ask(method, fill(d.path), { token, body: d.body ? "{}" : undefined }); qfields = e.status === FIELD_ERROR_STATUS ? Object.keys((e.body?.fields as object) ?? {}) : []; }
      for (const f of qfields) {   // every key, no cap
        const l = await ask(method, `${fill(d.path)}?${f}=${QLONG}`, { token, body: d.body ? "{}" : undefined });
        if (l.status === FIELD_ERROR_STATUS && named(l, f) && NOT_TEXT.test(wordsOf(l, f))) continue;   // a number or list key, not text
        overLongTried++;
        if (!fieldError(l, f)) { overLong.push(`${route} ?${f} → ${l.status}${wordsOf(l, f) ? ` "${wordsOf(l, f).slice(0, 60)}"` : ""}`); if (l.status >= 500) five.push(`${route} long:?${f}`); }
      }
    }
    for (const prm of d.path.match(/:[A-Za-z_]+/g) ?? []) {
      if (REAL[keyOf(d.path, prm)] !== undefined || d.path.startsWith("/api/public/")) {   // a string key, not a record id: over-long
        overLongTried++;
        const l = await ask(method, d.path.replace(/:[A-Za-z_]+/g, (x) => (x === prm ? PLONG : REAL[keyOf(d.path, x)] || randomUUID())), { token, body: d.body ? "{}" : undefined });
        if (byDesign(`${route} ${prm}`, l.status)) continue;
        if (!(l.status === 404 || l.status === 410 || fieldError(l, prm.slice(1)))) { overLong.push(`${route} ${prm} (600 characters) → ${l.status}`); if (l.status >= 500) five.push(`${route} long:${prm}`); }
        continue;
      }
      const i = await ask(method, fill(d.path, prm), { token, body: d.body ? "{}" : undefined }); probed[area]++;
      if (i.status !== 404) bad(`id${prm}`, i);
    }
  }
  // B4 control: the limit still holds. From one new address, booking 11 times in a row: the 11th is 429 (10 an address in 10 minutes).
  const book = all.find((d) => d.path === "/api/public/firms/:firmKey/book/:slug/bookings");
  if (book) {
    let last: Answer = { status: 0, body: null };
    for (let n = 0; n < 11; n++) last = await call("POST", fill(book.path), { body: "{}", from: "127.0.0.200" });
    probed.booking++;
    if (last.status !== 429) failing.booking.push(`POST ${book.path} rate-limit control (11th from one address) → ${last.status}`);
  }
  for (const area of AREAS) {
    const f = failing[area], routes = [...new Set(f.map((x) => x.split(" ").slice(0, 2).join(" ")))];
    if (f.length) console.log(`  ${area}, every probe not as ruled: ${f.join(" | ")}`);   // the full list, for the builder (the line below is cut)
    ok(`J-10 W2 ${area}: every probe answers as ruled (${FIELD_ERROR_STATUS} naming the field in plain words, 413, 404) — ${probed[area]} probes, ${f.length} not as ruled on ${routes.length} routes`, f.length === 0 && probed[area] > 0, f.slice(0, 12));
  }
  ok(`J-10 W2 every route: each of the ${all.length} PF/FO routes was probed (none left out because no Sample token holds its keys)`, notTested.length === 0, notTested);
  if (limited.length) console.log(`NOT TESTED  J-10 W2/W3: ${limited.length} field probes reached the door's own rate limit (sign-up: 10 a client in 10 minutes, by design) and were not judged: ${limited.join(", ")}`);
  if (multipart.length) console.log(`NOTE  J-10 W2/W3: multipart file parts (required, refused in a JSON body as not a field), not probed as JSON fields: ${multipart.join(", ")}`);
  if (overLong.length) console.log(`  over-long, every field not as ruled: ${overLong.join(" | ")}`);
  if (unparsed.length) console.log(`  input reaching no zod parse: ${unparsed.join(" | ")}`);
  if (schemaExcused.length) console.log(`NOTE  J-10 W3 schema: by design, read after a signature over the raw text (the allow-list's line stands): ${schemaExcused.join(", ")}`);
  if (unread.length) console.log(`NOTE  J-10 W3: ${unread.length} inputs reach a zod parse whose fields this walk cannot take apart (a schema built at run time, e.g. Object.fromEntries); probed: a body's required fields (named by its missing probe), a query's required keys (named when it is sent empty): ${unread.join(", ")}`);
  ok(`J-10 W3 run-time schemas: at most ${RUNTIME_SCHEMAS} inputs (the reviewed count, 22 Nov) reach a schema this walk cannot take apart; more means a new one came in unread`, unread.length <= RUNTIME_SCHEMAS, unread.length);
  ok(`J-10 W3: every string field (body, query, path key) sent at its over-long length answers a field error naming it, or 404 for a path key — ${overLongTried} fields tried; ${noString.length} routes with a body declare no string field (listed, not counted as passed: ${noString.slice(0, 15).join(", ")})`, overLongTried > 0 && overLong.length === 0, overLong.slice(0, 15));
  ok(`J-10 W3 schema: every body and query reaches a zod schema (${unparsed.length} reach none: their fields cannot be known or checked)`, unparsed.length === 0, unparsed.slice(0, 20));
  const after = rows();
  const changed = before.split(",").filter((x) => !after.split(",").includes(x));
  // B1: our staff's audit is left out of the counts above (each call writes its line, allowed or refused); every new line must be
  // the Sample operator's, and a change it completed would show in the other tables (staff, firms, register), which are counted.
  const otherAudit = sql(`select count(*) from plat_system_audit where at >= '${auditAt}'::timestamptz and staff_id <> '${opId}'`);
  if (otherAudit !== "0") changed.push(`plat_system_audit: ${otherAudit} lines not by the Sample operator`);
  // B3 (review m1): with real token values a probe could act by an update, which no row count shows: the seed booking keeps its
  // state and slot, its link tokens stay live, and the sign-up link stays unused.
  if (seedBooking.id) {
    const now2 = sql(`select status || ',' || starts_at::text from fo_booking where id = '${seedBooking.id}'`);
    if (now2 !== seedBooking.state) changed.push(`fo_booking ${seedBooking.id}: ${seedBooking.state} → ${now2}`);
    const voided = sql(`select count(*) from fo_booking_token where booking_id = '${seedBooking.id}' and voided_at is not null`);
    if (voided !== "0") changed.push(`fo_booking_token: ${voided} of the seed booking's tokens voided`);
  }
  if (signUpToken && sql(`select count(*) from platform_signup_link where token_hash = '${createHash("sha256").update(signUpToken).digest("hex")}' and used_at is null`) !== "1") changed.push("platform_signup_link: the seed sign-up link was used");
  ok("J-10 W4: nothing stored by any probe (the PF/FO tables' row counts are unchanged)", changed.length === 0, changed);
  ok("J-10 W4: no probe answered 500", five.length === 0, five);

  // ------------------------------------------------------------------------------------------------ W5: the case side
  const cs = doors(controllers, CASE), csBad: string[] = [];
  let csProbes = 0;
  // B2 (Lead 19 on #3377): authorise before validate stays. Each door is asked with the session it takes: a firm token where it
  // declares permission keys, else the case side's own actor (CS-V1's sweep's, user-O); and one firm token on an actor door must
  // stay 403 (ConfigReadGuard: a bearer on a /api/runtime route without keys is refused before its input is read).
  const actorDoor = cs.find((d) => !d.keys && /:id\b/.test(d.path));
  if (actorDoor) { csProbes++; const a = await call(actorDoor.method === "ALL" ? "POST" : actorDoor.method, actorDoor.path.replace(/:[A-Za-z_]+/g, () => "not-a-uuid"), { token: tR, body: actorDoor.body ? "{}" : undefined }); if (a.status !== 403) csBad.push(`${actorDoor.method} ${actorDoor.path} bearer on an actor door → ${a.status} (expected 403)`); }
  for (const d of cs) {
    const method = d.method === "ALL" ? "POST" : d.method, params = d.path.match(/:[A-Za-z_]+/g) ?? [];
    const as: CallOpts = d.keys ? { token: tR } : { headers: { "x-actor": "user-O" } };
    if (!params.length && d.body && method !== "GET") { csProbes++; const a = await call(method, d.path, { ...as, body: JSON.stringify({ pf28Unknown: "x" }) }); if (!(a.status === 400 && named(a, "pf28Unknown"))) csBad.push(`${d.method} ${d.path} unknown → ${a.status}`); }
    if (!params.length && d.query && method === "GET") { csProbes++; const a = await call(method, `${d.path}?pf28Unknown=x`, { ...as }); if (!(a.status === 400 && named(a, "pf28Unknown"))) csBad.push(`${d.method} ${d.path} query-unknown → ${a.status}`); }
    for (const prm of params.filter((x) => /id$/i.test(x))) { csProbes++; const a = await call(method, d.path.replace(/:[A-Za-z_]+/g, (m) => (m === prm ? "not-a-uuid" : randomUUID())), { ...as, body: d.body ? "{}" : undefined }); if (a.status !== 404) csBad.push(`${d.method} ${d.path} id${prm} → ${a.status}`); }
  }
  ok(`J-10 W5 case side (${cs.length} routes, ${csProbes} probes): an unknown field answers 400 naming it; a malformed id answers 404`, cs.length > 0 && csProbes > 0 && csBad.length === 0, csBad.slice(0, 12));

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
  await browser?.close();
}
process.exit(summary() ? 1 : 0);
