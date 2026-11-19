// PF-8a: the region guard (C1-3's "CI region-allowlist"; P-559). Fails on any stack, resource, replication target,
// log destination or output outside ca-central-1, except the ca-west-1 backup copy that PF-8r adds.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { App, CfnResource, cx_api, NestedStack, Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { buildEstate } from '../lib/estate-app.ts';
import { regionProblems } from './checks.ts';

const ROOT = join(import.meta.dirname, '..');
const backupPlanCopyingTo = (region: string) => ({
  BackupPlan: {
    BackupPlanName: 'daily',
    BackupPlanRule: [{
      RuleName: 'daily', TargetBackupVault: 'main',
      CopyActions: [{ DestinationBackupVaultArn: `arn:aws:backup:${region}:111111111111:backup-vault:copy` }],
    }],
  },
});
const canadian = (app: App, id: string) => new Stack(app, id, { env: { region: 'ca-central-1' } });

// The assembly `cdk synth` writes and PF-8c will deploy: the app command from cdk.json, run as the CLI runs it.
const outdir = mkdtempSync(join(tmpdir(), 'estate-synth-'));
after(() => rmSync(outdir, { recursive: true, force: true }));

test('C1-3 region guard, pass: the deployable assembly (cdk.json\'s app, as cdk synth runs it) lives only in ca-central-1', () => {
  const command = (JSON.parse(readFileSync(join(ROOT, 'cdk.json'), 'utf8')) as { app: string }).app.split(' ');
  execFileSync(command[0]!, command.slice(1), { cwd: ROOT, env: { ...process.env, CDK_OUTDIR: outdir }, stdio: 'pipe' });
  const assembly = new cx_api.CloudAssembly(outdir);
  assert.deepEqual(assembly.stacksRecursively.map((s) => [s.stackName, s.environment.region]).sort(),
    [['estate-production', 'ca-central-1'], ['estate-staging', 'ca-central-1']]);
  assert.deepEqual(regionProblems(assembly), []);
});

test('C1-3 region guard, fail: a test stack with a bucket in us-east-1 is refused', () => {
  const app = buildEstate(new App());
  const stray = new Stack(app, 'stray-us', { env: { region: 'us-east-1' } });
  new s3.Bucket(stray, 'StrayBucket');
  assert.deepEqual(regionProblems(app.synth()), ['stack stray-us is in us-east-1, not ca-central-1']);
});

test('C1-3 region guard, fail: a stack with no region pinned (it would go wherever the deployer points) is refused', () => {
  const app = buildEstate(new App());
  new s3.Bucket(new Stack(app, 'anywhere'), 'Bucket');
  assert.deepEqual(regionProblems(app.synth()), ['stack anywhere is in unknown-region, not ca-central-1']);
});

test('C1-3 region guard, fail: a Canadian stack whose log destination is in us-east-1 is refused', () => {
  const app = buildEstate(new App());
  new CfnResource(canadian(app, 'logs-out'), 'ShipLogs', {
    type: 'AWS::Logs::SubscriptionFilter',
    properties: { LogGroupName: 'app', FilterPattern: '', DestinationArn: 'arn:aws:logs:us-east-1:111111111111:destination:x' },
  });
  assert.deepEqual(regionProblems(app.synth()), ['logs-out/ShipLogs (AWS::Logs::SubscriptionFilter) names us-east-1']);
});

test('C1-3 region guard, fail: S3 replication is refused even though its destination ARN names no region', () => {
  const app = buildEstate(new App());
  new CfnResource(canadian(app, 'replicas'), 'Replica', {
    type: 'AWS::S3::Bucket',
    properties: { VersioningConfiguration: { Status: 'Enabled' }, ReplicationConfiguration: { Role: 'arn:aws:iam::111111111111:role/r', Rules: [{ Status: 'Enabled', Destination: { Bucket: 'arn:aws:s3:::somewhere-else' } }] } },
  });
  assert.deepEqual(regionProblems(app.synth()), ['replicas/Replica (AWS::S3::Bucket) replicates to another bucket (use AWS Backup, PF-8r)']);
});

test('C1-3 region guard, fail: a nested stack (a template the guard does not read) is refused', () => {
  const app = buildEstate(new App());
  const parent = canadian(app, 'parent');
  new s3.Bucket(new NestedStack(parent, 'Child'), 'Hidden');
  const problems = regionProblems(app.synth());
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0]!, /^parent\/.* \(AWS::CloudFormation::Stack\) is a nested stack/);
});

test('C1-3 region guard, fail: a stack set and a multi-region access point are refused', () => {
  const app = buildEstate(new App());
  const stack = canadian(app, 'spread');
  new CfnResource(stack, 'Everywhere', { type: 'AWS::CloudFormation::StackSet', properties: { StackSetName: 'x', PermissionModel: 'SELF_MANAGED' } });
  new CfnResource(stack, 'Mrap', { type: 'AWS::S3::MultiRegionAccessPoint', properties: { Regions: [{ Bucket: 'b' }] } });
  assert.deepEqual(regionProblems(app.synth()), [
    'spread/Everywhere (AWS::CloudFormation::StackSet) is a stack set (it deploys to other regions)',
    'spread/Mrap (AWS::S3::MultiRegionAccessPoint) is a multi-region access point',
  ]);
});

test('C1-3 region guard: the backup copy may go to ca-west-1 (PF-8r), never to another region', () => {
  const app = buildEstate(new App());
  const stack = canadian(app, 'backups');
  new CfnResource(stack, 'CanadaCopy', { type: 'AWS::Backup::BackupPlan', properties: backupPlanCopyingTo('ca-west-1') });
  new CfnResource(stack, 'UsCopy', { type: 'AWS::Backup::BackupPlan', properties: backupPlanCopyingTo('us-west-2') });
  // ca-west-1 is allowed only for a backup copy: the same region named by another resource is refused.
  new CfnResource(stack, 'WestLogs', { type: 'AWS::Logs::SubscriptionFilter', properties: { LogGroupName: 'app', FilterPattern: '', DestinationArn: 'arn:aws:logs:ca-west-1:111111111111:destination:x' } });
  assert.deepEqual(regionProblems(app.synth()), [
    'backups/UsCopy (AWS::Backup::BackupPlan) names us-west-2',
    'backups/WestLogs (AWS::Logs::SubscriptionFilter) names ca-west-1',
  ]);
});
