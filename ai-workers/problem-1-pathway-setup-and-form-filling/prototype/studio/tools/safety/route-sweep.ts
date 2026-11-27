// LR-074 (bundle A5, OS-PM 3's design): the static sign-in sweep. Every route that changes something (POST, PUT, PATCH,
// DELETE, ALL) in api/src is found from the code (tests/lib/routes.ts) and judged, the way Nest's guards read it (the
// handler's own mark first, then its class's):
//   guarded   a declared permission (PermissionKeys, SystemKeys, AnyStaff, AnySystemStaff: the platform guards enforce it on
//             any path); a default-deny path (/api/platform, /api/front-office, /api/system: an undeclared route is refused);
//             ConfigRead as the route's read mark off those paths (the read guard asks for a configuration person); or a
//             handler check: need or readerOf ("role"), actorOf or the link session's this.signed ("identity": signed out is
//             refused, a wrong role only if the service checks it), called on the handler's straight-line path or the
//             service method it hands the request to (up to 4 steps).
//   open      a sign-in declaration (StaffSignIn, SystemSignIn) or none of these: it must be on the reviewed ALLOW list.
// The check names and marks count only when imported from the app's own core.ts or identity keys.ts (a local `need` or a
// lookalike `readerOf(type)` is not a check). A call counts only where it always runs before the handler returns: not in
// an if or switch branch, a loop body, a try with a catch (the refusal could be swallowed), a lambda (except the callback
// of a helper on RUNS, which always runs it), the right side of && || ??, or after a branch that can return early. Known
// limits: a check placed after the write on the same path, a check of a fixed person (need(actorOf("user-R"), ...)), inherited routes and aliased decorators are not
// seen; the live signed-out and wrong-role walk (LR-074's other half) proves the rest. A listed route that is guarded now,
// or gone, is reported too (the list only shrinks). Report-only in safety.yml at first.
//   tsx studio/tools/safety/route-sweep.ts [api-src-dir]     exit 1 when anything is reported
//   tsx studio/tools/safety/route-sweep.ts --self-test       planted good and bad routes; exit 0 when each is judged right
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import ts from "typescript";
import { routes, type Route } from "../../tests/lib/routes.ts";
import { planted, tsFiles } from "../../tests/lib/ts-files.ts";

const DEFAULT_DENY = /^\/api\/(platform|front-office|system)(\/|$)/i;
const KEYS = ["platform/identity/keys.ts", "platform/system-identity/keys.ts"], CORE = ["core.ts"];
/** Each mark or check name → the api/src files that really define it. */
const HOME: Record<string, string[]> = {
  PermissionKeys: KEYS, SystemKeys: KEYS, AnyStaff: KEYS, AnySystemStaff: KEYS, StaffSignIn: KEYS, SystemSignIn: KEYS,
  ConfigRead: CORE, OpenRead: CORE, CaseRead: CORE, actorOf: CORE, readerOf: CORE, need: CORE,
  oneAtATime: ["form-uses.ts"],
};
/** Helpers that always run the callback they are given, and pass its refusal on (form-uses.ts: prev.catch().then(fn)). */
const RUNS = new Set(["oneAtATime"]);
const ACCESS = new Set(["PermissionKeys", "SystemKeys", "AnyStaff", "AnySystemStaff", "StaffSignIn", "SystemSignIn"]);
const OPEN = new Set(["StaffSignIn", "SystemSignIn"]);
const READ = new Set(["ConfigRead", "OpenRead", "CaseRead"]);
const ROLE = new Set(["need", "readerOf"]), IDENTITY = new Set(["actorOf"]);
/** this.<method>() calls that check a session, by class: an adult's link session (person-link.ts). */
const SESSION: Record<string, string> = { PersonLinks: "signed" };
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE", "ALL"]);

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

const HINT = "guard it (a permission declaration, or need/actorOf on the handler's straight path), or add it to ALLOW in route-sweep.ts with the reason";

