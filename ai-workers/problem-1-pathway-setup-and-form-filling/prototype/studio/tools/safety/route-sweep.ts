// LR-074 (bundle A5, OS-PM 3's design): the static sign-in sweep. Every route that changes something (POST, PUT, PATCH,
// DELETE, ALL) in api/src is found from the code (tests/lib/routes.ts) and must be refused to nobody and to a wrong role
// by one of: a default-deny guard (paths under /api/platform, /api/front-office, /api/system: an undeclared route there
// is refused), a declared permission (PermissionKeys, SystemKeys, AnyStaff, AnySystemStaff), a configuration-read mark
// (ConfigRead: the read guard asks for a configuration person), or a handler that calls actorOf, readerOf, need or signed (a link session) itself
// or in a method it hands the request to (followed up to 4 steps). An open declaration (StaffSignIn, SystemSignIn:
// the guard lets anyone in) or none of these (OpenRead guards no write) is an unguarded write: it must be on the reviewed ALLOW list with its reason. A listed
// route that is guarded now, or gone, is also reported (the list only shrinks). Report-only in safety.yml at first.
//   tsx studio/tools/safety/route-sweep.ts [api-src-dir]     exit 1 when anything is reported
//   tsx studio/tools/safety/route-sweep.ts --self-test       planted good and bad routes; exit 0 when each is judged right
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { routes, type Route } from "../../tests/lib/routes.ts";
import { planted, tsFiles } from "../../tests/lib/ts-files.ts";

const DEFAULT_DENY = /^\/api\/(platform|front-office|system)(\/|$)/i;
const DECLARED = new Set(["PermissionKeys", "SystemKeys", "AnyStaff", "AnySystemStaff", "ConfigRead"]);
const OPEN = new Set(["StaffSignIn", "SystemSignIn"]);   // OpenRead marks a read; on a write it guards nothing either way
const CHECKS = new Set(["actorOf", "readerOf", "need", "signed"]);   // signed: an adult's link session (PersonLinks.signed)
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE", "ALL"]);

/** The reviewed unguarded writes, "<VERB> <path>" → why it is open on purpose. Only shrinks; a new one needs a reason. */
export const ALLOW: Record<string, string> = {
  // First run, 28 Nov: 25 writes a stranger reaches on purpose. The reason is the route's job, read from its code and
  // comments; whether each token or signature check is sound is the live walk's and the reviewer's question, not this list's.
  "POST /api/hooks/stripe-connect": "a provider's webhook: no person; trust is the provider's signature, checked in the handler",
  "POST /api/hooks/stripe": "a provider's webhook: no person; trust is the provider's signature, checked in the handler",
  "POST /api/hooks/signing/:provider": "a provider's webhook: no person; trust is the provider's signature, checked in the handler",
  "POST /api/public/messages/ses-notices": "a provider's webhook: no person; trust is the provider's signature, checked in the handler",
  "POST /api/public/consultation-agreements/open": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/firms/:firmKey/book/:slug/bookings": "a public booking page: anyone may ask for a consultation",
  "POST /api/public/bookings/:token/reschedule": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/bookings/:token/cancel": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/forms/:token/submissions": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/sign/:token/code": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/sign/:token/code/verify": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/sign/:token/consent": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/sign/:token/decline": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/sign-fake/:doc/:signer/:nonce": "the fake signing provider's page (local copies only): a nonce is the key",
  "POST /api/link/open": "sign-in itself: no session exists yet",
  "POST /api/link/code/send": "sign-in itself: no session exists yet",
  "POST /api/link/code": "sign-in itself: no session exists yet",
  "POST /api/public/signup": "a new firm signs up: no session exists yet",
  "POST /api/public/signup/verify": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/signup/:token": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/platform/session/local": "sign-in itself: no session exists yet",
  "POST /api/platform/session/callback": "sign-in itself: no session exists yet",
  "POST /api/public/invitations/:token/accept": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/public/unsubscribe/:token": "a stranger with a one-time token in the path or body: the token is the only key",
  "POST /api/system/session/local": "sign-in itself: no session exists yet",
};

