#!/usr/bin/env node
// Which journeys .github/workflows/walks.yml walks (P-700; A274, QA-702, QA-698). Its plan step called this rule in
// shell, walked every journey on a pull request and refused it with "journeys: at most 20" once main held more than 20.
//   * workflow_dispatch: the journeys named (ids or numbers, space-separated), empty = every j_<n>.ts; at most 20
//     (a refusal, exit 1, as before).
//   * pull_request: only the journeys whose own file, or a file it imports (relative imports, followed through), the PR
//     changes, plus each journey of an item on the body's "Completes: R1.n" line (item-proof.mjs detect and journeyOf).
//     At most 20 (tech lead, Lead 17 on #2860): past 20, only the journeys whose own file changed or that a Completes
//     line names are walked (all of them, even past 20), the rest skipped by name in a warning; the count never fails
//     the plan. The walk machinery (walk.mjs, record.ts,
//     video-size.ts, fixtures/, walks.yml, this file, check_journey_recording.ts) is proved by the two failing
//     fixtures, so a change to it walks the fixtures, not every journey that imports it.
//   * The fixtures j_0_fails and j_0_throws join every non-empty matrix (the workflow's own self-test). Zero journeys
//     and no machinery change: an empty matrix with a reason; walks.yml then skips the walk job and the check passes.
// Usage (from the repository root):
//   node <studio>/tools/walk-plan.mjs --event pull_request|workflow_dispatch --journeys <dir> [--want "j_6 9"]
//        [--changed <file of changed paths>] [--body-file <PR body>]
//   → stdout {"matrix":[{name,file,expect}],"reason":"..."}; exit 1 with the reason on a refusal.
//   node <studio>/tools/walk-plan.mjs selftest   the rules on a made-up tree (walks.yml runs it first, every run).
// Test: studio/tests/check_walk_plan.ts. No dependency (the plan job installs nothing); US$0.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join, resolve, dirname, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { detect, journeyOf } from "./item-proof.mjs";

export const CAP = 20;
const ID = /^j_([1-9]\d{0,2})$/;
const posix = (p) => p.split(sep).join("/");
const byNum = (a, b) => Number(a.slice(2)) - Number(b.slice(2));