type Src = { file: string; sf: ts.SourceFile; imports: Map<string, string> };
type Cls = { node: ts.ClassDeclaration; src: Src };
/** Each name a file imports → the api/src file it comes from ("core.ts"), or "local" for a name the file defines itself. */
function importsOf(file: string, sf: ts.SourceFile): Map<string, string> {
  const m = new Map<string, string>();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      const spec = st.moduleSpecifier.text;
      if (!spec.startsWith(".")) continue;
      const target = normalize(join(dirname(file), spec)).split("\\").join("/");
      for (const el of st.importClause.namedBindings.elements) if (!el.isTypeOnly) m.set(el.name.text, (el.propertyName ?? el.name).text === el.name.text ? target : `${target}#${(el.propertyName ?? el.name).text}`);
    }
    const local = (n: ts.Node & { name?: ts.Node }) => n.name && ts.isIdentifier(n.name) && m.set(n.name.text, "local");
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) local(st);
    if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => local(d));
  }
  return m;
}
/** Whether `name` in `src` is the app's own mark or check (imported from its home, or defined in the home itself). */
const real = (src: Src, name: string) => {
  const from = src.imports.get(name), home = HOME[name];
  return !!home && (from === "local" ? home.includes(src.file) : !!from && home.includes(from));
};
function load(dir: string): { classes: Map<string, Cls>; srcs: Map<string, Src> } {
  const classes = new Map<string, Cls>(), srcs = new Map<string, Src>();
  for (const f of tsFiles(dir)) {
    const sf = ts.createSourceFile(f, readFileSync(join(dir, f), "utf8"), ts.ScriptTarget.Latest, true);
    const src = { file: f, sf, imports: importsOf(f, sf) };
    srcs.set(f, src);
    ts.forEachChild(sf, function walk(n) {
      if (ts.isClassDeclaration(n) && n.name && !classes.has(n.name.text)) classes.set(n.name.text, { node: n, src });
      ts.forEachChild(n, walk);
    });
  }
  return { classes, srcs };
}
const marks = (n: ts.Node) => (ts.canHaveDecorators(n) ? ts.getDecorators(n) ?? [] : []).map((d) => {
  const e = d.expression;
  return ts.isCallExpression(e) && ts.isIdentifier(e.expression) ? e.expression.text : ts.isIdentifier(e) ? e.text : "";
});
const methodOf = (c: Cls | undefined, name: string) =>
  c?.node.members.find((m): m is ts.MethodDeclaration => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === name && !!m.body);
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
const SHORT = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken]);
/** Whether a branch inside `n` (not a nested function) can leave early: return, break or continue. */
function exits(n: ts.Node): boolean {
  if (ts.isFunctionLike(n) || ts.isClassLike(n)) return false;
  if (ts.isReturnStatement(n) || ts.isBreakStatement(n) || ts.isContinueStatement(n)) return true;
  return ts.forEachChild(n, (k) => (exits(k) ? true : undefined)) ?? false;
}
const BRANCHING = (n: ts.Node) => ts.isIfStatement(n) || ts.isSwitchStatement(n) || ts.isTryStatement(n) || ts.isLabeledStatement(n) || ts.isIterationStatement(n, false);
/** Visits only the parts of `n` that always run when `n` runs, in order (see the header); after a branch that can leave
 *  early (if (x) return this.write()), nothing later counts. */
