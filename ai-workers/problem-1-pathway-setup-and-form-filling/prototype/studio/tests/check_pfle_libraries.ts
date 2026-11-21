// PF-Le (P-630, P-576 (4); gate entries 15 and 16 in product/design/tech-gate-platform-front-office-2026-11-14.md):
// the message editor's libraries enter package.json and the lockfile exactly, and stay out of the browser build.
// (1) package.json pins @react-email/editor 1.7.18, react-email 6.11.6 and every @tiptap/* package the editor's own
//     package.json names, at 3.32.2, all exact. (2) The lockfile holds no @tiptap/* below 3.30.5 (GHSA-j95f-988m-3j2f,
//     GHSA-cp6q-959q-f8rh) and every @tiptap/* at 3.32.2. (3) The web build (built here with source maps into a temporary
//     folder) bundles no module of react-email's preview CLI — socket.io / engine.io, esbuild, chokidar / readdirp,
//     @babel, prompts — read from the maps' `sources`, with a text scan as a second net. (4) Until PF-19s,
//     PF-19c and PF-13 part 1 land, no code imports the packages (this check's own list of allowed importers is empty;
//     the row that first imports one adds its file here).
// Builds the web app with vite into a temporary folder (about 2 s); no server, no database, no network.
//   tsx studio/tests/check_pfle_libraries.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  PF-Le: ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d)}` : ""}`); };
const ROOT = join(import.meta.dirname, "..");
const json = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

// (1) exact versions in package.json
const pkg = json("package.json");
const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
ok("@react-email/editor is 1.7.18 exactly", deps["@react-email/editor"] === "1.7.18", deps["@react-email/editor"]);
ok("react-email is 6.11.6 exactly", deps["react-email"] === "6.11.6", deps["react-email"]);
const editorPkg = json("node_modules/@react-email/editor/package.json");
ok("the installed editor is 1.7.18", editorPkg.version === "1.7.18", editorPkg.version);
const needed = Object.keys(editorPkg.dependencies ?? {}).filter((k) => k.startsWith("@tiptap/"));
ok("the editor names @tiptap/* packages (the list below is not empty)", needed.length > 0);
const missing = needed.filter((k) => deps[k] !== "3.32.2");
ok(`every @tiptap/* package the editor needs (${needed.length}) is in package.json at 3.32.2 exactly`, missing.length === 0, missing.map((k) => `${k}=${deps[k]}`));
ok("@tiptap/html (PF-19c's server renderer) is in package.json at 3.32.2", deps["@tiptap/html"] === "3.32.2", deps["@tiptap/html"]);
const tiptapInPkg = Object.entries(deps).filter(([k]) => k.startsWith("@tiptap/"));
ok("no @tiptap/* in package.json at a range or another version", tiptapInPkg.every(([, v]) => v === "3.32.2"), tiptapInPkg.filter(([, v]) => v !== "3.32.2"));

