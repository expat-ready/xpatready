// PF-23c's assertion tests (R1.13's cloud half; NFR5-14): log groups in ca-central-1 kept 90 days, metric filters over
// PF-23's real line shapes, and alarms that page the on-call address. Each check passes on the real stacks and fails on
// a broken copy, so none is blind. Synth only: no AWS account, key or network. Run: npm test, in deploy/cdk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Template as Assert } from "aws-cdk-lib/assertions";
import { allStacks, buildApp, STAGES } from "../lib/app.ts";
import { ON_CALL_PARAMETER, REGION_ALLOW, regionFindings, typeFindings } from "../lib/checks.ts";
import { ALARMED_ALERT_KINDS, ALARMS, FAST_BURN, FILTERS, LOG_RETENTION_DAYS, SAMPLE, SLO_5XX_PCT, alarmFindings, alertMetric, matchesFilter, retentionFindings } from "../lib/observability.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(HERE, "..", "..", "..");
const src = (p: string) => readFileSync(join(STUDIO, p), "utf8");
const { app, stacks } = buildApp();
type R = { Type: string; Properties?: Record<string, any> };
type T = { Resources: Record<string, R>; Parameters?: Record<string, any> };
const tpl = Object.fromEntries(STAGES.map((s) => [s, Assert.fromStack(stacks[s]).toJSON() as T])) as Record<string, T>;
const clone = <X>(v: X): X => JSON.parse(JSON.stringify(v));
const find = (t: T, type: string, pred: (r: R) => boolean = () => true) => Object.entries(t.Resources).find(([, r]) => r.Type === type && pred(r))!;
const alarmNamed = (t: T, name: string) => find(t, "AWS::CloudWatch::Alarm", (r) => r.Properties?.AlarmName === name);

// Lines in the shape PF-23 writes them (log.ts stamps time, level, event; metrics.ts adds the rest). The last test below
// checks metrics.ts still writes these names, so a rename in the app fails here, not silently in the cloud.
const stamp = (event: string, level = "info") => ({ time: "2026-11-21T06:00:00.000Z", level, event });
const LINES = {
  ok: { ...stamp("request"), method: "GET", route: "/api/x", status: 200, durationMs: 4, correlationId: "c1", Route: "GET /api/x", Requests: 1, Errors: 0, Latency: 4 },
  notFound: { ...stamp("request", "warn"), method: "GET", route: "/api/x", status: 404, durationMs: 4, correlationId: "c2", Route: "GET /api/x", Requests: 1, Errors: 0, Latency: 4 },
  error: { ...stamp("request", "error"), method: "POST", route: "/api/y", status: 503, durationMs: 9, correlationId: "c3", Route: "POST /api/y", Requests: 1, Errors: 1, Latency: 9 },
  jobDone: { ...stamp("job"), queue: "mail_out", jobId: "j1", outcome: "done", durationMs: 5, ageMs: 120, Queue: "mail_out", JobRuns: 1, JobFailures: 0, JobAge: 120, JobDuration: 5 },
  jobFailed: { ...stamp("job", "error"), queue: "mail_out", jobId: "j2", outcome: "failed", durationMs: 5, ageMs: 2_000_000, Queue: "mail_out", JobRuns: 1, JobFailures: 1, JobAge: 2_000_000, JobDuration: 5 },
  jobNoAge: { ...stamp("job"), queue: "mail_out", jobId: "j3", outcome: "done", durationMs: 5, Queue: "mail_out", JobRuns: 1, JobFailures: 0, JobDuration: 5 },
  sent: { ...stamp("mail_sent"), MailSent: 1, Service: "studio-api" },
  bounced: { ...stamp("mail_bounced", "warn"), MailBounced: 1, Service: "studio-api" },
  auditFailed: { ...stamp("audit_write_failed", "error"), AuditWriteFailures: 1, Service: "studio-api", attempts: 3 },
  ...Object.fromEntries([...ALARMED_ALERT_KINDS, "send_cap_reached"].map((k) => [`alert:${k}`, { ...stamp("alert", "error"), AlertKind: k, Alerts: 1, alert: k, rule: "R" }])),
} as Record<string, Record<string, unknown>>;