function straight(n: ts.Node, visit: (k: ts.Node) => void, st = { stopped: false }): void {
  if (st.stopped) return;
  const go = (k: ts.Node | undefined) => k && straight(k, visit, st);
  if (ts.isFunctionLike(n) || ts.isClassLike(n)) return;
  if (ts.isTryStatement(n)) {   // a finally block always runs, even after a return in the try
    if (!n.catchClause) go(n.tryBlock);
    const after = st.stopped || (!!n.catchClause && exits(n));
    st.stopped = false;
    go(n.finallyBlock);
    st.stopped ||= after;
    return;
  }
  if (BRANCHING(n) && exits(n)) {
    if (ts.isIfStatement(n) || ts.isSwitchStatement(n)) go(n.expression);
    st.stopped = true;
    return;
  }
  if (ts.isIfStatement(n) || ts.isSwitchStatement(n)) return go(n.expression);
  if (ts.isConditionalExpression(n)) return go(n.condition);
  if (ts.isBinaryExpression(n) && SHORT.has(n.operatorToken.kind)) return go(n.left);
  if (ts.isWhileStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n)) return go(n.expression);
  if (ts.isForStatement(n)) return go(n.initializer);
  if (ts.isDoStatement(n)) { go(n.statement); return go(n.expression); }
  if (ts.isCallExpression(n) && n.questionDotToken) return go(n.expression);
  visit(n);
  ts.forEachChild(n, go);
  if (ts.isReturnStatement(n) || ts.isThrowStatement(n)) st.stopped = true;
}
type Level = "role" | "identity" | null;
/** The strongest check that always runs in `fn` of class `cls`, itself or through this.m() / this.field.m(). */
function checks(all: Map<string, Cls>, cls: string, fn: ts.MethodDeclaration, depth = 4, seen = new Set<string>()): Level {
  const key = `${cls}.${(fn.name as ts.Identifier).text}`, here = all.get(cls);
  if (seen.has(key) || !here) return null;
  seen.add(key);
  let level: Level = null;
  const up = (l: Level) => { if (l === "role" || (l === "identity" && !level)) level = l; };
  const see = (n: ts.Node): void => {
    if (level === "role" || !ts.isCallExpression(n)) return;
    const e = n.expression;
    if (ts.isIdentifier(e) && real(here.src, e.text)) up(ROLE.has(e.text) ? "role" : IDENTITY.has(e.text) ? "identity" : null);
    if (ts.isIdentifier(e) && RUNS.has(e.text) && real(here.src, e.text))
      for (const a of n.arguments) if ((ts.isArrowFunction(a) || ts.isFunctionExpression(a)) && a.body) straight(a.body, see);
    if (!ts.isPropertyAccessExpression(e)) return;
    if (e.expression.kind === ts.SyntaxKind.ThisKeyword && SESSION[cls] === e.name.text) return up("identity");
    if (depth <= 0) return;
    let target: [string, string] | null = null;
    if (e.expression.kind === ts.SyntaxKind.ThisKeyword) target = [cls, e.name.text];
    else if (ts.isPropertyAccessExpression(e.expression) && e.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
      const k = fieldClass(here.node, e.expression.name.text);
      if (k) target = [k, e.name.text];
    }
    const into = target && methodOf(all.get(target[0]), target[1]);
    if (into) up(checks(all, target![0], into, depth - 1, seen));
  };
  if (fn.body) straight(fn.body, see);
  return level;
}

export type Verdict = { route: Route; key: string; how: string | null; level?: Level };
/** Each write under `dir` and how it is guarded (null: unguarded). */
export function sweep(dir: string): Verdict[] {
  const { classes, srcs } = load(dir);
  return routes(dir).filter((r) => WRITES.has(r.verb)).map((r) => {
    const src = srcs.get(r.file)!, key = `${r.verb} ${r.path}`;
    const own = marks(r.node).filter((n) => real(src, n)), cls = marks(r.node.parent).filter((n) => real(src, n));
    const pick = (set: Set<string>) => own.find((n) => set.has(n)) ?? cls.find((n) => set.has(n));   // handler first, as getAllAndOverride
    const access = pick(ACCESS), read = pick(READ);
    if (access && OPEN.has(access)) return { route: r, key, how: null };
    if (access) return { route: r, key, how: access };
    if (DEFAULT_DENY.test(r.path)) return { route: r, key, how: "default-deny path" };
    if (read === "ConfigRead") return { route: r, key, how: "ConfigRead" };
    const level = checks(classes, r.controller, r.node);
    return { route: r, key, how: level ? `handler check (${level})` : null, level };
  });
}
/** What the check reports: unguarded writes not on the list, and listed ones that are guarded now or gone. */
export function report(dir: string, allow: Record<string, string>): string[] {
  const v = sweep(dir), out: string[] = [];
  for (const x of v) if (!x.how && !(x.key in allow)) out.push(`unguarded write: ${x.key} (${x.route.file}:${x.route.line} ${x.route.controller}.${x.route.handler}): ${HINT}`);
  for (const k of Object.keys(allow)) {
    const x = v.find((y) => y.key === k);
    if (!x) out.push(`allow-list line for a route that is gone: ${k} (take the line out of ALLOW)`);
    else if (x.how) out.push(`allow-list line for a route that is guarded now (${x.how}): ${k} (take the line out of ALLOW)`);
  }
  return out;
}

