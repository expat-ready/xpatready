#!/usr/bin/env node
// PF-0c (P-606 (8); Lead B ruling 3, 15 Nov): every port with a real adapter has one shared contract, and every adapter of
// it (its fake included) runs that contract in a test. Reads the files only (no TypeScript compiler, no import), US$0.
//   node studio/tools/check-port-contracts.mjs              the check on this tree (exit 1 on a problem; under 10 s, DW4)
//   node studio/tools/check-port-contracts.mjs --self-test  DW1: passes on a good fixture, fails on a port with a real
//                                                           adapter and no contract, and on an adapter that runs none
//   node studio/tools/check-port-contracts.mjs --list       the ports, adapters and contract calls it found
// A port: an `export interface|type <X>Port` in ports/*.ts or api/src/platform/identity/port.ts.
// A real adapter: under api/src/, a class with `implements … <X>Port …`, or an exported value or function typed
//   `: <X>Port` (a value made with `new <AdapterClass>(` is that class, not a second adapter); in ports/, an exported value
//   typed `: <X>Port` whose name does not start with fake/Fake (systemClock).
// A fake: in the port's own file, an exported function or class named fake…/Fake… (fakeJobs, FakeClock).
// Its contract: ports/contracts/<x>-port.contract.ts (kebab case of the port's name) exporting `<x>PortContract`.
// A contract call: in a test file (tests/*.ts|cjs), `runContract(<x>PortContract, "<Adapter>"`.
// Fails when a port that has a real adapter has no contract file, when a contract file does not export its contract,
// or when an adapter (real or fake) of a port with a contract has no contract call naming it.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT_MS = 10_000;   // DW4

const kebab = (port) => port.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
export const contractFile = (port) => `ports/contracts/${kebab(port)}.contract.ts`;
export const contractName = (port) => `${port[0].toLowerCase()}${port.slice(1)}Contract`;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx|mts)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}
/** The source without comments, so a port named in a comment is never taken for code. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
/** The text of a block whose `{` ends just before `from`, by counting braces (strings are short in these files). */
function bodyAt(text, from) {
  for (let i = from, depth = 1; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(from, i);
  }
  return text.slice(from);
}
const portsIn = (text) => [...new Set(text.match(/\b[A-Z]\w*Port\b/g) ?? [])];