const decoNames = (n: ts.Node) => (ts.canHaveDecorators(n) ? ts.getDecorators(n) ?? [] : []).map((d) => {
  const e = d.expression;
  return ts.isCallExpression(e) && ts.isIdentifier(e.expression) ? e.expression.text : ts.isIdentifier(e) ? e.text : "";
});

type Cls = Map<string, ts.ClassDeclaration>;
function classesOf(dir: string): Cls {
  const out: Cls = new Map();
  for (const f of tsFiles(dir)) {
    const sf = ts.createSourceFile(f, readFileSync(join(dir, f), "utf8"), ts.ScriptTarget.Latest, true);
    ts.forEachChild(sf, function walk(n) {
      if (ts.isClassDeclaration(n) && n.name && !out.has(n.name.text)) out.set(n.name.text, n);
      ts.forEachChild(n, walk);
    });
  }
  return out;
}
const methodOf = (c: ts.ClassDeclaration | undefined, name: string) =>
  c?.members.find((m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === name && !!m.body);
function fieldClass(c: ts.ClassDeclaration, field: string): string | null {
  for (const m of c.members) if (ts.isConstructorDeclaration(m)) for (const p of m.parameters) {
    if (!ts.isIdentifier(p.name) || p.name.text !== field) continue;
    const inj = (ts.getDecorators(p) ?? []).map((d) => d.expression).find((e): e is ts.CallExpression => ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "Inject");
    const a = inj?.arguments[0];
    if (a && ts.isIdentifier(a)) return a.text;
    if (p.type && ts.isTypeReferenceNode(p.type) && ts.isIdentifier(p.type.typeName)) return p.type.typeName.text;
  }
  return null;
}
/** Whether `fn` of class `cls` calls actorOf / readerOf / need, itself or through this.m() / this.field.m(). */
function checks(all: Cls, cls: string, fn: ts.MethodDeclaration, depth = 4, seen = new Set<string>()): boolean {
  const key = `${cls}.${(fn.name as ts.Identifier).text}`;
  if (seen.has(key)) return false;
  seen.add(key);
  const here = all.get(cls);
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      if ((ts.isIdentifier(e) && CHECKS.has(e.text)) || (ts.isPropertyAccessExpression(e) && CHECKS.has(e.name.text))) { found = true; return; }
      if (depth > 0 && here && ts.isPropertyAccessExpression(e)) {
        let target: [string, string] | null = null;
        if (e.expression.kind === ts.SyntaxKind.ThisKeyword) target = [cls, e.name.text];
        else if (ts.isPropertyAccessExpression(e.expression) && e.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
          const k = fieldClass(here, e.expression.name.text);
          if (k) target = [k, e.name.text];
        }
        const into = target && methodOf(all.get(target[0]), target[1]);
        if (into && checks(all, target![0], into, depth - 1, seen)) { found = true; return; }
      }
    }
    ts.forEachChild(n, visit);
  };
  if (fn.body) visit(fn.body);
  return found;
}

export type Verdict = { route: Route; key: string; how: string | null };
/** Each write under `dir` and how it is guarded (null: unguarded). */
export function sweep(dir: string): Verdict[] {
  const all = classesOf(dir);
  return routes(dir).filter((r) => WRITES.has(r.verb)).map((r) => {
    const names = [...decoNames(r.node), ...decoNames(r.node.parent)];
    const key = `${r.verb} ${r.path}`;
    const open = names.find((n) => OPEN.has(n)), declared = names.find((n) => DECLARED.has(n));
    // The handler's own declaration wins over its class's (Nest's getAllAndOverride: handler first).
    const own = decoNames(r.node).find((n) => OPEN.has(n) || DECLARED.has(n));
    if ((own && OPEN.has(own)) || (!own && open && !declared)) return { route: r, key, how: null };
    if (declared) return { route: r, key, how: declared };
    if (DEFAULT_DENY.test(r.path)) return { route: r, key, how: "default-deny path" };
    return { route: r, key, how: checks(all, r.controller, r.node) ? "handler check" : null };
  });
}
/** What the check reports: unguarded writes not on the list, and listed ones that are guarded now or gone. */
export function report(dir: string, allow: Record<string, string>): string[] {
  const v = sweep(dir), out: string[] = [];
  for (const x of v) if (!x.how && !(x.key in allow)) out.push(`unguarded write: ${x.key} (${x.route.file}:${x.route.line} ${x.route.controller}.${x.route.handler})`);
  for (const k of Object.keys(allow)) {
    const x = v.find((y) => y.key === k);
    if (!x) out.push(`allow-list line for a route that is gone: ${k}`);
    else if (x.how) out.push(`allow-list line for a route that is guarded now (${x.how}): ${k}`);
  }
  return out;
}

