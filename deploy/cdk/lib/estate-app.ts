// PF-8a: the whole estate, one stack per environment. bin/app.ts and the tests build the same app from here.
import { App, Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { ENVIRONMENTS, type EnvironmentName } from './environments.ts';
import { EstateStack } from './estate-stack.ts';

export const stackName = (environment: EnvironmentName) => `estate-${environment}`;

export function buildEstate(app: App = new App()): App {
  for (const config of Object.values(ENVIRONMENTS)) {
    new EstateStack(app, stackName(config.name), {
      config,
      description: `Pathway Configurator estate, ${config.name} (ca-central-1)`,
      terminationProtection: true,
    });
  }
  // TEMPORARY (PF-8a Done when: shown once, then removed): a test stack with a bucket in us-east-1.
  new s3.Bucket(new Stack(app, 'guard-demo-us', { env: { region: 'us-east-1' } }), 'StrayBucket');
  return app;
}