/** Everything the check reads from the tree at `root` (a studio folder). */
export function inventory(root = STUDIO) {
  const rel = (p) => relative(root, p).split("\\").join("/");
  const portFiles = readdirSync(join(root, "ports")).filter((f) => f.endsWith(".ts")).map((f) => join(root, "ports", f));
  const identity = join(root, "api/src/platform/identity/port.ts");
  if (existsSync(identity)) portFiles.push(identity);
  const ports = new Map();   // name → { file, adapters: [{ name, file, kind }] }
  const texts = new Map(portFiles.map((f) => [f, code(readFileSync(f, "utf8"))]));
  for (const [f, t] of texts) for (const m of t.matchAll(/^export\s+(?:interface|type)\s+([A-Z]\w*Port)\b/gm)) ports.set(m[1], { file: rel(f), adapters: [] });
  const add = (port, adapter) => { const p = ports.get(port); if (p && !p.adapters.some((a) => a.name === adapter.name && a.file === adapter.file)) p.adapters.push(adapter); };

  const declared = (t, f, kind, fakeOk) => {
    const classes = new Set();
    for (const m of t.matchAll(/^export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)[^{]*?\bimplements\s+([^{]+)\{/gm)) {
      const isFake = /^fake/i.test(m[1]);
      if (isFake && !fakeOk) continue;
      classes.add(m[1]);
      allClasses.add(m[1]);
      for (const port of portsIn(m[2])) add(port, { name: m[1], file: rel(f), kind: isFake ? "fake" : kind });
    }
    for (const m of t.matchAll(/^export\s+(?:const|let)\s+(\w+)\s*:\s*([^=]+)=\s*(new\s+(\w+)\s*\()?/gm)) {
      if (m[4] && classes.has(m[4])) continue;   // an instance of an adapter class found above
      const isFake = /^fake/i.test(m[1]);
      if (isFake && !fakeOk) continue;
      for (const port of portsIn(m[2])) add(port, { name: m[1], file: rel(f), kind: isFake ? "fake" : kind });
    }
    fns.push({ t, f, kind, fakeOk, classes });
  };
  // Functions after every class is known: a function returning the port is an adapter (aesGcmSecretBox), unless it takes
  // that port as a parameter (useAlerts: a setter) or builds a known adapter class (identityPortFromConfig: a selector).
  const functions = ({ t, f, kind, fakeOk }) => {
    for (const m of t.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(((?:[^()]|\([^()]*\))*)\)\s*:\s*([^{]+)\{/gm)) {
      const isFake = /^fake/i.test(m[1]);
      if (isFake && !fakeOk) continue;
      const body = bodyAt(t, m.index + m[0].length);
      const builds = [...body.matchAll(/\bnew\s+(\w+)\s*\(/g)].some((b) => allClasses.has(b[1]));
      for (const port of portsIn(m[3])) if (!portsIn(m[2]).includes(port) && !builds) add(port, { name: m[1], file: rel(f), kind: isFake ? "fake" : kind });
    }
  };
  const fns = [], allClasses = new Set();
  for (const f of walk(join(root, "api/src"))) declared(code(readFileSync(f, "utf8")), f, "real", false);
  for (const f of portFiles.filter((p) => !p.includes(`${join("api", "src")}`))) {
    const t = texts.get(f), own = [...t.matchAll(/^export\s+(?:interface|type)\s+([A-Z]\w*Port)\b/gm)].map((m) => m[1]);
    declared(t, f, "real", true);
    // Fakes whose signature names their port through an alias of this file (FakeJobs = JobPort & …), or the file's one port.
    const aliases = new Map([...t.matchAll(/^export\s+type\s+(\w+)\s*(?:<[^>]*>)?\s*=\s*([^;]+);/gm)].map((m) => [m[1], m[2]]));
    for (const m of t.matchAll(/^export\s+(?:async\s+)?(function|class)\s+((?:fake|Fake)\w*)([^{]*)\{/gm)) {
      const sig = m[3], named = new Set(portsIn(sig));
      for (const [alias, body] of aliases) if (new RegExp(`\\b${alias}\\b`).test(sig)) for (const p of portsIn(body)) named.add(p);
      const mine = [...named].filter((p) => own.includes(p));
      for (const port of mine.length ? mine : own.length === 1 ? own : []) add(port, { name: m[2], file: rel(f), kind: "fake" });
    }
  }

  for (const x of fns) functions(x);

  const calls = [];   // { contract, adapter, file }
  const testDir = join(root, "tests");
  for (const name of existsSync(testDir) ? readdirSync(testDir).filter((n) => /\.(ts|cjs|mjs)$/.test(n)) : []) {
    const t = code(readFileSync(join(testDir, name), "utf8"));
    for (const m of t.matchAll(/\brunContract\s*\(\s*(\w+)\s*,\s*["'`]([\w$]+)["'`]/g)) calls.push({ contract: m[1], adapter: m[2], file: `tests/${name}` });
  }
  return { ports, calls };
}

/** The problems on the tree at `root`; empty means the check passes. */
export function problems(root = STUDIO) {
  const { ports, calls } = inventory(root), out = [];
  for (const [port, p] of ports) {
    const real = p.adapters.filter((a) => a.kind === "real"), file = contractFile(port), name = contractName(port);
    const hasFile = existsSync(join(root, file));
    if (real.length && !hasFile) { out.push(`${port} (${p.file}) has a real adapter (${real.map((a) => a.name).join(", ")}) and no contract: add ${file} exporting ${name}`); continue; }
    if (!hasFile) continue;   // no real adapter yet: the row that adds the first one adds the contract (MailPort, ArrivalPort)
    if (!new RegExp(`^export\\s+const\\s+${name}\\b`, "m").test(readFileSync(join(root, file), "utf8"))) out.push(`${file} does not export ${name}`);
    for (const a of p.adapters) if (!calls.some((c) => c.contract === name && c.adapter === a.name))
      out.push(`${port}: ${a.kind} adapter ${a.name} (${a.file}) runs no contract: add \`await runContract(${name}, "${a.name}", …)\` to its own test file`);
  }
  return out;
}

function list(root = STUDIO) {
  const { ports, calls } = inventory(root);
  for (const [port, p] of ports) {
    console.log(`${port}  (${p.file})  contract: ${existsSync(join(root, contractFile(port))) ? contractFile(port) : "none"}`);
    for (const a of p.adapters) console.log(`  ${a.kind.padEnd(4)} ${a.name}  (${a.file})  runs it in: ${calls.filter((c) => c.contract === contractName(port) && c.adapter === a.name).map((c) => c.file).join(", ") || "nothing"}`);
  }
}

// ------------------------------------------------------------------------------------------------- self-test (DW1)
function selfTest() {
  let pass = 0, fail = 0;
  const ok = (name, c, detail) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); };
  const dir = mkdtempSync(join(tmpdir(), "pf0c-guard-"));
  const put = (p, text) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text); };
  const del = (p) => rmSync(join(dir, p), { force: true });
  try {
    put("ports/widget.ts", "// a WidgetPort in a comment is not a port\nexport interface WidgetPort { spin(): Promise<void> }\nexport type FakeWidget = WidgetPort & { spins: number };\nexport function fakeWidget(): FakeWidget { return null as never; }\n");
    put("ports/mail.ts", "export interface MailPort { send(): Promise<void> }\nexport function fakeMail(): MailPort { return null as never; }\n");
    put("api/src/platform/identity/port.ts", "export interface IdentityPort { verify(t: string): Promise<unknown> }\n");
    put("api/src/widgets/real.ts", "import type { WidgetPort } from '../../../ports/widget.ts';\nexport class RealWidget implements WidgetPort, OnModuleInit {\n  async spin() {}\n}\nexport const widget: WidgetPort = new RealWidget();\n");
    put("api/src/widgets/other.ts", "export function makeWidget(url: string): WidgetPort { return null as never; }\nlet w: WidgetPort;\nexport function useWidget(next: WidgetPort): WidgetPort { const was = w; w = next; return was; }\nexport function widgetFromConfig(on: boolean): WidgetPort {\n  if (on) return new RealWidget();\n  return makeWidget(\"x\");\n}\n");
    put("tests/check_widget.ts", "await runContract(widgetPortContract, \"RealWidget\", () => 1, ok);\nawait runContract(widgetPortContract, \"makeWidget\", () => 1, ok);\nawait runContract(widgetPortContract, 'fakeWidget', () => 1, ok);\n");

    const inv = inventory(dir), w = inv.ports.get("WidgetPort");
    ok("PF-0c DW1: the guard finds the port, its real class, its real function and its fake (an alias names the port); the instance of the class, a setter taking the port and a selector building a known adapter are not adapters",
      !!w && w.adapters.map((a) => `${a.kind}:${a.name}`).sort().join() === "fake:fakeWidget,real:RealWidget,real:makeWidget" && inv.ports.has("IdentityPort") && inv.ports.has("MailPort"), w?.adapters);
    ok("PF-0c DW1 fail: a port with a real adapter and no contract fails the guard", problems(dir).some((p) => /^WidgetPort .* has a real adapter \(RealWidget, makeWidget\) and no contract: add ports\/contracts\/widget-port\.contract\.ts/.test(p)), problems(dir));
    ok("PF-0c DW1: a port with no real adapter needs no contract yet (MailPort with only its fake)", !problems(dir).some((p) => /MailPort/.test(p)), problems(dir));
    put("ports/contracts/widget-port.contract.ts", "export const widgetPortContract = defineContract(\"WidgetPort\", () => []);\n");
    ok("PF-0c DW1 pass: with the contract and every adapter (fake included) running it, the guard passes", problems(dir).length === 0, problems(dir));
    put("tests/check_widget.ts", "await runContract(widgetPortContract, \"RealWidget\", () => 1, ok);\n// await runContract(widgetPortContract, \"makeWidget\", () => 1, ok);\n");
    const missing = problems(dir);
    ok("PF-0c DW1 fail: an adapter, real or fake, whose test runs no contract fails the guard (a call in a comment does not count)", missing.length === 2 && missing.some((p) => /real adapter makeWidget/.test(p)) && missing.some((p) => /fake adapter fakeWidget/.test(p)), missing);
    put("ports/contracts/widget-port.contract.ts", "export const somethingElse = 1;\n");
    ok("PF-0c DW1 fail: a contract file that does not export <port>Contract fails the guard", problems(dir).some((p) => /does not export widgetPortContract/.test(p)), problems(dir));
    del("ports/contracts/widget-port.contract.ts");
    put("api/src/platform/identity/local.ts", "export class LocalIdentity implements IdentityPort {}\n");
    ok("PF-0c DW1 fail: the identity port (outside ports/) is a port too: its real adapter needs a contract", problems(dir).some((p) => /^IdentityPort .*LocalIdentity.*identity-port\.contract\.ts/.test(p)), problems(dir));
    ok("PF-0c DW1: contract file names are the kebab case of the port (DocumentRenderPort → document-render-port)", contractFile("DocumentRenderPort") === "ports/contracts/document-render-port.contract.ts" && contractName("SecretBoxPort") === "secretBoxPortContract");
  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log(`\n${pass} passed, ${fail} failed`);
  return fail === 0;
}

const arg = process.argv[2];
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = performance.now();
  if (arg === "--self-test") process.exit(selfTest() ? 0 : 1);
  if (arg === "--list") { list(); process.exit(0); }
  if (arg) { console.error(`check-port-contracts.mjs: unknown option ${arg} (--self-test, --list)`); process.exit(2); }
  const found = problems(), { ports } = inventory(), ms = Math.round(performance.now() - t0);
  const covered = [...ports].filter(([port]) => existsSync(join(STUDIO, contractFile(port))));
  for (const p of found) console.log(`FAIL  ${p}`);
  console.log(`port contracts: ${covered.length} ports with a contract (${covered.map(([p, v]) => `${p} ×${v.adapters.length}`).join(", ")}); ${found.length} problem(s); ${ms} ms (PF-0c DW4: under ${LIMIT_MS / 1000} s)`);
  if (ms > LIMIT_MS) { console.log(`FAIL  PF-0c DW4: the guard took ${ms} ms, over ${LIMIT_MS} ms`); process.exit(1); }
  process.exit(found.length ? 1 : 0);
}