test("PF-23c retention pass: each stage has its app log group in ca-central-1, kept 90 days, and nothing names another region", () => {
  for (const s of STAGES) {
    assert.equal(stacks[s].region, "ca-central-1");
    const [, g] = find(tpl[s], "AWS::Logs::LogGroup", (r) => r.Properties?.LogGroupName === `/xr/${s}/app`);
    assert.equal(g.Properties?.RetentionInDays, LOG_RETENTION_DAYS);
    assert.equal(LOG_RETENTION_DAYS, 90);
    assert.deepEqual(retentionFindings(tpl[s], s), []);
  }
  assert.deepEqual(regionFindings(allStacks(app), REGION_ALLOW), []);
  assert.deepEqual(typeFindings(allStacks(app)), []); // the five PF-23c types are estate types
});

test("PF-23c region guard: only the on-call email subscription may read a deploy parameter; any other use is still refused", () => {
  const home = allStacks(app).find((s) => s.name === "xr-production")!;
  const run = (t: any) => regionFindings([{ ...home, template: t }], REGION_ALLOW).filter((l) => l.includes("parameter set at deploy time"));
  assert.deepEqual(run(home.template), []);
  assert.equal(home.template.Parameters && (home.template.Parameters as any).OnCallEmail.AllowedPattern, ON_CALL_PARAMETER.allowedPattern);
  const subId = () => Object.keys(home.template.Resources!).find((k) => home.template.Resources![k].Type === "AWS::SNS::Subscription")!;
  const breaks: [string, (t: any) => void][] = [
    ["a default", (t) => { t.Parameters.OnCallEmail.Default = "someone@example.com"; }],
    ["a looser pattern", (t) => { t.Parameters.OnCallEmail.AllowedPattern = ".*"; }],
    ["another protocol", (t) => { t.Resources[subId()].Properties.Protocol = "https"; }],
    ["another resource", (t) => { t.Resources.Stray = { Type: "AWS::SNS::Topic", Properties: { DisplayName: { Ref: "OnCallEmail" } } }; }],
    ["another parameter", (t) => { t.Parameters.Other = { Type: "String" }; t.Resources[subId()].Properties.Endpoint = { Ref: "Other" }; }],
  ];
  for (const [why, mutate] of breaks) { const t = clone(home.template); mutate(t); assert.equal(run(t).length, 1, why); }
  // the exemption never switches off the joined dynamic-reference check on that subscription (review R2-M1)
  const joined = clone(home.template);
  joined.Resources[subId()].Properties.Region = { "Fn::Join": ["", ["{{resol", "ve:ssm:/xr/region}}"]] };
  const fj = regionFindings([{ ...home, template: joined }], REGION_ALLOW);
  assert.ok(fj.some((l) => l.includes("a dynamic reference (joined from parts)")), fj.join("; "));
});

test("PF-23c retention fail: a log group kept for ever or 30 days, the app's kept 365, or no app group at all, is named", () => {
  const t = clone(tpl.production);
  const [id] = find(t, "AWS::Logs::LogGroup");
  t.Resources.Forever = { Type: "AWS::Logs::LogGroup", Properties: {} };
  t.Resources.Short = { Type: "AWS::Logs::LogGroup", Properties: { RetentionInDays: 30 } };
  t.Resources.Longer = { Type: "AWS::Logs::LogGroup", Properties: { RetentionInDays: 365 } }; // another group may keep longer (NFR5-14 "≥ 90")
  t.Resources[id].Properties!.RetentionInDays = 365;
  const f = retentionFindings(t, "production");
  assert.deepEqual(f.sort(), [`${id}: the app's logs kept 365 days, not 90`, "Forever: logs kept for ever, not a set 90+ days", "Short: logs kept 30 days, under 90"].sort());
  assert.deepEqual(retentionFindings({ Resources: {} }, "production"), ["no log group /xr/production/app"]);
});

