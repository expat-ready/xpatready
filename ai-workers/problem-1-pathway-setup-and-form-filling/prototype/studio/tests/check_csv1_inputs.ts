// CS-V1 (STANDARDS §6 contract first: every body and query is read through a zod schema; errors are RFC 9457 Problem
// Details): the input check over every case-side route. Every route under /api/runtime and /api/link, in any file or
// folder of api/src (features/ included), is found in the code (tests/lib/routes.ts); each handler that takes a body or
// a query is followed into the service method it hands it to, and must reach a zod parse there. The methods that do not
// today are the reviewed ALLOW list below, which only shrinks: a method fixed but still listed fails, as does a listed
// one taken off without a fix. Then a running copy is asked every route with an id parameter with "not-a-uuid" (and the
// same with a NUL byte): a malformed id is simply not found (main.ts ProblemErrors), never a 500; the routes that answer
// 500 today are the reviewed ALLOW_500 list (fixed in CS-V1 PR 2-3b). Named cases DW1-DW3. US$0, no model call.
//   zsh studio/tools/isolated.sh runtime_csv1 4486 start && tsx studio/tests/check_csv1_inputs.ts 4486
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
 *  sign-steps; PR 3b: runtime.ts). Measured on main by this check (16 Nov); each confirmed by reading its service method. */
export const ALLOW = new Set([
  "assessments.ts GET /api/runtime/cases/:id/assessments query(person)",   // Assessments.list: the string compared as is
  "case-documents.ts GET /api/runtime/cases/:id/proposals query",          // CaseDocuments.proposals: q.subject read by hand
  "case-documents.ts GET /api/runtime/cases/:id/checks query",             // CaseDocuments.checks: q.subject, q.state by hand
  "case-prepare.ts POST /api/runtime/items/:id/pdf-copy body",             // CasePrepare.pdfCopy: fields read by hand
  "features/case-close.ts POST /api/runtime/cases/:id/decisions body",     // CaseClose.decide: checked by hand (reasonOf, dateOf), no zod
  "features/case-close.ts POST /api/runtime/cases/:id/withdraw body",      // CaseClose.withdraw: the same
  "features/case-close.ts POST /api/runtime/cases/:id/close body",         // CaseClose.close: the same
  "features/case-close.ts POST /api/runtime/cases/:id/reopen body",        // CaseClose.reopen: the same
  "fill-case.ts GET /api/runtime/form-copies/:id/file query(original)",    // FillCase.file: only `o === "1"` is read
  "form-additions.ts GET /api/runtime/filings/:id/addable-forms query(q)", // FormAdditions.addable: q read by hand
  "form-additions.ts GET /api/runtime/filings/:id/addable-forms query(subject)",
  "form-additions.ts GET /api/runtime/filings/:id/addable-forms/:form query(subject)", // FormAdditions.detail
  "form-additions.ts POST /api/runtime/filings/:id/form-additions body",   // FormAdditions.add: `body as {…}`, checked by hand
  "form-additions.ts POST /api/runtime/form-additions/:id/remove body",    // FormAdditions.remove: reason read by hand
  "readiness.ts POST /api/runtime/filings/:id/review body",                // FilingReadinessRoutes.review
  "readiness.ts POST /api/runtime/filings/:id/warnings/:code/pass body",   // FilingReadinessRoutes.pass: `body as {…}`
  "runtime.ts GET /api/runtime/cases query",                               // Runtime.list: take/after/client/q by hand
  "runtime.ts GET /api/runtime/cases/:id/questionnaire query(mode)",       // the handler compares m to "pqr"/"agent"
  "sign-steps.ts POST /api/runtime/items/:id/sign-steps/:key body",        // SignSteps.step
  "sign-steps.ts POST /api/runtime/items/:id/signed-scan body",            // SignSteps.scan: the upload's text fields
]);
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

// ---- DW2: the allow-list only shrinks.
const unfixed = [...ALLOW][0], dropped = new Set([...ALLOW].filter((k) => k !== unfixed));
const dw2a = judge(found, dropped);
ok("CS-V1 DW2 fail: a method taken off the list without a fix fails", dw2a.unlisted.join() === unfixed, dw2a);
const fixedKey = "runtime.ts PUT /api/runtime/cases/:id/answers/:subject/:field body";   // parses today (Runtime.saveAnswer)
const dw2b = judge(found, new Set([...ALLOW, fixedKey, "gone.ts POST /api/runtime/gone body"]));
ok("CS-V1 DW2 fail: a method fixed (or gone) but still listed fails", dw2b.fixedButListed.sort().join("|") === ["gone.ts POST /api/runtime/gone body", fixedKey].sort().join("|"), dw2b);
ok("CS-V1 DW2 pass: today's list matches the code exactly", j.unlisted.length === 0 && j.fixedButListed.length === 0);

// ---- DW3: every route with an id parameter answers 404 to a malformed id (a running copy).
const withId = all.filter((r) => /:[a-z]*id\b/i.test(r.path));
const answers: { route: string; probe: string; status: number }[] = [];
const fill = (path: string, v: string) => path.replace(/:[A-Za-z]+/g, v);
let reached = true;
for (const r of withId) for (const probe of ["not-a-uuid", "not-a-uuid%00"]) {
  try {
    const res = await fetch(`http://localhost:${PORT}${fill(r.path, probe)}`, { method: r.verb, headers: { "x-actor": "user-O", ...(r.verb === "GET" || r.verb === "DELETE" ? {} : { "content-type": "application/json" }) }, ...(r.verb === "GET" ? {} : { body: "{}" }) });
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
