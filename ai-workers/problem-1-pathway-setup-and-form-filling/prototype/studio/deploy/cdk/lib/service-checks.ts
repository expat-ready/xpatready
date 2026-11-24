// PF-8b's checks over a synthesized template: pure functions returning plain-words findings (empty = pass), run on the
// real stacks (must pass) and on broken copies (must fail) by test/service.test.ts, as PF-8a's checks.ts does.
import type { Template } from "./checks.ts";
import { CERT_ARN_PATTERN, CHALLENGE_MINUTES, NO_DOMAIN, SIGN_IN_ACTIONS } from "./service.ts";
export { SIGN_IN_ACTIONS };

type Res = { Type: string; Properties?: Record<string, unknown> };
/** A nested template value by path (unknown when any step is missing). */
const g = (o: unknown, ...k: string[]): unknown => k.reduce<unknown>((v, x) => (v && typeof v === "object" ? (v as Record<string, unknown>)[x] : undefined), o);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
type Container = { Name: string; Command?: string[]; Environment?: { Name: string; Value: unknown }[]; Secrets?: { Name: string; ValueFrom: unknown }[] };
const all = (t: Template, type: string) => Object.entries((t.Resources ?? {}) as Record<string, Res>).filter(([, r]) => r.Type === type);
const json = (v: unknown) => JSON.stringify(v ?? null);
const refId = (v: unknown) => { const o = v as { Ref?: string; "Fn::GetAtt"?: [string, string] } | undefined; return o?.Ref ?? o?.["Fn::GetAtt"]?.[0]; };
const containers = (r: Res) => arr(r.Properties?.ContainerDefinitions) as Container[];
const env = (c: Container) => new Map((c.Environment ?? []).map((e) => [e.Name, e.Value]));
const secretName = (t: Template, v: unknown) => { const id = refId(v); const r = id ? t.Resources?.[id] : undefined; return r?.Type === "AWS::SecretsManager::Secret" ? String(r.Properties?.Name ?? `(generated ${id})`) : undefined; };
// A value that looks like a credential, wherever it sits in a plain value; a dynamic reference ({{resolve:…}}, what
// unsafeUnwrap() writes) puts the secret's value into the resource in plain text, so it counts too (break M-1).
const CREDENTIAL = /(?:^|[^A-Za-z])(sk|rk)_(test|live)_|whsec_|postgres(ql)?:\/\/[^\s/]*:[^\s/@]+@|-----BEGIN|AKIA[0-9A-Z]{16}|\{\{resolve:(secretsmanager|ssm-secure):/;
/** Does an IAM Action value allow reading a secret's value (exact, secretsmanager:*, a Get* glob, or *)? (break M-2) */
const covers = (action: unknown, ...wanted: string[]) => arr(Array.isArray(action) ? action : [action]).some((a) => typeof a === "string"
  && wanted.some((w) => new RegExp(`^${a.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i").test(w))); // IAM globs (re-break n2)
const readsSecret = (action: unknown) => covers(action, "secretsmanager:GetSecretValue");
const decrypts = (action: unknown) => covers(action, "kms:Decrypt", "kms:CreateGrant");
/** Managed policies a role in this stack may carry: PF-8rc's AWS Backup role's two (checks.ts MANAGED_ALLOW). */
const MANAGED_OK = [/:iam::aws:policy\/(service-role\/AWSBackupServiceRolePolicyForBackup|AWSBackupServiceRolePolicyForS3Backup)"/];

/** The task definitions by job: the one the ECS service runs, and the one-off migration task (`prisma migrate deploy`). */
export function taskDefinitions(t: Template): { service?: [string, Res]; migration?: [string, Res] } {
  const tds = all(t, "AWS::ECS::TaskDefinition");
  const svcTd = refId(all(t, "AWS::ECS::Service")[0]?.[1].Properties?.TaskDefinition);
  return {
    service: tds.find(([id]) => id === svcTd),
    migration: tds.find(([id, r]) => id !== svcTd && containers(r).some((c) => json(c.Command).includes('"migrate","deploy"'))),
  };
}

/** Exactly two task definitions (the service's, the migration's), and every container runs this stack's one repository
 *  at the one digest parameter, in CDK's exact URI form: no other registry, tag or sidecar image (re-break RC-1). */
export function imageFindings(t: Template): string[] {
  const tds = all(t, "AWS::ECS::TaskDefinition"), { service, migration } = taskDefinitions(t);
  const out = tds.length === 2 && service && migration ? [] : [`${tds.length} task definitions, not exactly the service's and the migration's`];
  const repos = all(t, "AWS::ECR::Repository").map(([id]) => id), digests = Object.entries((t.Parameters ?? {}) as Record<string, { AllowedPattern?: string }>).filter(([, p]) => p.AllowedPattern === "^sha256:[a-f0-9]{64}$").map(([k]) => k);
  const part = (i: number) => ({ "Fn::Select": [i, { "Fn::Split": [":", { "Fn::GetAtt": [repos[0], "Arn"] }] }] });
  const want = json({ "Fn::Join": ["", [part(4), ".dkr.ecr.", part(3), ".", { Ref: "AWS::URLSuffix" }, "/", { Ref: repos[0] }, "@", { Ref: digests[0] }]] });
  for (const [id, td] of tds) for (const c of containers(td)) if (repos.length !== 1 || digests.length !== 1 || json(g(c, "Image")) !== want) out.push(`${id}/${c.Name}: image ${json(g(c, "Image")).slice(0, 80)} is not this stack's repository at the digest`);
  return out;
}

/** PF-24's loader (api/src/platform/config/settings.ts) as text: each setting's name, whether it is secret and required. */
export function loaderSettings(source: string): { name: string; secret: boolean; required: boolean }[] {
  return [...source.matchAll(/\b(s|opt)\("[^"]+", "([A-Z0-9_]+)", (true|false)/g)].map((m) => ({ name: m[2], secret: m[3] === "true", required: m[1] === "s" }));
}

/** The service's task: PLATFORM_ENVIRONMENT=production and PLATFORM_IDENTITY=cognito set explicitly; every required
 *  loader setting supplied; every secret one (and APP_DATABASE_URL) only as a Secrets Manager reference of this stack;
 *  no plain value of any task definition looks like a credential. */
export function taskSettingFindings(t: Template, settings: { name: string; secret: boolean; required: boolean }[], stage: "staging" | "production" = "production"): string[] {
  const out: string[] = [];
  const { service } = taskDefinitions(t);
  if (!service) return ["no task definition run by the service"];
  const c = containers(service[1])[0];
  const e = env(c), s = new Map((c.Secrets ?? []).map((x) => [x.Name, x.ValueFrom]));
  for (const [id, td] of all(t, "AWS::ECS::TaskDefinition")) for (const k of containers(td)) {
    if (g(k, "EnvironmentFiles") !== undefined) out.push(`${id}/${k.Name}: an environment file (values from S3, unchecked)`); // review M1
    if (td === service[1] && k !== c) for (const x of k.Environment ?? []) if (settings.some((y) => y.secret && y.name === x.Name)) out.push(`${id}/${k.Name}: ${x.Name}: a secret given as a plain environment value`);
  }
  const want = stage === "production" ? "production" : "test"; // staging never accepts a live Stripe key (Lead 13 ruling 3)
  if (e.get("PLATFORM_ENVIRONMENT") !== want) out.push(`PLATFORM_ENVIRONMENT is ${json(e.get("PLATFORM_ENVIRONMENT"))}, not "${want}" (rev 16.5: set explicitly)`);
  if (e.has("PLATFORM_SAMPLE_SEED") || s.has("PLATFORM_SAMPLE_SEED")) out.push("PLATFORM_SAMPLE_SEED is set: no Sample firms on AWS");
  if (e.get("PLATFORM_IDENTITY") !== "cognito") out.push(`PLATFORM_IDENTITY is ${json(e.get("PLATFORM_IDENTITY"))}, not "cognito"`);
  for (const x of settings) if (x.required && !e.has(x.name) && !s.has(x.name)) out.push(`${x.name}: required by PF-24's loader, not supplied`);
  for (const name of [...settings.filter((x) => x.secret).map((x) => x.name), "APP_DATABASE_URL"]) {
    if (e.has(name)) out.push(`${name}: a secret given as a plain environment value`);
    if (s.has(name) && !secretName(t, s.get(name))) out.push(`${name}: not a Secrets Manager secret of this stack (${json(s.get(name))})`);
  }
  const secretNames = new Set([...settings.filter((x) => x.secret).map((x) => x.name), "APP_DATABASE_URL"]);
  for (const [id, td] of all(t, "AWS::ECS::TaskDefinition")) {
    for (const k of containers(td)) for (const v of k.Environment ?? []) {
      if (CREDENTIAL.test(json(v.Value))) out.push(`${id}/${k.Name}: ${v.Name} holds what looks like a credential`);
      else if (secretNames.has(v.Name) && id !== service[0]) out.push(`${id}/${k.Name}: ${v.Name}: a secret given as a plain environment value`);
    }
    const { Secrets: _s, Environment: _e, ...rest } = { ...(containers(td)[0] ?? {}), others: containers(td).slice(1), task: { ...td.Properties, ContainerDefinitions: undefined } };
    if (CREDENTIAL.test(json(rest))) out.push(`${id}: a credential outside the environment (command, log settings or another field; re-break RM-1)`);
  }
  for (const [id, r] of all(t, "AWS::SecretsManager::Secret")) if (r.Properties?.SecretString !== undefined) out.push(`${id}: a secret value written into the template`);
  for (const [id, r] of Object.entries(t.Resources ?? {})) {
    if (r.Type === "AWS::ECS::TaskDefinition") continue; // already read above
    // the one place a dynamic reference belongs: the database's master password, which RDS keeps and never shows
    const { MasterUserPassword: _pw, ...rest } = (r.Type === "AWS::RDS::DBInstance" ? r.Properties : { all: r.Properties }) ?? {};
    if (/\{\{resolve:(secretsmanager|ssm-secure):/.test(json(rest))) out.push(`${id}: a dynamic secret reference puts a value into ${r.Type}`);
  }
  return out;
}

/** Who reads which secret: each task definition's execution role may read exactly the secrets its containers reference
 *  and no principal else may read any secret, whatever form the grant takes (a policy, a role's inline or managed policy,
 *  a secret's resource policy, an action glob); the stack's key lets nothing but the account root (IAM) decrypt outside
 *  Secrets Manager (break M-2: that key also encrypts the database, the buckets and the images). */
export function secretReadFindings(t: Template): string[] {
  const out: string[] = [];
  type St = { Effect?: string; Action?: unknown; Resource?: unknown; Principal?: unknown; Condition?: unknown };
  const grants: { role: string; res: string[]; from: string }[] = [];
  const add = (roles: unknown[], doc: unknown, from: string) => {
    for (const st of arr(g(doc, "Statement")) as St[] & { NotAction?: unknown }[]) if (st.Effect !== "Deny" && (st as { NotAction?: unknown }).NotAction !== undefined) out.push(`${from}: an Allow with NotAction (unreadable; re-break n2)`);
    for (const st of arr(g(doc, "Statement")) as St[]) if (st.Effect !== "Deny" && readsSecret(st.Action))
      for (const role of roles.map((r) => refId(r) ?? json(r))) grants.push({ role, res: arr(Array.isArray(st.Resource) ? st.Resource : [st.Resource]).map((x) => refId(x) ?? json(x)), from });
  };
  const holders = (p: Res) => [...arr(p.Properties?.Roles), ...arr(p.Properties?.Users).map((u) => `user ${json(u)}`), ...arr(p.Properties?.Groups).map((x) => `group ${json(x)}`)]; // re-break RM-2
  for (const [id, p] of [...all(t, "AWS::IAM::Policy"), ...all(t, "AWS::IAM::ManagedPolicy")]) add(holders(p), p.Properties?.PolicyDocument, id);
  for (const [id, p] of [...all(t, "AWS::IAM::RolePolicy"), ...all(t, "AWS::IAM::UserPolicy"), ...all(t, "AWS::IAM::GroupPolicy")]) add([p.Properties?.RoleName ?? `holder ${json(p.Properties?.UserName ?? p.Properties?.GroupName)}`], p.Properties?.PolicyDocument, id);
  for (const [id, r] of all(t, "AWS::IAM::Role")) {
    for (const ip of arr(r.Properties?.Policies)) add([{ Ref: id }], g(ip, "PolicyDocument"), `${id} inline`);
    for (const m of arr(r.Properties?.ManagedPolicyArns)) if (!MANAGED_OK.some((re) => re.test(json(m)))) out.push(`${id}: carries a managed policy not on the allow list (${json(m)})`);
  }
  for (const [id] of [...all(t, "AWS::SecretsManager::ResourcePolicy"), ...all(t, "AWS::IAM::User"), ...all(t, "AWS::IAM::Group")]) out.push(`${id}: a secret resource policy, user or group (none is expected)`);
  const execs = new Map<string, Set<string>>();
  for (const [id, td] of all(t, "AWS::ECS::TaskDefinition")) {
    const exec = refId(td.Properties?.ExecutionRoleArn);
    const wanted = new Set(containers(td).flatMap((c) => (c.Secrets ?? []).map((x) => refId(x.ValueFrom) ?? json(x.ValueFrom))));
    if (!exec) { if (wanted.size) out.push(`${id}: secrets but no execution role`); continue; }
    execs.set(exec, wanted);
    const trust = g(t.Resources?.[exec], "Properties", "AssumeRolePolicyDocument");
    if (json(trust) !== '{"Statement":[{"Action":"sts:AssumeRole","Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"}}],"Version":"2012-10-17"}') out.push(`${id}: execution role may be assumed by more than ECS tasks (${json(trust)})`);
    const got = new Set(grants.filter((x) => x.role === exec).flatMap((x) => x.res));
    for (const w of wanted) if (!got.has(w)) out.push(`${id}: execution role cannot read ${w}`);
  }
  for (const x of grants) {
    const wanted = execs.get(x.role);
    if (!wanted) out.push(`${x.from}: ${x.role} may read secrets (${x.res.join(", ")}); only an execution role may`);
    else for (const r of x.res) if (!wanted.has(r)) out.push(`${x.from}: execution role ${x.role} reads ${r}, which its task does not use`);
  }
  const ROOT = /^\{"AWS":\{"Fn::Join":\["",\["arn:(aws|",\{"Ref":"AWS::Partition"\},")?:iam::",\{"Ref":"AWS::AccountId"\},":root"\]\]\}\}$/; // this account only (re-review n3)
  for (const [id, k] of all(t, "AWS::KMS::Key")) for (const st of arr(g(k.Properties, "KeyPolicy", "Statement")) as St[]) {
    if (st.Effect === "Deny" || !decrypts(st.Action)) continue;
    if (!ROOT.test(json(st.Principal)) && !/"kms:ViaService":"secretsmanager\.ca-central-1\.amazonaws\.com"/.test(json(st.Condition))) out.push(`${id}: key policy lets ${json(st.Principal)} decrypt outside a service (no kms:ViaService)`);
  }
  return out;
}

/** Nothing public but the load balancer on 80 and 443: tasks get no public address, and only the load balancer's
 *  security group takes traffic from anywhere (break m1). */
export function exposureFindings(t: Template): string[] {
  const out: string[] = [];
  for (const [id, r] of all(t, "AWS::ECS::Service")) if (g(r.Properties, "NetworkConfiguration", "AwsvpcConfiguration", "AssignPublicIp") !== "DISABLED") out.push(`${id}: tasks get a public address`);
  const lbSgs = new Set(all(t, "AWS::ElasticLoadBalancingV2::LoadBalancer").flatMap(([, lb]) => arr(lb.Properties?.SecurityGroups).map(refId)));
  const rules: [string, string | undefined, Record<string, unknown>][] = [
    ...all(t, "AWS::EC2::SecurityGroup").flatMap(([id, sg]) => arr(sg.Properties?.SecurityGroupIngress).map((x) => [id, id, x as Record<string, unknown>] as [string, string, Record<string, unknown>])),
    ...all(t, "AWS::EC2::SecurityGroupIngress").map(([id, x]) => [id, refId(x.Properties?.GroupId), x.Properties ?? {}] as [string, string | undefined, Record<string, unknown>]),
  ];
  for (const [id, sg, x] of rules) if (x.CidrIp === "0.0.0.0/0" || x.CidrIpv6 === "::/0")
    if (!(sg && lbSgs.has(sg) && x.IpProtocol === "tcp" && [80, 443].includes(Number(x.FromPort)) && x.FromPort === x.ToPort)) out.push(`${id}: open to the internet on ${json(x.FromPort)}-${json(x.ToPort)} (only the load balancer on 80 and 443 may be)`);
  return out;
}

/** The migration task holds the table owner's address and the service only the app role's (PF-12's split). */
export function roleFindings(t: Template, stage: string): string[] {
  const out: string[] = [];
  const { service, migration } = taskDefinitions(t);
  if (!migration) return ["no migration task (a task definition running prisma migrate deploy)"];
  if (!service) return ["no task definition run by the service"];
  const names = (td: Res) => new Map(containers(td).flatMap((c) => (c.Secrets ?? []).map((s) => [s.Name, secretName(t, s.ValueFrom)] as const)));
  const m = names(migration[1]), s = names(service[1]);
  const owner = `xr/${stage}/DATABASE_OWNER_URL`, app = `xr/${stage}/APP_DATABASE_URL`;
  if (m.get("DATABASE_URL") !== owner) out.push(`migration task's DATABASE_URL is ${json(m.get("DATABASE_URL"))}, not the owner's address`);
  if ([...m.values()].includes(app)) out.push("migration task holds the app role's address");
  // requests run as the app role (APP_DATABASE_URL, firm-scope.ts); DATABASE_URL is the job runner's (platform-jobs.ts)
  if (s.get("DATABASE_URL") !== owner) out.push(`service's DATABASE_URL is ${json(s.get("DATABASE_URL"))}: the job runner needs the owner's address (re-review n1)`);
  if (s.get("APP_DATABASE_URL") !== app) out.push(`service's APP_DATABASE_URL is ${json(s.get("APP_DATABASE_URL"))}, not the app role's address`);
  for (const [n, v] of s) if (v === owner && n !== "DATABASE_URL") out.push(`service's ${n} holds the owner's address`);
  for (const [n, v] of s) if (v?.startsWith("(generated")) out.push(`service's ${n} holds the database admin's secret`);
  return out;
}

/** At least `min` tasks, in subnets of at least two zones, on Fargate. */
export function spreadFindings(t: Template, min = 2): string[] {
  const svcs = all(t, "AWS::ECS::Service");
  if (svcs.length === 0) return ["no ECS service"];
  return svcs.flatMap(([id, r]) => {
    const p = r.Properties ?? {}, out: string[] = [];
    if (!(Number(p.DesiredCount) >= min)) out.push(`${id}: ${json(p.DesiredCount)} tasks, fewer than ${min}`);
    if (p.LaunchType !== "FARGATE") out.push(`${id}: not on Fargate`);
    const subnets = arr(g(p, "NetworkConfiguration", "AwsvpcConfiguration", "Subnets")).map(refId);
    const zones = new Set(subnets.map((s) => json(s && g(t.Resources?.[s], "Properties", "AvailabilityZone"))));
    if (zones.size < 2) out.push(`${id}: its subnets span ${zones.size} zone(s), not two`);
    return out;
  });
}

const TLS12_PLUS = /^ELBSecurityPolicy-(TLS13-1-[23]-|TLS-1-2-|FS-1-2-)/;
/** Every listener is HTTPS with a certificate and a TLS 1.2+ policy, or HTTP whose only actions redirect to HTTPS. */
export function listenerFindings(t: Template): string[] {
  const out: string[] = [];
  const ls = all(t, "AWS::ElasticLoadBalancingV2::Listener");
  if (!ls.some(([, l]) => l.Properties?.Protocol === "HTTPS")) out.push("no HTTPS listener");
  for (const [id, l] of ls) {
    const p = l.Properties ?? {};
    if (p.Protocol === "HTTPS") {
      if (!TLS12_PLUS.test(String(p.SslPolicy))) out.push(`${id}: TLS policy ${json(p.SslPolicy)} allows below TLS 1.2`);
      if (!arr(p.Certificates).length) out.push(`${id}: no certificate`);
      continue;
    }
    const rules = all(t, "AWS::ElasticLoadBalancingV2::ListenerRule").filter(([, r]) => refId(r.Properties?.ListenerArn) === id);
    const actions = [...arr(p.DefaultActions), ...rules.flatMap(([, r]) => arr(r.Properties?.Actions))] as { Type: string; RedirectConfig?: { Protocol?: string } }[];
    if (!actions.length || actions.some((a) => a.Type !== "redirect" || a.RedirectConfig?.Protocol !== "HTTPS" || ![undefined, "#{host}"].includes(g(a.RedirectConfig, "Host") as string))) out.push(`${id}: plain ${json(p.Protocol)} on ${json(p.Port)} answers with more than a redirect to HTTPS`);
  }
  return out;
}

/** A DNS-validated wildcard certificate for `*.<domain>` on the HTTPS listener, and `*.<domain>` pointing at the load balancer. */
export function wildcardFindings(t: Template, domain: string): string[] {
  const out: string[] = [];
  const cert = all(t, "AWS::CertificateManager::Certificate").find(([, c]) => c.Properties?.DomainName === `*.${domain}`);
  if (!cert) return [`no certificate for *.${domain}`];
  if (cert[1].Properties?.ValidationMethod !== "DNS") out.push(`*.${domain} certificate is not DNS-validated`);
  if (!all(t, "AWS::ElasticLoadBalancingV2::Listener").some(([, l]) => l.Properties?.Protocol === "HTTPS" && json(l.Properties?.Certificates).includes(`"${cert[0]}"`))) out.push(`*.${domain} certificate is on no HTTPS listener`);
  const rec = all(t, "AWS::Route53::RecordSet").find(([, r]) => r.Properties?.Name === `*.${domain}.` && r.Properties?.Type === "A");
  if (!rec || !all(t, "AWS::ElasticLoadBalancingV2::LoadBalancer").some(([lb]) => json(rec[1].Properties?.AliasTarget).includes(`"${lb}"`))) out.push(`*.${domain} does not point at the load balancer`);
  return out;
}

/** SES: the identity signs with DKIM (its three CNAMEs published), SPF on the MAIL FROM domain, a DMARC record. */
export function mailFindings(t: Template, domain: string): string[] {
  const out: string[] = [];
  const ids = all(t, "AWS::SES::EmailIdentity").filter(([, r]) => r.Properties?.EmailIdentity === domain);
  if (!ids.length) return [`no SES identity for ${domain}`];
  const [id, r] = ids[0];
  if (g(r.Properties, "DkimAttributes", "SigningEnabled") !== true) out.push(`${id}: DKIM signing off`);
  const recs = all(t, "AWS::Route53::RecordSet").map(([, x]) => x.Properties ?? {});
  if (recs.filter((x) => x.Type === "CNAME" && json(x.Name).includes(`"${id}"`) && json(x.Name).includes("DkimDNSTokenName")).length !== 3) out.push(`${id}: the three DKIM records are not published`);
  const from = g(r.Properties, "MailFromAttributes", "MailFromDomain");
  if (!from || !recs.some((x) => x.Type === "TXT" && x.Name === `${from}.` && /v=spf1 (?![^"]*\+all)[^"]*[-~]all/.test(json(x.ResourceRecords)))) out.push(`${id}: no SPF record ending ~all or -all on a MAIL FROM domain`);
  if (!recs.some((x) => x.Type === "TXT" && x.Name === `_dmarc.${domain}.` && json(x.ResourceRecords).includes("v=DMARC1"))) out.push(`no DMARC record for ${domain}`);
  return out;
}

/** Three separate Cognito pools (staff, own-staff, clients), each with its own app client; both staff pools need two-step.
 *  QA-643: on a stack with a domain both staff pools also take a passkey with user verification in place of password plus
 *  app (`domain` is the stack's domain, or NO_DOMAIN: then no staff pool may offer passkeys, having no relying party). */
export function poolFindings(t: Template, stage: string, domain: string): string[] {
  const out: string[] = [];
  const pools = all(t, "AWS::Cognito::UserPool");
  const want = ["staff", "own-staff", "clients"].map((n) => `xr-${stage}-${n}`);
  const names = pools.map(([, p]) => String(p.Properties?.UserPoolName));
  if (json([...names].sort()) !== json([...want].sort())) out.push(`pools are ${json(names)}, not the three separate ${json(want)}`);
  const clients = all(t, "AWS::Cognito::UserPoolClient").map(([, c]) => refId(c.Properties?.UserPoolId));
  for (const [id, p] of pools) {
    if (clients.filter((c) => c === id).length !== 1) out.push(`${id}: ${clients.filter((c) => c === id).length} app clients, not its own one`);
    if (/-(own-)?staff$/.test(String(p.Properties?.UserPoolName)) && p.Properties?.MfaConfiguration !== "ON") out.push(`${id}: a staff pool without required two-step sign-in`);
    if (p.Properties?.DeletionProtection !== "ACTIVE") out.push(`${id}: deletion protection off`);
    if (g(p.Properties, "AdminCreateUserConfig", "AllowAdminCreateUserOnly") !== true) out.push(`${id}: anyone may sign up (break m2)`);
    if (/-(own-)?staff$/.test(String(p.Properties?.UserPoolName))) out.push(...passkeyFindings(t, id, p, domain));
    else if (g(p.Properties, "Policies", "SignInPolicy") !== undefined || Object.keys(p.Properties ?? {}).some((k) => k.startsWith("WebAuthn"))) out.push(`${id}: sign-in factors or passkeys set on the clients' pool, which PF-4p has not decided`);
  }
  for (const [id, c] of all(t, "AWS::Cognito::UserPoolClient")) if (c.Properties?.AllowedOAuthFlowsUserPoolClient === true) out.push(`${id}: OAuth flows on with no hosted domain or real callback (break m3)`);
  const svc = taskDefinitions(t).service, poolEnv = svc && env(containers(svc[1])[0]).get("PLATFORM_COGNITO_USER_POOL_ID");
  const staffPool = pools.find(([, p]) => String(p.Properties?.UserPoolName) === `xr-${stage}-staff`)?.[0];
  if (!staffPool || refId(poolEnv) !== staffPool) out.push(`the service signs staff in against ${json(poolEnv)}, not the staff pool (break m2)`);
  return out;
}

/** QA-643 (PF-4b): one staff pool's sign-in factors (break round 1: each list exact, not "contains").
 *  Always: the authenticator app is the only second step (no email or SMS code, which the inbox or phone alone would
 *  pass) and no remembered device skips it. With a domain: first factors exactly a password and a passkey, user
 *  verification required, a verified passkey counting as both steps (MULTI_FACTOR_WITH_USER_VERIFICATION; never a
 *  passkey alone without verification), the relying party the stack's domain and a tier that has these (Essentials or
 *  Plus). With no domain: a password only and no passkey setting at all. Both (PF-4bs): its app client allows exactly the
 *  admin password flow and refresh (the pool's passkey half waits for the passkey row), a 15-minute challenge, no
 *  existence errors. */
function passkeyFindings(t: Template, id: string, p: Res, domain: string): string[] {
  const out: string[] = [], P = p.Properties ?? {};
  const first = arr(g(P, "Policies", "SignInPolicy", "AllowedFirstAuthFactors")).map(String);
  const client = all(t, "AWS::Cognito::UserPoolClient").find(([, c]) => refId(c.Properties?.UserPoolId) === id)?.[1];
  const flows = arr(client?.Properties?.ExplicitAuthFlows).map(String).sort();
  if (json(arr(P.EnabledMfas)) !== json(["SOFTWARE_TOKEN_MFA"])) out.push(`${id}: second steps ${json(P.EnabledMfas)}, not the authenticator app only`);
  if (P.DeviceConfiguration !== undefined) out.push(`${id}: remembered devices ${json(P.DeviceConfiguration)} could skip the second step`);
  // PF-4bs (Lead 23, 24 Nov), both modes: only our API signs a staff member in (the admin password flow) and refreshes;
  // SRP and USER_AUTH stay off until passkeys are built, so the public client id goes around nothing; a challenge lasts
  // CHALLENGE_MINUTES; a refusal never says whether the person exists
  if (json(flows) !== json(["ALLOW_ADMIN_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"])) out.push(`${id}: its app client allows ${json(flows)}, not the admin password flow and refresh only (PF-4bs)`);
  if (client?.Properties?.AuthSessionValidity !== CHALLENGE_MINUTES) out.push(`${id}: its app client's sign-in challenge lasts ${json(client?.Properties?.AuthSessionValidity)} minutes, not ${CHALLENGE_MINUTES}`);
  if (client?.Properties?.PreventUserExistenceErrors !== "ENABLED") out.push(`${id}: its app client tells whether a person exists (PreventUserExistenceErrors ${json(client?.Properties?.PreventUserExistenceErrors)})`);
  if (domain === NO_DOMAIN) {
    if (first.length && json(first) !== json(["PASSWORD"])) out.push(`${id}: first sign-in factors ${json(first)}, not a password only (no domain)`);
    if (P.WebAuthnRelyingPartyID !== undefined || P.WebAuthnFactorConfiguration !== undefined || P.WebAuthnUserVerification !== undefined) out.push(`${id}: passkeys on with no domain to be their relying party`);
    return out;
  }
  if (json([...first].sort()) !== json(["PASSWORD", "WEB_AUTHN"])) out.push(`${id}: first sign-in factors ${json(first)}, not exactly a password and a passkey (QA-643)`);
  if (P.WebAuthnUserVerification !== "required") out.push(`${id}: passkey user verification ${json(P.WebAuthnUserVerification)}, not required`);
  if (P.WebAuthnFactorConfiguration !== "MULTI_FACTOR_WITH_USER_VERIFICATION") out.push(`${id}: a passkey is ${json(P.WebAuthnFactorConfiguration)}, not both steps with user verification (MULTI_FACTOR_WITH_USER_VERIFICATION)`);
  if (P.WebAuthnRelyingPartyID !== domain) out.push(`${id}: passkey relying party ${json(P.WebAuthnRelyingPartyID)}, not ${domain}`);
  if (!["ESSENTIALS", "PLUS"].includes(String(P.UserPoolTier))) out.push(`${id}: tier ${json(P.UserPoolTier)} has no passkey sign-in (Essentials or Plus)`);
  return out;
}

/** PF-8b F1 (AWS preflight, 21 Nov): the service's and the migration's containers each send their output with the awslogs
 *  driver to this stack's app log group (`/xr/<stage>/app`, PF-23c), in this stack's region, so R1.13's alarms and R1.15's
 *  log checks see the app's lines. No driver, another driver or another group is a finding. */
export function logFindings(t: Template, stage: string, region = "ca-central-1"): string[] {
  const groups = all(t, "AWS::Logs::LogGroup").filter(([, r]) => g(r, "Properties", "LogGroupName") === `/xr/${stage}/app`).map(([id]) => id);
  const { service, migration } = taskDefinitions(t), out: string[] = [];
  if (groups.length !== 1) out.push(`${groups.length} log groups named /xr/${stage}/app, not one`);
  for (const [what, td] of [["service", service], ["migration", migration]] as const) {
    if (!td) { out.push(`no ${what} task definition`); continue; }
    for (const c of containers(td[1])) {
      const lc = g(c, "LogConfiguration");
      if (g(lc, "LogDriver") !== "awslogs") out.push(`${what}/${c.Name}: log driver ${json(g(lc, "LogDriver"))}, not awslogs`);
      else if (refId(g(lc, "Options", "awslogs-group")) !== groups[0] || groups.length !== 1) out.push(`${what}/${c.Name}: logs to ${json(g(lc, "Options", "awslogs-group"))}, not /xr/${stage}/app`);
      else if (g(lc, "Options", "awslogs-region") !== region) out.push(`${what}/${c.Name}: logs in ${json(g(lc, "Options", "awslogs-region"))}, not ${region}`);
    }
  }
  // and the log actions CDK grants the execution roles name that one group's ARN and nothing else (review m1: the
  // bypass check only holds them to some resource of this stack)
  for (const [id, r] of all(t, "AWS::IAM::Policy")) for (const st of arr(g(r, "Properties", "PolicyDocument", "Statement"))) {
    const acts = arr(g(st, "Action")).concat(typeof g(st, "Action") === "string" ? [g(st, "Action")] : []);
    if (!acts.some((a) => typeof a === "string" && a.startsWith("logs:"))) continue;
    const res = g(st, "Resource"), want = json({ "Fn::GetAtt": [groups[0], "Arn"] });
    if (groups.length !== 1 || json(res) !== want) out.push(`${id}: allows ${acts.filter((a) => String(a).startsWith("logs:")).join(", ")} on ${json(res).slice(0, 80)}, not the /xr/${stage}/app group's ARN alone`);
  }
  return out;
}

/** PF-8b F2b: the service's task tells the app which domain firm addresses live under (PLATFORM_ADDRESS_SUFFIX), and it is
 *  exactly this stack's domain: the hosted zone's name and the wildcard certificate's base, so the host the load balancer
 *  is reached by is the host the app reads a firm from. */
export function addressSuffixFindings(t: Template, domain: string): string[] {
  const { service } = taskDefinitions(t);
  if (!service) return ["no task definition run by the service"];
  const v = env(containers(service[1])[0]).get("PLATFORM_ADDRESS_SUFFIX"), out: string[] = [];
  if (v !== domain) out.push(`PLATFORM_ADDRESS_SUFFIX is ${json(v)}, not this stack's domain "${domain}"`);
  if (!all(t, "AWS::Route53::HostedZone").some(([, z]) => z.Properties?.Name === `${v}.`)) out.push(`PLATFORM_ADDRESS_SUFFIX ${json(v)} is no hosted zone of this stack`);
  if (!all(t, "AWS::CertificateManager::Certificate").some(([, c]) => c.Properties?.DomainName === `*.${v}`)) out.push(`PLATFORM_ADDRESS_SUFFIX ${json(v)} has no wildcard certificate in this stack`);
  return out;
}

/** PF-8b F3, no-domain mode (`-c xr:domain=none`, staging only): no hosted zone, DNS record, ACM-issued certificate or SES
 *  identity, and no SES grant; every HTTPS listener serves the one imported certificate (xr:certArn, an ACM ARN in
 *  ca-central-1, written into the template; no parameter); the app's PLATFORM_ADDRESS_SUFFIX is the load balancer's AWS name, and the load
 *  balancer's fixed name is lower case (the loader refuses capitals). */
export function noDomainFindings(t: Template): string[] {
  const out: string[] = [];
  for (const type of ["AWS::Route53::HostedZone", "AWS::Route53::RecordSet", "AWS::CertificateManager::Certificate", "AWS::SES::EmailIdentity"])
    for (const [id] of all(t, type)) out.push(`${id}: ${type} in no-domain mode`);
  for (const [id, r] of all(t, "AWS::IAM::Policy")) if (json(g(r, "Properties", "PolicyDocument")).includes('"ses:')) out.push(`${id}: an SES grant in no-domain mode`);
  const https = all(t, "AWS::ElasticLoadBalancingV2::Listener").filter(([, l]) => l.Properties?.Protocol === "HTTPS");
  if (!https.length) out.push("no HTTPS listener");
  for (const [id, l] of https) {
    const certs = arr(l.Properties?.Certificates), arn = g(certs[0], "CertificateArn");
    if (certs.length !== 1 || typeof arn !== "string" || !CERT_ARN_PATTERN.test(arn)) out.push(`${id}: serves ${json(l.Properties?.Certificates)}, not one imported ACM certificate in ca-central-1`);
  }
  // port 80 still answers only with the HTTPS redirect (break 5: the listener sits beside the early return)
  const http = all(t, "AWS::ElasticLoadBalancingV2::Listener").filter(([, l]) => l.Properties?.Port === 80);
  if (http.length !== 1 || g(arr(http[0][1].Properties?.DefaultActions)[0], "RedirectConfig", "Protocol") !== "HTTPS") out.push("port 80 does not redirect to HTTPS");
  const lbs = all(t, "AWS::ElasticLoadBalancingV2::LoadBalancer"), { service } = taskDefinitions(t);
  const v = service ? env(containers(service[1])[0]).get("PLATFORM_ADDRESS_SUFFIX") : undefined;
  if (lbs.length !== 1 || json(v) !== json({ "Fn::GetAtt": [lbs[0][0], "DNSName"] })) out.push(`PLATFORM_ADDRESS_SUFFIX is ${json(v)}, not the load balancer's AWS name`);
  for (const [id, lb] of lbs) if (typeof lb.Properties?.Name !== "string" || !/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(lb.Properties.Name as string)) out.push(`${id}: name ${json(lb.Properties?.Name)} is not fixed lower case`);
  return out;
}

/** PF-F1c: the service's task uses the cloud FilesPort (api/src/platform/files/choose.ts) on the documents bucket: it
 *  sets PLATFORM_FILES=s3, the bucket, the bucket's own KMS key and the home region, and takes the link key as a secret;
 *  its role may get and put firm keys (`<bucket>/*\/*`) of that bucket and list it, and use that key only through S3 in
 *  the home region. No other S3 or KMS grant (no delete, no other bucket, no key outside S3). */
export function filesTaskFindings(t: Template, region = "ca-central-1"): string[] {
  const out: string[] = [];
  const { service } = taskDefinitions(t);
  if (!service) return ["no task definition run by the service"];
  const c = containers(service[1])[0], e = env(c);
  const bucketId = refId(e.get("PLATFORM_FILES_BUCKET"));
  const bucket = bucketId ? t.Resources?.[bucketId] : undefined;
  if (e.get("PLATFORM_FILES") !== "s3") out.push(`PLATFORM_FILES is ${json(e.get("PLATFORM_FILES"))}, not "s3"`);
  if (!bucket || bucket.Type !== "AWS::S3::Bucket" || !bucketId!.startsWith("DocumentsBucket") || json(e.get("PLATFORM_FILES_BUCKET")) !== json({ Ref: bucketId })) out.push(`PLATFORM_FILES_BUCKET is ${json(e.get("PLATFORM_FILES_BUCKET"))}, not this stack's documents bucket`);
  const keyId = refId(g(arr(g(bucket?.Properties, "BucketEncryption", "ServerSideEncryptionConfiguration"))[0], "ServerSideEncryptionByDefault", "KMSMasterKeyID"));
  if (!keyId || json(e.get("PLATFORM_FILES_KMS_KEY_ID")) !== json({ "Fn::GetAtt": [keyId, "Arn"] })) out.push(`PLATFORM_FILES_KMS_KEY_ID is ${json(e.get("PLATFORM_FILES_KMS_KEY_ID"))}, not the bucket's own KMS key`);
  if (e.get("PLATFORM_FILES_REGION") !== region) out.push(`PLATFORM_FILES_REGION is ${json(e.get("PLATFORM_FILES_REGION"))}, not ${region}`);
  if (!(c.Secrets ?? []).some((x) => x.Name === "PLATFORM_FILES_LINK_KEY" && secretName(t, x.ValueFrom))) out.push("PLATFORM_FILES_LINK_KEY is not a Secrets Manager secret of this stack (PLATFORM_FILES=s3 refuses to start without it)");
  const linkSecret = (c.Secrets ?? []).find((x) => x.Name === "PLATFORM_FILES_LINK_KEY");
  const ls = linkSecret ? t.Resources?.[refId(linkSecret.ValueFrom) ?? ""] : undefined;
  if (ls && g(ls.Properties, "GenerateSecretString", "SecretStringTemplate") !== undefined) out.push("PLATFORM_FILES_LINK_KEY is made from a template (a JSON placeholder the loader would take as a key), not random");
  // the grants (review M1): every S3 or KMS statement that reaches any ECS task role, by a policy attached to it (inline
  // on the role, AWS::IAM::Policy or a managed policy of this stack), is one of the three, on the service's task role
  // only; and all three are there. Actions compared as a set, so CDK's minimizePolicies (cdk.json) sorting them is no
  // finding (review m2).
  const role = refId(service[1].Properties?.TaskRoleArn);
  const taskRoles = new Set(all(t, "AWS::ECS::TaskDefinition").map(([, td]) => refId(td.Properties?.TaskRoleArn)).filter((x): x is string => !!x));
  const norm = (st: Record<string, unknown>) => json({ ...st, Action: [...arr(Array.isArray(st.Action) ? st.Action : [st.Action]).map(String)].sort() });
  const want = [
    { Action: ["s3:GetObject", "s3:PutObject"], Effect: "Allow", Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": [bucketId, "Arn"] }, "/*/*"]] } },
    { Action: "s3:ListBucket", Effect: "Allow", Resource: { "Fn::GetAtt": [bucketId, "Arn"] } },
    { Action: ["kms:GenerateDataKey", "kms:Decrypt"], Condition: { StringEquals: { "kms:ViaService": `s3.${region}.amazonaws.com` } }, Effect: "Allow", Resource: { "Fn::GetAtt": [keyId, "Arn"] } },
  ].map(norm);
  const reaching: [string, string, unknown][] = [];   // [where, role, document]
  for (const [id, p] of [...all(t, "AWS::IAM::Policy"), ...all(t, "AWS::IAM::ManagedPolicy")]) for (const r of arr(p.Properties?.Roles)) { const rid = refId(r); if (rid && taskRoles.has(rid)) reaching.push([id, rid, g(p.Properties, "PolicyDocument")]); }
  for (const rid of taskRoles) for (const ip of arr(g(t.Resources?.[rid], "Properties", "Policies"))) reaching.push([`${rid} inline`, rid, g(ip, "PolicyDocument")]);
  const got: string[] = [];
  for (const [where, rid, doc] of reaching) for (const st of arr(g(doc, "Statement")) as Record<string, unknown>[]) {
    const acts = arr(Array.isArray(st.Action) ? st.Action : [st.Action]).map(String);
    if (!acts.some((a) => /^(s3|kms|\*)/i.test(a))) continue;
    if (rid !== role) { out.push(`${where}: task role ${rid} is granted ${json(st.Action)}: only the service's task role may use the files bucket or the data key`); continue; }
    got.push(norm(st));
    if (!want.includes(norm(st))) out.push(`${where}: the task role's grant ${json(st).slice(0, 160)} is not one of the files grants`);
  }
  for (const w of want) if (!got.includes(w)) out.push(`the task role lacks ${w.slice(0, 120)}`);
  return out;
}

/** PF-4bs (concept screens/PF-4bs r3 §4): every statement reaching an ECS task role (inline, AWS::IAM::Policy or a managed
 *  policy of this stack) that names a Cognito action, or any action wildcard, is the one sign-in grant: on the service's
 *  task role only, Allow, exactly SIGN_IN_ACTIONS (as a set), on `Fn::GetAtt [<the pool PLATFORM_COGNITO_USER_POOL_ID
 *  names>, Arn]` alone (never checks.ts own()'s joined ARN, which could name another pool: challenge m1), with no other
 *  key (no condition, no NotAction or NotResource); and that grant is there. */
export function signInTaskFindings(t: Template, stage: string): string[] {
  const out: string[] = [];
  const { service } = taskDefinitions(t);
  if (!service) return ["no task definition run by the service"];
  const pool = refId(env(containers(service[1])[0]).get("PLATFORM_COGNITO_USER_POOL_ID"));
  if (!pool || String(t.Resources?.[pool]?.Properties?.UserPoolName) !== `xr-${stage}-staff`) out.push(`the service's pool ${json(pool)} is not the staff pool xr-${stage}-staff`);
  const role = refId(service[1].Properties?.TaskRoleArn);
  const taskRoles = new Set(all(t, "AWS::ECS::TaskDefinition").map(([, td]) => refId(td.Properties?.TaskRoleArn)).filter((x): x is string => !!x));
  const reaching: [string, string, unknown][] = [];   // [where, role, document]
  for (const [id, p] of [...all(t, "AWS::IAM::Policy"), ...all(t, "AWS::IAM::ManagedPolicy")]) for (const r of arr(p.Properties?.Roles)) { const rid = refId(r); if (rid && taskRoles.has(rid)) reaching.push([id, rid, g(p.Properties, "PolicyDocument")]); }
  for (const rid of taskRoles) for (const ip of arr(g(t.Resources?.[rid], "Properties", "Policies"))) reaching.push([`${rid} inline`, rid, g(ip, "PolicyDocument")]);
  const want = json({ Action: [...SIGN_IN_ACTIONS].sort(), Effect: "Allow", Resource: { "Fn::GetAtt": [pool, "Arn"] } });
  let exact = 0;
  for (const [where, rid, doc] of reaching) for (const st of arr(g(doc, "Statement")) as Record<string, unknown>[]) {
    const acts = [st.Action, st.NotAction].flatMap((x) => arr(Array.isArray(x) ? x : x === undefined ? [] : [x])).map(String);
    if (!acts.some((a) => /^cognito/i.test(a)) && !covers(acts, ...SIGN_IN_ACTIONS, "cognito-idp:DeleteUserPool")) continue;   // IAM globs too ("*", "cogn*")
    if (rid !== role) { out.push(`${where}: task role ${rid} is granted ${json(st.Action ?? st.NotAction)}: only the service's task role may call Cognito`); continue; }
    const got = json({ ...st, Action: [...arr(Array.isArray(st.Action) ? st.Action : [st.Action]).map(String)].sort() });
    if (got === want) exact++;
    else out.push(`${where}: the task role's grant ${json(st).slice(0, 200)} is not the sign-in grant (exactly ${SIGN_IN_ACTIONS.length} actions on the staff pool's ARN)`);
  }
  if (exact !== 1) out.push(`the task role lacks the sign-in grant (exactly ${SIGN_IN_ACTIONS.length} actions on the staff pool's ARN, once): found ${exact}`);
  return out;
}
