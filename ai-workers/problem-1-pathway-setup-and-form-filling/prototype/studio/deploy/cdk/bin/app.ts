// PF-8a: the CDK entry point (`cdk synth`, cdk.json's "app"). Synth only: no AWS account or key is needed or read.
import { buildApp } from "../lib/app.ts";

buildApp().app.synth();
