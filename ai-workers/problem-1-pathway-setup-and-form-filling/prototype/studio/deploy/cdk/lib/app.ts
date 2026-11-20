// PF-8a: the app with its two environments. Used by bin/app.ts (cdk synth) and by the tests, so both read one definition.
import { App, type AppProps } from "aws-cdk-lib";
import { EstateStack, type Stage } from "./estate.ts";

export const STAGES: Stage[] = ["staging", "production"];

export function buildApp(props: AppProps = {}): { app: App; stacks: Record<Stage, EstateStack> } {
  // No version-reporting metadata leaves (tech gate entry 8: telemetry off); account left unresolved (synth needs none).
  const app = new App({ analyticsReporting: false, ...props });
  const stacks = Object.fromEntries(STAGES.map((stage) => [stage, new EstateStack(app, `xr-${stage}`, { stage })])) as Record<Stage, EstateStack>;
  return { app, stacks };
}
