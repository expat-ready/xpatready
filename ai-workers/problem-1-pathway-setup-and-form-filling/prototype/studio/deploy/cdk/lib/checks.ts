// PF-8a's checks over a synthesized CloudFormation template: pure functions, each returning plain-words findings (an
// empty list = pass). The tests run them on the real stacks (must pass) and on broken stacks or templates (must fail),
// so a check that cannot fail is caught. PF-8rc adds the backup checks (`backupFindings`, `vaultFindings`,
// `bypassFindings`) and a whole-stack allowance for the ca-west-1 copy vault (`REGION_ALLOW`).
import { BYPASS_ACTIONS, COPY_REGION, KEY_DESTROY_ACTIONS, RETENTION_DAYS } from "./backup.ts";
import { SIGN_IN_ACTIONS } from "./service.ts";
type Resource = { Type: string; Properties?: Record<string, unknown> };
export type Template = { Resources?: Record<string, Resource>; Parameters?: unknown; Outputs?: unknown; Mappings?: unknown; Conditions?: unknown; Rules?: unknown };
export type SynthStack = { name: string; region: string; template: Template };
/** A region other than the home one, allowed only inside resources of these CloudFormation types; with `stackTypes`, a
 *  whole stack may sit in that region when it holds resources of only those types (PF-8rc: the backup copy vault). */
export type RegionAllowance = { region: string; types: string[]; stackTypes?: string[] };
/** The estate's one allowance (PF-8rc, P-586): the plan's copy rule names ca-west-1, and a ca-west-1 stack may hold only
 *  the copy vault and its key. Nothing else outside ca-central-1. */
export const REGION_ALLOW: RegionAllowance[] = [{ region: COPY_REGION, types: ["AWS::Backup::BackupPlan"], stackTypes: ["AWS::KMS::Key", "AWS::KMS::Alias", "AWS::Backup::BackupVault"] }];

export const HOME = "ca-central-1";
// An AWS region name anywhere in a string: us-east-1, ca-west-1, ap-southeast-2, us-gov-west-1, us-isof-south-1,
// eu-isoe-west-1, eusc-de-east-1, ... (a partition-ish prefix, optional middle words, a compass word, a digit).
// Case-insensitive, and the digit may be followed by an AZ letter or an id (us-east-1a, us-east-1_AbC: break 4).
const REGION_RE = /(?<![a-z0-9])[a-z]{2,4}-(?:[a-z]{2,5}-)?(?:north|south|east|west|central|northeast|northwest|southeast|southwest)-\d+(?![0-9])/gi;
// Resources that send data to another place by design: each must point at a bucket in a scanned (home-region) stack.
// (PF-8rc break B8: a KMS replica key, and a backup report plan, which delivers to a bucket that may be anywhere)
const CROSS_REGION_TYPES = ["AWS::S3::MultiRegionAccessPoint", "AWS::S3::MultiRegionAccessPointPolicy", "AWS::DynamoDB::GlobalTable", "AWS::RDS::GlobalCluster", "AWS::KMS::ReplicaKey", "AWS::Backup::ReportPlan"];

const resources = (t: Template, type: string) => Object.entries(t.Resources ?? {}).filter(([, r]) => r.Type === type);
const json = (v: unknown) => JSON.stringify(v ?? null);
/** A template value with every Fn::Join of literal parts joined (a region split across parts, "us-" + "east-1", is seen
 *  whole; break 4); non-literal parts (a Ref, a GetAtt) join as nothing. */
const flatten = (v: unknown, defaults: Record<string, string> = {}): unknown => {
  const f = (x: unknown) => flatten(x, defaults);
  if (Array.isArray(v)) return v.map(f);
  if (typeof v === "string") return v.replace(/\$\{([A-Za-z0-9_]+)\}/g, (m, n) => defaults[n] ?? m); // Fn::Sub's ${Param}
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>, j = o["Fn::Join"] as [string, unknown[]] | undefined;
    // a Ref to a parameter is seen as its default (PF-8rc break B3: "us-ea" + a parameter defaulting to "st-1")
    if (typeof o.Ref === "string" && Object.keys(o).length === 1 && defaults[o.Ref] !== undefined) return defaults[o.Ref];
    // parts are flattened first, so a region split across nested joins is seen whole too (PF-8a review R2)
    if (Array.isArray(j) && Array.isArray(j[1])) { const parts = j[1].map(f); return parts.map((p) => (typeof p === "string" ? p : "")).join(typeof j[0] === "string" ? j[0] : "") + " " + json(parts); }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, f(x)]));
  }
  return v;
};
const defaultsOf = (t: Template) => Object.fromEntries(Object.entries((t.Parameters ?? {}) as Record<string, { Default?: unknown }>).filter(([, p]) => p.Default !== undefined).map(([n, p]) => [n, String(p.Default)]));
/** Values whose region the guard cannot read from the template (PF-8rc break B3): Fn::Sub with a variable map, an
 *  imported value, and a dynamic reference other than this stack's own Secrets Manager secret (the database password). */
