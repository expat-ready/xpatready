// PF-8a: the app with its two environments. Used by bin/app.ts (cdk synth) and by the tests, so both read one definition.
import { App, Stack, type AppProps } from "aws-cdk-lib";
import { Template as Assert } from "aws-cdk-lib/assertions";
import { readFileSync } from "node:fs";
import type { SynthStack, Template } from "./checks.ts";
import { EstateStack, type Stage } from "./estate.ts";

export const STAGES: Stage[] = ["staging", "production"];
/** cdk.json's context (the feature flags): the CLI passes it, but `npm run synth` and the tests build the App directly,
 *  so it is read here too, so synth, tests and the CLI build one template (PF-8b). */
export const CDK_CONTEXT = (JSON.parse(readFileSync(new URL("../cdk.json", import.meta.url), "utf8")) as { context: Record<string, unknown> }).context;

export function buildApp(props: AppProps = {}): { app: App; stacks: Record<Stage, EstateStack> } {
  // No version-reporting metadata leaves (tech gate entry 8: telemetry off); account left unresolved (synth needs none).
  const app = new App({ analyticsReporting: false, ...props, context: { ...CDK_CONTEXT, ...props.context } });
  const stacks = Object.fromEntries(STAGES.map((stage) => [stage, new EstateStack(app, `xr-${stage}`, { stage })])) as Record<Stage, EstateStack>;
  return { app, stacks };
}

/** Every stack of an app, nested stacks included, with its synthesized template: the region guard's input, so a stack
 *  added later (a us-east-1 certificate stack, a nested stack) is scanned without anyone remembering to list it. */
export function allStacks(app: App): SynthStack[] {
  return app.node.findAll().filter((c): c is Stack => Stack.isStack(c)).map((s) => ({
    name: s.node.path,
    region: s.region,
    template: Assert.fromStack(s).toJSON() as Template,
  }));
}
