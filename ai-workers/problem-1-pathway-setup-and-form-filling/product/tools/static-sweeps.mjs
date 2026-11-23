#!/usr/bin/env node
// Static sweeps before the label (ENF-782a part 2; founder P-782 (2), 21 Nov: "a gate against the top measured cause of
// today's approved-then-dequeued PRs"; P-502 root cause first). Measured (merge-queue-causes.py, batches of 20-21 Nov):
// the suite that broke the most merge batches is check_aud_values.ts, a sweep that reads every audit write in api/src
// and starts nothing (no server, browser, database or process): 4 batches broken by a member's own code (#2527 run
// 44739838082, #2478 run 44811990310, #2624 run 44819823422, #1959 run 44868478755, the last one the source of the 10:55
// IST wave of 21 Nov) and 7 more failed by cascade. Since P-651 (2) a builder's PR runs no suite, so a sweep that takes
// seconds was first run in the batch, after the label.
// This runs, on the PR merged onto today's main (ci.yml job "fast", after tools/pr-base.sh), every studio suite that is
//   * tests/check_*.ts that starts nothing (ci-memory.mjs startsSomething, the one rule; imported, not copied), and
//   * a sweep of the source tree: its text calls readdirSync and names api/src or web/src (or a folder "src").
// The list is found by that rule each run, never kept by hand. A suite that fails is run again on the base (main as the
// merge saw it, --base, in a git worktree): failing there too, it is main's failure, not this PR's: a warning, never a
// failure (a red main must not hold every label). Failing only with the PR: exit 1, the suite and its FAIL lines named.
//   node product/tools/static-sweeps.mjs --list                 the suites the rule picks
//   node product/tools/static-sweeps.mjs [--base <commit>]      run them (exit 1 on a failure new with this change)
//   node product/tools/static-sweeps.mjs --self-test            the rule and the base comparison on fixtures
// Env (tests): SWEEPS_STUDIO (studio folder), SWEEPS_TSX (tsx command). US$0, no network, no model call.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startsSomething } from "./ci-memory.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO = resolve(process.env.SWEEPS_STUDIO || join(HERE, "..", "..", "prototype", "studio"));
const TIMEOUT_MS = 180_000;
const SWEEP = /readdirSync/, TREE = /\b(api|web)\/src\b|["'`]src["'`]/;

/** The suites the rule picks in a studio folder. */
export function pick(studio = STUDIO) {
  const d = join(studio, "tests");
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((n) => /^check_[^/]+\.ts$/.test(n)).sort().filter((n) => {
    const t = readFileSync(join(d, n), "utf8");
    return !startsSomething(n, t) && SWEEP.test(t) && TREE.test(t);
  });
}

/** One suite's run in a studio folder: { exit, fails (its FAIL lines), tail }. */
function run(studio, name) {
  const tsx = process.env.SWEEPS_TSX ? process.env.SWEEPS_TSX.split(" ") : [join(studio, "node_modules", ".bin", "tsx")];
  const cfg = join(studio, "api", "tsconfig.json");
  const r = spawnSync(tsx[0], [...tsx.slice(1), ...(existsSync(cfg) ? ["--tsconfig", cfg] : []), join("tests", name)],
    { cwd: studio, encoding: "utf8", timeout: TIMEOUT_MS, env: { ...process.env, NO_COLOR: "1" } });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? `\n${r.error.message}` : ""}`;
  return { exit: r.status ?? (r.error ? 124 : 1), fails: out.split("\n").filter((l) => l.startsWith("FAIL")), tail: out.trim().split("\n").slice(-6) };
}

/** node_modules folders of a checkout, not nested in another one (relative paths). */
function modulesDirs(top, rel = "", depth = 0, out = []) {
  if (depth > 6) return out;
  let es; try { es = readdirSync(join(top, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    const r = rel ? join(rel, e.name) : e.name;
    if (e.name === "node_modules" && (e.isDirectory() || e.isSymbolicLink())) out.push(r);   // a linked one counts too
    else if (e.isDirectory() && e.name !== ".git") modulesDirs(top, r, depth + 1, out);
  }
  return out;
}

/** The same suite on the base commit, in a worktree beside the repository, sharing the studio's node_modules. */
function onBase(base, name) {
  const top = execFileSync("git", ["-C", STUDIO, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const rel = relative(top, STUDIO), w = mkdtempSync(join(tmpdir(), "sweep-base-"));
  try {
    execFileSync("git", ["-C", top, "worktree", "add", "--detach", "--force", w, base], { stdio: "ignore" });
    // every node_modules of the checkout (studio, prototype/p2, the root ...), linked at the same place (a sweep may import any)
    for (const d of new Set(modulesDirs(top))) {
      try { if (existsSync(dirname(join(w, d)))) symlinkSync(join(top, d), join(w, d)); } catch { /* already there (tracked or linked) */ }
    }
    if (!existsSync(join(w, rel, "tests", name))) return { exit: 0, fails: [], tail: ["(not on the base: new with this change)"] };
    return run(join(w, rel), name);
  } catch (e) {
    return { exit: 125, fails: [], tail: [`the base could not be run: ${String(e?.message ?? e).split("\n")[0]}`] };   // no verdict: fails closed
  } finally {
    spawnSync("git", ["-C", top, "worktree", "remove", "--force", w], { stdio: "ignore" });
  }
}

export function main(argv, log = console.log) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const names = pick();
  if (argv.includes("--list")) { names.forEach((n) => log(n)); return 0; }
  const base = opt("--base");
  let bad = 0;
  log(`static sweeps (start nothing, read the source tree): ${names.length}`);
  for (const n of names) {
    const t0 = Date.now(), r = run(STUDIO, n), s = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.exit === 0) { log(`PASS  ${n} (${s} s)`); continue; }
    // main's failure only when the base gives the same FAIL lines: a base that crashed (no verdict) or a FAIL line new
    // with this change counts against the change (fails closed).
    const b = base ? onBase(base, n) : null;
    const fresh = b ? r.fails.filter((l) => !b.fails.includes(l)) : [];
    if (b && b.exit !== 0 && b.fails.length && r.fails.length && !fresh.length) {
      log(`::warning title=static sweep ${n}::fails on main too, the same FAIL lines (base ${base.slice(0, 12)}): not this change's; ${b.fails[0].slice(0, 300)}`);
      continue;
    }
    bad++;
    const why = !b ? "" : b.exit === 0 ? `: passes on main (base ${base.slice(0, 12)}), fails with this change`
      : !b.fails.length ? `: main (base ${base.slice(0, 12)}) gave no verdict (${(b.tail.at(-1) ?? "").slice(0, 120)}), so it counts against this change`
      : `: ${fresh.length || "its"} FAIL line(s) new with this change (main fails it too, base ${base.slice(0, 12)})`;
    log(`FAIL  ${n} (exit ${r.exit}, ${s} s)${why}`);
    for (const l of (fresh.length ? fresh : r.fails.length ? r.fails : r.tail).slice(0, 8)) log(`        ${l.slice(0, 400)}`);
  }
  if (bad) log(`::error title=static sweeps::${bad} sweep(s) fail with this change. They would fail its merge batch (they ran only there since P-651 (2)); fix before the label.`);
  return bad ? 1 : 0;
}

