// PF-8a's checks over a synthesized CloudFormation template: pure functions, each returning plain-words findings (an
// empty list = pass). The tests run them on the real stacks (must pass) and on broken stacks or templates (must fail),
// so a check that cannot fail is caught. PF-8rc adds the backup checks (`backupFindings`, `vaultFindings`,
// `bypassFindings`) and a whole-stack allowance for the ca-west-1 copy vault (`REGION_ALLOW`).
import { BYPASS_ACTIONS, COPY_REGION, KEY_DESTROY_ACTIONS, LOCK_ACTIONS, POLICY_ACTIONS, RETENTION_DAYS } from "./backup.ts";
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
const opaque = (t: Template, v: unknown): string[] => {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (typeof x === "string") { if (x.includes("{{resolve:")) out.push(`a dynamic reference (${x.slice(0, 60)})`); return; }
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (Array.isArray(o["Fn::Sub"]) && Object.keys((o["Fn::Sub"] as unknown[])[1] ?? {}).length > 0) out.push("Fn::Sub with a variable map");
    if (o["Fn::ImportValue"] !== undefined) out.push("Fn::ImportValue");
    const j = o["Fn::Join"] as [string, unknown[]] | undefined;
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
      for (const why of opaque(s.template, s.template[section])) out.push(`${s.name} ${section}: ${why}, whose region the guard cannot read`);
    }
    for (const [id, r] of Object.entries(s.template.Resources ?? {})) {
      for (const why of opaque(s.template, r)) out.push(`${s.name}/${id} (${r.Type}): ${why}, whose region the guard cannot read`);
      if (r.Type === "AWS::KMS::Key" && r.Properties?.MultiRegion === true) out.push(`${s.name}/${id} (${r.Type}) is a multi-region key`);
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
    const rules = ((p.LifecycleConfiguration as { Rules?: { Status?: string; NoncurrentVersionExpiration?: { NoncurrentDays?: number } }[] } | undefined)?.Rules) ?? [];
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
    if (lock && lock.MaxRetentionDays !== undefined && lock.MaxRetentionDays < RETENTION_DAYS) out.push(`${at}: vault lock maximum ${lock.MaxRetentionDays} days, under ${RETENTION_DAYS} (break B6)`);
    for (const a of denies(p.AccessPolicy, BYPASS_ACTIONS)) out.push(`${at}: its access policy does not deny ${a} to everyone`);
  }
  return out;
}