/** PF-8b: a parameter that can hold only an image digest (sha256 + 64 hex) cannot name a region: PF-8c's deploy sets it. */
const digestOnly = (p: unknown) => json(p) === json({ Type: "String", AllowedPattern: "^sha256:[a-f0-9]{64}$", Description: (p as { Description?: string })?.Description });
const opaque = (t: Template, v: unknown): string[] => {
  const out: string[] = [], params = (t.Parameters ?? {}) as Record<string, unknown>;
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (typeof x === "string") {
      if (x.includes("{{resolve:")) out.push(`a dynamic reference (${x.slice(0, 60)})`);
      for (const [, n] of x.matchAll(/\$\{([A-Za-z0-9_]+)\}/g)) if (params[n]) out.push(`a parameter set at deploy time (${n})`); // Fn::Sub's ${Param} (round 3, R3-3)
      return;
    }
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (Array.isArray(o["Fn::Sub"]) && Object.keys((o["Fn::Sub"] as unknown[])[1] ?? {}).length > 0) out.push("Fn::Sub with a variable map");
    if (o["Fn::ImportValue"] !== undefined) out.push("Fn::ImportValue");
    if (o["Fn::FindInMap"] !== undefined) out.push("Fn::FindInMap"); // a mapping's halves joined (round 2, R2-3)
    // any template parameter: a deploy can override its default, so the default proves nothing (round 3, R3-3; N1)
    if (typeof o.Ref === "string" && params[o.Ref] && !digestOnly(params[o.Ref])) out.push(`a parameter set at deploy time (${o.Ref})`);
    const j = o["Fn::Join"] as [string, unknown[]] | undefined;
    if (j !== undefined && typeof (j as unknown[])?.[0] !== "string") out.push("a Fn::Join whose delimiter is not a literal");
    if (Array.isArray(j) && Array.isArray(j[1])) {
      j[1].forEach((p, i) => {
        const next = j[1][i + 1] as { Ref?: string } | undefined;
        if (p === "{{resolve:secretsmanager:" && next?.Ref && t.Resources?.[next.Ref]?.Type === "AWS::SecretsManager::Secret") return; // own secret
        walk(p);
      });
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(v);
  return out;
};
/** PF-23c: the one deploy parameter a resource may read is the on-call address, as an email subscription's Endpoint
 *  and nothing else: `{ Ref: "OnCallEmail" }` on an AWS::SNS::Subscription with Protocol email, the parameter a String
 *  with no default and the email-only AllowedPattern. An email address moves no data to a region; any other parameter
 *  Ref, property, protocol or pattern is still refused. Returns the resource with that one Endpoint left out. */
export const ON_CALL_PARAMETER = { name: "OnCallEmail", allowedPattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" } as const;
const withoutOnCallEmail = (t: Template, r: Resource): Resource => {
  const p = r.Properties ?? {}, param = ((t.Parameters ?? {}) as Record<string, Record<string, unknown>>)[ON_CALL_PARAMETER.name];
  const ok = r.Type === "AWS::SNS::Subscription" && p.Protocol === "email" && json(p.Endpoint) === json({ Ref: ON_CALL_PARAMETER.name })
    && param?.Type === "String" && param.Default === undefined && param.AllowedPattern === ON_CALL_PARAMETER.allowedPattern;
  if (!ok) return r;
  const { Endpoint: _, ...rest } = p;
  return { ...r, Properties: rest };
};
const regionsIn = (v: unknown, defaults: Record<string, string> = {}) => new Set((json(flatten(v, defaults)).match(REGION_RE) ?? []).map((r) => r.toLowerCase().replace(/^(.*-\d+).*$/, "$1")));
/** True when a KMS key reference points at an AWS::KMS::Key defined in this template (not an alias such as aws/rds). */
const ownKey = (t: Template, ref: unknown) => {
  const r = ref as { "Fn::GetAtt"?: [string, string]; Ref?: string } | undefined;
  const id = r?.["Fn::GetAtt"]?.[0] ?? r?.Ref;
  return !!id && t.Resources?.[id]?.Type === "AWS::KMS::Key";
};

/** Every stack's region is the home region, and nothing in a template (resources, parameters, outputs, mappings) names
 *  another region, except an allowed region inside an allowed resource type. An S3 replication rule must target a
 *  bucket defined in one of the scanned stacks (a bucket ARN carries no region, so a name cannot be trusted), and a
 *  multi-region resource type is never allowed. Feed it every stack of the app (`allStacks` in app.ts), nested ones too. */
export function regionFindings(stacks: SynthStack[], allow: RegionAllowance[] = []): string[] {
  const out: string[] = [];
  const ownBuckets = new Set(stacks.flatMap((s) => resources(s.template, "AWS::S3::Bucket").map(([id]) => `${s.name}/${id}`)));
  for (const s of stacks) {
    const types = [...new Set(Object.values(s.template.Resources ?? {}).map((r) => r.Type))];
    const stackOk = allow.find((a) => a.region === s.region && a.stackTypes);
    if (s.region !== HOME && !stackOk) out.push(`${s.name}: stack region ${s.region}, not ${HOME}`);
    if (s.region !== HOME && stackOk) for (const t of types.filter((t) => !stackOk.stackTypes!.includes(t))) out.push(`${s.name}: ${t} in region ${s.region}, where only ${stackOk.stackTypes!.join(", ")} may be`);
    const here = (region: string, type: string) => region === s.region && !!stackOk?.stackTypes?.includes(type); // the copy stack's own region, inside its allowed types
    const d = defaultsOf(s.template);
    for (const section of ["Parameters", "Outputs", "Mappings", "Conditions", "Rules"] as const) {
      for (const region of regionsIn(s.template[section])) if (region !== HOME) out.push(`${s.name} ${section} names region ${region}`);
      // Rules only assert at deploy time (CDK's bootstrap-version check reads an SSM parameter); they feed no resource
      if (section !== "Rules") for (const why of opaque(s.template, s.template[section])) out.push(`${s.name} ${section}: ${why}, whose region the guard cannot read`);
    }
    for (const [id, r] of Object.entries(s.template.Resources ?? {})) {
      const bare = withoutOnCallEmail(s.template, r); // PF-23c: both checks below read the same resource (review R2-M1)
      for (const why of opaque(s.template, bare)) out.push(`${s.name}/${id} (${r.Type}): ${why}, whose region the guard cannot read`);
      // a dynamic reference split across Fn::Join parts is seen once the parts are joined (round 2, R2-3)
      if (!opaque(s.template, bare).length && /\{\{resolve:(?!secretsmanager:)/.test(json(flatten(r, d)))) out.push(`${s.name}/${id} (${r.Type}): a dynamic reference (joined from parts), whose region the guard cannot read`);
      if (r.Type === "AWS::KMS::Key" && r.Properties?.MultiRegion !== undefined && r.Properties.MultiRegion !== false) out.push(`${s.name}/${id} (${r.Type}) is a multi-region key`);
      for (const region of regionsIn(r, d)) {
        if (region === HOME || here(region, r.Type)) continue;
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
    else if (!ownKey(t, p.KmsKeyId)) out.push(`${id}: KMS key is not one this stack defines (${json(p.KmsKeyId)})`);
    if (p.DeletionProtection !== true) out.push(`${id}: deletion protection off`);
    if (p.BackupRetentionPeriod !== days) out.push(`${id}: backups kept ${json(p.BackupRetentionPeriod)} days, not ${days}`);
    const pg = p.DBParameterGroupName as { Ref?: string } | undefined;
    const params = (pg?.Ref && t.Resources?.[pg.Ref]?.Properties?.Parameters) as Record<string, string> | undefined;
    if (params?.["rds.force_ssl"] !== "1") out.push(`${id}: rds.force_ssl is not on`);
    if (params?.log_error_verbosity !== "terse") out.push(`${id}: log_error_verbosity is not terse`);
  }
  return out;
}

/** PF-F1c: the server access logs are kept this many days (the row's value; the app log group's 90 days, PF-23c). */
export const ACCESS_LOG_DAYS = 90;
/** PF-F1c: an upload started and never finished is aborted after this many days (its parts are billed until then). */
export const ABORT_UPLOAD_DAYS = 1;
type Rule = { Status?: string; Prefix?: unknown; TagFilters?: unknown; ObjectSizeGreaterThan?: unknown; ObjectSizeLessThan?: unknown; ExpirationInDays?: number; NoncurrentVersionExpiration?: { NoncurrentDays?: number }; AbortIncompleteMultipartUpload?: { DaysAfterInitiation?: number } };
const rulesOf = (p: Record<string, unknown>) => ((p.LifecycleConfiguration as { Rules?: Rule[] } | undefined)?.Rules) ?? [];
/** A rule over every object: no prefix, tag or size filter narrows it (break B5, B6). */
const whole = (x: Rule) => x.Status === "Enabled" && x.Prefix === undefined && x.TagFilters === undefined && x.ObjectSizeGreaterThan === undefined && x.ObjectSizeLessThan === undefined;
const logTargetOf = (p: Record<string, unknown>) => (p.LoggingConfiguration as { DestinationBucketName?: { Ref?: string } } | undefined)?.DestinationBucketName?.Ref;
/** PF-F1c: the stack's access-log bucket (estate.ts's `AccessLogsBucket`): a bucket of this stack with that id, that
 *  another bucket of it names as its log target and that logs nowhere itself. Any other log target is a data bucket and
 *  keeps every data rule (break B3: a data bucket logged into cannot pose as one). They hold S3's request log lines, never a firm's file; bucketFindings holds them to their own
 *  rules, and the backup plan leaves them out (their lines expire after ACCESS_LOG_DAYS anyway). */
export function accessLogBuckets(t: Template): Set<string> {
  const ids = new Set(resources(t, "AWS::S3::Bucket").map(([id]) => id));
  return new Set(resources(t, "AWS::S3::Bucket").map(([, r]) => logTargetOf(r.Properties ?? {})).filter((x): x is string => !!x && ids.has(x) && /^AccessLogsBucket[0-9A-F]{8}$/.test(x) && !logTargetOf(t.Resources![x].Properties ?? {})));
}

/** Every bucket blocks all public access and refuses plain HTTP by its policy. A data bucket also keeps versions, is
 *  KMS-encrypted with this stack's key, refuses a put not encrypted with aws:kms (PF-F1c), logs its requests to an
 *  access-log bucket of this stack (PF-F1c) and aborts an unfinished upload after a day (PF-F1c). An access-log bucket is
 *  encrypted with S3's own key (aws-cdk-lib 2.275.0 refuses the aws/s3 KMS key for a log target; a customer key would
 *  need S3's logging service on the data key's policy), keeps its lines ACCESS_LOG_DAYS and aborts unfinished uploads. */
export function bucketFindings(t: Template): string[] {
  const out: string[] = [];
  const policies = resources(t, "AWS::S3::BucketPolicy").map(([, r]) => r.Properties ?? {});
  const logs = accessLogBuckets(t);
  const statementsFor = (id: string) => policies.filter((pp) => json(pp.Bucket).includes(`"${id}"`)).flatMap((pp) => ((pp.PolicyDocument as { Statement?: Record<string, unknown>[] })?.Statement ?? []));
  const onObjects = (s: Record<string, unknown>, id: string) => json(s.Resource).includes(`"${id}"`) && json(s.Resource).includes('"/*"');
  // break B7: the put denies cover exactly every object of the bucket, nothing narrower
  const allObjects = (s: Record<string, unknown>, id: string) => json(s.Resource) === json({ "Fn::Join": ["", [{ "Fn::GetAtt": [id, "Arn"] }, "/*"]] });
  if (logs.size > 1) out.push(`${logs.size} access-log buckets, not 1`);
  for (const [id, r] of resources(t, "AWS::S3::Bucket")) {
    const p = r.Properties ?? {};
    const block = (p.PublicAccessBlockConfiguration ?? {}) as Record<string, unknown>;
    for (const k of ["BlockPublicAcls", "BlockPublicPolicy", "IgnorePublicAcls", "RestrictPublicBuckets"]) if (block[k] !== true) out.push(`${id}: ${k} is not true`);
    const rules = rulesOf(p);
    if (!rules.some((x) => whole(x) && x.AbortIncompleteMultipartUpload?.DaysAfterInitiation === ABORT_UPLOAD_DAYS)) out.push(`${id}: an unfinished upload is not aborted after ${ABORT_UPLOAD_DAYS} day`);
    if (logs.has(id)) {
      if (json(p.BucketEncryption) !== json({ ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] })) out.push(`${id}: the access-log bucket is not encrypted with S3's own key (AES256)`);
      if (!rules.some((x) => whole(x) && x.ExpirationInDays === ACCESS_LOG_DAYS)) out.push(`${id}: access log lines are not kept ${ACCESS_LOG_DAYS} days`);
      if (rules.some((x) => x.Status === "Enabled" && typeof x.ExpirationInDays === "number" && x.ExpirationInDays < ACCESS_LOG_DAYS)) out.push(`${id}: access log lines expire before ${ACCESS_LOG_DAYS} days`);
      // break B5: not versioned, so an expired line is gone, not kept as an old version for ever
      if (p.VersioningConfiguration !== undefined) out.push(`${id}: the access-log bucket is versioned (expired lines would stay as old versions)`);
      if (json(p.OwnershipControls) !== json({ Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] })) out.push(`${id}: the access-log bucket does not enforce the bucket owner (no ACLs)`);
      if (!statementsFor(id).some((s) => s.Effect === "Deny" && json(s.Condition).includes('"aws:SecureTransport":"false"') && anyone(s.Principal) && (s.Action === "s3:*" || json(s.Action) === '["s3:*"]') && onObjects(s, id))) out.push(`${id}: no policy refusing plain HTTP`);
      continue;
    }
    // PF-F1c: requests to a data bucket are logged to an access-log bucket of this stack
    if (!logs.has(logTargetOf(p) ?? "")) out.push(`${id}: its requests are not logged to an access-log bucket of this stack`);
    // PF-F1c: a put sent with another encryption (AES256, aws:kms:dsse) or with none named is refused by the bucket itself
    const putDeny = (cond: unknown) => statementsFor(id).some((s) => s.Effect === "Deny" && anyone(s.Principal) && (s.Action === "s3:PutObject" || json(s.Action) === '["s3:PutObject"]') && allObjects(s, id) && json(s.Condition) === json(cond));
    if (!putDeny({ StringNotEquals: { "s3:x-amz-server-side-encryption": "aws:kms" } })) out.push(`${id}: no policy refusing a put encrypted other than with aws:kms`);
    if (!putDeny({ Null: { "s3:x-amz-server-side-encryption": "true" } })) out.push(`${id}: no policy refusing a put that names no encryption`);
    if ((p.VersioningConfiguration as { Status?: string } | undefined)?.Status !== "Enabled") out.push(`${id}: versioning not enabled`);
    if (!json(p.BucketEncryption).includes('"aws:kms"')) out.push(`${id}: not KMS-encrypted`);
    else {
      const rules = ((p.BucketEncryption as { ServerSideEncryptionConfiguration?: { ServerSideEncryptionByDefault?: { KMSMasterKeyID?: unknown } }[] })?.ServerSideEncryptionConfiguration) ?? [];
      if (!rules.every((r) => ownKey(t, r.ServerSideEncryptionByDefault?.KMSMasterKeyID))) out.push(`${id}: KMS key is not one this stack defines`);
    }
    const tlsOnly = policies.some((pp) => json(pp.Bucket).includes(`"${id}"`) && ((pp.PolicyDocument as { Statement?: Record<string, unknown>[] })?.Statement ?? [])
      .some((s) => s.Effect === "Deny" && json(s.Condition).includes('"aws:SecureTransport":"false"')
        && (s.Principal === "*" || json(s.Principal) === '{"AWS":"*"}') && (s.Action === "s3:*" || json(s.Action) === '["s3:*"]')
        // the deny covers this bucket and its objects (break 5: not an unrelated resource; PF-8a review R3: not the bucket alone)
        && json(s.Resource).includes(`"${id}"`) && json(s.Resource).includes('"/*"')));
    if (!tlsOnly) out.push(`${id}: no policy refusing plain HTTP`);
    // PF-8rc: old versions expire after the backups' 35 days (versioning alone would keep every version for ever)
    if (!rules.some((r) => r.Status === "Enabled" && r.NoncurrentVersionExpiration?.NoncurrentDays === RETENTION_DAYS)) out.push(`${id}: old versions do not expire after ${RETENTION_DAYS} days`);
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

/** True when an IAM action pattern (wildcards * and ?, any case) covers the action. */
const covers = (pattern: string, action: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i").test(action);
const list = (v: unknown): string[] => (v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);
const anyone = (p: unknown) => p === "*" || json(p) === '{"AWS":"*"}';
const denies = (doc: unknown, actions: string[]) => {
  const st = ((doc as { Statement?: Record<string, unknown>[] })?.Statement ?? []).filter((x) => x.Effect === "Deny" && anyone(x.Principal) && !x.Condition && list(x.Resource).includes("*"));
  return actions.filter((a) => !st.some((x) => list(x.Action).some((p) => covers(p, a))));
};

/** PF-8rc: every backup vault (home and copy) uses a KMS key its own stack defines, is locked in governance mode for 35
 *  days, and its access policy denies the lock-bypass actions to every principal; its key's policy denies deletion. */
export function vaultFindings(stacks: SynthStack[]): string[] {
  const out: string[] = [];
  for (const s of stacks) for (const [id, r] of resources(s.template, "AWS::Backup::BackupVault")) {
    const p = r.Properties ?? {}, at = `${s.name}/${id}`;
    if (!ownKey(s.template, p.EncryptionKeyArn)) out.push(`${at}: not encrypted with a KMS key its stack defines`);
    else {
      const keyId = (p.EncryptionKeyArn as { "Fn::GetAtt": [string] })["Fn::GetAtt"]?.[0] ?? (p.EncryptionKeyArn as { Ref: string }).Ref;
      for (const a of denies(s.template.Resources![keyId].Properties?.KeyPolicy, KEY_DESTROY_ACTIONS)) out.push(`${at}: its key's policy does not deny ${a} to everyone`);
    }
    const lock = p.LockConfiguration as { MinRetentionDays?: number; ChangeableForDays?: number } | undefined;
    if (!lock) out.push(`${at}: no vault lock`);
    else {
      if (lock.MinRetentionDays !== RETENTION_DAYS) out.push(`${at}: vault lock minimum ${json(lock.MinRetentionDays)} days, not ${RETENTION_DAYS}`);
      if (lock.ChangeableForDays !== undefined) out.push(`${at}: vault lock is in compliance mode (ChangeableForDays ${lock.ChangeableForDays}), not governance`);
    }
    if (lock && lock.MaxRetentionDays !== undefined && !(typeof lock.MaxRetentionDays === "number" && lock.MaxRetentionDays >= RETENTION_DAYS)) out.push(`${at}: vault lock maximum ${json(lock.MaxRetentionDays)} days, not a number of at least ${RETENTION_DAYS} (break B6)`);
    for (const a of denies(p.AccessPolicy, BYPASS_ACTIONS)) out.push(`${at}: its access policy does not deny ${a} to everyone`);
  }
  return out;
}

/** This account's root as CDK writes it in a key policy: the only AWS principal a resource policy here may allow. */
const ROOT = json({ "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, ":iam::", { Ref: "AWS::AccountId" }, ":root"]] });
const STATEMENT_KEYS = ["Sid", "Effect", "Principal", "Action", "Resource", "Condition"];
/** A policy document's statements when every part the checks read is a literal; otherwise why it cannot be read (round 2,
 *  R2-1: Fn::If around an action, a statement or a principal, a JSON-string document, NotAction, NotPrincipal). An
 *  unreadable policy is a finding: the checks prove only what they can read. */
const statementsOf = (doc: unknown): { st: Record<string, unknown>[]; unreadable?: undefined } | { unreadable: string } => {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { unreadable: "the policy document is not a literal object" };
  // a document wrapped whole in Fn::If (or anything else) has no Statement to read: refused, not read as empty (round 3, R3-1)
  const keys = Object.keys(doc);
  if (!keys.includes("Statement") || keys.some((k) => !["Version", "Id", "Statement"].includes(k))) return { unreadable: `the policy document has keys ${keys.join(", ") || "none"}, not Version, Id and Statement` };
  const raw = (doc as { Statement?: unknown }).Statement;
  const sts = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  for (const x of sts) {
    if (!x || typeof x !== "object" || Array.isArray(x)) return { unreadable: "a statement is not a literal object" };
    const o = x as Record<string, unknown>, extra = Object.keys(o).filter((k) => !STATEMENT_KEYS.includes(k));
    if (extra.length > 0) return { unreadable: `a statement uses ${extra.join(", ")}` };
    if (o.Effect !== "Allow" && o.Effect !== "Deny") return { unreadable: `Effect ${json(o.Effect)} is not a literal` };
    if (!(typeof o.Action === "string" || (Array.isArray(o.Action) && o.Action.every((a) => typeof a === "string")))) return { unreadable: `Action ${json(o.Action)} is not a literal` };
  }
  return { st: sts as Record<string, unknown>[] };
};
const allows = (doc: unknown) => { const r = statementsOf(doc); return r.unreadable !== undefined ? r : { st: r.st.filter((x) => x.Effect === "Allow") }; };

/** PF-F1c: exactly the statement aws-cdk-lib writes for S3 server access logging by bucket policy: the logging service may
 *  put objects under one prefix of an access-log bucket (the policy's own bucket), only from a bucket of this stack named
 *  by its ARN and only for this account. Anything wider (another principal, action, resource or a missing condition) is
 *  not this statement. */
const logDelivery = (t: Template, policy: Resource, st: Record<string, unknown>) => {
  const bucket = (policy.Properties?.Bucket as { Ref?: string } | undefined)?.Ref ?? "";
  const res = (st.Resource as { "Fn::Join"?: [string, unknown[]] } | undefined)?.["Fn::Join"];
  const source = (st.Condition as { ArnLike?: { "aws:SourceArn"?: { "Fn::GetAtt"?: [string, string] } } } | undefined)?.ArnLike?.["aws:SourceArn"]?.["Fn::GetAtt"];
  return accessLogBuckets(t).has(bucket) && json(st.Principal) === json({ Service: "logging.s3.amazonaws.com" }) && st.Action === "s3:PutObject"
    && !!res && res[0] === "" && res[1].length === 2 && json(res[1][0]) === json({ "Fn::GetAtt": [bucket, "Arn"] }) && typeof res[1][1] === "string" && /^\/[a-z]+\/\*$/.test(res[1][1])
    && !!source && source[1] === "Arn" && t.Resources?.[source[0]]?.Type === "AWS::S3::Bucket" && source[0] !== bucket
    && json(st.Condition) === json({ ArnLike: { "aws:SourceArn": { "Fn::GetAtt": source } }, StringEquals: { "aws:SourceAccount": { Ref: "AWS::AccountId" } } });
};

/** PF-8rc break B4 (c), round 2 R2-1/R2-5: every KMS key policy and vault access policy is readable, and every Allow in
 *  it names exactly this account's root (as CDK writes it), never a service, another account or everyone. The account
 *  root's own reach is the governance-mode limit (B1). Every bucket policy is readable and only denies (round 3, R3-2). */
export function resourcePolicyFindings(stacks: SynthStack[]): string[] {
  const out: string[] = [];
  for (const s of stacks) for (const [id, r] of Object.entries(s.template.Resources ?? {})) {
    if (!["AWS::KMS::Key", "AWS::Backup::BackupVault", "AWS::S3::BucketPolicy"].includes(r.Type)) continue;
    const doc = r.Type === "AWS::KMS::Key" ? r.Properties?.KeyPolicy : r.Type === "AWS::S3::BucketPolicy" ? r.Properties?.PolicyDocument : r.Properties?.AccessPolicy;
    if (doc === undefined && r.Type !== "AWS::S3::BucketPolicy") continue;
    const a = allows(doc), at = `${s.name}/${id} (${r.Type})`;
    if (a.unreadable !== undefined) { out.push(`${at}: its policy cannot be read: ${a.unreadable}`); continue; }
    // a bucket policy only denies (the plain-HTTP deny); access comes from IAM in this account (round 3, R3-2)
    // PF-F1c: the one Allow: S3's logging service writing one data bucket's lines under its prefix in an access-log bucket
    if (r.Type === "AWS::S3::BucketPolicy") { for (const st of a.st) if (!logDelivery(s.template, r, st)) out.push(`${at}: allows ${json(st.Action)} to ${json(st.Principal)}; a bucket policy may only deny`); continue; }
    // PF-8b: an ECS execution role of this stack may decrypt the key only through Secrets Manager here (its own secrets)
    const execIds = new Set(Object.values(s.template.Resources ?? {}).filter((x) => x.Type === "AWS::ECS::TaskDefinition").map((x) => (x.Properties?.ExecutionRoleArn as { "Fn::GetAtt"?: [string] })?.["Fn::GetAtt"]?.[0]));
    const ecsExec = (st: Record<string, unknown>) => { const g = (st.Principal as { AWS?: { "Fn::GetAtt"?: [string] } | { "Fn::GetAtt"?: [string] }[] })?.AWS; if (Object.keys(st.Principal ?? {}).length !== 1) return false;
      return r.Type === "AWS::KMS::Key" && json(st.Action) === json("kms:Decrypt") && json(st.Resource) === json("*") && json(st.Condition) === json({ StringEquals: { "kms:ViaService": `secretsmanager.${HOME}.amazonaws.com` } })
        && (Array.isArray(g) ? g : [g]).every((x) => execIds.has(x?.["Fn::GetAtt"]?.[0])); }; // an execution role only (review r3)
    for (const st of a.st) if (json(st.Principal) !== json({ AWS: JSON.parse(ROOT) }) && !ecsExec(st)) out.push(`${at}: allows ${json(st.Action)} to ${json(st.Principal)}`);
  }
  return out;
}

/** PF-8rc: the home stack's plan backs up the database and every bucket daily, keeps them 35 days, and copies each to a
 *  vault in ca-west-1 (one of the scanned stacks) kept 35 days; no copy goes anywhere else. */
export function backupFindings(home: SynthStack, stacks: SynthStack[]): string[] {
  const out: string[] = [], t = home.template;
  const vaults = new Map(stacks.flatMap((s) => resources(s.template, "AWS::Backup::BackupVault").map(([, r]) => [String(r.Properties?.BackupVaultName), s.region] as const)));
  const plans = resources(t, "AWS::Backup::BackupPlan");
  if (plans.length !== 1) out.push(`${home.name}: ${plans.length} backup plans, not 1`);
  for (const [id, r] of plans) for (const rule of ((r.Properties?.BackupPlan as { BackupPlanRule?: Record<string, unknown>[] })?.BackupPlanRule ?? [])) {
    const at = `${home.name}/${id} rule ${json(rule.RuleName)}`;
    if ((rule.Lifecycle as { DeleteAfterDays?: number })?.DeleteAfterDays !== RETENTION_DAYS) out.push(`${at}: kept ${json((rule.Lifecycle as { DeleteAfterDays?: number })?.DeleteAfterDays)} days, not ${RETENTION_DAYS}`);
    if (!/^cron\(\d+ \d+ \* \* \? \*\)$/.test(String(rule.ScheduleExpression))) out.push(`${at}: not daily (${json(rule.ScheduleExpression)})`);
    const target = (rule.TargetBackupVault as { "Fn::GetAtt"?: [string] })?.["Fn::GetAtt"]?.[0];
    if (!target || t.Resources?.[target]?.Type !== "AWS::Backup::BackupVault") out.push(`${at}: target vault is not one this stack defines`);
    const copies = (rule.CopyActions as { DestinationBackupVaultArn?: unknown; Lifecycle?: { DeleteAfterDays?: number } }[] | undefined) ?? [];
    if (copies.length === 0) out.push(`${at}: no copy outside the home region`);
    for (const c of copies) {
      // the exact ARN backupPlan writes: this account, ca-west-1, this stage's copy vault (breaks B2, B3; review R3)
      const want = { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:backup:${COPY_REGION}:`, { Ref: "AWS::AccountId" }, `:backup-vault:${home.name}-copy`]] };
      if (json(c.DestinationBackupVaultArn) !== json(want)) out.push(`${at}: copy target is not this account's ${home.name}-copy vault in ${COPY_REGION} (${json(c.DestinationBackupVaultArn).slice(0, 120)})`);
      const regions = [...regionsIn(c.DestinationBackupVaultArn)];
      if (regions.length !== 1 || regions[0] !== COPY_REGION) out.push(`${at}: copies to ${regions.join(", ") || "an unnamed region"}, not ${COPY_REGION} alone`);
      const name = /backup-vault:([A-Za-z0-9_.-]+)/.exec(json(flatten(c.DestinationBackupVaultArn)))?.[1];
      if (!name || vaults.get(name) !== COPY_REGION) out.push(`${at}: copy vault ${json(name)} is not a vault in a scanned ${COPY_REGION} stack`);
      if (c.Lifecycle?.DeleteAfterDays !== RETENTION_DAYS) out.push(`${at}: copy kept ${json(c.Lifecycle?.DeleteAfterDays)} days, not ${RETENTION_DAYS}`);
    }
  }
  const sels = resources(t, "AWS::Backup::BackupSelection");
  // a selection that narrows itself, or belongs to another plan, selects nothing here (break B7, review R4)
  for (const [id, r] of sels) {
    const b = (r.Properties?.BackupSelection ?? {}) as Record<string, unknown>;
    for (const k of ["NotResources", "Conditions", "ListOfTags"]) if (b[k] !== undefined) out.push(`${home.name}/${id}: the selection has ${k}`);
    const planId = (r.Properties?.BackupPlanId as { "Fn::GetAtt"?: [string] })?.["Fn::GetAtt"]?.[0];
    if (!planId || t.Resources?.[planId]?.Type !== "AWS::Backup::BackupPlan") out.push(`${home.name}/${id}: the selection is not this stack's plan's`);
  }
  const chosen = json(sels.map(([, r]) => (r.Properties?.BackupSelection as { Resources?: unknown })?.Resources));
  const logs = accessLogBuckets(t); // PF-F1c: S3's request log lines, kept 90 days, are not backed up
  for (const [id] of [...resources(t, "AWS::RDS::DBInstance"), ...resources(t, "AWS::S3::Bucket").filter(([b]) => !logs.has(b))]) if (!chosen.includes(`"${id}"`)) out.push(`${home.name}/${id}: not in the backup selection`);
  return out;
}

/** The only actions a role, user, group or policy in the template may allow (round 2, R2-2: a list of what is allowed,
 *  not of what is guarded, so CloudFormation, IAM, Lambda or a cross-region copy job are refused unless listed here by a
 *  reviewed PR). Today: AWS Backup's role reading the data key. PF-8b adds the service's own actions. */
export const ROLE_ACTIONS = ["kms:Decrypt"];
/** PF-8b: the actions a role trusted by ECS tasks may allow, and nothing else: pull its image, read its own secrets and
 *  write its containers' lines to the app log group (the execution role; PF-8b F1; held to that group's ARN alone by
 *  service-checks.ts logFindings), send mail (the task role). A role trusted by AWS Backup keeps ROLE_ACTIONS only. */
export const ECS_EXEC_ACTIONS = ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:GetAuthorizationToken", "secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret", "logs:CreateLogStream", "logs:PutLogEvents"];
// an execution role pulls and reads; a task role only sends (review r1). PF-F1c: and reads and writes firms' files in its
// bucket, through the data key: allowed here for any task role, and held by service-checks.ts filesTaskFindings to the
// service's task role only, each statement exact (review M1)
// PF-4bs: and calls the eight sign-in actions, held by service-checks.ts signInTaskFindings to the service's task role
// and the staff pool's ARN only, exactly
export const ECS_TASK_ACTIONS = ["ses:SendEmail", "ses:SendRawEmail", "s3:GetObject", "s3:PutObject", "s3:ListBucket", "kms:GenerateDataKey", "kms:Decrypt", ...SIGN_IN_ACTIONS];
const SERVICE_ACTIONS: Record<string, string[]> = { "backup.amazonaws.com": ROLE_ACTIONS, "ecs-tasks.amazonaws.com": [] };
/** The only principals that may assume a role: AWS Backup, and ECS tasks (PF-8b). */
export const TRUSTED_SERVICES = Object.keys(SERVICE_ACTIONS);
/** AWS-managed policies a role may carry: AWS Backup's own service policies (Unconfirmed: their contents could not be
 *  read from the build lane; the vault policies' explicit deny holds whatever they contain), written plainly. */
export const MANAGED_ALLOW = ["service-role/AWSBackupServiceRolePolicyForBackup", "AWSBackupServiceRolePolicyForS3Backup"];
export function bypassFindings(stacks: SynthStack[]): string[] {
  const out: string[] = [];
  for (const s of stacks) {
  const R = s.template.Resources ?? {};
  // which services trust a role of this stack (its trust policy's literal Service values)
  const trusted = (roleId: string) => { const a = allows(R[roleId]?.Properties?.AssumeRolePolicyDocument); return "st" in a ? [...new Set(a.st.flatMap((x) => list((x.Principal as { Service?: unknown } | undefined)?.Service)))] : []; }; // every statement (re-break)
  const tdRoles = (k: string) => new Set(Object.values(R).filter((x) => x.Type === "AWS::ECS::TaskDefinition").map((x) => (x.Properties?.[k] as { "Fn::GetAtt"?: [string] })?.["Fn::GetAtt"]?.[0] ?? ""));
  const execs = tdRoles("ExecutionRoleArn"), tasks = tdRoles("TaskRoleArn");
  const allowedFor = (ids: string[]) => !ids.length ? ROLE_ACTIONS : !ids.every((x) => trusted(x).length === 1) || new Set(ids.map((x) => trusted(x)[0])).size !== 1 ? [] // two services trusting one role: nothing
    : trusted(ids[0])[0] !== "ecs-tasks.amazonaws.com" ? SERVICE_ACTIONS[trusted(ids[0])[0]] ?? ROLE_ACTIONS
    : ids.every((x) => execs.has(x) && !tasks.has(x)) ? ECS_EXEC_ACTIONS : ids.every((x) => tasks.has(x) && !execs.has(x)) ? ECS_TASK_ACTIONS : [];
  for (const [id, r] of Object.entries(R)) {
    const p = r.Properties ?? {}, at = `${s.name}/${id} (${r.Type})`;
    // a role may be assumed only by a listed AWS service, with sts:AssumeRole (break B4 (b), round 2 R2-1)
    if (r.Type === "AWS::IAM::Role") {
      const trust = allows(p.AssumeRolePolicyDocument);
      if (trust.unreadable !== undefined) out.push(`${at}: its trust policy cannot be read: ${trust.unreadable}`);
      else for (const st of trust.st) {
        const pr = st.Principal as Record<string, unknown> | undefined;
        const ok = !!pr && typeof pr === "object" && !Array.isArray(pr) && Object.keys(pr).length === 1 && (typeof pr.Service === "string" || Array.isArray(pr.Service)) && list(pr.Service).every((x) => TRUSTED_SERVICES.includes(x)) && json(st.Action) === json("sts:AssumeRole");
        if (!ok) out.push(`${at}: may be assumed by ${json(st.Principal)}, not only ${TRUSTED_SERVICES.join(", ")}`);
      }
    }
    // Policies must be a literal list of literal entries (review M1: a whole list in Fn::If is refused, not skipped)
    if (r.Type.startsWith("AWS::IAM::") && p.Policies !== undefined && !(Array.isArray(p.Policies) && p.Policies.every((x) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).every((k) => ["PolicyName", "PolicyDocument"].includes(k))))) out.push(`${at}: its Policies cannot be read (${json(p.Policies).slice(0, 80)})`);
    const docs = ["AWS::IAM::Role", "AWS::IAM::User", "AWS::IAM::Group"].includes(r.Type) ? (Array.isArray(p.Policies) ? (p.Policies as { PolicyDocument?: unknown }[]).map((x) => x?.PolicyDocument) : [])
      : r.Type.startsWith("AWS::IAM::") && r.Type.endsWith("Policy") ? [p.PolicyDocument] : [];
    // a role a resource names must be one this stack defines (re-break RB-1: a task run as an outside admin role); no
    // Cognito Lambda triggers; an image repository has no resource policy (RB-2: public pull, outside push)
    const named = (v: unknown): [string, unknown][] => Array.isArray(v) ? v.flatMap(named) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => (/RoleArn$|CallerArn$/.test(k) ? [[k, x] as [string, unknown]] : named(x))) : [];
    for (const [k, v] of named(p)) if (R[(v as { "Fn::GetAtt"?: [string] })?.["Fn::GetAtt"]?.[0] ?? ""]?.Type !== "AWS::IAM::Role") out.push(`${at}: ${k} names ${json(v)}, not a role this stack defines`);
    if (p.LambdaConfig !== undefined || (r.Type === "AWS::ECR::Repository" && p.RepositoryPolicyText !== undefined)) out.push(`${at}: a Lambda trigger or repository policy (none is expected)`);
    const holders = r.Type === "AWS::IAM::Role" ? [id] : (Array.isArray(p.Roles) ? p.Roles : []).map((x: unknown) => (x as { Ref?: string })?.Ref ?? "");
    const ACTIONS = allowedFor(holders);
    for (const doc of docs) {
      const a = allows(doc);
      if (a.unreadable !== undefined) { out.push(`${at}: a policy cannot be read: ${a.unreadable}`); continue; }
      for (const st of a.st) {
        for (const act of list(st.Action)) if (!ACTIONS.includes(act)) out.push(`${at}: allows ${act}, not on the allow list (${ACTIONS.join(", ")})`);
        // on a named resource of this stack, never on everything (round 3, R3-5; review M4). PF-8b: a secret's Ref (its
        // ARN), an ARN joined from literals, AWS pseudo parameters and this stack's resources (the SES identity), and "*"
        // only for ecr:GetAuthorizationToken, which AWS grants on nothing narrower.
        const res = Array.isArray(st.Resource) ? st.Resource : [st.Resource];
        const own = (x: unknown, inJoin = false): boolean => {
          const o = x as { "Fn::GetAtt"?: [string]; Ref?: string; "Fn::Join"?: [string, unknown[]] } | undefined;
          if (o?.["Fn::GetAtt"]) return !!R[o["Fn::GetAtt"][0]];
          if (typeof o?.Ref === "string") return R[o.Ref]?.Type === "AWS::SecretsManager::Secret" || (inJoin && (!!R[o.Ref] || ["AWS::Partition", "AWS::AccountId", "AWS::Region", "AWS::URLSuffix"].includes(o.Ref)));
          const j = o?.["Fn::Join"];
          // PF-F1c: a bucket of this stack's firm keys (`<bucket ARN>/*/*`), the one wildcard a resource may end with
          if (!inJoin && Array.isArray(j) && j[0] === "" && Array.isArray(j[1]) && j[1].length === 2 && j[1][1] === "/*/*") { const b = (j[1][0] as { "Fn::GetAtt"?: [string, string] })?.["Fn::GetAtt"]; return !!b && b[1] === "Arn" && R[b[0]]?.Type === "AWS::S3::Bucket"; }
          return Array.isArray(j) && j[0] === "" && Array.isArray(j[1]) && j[1].every((y) => typeof y === "string" ? !/[*?]|:\d{12}:/.test(y) : own(y, true)) && j[1].some((y) => typeof y === "object" && !(y as { Ref?: string }).Ref?.startsWith("AWS::"));
        };
        const tokenOnly = json(list(st.Action)) === json(["ecr:GetAuthorizationToken"]) && json(st.Resource) === json("*") && ACTIONS === ECS_EXEC_ACTIONS;
        if (!tokenOnly && !res.every((x) => !!x && typeof x === "object" && own(x))) out.push(`${at}: allows on ${json(st.Resource)}, not a resource this stack defines`);
      }
    }
    // a policy is attached only to roles of this stack: never to users, groups or a role named from outside (review M4)
    if (r.Type === "AWS::IAM::Policy" || r.Type === "AWS::IAM::ManagedPolicy") {
      if (p.Users !== undefined || p.Groups !== undefined) out.push(`${at}: attached to users or groups`);
      for (const x of Array.isArray(p.Roles) ? p.Roles : [p.Roles]) if (p.Roles !== undefined && !(x && typeof x === "object" && s.template.Resources?.[(x as { Ref?: string }).Ref ?? ""]?.Type === "AWS::IAM::Role")) out.push(`${at}: attached to ${json(x)}, not a role this stack defines`);
    }
    // exactly an allowed policy's ARN, as a plain string or CDK's Fn::Join (break B5, review R5: no Fn::Select or Fn::If around it)
    const exact = (m: string) => [json(`arn:aws:iam::aws:policy/${m}`), json({ "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:iam::aws:policy/${m}`]] })];
    if (p.ManagedPolicyArns !== undefined && !Array.isArray(p.ManagedPolicyArns)) out.push(`${at}: its managed policies cannot be read (${json(p.ManagedPolicyArns).slice(0, 80)})`); // round 3, R3-4
    for (const arn of (Array.isArray(p.ManagedPolicyArns) ? p.ManagedPolicyArns : []).map(json)) {
      if (!MANAGED_ALLOW.some((m) => exact(m).includes(arn))) out.push(`${at}: managed policy ${/policy\/([^ "]+)/.exec(json(flatten(JSON.parse(arn))))?.[1] ?? arn} is not on the allow list (only ${MANAGED_ALLOW.join(", ")}, written plainly)`);
    }
  }
  }
  return out;
}

/** The resource types the estate is made of (round 2: a Lambda function, a custom resource or any type nobody reviewed
 *  could carry data or permissions the other checks do not read). A new type joins this list by a reviewed PR. */
export const ESTATE_TYPES = ["AWS::Backup::BackupPlan", "AWS::Backup::BackupSelection", "AWS::Backup::BackupVault", "AWS::EC2::EIP", "AWS::EC2::InternetGateway",
  "AWS::EC2::NatGateway", "AWS::EC2::Route", "AWS::EC2::RouteTable", "AWS::EC2::SecurityGroup", "AWS::EC2::Subnet", "AWS::EC2::SubnetRouteTableAssociation",
  "AWS::EC2::VPC", "AWS::EC2::VPCGatewayAttachment", "AWS::IAM::Policy", "AWS::IAM::Role", "AWS::KMS::Alias", "AWS::KMS::Key", "AWS::RDS::DBInstance",
  "AWS::RDS::DBParameterGroup", "AWS::RDS::DBSubnetGroup", "AWS::S3::Bucket", "AWS::S3::BucketPolicy", "AWS::SecretsManager::Secret", "AWS::SecretsManager::SecretTargetAttachment",
  // PF-8b: the service, its image, load balancer, firm addresses, mail and sign-in pools (each read by lib/service-checks.ts)
  "AWS::CertificateManager::Certificate", "AWS::Cognito::UserPool", "AWS::Cognito::UserPoolClient", "AWS::EC2::SecurityGroupEgress", "AWS::EC2::SecurityGroupIngress",
  "AWS::ECR::Repository", "AWS::ECS::Cluster", "AWS::ECS::Service", "AWS::ECS::TaskDefinition", "AWS::ElasticLoadBalancingV2::Listener",
  "AWS::ElasticLoadBalancingV2::LoadBalancer", "AWS::ElasticLoadBalancingV2::TargetGroup", "AWS::Route53::HostedZone", "AWS::Route53::RecordSet", "AWS::SES::EmailIdentity",
  "AWS::Logs::LogGroup", "AWS::Logs::MetricFilter", "AWS::CloudWatch::Alarm", "AWS::SNS::Topic", "AWS::SNS::Subscription"]; // PF-23c: logs, alarms, the on-call topic
export function typeFindings(stacks: SynthStack[]): string[] {
  return stacks.flatMap((s) => Object.entries(s.template.Resources ?? {}).filter(([, r]) => !ESTATE_TYPES.includes(r.Type)).map(([id, r]) => `${s.name}/${id}: ${r.Type} is not an estate type`));
}
