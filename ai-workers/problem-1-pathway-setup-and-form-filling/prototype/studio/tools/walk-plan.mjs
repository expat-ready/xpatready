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
//   * push to main (ENF-733, P-733, P-728 (3)): the merged PR's journeys, walked on main's new head: each R1 item its
//     title names ("R1.29", "(R1 row 42)") or its body's "Completes:" line names, mapped as item-proof.mjs journeyOf
//     (R1.40 -> j_38), when j_<n>.ts is on main. Skipped with a reason when the PR names no item, or changes nothing the
//     app runs (no file under APP: a records-only or qa-records PR leaves main's walk as it was). At most 20. No
//     fixtures: they ran on the PR; the comment counts real journeys only. walk-report.yml posts the result.
//   * The fixtures j_0_fails and j_0_throws join every non-empty pull_request and dispatch matrix (the workflow's own
//     self-test). Zero journeys and no machinery change: an empty matrix with a reason; walks.yml then skips the walk
//     job and the check passes.
// Usage (from the repository root):
//   node <studio>/tools/walk-plan.mjs --event pull_request|workflow_dispatch|push --journeys <dir> [--want "j_6 9"]
//        [--changed <file of changed paths>] [--body-file <PR body>] [--title-file <PR title>] [--pr <n>] [--sha <s>]
//   → stdout {"matrix":[{name,file,expect[,items,via]}],"reason":"...","warn":"..."[,"pr","sha"]}; exit 1 on a refusal.
//   node <studio>/tools/walk-plan.mjs comment --plan <plan.json> --results <dir> --run-id <id> --run-url <u> --sha <s>
//        [--attempt <n>]
//   → stdout the merged PR's comment (walk-report.yml): per journey PASS (exit 0 and no FAIL step) or FAIL with its
//     PASS/FAIL/HELD step counts, from <dir>/walk-result-<journey>/walk.json; a journey with no walk.json is FAIL ("no
//     result"); a plan entry not shaped as a journey id with R1 ids is not shown (named as such). Exit 3 and nothing
//     printed when the plan walked nothing or names no PR.
//   node <studio>/tools/walk-plan.mjs selftest   the rules on a made-up tree (walks.yml runs it first, every run).
// Test: studio/tests/check_walk_plan.ts. No dependency (the plan job installs nothing); US$0.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join, resolve, dirname, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { detect, journeyOf } from "./item-proof.mjs";

export const CAP = 20;
/** What the app and its journeys run: walks.yml's pull_request paths without walks.yml itself (check_walk_plan W10). */
const PROTO = "ai-workers/problem-1-pathway-setup-and-form-filling/prototype";
export const APP = [`${PROTO}/studio/`, `${PROTO}/contracts/`, `${PROTO}/p2/`, `${PROTO}/p5/`];
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

/** The R1 items a PR title names, any kind of PR: "R1.29", "(R1 row 42)" (item-proof.mjs claim's reading). */
export function titleItems(title) {
  const t = String(title ?? ""), ids = new Set([...t.matchAll(/\bR1\.([1-9]\d{0,2})(?![\d.]*\d)/g)].map((m) => `R1.${m[1]}`));
  for (const m of t.matchAll(/\(R1 row ([1-9]\d{0,2})\)/gi)) ids.add(`R1.${m[1]}`);
  return [...ids].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
}

