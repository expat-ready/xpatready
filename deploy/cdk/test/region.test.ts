// PF-8a: the region guard (C1-3's "CI region-allowlist"; P-559). Fails on any stack, resource, replication target,
// log destination or output outside ca-central-1, except the ca-west-1 backup copy that PF-8r adds.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { App, CfnResource, Stack } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { buildEstate } from '../lib/estate-app.ts';
import { regionProblems } from './checks.ts';

const backupPlanCopyingTo = (region: string) => ({
  BackupPlan: {
    BackupPlanName: 'daily',
    BackupPlanRule: [{
      RuleName: 'daily', TargetBackupVault: 'main',
      CopyActions: [{ DestinationBackupVaultArn: `arn:aws:backup:${region}:111111111111:backup-vault:copy` }],
    }],
  },
});

test('C1-3 region guard, pass: the estate (staging and production) lives only in ca-central-1', () => {
  const assembly = buildEstate(new App()).synth();
  assert.deepEqual(assembly.stacks.map((s) => [s.stackName, s.environment.region]).sort(),
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
  const stack = new Stack(app, 'logs-out', { env: { region: 'ca-central-1' } });
  new CfnResource(stack, 'ShipLogs', {
    type: 'AWS::Logs::SubscriptionFilter',
    properties: { LogGroupName: 'app', FilterPattern: '', DestinationArn: 'arn:aws:logs:us-east-1:111111111111:destination:x' },
  });
  assert.deepEqual(regionProblems(app.synth()), ['logs-out/ShipLogs (AWS::Logs::SubscriptionFilter) names us-east-1']);
});

test('C1-3 region guard: the backup copy may go to ca-west-1 (PF-8r), never to another region', () => {
  const app = buildEstate(new App());
  const stack = new Stack(app, 'backups', { env: { region: 'ca-central-1' } });
  new CfnResource(stack, 'CanadaCopy', { type: 'AWS::Backup::BackupPlan', properties: backupPlanCopyingTo('ca-west-1') });
  new CfnResource(stack, 'UsCopy', { type: 'AWS::Backup::BackupPlan', properties: backupPlanCopyingTo('us-west-2') });
  // ca-west-1 is allowed only for a backup copy: the same region in a bucket's replication is refused.
  new CfnResource(stack, 'Replica', {
    type: 'AWS::S3::Bucket',
    properties: { ReplicationConfiguration: { Role: 'arn:aws:iam::111111111111:role/r', Rules: [{ Status: 'Enabled', Destination: { Bucket: 'arn:aws:s3:::copy' }, Filter: { Prefix: '' }, Priority: 1, DeleteMarkerReplication: { Status: 'Disabled' }, Id: 'ca-west-1' }] } },
  });
  assert.deepEqual(regionProblems(app.synth()), [
    'backups/UsCopy (AWS::Backup::BackupPlan) names us-west-2',
    'backups/Replica (AWS::S3::Bucket) names ca-west-1',
  ]);
});
