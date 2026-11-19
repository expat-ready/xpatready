// PF-8a: the estate's rules as plain checks over synthesised CloudFormation. Each returns the list of problems
// (empty = the rule holds), so every test can show both a pass (the real stacks) and a fail (one property broken).
import type { cx_api } from 'aws-cdk-lib';

export type Json = Record<string, unknown>;
export interface CfnResource { Type: string; Properties?: Json }
export interface CfnTemplate { Resources: Record<string, CfnResource>; Outputs?: Json; Parameters?: Json }

const resourcesOf = (t: CfnTemplate, type: string) =>
  Object.entries(t.Resources).filter(([, r]) => r.Type === type) as [string, CfnResource][];
const refTo = (v: unknown): string | undefined =>
  v && typeof v === 'object' ? ((v as Json).Ref as string | undefined) ?? (((v as Json)['Fn::GetAtt'] as string[] | undefined)?.[0]) : undefined;

// ---------- Region guard (C1-3's region allowlist) ----------
export const HOME_REGION = 'ca-central-1';
/** The only other region allowed, and only for PF-8r's backup copy (AWS Backup plans). */
export const BACKUP_COPY = { region: 'ca-west-1', resourceTypes: ['AWS::Backup::BackupPlan'] };
// Every AWS region name has this shape: us-east-1, ca-west-1, ap-southeast-2, us-gov-west-1, eu-central-2 ...
const REGION_NAME = /\b(?:us-gov|us-iso[a-z]?|[a-z]{2})-(?:north|south|east|west|central|northeast|northwest|southeast|southwest)-\d\b/g;

function regionsIn(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') for (const m of value.matchAll(REGION_NAME)) found.add(m[0]);
  else if (Array.isArray(value)) value.forEach((v) => regionsIn(v, found));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { regionsIn(k, found); regionsIn(v, found); });
  return found;
}

/** Problems with where the estate lives: every stack in ca-central-1, and no resource, replication target,
 *  log destination or output naming another region (except the ca-west-1 backup copy). */
export function regionProblems(assembly: cx_api.CloudAssembly): string[] {
  const problems: string[] = [];
  for (const stack of assembly.stacksRecursively) {
    const region = stack.environment.region;
    if (region !== HOME_REGION) problems.push(`stack ${stack.stackName} is in ${region}, not ${HOME_REGION}`);
    const template = stack.template as CfnTemplate;
    for (const [id, r] of Object.entries(template.Resources ?? {})) {
      for (const other of regionsIn(r.Properties)) {
        if (other === HOME_REGION) continue;
        if (other === BACKUP_COPY.region && BACKUP_COPY.resourceTypes.includes(r.Type)) continue;
        problems.push(`${stack.stackName}/${id} (${r.Type}) names ${other}`);
      }
    }
    for (const part of ['Outputs', 'Parameters'] as const) {
      for (const other of regionsIn(template[part])) {
        if (other !== HOME_REGION) problems.push(`${stack.stackName} ${part} name ${other}`);
      }
    }
  }
  return problems;
}

// ---------- Database ----------
export const BACKUP_DAYS = 35;

/** Problems with the database: reachable from the internet, unencrypted, deletable, short backups, plain-text
 *  connections allowed, or chatty error logs. */