/** push to main: the merged PR's named items' journeys (see the header). */
function pushPlan({ d, all, title, body, changed, pr }) {
  const named = new Map(), add = (i, via) => named.set(i, named.has(i) && named.get(i) !== via ? "title and Completes" : via);
  for (const i of titleItems(title)) add(i, "title");
  for (const i of detect(body).items) add(i, "Completes");
  const who = pr ? `#${pr}` : "this push";
  if (!pr) return { matrix: [], reason: "skipped: this push to main is no PR's merge commit (a direct push): nothing to walk", warn: "" };
  if (!named.size) return { matrix: [], reason: `skipped: ${who}'s title names no R1 item and its body has no Completes line`, warn: "" };
  const ch = changed.map((f) => f.trim()).filter(Boolean), app = ch.filter((f) => APP.some((a) => f.startsWith(a)));
  const items = [...named.keys()].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  if (!app.length) return { matrix: [], reason: `skipped: ${who} names ${items.join(" ")} but changes nothing the app or a journey runs (${ch.length} file(s), none under studio/, contracts/, p2/ or p5/): main's walk is as before`, warn: "" };
  const by = new Map(), why = [];
  for (const item of items) {
    const id = journeyOf(item).replace(/^tests\/journeys\/|\.ts$/g, "");
    if (!all.includes(id)) { why.push(`${item} (${named.get(item)}): no ${id}.ts on main, nothing to walk`); continue; }
    const e = by.get(id) ?? { name: id, file: id, expect: "pass", items: [], via: [] };
    e.items.push(item); e.via.push(named.get(item)); by.set(id, e);
  }
  let matrix = [...by.values()].sort((a, b) => byNum(a.name, b.name)).map((e) => ({ ...e, items: e.items.join(" "), via: [...new Set(e.via)].join(", ") }));
  for (const e of matrix) why.push(`${e.name}: ${e.items} (${e.via})`);
  let warn = "";
  if (matrix.length > CAP) { warn = `${matrix.length} journeys named (over ${CAP}): walking the first ${CAP}; not walked: ${matrix.slice(CAP).map((e) => e.name).join(" ")}`; matrix = matrix.slice(0, CAP); }
  if (!matrix.length) return { matrix, reason: `skipped: ${who}: ${why.join("; ")}`, warn };
  return { matrix, reason: `${matrix.length} journey(s) of ${who} on main's head (no fixtures: they ran on the PR): ${why.join("; ")}`, warn };
}

/** The plan. Throws Error(reason) on a refusal. */
export function walkPlan({ event, jdir, want = "", changed = [], body = "", title = "", pr = "", sha = "", root = process.cwd() }) {
  const d = posix(jdir).replace(/\/$/, "");
  const all = existsSync(resolve(root, d)) ? readdirSync(resolve(root, d)).map((f) => f.replace(/\.ts$/, "")).filter((f) => ID.test(f)).sort(byNum) : [];
  let ids = [], why = [], warn = "";
  if (event === "push") {
    if (pr && !/^[1-9]\d{0,6}$/.test(String(pr))) throw new Error(`pr: not a PR number: ${pr}`);
    return { ...pushPlan({ d, all, title, body, changed, pr: String(pr || "") }), pr: String(pr || ""), sha: String(sha || "") };
  }
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
  } else throw new Error(`event: ${event} is not pull_request, workflow_dispatch or push`);
  const matrix = ids.map((id) => ({ name: id, file: id, expect: "pass" }));
  for (const f of ["j_0_fails", "j_0_throws"]) matrix.push({ name: f, file: `${d}/fixtures/${f}.ts`, expect: "fail" });
  return { matrix, reason: `${ids.length} journey(s) and the 2 failing fixtures: ${why.join("; ")}`, warn };
}

