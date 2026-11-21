#!/usr/bin/env node
// Automatic proof at an item's last merge (P-728 (3), P-729 (1), founder 19 Nov): when a PR whose body has a line
// "Completes: R1.77" merges to main, .github/workflows/item-proof.yml runs that Release 1 item's pack and its journey on
// GitHub's runners and posts one verdict. This file holds every rule the workflow uses, so one test checks them
// (tests/check_item_proof.ts). It never edits qa/CAPABILITIES.md and never marks Works: the verdict is the machine half
// (P-339's green pack on main's head on GitHub's runners, with the run id); qa reads it and walks the journey (gate A).
//   detect  [--body-file f]   the items on "Completes:" lines of a PR body (stdin by default) as JSON {items, bad}; exit 1
//           when a "Completes:" line cannot be read (pr-rules.yml: the convention is checked before the merge).
//   plan    <R1.n> [--caps f]  what proves the item, from its row in qa/CAPABILITIES.md: the acceptance packs of the C ids
//           in its "Case side" and "Done when" cells (works-set.mjs --run, holds in qa/REGRESSION-HELD.md kept), the
//           studio/tests suites its "Done when" names (run-suites.sh --only), and its journey tests/journeys/j_<n>.ts
//           (or the J-row SHARED_JOURNEY names, e.g. R1.40 -> j_38.ts).
//   verdict --item R1.n --plan f --results f --sha s --pr n --run-id i --run-url u [--artifact-url u] [--repo o/r]
//           one verdict JSON (results: one JSON line a run, {kind, name, exit}); PASS only when the journey and every
//           planned run passed; a missing journey, a missing pack or a run with no result line is FAIL (P-405).
//   pack-line <C> <exit> <log>  one pack's result line; held or fixture only is "not tested" (P-405), never a pass.
//   comment --dir d [--saved s] [--items "R1.n ..."]  the one PR comment for every verdict in d (an item with none is named).   page --dir d  writes d/README.md, the
//           founder's page: each proven journey with its video link, newest verdict per item, then the latest FAILs.
//   scan    <dir>   exit 1 when a key or secret value appears in what would be uploaded (text files, and the trace zips'
//           contents through unzip); the video and screenshots are pictures of Sample data, covered by the trace's
//           DOM snapshots of the same pages. Names the file and the kind found, never the value.
//   gate    <verdict.json>   the prove job's last step (A274): exit 1 when the verdict is not PASS, when no pack, suite
//           or journey ran (no exit recorded), or when the file is missing or torn; prints why, for the job summary.
//   claim   --title t [--strict on]  (body on stdin) a runtime/screens PR whose title names an R1 row ("R1.4", "(R1 row
//           42)") and whose body has no "Completes:" line prints MISSING: "Completes: R1.n" as a warning; exit 0, exit 1
//           only with --strict on (pr-rules.yml; the Lead turns it on, A274).
// No dependency (pr-rules runs detect before any npm install); US$0, no model call.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const S = resolve(HERE, ".."), P = resolve(S, "../../product"), CAPS = join(P, "qa/CAPABILITIES.md");
const ITEM = /^R1\.([1-9]\d{0,2})$/;
/** An item proven by another row's journey (one J-row walks two map rows), never a copy of the file: R1.40 calendar
 *  invite files is walked by J-38 with R1.38 (tech lead, 20 Nov, QA-570; qa/reports/2026-11-20-r140-qa11.md). */
export const SHARED_JOURNEY = { "R1.40": 38 };
export const journeyOf = (item) => `tests/journeys/j_${Object.hasOwn(SHARED_JOURNEY, item) ? SHARED_JOURNEY[item] : String(item).slice(3)}.ts`;

/** The R1 items a PR body completes. A "Completes:" line (optionally a list item, a quote or bold) holds R1 ids only,
 *  separated by commas, spaces or "and"; anything else on it makes the line unreadable (bad), never a silent guess.
 *  Lines inside ``` fences are examples, not claims. */
