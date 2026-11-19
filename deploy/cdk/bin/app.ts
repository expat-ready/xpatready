// PF-8a: entry point for `cdk synth`. Needs no AWS account, key or network.
import { buildEstate } from '../lib/estate-app.ts';

buildEstate().synth();
