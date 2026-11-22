// qa proof on the merge batch (SPD-1 part 2, founder 22 Nov, P-802): a batch PR (Mergify's mergify/merge-queue/*)
// lists its PRs in a metadata block ("pull_requests:\n  - number: N"); each PR whose body has a "Completes: R1.n" line
// gets that item's journey studio/tests/journeys/j_<n>.ts walked on the batch tree (what main becomes), as the check
// "batch-proof R1.n" (.github/workflows/batch-proof.yml). qa then signs the verdict after merge instead of re-walking
// from scratch. The Completes line is read by item-proof.mjs detect (one reader; pr-rules.yml checks the line).
//   node product/tools/batch-proof.mjs prs --body-file <batch body>    the batch's PR numbers, JSON ([] when none)
//   node product/tools/batch-proof.mjs items --dir <dir of <n>.md>     [{item, pr}] from each PR body, JSON
//   node product/tools/batch-proof.mjs --self-test
// Exit 0 ok, 1 a failed self-test, 2 a usage error. US$0, no network. Test: --self-test, run by test-spd-1.sh.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { detect } = await import(pathToFileURL(resolve(HERE, "../../prototype/studio/tools/item-proof.mjs")).href);

/** The PR numbers Mergify lists in a batch PR's metadata block (the same block flaky.mjs targets reads); at most 10. */
export function batchPrs(body = "") {
  const m = String(body).match(/^pull_requests:\s*\n((?:[ \t]+.*\n?)*)/m);
  const nums = m ? [...m[1].matchAll(/^\s*-\s*number:\s*(\d{1,7})\s*$/gm)].map((x) => Number(x[1])) : [];
  return [...new Set(nums)].slice(0, 10);
}

/** Each item a batch completes, with the PR that claims it (the first PR when two claim one item). */
export function batchItems(bodies) {
  const out = new Map();
  for (const [pr, body] of bodies) for (const item of detect(body).items) if (!out.has(item)) out.set(item, pr);
  return [...out].map(([item, pr]) => ({ item, pr }));
}

function selfTest() {
  let bad = 0;
  const ok = (what, cond, got) => { console.log(`${cond ? "PASS" : "FAIL"}  ${what}${cond ? "" : ` (got ${JSON.stringify(got)})`}`); if (!cond) bad++; };
  const mb = "Merge queue batch\n\n```yaml\n---\nchecking_base_sha: abc\npull_requests:\n  - number: 3001\n  - number: 3002\n  - number: 3001\nprevious_failed_batches: []\n...\n```\n";
  ok("a batch's PRs come from its metadata block, each once", batchPrs(mb).join() === "3001,3002", batchPrs(mb));
  ok("a body without metadata names no PR (nothing to prove)", batchPrs("no metadata #1158").length === 0, batchPrs("x #1"));
  const items = batchItems([[3001, "What and why.\n\nCompletes: R1.27\n"], [3002, "Completes: R1.74, R1.27\n"], [3003, "no line"]]);
  ok("items from each PR's Completes line, the first claimant kept", JSON.stringify(items) === JSON.stringify([{ item: "R1.27", pr: 3001 }, { item: "R1.74", pr: 3002 }]), items);
  ok("a Completes line inside a ``` fence claims nothing", batchItems([[1, "```\nCompletes: R1.9\n```\n"]]).length === 0, batchItems([[1, "```\nCompletes: R1.9\n```\n"]]));
  ok("an unreadable Completes line proves nothing (never a guess)", batchItems([[1, "Completes: R1.9; rm -rf /\n"]]).length === 0, batchItems([[1, "Completes: R1.9; rm -rf /\n"]]));
  console.log(`batch-proof self-test: ${bad ? `FAIL (${bad})` : "PASS"}`);
  return bad ? 1 : 0;
}

function main(argv) {
  const [cmd, ...rest] = argv, opt = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith("--") && rest[i + 1] !== undefined) opt[rest[i].slice(2)] = rest[++i];
  if (cmd === "--self-test") return selfTest();
  if (cmd === "prs" && opt["body-file"]) { console.log(JSON.stringify(batchPrs(readFileSync(opt["body-file"], "utf8")))); return 0; }
  if (cmd === "items" && opt.dir) {
    const bodies = readdirSync(opt.dir).filter((f) => /^\d{1,7}\.md$/.test(f)).map((f) => [Number(f.slice(0, -3)), readFileSync(join(opt.dir, f), "utf8")]);
    bodies.sort((a, b) => a[0] - b[0]);
    console.log(JSON.stringify(batchItems(bodies))); return 0;
  }
  console.error("usage: batch-proof.mjs prs --body-file <f> | items --dir <d> | --self-test"); return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