export function detect(body) {
  const items = new Set(), bad = [];
  let fence = false;
  for (const raw of String(body ?? "").split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) { fence = !fence; continue; }
    if (fence) continue;
    const m = raw.match(/^[\s>*-]*(?:\*\*|__)?Completes(?:\*\*|__)?\s*:(?:\*\*|__)?\s*(.*)$/);
    if (!m) continue;
    const toks = m[1].replace(/[.;]\s*$/, "").split(/\s*,\s*|\s+and\s+|\s+/).filter(Boolean);
    if (!toks.length || !toks.every((t) => ITEM.test(t))) { bad.push(raw.trim().slice(0, 160)); continue; }
    toks.forEach((t) => items.add(t));
  }
  return { items: [...items].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3))), bad };
}

/** Why a verdict proves nothing (empty: it proves its item). A run "ran" when it has an exit code. */
export function gate(v) {
  if (!v || typeof v.overall !== "string" || !Array.isArray(v.suites)) return { ok: false, lines: ["no verdict: the verdict file is missing or cannot be read (see the verdict step)"] };
  const planned = v.suites.filter((s) => ["pack", "suite", "journey"].includes(s.kind)), ran = planned.filter((s) => typeof s.exit === "number");
  const lines = [];
  if (v.overall !== "PASS") lines.push(`verdict ${v.overall}: ${(v.why ?? []).join("; ") || "no reason given"}`);
  if (!ran.length) lines.push(`nothing ran: 0 of ${planned.length} planned run(s) (pack, suite, journey) has an exit code`);
  return { ok: !lines.length, lines: lines.length ? lines : [`verdict PASS: ${ran.length} of ${planned.length} planned run(s) ran and passed`] };
}

/** The R1 rows a runtime or screens PR's title names, with no "Completes:" line in its body (A274). */
export function claim(title, body) {
  const t = String(title ?? "");
  if (!/\b(runtime|screens):/i.test(t)) return [];
  const d = detect(body);
  if (d.items.length || d.bad.length) return [];
  const ids = new Set([...t.matchAll(/\bR1\.([1-9]\d{0,2})\b/g)].map((m) => `R1.${m[1]}`));
  for (const m of t.matchAll(/\(R1 row ([1-9]\d{0,2})\)/gi)) ids.add(`R1.${m[1]}`);
  return [...ids].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
}

/** A table line's cells as works-set.mjs reads them: a pipe inside a `code span` is not a column; marks dropped. */
const cells = (line) => line.trim().replace(/`[^`]*`/g, (c) => c.replace(/\|/g, "¦")).split(/(?<!\\)\|/).map((c) => c.replace(/~~[^~]*~~/g, " ").replace(/[*`]|\b__|__\b/g, "").trim());

/** What proves an item, read from its row (columns found by the R1 table's header row, so an added column moves nothing). */
export function plan(item, md, studio = S) {
  if (!ITEM.test(item)) throw new Error(`not a Release 1 item id: "${item}" (want e.g. R1.77)`);
  let head = null, row = null;
  for (const line of md.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const c = cells(line);
    if (c.includes("Case side") && c.some((x) => /^Done when/.test(x))) { head = c; continue; }
    if (head && c[1] === item) { row = c; break; }
  }
  const journey = journeyOf(item);
  const out = { item, found: !!row, name: "", status: "", packs: [], packsMissing: [], suites: [], suitesMissing: [], journey, journeyExists: existsSync(join(studio, journey)) };
  if (!row) return out;
  const at = (re) => row[head.findIndex((x) => re.test(x))] ?? "";
  const side = at(/^Case side$/), done = at(/^Done when/);
  out.name = at(/^Map row/); out.status = at(/^Status$/);
  const acc = existsSync(join(studio, "acceptance")) ? readdirSync(join(studio, "acceptance")) : [];
  for (const id of [...new Set(`${side} ${done}`.match(/\bC\d{1,2}\.\d{1,2}\b/g) ?? [])].sort()) {
    (acc.some((f) => f === `${id}.test.ts` || (f.startsWith(`${id}-`) && f.endsWith(".test.ts"))) ? out.packs : out.packsMissing).push(id);
  }
  for (const f of [...new Set(done.match(/\bcheck_[A-Za-z0-9_.-]+?\.(?:ts|cjs)\b/g) ?? [])].sort()) {
    (existsSync(join(studio, "tests", f)) ? out.suites : out.suitesMissing).push(f);
  }
  return out;
}