/** Repository-relative files a journey reads through relative imports, itself included (followed through, bounded). */
export function importsOf(file, root) {
  const seen = new Set(), todo = [resolve(root, file)];
  while (todo.length && seen.size < 2000) {
    const f = todo.pop();
    if (seen.has(f) || !existsSync(f) || !statSync(f).isFile()) continue;
    seen.add(f);
    if (!/\.(m|c)?(t|j)sx?$/.test(f)) continue;
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = resolve(dirname(f), m[1]);
      const hit = [base, base.replace(/\.(m?)js$/, ".$1ts"), `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, join(base, "index.ts")].find((c) => existsSync(c) && statSync(c).isFile());
      if (hit) todo.push(hit);
    }
  }
  return new Set([...seen].map((f) => posix(relative(root, f))));
}

/** The walk machinery: proved by the failing fixtures, never a reason to walk every journey that imports it. */
export function machinery(jdir) {
  const d = posix(jdir).replace(/\/$/, ""), studio = d.replace(/\/tests\/journeys$/, "");
  return (f) => f === ".github/workflows/walks.yml" || f === `${studio}/tools/walk-plan.mjs` || f === `${studio}/tests/check_journey_recording.ts`
    || f === `${studio}/tools/item-proof.mjs` || [`${d}/walk.mjs`, `${d}/record.ts`, `${d}/video-size.ts`].includes(f) || f.startsWith(`${d}/fixtures/`);
}

/** The plan. Throws Error(reason) on a refusal. */
export function walkPlan({ event, jdir, want = "", changed = [], body = "", root = process.cwd() }) {
  const d = posix(jdir).replace(/\/$/, "");
  const all = existsSync(resolve(root, d)) ? readdirSync(resolve(root, d)).map((f) => f.replace(/\.ts$/, "")).filter((f) => ID.test(f)).sort(byNum) : [];
  let ids = [], why = [], warn = "";
  if (event === "workflow_dispatch") {
    if (want.length > 200) throw new Error("journeys: at most 200 characters");
    const words = want.split(/\s+/).filter(Boolean);
    if (!words.length) { ids = all; why.push(`every journey (${all.length})`); }
    else {
      for (const w of words) {
        const m = w.match(/^(?:j_)?([1-9]\d{0,2})$/);
        if (!m) throw new Error(`journeys: '${w}' is not j_<n> or <n>`);
        if (!all.includes(`j_${m[1]}`)) throw new Error(`journeys: no ${d}/j_${m[1]}.ts`);
        ids.push(`j_${m[1]}`);
      }
      ids = [...new Set(ids)].sort(byNum); why.push(`the journeys named: ${ids.join(" ")}`);
    }
    if (ids.length > CAP) throw new Error(`journeys: at most ${CAP} on a dispatch (${ids.length} asked; name them, e.g. "j_6 j_9")`);
  } else if (event === "pull_request") {
    const ch = new Set(changed.map((f) => f.trim()).filter(Boolean)), isMach = machinery(d), keep = new Set();
    for (const id of all) {
      if (ch.has(`${d}/${id}.ts`)) keep.add(id);
      const hit = [...importsOf(`${d}/${id}.ts`, root)].filter((f) => ch.has(f) && !isMach(f));
      if (hit.length) { ids.push(id); why.push(`${id}: the PR changes ${hit.slice(0, 3).join(", ")}${hit.length > 3 ? ` and ${hit.length - 3} more` : ""}`); }
    }
    const det = detect(body);
    for (const item of det.items) {
      const id = journeyOf(item).replace(/^tests\/journeys\/|\.ts$/g, "");
      if (!all.includes(id)) { why.push(`${item} (Completes line): no ${id}.ts on this head, nothing to walk (item-proof fails it at the merge)`); continue; }
      if (!ids.includes(id)) ids.push(id);
      keep.add(id); why.push(`${id}: Completes: ${item}`);
    }
    ids.sort(byNum);
    const mach = [...ch].filter(isMach);
    if (!ids.length && !mach.length) return { matrix: [], reason: `skipped: this PR changes no journey file and nothing a journey imports, and its body completes no R1 item with a journey (${ch.size} file(s) changed)${why.length ? `; ${why.join("; ")}` : ""}`, warn };
    if (mach.length) why.push(`the walk machinery changed (${mach.slice(0, 3).join(", ")}${mach.length > 3 ? " …" : ""}): the failing fixtures prove it`);
    if (ids.length > CAP) {
      const skipped = ids.filter((id) => !keep.has(id));
      ids = ids.filter((id) => keep.has(id));
      warn = `${ids.length + skipped.length} journeys touched (over ${CAP}): walking only the ${ids.length} whose own file changed or that a Completes line names; skipped (reached through imports only): ${skipped.join(" ")}`;
      why.push(`over ${CAP}: ${skipped.length} import-only journey(s) skipped (see the warning)`);
    }
  } else throw new Error(`event: ${event} is neither pull_request nor workflow_dispatch`);
  const matrix = ids.map((id) => ({ name: id, file: id, expect: "pass" }));
  for (const f of ["j_0_fails", "j_0_throws"]) matrix.push({ name: f, file: `${d}/fixtures/${f}.ts`, expect: "fail" });
  return { matrix, reason: `${ids.length} journey(s) and the 2 failing fixtures: ${why.join("; ")}`, warn };
}

/** The rules on a made-up tree; returns failure lines (empty: all hold). */
export function selftest() {
  const root = mkdtempSync(join(tmpdir(), "walk-plan-")), J = "s/tests/journeys", out = [];
  const put = (f, t) => { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), t); };
  try {
    put(`${J}/j_1.ts`, `import { a } from "../../lib/a.ts";\nimport { r } from "./record.ts";\n`);
    put("s/lib/a.ts", `export { b } from "./b";\nconst c = await import("./c.js");\n`); put("s/lib/b.ts", "export const b = 1;\n"); put("s/lib/c.ts", "export const c = 1;\n");
    put(`${J}/record.ts`, "export const r = 1;\n"); put(`${J}/walk.mjs`, ""); put(`${J}/fixtures/j_0_fails.ts`, "");
    put("s/lib/shared.ts", "export const s = 1;\n");
    for (let n = 2; n <= 25; n++) put(`${J}/j_${n}.ts`, `import { r } from "./record.ts";\nimport { s } from "../../lib/shared.ts";\n`);
    const names = (p) => p.matrix.map((m) => m.name).join(" "), t = (name, c, got) => { if (!c) out.push(`${name}: ${JSON.stringify(got).slice(0, 300)}`); };
    const pr = (changed, body = "") => walkPlan({ event: "pull_request", jdir: J, changed, body, root });
    const refused = (f) => { try { f(); return ""; } catch (e) { return e.message; } };
    let p = pr(["s/lib/b.ts"]);
    t("T1 a PR changing a file a journey imports (through a second file) walks that journey and the fixtures", names(p) === "j_1 j_0_fails j_0_throws", p);
    p = pr(["s/lib/c.ts"]);
    t("T1b a dynamic import(\"./c.js\") of a TypeScript file c.ts is followed", names(p) === "j_1 j_0_fails j_0_throws", p);
    const r0 = refused(() => walkPlan({ event: "workflow_dispatch", jdir: J, want: "1 ".repeat(101), root }));
    t("T9b a dispatch input over 200 characters is refused", /at most 200 characters/.test(r0), r0);
    p = pr([`${J}/j_2.ts`], "Done when: x\nCompletes: R1.3\n```\nCompletes: R1.4\n```\n");
    t("T2 a changed journey plus the Completes line's journey; a fenced Completes line is no claim", names(p) === "j_2 j_3 j_0_fails j_0_throws", p);
    p = pr(["s/README.md", "s/web/x.tsx"]);
    t("T3 nothing a journey reads changed: an empty matrix with a reason", p.matrix.length === 0 && /^skipped: /.test(p.reason), p);
    p = pr([`${J}/record.ts`, `${J}/walk.mjs`]);
    t("T4 the walk machinery changed (record.ts is imported by all 25): the fixtures only", names(p) === "j_0_fails j_0_throws" && /machinery/.test(p.reason), p);
    const many = Array.from({ length: 24 }, (_, i) => `${J}/j_${i + 2}.ts`);
    p = pr(many);
    t("T5 a PR changing 24 journeys' own files walks all 24 (own files are never skipped; the count never fails), with a warning", p.matrix.length === 26 && /over 20/.test(p.warn) && /skipped \(reached through imports only\): $/.test(p.warn), { n: p.matrix.length, warn: p.warn });
    p = pr(["s/lib/shared.ts", `${J}/j_5.ts`], "Completes: R1.7\n");
    const skip = Array.from({ length: 24 }, (_, i) => `j_${i + 2}`).filter((j) => j !== "j_5" && j !== "j_7").join(" ");
    t("T5b over 20 through a shared import (24): only the own-file journey and the Completes one walk; the 22 others are listed as skipped", names(p) === "j_5 j_7 j_0_fails j_0_throws" && p.warn.endsWith(`skipped (reached through imports only): ${skip}`) && /24 journeys touched \(over 20\): walking only the 2/.test(p.warn), p);
    p = pr(["s/lib/shared.ts"]);
    t("T5c 24 through a shared import alone: none of them walks (all skipped by name), the fixtures still do, the plan does not fail", names(p) === "j_0_fails j_0_throws" && /walking only the 0/.test(p.warn), p);
    p = pr([], "Completes: R1.99\n");
    t("T6 a Completes item with no journey file is named in the reason, nothing walked", p.matrix.length === 0 && /^skipped: /.test(p.reason) && /R1\.99 \(Completes line\): no j_99\.ts/.test(p.reason), p);
    const r1 = refused(() => walkPlan({ event: "workflow_dispatch", jdir: J, want: "", root }));
    t("T7 a dispatch of every journey (25) is refused: at most 20 on a dispatch", /at most 20/.test(r1), r1);
    p = walkPlan({ event: "workflow_dispatch", jdir: J, want: "2 j_1 j_2", root });
    t("T8 a dispatch naming journeys walks them, sorted and once each, and the fixtures", names(p) === "j_1 j_2 j_0_fails j_0_throws", p);
    const r2 = refused(() => walkPlan({ event: "workflow_dispatch", jdir: J, want: "*", root })), r3 = refused(() => walkPlan({ event: "workflow_dispatch", jdir: J, want: "j_77", root }));
    t("T9 a dispatch input that is not j_<n> or <n>, or names no file, is refused", /not j_<n>/.test(r2) && /no s\/tests\/journeys\/j_77\.ts/.test(r3), [r2, r3]);
  } finally { rmSync(root, { recursive: true, force: true }); }
  return out;
}

function main(argv) {
  const [cmd] = argv, opt = {};
  for (let i = cmd === "selftest" ? 1 : 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i] ?? "";
  if (cmd === "selftest") { const f = selftest(); for (const l of f) console.log(`FAIL  walk-plan ${l}`); console.log(f.length ? `walk-plan self-test: ${f.length} failed` : "PASS  walk-plan self-test: T1-T9 hold (with T1b, T5b, T5c, T9b)"); return f.length ? 1 : 0; }
  try {
    const p = walkPlan({ event: opt.event, jdir: opt.journeys, want: opt.want ?? "", changed: opt.changed ? readFileSync(opt.changed, "utf8").split("\n") : [], body: opt["body-file"] && existsSync(opt["body-file"]) ? readFileSync(opt["body-file"], "utf8") : "" });
    console.log(JSON.stringify(p)); return 0;
  } catch (e) { console.error(e.message); return 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
