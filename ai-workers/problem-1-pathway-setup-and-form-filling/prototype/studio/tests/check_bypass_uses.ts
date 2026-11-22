// P-785 (2), step 2: a new bypass use (a use that may cross the firm walls, PF-12) is declared beside its module in its
// own `<name>.bypass.ts` file (defineBypassUse), and the named list in api/src/platform/firm-scope.ts (BYPASS_USES) is
// frozen as it stood on 22 Nov. A sweep of api/src; no server, no database, no model call (US$0).
//   A  firm-scope.ts's BYPASS_USES holds exactly the 15 uses of the freeze (ANCHOR): a use added there is refused, with
//      the place it goes instead; a use removed from it is named too (it may leave only with this check's ANCHOR).
//   B  defineBypassUse is named only in a file named *.bypass.ts (api/src, ports, engine, contracts; firm-scope.ts defines
//      it), and such a file only imports the real firm-scope.ts and exports `const X = defineBypassUse("<name>", { ... })`
//      (a literal name, so the Lead and grep can find every use). defineBypassUse itself refuses any other calling file.
//   C  every declared name is well formed and unique, on the list and across the *.bypass.ts files.
//   D  at run time: a declared use crosses like a listed one (asBypass by its value, asJob), and never by its name; a
//      declaration from any other file, a look-alike object, a duplicate, a name on the list, a use with no audit and a
//      declaration after start-up are refused; the API's start-up loads every *.bypass.ts file, then closes the list.
//   tsx studio/tests/check_bypass_uses.ts
//   tsx studio/tests/check_bypass_uses.ts --old-file <file>   rule A alone on that file (exit 1 when it adds a use); the
//        fixture tests/fixtures/bypass-uses/list-with-a-new-use.ts.txt is the list with one use added.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const STUDIO = join(import.meta.dirname, ".."), SRC = join(STUDIO, "api", "src");
const SCOPE = join(SRC, "platform", "firm-scope.ts"), WALLS = join(SRC, "features", "platform-firm-walls.ts");
const FIXTURE = join(STUDIO, "tests", "fixtures", "bypass-uses", "list-with-a-new-use.ts.txt");
/** The named list at the freeze (22 Nov: main 01841047d's 14, and PF-5 part 4's exit notices, merged before the freeze
 *  landed, #3046). Nothing is ever added here. */
const ANCHOR = ["cases.prospect-won.catch-up", "job:messages.outbox_sweep", "job:messages.send", "job:platform.billing.exit_notices", "job:platform.billing.webhook_sweep",
  "job:platform.entitlements.booking_daily", "job:platform.entitlements.storage_daily", "job:platform.signup.purge", "platform.account.mail",
  "platform.billing.stripe-webhook", "platform.demo.inbox", "platform.demo.reset", "platform.entitlements.limit-change", "platform.firms.signup",
  "platform.web-address.catch-up"];
const NAME = /^(job:)?[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/;
const WHERE = "a new bypass use is declared in its module's own <name>.bypass.ts file: `export const X = defineBypassUse(\"<area.what>\", { why, routes, audit, ... })`, imported by the code that calls asBypass(X, ...); BYPASS_USES in firm-scope.ts is frozen (DEVELOPING.md, \"Bypass uses\"). A new use is still a permissions change: the Lead reads it (P-423)";

const parse = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true);
const keyText = (n: ts.PropertyName) => (ts.isStringLiteral(n) || ts.isIdentifier(n) || ts.isNumericLiteral(n) ? n.text : null);