/** One verdict: every planned run must have a result line with exit 0, and the journey must exist and pass. */
export function verdict({ item, plan: pl, results, sha, pr, runId, runUrl, artifactUrl = null, repo = "", at = new Date().toISOString() }) {
  const got = (kind, name) => results.filter((r) => r.kind === kind && r.name === name).pop();
  // "not tested" (a pack held or run on its fixture only, P-405) and a journey that printed a FAIL line never pass.
  const row = (kind, name) => { const r = got(kind, name); return { kind, name, result: !r ? "not run" : r.untested ? "not tested" : r.exit === 0 && !(r.fail > 0) ? "pass" : "fail", exit: r ? r.exit : null, ...(r?.note || r?.untested ? { note: [r.untested, r.note].filter(Boolean).join("; ") } : {}) }; };
  const suites = [
    ...pl.packs.map((c) => row("pack", c)),
    ...pl.packsMissing.map((c) => ({ kind: "pack", name: c, result: "fail", exit: null, note: "no acceptance pack for this capability (P-405: never green)" })),
    ...pl.suites.map((f) => row("suite", f)),
    ...pl.suitesMissing.map((f) => ({ kind: "suite", name: f, result: "fail", exit: null, note: "named in Done when, not a studio/tests suite" })),
    pl.journeyExists ? row("journey", pl.journey) : { kind: "journey", name: pl.journey, result: "fail", exit: null, note: "no J-test file on main" },
  ];
  for (const r of results.filter((x) => x.kind === "scan")) suites.push({ kind: "scan", name: r.name, result: r.exit === 0 ? "pass" : "fail", exit: r.exit, ...(r.note ? { note: r.note } : {}) });
  const why = !pl.found ? [pl.why ?? `${item} has no row in qa/CAPABILITIES.md`] : suites.filter((s) => s.result !== "pass").map((s) => `${s.name}: ${s.result}${s.note ? ` (${s.note})` : ""}`);
  const overall = why.length ? "FAIL" : "PASS";
  return { item, name: pl.name, pr: Number(pr) || null, sha, run_id: String(runId), run_url: runUrl, at, overall, why, suites,
    video: overall === "PASS" ? artifactUrl : null, trace: overall === "PASS" ? null : artifactUrl,
    file: `product/qa/verdicts/auto/${item}-${sha}.json`, repo,
    note: "Machine half only (P-339 pack on main's head on GitHub's runners); qa reads this, walks the journey (gate A) and alone sets Works in qa/CAPABILITIES.md." };
}

/** Every verdict file in a folder; one that cannot be read is named on stderr and skipped, never the end of the report. */
export function readVerdicts(dir) {
  const out = [];
  for (const f of (existsSync(dir) ? readdirSync(dir) : []).filter((x) => /^R1\.\d+-[0-9a-f]{7,40}\.json$/.test(x))) {
    try { const v = JSON.parse(readFileSync(join(dir, f), "utf8")); if (v && typeof v.item === "string" && Array.isArray(v.suites)) out.push(v); else throw new Error("not a verdict"); }
    catch (e) { console.error(`item-proof: skipped ${f}: ${e.message}`); }
  }
  return out;
}
/** A pack's result line from works-set.mjs --run's exit and output: every pack held, or a pack run on its own fixture
 *  only, proved nothing on main's data, so it is "not tested" (P-405), never a pass. */
