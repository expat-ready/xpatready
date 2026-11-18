// Repository clean-up stage 2a (product/design/repo-cleanup-plan-2026-11-17.md): the code finds the repository root by
// AGENTS.md (packages/repo-paths), never by counting folder levels. Checks that the root is found from any depth, that
// REPO_ROOT is taken only when it is safe, that every path the spend guard and the app worked out before is the same
// now (so nothing moved by this stage), and that the spend ledger still resolves to the one shared ledger (QA-90).
// No server, no model call (US$0).
//   tsx studio/tests/check_repo_paths.ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findRoot, LAYOUT, MARKER, repoPath, ROOT } from "../../../../../packages/repo-paths/index.ts";
import { ledgerDirFrom, OFFICIAL, PROTOTYPE, ROOT as POLICY_ROOT, sharedLedgerDir, SOLUTION } from "../../p2/policy.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
// ROOT is worked out when the package loads, so a REPO_ROOT from the caller would decide every check below: refuse it.
ok("REPO_ROOT is not set for this test (unset it and run again)", !process.env.REPO_ROOT, process.env.REPO_ROOT);
const threw = (f: () => unknown, re: RegExp) => { try { f(); return false; } catch (e) { return re.test(String(e)); } };

// The finder, on a scratch tree: root/AGENTS.md and a file five levels down.
const t = mkdtempSync(join(tmpdir(), "repo-paths-"));
try {
  const deep = join(t, "a", "b", "c", "d", "e"); mkdirSync(deep, { recursive: true });
  ok("found from five levels down (no marker yet): refused, never a guess", threw(() => findRoot(deep, {}), /no AGENTS\.md/));
  writeFileSync(join(t, MARKER), "# root\n");
  ok("found from five levels down", findRoot(deep, {}) === t, findRoot(deep, {}));
  ok("found from the root itself", findRoot(t, {}) === t);
  mkdirSync(join(t, "a", MARKER));
  ok("a folder named AGENTS.md is no marker", findRoot(deep, {}) === t);
  ok("REPO_ROOT wins when it holds the marker", findRoot("/", { REPO_ROOT: t }) === t);
  ok("REPO_ROOT relative: refused", threw(() => findRoot(deep, { REPO_ROOT: "a/b" }), /absolute/));
  ok("REPO_ROOT with ..: refused", threw(() => findRoot(deep, { REPO_ROOT: `${t}/a/..` }), /absolute/));
  ok("REPO_ROOT without the marker: refused", threw(() => findRoot(deep, { REPO_ROOT: deep }), /no AGENTS\.md/));
  ok("REPO_ROOT on a folder named AGENTS.md: refused", threw(() => findRoot(deep, { REPO_ROOT: join(t, "a") }), /no AGENTS\.md file/));
  ok("REPO_ROOT with a trailing slash is the same root", findRoot("/", { REPO_ROOT: `${t}/` }) === t);
} finally { rmSync(t, { recursive: true, force: true }); }

// This checkout: the root is git's top level (a lane copy finds its own copy, never the main one).
const top = execFileSync("git", ["-C", import.meta.dirname, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
ok("ROOT is this checkout's top level", ROOT === top, { ROOT, top });
ok("the spend guard's ROOT is the same root", POLICY_ROOT === ROOT);

// Nothing moved: each path equals what the old folder-counting gave on this tree.
const here = import.meta.dirname; // …/prototype/studio/tests
const old = { prototype: join(here, "..", ".."), solution: join(here, "..", "..", ".."), studio: join(here, "..") };
ok("PROTOTYPE unchanged", PROTOTYPE === old.prototype, { PROTOTYPE, was: old.prototype });
ok("SOLUTION unchanged", SOLUTION === old.solution);
ok("OFFICIAL unchanged", OFFICIAL === join(old.solution, "official-sources", "ircc"));
ok("studio unchanged", repoPath("studio") === old.studio);
ok("product unchanged", repoPath("product") === join(old.solution, "product"));
ok("every LAYOUT area in the tree exists", (Object.keys(LAYOUT) as (keyof typeof LAYOUT)[]).filter((a) => a !== "tools").every((a) => existsSync(repoPath(a))));

// The shared ledger (QA-90): unset, it is the main copy's .tools/p2-ledger when there is one, else the project's own.
const want = sharedLedgerDir(ROOT) ?? join(old.prototype, "p2", "ledger");
ok("the default ledger is unchanged", ledgerDirFrom(undefined) === want, { got: ledgerDirFrom(undefined), want });
ok("an absolute P2_LEDGER_DIR still wins", ledgerDirFrom("/tmp/x-ledger") === "/tmp/x-ledger");

process.exitCode = summary() ? 1 : 0;
