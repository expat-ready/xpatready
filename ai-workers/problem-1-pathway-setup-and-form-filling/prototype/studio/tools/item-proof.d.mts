// Types for item-proof.mjs (P-728 (3)), so tests/check_item_proof.ts is type-checked (no implicit any).
export type Plan = { item: string; found: boolean; why?: string; name: string; status: string; packs: string[]; packsMissing: string[]; suites: string[]; suitesMissing: string[]; journey: string; journeyExists: boolean };
export type Result = { kind: string; name: string; exit: number; untested?: string; note?: string; fail?: number };
export type Row = { kind: string; name: string; result: "pass" | "fail" | "not run" | "not tested"; exit: number | null; note?: string };
export type Verdict = { item: string; name: string; pr: number | null; sha: string; run_id: string; run_url: string; at: string; overall: "PASS" | "FAIL"; why: string[]; suites: Row[]; video: string | null; trace: string | null; file: string; repo: string; note: string };
export const SHARED_JOURNEY: Record<string, number>;
export function journeyOf(item: string): string;
export function detect(body: string): { items: string[]; bad: string[] };
export function plan(item: string, md: string, studio?: string): Plan;
export function verdict(a: { item: string; plan: Plan; results: Result[]; sha: string; pr?: number | string; runId?: number | string; runUrl?: string; artifactUrl?: string | null; repo?: string; at?: string }): Verdict;
export function readVerdicts(dir: string): Verdict[];
export function packLine(name: string, exit: number, out: string): Result;
export function comment(vs: Verdict[], saved?: string, items?: string[]): string;
export function page(vs: Verdict[], now?: string): string;
export const SECRET_SHAPES: [string, RegExp][];
export function scanText(text: string, env?: Record<string, string | undefined>): string[];
export function scan(dir: string, env?: Record<string, string | undefined>): { file: string; kind: string }[];
export function gate(v: Verdict | null): { ok: boolean; lines: string[] };
export function claim(title: string, body: string): string[];