export function packLine(name, exit, out) {
  const untested = /every pack is held/.test(out) ? "every pack is held in qa/REGRESSION-HELD.md (red on main)"
    : /\bfixture only\b/.test(out) ? "ran on its own fixture only, not on the demo data (Not tested, P-405)" : undefined;
  return { kind: "pack", name, exit, ...(untested ? { untested } : {}) };
}
const md = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** The one PR comment for all verdicts of a run. */
export function comment(vs, saved = "", items = []) {
  const lost = items.filter((i) => !vs.some((v) => v.item === i));
  const out = [`## Automatic proof (P-728 (3)): ${[...vs.map((v) => `${v.item} ${v.overall}`), ...lost.map((i) => `${i} no verdict`)].join(", ") || "no item"}`, ""];
  for (const i of lost) out.push(`### ${i} · **no verdict**: its prove job ended before writing one (see the run); it counts as FAIL.`, "");
  for (const v of vs) {
    out.push(`### ${v.item} ${v.name ? `· ${md(v.name)} ` : ""}· **${v.overall}** on main \`${String(v.sha).slice(0, 9)}\` · [run ${v.run_id}](${v.run_url})`, "", "| Kind | Run | Result |", "|---|---|---|");
    for (const s of v.suites) out.push(`| ${s.kind} | \`${md(s.name)}\` | ${s.result === "pass" ? "pass" : `**${s.result}**`}${s.exit !== null && s.exit !== undefined && s.result !== "pass" ? ` (exit ${s.exit})` : ""}${s.note ? ` · ${md(s.note)}` : ""} |`);
    out.push("", v.video ? `Video of the journey: ${v.video} (kept 90 days)` : v.trace ? `Trace and step screenshots of the failing run: ${v.trace} (kept 90 days)` : "No recording was uploaded.", "");
  }
  out.push(saved || "Verdict file: not saved (see the run's report job).", "", "This is the machine half only: it never edits qa/CAPABILITIES.md and never marks Works. qa reads it and walks the journey once (gate A, P-339).");
  return out.join("\n") + "\n";
}

/** The founder's page: each item's newest verdict; proven journeys with their video first, then the latest FAILs. */
export function page(vs, now = new Date().toISOString()) {
  const last = new Map();
  for (const v of vs) if (!last.has(v.item) || String(v.at) > String(last.get(v.item).at)) last.set(v.item, v);
  const by = (o) => [...last.values()].filter((v) => v.overall === o).sort((a, b) => Number(a.item.slice(3)) - Number(b.item.slice(3)));
  const pass = by("PASS"), fail = by("FAIL");
  return [
    "# Proven journeys: automatic proof at the last merge (P-728 (3), P-729)",
    "",
    `Generated by \`.github/workflows/item-proof.yml\` at ${now} from ${vs.length} verdict file(s) in this folder; never edit by hand.`,
    "A PASS is the machine half (pack and journey green on main on GitHub's runners); qa's walk (gate A) and qa's row in `qa/CAPABILITIES.md` decide Works. Videos are run artifacts, kept 90 days.",
    "",
    `## Passed (${pass.length})`, "",
    ...(pass.length ? ["| Item | Journey | Video | Main | Run | When (UTC) |", "|---|---|---|---|---|---|", ...pass.map((v) => `| ${v.item} ${md(v.name)} | \`${v.suites.find((s) => s.kind === "journey")?.name ?? ""}\` | ${v.video ? `[watch](${v.video})` : "none"} | \`${String(v.sha).slice(0, 9)}\` | [${v.run_id}](${v.run_url}) | ${String(v.at).slice(0, 16)} |`)] : ["None yet."]),
    "", `## Latest verdict FAIL (${fail.length})`, "",
    ...(fail.length ? ["| Item | What failed | Trace | Run |", "|---|---|---|---|", ...fail.map((v) => `| ${v.item} ${md(v.name)} | ${md(v.why.join("; "))} | ${v.trace ? `[trace](${v.trace})` : "none"} | [${v.run_id}](${v.run_url}) |`)] : ["None."]),
    "",
  ].join("\n");
}

/** Key and secret shapes; any of them in an upload stops it. Plus the values of this job's own secret-like variables. */
export const SECRET_SHAPES = [
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/], ["OpenAI-style key", /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/], ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/], ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/], ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/], ["Stripe key", /\b[sr]k_live_[A-Za-z0-9]{20,}/],
];
export function scanText(text, env = process.env) {
  const found = SECRET_SHAPES.filter(([, re]) => re.test(text)).map(([k]) => k);
  for (const [k, v] of Object.entries(env)) if (/(SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE_KEY)/i.test(k) && typeof v === "string" && v.length >= 12 && text.includes(v)) found.push(`the value of $${k}`);
  return found;
}
export function scan(dir, env = process.env) {
  const hits = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { walk(p); continue; }
    if (/\.(webm|png|jpe?g|gif)$/i.test(f)) continue;
    let text;
    if (/\.zip$/i.test(f)) { const r = spawnSync("unzip", ["-p", p], { encoding: "latin1", maxBuffer: 1 << 30 }); if (r.status !== 0) { hits.push({ file: relative(dir, p), kind: `could not read the zip (unzip exit ${r.status ?? r.error?.message})` }); continue; } text = r.stdout; }
    else text = readFileSync(p, "latin1");
    for (const k of scanText(text, env)) hits.push({ file: relative(dir, p), kind: k }); } };
  if (existsSync(dir)) walk(dir);
  return hits;
}

