// PF-8a: the whole estate, one stack per environment. bin/app.ts and the tests build the same app from here.
import { App } from 'aws-cdk-lib';
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
  return app;
}
