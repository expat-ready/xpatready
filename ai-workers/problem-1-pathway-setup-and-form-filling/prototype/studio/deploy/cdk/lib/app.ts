// PF-8a: the app with its two environments. Used by bin/app.ts (cdk synth) and by the tests, so both read one definition.
import { App, Stack, type AppProps } from "aws-cdk-lib";
import { Template as Assert } from "aws-cdk-lib/assertions";
import type { SynthStack, Template } from "./checks.ts";
import { EstateStack, type Stage } from "./estate.ts";

export const STAGES: Stage[] = ["staging", "production"];

export function buildApp(props: AppProps = {}): { app: App; stacks: Record<Stage, EstateStack> } {
  // No version-reporting metadata leaves (tech gate entry 8: telemetry off); account left unresolved (synth needs none).
  const app = new App({ analyticsReporting: false, ...props });
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