export function databaseProblems(t: CfnTemplate): string[] {
  const problems: string[] = [];
  const instances = resourcesOf(t, 'AWS::RDS::DBInstance');
  if (instances.length === 0) problems.push('no database instance');
  for (const [id, { Properties: p = {} }] of instances) {
    if (p.PubliclyAccessible !== false) problems.push(`${id}: publicly accessible`);
    if (p.StorageEncrypted !== true) problems.push(`${id}: storage not encrypted`);
    if (!p.KmsKeyId) problems.push(`${id}: no KMS key`);
    if (p.DeletionProtection !== true) problems.push(`${id}: no deletion protection`);
    if (p.BackupRetentionPeriod !== BACKUP_DAYS) problems.push(`${id}: backups kept ${String(p.BackupRetentionPeriod)} days, not ${BACKUP_DAYS}`);

    // Not reachable: every subnet it can sit in has no route to an internet gateway, and no ingress from anywhere.
    const group = t.Resources[refTo(p.DBSubnetGroupName) ?? '']?.Properties;
    const subnets = ((group?.SubnetIds as unknown[]) ?? []).map(refTo);
    if (subnets.length === 0) problems.push(`${id}: no subnet group`);
    const gateways = new Set(resourcesOf(t, 'AWS::EC2::InternetGateway').map(([gid]) => gid));
    for (const subnet of subnets) {
      const tables = resourcesOf(t, 'AWS::EC2::SubnetRouteTableAssociation')
        .filter(([, a]) => refTo(a.Properties?.SubnetId) === subnet).map(([, a]) => refTo(a.Properties?.RouteTableId));
      const open = resourcesOf(t, 'AWS::EC2::Route').some(([, rt]) =>
        tables.includes(refTo(rt.Properties?.RouteTableId)) && gateways.has(refTo(rt.Properties?.GatewayId) ?? ''));
      if (open) problems.push(`${id}: subnet ${subnet} routes to the internet`);
    }
    for (const sg of ((p.VPCSecurityGroups as unknown[]) ?? []).map(refTo)) {
      const ingress = (t.Resources[sg ?? '']?.Properties?.SecurityGroupIngress as Json[] | undefined) ?? [];
      const standalone = resourcesOf(t, 'AWS::EC2::SecurityGroupIngress').filter(([, i]) => refTo(i.Properties?.GroupId) === sg).map(([, i]) => i.Properties ?? {});
      for (const rule of [...ingress, ...standalone]) {
        if (rule.CidrIp === '0.0.0.0/0' || rule.CidrIpv6 === '::/0') problems.push(`${id}: security group ${sg} open to the internet`);
      }
    }

    const params = (t.Resources[refTo(p.DBParameterGroupName) ?? '']?.Properties?.Parameters as Json | undefined) ?? {};
    if (String(params['rds.force_ssl']) !== '1') problems.push(`${id}: rds.force_ssl not on`);
    if (params.log_error_verbosity !== 'terse') problems.push(`${id}: log_error_verbosity not terse`);
  }
  return problems;
}

export const multiAzOf = (t: CfnTemplate) => resourcesOf(t, 'AWS::RDS::DBInstance').map(([, r]) => r.Properties?.MultiAZ === true);

// ---------- Buckets ----------
/** Problems with the file buckets: public access possible, no versioning, no KMS key, or plain HTTP allowed. */
export function bucketProblems(t: CfnTemplate, expected = 3): string[] {
  const problems: string[] = [];
  const buckets = resourcesOf(t, 'AWS::S3::Bucket');
  if (buckets.length !== expected) problems.push(`${buckets.length} buckets, expected ${expected}`);
  const policies = resourcesOf(t, 'AWS::S3::BucketPolicy');
  for (const [id, { Properties: p = {} }] of buckets) {
    const block = (p.PublicAccessBlockConfiguration as Json | undefined) ?? {};
    for (const k of ['BlockPublicAcls', 'BlockPublicPolicy', 'IgnorePublicAcls', 'RestrictPublicBuckets']) {
      if (block[k] !== true) problems.push(`${id}: ${k} not on`);
    }
    if ((p.VersioningConfiguration as Json | undefined)?.Status !== 'Enabled') problems.push(`${id}: versioning not on`);
    const rule = (((p.BucketEncryption as Json | undefined)?.ServerSideEncryptionConfiguration as Json[] | undefined)?.[0]
      ?.ServerSideEncryptionByDefault as Json | undefined) ?? {};
    if (rule.SSEAlgorithm !== 'aws:kms' || !rule.KMSMasterKeyID) problems.push(`${id}: not encrypted with a KMS key`);

    const statements = policies.filter(([, bp]) => refTo(bp.Properties?.Bucket) === id)
      .flatMap(([, bp]) => ((bp.Properties?.PolicyDocument as Json | undefined)?.Statement as Json[] | undefined) ?? []);
    const refusesHttp = statements.some((s) =>
      s.Effect === 'Deny' &&
      (s.Principal === '*' || (s.Principal as Json | undefined)?.AWS === '*') &&
      [s.Action].flat().includes('s3:*') &&
      String(((s.Condition as Json | undefined)?.Bool as Json | undefined)?.['aws:SecureTransport']) === 'false');
    if (!refusesHttp) problems.push(`${id}: plain HTTP not refused`);
  }
  return problems;
}

/** Production keeps a standby database in the second zone; staging runs one, for cost (P-562). */
export function availabilityProblems(environment: 'staging' | 'production', t: CfnTemplate): string[] {
  const want = environment === 'production';
  const got = multiAzOf(t);
  if (got.length === 0) return ['no database instance'];
  return got.every((m) => m === want) ? [] : [`${environment}: database Multi-AZ is ${String(!want)}, expected ${String(want)}`];
}