test("PF-23c alarms pass: every alarm the row names exists in both stages, pages the on-call email and reads its filter", () => {
  assert.deepEqual(Object.keys(ALARMS).sort(), ["5xx-rate", "alert-audit-chain-integrity-failure", "alert-audit-write-failed", "alert-breach-clock-near", "alert-job-stuck", "alert-privacy-clock-near", "job-age", "job-failures", "mail-bounce-rate"]);
  for (const s of STAGES) assert.deepEqual(alarmFindings(tpl[s], s), []);
  assert.equal(Object.values(tpl.production.Resources).filter((r) => r.Type === "AWS::CloudWatch::Alarm").length, Object.keys(ALARMS).length);
});

test("PF-23c alarms fail: a missing alarm, an alarm with no action, a hard-coded or defaulted address, a changed filter are each named", () => {
  const t = clone(tpl.production);
  const [gone] = alarmNamed(t, "xr-production-job-age"); delete t.Resources[gone];
  const [mute] = alarmNamed(t, "xr-production-alert-audit-chain-integrity-failure"); t.Resources[mute].Properties!.AlarmActions = [];
  const [, f] = find(t, "AWS::Logs::MetricFilter", (r) => r.Properties?.MetricTransformations?.[0]?.MetricName === "ServerErrors");
  f.Properties!.FilterPattern = '{ $.event = "request" && $.status >= 400 }'; // a 404 would page
  const fs = alarmFindings(t, "production");
  assert.ok(fs.includes("xr-production-job-age: no alarm"), fs.join("; "));
  assert.ok(fs.includes("xr-production-alert-audit-chain-integrity-failure: AlarmActions reach no topic with the on-call email parameter"), fs.join("; "));
  assert.ok(fs.some((l) => l.startsWith("xr-production-5xx-rate: ServerErrors's filter is")), fs.join("; "));

  const hard = clone(tpl.production);
  const [, sub] = find(hard, "AWS::SNS::Subscription"); sub.Properties!.Endpoint = "someone@example.com";
  assert.ok(alarmFindings(hard, "production").some((l) => l.endsWith("AlarmActions reach no topic with the on-call email parameter")));
  const defaulted = clone(tpl.production);
  defaulted.Parameters!.OnCallEmail.Default = "someone@example.com"; // a deploy would page a guessed address
  assert.ok(alarmFindings(defaulted, "production").some((l) => l.endsWith("OKActions reach no topic with the on-call email parameter")));

  const noisy = clone(tpl.production);
  const [, al] = alarmNamed(noisy, "xr-production-alert-breach-clock-near"); al.Properties!.OKActions = al.Properties!.AlarmActions;
  assert.ok(alarmFindings(noisy, "production").includes("xr-production-alert-breach-clock-near: an alert alarm sends OK while its incident is still open"));

  const orphan = clone(tpl.production);
  const [, a] = alarmNamed(orphan, "xr-production-job-failures"); a.Properties!.MetricName = "Nothing";
  const fo = alarmFindings(orphan, "production");
  assert.ok(fo.some((l) => l.includes("metric ExpatReady/Alarms/production/Nothing comes from no metric filter")), fo.join("; "));
  const shortLogs = clone(tpl.production);
  const [, g] = find(shortLogs, "AWS::Logs::LogGroup"); g.Properties!.RetentionInDays = 7;
  assert.ok(alarmFindings(shortLogs, "production").some((l) => l.endsWith("not on a 90-day log group of this stack")));
});

test("PF-23c the on-call address is a deploy parameter with no default that takes one email address", () => {
  const p = tpl.production.Parameters!.OnCallEmail;
  assert.equal(p.Default, undefined);
  const re = new RegExp(p.AllowedPattern);
  assert.ok(re.test("on-call@example.com"));
  for (const bad of ["", "Client A", "a@b", "a@b.c d", "a@b.c,e@f.g@h"]) assert.equal(re.test(bad), false, bad);
  const [, topic] = find(tpl.production, "AWS::SNS::Topic");
  assert.equal(topic.Properties?.TopicName, "xr-production-on-call");
});