/** The merged PR's comment from a push plan and its walks' walk.json files (walk-report.yml). null: nothing to post. */
const VIA = /^(title|Completes|title and Completes)(, (title|Completes|title and Completes))*$/;
/** A plan entry the comment may show: walks' artifact is data, so its values must be what pushPlan writes (review m3). */
const shaped = (j) => !!j && ID.test(String(j.name)) && /^R1\.[1-9]\d{0,2}( R1\.[1-9]\d{0,2})*$/.test(String(j.items)) && VIA.test(String(j.via));
export function walkComment({ plan, results, runId, runUrl, sha, attempt = "" }) {
  if (!plan || !Array.isArray(plan.matrix) || !plan.matrix.length || !/^[1-9]\d{0,6}$/.test(String(plan.pr ?? ""))) return null;
  const bad = plan.matrix.filter((j) => !shaped(j)).length, good = plan.matrix.filter(shaped);
  if (!good.length) return null;
  const rows = good.map((j) => {
    let w = null;
    try { w = JSON.parse(readFileSync(join(results, `walk-result-${j.name}`, "walk.json"), "utf8")); } catch { w = null; }
    const num = (v) => (Number.isInteger(v) ? v : null);
    const ok = !!w && w.exit === 0 && w.fail === 0 && num(w.pass) !== null;
    return { j, w, verdict: !w ? "FAIL (no result)" : ok ? "PASS" : "FAIL", ok };
  });
  const passed = rows.filter((r) => r.ok).length, failed = rows.length - passed, cell = (v) => (Number.isInteger(v) ? String(v) : "-");
  const clean = (t) => String(t).replace(/[\r\n]+/g, " ").replace(/`/g, "'").slice(0, 240);
  const out = [
    `## Walks on merge (ENF-733, P-733): ${passed} PASS, ${failed} FAIL of ${rows.length} journey${rows.length === 1 ? "" : "s"}`,
    "",
    `Walked on main \`${String(sha).slice(0, 9)}\` (this PR's merge commit) by walks run [${runId}](${runUrl})${/^[1-9]\d{0,3}$/.test(String(attempt)) ? `, attempt ${attempt}` : ""}.`,
    "",
    "| Journey | Item (named by) | Verdict | PASS | FAIL | HELD | Exit | Seconds |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map(({ j, w, verdict }) => `| ${j.name} | ${j.items ?? "-"} (${j.via ?? "-"}) | ${verdict} | ${cell(w?.pass)} | ${cell(w?.fail)} | ${cell(w?.held)} | ${cell(w?.exit)} | ${cell(w?.seconds)} |`),
  ];
  const lines = rows.flatMap(({ j, w }) => (Array.isArray(w?.failed) ? w.failed.slice(0, 5).map((l) => `${j.name}: ${clean(l)}`) : []));
  const none = rows.filter((r) => !r.w).map((r) => r.j.name);
  if (lines.length) out.push("", "First failing steps (up to 5 a journey):", "```", ...lines, "```");
  if (none.length) out.push("", `No walk.json for ${none.join(" ")}: the walk ended before its verdict (see the run).`);
  if (plan.warn) out.push("", `Note: ${clean(plan.warn)}`);
  if (bad) out.push("", `${bad} plan entr${bad === 1 ? "y" : "ies"} not shown: not a journey id with R1 items (see the run).`);
  out.push("", `Recordings: the run's artifacts walk-<journey>-${sha} (video, trace, a screenshot per step; kept 30 days). This is the journey walk only; an item on a Completes line also gets item-proof's verdict (pack, suites, journey). qa reads this comment instead of waiting for a dispatch.`);
  return out.join("\n") + "\n";
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
    // ENF-733: push to main, the merged PR's named items (title or Completes), only when it changes what the app runs.
    const app = `${APP[0]}api/src/x.ts`, push = (title, body, changed, pr = "7") => walkPlan({ event: "push", jdir: J, title, body, changed, pr, sha: "a".repeat(40), root });
    p = push("runtime: R1.3 — part 2 (R1 row 5); not R1.4.2", "", [app]);
    t("T10 a merged PR whose title names R1.3 and (R1 row 5) walks j_3 and j_5 on main, no fixtures; R1.4.2 is no item", names(p) === "j_3 j_5" && p.matrix[0].items === "R1.3" && p.matrix[0].via === "title" && p.pr === "7", p);
    p = push("screens: R1.2 x", "Completes: R1.2, R1.6\n", [app]);
    t("T11 title and Completes: each journey once, named by both or by Completes", names(p) === "j_2 j_6" && p.matrix[0].via === "title and Completes" && p.matrix[1].via === "Completes", p);
    p = push("qa: R1.3 re-run on main", "", ["ai-workers/problem-1-pathway-setup-and-form-filling/product/qa/x.md"]);
    t("T12 a PR naming R1.3 that changes nothing the app runs (records, qa records) walks nothing, with a reason", p.matrix.length === 0 && /changes nothing the app or a journey runs/.test(p.reason), p);
    const p13 = [push("tooling: no item", "", [app]), push("runtime: R1.99", "", [app]), push("runtime: R1.3", "", [app], "")];
    t("T13 no item named, an item with no journey on main, or a push that merged no PR: nothing walked, each with its reason", p13.every((q) => q.matrix.length === 0) && /names no R1 item/.test(p13[0].reason) && /R1\.99 \(title\): no j_99\.ts on main/.test(p13[1].reason) && /no PR's merge commit/.test(p13[2].reason), p13);
    const rdir = join(root, "results"); put("results/walk-result-j_3/walk.json", JSON.stringify({ exit: 0, pass: 9, fail: 0, held: 1, seconds: 80, failed: [] }));
    put("results/walk-result-j_5/walk.json", JSON.stringify({ exit: 1, pass: 4, fail: 2, held: 0, seconds: 90, failed: ["FAIL W2 the `total` is 0\nmore"] }));
    const plan14 = push("runtime: R1.3, R1.5 and R1.6", "", [app]), c = walkComment({ plan: plan14, results: rdir, runId: "123", runUrl: "https://x/runs/123", sha: "b".repeat(40) }) ?? "";
    t("T14 the comment: 1 PASS 2 FAIL of 3, the run id and link, each journey's step counts, a missing walk.json is FAIL, failing steps fenced",
      /^## Walks on merge \(ENF-733, P-733\): 1 PASS, 2 FAIL of 3 journeys\n/.test(c) && c.includes("run [123](https://x/runs/123)") && c.includes("| j_3 | R1.3 (title) | PASS | 9 | 0 | 1 | 0 | 80 |")
      && c.includes("| j_5 | R1.5 (title) | FAIL | 4 | 2 | 0 | 1 | 90 |") && c.includes("| j_6 | R1.6 (title) | FAIL (no result) |") && c.includes("```\nj_5: FAIL W2 the 'total' is 0 more\n```"), c);
    t("T15 no comment for a plan that walked nothing or names no PR", walkComment({ plan: p13[0], results: rdir, runId: "1", runUrl: "u", sha: "s" }) === null && walkComment({ plan: { ...plan14, pr: "" }, results: rdir, runId: "1", runUrl: "u", sha: "s" }) === null, "");
    put("results/walk-result-j_6/walk.json", JSON.stringify({ exit: 0, pass: 7, fail: 2, held: 0, seconds: 50, failed: [] }));
    const c16 = walkComment({ plan: plan14, results: rdir, runId: "9", runUrl: "u", sha: "s", attempt: "2" }) ?? "";
    t("T16 exit 0 with FAIL steps is FAIL, never PASS (item-proof's review m4); the attempt is named", c16.includes("| j_6 | R1.6 (title) | FAIL | 7 | 2 |") && /run \[9\]\(u\), attempt 2\./.test(c16), c16);
    const forged = { ...plan14, matrix: [{ name: "../../etc", file: "x", expect: "pass", items: "R1.3", via: "title" }, { name: "j_3", file: "j_3", expect: "pass", items: "R1.3 <img>", via: "title" }, { name: "j_5", file: "j_5", expect: "pass", items: "R1.5", via: "@someone" }, plan14.matrix[0]] };
    const c17 = walkComment({ plan: forged, results: rdir, runId: "9", runUrl: "u", sha: "s" }) ?? "";
    t("T17 plan entries not shaped as a journey id, R1 ids and a fixed \"named by\" are not shown, only counted", /: 1 PASS, 0 FAIL of 1 journey\n/.test(c17) && c17.includes("3 plan entries not shown") && !/etc|<img>|@someone/.test(c17), c17);
    for (let n = 1; n <= 25; n++) put(`${J}/j_${n}.ts`, "");
    const p18 = push(`runtime: ${Array.from({ length: 25 }, (_, i) => `R1.${i + 1}`).join(", ")}`, "", [app]);
    t("T18 a merged PR naming 25 items walks the first 20 and warns naming the rest", p18.matrix.length === 20 && /25 journeys named \(over 20\): walking the first 20; not walked: j_21 j_22 j_23 j_24 j_25$/.test(p18.warn), { n: p18.matrix.length, warn: p18.warn });
  } finally { rmSync(root, { recursive: true, force: true }); }
  return out;
}