/** This account's root as CDK writes it in a key policy: the only AWS principal a resource policy here may allow. */
const ROOT = json({ "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, ":iam::", { Ref: "AWS::AccountId" }, ":root"]] });
const ownOrService = (p: unknown) => {
  const o = (p ?? {}) as Record<string, unknown>;
  return typeof p === "object" && Object.keys(o).length > 0 && Object.entries(o).every(([k, v]) => (k === "Service" ? list(v).every((x) => x.endsWith(".amazonaws.com")) : k === "AWS" && (Array.isArray(v) ? v : [v]).every((x) => json(x) === ROOT)));
};
/** PF-8rc break B4 (c): every Allow in a KMS key policy or a vault access policy names only this account's root or an
 *  AWS service, never another account or everyone; the account root's own reach is the governance-mode limit (B1). */
export function resourcePolicyFindings(stacks: SynthStack[]): string[] {
  const out: string[] = [];
  for (const s of stacks) for (const [id, r] of Object.entries(s.template.Resources ?? {})) {
    const doc = r.Type === "AWS::KMS::Key" ? r.Properties?.KeyPolicy : r.Type === "AWS::Backup::BackupVault" ? r.Properties?.AccessPolicy : undefined;
    for (const st of ((doc as { Statement?: Record<string, unknown>[] })?.Statement ?? []).filter((x) => x.Effect === "Allow")) {
      if (st.NotPrincipal !== undefined || !ownOrService(st.Principal)) out.push(`${s.name}/${id} (${r.Type}): allows ${json(st.Action)} to ${json(st.Principal ?? st.NotPrincipal)}`);
    }
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
  for (const [id] of [...resources(t, "AWS::RDS::DBInstance"), ...resources(t, "AWS::S3::Bucket")]) if (!chosen.includes(`"${id}"`)) out.push(`${home.name}/${id}: not in the backup selection`);
  return out;
}

/** The actions no role in the template may hold: the lock bypass, the vault policy that denies it, and the vault keys. */
// plus the IAM writes and role assumption that would let a role grant itself any of them (break B4 (b), review R1)
export const GUARDED_ACTIONS = [...BYPASS_ACTIONS, ...LOCK_ACTIONS, ...POLICY_ACTIONS, ...KEY_DESTROY_ACTIONS, "kms:PutKeyPolicy",
  "iam:PutRolePolicy", "iam:PutUserPolicy", "iam:PutGroupPolicy", "iam:AttachRolePolicy", "iam:AttachUserPolicy", "iam:AttachGroupPolicy",
  "iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:UpdateAssumeRolePolicy", "iam:PassRole", "sts:AssumeRole"];
/** AWS-managed policies a role may carry: AWS Backup's own service policies (Unconfirmed: their contents could not be
 *  read from the build lane; the vault policies' explicit deny holds whatever they contain). Any other managed policy,
 *  or an allow of a guarded action (also by wildcard or NotAction), is a finding. */
export const MANAGED_ALLOW = ["service-role/AWSBackupServiceRolePolicyForBackup", "AWSBackupServiceRolePolicyForS3Backup"];
export function bypassFindings(stacks: SynthStack[]): string[] {
  const out: string[] = [];
  for (const s of stacks) for (const [id, r] of Object.entries(s.template.Resources ?? {})) {
    const p = r.Properties ?? {}, at = `${s.name}/${id} (${r.Type})`;
    // a role may be assumed only by an AWS service (break B4 (b): trust in everyone or another account)
    if (r.Type === "AWS::IAM::Role") for (const st of ((p.AssumeRolePolicyDocument as { Statement?: Record<string, unknown>[] })?.Statement ?? []).filter((x) => x.Effect === "Allow")) {
      if (st.NotPrincipal !== undefined || !Object.keys((st.Principal ?? {}) as object).every((k) => k === "Service") || typeof st.Principal !== "object") out.push(`${at}: may be assumed by ${json(st.Principal ?? st.NotPrincipal)}, not only an AWS service`);
    }
    const docs = ["AWS::IAM::Role", "AWS::IAM::User", "AWS::IAM::Group"].includes(r.Type) ? ((p.Policies as { PolicyDocument?: unknown }[]) ?? []).map((x) => x.PolicyDocument)
      : ["AWS::IAM::Policy", "AWS::IAM::ManagedPolicy", "AWS::IAM::UserPolicy", "AWS::IAM::GroupPolicy", "AWS::IAM::RolePolicy"].includes(r.Type) ? [p.PolicyDocument] : [];
    for (const doc of docs) for (const st of ((doc as { Statement?: Record<string, unknown>[] })?.Statement ?? []).filter((x) => x.Effect === "Allow")) {
      if (st.NotAction !== undefined) out.push(`${at}: allows by NotAction (everything but ${json(st.NotAction)})`);
      for (const a of GUARDED_ACTIONS) if (list(st.Action).some((pt) => covers(pt, a))) out.push(`${at}: allows ${a}`);
    }
    // exactly an allowed policy's ARN, as a plain string or CDK's Fn::Join (break B5, review R5: no Fn::Select or Fn::If around it)
    const exact = (m: string) => [json(`arn:aws:iam::aws:policy/${m}`), json({ "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:iam::aws:policy/${m}`]] })];
    for (const arn of ((p.ManagedPolicyArns as unknown[] | undefined) ?? []).map(json)) {
      if (!MANAGED_ALLOW.some((m) => exact(m).includes(arn))) out.push(`${at}: managed policy ${/policy\/([^ "]+)/.exec(json(flatten(JSON.parse(arn))))?.[1] ?? arn} is not on the allow list (only ${MANAGED_ALLOW.join(", ")}, written plainly)`);
    }
  }
  return out;
}
