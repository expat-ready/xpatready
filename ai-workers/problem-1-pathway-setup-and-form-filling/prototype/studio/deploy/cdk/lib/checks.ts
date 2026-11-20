// PF-8a's checks over a synthesized CloudFormation template: pure functions, each returning plain-words findings (an
// empty list = pass). The tests run them on the real stacks (must pass) and on broken stacks or templates (must fail),
// so a check that cannot fail is caught. PF-8rc extends `regionFindings`' allow list with the ca-west-1 backup copy.
type Resource = { Type: string; Properties?: Record<string, unknown> };
export type Template = { Resources?: Record<string, Resource> };
export type SynthStack = { name: string; region: string; template: Template };
/** A region other than the home one, allowed only inside resources of these CloudFormation types (PF-8rc: backups). */
export type RegionAllowance = { region: string; types: string[] };

export const HOME = "ca-central-1";
// An AWS region name anywhere in a string: us-east-1, ca-west-1, ap-southeast-2, us-gov-west-1, eu-central-2, ...
const REGION_RE = /\b(?:us|ca|eu|ap|sa|me|af|il|mx|cn)-(?:gov-|iso-|isob-)?(?:north|south|east|west|central|northeast|northwest|southeast|southwest)-\d\b/g;

const resources = (t: Template, type: string) => Object.entries(t.Resources ?? {}).filter(([, r]) => r.Type === type);
const json = (v: unknown) => JSON.stringify(v ?? null);

/** Every stack's region is the home region, and no resource names another region (an ARN, a replication target, a
 *  log destination), except an allowed region inside an allowed resource type. */
export function regionFindings(stacks: SynthStack[], allow: RegionAllowance[] = []): string[] {
  const out: string[] = [];
  for (const s of stacks) {
    if (s.region !== HOME) out.push(`${s.name}: stack region ${s.region}, not ${HOME}`);
    for (const [id, r] of Object.entries(s.template.Resources ?? {})) {
      for (const region of new Set(json(r.Properties).match(REGION_RE) ?? [])) {
        if (region === HOME) continue;
        if (allow.some((a) => a.region === region && a.types.includes(r.Type))) continue;
        out.push(`${s.name}/${id} (${r.Type}) names region ${region}`);
      }
    }
  }
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
      .some((s) => s.Effect === "Deny" && json(s.Condition).includes('"aws:SecureTransport":"false"')));
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