/** Rule A: the uses written in BYPASS_USES in this text, and what is wrong with them. */
export function listFindings(text: string): { names: string[]; findings: string[] } {
  const src = parse("firm-scope.ts", text), findings: string[] = [], names: string[] = [];
  let found = 0;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "BYPASS_USES") {
      found++;
      const call = n.initializer;
      const obj = call && ts.isCallExpression(call) && call.expression.getText(src) === "Object.freeze" ? call.arguments[0] : undefined;
      if (!obj || !ts.isObjectLiteralExpression(obj)) { findings.push("BYPASS_USES is not Object.freeze({ ... }) of written entries"); return; }
      for (const p of obj.properties) {
        const k = ts.isPropertyAssignment(p) ? keyText(p.name) : null;
        if (k === null) { findings.push(`line ${src.getLineAndCharacterOfPosition(p.getStart(src)).line + 1}: an entry that is not a written name: ${p.getText(src).slice(0, 80)}`); continue; }
        names.push(k);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  if (found !== 1) findings.push(`BYPASS_USES is declared ${found} times (once)`);
  for (const k of names) if (!ANCHOR.includes(k)) findings.push(`"${k}" added to BYPASS_USES in firm-scope.ts`);
  for (const k of ANCHOR) if (found === 1 && !names.includes(k)) findings.push(`"${k}" is no longer on BYPASS_USES (a use leaves the list only together with this check's ANCHOR)`);
  return { names, findings };
}

/** The entry of a declaration, written as plain literals only (breaker M1, M2): `why` a string, `routes` regular
 *  expressions, `audit` "per-firm" or "platform", `outside`/`direct` true or false, `inside` strings. A getter, a spread,
 *  a call (an IIFE, an import()) or any other key could run code or change what is declared, so each is refused. */
export function entryShape(obj: ts.ObjectLiteralExpression, src: ts.SourceFile): string[] {
  const out: string[] = [], seen = new Set<string>();
  const str = (e: ts.Expression) => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e);
  for (const p of obj.properties) {
    const key = ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) ? p.name.text : null;
    if (!key || !ts.isPropertyAssignment(p)) { out.push(`not a plain entry property: ${p.getText(src).slice(0, 60)}`); continue; }
    if (seen.has(key)) out.push(`${key} written twice`);
    seen.add(key);
    const v = p.initializer;
    const good = key === "why" ? str(v)
      : key === "routes" ? ts.isArrayLiteralExpression(v) && v.elements.every((e) => e.kind === ts.SyntaxKind.RegularExpressionLiteral)
      : key === "audit" ? ts.isStringLiteral(v) && (v.text === "per-firm" || v.text === "platform")
      : key === "outside" || key === "direct" ? v.kind === ts.SyntaxKind.TrueKeyword || v.kind === ts.SyntaxKind.FalseKeyword
      : key === "inside" ? ts.isArrayLiteralExpression(v) && v.elements.every(str)
      : null;
    if (good === null) out.push(`${key} is not an entry field (why, routes, audit, outside, direct, inside)`);
    else if (!good) out.push(`${key} is not written as a plain literal: ${v.getText(src).slice(0, 60)}`);
  }
  for (const k of ["why", "routes", "audit"]) if (!seen.has(k)) out.push(`${k} is missing`);
  return out;
}

/** Every *.bypass.ts file under `root` (the prototype folder: the API also imports p2, p5 and contracts there) that is
 *  not under `apiSrc` (review round 2): defineBypassUse refuses such a file at run time, and the check names it. */
export function strayUseFiles(root: string, apiSrc: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (["node_modules", ".git", "var", "dist"].includes(e.name)) continue; const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.bypass\.[cm]?[jt]sx?$/.test(e.name) && !p.startsWith(apiSrc + "/")) out.push(relative(root, p)); } };
  walk(root);
  return out;
}

