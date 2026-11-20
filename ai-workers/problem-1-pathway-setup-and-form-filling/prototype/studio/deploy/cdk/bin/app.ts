// PF-8a: the CDK entry point (cdk.json's "app"). Synth only: no AWS account or key is needed or read.
// `npm run synth` runs this file directly: the app alone writes cdk.out with no network. The CDK CLI's `cdk synth` runs
// the same file but first looks up the account through STS (us-east-1) when it finds AWS credentials (break 1), so CI
// and lanes never call the CLI. Under the CLI, CDK_OUTDIR is the CLI's folder.
import { buildApp } from "../lib/app.ts";

buildApp({ outdir: process.env.CDK_OUTDIR ?? "cdk.out" }).app.synth();
