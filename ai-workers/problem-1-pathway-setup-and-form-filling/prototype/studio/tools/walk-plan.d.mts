// Types for walk-plan.mjs (A274, QA-702; ENF-733), so tests/check_walk_plan.ts is type-checked (no implicit any).
export type Walk = { name: string; file: string; expect: "pass" | "fail"; items?: string; via?: string };
export type WalkPlan = { matrix: Walk[]; reason: string; warn: string; pr?: string; sha?: string };
export const CAP: number;
export const APP: string[];
export function importsOf(file: string, root: string): Set<string>;
export function machinery(jdir: string): (file: string) => boolean;
export function titleItems(title: string): string[];
export function walkPlan(a: { event: "pull_request" | "workflow_dispatch" | "push" | string; jdir: string; want?: string; changed?: string[]; body?: string; title?: string; pr?: string; sha?: string; root?: string }): WalkPlan;
export function walkComment(a: { plan: WalkPlan | null; results: string; runId: string; runUrl: string; sha: string; attempt?: string }): string | null;
export function selftest(): string[];
