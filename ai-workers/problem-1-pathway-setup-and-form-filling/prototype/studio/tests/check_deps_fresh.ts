// start.sh keeps the studio's packages equal to the committed lockfile (Lead 3, 25 Nov: main's demo went red at
// 9b5a93fce because #3500 added pdfjs-dist and start.sh ran npm ci only when node_modules was missing). Checks
// tools/deps-fresh.sh on scratch copies with a stand-in npm (records each call, installs nothing real), and runs the
// package line of start.sh itself on a copy whose lockfile gained a dependency. No server, no network; US$0.
// Run from prototype/:   tsx studio/tests/check_deps_fresh.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const STUDIO = join(import.meta.dirname, "..");
const TOOL = join(STUDIO, "tools", "deps-fresh.sh");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const tmp = mkdtempSync(join(tmpdir(), "deps-fresh-"));
// A stand-in npm: "npm ci" logs a line and makes node_modules (or fails when NPM_FAIL is set).
const bin = join(tmp, "bin"); mkdirSync(bin);
writeFileSync(join(bin, "npm"), `#!/usr/bin/env bash\necho "npm $*" >> "$NPM_LOG"\n[ -n "\${NPM_FAIL:-}" ] && exit 1\n[ -n "\${NPM_NO_DIR:-}" ] || mkdir -p node_modules\n`); chmodSync(join(bin, "npm"), 0o755);
let n = 0;
const copy = (lock = '{"lockfileVersion":3,"packages":{}}', engines = process.versions.node) => {
  const d = join(tmp, `s${++n}`); mkdirSync(join(d, "tools"), { recursive: true });
  copyFileSync(TOOL, join(d, "tools", "deps-fresh.sh"));
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "s", engines: { node: engines } }));
  writeFileSync(join(d, "package-lock.json"), lock); return d;
};
const run = (d: string, env: Record<string, string> = {}, cmd = ["bash", "tools/deps-fresh.sh"]) => {
  const log = join(d, "npm.log"); writeFileSync(log, "");
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: d, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NPM_LOG: log, ...env } });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), npm: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
};
const stamp = (d: string) => (existsSync(join(d, "node_modules", ".lock-sha256")) ? readFileSync(join(d, "node_modules", ".lock-sha256"), "utf8").trim() : "");

try {
  const a = copy(); let r = run(a);
  ok("D1 no node_modules: npm ci runs once and the lock stamp is written", r.code === 0 && r.npm.join() === "npm ci" && /node_modules missing/.test(r.out) && /^[0-9a-f]{64}$/.test(stamp(a)), r);
  r = run(a);
  ok("D2 node_modules installed from this lockfile: nothing runs", r.code === 0 && r.npm.length === 0 && r.out === "", r);
  writeFileSync(join(a, "package-lock.json"), '{"lockfileVersion":3,"packages":{"node_modules/pdfjs-dist":{"version":"5.4.394"}}}');
  const before = stamp(a); r = run(a);
  ok("D3 a dependency added to the lockfile (#3500's pdfjs-dist): npm ci runs and the stamp moves to the new lockfile", r.code === 0 && r.npm.join() === "npm ci" && /package-lock\.json changed/.test(r.out) && stamp(a) !== before && stamp(a) !== "", r);
  const b = copy(); mkdirSync(join(b, "node_modules")); r = run(b);
  ok("D4 node_modules from before this check (no stamp): npm ci runs once", r.code === 0 && r.npm.join() === "npm ci" && /no lock stamp/.test(r.out) && stamp(b) !== "", r);
  const c = copy(); r = run(c, { NPM_FAIL: "1" });
  ok("D5 npm ci fails: exit 1 and no stamp, so the next start installs again", r.code === 1 && r.npm.join() === "npm ci" && stamp(c) === "", r);
  r = run(c); ok("D5b the next run installs", r.code === 0 && r.npm.join() === "npm ci" && stamp(c) !== "", r);
  const g = copy(); r = run(g, { NPM_NO_DIR: "1" });
  ok("D5c a lockfile with no packages (npm ci makes no node_modules): the stamp is still written, exit 0", r.code === 0 && stamp(g) !== "", r);
  const e = copy(undefined, "99.0.0"); r = run(e);
  ok("D6 the PATH's Node is not package.json's engines major: nothing installed, exit 1", r.code === 1 && r.npm.length === 0 && /Node 99\.0\.0 needed/.test(r.out), r);

  // D7: start.sh's own package line on a copy whose lockfile gained a dependency after node_modules was installed.
  const start = readFileSync(join(STUDIO, "start.sh"), "utf8");
  const line = start.split("\n").find((l) => /npm ci|deps-fresh\.sh/.test(l) && !/^\s*#/.test(l)) ?? "";
  const f = copy(); run(f); writeFileSync(join(f, "package-lock.json"), '{"lockfileVersion":3,"packages":{"node_modules/left-pad":{"version":"1.3.0"}}}');
  writeFileSync(join(f, "line.sh"), `set -e\n${line}\n`); r = run(f, {}, ["bash", "line.sh"]);
  ok("D7 start.sh's package line installs a dependency planted in the lockfile of an installed copy (the old \"[ -d node_modules ] || npm ci\" did not)", line !== "" && r.code === 0 && r.npm.join() === "npm ci", { line, r });
  ok("D8 start.sh runs under set -e, so a refused or failed install stops it before the server starts", /^set -e$/m.test(start) && start.indexOf(line) < start.indexOf("restart-api.sh"), line);
} finally { rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