function selfTest(): number {
  const head = `import { Controller, Post, Put, Delete, Get, Body, Headers } from "@nestjs/common";\n`;
  const dir = planted({
    "good/a.ts": head + `@Controller("api/studio/x") export class A { constructor(@Inject(Svc) private readonly s: Svc) {}
      @Post() add(@Headers("x-actor") h: string) { const a = actorOf(h); need(a, "edit"); }
      @Put(":id") put(@Headers("x-actor") h: string) { return this.s.put(h); }
      @Post("plan") @ConfigRead() plan() { return 1; }
      @Get() list() { return []; } }
      export class Svc { put(h: string) { return readerOf(h); } }`,
    "good/deep/b.ts": head + `@Controller("api/front-office/y") export class B { @Post() add() { return 1; } }
      @AnyStaff("all staff") @Controller("api/runtime/z") export class C { @Delete(":id") del() { return 1; } }`,
    "bad/c.ts": head + `@Controller("api/studio/open") export class D { @Post() add(@Body() b: unknown) { return b; } }`,
    "bad/deep/d.ts": head + `@PermissionKeys("agent/case:edit") @Controller("api/runtime/w") export class E { @Put() @StaffSignIn("x") put() { return 1; } }
      @OpenRead("own guard") @Controller("api/link") export class G { @Put("a") put(@Headers("authorization") t: string) { return t; } @Put("b") ok(@Headers("authorization") t: string) { return this.signed(t); } }
      @Controller("api/platform/s") export class F { @Post() @StaffSignIn("sign in") go() { return 1; } }`,
  });
  const v = sweep(dir);
  const unguarded = v.filter((x) => !x.how).map((x) => x.key).sort();
  const want = ["POST /api/platform/s", "POST /api/studio/open", "PUT /api/link/a", "PUT /api/runtime/w"];
  let fail = 0;
  const ok = (name: string, c: boolean, d?: unknown) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d !== undefined ? ` — ${JSON.stringify(d)}` : ""}`); };
  ok("RS1 the good writes are guarded (handler check, followed service, ConfigRead, default-deny, class declaration, link session)", v.filter((x) => x.how).length === 6, v.map((x) => [x.key, x.how]));
  ok("RS2 the four planted bad writes are caught (no check, StaffSignIn over class keys, StaffSignIn, OpenRead with no check)", JSON.stringify(unguarded) === JSON.stringify(want), unguarded);
  ok("RS3 a GET is not a write", !v.some((x) => x.route.verb === "GET"));
  ok("RS4 an allow-listed bad write is not reported", report(dir, Object.fromEntries(want.map((k) => [k, "t"]))).length === 0);
  ok("RS5 a stale allow-list line is reported (guarded now, and gone)", report(dir, { ...Object.fromEntries(want.map((k) => [k, "t"])), "POST /api/studio/x": "t", "POST /api/gone": "t" }).length === 2);
  ok("RS6 the real app is swept (writes found)", sweep(join(import.meta.dirname, "..", "..", "api", "src")).length > 50);
  console.log(fail ? `route-sweep self-test: ${fail} failed` : "route-sweep self-test: all passed");
  return fail ? 1 : 0;
}

const arg = process.argv[2];
if (arg === "--self-test") process.exit(selfTest());
const dir = arg ?? join(import.meta.dirname, "..", "..", "api", "src");
const v = sweep(dir), out = report(dir, ALLOW);
console.log(`route-sweep: ${v.length} writes; ${v.filter((x) => x.how).length} guarded, ${v.filter((x) => !x.how).length} open (${Object.keys(ALLOW).length} on the reviewed list)`);
for (const l of out) console.log(`::warning::${l}`);
process.exit(out.length ? 1 : 0);