function main(argv) {
  const [cmd] = argv, opt = {};
  for (let i = cmd === "selftest" || cmd === "comment" ? 1 : 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i] ?? "";
  if (cmd === "selftest") { const f = selftest(); for (const l of f) console.log(`FAIL  walk-plan ${l}`); console.log(f.length ? `walk-plan self-test: ${f.length} failed` : "PASS  walk-plan self-test: T1-T18 hold (with T1b, T5b, T5c, T9b)"); return f.length ? 1 : 0; }
  const file = (k) => (opt[k] && existsSync(opt[k]) ? readFileSync(opt[k], "utf8") : "");
  if (cmd === "comment") {
    let plan = null; try { plan = JSON.parse(file("plan")); } catch { plan = null; }
    const c = walkComment({ plan, results: opt.results ?? "", runId: opt["run-id"] ?? "", runUrl: opt["run-url"] ?? "", sha: opt.sha ?? "", attempt: opt.attempt ?? "" });
    if (c === null) { console.error("nothing to post: the plan walked nothing or names no PR"); return 3; }
    process.stdout.write(c); return 0;
  }
  try {
    const p = walkPlan({ event: opt.event, jdir: opt.journeys, want: opt.want ?? "", changed: opt.changed ? readFileSync(opt.changed, "utf8").split("\n") : [], body: file("body-file"), title: file("title-file").trim(), pr: opt.pr ?? "", sha: opt.sha ?? "" });
    console.log(JSON.stringify(p)); return 0;
  } catch (e) { console.error(e.message); return 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
