// PF-8a: the app with its two environments. Used by bin/app.ts (cdk synth) and by the tests, so both read one definition.
import { App, Stack, type AppProps } from "aws-cdk-lib";
import { Template as Assert } from "aws-cdk-lib/assertions";
import type { SynthStack, Template } from "./checks.ts";
import { BackupCopyStack } from "./backup.ts";
import { EstateStack, type Stage } from "./estate.ts";

export const STAGES: Stage[] = ["staging", "production"];

export function buildApp(props: AppProps = {}): { app: App; stacks: Record<Stage, EstateStack>; copies: Record<Stage, BackupCopyStack> } {
  // No version-reporting metadata leaves (tech gate entry 8: telemetry off); account left unresolved (synth needs none).
  const app = new App({ analyticsReporting: false, ...props });
  // PF-8rc: each stage's ca-west-1 copy vault is its own stack, deployed before the home stack whose plan copies into it
  const copies = Object.fromEntries(STAGES.map((stage) => [stage, new BackupCopyStack(app, `xr-${stage}-copy`, { stage })])) as Record<Stage, BackupCopyStack>;
  const stacks = Object.fromEntries(STAGES.map((stage) => [stage, new EstateStack(app, `xr-${stage}`, { stage })])) as Record<Stage, EstateStack>;
  for (const stage of STAGES) stacks[stage].addStackDependency(copies[stage], "the plan copies into this vault");
  return { app, stacks, copies };
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
