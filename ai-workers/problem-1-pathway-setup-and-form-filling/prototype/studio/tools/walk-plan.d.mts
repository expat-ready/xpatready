// Types for walk-plan.mjs (A274, QA-702), so tests/check_walk_plan.ts is type-checked (no implicit any).
export type Walk = { name: string; file: string; expect: "pass" | "fail" };
export type WalkPlan = { matrix: Walk[]; reason: string; warn: string };
export const CAP: number;
export function importsOf(file: string, root: string): Set<string>;
export function machinery(jdir: string): (file: string) => boolean;
export function walkPlan(a: { event: "pull_request" | "workflow_dispatch" | string; jdir: string; want?: string; changed?: string[]; body?: string; root?: string }): WalkPlan;
export function selftest(): string[];
