// CS-V1 (STANDARDS §6 contract first: every body and query is read through a zod schema; errors are RFC 9457 Problem
// Details): the input check over every case-side route. Every route under /api/runtime and /api/link, in any file or
// folder of api/src (features/ included), is found in the code (tests/lib/routes.ts); each handler that takes a body or
// a query is followed into the service method it hands it to, and must reach a zod parse there. The methods that do not
// today are the reviewed ALLOW list below, which only shrinks: a method fixed but still listed fails, as does a listed
// one taken off without a fix. Then a running copy is asked every route with an id parameter with "not-a-uuid" (and the
// same with a NUL byte): a malformed id is simply not found (main.ts ProblemErrors), never a 500; the routes that answer
// 500 today are the reviewed ALLOW_500 list (fixed in CS-V1 PR 2-3b). Named cases DW1-DW3. US$0, no model call.
// CS-V1 part 2: DW4, for each file whose inputs now parse, an oversized value, a wrong type and an unknown field each
// answer 400 naming the field and store nothing (rows counted before and after); a correct one still answers.
// CS-V1 part 3: DW4 for the last five (the case list, the questionnaire, the PDF copy, a signing step, the signed scan);
// DW5: the allow-list is empty, and a planted unparsed route fails the check.
//   zsh studio/tools/isolated.sh runtime_csv1 4486 start && tsx studio/tests/check_csv1_inputs.ts 4486 xr_studio_runtime_csv1
import { join } from "node:path";
import { planted } from "./lib/ts-files.ts";
import { follows, routes, type Route } from "./lib/routes.ts";

const PORT = Number(process.argv[2] ?? 4486);
const API = join(import.meta.dirname, "..", "api", "src");
const CASE_SIDE = /^\/api\/(runtime|link)(\/|$)/;
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

/** The reviewed list of today's unparsed inputs, "<file> <VERB> <path> <body|query>[(key)]". It only shrinks: each line
 *  goes when its method parses (CS-V1 PR 2: review-rounds/readiness/form-additions; PR 3a: person-link, case-prepare,
 *  sign-steps; PR 3b: runtime.ts; done in part 3, 19 Nov). A new unparsed input fails the check (DW5). */
export const ALLOW = new Set<string>([]);   // CS-V1 part 3: empty (pdfCopy, Runtime.list, the questionnaire, SignSteps.step and .scan parse)
/** The reviewed list of routes that answer 500 to a malformed id today, "<VERB> <path>" (DW3). Only shrinks. */
export const ALLOW_500 = new Set<string>([]);

type Input = { route: Route; key: string; parsedAt: string | null };
/** Every body or query a case-side route under `dir` takes, and where it is parsed (null: nowhere). */
export function inputs(dir: string): Input[] {
  const out: Input[] = [];
  for (const r of routes(dir).filter((x) => CASE_SIDE.test(x.path)))
    for (const i of r.inputs.filter((x) => x.kind !== "param"))
      out.push({ route: r, key: `${r.file} ${r.verb} ${r.path} ${i.kind}${i.key ? `(${i.key})` : ""}`, parsedAt: follows(dir, r.controller, r.node, i.name) });
  return out;
}
/** Steps 3 and 5: the unparsed inputs not on the list, and the listed ones that parse now or no longer exist. */
export function judge(found: Input[], allow: Set<string>) {
  const keys = new Set(found.map((x) => x.key));
  return {
    unlisted: found.filter((x) => !x.parsedAt && !allow.has(x.key)).map((x) => x.key),
    fixedButListed: [...allow].filter((k) => !keys.has(k) || found.some((x) => x.key === k && x.parsedAt)),
  };
}
/** DW3's rule: a 500 not on the list fails; a listed route that no longer answers 500 fails (the list only shrinks). */
export function judge500(answers: { route: string; status: number }[], allow: Set<string>) {
  const five = new Set(answers.filter((a) => a.status >= 500).map((a) => a.route));
  return { unlisted: [...five].filter((r) => !allow.has(r)), fixedButListed: [...allow].filter((r) => !five.has(r)) };
}