function selfTest(): number {
  const head = (up: string) => `import { Controller, Post, Put, Delete, Get, Body, Headers, Inject } from "@nestjs/common";
import { actorOf, readerOf, need, ConfigRead, OpenRead, CaseRead } from "${up}core.ts";
import { PermissionKeys, AnyStaff, StaffSignIn } from "${up}platform/identity/keys.ts";
import { oneAtATime } from "${up}form-uses.ts";\n`;
  const stub = { "form-uses.ts": "export const oneAtATime = (id: string, fn: () => unknown) => fn();", "core.ts": "export const actorOf = (h: string) => h; export const readerOf = actorOf; export const need = (a: unknown, d: string) => d;", "platform/identity/keys.ts": "export const PermissionKeys = () => () => {};" };
  const dir = planted({
    ...stub,
    "good/a.ts": head("../") + `@Controller("api/studio/x") export class A { constructor(@Inject(Svc) private readonly s: Svc) {}
      @Post() add(@Headers("x-actor") h: string) { const a = actorOf(h); need(a, "edit"); }
      @Put(":id") put(@Headers("x-actor") h: string) { return this.s.put(h); }
      @Post("plan") @ConfigRead() plan() { return 1; }
      @Post("arg") arg(@Headers("x-actor") h: string) { return this.s.write(actorOf(h)); }
      @Post("fin") fin(@Headers("x-actor") h: string) { try { return 1; } finally { actorOf(h); } }
      @Post("lock") lock(@Headers("x-actor") h: string) { return oneAtATime("c", () => this.s.write(actorOf(h))); }
      @Get() list() { return []; } }
      export class Svc { put(h: string) { return readerOf(h); } write(a: unknown) { return a; } }`,
    "good/deep/b.ts": head("../../") + `@Controller("api/front-office/y") export class B { @Post() add() { return 1; } }
      @AnyStaff("all staff") @Controller("api/studio/z") export class C { @Delete(":id") del() { return 1; } }
      export class PersonLinks { signed(t: string) { return t; } answer(t: string) { this.signed(t); } }
      @OpenRead("own guard") @Controller("api/link") export class G { constructor(@Inject(PersonLinks) private readonly x: PersonLinks) {}
        @Put("b") ok(@Headers("authorization") t: string) { return this.x.answer(t); } }`,
    "bad/c.ts": head("../") + `@Controller("api/studio/bad") export class D { constructor(@Inject(Svc2) private readonly s: Svc2) {}
      @Post("none") none(@Body() b: unknown) { return b; }
      @Post("dead") dead(@Headers("x-actor") h: string) { if (false) actorOf(h); return 1; }
      @Post("branch") branch(@Headers("x-actor") h: string, @Body() b: { p: boolean }) { if (b.p) need(actorOf(h), "x"); return 1; }
      @Post("swallow") swallow(@Headers("x-actor") h: string) { let w = ""; try { w = actorOf(h); } catch {} return w; }
      @Post("lambda") lambda(@Headers("x-actor") h: string) { const chk = () => actorOf(h); return 1; }
      @Post("short") short(@Headers("x-actor") h: string) { return h && actorOf(h); }
      @Post("svc") svc(@Body() b: { audit: boolean }) { return this.s.label(b); }
      @Post("presign") presign(@Body() b: { key: string }) { return this.s.files.signed(b.key); }
      @Post("lookalike") lookalike(@Body() b: { type: string }) { return readerOfType(b.type); }
      @Post("localneed") localneed(@Body() b: unknown) { return needLocal(b); }
      @Post("readmark") @OpenRead("x") readmark() { return 1; }
      @Post("early") early(@Headers("x-actor") h: string, @Body() b: { p: boolean }) { if (b.p) return 1; need(actorOf(h), "x"); return 2; }
      @Post("later") later(@Headers("x-actor") h: string) { return [1].map(() => actorOf(h)); } }
      export class Svc2 { files = { signed: (k: string) => k }; label(b: { audit: boolean }) { if (b.audit) actorOf("x"); return 1; } }
      const readerOfType = (t: string) => t; function needLocal(b: unknown) { return b; }
      @ConfigRead() @Controller("api/studio/cfg") export class H { @Post() @CaseRead() w() { return 1; } }`,
    "bad/deep/d.ts": head("../../") + `@PermissionKeys("agent/case:edit") @Controller("api/runtime/w") export class E { @Put() @StaffSignIn("x") put() { return 1; } }
      @Controller("api/platform/s") export class F { @Post() @StaffSignIn("sign in") go() { return 1; } }
      @OpenRead("own guard") @Controller("api/link2") export class G2 { @Put("a") put(@Headers("authorization") t: string) { return t; } }`,
    "bad/fake.ts": `import { Controller, Post } from "@nestjs/common";\nconst PermissionKeys = (..._k: string[]) => () => {}; const need = (..._a: unknown[]) => 1;
      @PermissionKeys("agent/case:edit") @Controller("api/studio/fake") export class K { @Post() go() { need(1, "x"); return 1; } }`,
  });
  const v = sweep(dir);
  const unguarded = v.filter((x) => !x.how).map((x) => x.key).sort();
  const want = ["POST /api/platform/s", "POST /api/studio/bad/branch", "POST /api/studio/bad/dead", "POST /api/studio/bad/early", "POST /api/studio/bad/lambda", "POST /api/studio/bad/later", "POST /api/studio/bad/localneed",
    "POST /api/studio/bad/lookalike", "POST /api/studio/bad/none", "POST /api/studio/bad/presign", "POST /api/studio/bad/readmark", "POST /api/studio/bad/short",
    "POST /api/studio/bad/svc", "POST /api/studio/bad/swallow", "POST /api/studio/cfg", "POST /api/studio/fake", "PUT /api/link2/a", "PUT /api/runtime/w"].sort();
  let fail = 0;
  const ok = (name: string, c: boolean, d?: unknown) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d !== undefined ? ` — ${JSON.stringify(d)}` : ""}`); };
  const guarded = v.filter((x) => x.how);
  ok("RS1 the good writes are guarded (role check, followed service, ConfigRead, check as an argument, check in finally, a oneAtATime callback, default-deny, class declaration, link session)", guarded.length === 9, guarded.map((x) => [x.key, x.how]));
  ok("RS2 every planted bad write is caught (none, dead branch, an early return before the check, one branch, swallowed, lambda, a callback of a helper not on RUNS, && right side, branch-only service, presign lookalike, readerOf lookalike, local need, OpenRead, handler CaseRead over class ConfigRead, StaffSignIn over class keys, StaffSignIn, link with no session, local fake PermissionKeys)", JSON.stringify(unguarded) === JSON.stringify(want), unguarded.filter((k) => !want.includes(k)).concat(want.filter((k) => !unguarded.includes(k)).map((k) => `missed ${k}`)));
  ok("RS3 actorOf alone is identity, need is role", v.find((x) => x.key === "POST /api/studio/x/arg")?.level === "identity" && v.find((x) => x.key === "POST /api/studio/x")?.level === "role");
  ok("RS4 a GET is not a write", !v.some((x) => x.route.verb === "GET"));
  ok("RS5 an allow-listed bad write is not reported", report(dir, Object.fromEntries(want.map((k) => [k, "t"]))).length === 0);
  ok("RS6 a stale allow-list line is reported (guarded now, and gone)", report(dir, { ...Object.fromEntries(want.map((k) => [k, "t"])), "POST /api/studio/x": "t", "POST /api/gone": "t" }).length === 2);
  ok("RS7 the real app is swept (writes found)", sweep(join(import.meta.dirname, "..", "..", "api", "src")).length > 50);
  console.log(fail ? `route-sweep self-test: ${fail} failed` : "route-sweep self-test: all passed");
  return fail ? 1 : 0;
}

const arg = process.argv[2];
if (arg === "--self-test") process.exit(selfTest());
const dir = arg ?? join(import.meta.dirname, "..", "..", "api", "src");
const v = sweep(dir), out = report(dir, ALLOW);
const by = (l: Level) => v.filter((x) => x.level === l).length;
console.log(`route-sweep: ${v.length} writes; ${v.filter((x) => x.how).length} guarded (${by("role")} by a role check in the handler, ${by("identity")} by identity only: a wrong role is refused there only if the service checks it), ${v.filter((x) => !x.how).length} open (${Object.keys(ALLOW).length} on the reviewed list)`);
for (const l of out) console.log(`::warning::${l}`);
process.exit(out.length ? 1 : 0);