function main(argv) {
  const [cmd, ...rest] = argv, opt = {}, pos = [];
  for (let i = 0; i < rest.length; i++) { if (rest[i].startsWith("--")) opt[rest[i].slice(2)] = rest[++i]; else pos.push(rest[i]); }
  if (cmd === "detect") {
    const d = detect(opt["body-file"] ? readFileSync(opt["body-file"], "utf8") : readFileSync(0, "utf8"));
    console.log(JSON.stringify(d));
    for (const b of d.bad) console.error(`Completes: line not read (write "Completes: R1.77" or "Completes: R1.77, R1.78", nothing else on the line): ${b}`);
    return d.bad.length ? 1 : 0;
  }
  if (cmd === "plan") { console.log(JSON.stringify(plan(pos[0], readFileSync(opt.caps ?? CAPS, "utf8")), null, 2)); return 0; }
  if (cmd === "verdict") {
    const results = existsSync(opt.results) ? readFileSync(opt.results, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    // No plan (the set-up failed before it): still a verdict, FAIL, so the report always has one (review M1).
    let pl; try { pl = JSON.parse(readFileSync(opt.plan, "utf8")); } catch { pl = { found: false, why: "the prove job ended before its plan (set-up failed; see the run)", packs: [], packsMissing: [], suites: [], suitesMissing: [], journey: journeyOf(String(opt.item)), journeyExists: false }; }
    console.log(JSON.stringify(verdict({ item: opt.item, plan: pl, results, sha: opt.sha, pr: opt.pr, runId: opt["run-id"], runUrl: opt["run-url"], artifactUrl: opt["artifact-url"] || null, repo: opt.repo ?? "" }), null, 2));
    return 0;
  }
  if (cmd === "comment") { process.stdout.write(comment(readVerdicts(opt.dir), opt.saved ?? "", (opt.items ?? "").split(/\s+/).filter((i) => ITEM.test(i)))); return 0; }
  if (cmd === "pack-line") { console.log(JSON.stringify(packLine(pos[0], Number(pos[1]), existsSync(pos[2] ?? "") ? readFileSync(pos[2], "utf8") : ""))); return 0; }
  if (cmd === "page") { writeFileSync(join(opt.dir, "README.md"), page(readVerdicts(opt.dir))); return 0; }
  if (cmd === "scan") {
    const hits = scan(pos[0]);
    for (const h of hits) console.log(`FAIL  secret check: ${h.kind} in ${h.file}`);
    if (!hits.length) console.log(`PASS  secret check: no key or secret value in ${pos[0]}`);
    return hits.length ? 1 : 0;
  }
  if (cmd === "gate") {
    let v = null; try { v = JSON.parse(readFileSync(pos[0], "utf8")); } catch { v = null; }
    const g = gate(v);
    console.log(`#### gate: ${g.ok ? "PASS, the job is green" : "FAIL, the job fails: it proved nothing"}`);
    for (const l of g.lines) console.log(`* ${l}`);
    return g.ok ? 0 : 1;
  }
  if (cmd === "claim") {
    const miss = claim(opt.title, readFileSync(0, "utf8"));
    for (const i of miss) console.log(`::warning title=Completes line::MISSING: "Completes: ${i}" (the title names ${i}; if this PR completes it, add the line so item-proof proves it at the merge)`);
    return miss.length && opt.strict === "on" ? 1 : 0;
  }
  console.error("usage: item-proof.mjs detect|plan|verdict|comment|page|scan|gate|claim (see the header)"); return 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