// ---- 1-3, 5: the code
const all = routes(API).filter((r) => CASE_SIDE.test(r.path));
const found = inputs(API);
console.log(`case-side routes: ${all.length} in ${new Set(all.map((r) => r.file)).size} files; ${new Set(found.map((x) => `${x.route.verb} ${x.route.path}`)).size} take a body or query (${found.length} inputs); ${found.filter((x) => !x.parsedAt).length} unparsed`);
ok("1: the finder sees every verb under /api/runtime and /api/link, features/ included", ["GET", "POST", "PUT", "PATCH", "DELETE"].every((v) => all.some((r) => r.verb === v)) && all.some((r) => r.file.startsWith("features/")) && all.some((r) => r.path.startsWith("/api/link/")), [...new Set(all.map((r) => r.verb))]);
ok("2: a body is followed through the handler into its service (runtime.ts putAnswer → Runtime.saveAnswer; person-link /api/link/open → PersonLinks.linkByToken)",
  found.find((x) => x.key === "runtime.ts PUT /api/runtime/cases/:id/answers/:subject/:field body")?.parsedAt === "Runtime.saveAnswer" && found.find((x) => x.key === "person-link.ts POST /api/link/open body")?.parsedAt === "PersonLinks.linkByToken");
const j = judge(found, ALLOW);
ok("3: every case-side body and query reaches a zod parse, or is on the reviewed list", j.unlisted.length === 0, j.unlisted);
ok("5: the list only shrinks: no listed input parses now or is gone", j.fixedButListed.length === 0, j.fixedButListed);

// ---- DW1: a planted route with an unparsed body fails the check; the same route with a schema passes.
const route = (bodyLine: string) => `import { Body, Controller, Inject, Injectable, Param, Post } from "@nestjs/common";
import { z } from "zod";
const Thing = z.strictObject({ name: z.string().max(100) });
@Injectable() export class Things {
  async put(id: string, body: unknown) { ${bodyLine} return { id }; }
}
@Controller("api/runtime") export class ThingsController {
  constructor(@Inject(Things) private readonly t: Things) {}
  @Post("things/:id") put(@Param("id") id: string, @Body() b: unknown) { return this.t.put(id, b); }
}`;
const bad = judge(inputs(planted({ "features/things/things.ts": route("const b = body as { name?: string };") })), new Set());
ok("CS-V1 DW1 fail: a planted route in a subfolder with an unparsed body fails the check", bad.unlisted.join() === "features/things/things.ts POST /api/runtime/things/:id body", bad);
const good = judge(inputs(planted({ "features/things/things.ts": route("const b = parse(Thing, body);") })), new Set());
ok("CS-V1 DW1 pass: the same route parsing its body with a schema passes", good.unlisted.length === 0 && good.fixedButListed.length === 0, good);
const viaSafe = judge(inputs(planted({ "things.ts": route("const r = Thing.safeParse(body ?? {});") })), new Set());
const viaJson = judge(inputs(planted({ "things.ts": route("const r = JSON.parse(String(body));") })), new Set());
ok("CS-V1 DW1: Schema.safeParse counts as a parse; JSON.parse does not", viaSafe.unlisted.length === 0 && viaJson.unlisted.length === 1, { viaSafe, viaJson });
// Review of #2007 (M1, m1, m2): only a parse of the whole value counts; an input with no one name, or read off @Req(), is
// unparsed (loud), never missing; qs.parse is not a schema.
const fails = (files: Record<string, string>) => judge(inputs(planted(files)), new Set()).unlisted.length === 1;
ok("CS-V1 DW1 fail: a parse of one field (parse(S, body.name)) leaves the body unparsed", fails({ "things.ts": route("const n = parse(Thing, body.name);") }));
ok("CS-V1 DW1 fail: a body's field written into an object literal ({ name: body }) is not the whole body", fails({ "things.ts": route("const n = parse(Thing, { name: body });") }));
ok("CS-V1 DW1 fail: qs.parse(body) is not a zod schema", fails({ "things.ts": route("const n = qs.parse(body);") }));
const handOff = (arg: string) => route("").replace("{  return { id }; }", "{ return this.more(id, " + arg + "); }\n  async more(id: string, x: unknown) { return parse(Thing, x); }");
ok("CS-V1 DW1 pass: the whole body handed on ({ ...body }, body ?? {}) and parsed there counts", !fails({ "things.ts": handOff("{ ...body }") }) && !fails({ "things.ts": handOff("body ?? {}") }));
ok("CS-V1 DW1 fail: one field handed on (body.name) and parsed there does not count", fails({ "things.ts": handOff("(body as { name: unknown }).name") }));
const viaReq = route("").replace('@Post("things/:id") put(@Param("id") id: string, @Body() b: unknown) { return this.t.put(id, b); }', '@Post("things/:id") put(@Param("id") id: string, @Req() r: { body: unknown }) { return this.t.put(id, r.body); }');
const viaDestructure = route("").replace("@Body() b: unknown) { return this.t.put(id, b); }", "@Body() { name }: { name: string }) { return this.t.put(id, name); }");
ok("CS-V1 DW1 fail: a body read off @Req() (req.body) is unparsed, not missing", fails({ "things.ts": viaReq }));
ok("CS-V1 DW1 fail: a destructured @Body() is unparsed, not missing", fails({ "things.ts": viaDestructure }));