/** Every .ts file under a folder (no node_modules). */
function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) tsFiles(p, out); else if (/\.[cm]?[jt]sx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Rules B and C on a source folder: the declared names (file per name) and what is wrong. */
export function declarationFindings(roots: string[], base: string, scopeFile = SCOPE, srcRoot = SRC): { declared: Map<string, string>; findings: string[] } {
  const declared = new Map<string, string>(), findings: string[] = [];
  for (const f of roots.filter((r) => { try { return statSync(r).isDirectory(); } catch { return false; } }).flatMap((r) => tsFiles(r))) {
    if (f === scopeFile) continue;
    const rel = relative(base, f), text = readFileSync(f, "utf8");
    const src = parse(f, text), isUseFile = /\.bypass\.ts$/.test(f);
    // review (fresh) minor 1: no file reaches node:vm (it can run code under a made-up file name, past the caller check).
    if (/\bfrom\s*["'](node:)?vm["']|\brequire\(\s*["'](node:)?vm["']\s*\)|\bimport\(\s*["'](node:)?vm["']\s*\)/.test(text)) findings.push(`${rel}: imports node:vm (it can run code under any file name; not used in the API)`);
    if (!isUseFile && !text.includes("defineBypassUse")) continue;
    if (!isUseFile) {   // any mention (an alias, a namespace member, a variable, a string), not only a direct call (review M1)
      const at = new Set<number>();
      const visit = (n: ts.Node) => { if ((ts.isIdentifier(n) || ts.isStringLiteralLike(n)) && n.text.includes("defineBypassUse")) at.add(src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1); ts.forEachChild(n, visit); };
      visit(src);
      for (const l of at) findings.push(`${rel}:${l}: defineBypassUse named outside a *.bypass.ts file`);
      continue;
    }
    let mine = 0;
    for (const st of src.statements) {
      if (ts.isImportDeclaration(st)) {
        const from = ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : "";
        if (resolve(dirname(f), from) !== scopeFile) findings.push(`${rel}: imports "${from}" (a *.bypass.ts file imports only api/src/platform/firm-scope.ts)`);
        continue;
      }
      const decl = ts.isVariableStatement(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) && (st.declarationList.flags & ts.NodeFlags.Const) && st.declarationList.declarations.length === 1 ? st.declarationList.declarations[0] : undefined;
      const call = decl?.initializer && ts.isCallExpression(decl.initializer) && ts.isIdentifier(decl.initializer.expression) && decl.initializer.expression.text === "defineBypassUse" ? decl.initializer : undefined;
      const arg = call?.arguments[0];
      if (!call || !arg || !ts.isStringLiteral(arg) || call.arguments.length !== 2 || !ts.isObjectLiteralExpression(call.arguments[1])) {
        findings.push(`${rel}:${src.getLineAndCharacterOfPosition(st.getStart(src)).line + 1}: a *.bypass.ts file holds only \`export const X = defineBypassUse("<name>", { ... })\`: ${st.getText(src).split("\n")[0].slice(0, 80)}`);
        continue;
      }
      const name = arg.text;
      mine++;
      for (const l of entryShape(call.arguments[1] as ts.ObjectLiteralExpression, src)) findings.push(`${rel}: "${name}": ${l}`);
      if (!f.startsWith(srcRoot + "/")) findings.push(`${rel}: a *.bypass.ts file lives under api/src (the API loads only those at start-up)`);
      if (!NAME.test(name)) findings.push(`${rel}: "${name}" is not a use name (area.what, or job:<queue>)`);
      if (ANCHOR.includes(name)) findings.push(`${rel}: "${name}" is already on BYPASS_USES`);
      if (declared.has(name)) findings.push(`"${name}" is declared in ${declared.get(name)} and in ${rel}: a use is declared once`); else declared.set(name, rel);
    }
    let calls = 0;
    const count = (n: ts.Node) => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "defineBypassUse") calls++; ts.forEachChild(n, count); };
    count(src);
    if (calls !== mine && !findings.some((l) => l.startsWith(rel))) findings.push(`${rel}: a defineBypassUse call that is not a top-level export`);
  }
  return { declared, findings };
}

