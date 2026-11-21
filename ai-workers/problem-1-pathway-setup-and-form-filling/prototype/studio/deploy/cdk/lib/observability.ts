// PF-23c (R1.13's cloud half; NFR5-14; SA-11 BR-2, BR-5; SA8-D40): the app's log group, its metric filters and the
// alarms that page the on-call address, as code, synth only (nothing deployed: P-551; the founder's AWS proof, P-782).
//  * One log group per environment, `/xr/<stage>/app`, in the stack's region (ca-central-1, pinned by estate.ts), kept
//    90 days (NFR5-14 "≥ 90 days"; exactly 90, so logs are not kept for ever). PF-8b's task definition sends the
//    service's stdout and stderr here (`appLogs`).
//  * Metric filters, not embedded metric format: PF-23's lines are EMF, but CloudWatch extracts EMF only through an
//    EMF-aware shipper (metrics.ts, review m10), and the plain awslogs driver is not one. A metric filter reads the
//    same JSON line whatever ships it, so every alarm here works on the plain driver. The filters read PF-23's own
//    fields (log.ts and metrics.ts: event, status, outcome, ageMs, MailSent, MailBounced, alert); the tests match each
//    pattern against lines of that shape and check metrics.ts still writes those names.
//  * Alarms: 5xx rate, job failures, job age, mail bounce rate, and one per alert kind the row names (audit-write
//    failure, chain break, stuck job, privacy and breach clocks). Each pages an SNS topic whose one subscription is the
//    on-call email, a deploy parameter with no default (the founder names it; a deploy without it fails, so no alarm is
//    ever deployed unrouted). Alarm payloads carry alarm names and numbers only, never a log line.
// Every threshold is Sample (P-170): the requirements say what pages, not at what level; STUCK_JOB_MS is the app's.
import { CfnParameter, RemovalPolicy, Stack, Duration, aws_cloudwatch as cw, aws_cloudwatch_actions as actions, aws_logs as logs, aws_sns as sns, aws_sns_subscriptions as subs } from "aws-cdk-lib";
import { Construct } from "constructs";

export const LOG_RETENTION_DAYS = 90;
export const NAMESPACE = "ExpatReady/Alarms";
/** The alert kinds (ports/alert.ts ALERT_KINDS) PF-23c's row names; send_cap_reached is not one of them. */
export const ALARMED_ALERT_KINDS = ["audit_write_failed", "audit_chain_break", "job_stuck", "privacy_clock_near", "breach_clock_near"] as const;
/** Sample thresholds (no load measured, no expert value: P-170). stuckJobMs equals the app's STUCK_JOB_MS (alerts.ts). */
export const SAMPLE = { errorRatePct: 5, minRequests: 20, jobFailures: 3, stuckJobMs: 30 * 60_000, bounceRatePct: 5, minMailSent: 20 } as const;

/** Each metric filter: its metric name, the JSON pattern over PF-23's line, and the value it counts. */
export const FILTERS: Record<string, { pattern: string; value: string }> = {
  Requests: { pattern: '{ $.event = "request" }', value: "1" },
  ServerErrors: { pattern: '{ $.event = "request" && $.status >= 500 }', value: "1" },
  JobFailures: { pattern: '{ $.event = "job" && $.outcome = "failed" }', value: "1" },
  JobAge: { pattern: '{ $.event = "job" && $.ageMs >= 0 }', value: "$.ageMs" },
  MailSent: { pattern: '{ $.event = "mail_sent" }', value: "$.MailSent" },
  MailBounced: { pattern: '{ $.event = "mail_bounced" }', value: "$.MailBounced" },
  ...Object.fromEntries(ALARMED_ALERT_KINDS.map((k) => [alertMetric(k), { pattern: `{ $.event = "alert" && $.alert = "${k}" }`, value: "1" }])),
};
export function alertMetric(kind: string): string { return `Alert_${kind}`; }

/** The alarms, by key (the alarm is named xr-<stage>-<key>), and the metrics each reads. */
export const ALARMS: Record<string, string[]> = {
  "5xx-rate": ["Requests", "ServerErrors"],
  "job-failures": ["JobFailures"],
  "job-age": ["JobAge"],
  "mail-bounce-rate": ["MailSent", "MailBounced"],
  ...Object.fromEntries(ALARMED_ALERT_KINDS.map((k) => [`alert-${k.replace(/_/g, "-")}`, [alertMetric(k)]])),
};

export interface ObservabilityProps { stage: string }

export class Observability extends Construct {
  readonly appLogs: logs.LogGroup;
  readonly onCall: sns.Topic;
  readonly alarms: Record<string, cw.Alarm> = {};