// ---- DW2: the allow-list only shrinks. The list is empty since part 3, so "taken off without a fix" is asked of a
// planted unparsed route: listed it passes, taken off it fails.
const unfixedFound = inputs(planted({ "things.ts": route("const b = body as { name?: string };") })), unfixed = "things.ts POST /api/runtime/things/:id body";
const dw2a = judge(unfixedFound, new Set()), dw2listed = judge(unfixedFound, new Set([unfixed]));
ok("CS-V1 DW2 fail: a method taken off the list without a fix fails", dw2a.unlisted.join() === unfixed && !dw2listed.unlisted.length && !dw2listed.fixedButListed.length, { dw2a, dw2listed });
const fixedKey = "runtime.ts PUT /api/runtime/cases/:id/answers/:subject/:field body";   // parses today (Runtime.saveAnswer)
const dw2b = judge(found, new Set([...ALLOW, fixedKey, "gone.ts POST /api/runtime/gone body"]));
ok("CS-V1 DW2 fail: a method fixed (or gone) but still listed fails", dw2b.fixedButListed.sort().join("|") === ["gone.ts POST /api/runtime/gone body", fixedKey].sort().join("|"), dw2b);
ok("CS-V1 DW2 pass: today's list matches the code exactly", j.unlisted.length === 0 && j.fixedButListed.length === 0);

// ---- DW5 (part 3): the list is empty and the check passes; a planted unparsed route (in any file) fails it.
ok("CS-V1 DW5 pass: ALLOW is empty and every case-side body and query reaches a zod parse", ALLOW.size === 0 && j.unlisted.length === 0 && j.fixedButListed.length === 0, { allow: [...ALLOW], ...j });
const dw5 = judge([...found, ...inputs(planted({ "features/things/things.ts": route("const b = body as { name?: string };") }))], ALLOW);
ok("CS-V1 DW5 fail: a planted unparsed route fails the check with the empty list", dw5.unlisted.join() === "features/things/things.ts POST /api/runtime/things/:id body", dw5);

// ---- DW3: every route with an id parameter answers 404 to a malformed id (a running copy). Every path parameter is
// asked (review of #2007 m3: :run, :doc, :answer, :row are ids too), each set to the malformed value.
const withId = all.filter((r) => /:[A-Za-z]+/.test(r.path));
const answers: { route: string; probe: string; status: number }[] = [];
const fill = (path: string, v: string) => path.replace(/:[A-Za-z]+/g, v);
let reached = true;
for (const r of withId) for (const probe of ["not-a-uuid", "not-a-uuid%00"]) {
  try {
    const method = r.verb === "ALL" ? "POST" : r.verb, bodyless = method === "GET" || method === "HEAD" || method === "OPTIONS";
    const res = await fetch(`http://localhost:${PORT}${fill(r.path, probe)}`, { method, headers: { "x-actor": "user-O", ...(bodyless ? {} : { "content-type": "application/json" }) }, ...(bodyless ? {} : { body: "{}" }) });
    answers.push({ route: `${r.verb} ${r.path}`, probe, status: res.status });
  } catch { reached = false; break; }
}
ok(`DW3: a copy answers on :${PORT}`, reached, reached ? undefined : `start it: zsh studio/tools/isolated.sh runtime_csv1 ${PORT} start`);
if (reached) {
  const by = (s: (n: number) => boolean) => answers.filter((a) => s(a.status)).map((a) => `${a.route} [${a.probe}] ${a.status}`);
  console.log(`DW3: ${withId.length} routes with an id, ${answers.length} asks: ${by((s) => s === 404).length} answered 404; refused before the id was read (no session, not allowed, a bad body): ${JSON.stringify(by((s) => s !== 404 && s < 500))}`);
  const d = judge500(answers, ALLOW_500);
  ok("CS-V1 DW3: every route with an id parameter answers a malformed id (and one with a NUL byte) without a 500, unless listed", d.unlisted.length === 0, by((s) => s >= 500));
  ok("CS-V1 DW3: the 500 list only shrinks", d.fixedButListed.length === 0, d.fixedButListed);
  ok("CS-V1 DW3: a malformed id is mostly simply not found (404)", by((s) => s === 404).length > answers.length / 2, by((s) => s !== 404));
}
const fake = [{ route: "POST /api/runtime/x/:id", status: 500 }, { route: "GET /api/runtime/y/:id", status: 404 }];
ok("CS-V1 DW3 fail: a 500 not on the list fails", judge500(fake, new Set()).unlisted.join() === "POST /api/runtime/x/:id");
ok("CS-V1 DW3 fail: a listed route that answers 404 now must leave the list", judge500(fake, new Set(["POST /api/runtime/x/:id", "GET /api/runtime/y/:id"])).fixedButListed.join() === "GET /api/runtime/y/:id");
ok("CS-V1 DW3 pass: a listed 500 passes", (() => { const x = judge500(fake, new Set(["POST /api/runtime/x/:id"])); return !x.unlisted.length && !x.fixedButListed.length; })());

