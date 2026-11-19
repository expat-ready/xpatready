// PF-8a: the estate's data rules, each with a pass (the real stacks) and a fail (one property broken in a copy).
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { buildEstate } from '../lib/estate-app.ts';
import { availabilityProblems, bucketProblems, databaseProblems, type CfnTemplate } from './checks.ts';

const assembly = buildEstate(new App()).synth();
const template = (name: 'staging' | 'production') => assembly.getStackByName(`estate-${name}`).template as CfnTemplate;
const environments = ['staging', 'production'] as const;

/** A deep copy of a template with one change made to the first resource of a type. */
function broken(t: CfnTemplate, type: string, change: (props: Record<string, unknown>, all: CfnTemplate) => void): CfnTemplate {
  const copy = structuredClone(t);
  const entry = Object.values(copy.Resources).find((r) => r.Type === type);
  assert.ok(entry?.Properties, `no ${type} to break`);
  change(entry.Properties, copy);
  return copy;
}
const one = (problems: string[], pattern: RegExp) => {
  assert.equal(problems.length, 1, `expected exactly one problem, got: ${JSON.stringify(problems)}`);
  assert.match(problems[0]!, pattern);
};
const first = (t: CfnTemplate, type: string) => Object.values(t.Resources).find((r) => r.Type === type)!.Properties!;

describe('database (SA-2-21, SA-11-32, NFR5-04)', () => {
  for (const env of environments) {
    test(`pass: ${env} database is private, encrypted, deletion-protected, 35-day backups, TLS only, terse errors`, () => {
      assert.deepEqual(databaseProblems(template(env)), []);
      assert.equal(first(template(env), 'AWS::RDS::DBInstance').EngineVersion, '18.3');
    });
  }
  const db = 'AWS::RDS::DBInstance';
  const t = template('production');
  test('fail: publicly accessible', () => one(databaseProblems(broken(t, db, (p) => { p.PubliclyAccessible = true; })), /publicly accessible/));
  test('fail: storage not encrypted', () => one(databaseProblems(broken(t, db, (p) => { p.StorageEncrypted = false; })), /not encrypted/));
  test('fail: no KMS key', () => one(databaseProblems(broken(t, db, (p) => { delete p.KmsKeyId; })), /no KMS key/));
  test('fail: deletion protection off', () => one(databaseProblems(broken(t, db, (p) => { p.DeletionProtection = false; })), /deletion protection/));
  test('fail: backups kept 7 days', () => one(databaseProblems(broken(t, db, (p) => { p.BackupRetentionPeriod = 7; })), /7 days, not 35/));
  test('fail: database subnets moved to the public subnets (a route to the internet)', () =>
    assert.ok(databaseProblems(broken(t, 'AWS::RDS::DBSubnetGroup', (p, all) => {
      p.SubnetIds = Object.entries(all.Resources).filter(([id, r]) => r.Type === 'AWS::EC2::Subnet' && /public/i.test(id)).map(([id]) => ({ Ref: id }));
    })).some((x) => /routes to the internet/.test(x))));
  test('fail: security group open to 0.0.0.0/0', () =>
    one(databaseProblems(broken(t, 'AWS::EC2::SecurityGroup', (p) => { p.SecurityGroupIngress = [{ IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, CidrIp: '0.0.0.0/0' }]; })), /open to the internet/));
  test('fail: rds.force_ssl off', () =>
    one(databaseProblems(broken(t, 'AWS::RDS::DBParameterGroup', (p) => { (p.Parameters as Record<string, unknown>)['rds.force_ssl'] = '0'; })), /force_ssl/));
  test('fail: verbose error log', () =>
    one(databaseProblems(broken(t, 'AWS::RDS::DBParameterGroup', (p) => { (p.Parameters as Record<string, unknown>).log_error_verbosity = 'verbose'; })), /terse/));
});

describe('file buckets: documents, exports, imports', () => {
  for (const env of environments) {
    test(`pass: ${env} has three buckets, each blocking public access, versioned, KMS-encrypted, refusing plain HTTP`, () => {
      assert.deepEqual(bucketProblems(template(env)), []);
    });
  }
  const b = 'AWS::S3::Bucket';
  const t = template('staging');
  test('fail: public policies allowed', () =>
    one(bucketProblems(broken(t, b, (p) => { (p.PublicAccessBlockConfiguration as Record<string, unknown>).BlockPublicPolicy = false; })), /BlockPublicPolicy not on/));
  test('fail: versioning suspended', () => one(bucketProblems(broken(t, b, (p) => { p.VersioningConfiguration = { Status: 'Suspended' }; })), /versioning/));
  test('fail: S3-managed keys instead of KMS', () =>
    one(bucketProblems(broken(t, b, (p) => { p.BucketEncryption = { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] }; })), /KMS/));
  test('fail: bucket policy without the TLS-only statement', () =>
    one(bucketProblems(broken(t, 'AWS::S3::BucketPolicy', (p) => {
      const doc = p.PolicyDocument as { Statement: Record<string, unknown>[] };
      doc.Statement = doc.Statement.filter((s) => !JSON.stringify(s.Condition ?? {}).includes('SecureTransport'));
    })), /plain HTTP/));
  test('fail: a bucket missing', () => {
    const copy = structuredClone(t);
    delete copy.Resources[Object.keys(copy.Resources).find((k) => copy.Resources[k]!.Type === b)!];
    assert.ok(bucketProblems(copy).includes('2 buckets, expected 3'));
  });
});

describe('availability (P-562)', () => {
  test('pass: production database is Multi-AZ, staging single-AZ', () => {
    assert.deepEqual(availabilityProblems('production', template('production')), []);
    assert.deepEqual(availabilityProblems('staging', template('staging')), []);
  });
  test('fail: production single-AZ is refused', () =>
    one(availabilityProblems('production', broken(template('production'), 'AWS::RDS::DBInstance', (p) => { p.MultiAZ = false; })), /expected true/));
  test('fail: staging Multi-AZ (paying for a standby) is refused', () =>
    one(availabilityProblems('staging', template('production')), /expected false/));
  test('the network spans two availability zones in both environments', () => {
    for (const env of environments) {
      const zones = new Set(Object.values(template(env).Resources).filter((r) => r.Type === 'AWS::EC2::Subnet').map((r) => r.Properties!.AvailabilityZone));
      assert.deepEqual([...zones].sort(), ['ca-central-1a', 'ca-central-1b']);
    }
  });
});