  constructor(scope: Construct, id: string, props: ObservabilityProps) {
    super(scope, id);
    const stack = Stack.of(this), ns = `${NAMESPACE}/${props.stage}`;

    this.appLogs = new logs.LogGroup(this, "AppLogs", {
      logGroupName: `/xr/${props.stage}/app`,
      retention: logs.RetentionDays.THREE_MONTHS, // 90 days
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const email = new CfnParameter(stack, "OnCallEmail", {
      type: "String",
      description: "PF-23c: the on-call address every alarm emails (the founder names it; no default)",
      allowedPattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
      constraintDescription: "one email address",
    });
    this.onCall = new sns.Topic(this, "OnCall", { topicName: `xr-${props.stage}-on-call`, displayName: `Expat Ready ${props.stage} alarms` });
    this.onCall.addSubscription(new subs.EmailSubscription(email.valueAsString));

    const metric: Record<string, cw.Metric> = {};
    for (const [name, f] of Object.entries(FILTERS)) {
      new logs.MetricFilter(this, `Filter${name}`, {
        logGroup: this.appLogs,
        filterPattern: logs.FilterPattern.literal(f.pattern),
        metricNamespace: ns,
        metricName: name,
        metricValue: f.value,
      });
      metric[name] = new cw.Metric({ namespace: ns, metricName: name, statistic: "Sum", period: Duration.minutes(5) });
    }

    const rate = (num: string, den: string, min: number, period: Duration) => new cw.MathExpression({
      expression: `IF(FILL(den, 0) >= ${min}, 100 * FILL(num, 0) / den, 0)`, // a few requests or mails never page
      usingMetrics: { num: metric[num].with({ period }), den: metric[den].with({ period }) },
      period,
    });
    const alarm = (key: string, m: cw.IMetric, threshold: number, evaluationPeriods: number, op = cw.ComparisonOperator.GREATER_THAN_THRESHOLD) => {
      const a = new cw.Alarm(this, `Alarm-${key}`, {
        alarmName: `xr-${props.stage}-${key}`,
        metric: m, threshold, evaluationPeriods, datapointsToAlarm: evaluationPeriods, comparisonOperator: op,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING, // no traffic is not an incident
      });
      a.addAlarmAction(new actions.SnsAction(this.onCall));
      a.addOkAction(new actions.SnsAction(this.onCall)); // the page that says it recovered
      this.alarms[key] = a;
    };

    alarm("5xx-rate", rate("ServerErrors", "Requests", SAMPLE.minRequests, Duration.minutes(5)), SAMPLE.errorRatePct, 2);
    alarm("job-failures", metric.JobFailures.with({ period: Duration.minutes(15) }), SAMPLE.jobFailures, 1, cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD);
    alarm("job-age", metric.JobAge.with({ statistic: "Maximum" }), SAMPLE.stuckJobMs, 1);
    alarm("mail-bounce-rate", rate("MailBounced", "MailSent", SAMPLE.minMailSent, Duration.hours(1)), SAMPLE.bounceRatePct, 1);
    for (const k of ALARMED_ALERT_KINDS) { // the app already sends one alert line per incident (ALERT_REPEAT_MS): page on the first
      alarm(`alert-${k.replace(/_/g, "-")}`, metric[alertMetric(k)].with({ period: Duration.minutes(1) }), 1, 1, cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD);
    }
  }
}

// ---- checks over a synthesized template (an empty list = pass; the tests run each on the real stack and a broken one)

type Resource = { Type: string; Properties?: Record<string, unknown> };
type Tpl = { Resources?: Record<string, Resource>; Parameters?: Record<string, { Default?: unknown }> };
const ofType = (t: Tpl, type: string) => Object.entries(t.Resources ?? {}).filter(([, r]) => r.Type === type);
const refOf = (v: unknown) => (v as { Ref?: string } | undefined)?.Ref ?? (v as { "Fn::GetAtt"?: [string] } | undefined)?.["Fn::GetAtt"]?.[0];

/** Every log group in the template is kept exactly `days` days (none kept for ever), and there is at least one. */
export function retentionFindings(t: Tpl, days = LOG_RETENTION_DAYS): string[] {
  const groups = ofType(t, "AWS::Logs::LogGroup");
  if (groups.length === 0) return ["no log group"];
  return groups.flatMap(([id, r]) => r.Properties?.RetentionInDays === days ? [] : [`${id}: logs kept ${JSON.stringify(r.Properties?.RetentionInDays ?? "for ever")}, not ${days} days`]);
}

/** Each named alarm exists, pages a topic whose email subscription is a parameter with no default (alarm and OK), and
 *  reads only metrics a metric filter on a 90-day log group produces, with the filter's pattern as written in FILTERS. */
export function alarmFindings(t: Tpl, stage: string, alarms: Record<string, string[]> = ALARMS): string[] {
  const out: string[] = [], res = t.Resources ?? {};
  const routed = new Set(ofType(t, "AWS::SNS::Subscription").filter(([, s]) => s.Properties?.Protocol === "email" && (() => {
    const p = refOf(s.Properties?.Endpoint);
    return !!p && !!t.Parameters?.[p] && t.Parameters[p].Default === undefined;
  })()).map(([, s]) => refOf(s.Properties?.TopicArn)));
  const filters = new Map(ofType(t, "AWS::Logs::MetricFilter").map(([, f]) => {
    const tr = (f.Properties?.MetricTransformations as { MetricNamespace?: string; MetricName?: string; MetricValue?: string }[] | undefined)?.[0];
    return [`${tr?.MetricNamespace}|${tr?.MetricName}`, { pattern: f.Properties?.FilterPattern, value: tr?.MetricValue, group: res[refOf(f.Properties?.LogGroupName) ?? ""] }];
  }));
  const byName = new Map(ofType(t, "AWS::CloudWatch::Alarm").map(([, a]) => [a.Properties?.AlarmName, a.Properties ?? {}]));
  for (const [key, names] of Object.entries(alarms)) {
    const name = `xr-${stage}-${key}`, a = byName.get(name);
    if (!a) { out.push(`${name}: no alarm`); continue; }
    for (const list of ["AlarmActions", "OKActions"] as const) {
      const targets = ((a[list] as unknown[]) ?? []).map(refOf);
      if (!targets.some((x) => routed.has(x))) out.push(`${name}: ${list} reach no topic with the on-call email parameter`);
    }
    const stats = a.Metrics ? (a.Metrics as { MetricStat?: { Metric?: { Namespace?: string; MetricName?: string } } }[]).filter((m) => m.MetricStat).map((m) => m.MetricStat!.Metric!) : [{ Namespace: a.Namespace as string, MetricName: a.MetricName as string }];
    const used = stats.map((m) => m.MetricName).sort();
    if (JSON.stringify(used) !== JSON.stringify([...names].sort())) out.push(`${name}: reads ${used.join(", ") || "no metric"}, not ${names.join(", ")}`);
    for (const m of stats) {
      const f = filters.get(`${m.Namespace}|${m.MetricName}`);
      if (!f) { out.push(`${name}: metric ${m.Namespace}/${m.MetricName} comes from no metric filter`); continue; }
      const want = FILTERS[m.MetricName!];
      if (!want || f.pattern !== want.pattern || f.value !== want.value) out.push(`${name}: ${m.MetricName}'s filter is ${JSON.stringify(f.pattern)} → ${f.value}, not as FILTERS says`);
      if (f.group?.Type !== "AWS::Logs::LogGroup" || f.group.Properties?.RetentionInDays !== LOG_RETENTION_DAYS) out.push(`${name}: ${m.MetricName}'s filter is not on a ${LOG_RETENTION_DAYS}-day log group of this stack`);
    }
  }
  return out;
}

/** Whether one JSON log line matches a CloudWatch JSON filter pattern of the form used here:
 *  `{ $.a = "x" && $.b >= 5 && $.c = * }` (the subset FILTERS uses; anything else throws, so a new form gets a matcher). */
export function matchesFilter(pattern: string, line: Record<string, unknown>): boolean {
  const body = /^\{\s*(.+?)\s*\}$/.exec(pattern)?.[1];
  if (!body) throw new Error(`not a JSON filter pattern: ${pattern}`);
  return body.split("&&").every((term) => {
    const m = /^\s*\$\.([A-Za-z_][A-Za-z0-9_]*)\s*(=|!=|>=|<=|>|<)\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|\*)\s*$/.exec(term);
    if (!m) throw new Error(`unsupported term: ${term}`);
    const [, key, op, raw] = m, v = line[key];
    if (raw === "*") return op === "=" && v !== undefined;
    if (raw.startsWith('"')) { const s = JSON.parse(raw) as string; return op === "=" ? v === s : op === "!=" ? v !== s : false; }
    if (typeof v !== "number") return false;
    const n = Number(raw);
    return op === "=" ? v === n : op === "!=" ? v !== n : op === ">=" ? v >= n : op === "<=" ? v <= n : op === ">" ? v > n : v < n;
  });
}