// ---- DW4 (part 2): readiness, form additions, case documents, assessments and the form copy on the running copy, one
// Visitor visa case (the acceptance helpers' setup); case-close's routes take PF-4's staff sign-in, so its schemas are
// asked directly here and its route words stay proven by check_csc1_close.ts.
if (reached) {
  const m3 = await import("../acceptance/lib/m3.ts");
  const { spawnSync } = await import("node:child_process");
  const studio = join(import.meta.dirname, ".."), tsx = join(studio, "node_modules", ".bin", "tsx");
  const releases = () => Number(m3.sql(`select coalesce(max(r.version), 0) from config_release r join combination c on c.id = r.combination_id where c.combination_key = 'vv.single'`) ?? 0);
  if (releases() < 1) spawnSync(tsx, ["--tsconfig", join(studio, "api", "tsconfig.json"), join(studio, "tests/runtime/setup_visitor_visa.ts"), String(PORT), m3.DB], { cwd: join(studio, ".."), stdio: "ignore", timeout: 900_000 });
  // Part 3 (review m1): release 2, with signers and channels (acceptance/lib/setup_vv_m3.ts, as check_c81_signing_api runs
  // it; its own red lines, other rows' S2w and S7a, do not stop it), so a filled case has IMM 5476 signed by hand and scanned.
  if (releases() < 2) spawnSync(tsx, ["--tsconfig", join(studio, "api", "tsconfig.json"), join(studio, "acceptance/lib/setup_vv_m3.ts"), String(PORT), m3.DB], { cwd: join(studio, ".."), stdio: "ignore", timeout: 900_000 });
  ok("DW4 setup: the copy has Visitor visa release 2", releases() >= 2, releases());
  const f = await m3.firms(), officer = f.officer ?? m3.OFFICER, rep = f.rep ?? "user-R";
  const c = await m3.openCase(m3.needVisitorVisa(), [{ role: "principal", name: "Sample Client V", dob: m3.yearsAgo(40) }], { representative: rep, caseOfficers: [officer] });
  const subject = c.subjects["Sample Client V"], fid = m3.filingOf((await m3.prepare(c.id, officer)).p, subject)?.id ?? "";
  ok("DW4 setup: a case with a filing", !!fid, { case: c.id, fid });
  const rows = () => m3.sql("select (select count(*) from audit_event) || '/' || (select count(*) from filing_review) || '/' || (select count(*) from readiness_pass) || '/' || (select count(*) from filing_form_addition) || '/' || (select count(*) from filing_form_addition where removed_at is not null) || '/' || (select count(*) from form_instance) || '/' || (select count(*) from sign_step) || '/' || (select count(*) from signed_scan)");
  const named = (b: { errors?: { field?: string; message?: string }[]; detail?: string } | undefined, field: string) => (b?.errors ?? []).some((e) => e.field === field || (field === "body" && /Not part of|Not a filter/.test(e.message ?? "")));
  /** Each bad request answers 400 naming its field and changes no row; the good one is not refused by the schema. */
  const dw4 = async (file: string, method: string, path: (q: string) => string, actor: string, bad: { why: string; body?: unknown; q?: string; field: string }[], good: { body?: unknown; q?: string; expect: (s: number) => boolean }) => {
    for (const x of bad) {
      const before = rows(), r = await m3.call(method, path(x.q ?? ""), x.body, actor), after = rows();
      ok(`CS-V1 DW4 fail (${file}): ${x.why} answers 400 naming ${x.field}, nothing stored`, r.status === 400 && named(r.body, x.field) && before === after, { status: r.status, body: r.body, before, after });
    }
    const r = await m3.call(method, path(good.q ?? ""), good.body, actor);
    ok(`CS-V1 DW4 pass (${file}): a correct ${method} still answers as before`, good.expect(r.status), { status: r.status, body: r.body });
    return r;
  };
  const big = "x".repeat(6000);
  await dw4("readiness.ts", "POST", () => `/runtime/filings/${fid}/review`, rep, [
    { why: "an unknown field", body: { facts_hash: "0".repeat(64), extra: 1 }, field: "body" },
    { why: "a wrong type (self: \"yes\")", body: { facts_hash: "0".repeat(64), self: "yes" }, field: "self" },
    { why: "an oversized note", body: { facts_hash: "0".repeat(64), note: big }, field: "note" },
  ], { body: { facts_hash: "0".repeat(64) }, expect: (s) => s === 409 });   // the schema takes it; the facts it names are stale, as before (409)
  await dw4("readiness.ts", "POST", () => `/runtime/filings/${fid}/warnings/missing_document/pass`, officer, [
    { why: "an unknown field", body: { reason: "Passport arrives tomorrow (Sample)", extra: 1 }, field: "body" },
    { why: "an oversized key", body: { reason: "Passport arrives tomorrow (Sample)", key: "k".repeat(100_001) }, field: "key" },
  ], { body: { reason: "Passport arrives tomorrow (Sample)" }, expect: (s) => s === 200 || s === 409 });
  const list = await dw4("form-additions.ts", "GET", (q) => `/runtime/filings/${fid}/addable-forms${q}`, officer, [
    { why: "q given twice", q: "?q=a&q=b", field: "q" },
    { why: "an oversized q", q: `?q=${"x".repeat(300)}`, field: "q" },
    { why: "an unknown filter", q: "?q=&extra=1", field: "body" },
  ], { q: "?q=", expect: (s) => s === 200 });
  const form = (list.body?.forms ?? []).find((x: { addable?: boolean; why_not?: unknown }) => x.addable !== false && !x.why_not)?.form;
  await dw4("form-additions.ts", "GET", (q) => `/runtime/filings/${fid}/addable-forms/${encodeURIComponent(form ?? "")}${q}`, officer, [
    { why: "an unknown filter", q: `?subject=${subject}&extra=1`, field: "body" },
    { why: "subject given twice", q: `?subject=${subject}&subject=${subject}`, field: "subject" },
  ], { q: `?subject=${subject}`, expect: (s) => s === 200 });
  await dw4("form-additions.ts", "POST", () => `/runtime/filings/${fid}/form-additions`, officer, [
    { why: "an unknown field", body: { form, extra: 1 }, field: "body" },
    { why: "a wrong type (channel: 5)", body: { form, channel: 5 }, field: "channel" },
    { why: "an oversized signature", body: { form, signature: big }, field: "signature" },
    { why: "an oversized form number", body: { form: big }, field: "form" },
  ], { body: { form, subject }, expect: (s) => s === 201 || s === 409 || s === 422 });
  const added = m3.sql(`select id from filing_form_addition where filing_id = '${fid}' and removed_at is null limit 1`);
  if (added) await dw4("form-additions.ts", "POST", () => `/runtime/form-additions/${added}/remove`, officer, [
    { why: "an unknown field", body: { reason: "Added by mistake (Sample)", extra: 1 }, field: "body" },
    { why: "an oversized reason", body: { reason: big }, field: "reason" },
  ], { body: { reason: "Added by mistake (Sample)" }, expect: (s) => s === 200 });
  else ok("CS-V1 DW4 (form-additions.ts): a form was added to remove", false, { form });
  await dw4("case-documents.ts", "GET", (q) => `/runtime/cases/${c.id}/proposals${q}`, officer, [
    { why: "subject given twice", q: `?subject=${subject}&subject=${subject}`, field: "subject" },
    { why: "an unknown filter", q: "?other=1", field: "body" },
  ], { q: `?subject=${subject}`, expect: (s) => s === 200 });
  await dw4("case-documents.ts", "GET", (q) => `/runtime/cases/${c.id}/checks${q}`, officer, [
    { why: "a state that is not open or resolved", q: "?state=closed", field: "state" },
    { why: "an oversized subject", q: `?subject=${"x".repeat(300)}`, field: "subject" },
  ], { q: "?state=open", expect: (s) => s === 200 });
  await dw4("assessments.ts", "GET", (q) => `/runtime/cases/${c.id}/assessments${q}`, officer, [
    { why: "person given twice", q: "?person=a&person=b", field: "person" },
    { why: "an oversized person", q: `?person=${"x".repeat(300)}`, field: "person" },
    { why: "an unknown filter", q: "?extra=1", field: "body" },
  ], { q: "", expect: (s) => s === 200 });
  await dw4("fill-case.ts", "GET", (q) => `/runtime/form-copies/00000000-0000-4000-8000-000000000000/file${q}`, officer, [
    { why: "original given twice", q: "?original=1&original=1", field: "original" },
    { why: "an oversized original", q: `?original=${"1".repeat(50)}`, field: "original" },
    { why: "an unknown filter", q: "?original=1&extra=1", field: "body" },
  ], { q: "?original=1", expect: (s) => s === 404 });   // no such copy: the flag passes the schema, the copy is not found, as before

  // ---- DW4 (part 3): the last five. The case list and the questionnaire (runtime.ts), the PDF copy (case-prepare.ts),
  // a signing step and the signed scan (sign-steps.ts). A refused write says "Nothing was stored." (rows counted).
  const stored = (b: { detail?: string } | undefined) => /Nothing was stored\.$/.test(b?.detail ?? "");
  const page = await dw4("runtime.ts", "GET", (q) => `/runtime/cases${q}`, officer, [
    { why: "q given twice", q: "?q=a&q=b", field: "q" },
    { why: "an oversized q", q: `?q=${"x".repeat(300)}`, field: "q" },
    { why: "take given twice", q: "?take=1&take=2", field: "take" },
    { why: "an oversized after", q: `?after=${"x".repeat(300)}`, field: "after" },
    { why: "an unknown filter", q: "?take=5&extra=1", field: "body" },
  ], { q: "?take=5", expect: (s) => s === 200 });
  ok("CS-V1 DW4 pass (runtime.ts): the case list keeps take's limit and its default (a take that is not a number is 50, as before; 1.5 is 1, not a 500)", (page.body?.cases ?? []).length <= 5 && (await m3.call("GET", "/runtime/cases?take=abc", undefined, officer)).status === 200 && (await m3.call("GET", "/runtime/cases?take=1.5", undefined, officer)).status === 200, page.body?.cases?.length);
  await dw4("runtime.ts", "GET", (q) => `/runtime/cases/${c.id}/questionnaire${q}`, officer, [
    { why: "mode given twice", q: "?mode=agent&mode=pqr", field: "mode" },
    { why: "an oversized mode", q: `?mode=${"a".repeat(300)}`, field: "mode" },
    { why: "a mode that is not one of its words", q: "?mode=everything", field: "mode" },
    { why: "an unknown filter", q: "?mode=agent&extra=1", field: "body" },
  ], { q: "?mode=agent", expect: (s) => s === 200 });
  ok("CS-V1 DW4 pass (runtime.ts): the questionnaire still answers pqr, sqr, client and none", (await Promise.all(["?mode=pqr", "?mode=sqr", "?mode=client", ""].map(async (q) => (await m3.call("GET", `/runtime/cases/${c.id}/questionnaire${q}`, undefined, officer)).status))).every((s) => s === 200));
  type Item = { id: string; kind: string; form?: string; subject: string; channel?: string; signature?: string };
  // Review m1: a second case with every fact filled, so its forms take their channels and signatures (IMM 5476 signed by
  // hand and scanned, as check_c81_signing_api reaches it) and the stored 201 path runs here too.
  const c2 = await m3.openCase(m3.needVisitorVisa(), [{ role: "principal", name: "Sample Client W", dob: m3.yearsAgo(40) }], { representative: rep, caseOfficers: [officer] });
  await m3.fillEverything(c2.id);
  const items = ((await m3.prepare(c2.id, officer)).p?.items ?? []) as Item[];
  const online = items.find((i) => i.kind === "form" && i.channel === "ONLINE"), hand = items.find((i) => i.kind === "form" && i.signature === "HAND_SCANNED");
  const anyForm = online ?? hand ?? items.find((i) => i.kind === "form");
  ok("DW4 setup (part 3): the filled case has an Online form and a form signed by hand and scanned", !!online && !!hand, items.map((i) => `${i.form} ${i.channel} ${i.signature}`));
  const writeRefused = async (file: string, why: string, field: string, send: () => Promise<{ status: number; body?: { errors?: { field?: string; message?: string }[]; detail?: string } }>) => {
    const before = rows(), r = await send(), after = rows();
    ok(`CS-V1 DW4 fail (${file}): ${why} answers 400 naming ${field}, "Nothing was stored.", nothing stored`, r.status === 400 && named(r.body, field) && stored(r.body) && before === after, { status: r.status, body: r.body, before, after });
  };
  const pdfItem = online ?? anyForm;
  for (const [why, body, field] of [["an unknown field", { extra: 1 }, "body"], ["a wrong type (idempotencyKey: 5)", { idempotencyKey: 5 }, "idempotencyKey"], ["an oversized idempotencyKey", { idempotencyKey: big }, "idempotencyKey"]] as const)
    await writeRefused("case-prepare.ts", why, field, () => m3.call("POST", `/runtime/items/${pdfItem?.id}/pdf-copy`, body, officer));
  const pdf = await m3.call("POST", `/runtime/items/${pdfItem?.id}/pdf-copy`, { idempotencyKey: `csv1-${Date.now()}` }, officer);
  ok(`CS-V1 DW4 pass (case-prepare.ts): a correct PDF copy still answers as before (${online ? "an Online item: queued, 202" : "no Online item: refused in words, 409/422"})`, online ? pdf.status === 202 : pdf.status === 409 || pdf.status === 422, { status: pdf.status, body: pdf.body });
  // The 202 queues a background job (fill-case.ts run()) that, when it ends, writes its own audit line ("Copy <id8> of …
  // generated" or "… failed"); left running, that line lands during the refusals below and moves rows()' first count
  // (audit_event) with nothing the refused request stored (batch of 20 Nov: 556 -> 557). So wait until the job has
  // written it: the queue runs one copy at a time, oldest first, so every earlier copy has settled too.
  const copyId = String(pdf.body?.id ?? "");
  if (pdf.status === 202) ok("DW4 setup (part 3): the queued PDF copy has finished and written its audit line before the next refusals are counted", /^[0-9a-f-]{36}$/.test(copyId) && await m3.until(async () => m3.sql(`select count(*) from audit_event where entity = 'form copy' and action in ('generated', 'failed') and summary like 'Copy ${copyId.slice(0, 8)} of %'`) === "1", 120_000), copyId);
  const stepItem = hand ?? anyForm;
  for (const [why, body, field] of [["an unknown field", { copy: null, extra: 1 }, "body"], ["a wrong type (copy: 5)", { copy: 5 }, "copy"], ["an oversized copy", { copy: big }, "copy"]] as const)
    await writeRefused("sign-steps.ts", `a signing step with ${why}`, field, () => m3.call("POST", `/runtime/items/${stepItem?.id}/sign-steps/print`, body, officer));
  /** The signed scan: one real Sample PDF in "file", plus the text fields given. */
  const upload = async (fields: [string, string][]) => {
    const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(m3.signedScan(stepItem?.form ?? "IMM 5476"))]), "scan-signed.pdf");
    for (const [k, v] of fields) fd.append(k, v);
    const res = await fetch(`http://127.0.0.1:${PORT}/api/runtime/items/${stepItem?.id}/signed-scan`, { method: "POST", headers: { "x-actor": officer }, body: fd }).catch(() => null);
    return { status: res?.status ?? 0, body: await res?.json().catch(() => undefined) };
  };
  for (const [why, fields, field] of [["an unknown field", [["extra", "1"]], "body"], ["copy given twice (a list)", [["copy", "a"], ["copy", "b"]], "copy"], ["an oversized copy", [["copy", "c".repeat(200)]], "copy"]] as const)
    await writeRefused("sign-steps.ts", `a signed scan with ${why}`, field, () => upload(fields.map(([k, v]) => [k, v] as [string, string])));
  if (hand) { // the whole order on a "signed by hand and scanned" item: print a generated copy, sign, upload its scan
    const copy = await m3.generateCopy(c2.id, hand.form!, hand.subject);
    const printed = await m3.call("POST", `/runtime/items/${hand.id}/sign-steps/print`, { copy }, officer);
    const signed = await m3.call("POST", `/runtime/items/${hand.id}/sign-steps/signed`, { copy }, officer);
    ok("CS-V1 DW4 pass (sign-steps.ts): correct steps still answer as before (Printed, then Signed by hand: 200)", printed.status === 200 && signed.status === 200, { printed: printed.status, signed: signed.status, body: signed.status === 200 ? undefined : signed.body ?? printed.body });
    const before = rows(), scan = await upload(copy ? [["copy", copy]] : []), after = rows();
    ok("CS-V1 DW4 pass (sign-steps.ts): a real Sample signed scan naming its printed copy is still stored (201, one signed_scan row)", scan.status === 201 && Number(after?.split("/")[7]) === Number(before?.split("/")[7]) + 1, { status: scan.status, body: scan.body, before, after });
  } else { // no such item in this release: the schema takes the request, and the route refuses it in its own words, as before
    const step = await m3.call("POST", `/runtime/items/${stepItem?.id}/sign-steps/print`, { copy: null }, officer), scan = await upload([]);
    ok("CS-V1 DW4 pass (sign-steps.ts): correct requests still answer as before (not signed by hand: 409 in words)", step.status === 409 && scan.status === 409, { step, scan });
  }
}
{ // case-close.ts (CS-C1a): its checks and words, now in zod (contracts/runtime.ts).
  const { CaseDecisionBody, CaseReasonBody, CaseWithdrawBody } = await import("../contracts/runtime.ts");
  const first = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string; params?: { code?: string } }[] } }) => r.success ? null : { field: String(r.error!.issues[0].path[0] ?? "body"), message: r.error!.issues[0].message, code: r.error!.issues[0].params?.code };
  const good = { filingId: "f", outcome: "APPROVED", decidedOn: "2026-11-01", note: " Approved by letter (Sample) " };
  const g = CaseDecisionBody.safeParse(good);
  ok("CS-V1 DW4 pass (case-close.ts): a correct decision parses (note trimmed, date read)", g.success && g.data.note === "Approved by letter (Sample)" && g.data.decidedOn instanceof Date && CaseReasonBody.safeParse({ reason: "Client asked (Sample)" }).success && CaseWithdrawBody.safeParse({ reason: "Client asked (Sample)", withdrawnOn: "2026-11-02" }).success);
  const cases: [string, ReturnType<typeof first>, string, string][] = [
    ["an unknown field", first(CaseDecisionBody.safeParse({ ...good, extra: 1 })), "body", "Not part of a decision: extra."],
    ["a wrong type (outcome: 5)", first(CaseDecisionBody.safeParse({ ...good, outcome: 5 })), "outcome", "One of APPROVED, REFUSED (Sample list)."],
    ["an oversized note", first(CaseDecisionBody.safeParse({ ...good, note: big2() })), "note", "Plain text, at most 2000 characters."],
    ["an oversized reason", first(CaseReasonBody.safeParse({ reason: big2() })), "reason", "At most 1000 characters."],
    ["a date that is not real", first(CaseWithdrawBody.safeParse({ reason: "Client asked (Sample)", withdrawnOn: "2026-02-30" })), "withdrawnOn", "A real date as YYYY-MM-DD."],
  ];
  for (const [why, got, field, message] of cases) ok(`CS-V1 DW4 fail (case-close.ts): ${why} is refused on ${field} with its words`, got?.field === field && got?.message === message, got);
  const blankReason = first(CaseReasonBody.safeParse({ reason: " ​ " }));
  ok("CS-V1 DW4 fail (case-close.ts): a blank reason keeps its own code (REASON_REQUIRED, \"Give a reason.\")", blankReason?.code === "REASON_REQUIRED" && blankReason.message === "Give a reason." && blankReason.field === "reason", blankReason);
}
{ // Review of #2042 m2: the review note and the pass reason are capped as the route reads them (trimmed), so a short
  // text padded with spaces is still taken, as before.
  const { FilingReviewBody, WarningPassBody } = await import("../contracts/runtime.ts");
  ok("CS-V1 DW4 pass (readiness.ts): a long warning key (a whole fact list, as readiness builds it) is still taken", WarningPassBody.safeParse({ reason: "Passport arrives tomorrow (Sample)", key: `item|client|${Array.from({ length: 60 }, (_, i) => `person.fact_number_${i}`).join(",")}` }).success);
  ok("CS-V1 DW4 pass (readiness.ts): a short note or reason padded with spaces is still taken", FilingReviewBody.safeParse({ facts_hash: "0".repeat(64), note: `Fine${" ".repeat(5000)}` }).success && WarningPassBody.safeParse({ reason: `Passport arrives tomorrow${" ".repeat(5000)}` }).success);
}
function big2() { return "y".repeat(6000); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
