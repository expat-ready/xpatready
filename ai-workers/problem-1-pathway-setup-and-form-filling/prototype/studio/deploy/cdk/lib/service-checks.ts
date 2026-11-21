// PF-8b's checks over a synthesized template: pure functions returning plain-words findings (empty = pass), run on the
// real stacks (must pass) and on broken copies (must fail) by test/service.test.ts, as PF-8a's checks.ts does.
import type { Template } from "./checks.ts";

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
// A value that looks like a credential, wherever it sits in a plain environment value.
const CREDENTIAL = /(?:^|[^A-Za-z])(sk|rk)_(test|live)_|whsec_|postgres(ql)?:\/\/[^\s/]*:[^\s/@]+@|-----BEGIN|AKIA[0-9A-Z]{16}/;

/** The task definitions by job: the one the ECS service runs, and the one-off migration task (`prisma migrate deploy`). */
export function taskDefinitions(t: Template): { service?: [string, Res]; migration?: [string, Res] } {
  const tds = all(t, "AWS::ECS::TaskDefinition");
  const svcTd = refId(all(t, "AWS::ECS::Service")[0]?.[1].Properties?.TaskDefinition);
  return {
    service: tds.find(([id]) => id === svcTd),
    migration: tds.find(([id, r]) => id !== svcTd && containers(r).some((c) => json(c.Command).includes('"migrate","deploy"'))),
  };
}

/** PF-24's loader (api/src/platform/config/settings.ts) as text: each setting's name, whether it is secret and required. */
export function loaderSettings(source: string): { name: string; secret: boolean; required: boolean }[] {
  return [...source.matchAll(/\b(s|opt)\("[^"]+", "([A-Z0-9_]+)", (true|false)/g)].map((m) => ({ name: m[2], secret: m[3] === "true", required: m[1] === "s" }));
}

/** The service's task: PLATFORM_ENVIRONMENT=production and PLATFORM_IDENTITY=cognito set explicitly; every required
 *  loader setting supplied; every secret one (and APP_DATABASE_URL) only as a Secrets Manager reference of this stack;
 *  no plain value of any task definition looks like a credential. */
export function taskSettingFindings(t: Template, settings: { name: string; secret: boolean; required: boolean }[]): string[] {
  const out: string[] = [];
  const { service } = taskDefinitions(t);
  if (!service) return ["no task definition run by the service"];
  const c = containers(service[1])[0];
  const e = env(c), s = new Map((c.Secrets ?? []).map((x) => [x.Name, x.ValueFrom]));
  if (e.get("PLATFORM_ENVIRONMENT") !== "production") out.push(`PLATFORM_ENVIRONMENT is ${json(e.get("PLATFORM_ENVIRONMENT"))}, not "production" (rev 16.5: set explicitly)`);
  if (e.get("PLATFORM_IDENTITY") !== "cognito") out.push(`PLATFORM_IDENTITY is ${json(e.get("PLATFORM_IDENTITY"))}, not "cognito"`);
  for (const x of settings) if (x.required && !e.has(x.name) && !s.has(x.name)) out.push(`${x.name}: required by PF-24's loader, not supplied`);
  for (const name of [...settings.filter((x) => x.secret).map((x) => x.name), "APP_DATABASE_URL"]) {
    if (e.has(name)) out.push(`${name}: a secret given as a plain environment value`);
    if (s.has(name) && !secretName(t, s.get(name))) out.push(`${name}: not a Secrets Manager secret of this stack (${json(s.get(name))})`);
  }
  for (const [id, td] of all(t, "AWS::ECS::TaskDefinition")) for (const k of containers(td)) for (const v of k.Environment ?? [])
    if (CREDENTIAL.test(json(v.Value))) out.push(`${id}/${k.Name}: ${v.Name} holds what looks like a credential`);
  return out;
}

/** Who reads which secret: each task definition's execution role may read exactly the secrets its containers reference;
 *  a task role reads none; no other policy in the stack reads them. */
export function secretReadFindings(t: Template): string[] {
  const out: string[] = [];
  const reads = (roleId: string) => all(t, "AWS::IAM::Policy").filter(([, p]) => json(p.Properties?.Roles).includes(`"${roleId}"`))
    .flatMap(([, p]) => arr(g(p.Properties, "PolicyDocument", "Statement")) as { Action: unknown; Resource: unknown }[])
    .filter((st) => /secretsmanager:(GetSecretValue|\*)|"\*"/.test(json(st.Action)))
    .flatMap((st) => (Array.isArray(st.Resource) ? st.Resource : [st.Resource]).map((r) => refId(r) ?? json(r)));
  const owned = new Set<string>();
  for (const [id, td] of all(t, "AWS::ECS::TaskDefinition")) {
    const wanted = new Set(containers(td).flatMap((c) => (c.Secrets ?? []).map((s) => refId(s.ValueFrom) ?? json(s.ValueFrom))));
    const exec = refId(td.Properties?.ExecutionRoleArn), task = refId(td.Properties?.TaskRoleArn);
    const got = new Set(exec ? reads(exec) : []);
    for (const w of wanted) if (!got.has(w)) out.push(`${id}: execution role cannot read ${w}`);
    for (const g of got) if (!wanted.has(g)) out.push(`${id}: execution role reads ${g}, which its task does not use`);
    if (task && reads(task).length) out.push(`${id}: task role reads secrets (${reads(task).join(", ")})`);
    [exec, task].forEach((r) => r && owned.add(r));
  }
  for (const [id, p] of all(t, "AWS::IAM::Policy")) {
    const roles = arr(p.Properties?.Roles).map(refId);
    if (roles.some((r) => r && owned.has(r))) continue;
    if (/secretsmanager:GetSecretValue/.test(json(p.Properties?.PolicyDocument)) && /AppSecret/.test(json(p.Properties?.PolicyDocument))) out.push(`${id}: another policy reads the app's secrets`);
  }
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
  if (m.get("DATABASE_URL") !== `xr/${stage}/DATABASE_OWNER_URL`) out.push(`migration task's DATABASE_URL is ${json(m.get("DATABASE_URL"))}, not the owner's address`);
  for (const n of ["DATABASE_URL", "APP_DATABASE_URL"]) if (s.get(n) !== `xr/${stage}/DATABASE_URL`) out.push(`service's ${n} is ${json(s.get(n))}, not the app role's address`);
  for (const [n, v] of s) if (v === `xr/${stage}/DATABASE_OWNER_URL` || v?.startsWith("(generated")) out.push(`service's ${n} holds the owner's or the database admin's secret`);
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
    if (!actions.length || actions.some((a) => a.Type !== "redirect" || a.RedirectConfig?.Protocol !== "HTTPS")) out.push(`${id}: plain ${json(p.Protocol)} on ${json(p.Port)} answers with more than a redirect to HTTPS`);
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
  if (!from || !recs.some((x) => x.Type === "TXT" && x.Name === `${from}.` && json(x.ResourceRecords).includes("v=spf1"))) out.push(`${id}: no SPF record on a MAIL FROM domain`);
  if (!recs.some((x) => x.Type === "TXT" && x.Name === `_dmarc.${domain}.` && json(x.ResourceRecords).includes("v=DMARC1"))) out.push(`no DMARC record for ${domain}`);
  return out;
}

/** Three separate Cognito pools (staff, own-staff, clients), each with its own app client; both staff pools need two-step. */
export function poolFindings(t: Template, stage: string): string[] {
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
  }
  return out;
}