function selfTest() {
  let fail = 0; const ok = (name, c) => { console.log(`${c ? "PASS" : "FAIL"}  ${name}`); if (!c) fail++; };
  const R = mkdtempSync(join(tmpdir(), "sweeps-st-")), S = join(R, "studio"), T = join(S, "tests");
  mkdirSync(T, { recursive: true });
  const sweep = (bad) => `import { readdirSync } from "node:fs";\nconst files = readdirSync("api/src");\n${bad ? 'console.log("FAIL  sweep: x.ts:1 (no before)"); process.exit(1);' : 'console.log("PASS  sweep");'}\n`;
  mkdirSync(join(S, "api", "src"), { recursive: true }); writeFileSync(join(S, "api", "src", "x.ts"), "export {};\n");
  writeFileSync(join(T, "check_new_break.ts"), sweep(false));                      // passes on the base, fails after
  writeFileSync(join(T, "check_main_red.ts"), sweep(true));                        // fails on the base already
  writeFileSync(join(T, "check_green.ts"), sweep(false));
  writeFileSync(join(T, "check_more_red.ts"), sweep(true));                        // red on main; the change adds a FAIL line
  writeFileSync(join(T, "check_base_crash.ts"), `import { readdirSync } from "node:fs"; readdirSync("api/src"); throw new Error("no package");\n`);
  writeFileSync(join(T, "check_server.ts"), `import { readdirSync } from "node:fs"; readdirSync("api/src"); fetch("http://localhost:1"); process.exit(1);\n`);
  writeFileSync(join(T, "check_no_tree.ts"), `process.exit(1);\n`);
  writeFileSync(join(T, "check_browser.cjs"), `require("fs").readdirSync("web/src"); process.exit(1);\n`);
  const g = (...a) => execFileSync("git", ["-C", R, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], { encoding: "utf8" }).trim();
  g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "base");
  const base = g("rev-parse", "HEAD");
  writeFileSync(join(T, "check_new_break.ts"), sweep(true));
  writeFileSync(join(T, "check_more_red.ts"), sweep(true).replace("process.exit(1);", 'console.log("FAIL  sweep: y.ts:2 (no after)"); process.exit(1);'));
  writeFileSync(join(T, "check_base_crash.ts"), sweep(true)); g("commit", "-qam", "the change");
  process.env.SWEEPS_STUDIO = S;
  // the module's STUDIO was fixed at import, so run a child with the fixture's env
  const child = (args) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { encoding: "utf8", env: { ...process.env, SWEEPS_STUDIO: S, SWEEPS_TSX: process.env.SWEEPS_TSX || join(STUDIO, "node_modules", ".bin", "tsx") } });
  const l = child(["--list"]);
  ok("the rule picks static tree sweeps only", l.stdout.trim().split("\n").join(" ") === "check_base_crash.ts check_green.ts check_main_red.ts check_more_red.ts check_new_break.ts");
  ok("...never a suite that starts something (localhost), a .cjs browser suite, or one that reads no tree", !/server|browser|no_tree/.test(l.stdout));
  const r = child(["--base", base]);
  ok("a sweep failing only with the change fails the run (exit 1) and is named with its FAIL line", r.status === 1 && /FAIL  check_new_break\.ts .*passes on main/.test(r.stdout) && /FAIL  sweep: x\.ts:1 \(no before\)/.test(r.stdout));
  ok("a sweep failing on main too, the same FAIL lines, is a warning, not a failure", /::warning title=static sweep check_main_red\.ts::fails on main too/.test(r.stdout) && !/FAIL  check_main_red/.test(r.stdout));
  ok("a sweep red on main that gains a FAIL line with the change fails, naming the new line", /FAIL  check_more_red\.ts .*new with this change/.test(r.stdout) && /FAIL  sweep: y\.ts:2 \(no after\)/.test(r.stdout));
  ok("a base that gives no verdict (a crash) counts against the change (fails closed)", /FAIL  check_base_crash\.ts .*gave no verdict/.test(r.stdout));
  ok("a green sweep passes", /PASS  check_green\.ts/.test(r.stdout));
  writeFileSync(join(T, "check_new_break.ts"), sweep(false)); writeFileSync(join(T, "check_more_red.ts"), sweep(true));
  writeFileSync(join(T, "check_base_crash.ts"), sweep(false)); g("commit", "-qam", "fixed");
  const f = child(["--base", base]);
  ok("with the break fixed, only main's own red is left: exit 0", f.status === 0 && /check_main_red/.test(f.stdout));
  ok("the base worktree is removed after the run", !g("worktree", "list").includes("sweep-base-"));
  const ci = readFileSync(join(HERE, "..", "..", "..", "..", ".github", "workflows", "ci.yml"), "utf8");
  ok("ci.yml's job fast runs it on a PR against the test merge's base (HEAD^1)", /static-sweeps\.mjs" --base "\$\(git rev-parse HEAD\^1\)"/.test(ci));
  console.log(fail ? `${fail} FAILED` : "all passed"); return fail ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(process.argv.includes("--self-test") ? selfTest() : main(process.argv.slice(2)));
}