test("PF-23c filters pass and fail: each pattern matches PF-23's line for its event and not its near misses", () => {
  const hits: Record<string, string[]> = {
    Requests: ["ok", "notFound", "error"], ServerErrors: ["error"], JobFailures: ["jobFailed"], JobAge: ["jobDone", "jobFailed"],
    MailSent: ["sent"], MailBounced: ["bounced"],
    ...Object.fromEntries(ALARMED_ALERT_KINDS.map((k) => [alertMetric(k), [`alert:${k}`]])),
  };
  assert.deepEqual(Object.keys(hits).sort(), Object.keys(FILTERS).sort());
  for (const [name, f] of Object.entries(FILTERS)) {
    const got = Object.entries(LINES).filter(([, l]) => matchesFilter(f.pattern, l)).map(([k]) => k);
    assert.deepEqual(got.sort(), hits[name].sort(), `${name}: ${f.pattern}`);
    if (f.value.startsWith("$.")) for (const k of got) assert.equal(typeof LINES[k][f.value.slice(2)], "number", `${name} value on ${k}`);
  }
  assert.throws(() => matchesFilter('{ $.a = "x" || $.b = 1 }', {}), /unsupported term/); // a new form needs a matcher first
});

test("PF-23c thresholds: the 5xx and bounce rates need a minimum volume; job age pages past the app's STUCK_JOB_MS (all Sample)", () => {
  const t = tpl.production;
  const [, rate] = alarmNamed(t, "xr-production-5xx-rate");
  const expr = rate.Properties!.Metrics.find((m: any) => m.Expression).Expression as string;
  assert.equal(expr, `IF(FILL(den, 0) >= ${SAMPLE.minRequests}, 100 * FILL(num, 0) / den, 0)`);
  assert.equal(SLO_5XX_PCT, 0.1); // NFR5-15 "5xx<0.1%"
  assert.equal(rate.Properties!.Threshold, 1.44); // the SLO × the fast-burn factor 14.4 (Sample)
  assert.equal(SAMPLE.errorRatePct, Math.round(SLO_5XX_PCT * FAST_BURN * 100) / 100);
  assert.match(rate.Properties!.AlarmDescription, /NFR5-15 SLO 0\.1 %/);
  const [, age] = alarmNamed(t, "xr-production-job-age");
  assert.equal(age.Properties!.Statistic, "Maximum");
  const appStuck = /export const STUCK_JOB_MS = (\d+) \* 60_000/.exec(src("api/src/platform/observability/alerts.ts"));
  assert.ok(appStuck, "alerts.ts no longer states STUCK_JOB_MS as N * 60_000");
  assert.equal(age.Properties!.Threshold, Number(appStuck![1]) * 60_000);
  for (const k of ALARMED_ALERT_KINDS) {
    const [, a] = alarmNamed(t, `xr-production-alert-${k.replace(/[_.]/g, "-")}`);
    assert.equal(a.Properties!.Threshold, 1);
    assert.equal(a.Properties!.ComparisonOperator, "GreaterThanOrEqualToThreshold");
  }
  for (const [, a] of Object.entries(t.Resources).filter(([, r]) => r.Type === "AWS::CloudWatch::Alarm")) {
    assert.equal(a.Properties!.TreatMissingData, "notBreaching");
    assert.match(a.Properties!.AlarmDescription, /Logs: \/xr\/production\/app/); // each alarm says where to look (review m2)
  }
});

test("PF-23c contract with the app: metrics.ts, log.ts and the alert port still write the names the filters read", () => {
  const metrics = src("api/src/platform/observability/metrics.ts");
  for (const s of ['"request", emf(', "status: r.status", '"job", emf(', 'outcome: j.ok ? "done" : "failed"', "ageMs: ms(j.ageMs)", '"mail_sent" : "mail_bounced"', "MailSent: { value: n", "MailBounced: { value: n", 'line("error", "alert", emf(', "{ alert: kind, ...detail }"]) {
    assert.ok(metrics.includes(s), `metrics.ts no longer has: ${s}`);
  }
  assert.match(src("api/src/platform/observability/log.ts"), /return \{ time: new Date\(\)\.toISOString\(\), level, event: /);
  const kinds = /ALERT_KINDS = \[([^\]]+)\]/.exec(src("ports/alert.ts"))![1];
  for (const k of ALARMED_ALERT_KINDS) assert.ok(kinds.includes(`"${k}"`), `ports/alert.ts has no kind ${k}`);
});