// (2) the lockfile
const below = (v: string, min: number[]) => { const p = v.split(/[.-]/).slice(0, 3).map(Number); for (let i = 0; i < 3; i++) if (p[i] !== min[i]) return p[i] < min[i]; return false; };
const lock = json("package-lock.json");
const tiptapLocked = Object.entries(lock.packages as Record<string, { version: string }>).filter(([k]) => /(^|\/)node_modules\/@tiptap\//.test(k));
ok("the lockfile holds @tiptap/* packages", tiptapLocked.length >= needed.length, tiptapLocked.length);
ok("no @tiptap/* in the lockfile below 3.30.5", tiptapLocked.every(([, v]) => !below(v.version, [3, 30, 5])), tiptapLocked.filter(([, v]) => below(v.version, [3, 30, 5])).map(([k, v]) => `${k}@${v.version}`));
ok("every @tiptap/* in the lockfile is 3.32.2 (one version)", tiptapLocked.every(([, v]) => v.version === "3.32.2"), tiptapLocked.filter(([, v]) => v.version !== "3.32.2").map(([k, v]) => `${k}@${v.version}`));
ok("the self-test of the version compare holds (3.30.4 < 3.30.5, 3.32.2 not)", below("3.30.4", [3, 30, 5]) && !below("3.32.2", [3, 30, 5]) && !below("3.30.5", [3, 30, 5]));

// (3) the browser build carries none of react-email's CLI code. Read from the build's source maps, not from the
// minified text: a module's code can be bundled with no tell-tale string in it (chokidar, engine.io-parser and
// socket.io-parser build that way; reviewer Major 1), but every bundled module is named in its chunk's map `sources`.
// The text markers stay as a second net for code without a map.
const CLI_MODULE = /(^|\/)node_modules\/(socket\.io[^/]*|engine\.io[^/]*|@socket\.io\/[^/]+|esbuild|@esbuild\/[^/]+|chokidar|readdirp|@babel\/[^/]+|prompts)\//;
const MARKERS: Array<[string, RegExp]> = [
  ["socket.io", /socket\.io|engine\.io/],
  ["esbuild", /esbuild/],
  ["chokidar", /chokidar/],
  ["@babel", /@babel\/|babel-plugin|babelHelpers/],
];
const scan = (text: string) => MARKERS.filter(([, re]) => re.test(text)).map(([n]) => n);
const cliSources = (sources: string[]) => sources.filter((s) => CLI_MODULE.test(s.replace(/\\/g, "/")));
ok("the source-map test names each CLI module in planted map sources (it can fail)", cliSources([
  "../../node_modules/chokidar/index.js", "../../node_modules/engine.io-parser/build/esm/index.js", "../../node_modules/socket.io-parser/build/esm/index.js",
  "../../node_modules/socket.io/dist/index.js", "../../node_modules/esbuild/lib/main.js", "../../node_modules/@babel/parser/lib/index.js",
  "../../node_modules/prompts/index.js", "../../node_modules/readdirp/index.js",
]).length === 8 && cliSources(["../../node_modules/react/index.js", "../src/main.tsx", "../../node_modules/@tiptap/core/dist/index.js"]).length === 0);
ok("the text scanner finds each marker in a planted sample (it can fail)", scan('require("socket.io-client");esbuild;chokidar.watch();"@babel/runtime"').length === MARKERS.length);
const out = mkdtempSync(join(tmpdir(), "pfle-web-"));
try {
  execFileSync(join(ROOT, "node_modules/.bin/vite"), ["build", "--config", "web/vite.config.ts", "--outDir", out, "--emptyOutDir", "--sourcemap", "--logLevel", "error"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(out);
  const code = files.filter((f) => /\.(m?js|css|html)$/.test(f));
  const js = code.filter((f) => /\.m?js$/.test(f));
  ok("the web build produced JavaScript", js.length > 0, files.map((f) => relative(out, f)));
  const maps = files.filter((f) => f.endsWith(".js.map"));
  const unmapped = js.filter((f) => !maps.includes(`${f}.map`));
  ok("every JavaScript file of the build has a source map (so the map test sees every module)", unmapped.length === 0, unmapped.map((f) => relative(out, f)));
  const sources = maps.flatMap((m) => (JSON.parse(readFileSync(m, "utf8")).sources ?? []) as string[]);
  ok("the source maps name the app's own modules (the map test reads real maps)", sources.some((s) => s.endsWith("web/src/main.tsx")) && sources.some((s) => s.includes("node_modules/react-dom/")), sources.length);
  const bundled = [...new Set(cliSources(sources))];
  ok("the web build bundles no module of socket.io / engine.io, esbuild, chokidar / readdirp, @babel or prompts (source maps)", bundled.length === 0, bundled);
  const hits = code.flatMap((f) => scan(readFileSync(f, "utf8")).map((m) => `${relative(out, f)}: ${m}`));
  ok("the web build's output text contains no socket.io, esbuild, chokidar or @babel marker", hits.length === 0, hits);
} finally { rmSync(out, { recursive: true, force: true }); }

// (4) no code uses the packages yet
const ALLOWED_IMPORTERS: string[] = ["api/src/platform/messages/layout/email-layout.ts"]; // the row that first imports a package adds its file here (PF-19s, PF-19c; PF-13 part 1a: the email layout, server only)
const IMPORT = /(from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'`](@react-email\/[^"'`]+|react-email(\/[^"'`]*)?|@tiptap\/[^"'`]+)["'`]/;
const SELF = "tests/check_pfle_libraries.ts";
// Every code folder of the studio (reviewer Minor 3), plus the prototype's shared contracts/ that the web app imports.
const SRC = ["web", "api", "ports", "engine", "contracts", "tools", "tests", "deploy", "prisma", "acceptance", "evidence", "samples", "../contracts"];
const SKIP_DIR = new Set(["node_modules", "dist", "var", ".git"]);
const users: string[] = [];
const walkSrc = (d: string) => {
  let entries: string[] = [];
  try { entries = readdirSync(join(ROOT, d)); } catch { return; }
  for (const f of entries) {
    const p = join(d, f);
    if (SKIP_DIR.has(f)) continue;
    if (statSync(join(ROOT, p)).isDirectory()) walkSrc(p);
    else if (/\.([cm]?[jt]sx?)$/.test(f) && p !== SELF && IMPORT.test(readFileSync(join(ROOT, p), "utf8")) && !ALLOWED_IMPORTERS.includes(p)) users.push(p);
  }
};
SRC.forEach(walkSrc);
ok("the import pattern matches planted imports (it can fail)", IMPORT.test('import { EmailEditor } from "@react-email/editor";') && IMPORT.test("import { Html } from 'react-email';") && IMPORT.test('await import("@tiptap/html")') && IMPORT.test("require(`@tiptap/core`)") && IMPORT.test('export { render } from "react-email";') && !IMPORT.test('import x from "react-email-like";'));
ok(`no code in ${SRC.join(", ")} imports @react-email/*, react-email or @tiptap/* outside the allowed list`, users.length === 0, users);

console.log(`\nPF-Le: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
