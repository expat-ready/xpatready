// Where the repository's areas live (repository clean-up, stage 2a: product/design/repo-cleanup-plan-2026-11-17.md).
// Code finds the root by looking for AGENTS.md, never by counting folder levels, so a file can move without its paths
// changing; a clean-up stage that moves an area changes that area's one line in LAYOUT (and the stale-path check).
import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/** The file that marks the repository root (only the root has one; the Docker image copies it too). */
export const MARKER = "AGENTS.md";

const isMarker = (dir: string): boolean => existsSync(join(dir, MARKER)) && statSync(join(dir, MARKER)).isFile();

/** The nearest folder at or above `from` that holds MARKER. REPO_ROOT, when set, wins: it must be an absolute path
 *  that holds MARKER (a build or image that keeps the code somewhere else). Throws rather than guess. */
export function findRoot(from: string, env: NodeJS.ProcessEnv = process.env): string {
  const given = env.REPO_ROOT?.trim();
  if (given) {
    let end = given.length; // a trailing slash is the same folder (a loop, not a regular expression: CodeQL js/polynomial-redos)
    while (end > 1 && given[end - 1] === "/") end--;
    const set = given.slice(0, end);
    if (!isAbsolute(set) || resolve(set) !== set) throw new Error(`REPO_ROOT must be an absolute path without . or .. parts (got ${given})`);
    if (!isMarker(set)) throw new Error(`REPO_ROOT has no ${MARKER} file: ${given}`);
    return set;
  }
  let dir = resolve(from);
  for (;;) {
    if (isMarker(dir)) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`no ${MARKER} at or above ${from}: set REPO_ROOT`);
    dir = up;
  }
}

export const ROOT = findRoot(import.meta.dirname);

/** Each area, relative to the root. Paths stay as they are on main until a clean-up stage moves an area. */
export const LAYOUT = {
  solution: "ai-workers/problem-1-pathway-setup-and-form-filling",
  prototype: "ai-workers/problem-1-pathway-setup-and-form-filling/prototype",
  studio: "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio",
  product: "ai-workers/problem-1-pathway-setup-and-form-filling/product",
  official: "ai-workers/problem-1-pathway-setup-and-form-filling/official-sources",
  tools: ".tools",
} as const;
export type Area = keyof typeof LAYOUT;

/** An area's absolute path, with optional parts below it. */
export const repoPath = (area: Area, ...parts: string[]): string => join(ROOT, LAYOUT[area], ...parts);
