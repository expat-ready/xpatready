// PF-8a's checks over a synthesized CloudFormation template: pure functions, each returning plain-words findings (an
// empty list = pass). The tests run them on the real stacks (must pass) and on broken stacks or templates (must fail),
// so a check that cannot fail is caught. PF-8rc extends `regionFindings`' allow list with the ca-west-1 backup copy.
type Resource = { Type: string; Properties?: Record<string, unknown> };
export type Template = { Resources?: Record<string, Resource>; Parameters?: unknown; Outputs?: unknown; Mappings?: unknown; Conditions?: unknown; Rules?: unknown };
export type SynthStack = { name: string; region: string; template: Template };
/** A region other than the home one, allowed only inside resources of these CloudFormation types (PF-8rc: backups). */
export type RegionAllowance = { region: string; types: string[] };

export const HOME = "ca-central-1";
// An AWS region name anywhere in a string: us-east-1, ca-west-1, ap-southeast-2, us-gov-west-1, us-isof-south-1,
// eu-isoe-west-1, eusc-de-east-1, ... (a partition-ish prefix, optional middle words, a compass word, a digit).
const REGION_RE = /\b[a-z]{2,4}-(?:[a-z]{2,5}-)?(?:north|south|east|west|central|northeast|northwest|southeast|southwest)-\d\b/g;
// Resources that send data to another place by design: each must point at a bucket in a scanned (home-region) stack.
const CROSS_REGION_TYPES = ["AWS::S3::MultiRegionAccessPoint", "AWS::S3::MultiRegionAccessPointPolicy", "AWS::DynamoDB::GlobalTable", "AWS::RDS::GlobalCluster"];

const resources = (t: Template, type: string) => Object.entries(t.Resources ?? {}).filter(([, r]) => r.Type === type);
const json = (v: unknown) => JSON.stringify(v ?? null);
const regionsIn = (v: unknown) => new Set(json(v).match(REGION_RE) ?? []);

/** Every stack's region is the home region, and nothing in a template (resources, parameters, outputs, mappings) names
 *  another region, except an allowed region inside an allowed resource type. An S3 replication rule must target a
 *  bucket defined in one of the scanned stacks (a bucket ARN carries no region, so a name cannot be trusted), and a
 *  multi-region resource type is never allowed. Feed it every stack of the app (`allStacks` in app.ts), nested ones too. */
export function regionFindings(stacks: SynthStack[], allow: RegionAllowance[] = []): string[] {
  const out: string[] = [];
  const ownBuckets = new Set(stacks.flatMap((s) => resources(s.template, "AWS::S3::Bucket").map(([id]) => `${s.name}/${id}`)));
  for (const s of stacks) {
    if (s.region !== HOME) out.push(`${s.name}: stack region ${s.region}, not ${HOME}`);
    for (const section of ["Parameters", "Outputs", "Mappings", "Conditions", "Rules"] as const) {
      for (const region of regionsIn(s.template[section])) if (region !== HOME) out.push(`${s.name} ${section} names region ${region}`);
    }
    for (const [id, r] of Object.entries(s.template.Resources ?? {})) {
      for (const region of regionsIn(r)) {
        if (region === HOME) continue;
        if (allow.some((a) => a.region === region && a.types.includes(r.Type))) continue;
        out.push(`${s.name}/${id} (${r.Type}) names region ${region}`);
      }
      if (CROSS_REGION_TYPES.includes(r.Type) && !allow.some((a) => a.types.includes(r.Type))) out.push(`${s.name}/${id} (${r.Type}) is a multi-region resource`);
      const rules = ((r.Properties?.ReplicationConfiguration as { Rules?: { Destination?: { Bucket?: unknown } }[] } | undefined)?.Rules) ?? [];
      for (const rule of rules) {
        const dest = rule.Destination?.Bucket as { "Fn::GetAtt"?: [string, string]; Ref?: string } | undefined;
        const target = dest?.["Fn::GetAtt"]?.[0] ?? dest?.Ref;
        if (!target || !ownBuckets.has(`${s.name}/${target}`)) out.push(`${s.name}/${id} (${r.Type}) replicates to a bucket outside the scanned stacks: ${json(rule.Destination?.Bucket)}`);
      }
    }
  }
  return out;
}

