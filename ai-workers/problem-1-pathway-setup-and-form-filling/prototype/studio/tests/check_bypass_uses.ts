// P-785 (2), step 2: a new bypass use (a use that may cross the firm walls, PF-12) is declared beside its module in its
// own `<name>.bypass.ts` file (defineBypassUse), and the named list in api/src/platform/firm-scope.ts (BYPASS_USES) is
// frozen as it stood on 22 Nov. A sweep of api/src; no server, no database, no model call (US$0).
//   A  firm-scope.ts's BYPASS_USES holds exactly the 14 uses of the freeze (ANCHOR): a use added there is refused, with
//      the place it goes instead; a use removed from it is named too (it may leave only with this check's ANCHOR).
//   B  defineBypassUse is called only in a file named *.bypass.ts, and such a file only imports firm-scope.ts and
//      exports `const X = defineBypassUse("<name>", { ... })` (a literal name, so the Lead and grep can find every use).
//   C  every declared name is well formed and unique, on the list and across the *.bypass.ts files.
//   D  at run time: a declared use crosses like a listed one (asBypass, asJob), a look-alike object, a duplicate, a name
//      on the list, a use with no audit and a declaration after start-up are refused; the API's start-up closes the list.
//   tsx studio/tests/check_bypass_uses.ts
//   tsx studio/tests/check_bypass_uses.ts --old-file <file>   rule A alone on that file (exit 1 when it adds a use); the
//        fixture tests/fixtures/bypass-uses/list-with-a-new-use.ts.txt is the list with one use added.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const STUDIO = join(import.meta.dirname, ".."), SRC = join(STUDIO, "api", "src");
const SCOPE = join(SRC, "platform", "firm-scope.ts"), WALLS = join(SRC, "features", "platform-firm-walls.ts");
const FIXTURE = join(STUDIO, "tests", "fixtures", "bypass-uses", "list-with-a-new-use.ts.txt");
/** The named list at the freeze (main 01841047d, 22 Nov). Nothing is ever added here. */
const ANCHOR = ["cases.prospect-won.catch-up", "job:messages.outbox_sweep", "job:messages.send", "job:platform.billing.webhook_sweep",
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

/** Every .ts file under a folder (no node_modules). */
function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) tsFiles(p, out); else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Rules B and C on a source folder: the declared names (file per name) and what is wrong. */
export function declarationFindings(root: string, scopeFile = SCOPE): { declared: Map<string, string>; findings: string[] } {
  const declared = new Map<string, string>(), findings: string[] = [];
  for (const f of tsFiles(root)) {
    if (f === scopeFile) continue;
    const rel = relative(root, f), text = readFileSync(f, "utf8");
    if (!text.includes("defineBypassUse")) continue;
    const src = parse(f, text), isUseFile = /\.bypass\.ts$/.test(f);
    const calls: ts.CallExpression[] = [];
    const visit = (n: ts.Node) => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "defineBypassUse") calls.push(n); ts.forEachChild(n, visit); };
    visit(src);
    if (!isUseFile) { for (const c of calls) findings.push(`${rel}:${src.getLineAndCharacterOfPosition(c.getStart(src)).line + 1}: defineBypassUse outside a *.bypass.ts file`); continue; }
    for (const st of src.statements) {
      if (ts.isImportDeclaration(st)) {
        const from = ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : "";
        if (!/(^|\/)firm-scope\.ts$/.test(from)) findings.push(`${rel}: imports "${from}" (a *.bypass.ts file imports only firm-scope.ts)`);
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
      if (!NAME.test(name)) findings.push(`${rel}: "${name}" is not a use name (area.what, or job:<queue>)`);
      if (ANCHOR.includes(name)) findings.push(`${rel}: "${name}" is already on BYPASS_USES`);
      if (declared.has(name)) findings.push(`"${name}" is declared in ${declared.get(name)} and in ${rel}: a use is declared once`); else declared.set(name, rel);
    }
    if (calls.length !== [...declared.values()].filter((v) => v === rel).length && !findings.some((l) => l.startsWith(rel))) findings.push(`${rel}: a defineBypassUse call that is not a top-level export`);
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
  ok("P-785 step 2 A pass: BYPASS_USES in firm-scope.ts holds exactly the 14 uses of the freeze", now.findings.length === 0 && now.names.length === 14, now.findings);
  if (now.findings.length) console.log(`      ${WHERE}`);
  const fx = listFindings(readFileSync(FIXTURE, "utf8"));
  ok("P-785 step 2 A fail: the fixture (the list with one use added) is refused, naming the use", fx.findings.some((l) => l.includes('"platform.p785probe.added" added to BYPASS_USES')), fx.findings);
  const dropped = listFindings(scopeText.replace(/\n {2}"platform\.demo\.inbox": \{[^\n]*\n/, "\n"));
  ok("P-785 step 2 A fail: a use removed from the list is named", dropped.findings.some((l) => l.includes('"platform.demo.inbox" is no longer on BYPASS_USES')), dropped.findings);
  const spread = listFindings(scopeText.replace("export const BYPASS_USES: Readonly<Record<string, BypassEntry>> = Object.freeze({", "export const BYPASS_USES: Readonly<Record<string, BypassEntry>> = Object.freeze({\n  ...MORE_USES,"));
  ok("P-785 step 2 A fail: a spread of more uses into the list is refused", spread.findings.some((l) => /an entry that is not a written name: \.\.\.MORE_USES/.test(l)), spread.findings);

  // B, C: the tree as it is.
  const tree = declarationFindings(SRC);
  ok(`P-785 step 2 B, C pass: ${tree.declared.size} use(s) declared in *.bypass.ts files, each well formed and once, none on the list`, tree.findings.length === 0, tree.findings);

  // Before and after, on a scratch folder: a new use is one new file beside its module; nothing shared is edited.
  const tmp = join(WORK, "src");
  const fresh = () => { rmSync(tmp, { recursive: true, force: true }); mkdirSync(join(tmp, "billing"), { recursive: true }); };
  const useFile = (name: string) => `import { defineBypassUse } from "../platform/firm-scope.ts";\nexport const PROBE = defineBypassUse("${name}", { why: "a probe", routes: [], outside: true, audit: "per-firm" });\n`;
  fresh(); writeFileSync(join(tmp, "billing", "p785-probe.bypass.ts"), useFile("platform.p785probe.one"));
  const after = declarationFindings(tmp);
  ok("P-785 step 2 pass (after): a new use is one new <name>.bypass.ts file beside its module, firm-scope.ts untouched", after.findings.length === 0 && after.declared.get("platform.p785probe.one") === join("billing", "p785-probe.bypass.ts") && listFindings(scopeText).findings.length === 0, after.findings);
  const refuses = (what: string, files: Record<string, string>, saying: RegExp) => {
    fresh(); for (const [f, t] of Object.entries(files)) { mkdirSync(join(tmp, f, ".."), { recursive: true }); writeFileSync(join(tmp, f), t); }
    const r = declarationFindings(tmp); ok(`P-785 step 2 B/C fail: ${what} is refused`, r.findings.some((l) => saying.test(l)), r.findings);
  };
  refuses("defineBypassUse in an ordinary file", { "billing/service.ts": useFile("platform.p785probe.two") }, /billing\/service\.ts:2: defineBypassUse outside a \*\.bypass\.ts file/);
  refuses("a *.bypass.ts file that imports anything else", { "billing/x.bypass.ts": `import { db } from "../core.ts";\n${useFile("platform.p785probe.three")}` }, /imports "\.\.\/core\.ts"/);
  refuses("a *.bypass.ts file that does more than declare", { "billing/x.bypass.ts": `${useFile("platform.p785probe.four")}export const sneaky = 1;\n` }, /holds only `export const X = defineBypassUse/);
  refuses("a computed name", { "billing/x.bypass.ts": `import { defineBypassUse } from "../platform/firm-scope.ts";\nconst n = "platform.x";\nexport const P = defineBypassUse(n, { why: "w", routes: [], audit: "per-firm" });\n` }, /holds only/);
  refuses("the same name declared in two files", { "billing/a.bypass.ts": useFile("platform.p785probe.five"), "money/b.bypass.ts": useFile("platform.p785probe.five") }, /"platform\.p785probe\.five" is declared in .* and in /);
  refuses("a name already on the list", { "billing/x.bypass.ts": useFile("platform.demo.inbox") }, /"platform\.demo\.inbox" is already on BYPASS_USES/);
  refuses("a malformed name", { "billing/x.bypass.ts": useFile("NotAUse") }, /"NotAUse" is not a use name/);

  // D: at run time.
  const fs = await import("../api/src/platform/firm-scope.ts");
  const probe = fs.defineBypassUse("platform.p785probe.run", { why: "the check's probe", routes: [], outside: true, audit: "per-firm" });
  const job = fs.defineBypassUse("job:p785probe.queue", { why: "the check's job probe", routes: [], outside: true, audit: "platform" });
  ok("P-785 step 2 D pass: a declared use is in bypassUses() with the 14 listed ones; BYPASS_USES itself stays the 14", fs.bypassUses()["platform.p785probe.run"]?.audit === "per-firm" && Object.keys(fs.bypassUses()).length === 16 && Object.keys(fs.BYPASS_USES).length === 14);
  const was = fs.onBypassLine(() => undefined);
  try {
    ok("P-785 step 2 D pass: asBypass(declared use) runs under that use, as a listed one does", await fs.asBypass(probe, () => fs.currentBypass()) === "platform.p785probe.run");
    ok("P-785 step 2 D pass: asJob finds a declared job:<queue> use", await fs.asJob("p785probe.queue", () => fs.currentBypass()) === "job:p785probe.queue" && job.name === "job:p785probe.queue");
    ok("P-785 step 2 D pass: a listed use still runs by its name (backward compatible)", await fs.asBypass("platform.web-address.catch-up", () => fs.currentBypass()) === "platform.web-address.catch-up");
    const refusedAt = async (what: string, f: () => unknown, saying: RegExp) => { let e: unknown; try { await f(); } catch (x) { e = x; } ok(`P-785 step 2 D fail: ${what} is refused (BypassRefused)`, e instanceof fs.BypassRefused && saying.test(String(e)), String(e)); };
    await refusedAt("a look-alike of a declared use", () => fs.asBypass({ name: "platform.p785probe.run", entry: { why: "x", routes: [], outside: true, audit: "per-firm" } }, () => 1), /not a declared bypass use/);
    await refusedAt("a name neither listed nor declared", () => fs.asBypass("platform.p785probe.nowhere", () => 1), /nor declared/);
    await refusedAt("a second declaration of the same name", () => fs.defineBypassUse("platform.p785probe.run", { why: "again", routes: [], audit: "per-firm" }), /already a bypass use/);
    await refusedAt("a declaration of a listed name", () => fs.defineBypassUse("platform.demo.inbox", { why: "again", routes: [], audit: "per-firm" }), /already a bypass use/);
    await refusedAt("a declaration with no audit", () => fs.defineBypassUse("platform.p785probe.noaudit", { why: "w", routes: [] } as never), /names no audit/);
    await refusedAt("a declaration with no reason", () => fs.defineBypassUse("platform.p785probe.noreason", { why: " ", routes: [], audit: "per-firm" }), /needs a reason/);
    ok("P-785 step 2 D pass: a declared use is frozen (its routes cannot be widened later)", Object.isFrozen(probe) && Object.isFrozen(probe.entry) && Object.isFrozen(probe.entry.routes));
    fs.closeBypassUses();
    await refusedAt("a declaration after start-up (closeBypassUses)", () => fs.defineBypassUse("platform.p785probe.late", { why: "late", routes: [], audit: "per-firm" }), /declared after start-up/);
    ok("P-785 step 2 D pass: after closing, the declared uses still run", await fs.asBypass(probe, () => fs.currentBypass()) === "platform.p785probe.run");
  } finally { fs.onBypassLine(was); }
  const walls = readFileSync(WALLS, "utf8");
  ok("P-785 step 2 D pass: the API's start-up closes the list (features/platform-firm-walls.ts onApplicationBootstrap calls closeBypassUses)", /onApplicationBootstrap\(\)\s*\{\s*closeBypassUses\(\);\s*\}/.test(walls));
} finally { rmSync(WORK, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