const oldArg = process.argv.indexOf("--old-file");
if (oldArg > 0) {
  const file = process.argv[oldArg + 1];
  if (!file) { console.log("--old-file wants a file; nothing was checked"); process.exit(2); }
  const { findings } = listFindings(readFileSync(file, "utf8"));
  for (const f of findings) console.log(`REFUSED  ${f}`);
  console.log(findings.length ? `\n${file}: ${findings.length} change(s) to the frozen list. ${WHERE}.` : `${file}: the frozen list, unchanged`);
  process.exit(findings.length ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const WORK = join(STUDIO, "var", `bypass-uses-check-${process.pid}`);
try {
  // A: the frozen list.
  const scopeText = readFileSync(SCOPE, "utf8"), now = listFindings(scopeText);
  ok(`P-785 step 2 A pass: BYPASS_USES in firm-scope.ts holds exactly the ${ANCHOR.length} uses of the freeze`, now.findings.length === 0 && now.names.length === ANCHOR.length, now.findings);
  if (now.findings.length) console.log(`      ${WHERE}`);
  const fx = listFindings(readFileSync(FIXTURE, "utf8"));
  ok("P-785 step 2 A fail: the fixture (the list with one use added) is refused, naming the use", fx.findings.some((l) => l.includes('"platform.p785probe.added" added to BYPASS_USES')), fx.findings);
  const dropped = listFindings(scopeText.replace(/\n {2}"platform\.demo\.inbox": \{[^\n]*\n/, "\n"));
  ok("P-785 step 2 A fail: a use removed from the list is named", dropped.findings.some((l) => l.includes('"platform.demo.inbox" is no longer on BYPASS_USES')), dropped.findings);
  const spread = listFindings(scopeText.replace("export const BYPASS_USES: Readonly<Record<string, BypassEntry>> = Object.freeze({", "export const BYPASS_USES: Readonly<Record<string, BypassEntry>> = Object.freeze({\n  ...MORE_USES,"));
  ok("P-785 step 2 A fail: a spread of more uses into the list is refused", spread.findings.some((l) => /an entry that is not a written name: \.\.\.MORE_USES/.test(l)), spread.findings);

  // B, C: the tree as it is.
  // The folders the API loads code from (browser code is not among them and cannot reach firm-scope.ts; scanning it would
  // also make the suite selector run this check for every page change).
  const ROOTS = ["api/src", "ports", "engine", "contracts"].map((d) => join(STUDIO, d));
  const tree = declarationFindings(ROOTS, STUDIO);
  ok(`P-785 step 2 B, C pass: ${tree.declared.size} use(s) declared in *.bypass.ts files (api/src, ports, engine, contracts), each well formed and once, none on the list`, tree.findings.length === 0, tree.findings);
  const PROTOTYPE = join(STUDIO, ".."), stray = strayUseFiles(PROTOTYPE, SRC);
  ok("P-785 step 2 B pass: no *.bypass.ts file in prototype/ outside studio/api/src (p2, p5, contracts and the rest)", stray.length === 0, stray);

  // Before and after, on a scratch folder (its own platform/firm-scope.ts path): a new use is one new file beside its
  // module; nothing shared is edited.
  const tmp = join(WORK, "src"), tmpScope = join(tmp, "platform", "firm-scope.ts");
  const fresh = () => { rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, "billing"), { recursive: true }); mkdirSync(join(tmp, "platform"), { recursive: true }); writeFileSync(tmpScope, "export {};\n"); };
  const useFile = (name: string) => `import { defineBypassUse } from "../platform/firm-scope.ts";\nexport const PROBE = defineBypassUse("${name}", { why: "a probe", routes: [], outside: true, audit: "per-firm" });\n`;
  const scan = () => declarationFindings([tmp], tmp, tmpScope, tmp);
  fresh(); writeFileSync(join(tmp, "billing", "p785-probe.bypass.ts"), useFile("platform.p785probe.one"));
  const after = scan();
  ok("P-785 step 2 pass (after): a new use is one new <name>.bypass.ts file beside its module, firm-scope.ts untouched", after.findings.length === 0 && after.declared.get(join("billing", "p785-probe.bypass.ts")) === undefined && after.declared.get("platform.p785probe.one") === join("billing", "p785-probe.bypass.ts") && listFindings(scopeText).findings.length === 0, after.findings);
  const refuses = (what: string, files: Record<string, string>, saying: RegExp, alone = false) => {
    fresh(); for (const [f, t] of Object.entries(files)) { mkdirSync(join(tmp, f, ".."), { recursive: true }); writeFileSync(join(tmp, f), t); }
    const r = scan(); ok(`P-785 step 2 B/C fail: ${what} is refused`, r.findings.some((l) => saying.test(l)) && (!alone || r.findings.length === 1), r.findings);
  };
  const imp = `import { defineBypassUse } from "../platform/firm-scope.ts";\n`;
  refuses("defineBypassUse in an ordinary file", { "billing/service.ts": useFile("platform.p785probe.two") }, /billing\/service\.ts:1: defineBypassUse named outside a \*\.bypass\.ts file/);
  refuses("a renamed import in an ordinary file", { "billing/service.ts": `import { defineBypassUse as d } from "../platform/firm-scope.ts";\nexport const P = d("platform.p785probe.x", { why: "w", routes: [], audit: "per-firm" });\n` }, /billing\/service\.ts:1: defineBypassUse named outside/);
  refuses("a namespace member in an ordinary file", { "billing/service.ts": `import * as fsc from "../platform/firm-scope.ts";\nexport const P = fsc.defineBypassUse("platform.p785probe.x", { why: "w", routes: [], audit: "per-firm" });\n` }, /billing\/service\.ts:2: defineBypassUse named outside/);
  refuses("a call through a variable in an ordinary file", { "billing/service.ts": `${imp}const f = defineBypassUse;\nexport const P = f("platform.p785probe.x", { why: "w", routes: [], audit: "per-firm" });\n` }, /billing\/service\.ts:2: defineBypassUse named outside/);
  refuses("a *.bypass.ts file that imports anything else", { "billing/x.bypass.ts": `import { db } from "../core.ts";\n${useFile("platform.p785probe.three")}` }, /imports "\.\.\/core\.ts"/);
  refuses("a *.bypass.ts file importing a look-alike firm-scope.ts", { "billing/x.bypass.ts": useFile("platform.p785probe.three").replace("../platform/firm-scope.ts", "./evil/firm-scope.ts") }, /imports "\.\/evil\/firm-scope\.ts"/);
  refuses("a *.bypass.ts file that does more than declare", { "billing/x.bypass.ts": `${useFile("platform.p785probe.four")}export const sneaky = 1;\n` }, /holds only `export const X = defineBypassUse/);
  refuses("a computed name", { "billing/x.bypass.ts": `${imp}const n = "platform.x";\nexport const P = defineBypassUse(n, { why: "w", routes: [], audit: "per-firm" });\n` }, /holds only/);
  refuses("the same name declared in two files (one finding)", { "billing/a.bypass.ts": useFile("platform.p785probe.five"), "money/b.bypass.ts": useFile("platform.p785probe.five") }, /"platform\.p785probe\.five" is declared in .* and in /, true);
  refuses("a name already on the list", { "billing/x.bypass.ts": useFile("platform.demo.inbox") }, /"platform\.demo\.inbox" is already on BYPASS_USES/);
  refuses("a malformed name", { "billing/x.bypass.ts": useFile("NotAUse") }, /"NotAUse" is not a use name/);
  const entryWith = (body: string) => `${imp}export const P = defineBypassUse("platform.p785probe.shape", { ${body} });\n`;
  refuses("a reason computed by a function (an IIFE that could declare a hidden use)", { "billing/x.bypass.ts": entryWith(`why: (() => "w")(), routes: [], audit: "per-firm"`) }, /why is not written as a plain literal/);
  refuses("a getter in the entry", { "billing/x.bypass.ts": entryWith(`why: "w", get routes() { return [/.*/]; }, audit: "per-firm"`) }, /not a plain entry property: get routes/);
  refuses("a spread into the entry", { "billing/x.bypass.ts": entryWith(`...base, why: "w", routes: [], audit: "per-firm"`) }, /not a plain entry property: \.\.\.base/);
  refuses("routes built at run time", { "billing/x.bypass.ts": entryWith(`why: "w", routes: [new RegExp(".*")], audit: "per-firm"`) }, /routes is not written as a plain literal/);
  refuses("an unknown field", { "billing/x.bypass.ts": entryWith(`why: "w", routes: [], audit: "per-firm", hook: 1`) }, /hook is not an entry field/);
  fresh(); mkdirSync(join(tmp, "ports"), { recursive: true }); writeFileSync(join(tmp, "ports", "x.bypass.ts"), useFile("platform.p785probe.ports"));
  const outsideSrc = declarationFindings([tmp], tmp, tmpScope, join(tmp, "billing"));
  ok("P-785 step 2 B/C fail: a *.bypass.ts file outside api/src (the folders the API loads) is refused", outsideSrc.findings.some((l) => /ports\/x\.bypass\.ts: a \*\.bypass\.ts file lives under api\/src/.test(l)), outsideSrc.findings);
  fresh(); mkdirSync(join(tmp, "p2"), { recursive: true }); writeFileSync(join(tmp, "p2", "ledger.bypass.ts"), "export {};\n");
  const strayHere = strayUseFiles(tmp, join(tmp, "billing"));
  ok("P-785 step 2 B fail: a *.bypass.ts file elsewhere in prototype/ (p2, which the API imports) is named", strayHere.includes(join("p2", "ledger.bypass.ts")), strayHere);
  refuses("a *.bypass.ts file that never names defineBypassUse but imports other code", { "billing/x.bypass.ts": `import { db } from "../core.ts";\nexport const n = db;\n` }, /imports "\.\.\/core\.ts"/);
  refuses("node:vm in any file", { "billing/service.ts": `import vm from "node:vm";\nexport const x = vm;\n` }, /billing\/service\.ts: imports node:vm/);
  fresh(); writeFileSync(join(tmp, "billing", "x.bypass.ts"), `// Declared with defineBypassUse("platform.p785probe.c"), see DEVELOPING.md.\n${useFile("platform.p785probe.commented")}`.replace(`why: "a probe"`, `why: "a probe; defineBypassUse( in words"`));
  const commented = scan();
  ok("P-785 step 2 B pass: a comment or a reason naming defineBypassUse( in a *.bypass.ts file is not a call", commented.findings.length === 0, commented.findings);
  refuses("a missing audit", { "billing/x.bypass.ts": entryWith(`why: "w", routes: []`) }, /audit is missing/);

  // D: at run time, on real *.bypass.ts files under var/ importing the real firm-scope.ts.
  const fs = await import("../api/src/platform/firm-scope.ts");
  // The probes live under api/src (only there may a file declare), in a folder of this run's own, removed at the end.
  for (const e of readdirSync(join(SRC, "platform"))) if (e.startsWith("__p785probe_")) rmSync(join(SRC, "platform", e), { recursive: true, force: true });
  const live = join(SRC, "platform", `__p785probe_${process.pid}`), toScope = relative(live, SCOPE).split("\\").join("/");
  mkdirSync(live, { recursive: true });
  const declare = (file: string, name: string, extra = "") => writeFileSync(join(live, file), `import { defineBypassUse } from "${toScope}";\nexport const USE = defineBypassUse("${name}", { why: "the check's probe", routes: [], outside: true, audit: ${name.startsWith("job:") ? '"platform"' : '"per-firm"'}${extra} });\n`);
  declare("run.bypass.ts", "platform.p785probe.run");
  declare("queue.bypass.ts", "job:p785probe.queue");
  const loaded = await fs.loadBypassUseFiles(live);
  ok("P-785 step 2 D pass: loadBypassUseFiles (the API's start-up) loads every *.bypass.ts file under its folder", loaded.length === 2 && fs.bypassUses()["platform.p785probe.run"]?.audit === "per-firm" && fs.bypassUses()["job:p785probe.queue"]?.audit === "platform", loaded);
  const probe = (await import(pathToFileURL(join(live, "run.bypass.ts")).href) as { USE: import("../api/src/platform/firm-scope.ts").BypassUse }).USE;
  ok("P-785 step 2 D pass: a later import of a loaded file is the same declaration (no second one, no refusal)", probe.name === "platform.p785probe.run" && Object.keys(fs.bypassUses()).length === ANCHOR.length + 2 && Object.keys(fs.BYPASS_USES).length === ANCHOR.length);
  const was = fs.onBypassLine(() => undefined);
  const refusedAt = async (what: string, f: () => unknown, saying: RegExp) => { let e: unknown; try { await f(); } catch (x) { e = x; } ok(`P-785 step 2 D fail: ${what} is refused (BypassRefused)`, e instanceof fs.BypassRefused && saying.test(String(e)), String(e)); };
  try {
    ok("P-785 step 2 D pass: asBypass(declared use) runs under that use, as a listed one does", await fs.asBypass(probe, () => fs.currentBypass()) === "platform.p785probe.run");
    ok("P-785 step 2 D pass: asJob finds a declared job:<queue> use", await fs.asJob("p785probe.queue", async () => fs.currentBypass()) === "job:p785probe.queue");
    ok("P-785 step 2 D pass: a listed use still runs by its name (backward compatible)", await fs.asBypass("platform.web-address.catch-up", () => fs.currentBypass()) === "platform.web-address.catch-up");
    await refusedAt("a declared use passed by its name (only its value counts)", () => fs.asBypass("platform.p785probe.run", () => 1), /not on the named list/);
    await refusedAt("a declaration from a file that is not *.bypass.ts (this check)", () => fs.defineBypassUse("platform.p785probe.here", { why: "w", routes: [], audit: "per-firm" }), /only a <name>\.bypass\.ts file under api\/src may declare/);
    const alias = fs.defineBypassUse;
    await refusedAt("a declaration through a variable from such a file", () => alias("platform.p785probe.alias", { why: "w", routes: [], audit: "per-firm" }), /only a <name>\.bypass\.ts file under api\/src may declare/);
    writeFileSync(join(live, "sneaky.ts"), `import * as fsc from "${toScope}";\nexport const USE = fsc.defineBypassUse("platform.p785probe.sneaky", { why: "w", routes: [], audit: "per-firm" });\n`);
    await refusedAt("a namespace call from an ordinary file", () => import(pathToFileURL(join(live, "sneaky.ts")).href), /declared in .*sneaky\.ts; only a <name>\.bypass\.ts file under api\/src may declare/);
    await refusedAt("a look-alike of a declared use", () => fs.asBypass({ name: "platform.p785probe.run", entry: { why: "x", routes: [], outside: true, audit: "per-firm" } }, () => 1), /not a declared bypass use/);
    await refusedAt("a name neither listed nor declared", () => fs.asBypass("platform.p785probe.nowhere", () => 1), /not on the named list/);
    const outside = join(WORK, "outside"); mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "elsewhere.bypass.ts"), `import { defineBypassUse } from "${relative(outside, SCOPE).split("\\").join("/")}";\nexport const USE = defineBypassUse("platform.p785probe.elsewhere", { why: "w", routes: [], audit: "per-firm" });\n`);
    await refusedAt("a *.bypass.ts file outside api/src", () => import(pathToFileURL(join(outside, "elsewhere.bypass.ts")).href), /only a <name>\.bypass\.ts file under api\/src may declare/);
    await refusedAt("evaluated code naming a *.bypass.ts file (new Function with a sourceURL)", () => new Function("d", `return d("platform.p785probe.evaluated", { why: "w", routes: [], audit: "per-firm" });\n//# sourceURL=${join(live, "fake.bypass.ts")}`)(fs.defineBypassUse), /an unknown file/);
    const bad = async (file: string, name: string, extra: string, saying: RegExp, what: string) => { declare(file, name, extra); await refusedAt(what, () => import(pathToFileURL(join(live, file)).href), saying); };
    await bad("again.bypass.ts", "platform.p785probe.run", "", /already a bypass use/, "a second declaration of the same name");
    await bad("listed.bypass.ts", "platform.demo.inbox", "", /already a bypass use/, "a declaration of a listed name");
    writeFileSync(join(live, "noaudit.bypass.ts"), `import { defineBypassUse } from "${toScope}";\nexport const USE = defineBypassUse("platform.p785probe.noaudit", { why: "w", routes: [] } as never);\n`);
    await refusedAt("a declaration with no audit", () => import(pathToFileURL(join(live, "noaudit.bypass.ts")).href), /names no audit/);
    ok("P-785 step 2 D pass: a declared use is frozen (its routes cannot be widened later)", Object.isFrozen(probe) && Object.isFrozen(probe.entry) && Object.isFrozen(probe.entry.routes));
    writeFileSync(join(live, "routed.bypass.ts"), `import { defineBypassUse } from "${toScope}";\nexport const USE = defineBypassUse("platform.p785probe.routed", { why: "the check's routed probe", routes: [/^GET \\/api\\/p785probe$/], audit: "per-firm" });\n`);
    const routed = (await import(pathToFileURL(join(live, "routed.bypass.ts")).href) as { USE: import("../api/src/platform/firm-scope.ts").BypassUse }).USE;
    const req = (path: string) => ({ method: "GET", path });
    ok("P-785 step 2 D pass: a declared use runs on its own route", await fs.inRequest(req("/api/p785probe"), () => fs.asBypass(routed, () => fs.currentBypass())) === "platform.p785probe.routed");
    await refusedAt("a declared use on another route", () => fs.inRequest(req("/api/elsewhere"), () => fs.asBypass(routed, () => 1)), /not allowed on GET \/api\/elsewhere/);
    (routed.entry.routes[0] as RegExp & { compile?: (s: string) => void }).compile?.(".*");
    await refusedAt("a handed-out route recompiled to match anything (the use keeps its own copy)", () => fs.inRequest(req("/api/elsewhere"), () => fs.asBypass(routed, () => 1)), /not allowed on GET \/api\/elsewhere/);
    fs.closeBypassUses();
    declare("late.bypass.ts", "platform.p785probe.late");
    await refusedAt("a declaration after start-up (closeBypassUses)", () => import(pathToFileURL(join(live, "late.bypass.ts")).href), /declared after start-up/);
    ok("P-785 step 2 D pass: after closing, the declared uses still run", await fs.asBypass(probe, () => fs.currentBypass()) === "platform.p785probe.run");
  } finally { fs.onBypassLine(was); }
  const walls = readFileSync(WALLS, "utf8");
  ok("P-785 step 2 D pass: the API loads every api/src *.bypass.ts file with the features (platform-firm-walls.ts, top level, before any start-up hook) and closes the list in onApplicationBootstrap", /^await loadBypassUseFiles\(join\(import\.meta\.dirname, "\.\."\)\);$/m.test(walls) && /onApplicationBootstrap\(\)\s*\{\s*closeBypassUses\(\);\s*\}/.test(walls));
} finally {
  rmSync(WORK, { recursive: true, force: true });
  for (const e of readdirSync(join(SRC, "platform"))) if (e.startsWith("__p785probe_")) rmSync(join(SRC, "platform", e), { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