/** No route (internet or NAT) leaves the database's subnets: every route table its subnet group's subnets use has none. */
export function dataRouteFindings(t: Template): string[] {
  const out: string[] = [];
  const res = t.Resources ?? {};
  const groups = resources(t, "AWS::RDS::DBSubnetGroup");
  if (groups.length === 0) out.push("no database subnet group");
  const subnets = new Set(groups.flatMap(([, g]) => ((g.Properties?.SubnetIds as { Ref?: string }[]) ?? []).map((x) => x.Ref ?? "")));
  const tables = new Set(resources(t, "AWS::EC2::SubnetRouteTableAssociation").filter(([, a]) => subnets.has((a.Properties?.SubnetId as { Ref?: string })?.Ref ?? "")).map(([, a]) => (a.Properties?.RouteTableId as { Ref?: string })?.Ref ?? ""));
  if (subnets.size > 0 && tables.size < subnets.size) out.push(`database subnets ${subnets.size}, route tables found ${tables.size}`);
  for (const [id, r] of Object.entries(res)) {
    if (r.Type === "AWS::EC2::Route" && tables.has((r.Properties?.RouteTableId as { Ref?: string })?.Ref ?? "")) out.push(`${id}: a route leaves a database subnet (${json(r.Properties?.DestinationCidrBlock ?? r.Properties?.DestinationIpv6CidrBlock)})`);
  }
  for (const id of subnets) if (res[id]?.Properties?.MapPublicIpOnLaunch === true) out.push(`${id}: a database subnet gives public addresses`);
  return out;
}

/** The database: not public, encrypted with a KMS key, deletion-protected, 35 days of automated backups (point-in-time
 *  restore), TLS forced and terse error logs. */
export function databaseFindings(t: Template, days = 35): string[] {
  const out: string[] = [];
  const dbs = resources(t, "AWS::RDS::DBInstance");
  if (dbs.length === 0) out.push("no database instance");
  for (const [id, r] of dbs) {
    const p = r.Properties ?? {};
    if (p.PubliclyAccessible !== false) out.push(`${id}: PubliclyAccessible is ${json(p.PubliclyAccessible)}, not false`);
    if (p.StorageEncrypted !== true) out.push(`${id}: storage not encrypted`);
    if (!p.KmsKeyId) out.push(`${id}: no KMS key`);
    if (p.DeletionProtection !== true) out.push(`${id}: deletion protection off`);
    if (p.BackupRetentionPeriod !== days) out.push(`${id}: backups kept ${json(p.BackupRetentionPeriod)} days, not ${days}`);
    const pg = p.DBParameterGroupName as { Ref?: string } | undefined;
    const params = (pg?.Ref && t.Resources?.[pg.Ref]?.Properties?.Parameters) as Record<string, string> | undefined;
    if (params?.["rds.force_ssl"] !== "1") out.push(`${id}: rds.force_ssl is not on`);
    if (params?.log_error_verbosity !== "terse") out.push(`${id}: log_error_verbosity is not terse`);
  }
  return out;
}

/** Every bucket blocks all public access, keeps versions, is KMS-encrypted and refuses plain HTTP by its policy. */
export function bucketFindings(t: Template): string[] {
  const out: string[] = [];
  const policies = resources(t, "AWS::S3::BucketPolicy").map(([, r]) => r.Properties ?? {});
  for (const [id, r] of resources(t, "AWS::S3::Bucket")) {
    const p = r.Properties ?? {};
    const block = (p.PublicAccessBlockConfiguration ?? {}) as Record<string, unknown>;
    for (const k of ["BlockPublicAcls", "BlockPublicPolicy", "IgnorePublicAcls", "RestrictPublicBuckets"]) if (block[k] !== true) out.push(`${id}: ${k} is not true`);
    if ((p.VersioningConfiguration as { Status?: string } | undefined)?.Status !== "Enabled") out.push(`${id}: versioning not enabled`);
    if (!json(p.BucketEncryption).includes('"aws:kms"')) out.push(`${id}: not KMS-encrypted`);
    const tlsOnly = policies.some((pp) => json(pp.Bucket).includes(`"${id}"`) && ((pp.PolicyDocument as { Statement?: Record<string, unknown>[] })?.Statement ?? [])
      .some((s) => s.Effect === "Deny" && json(s.Condition).includes('"aws:SecureTransport":"false"')
        && (s.Principal === "*" || json(s.Principal) === '{"AWS":"*"}') && (s.Action === "s3:*" || json(s.Action) === '["s3:*"]')));
    if (!tlsOnly) out.push(`${id}: no policy refusing plain HTTP`);
  }
  return out;
}

/** Production's database runs in two zones; staging's in one (cost, P-562). */
export function availabilityFindings(t: Template, stage: "staging" | "production"): string[] {
  return resources(t, "AWS::RDS::DBInstance").flatMap(([id, r]) => {
    const multi = r.Properties?.MultiAZ === true;
    if (stage === "production" && !multi) return [`${id}: production database is not Multi-AZ`];
    if (stage === "staging" && multi) return [`${id}: staging database is Multi-AZ (cost)`];
    return [];
  });
}
