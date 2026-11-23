// PF-R1: MetricsPort's fake (ports/metrics.ts), for a module's own tests (PF-R2fo, PF-R2cm, CS-R1). It keeps the
// registrations in memory and answers with the port's one run rule, so it can never promise another answer than the
// real registry (api/src/platform/reports/registry.ts); both run ports/contracts/metrics-port.contract.ts.
import { checkRegistration, runMetrics, type MetricDefinition, type MetricRegistration, type MetricsPort, type ReportAnswer, type ReportCaller } from "../metrics.ts";

export function fakeMetrics(): MetricsPort & { keys(): string[] } {
  const metrics = new Map<string, MetricRegistration>();
  return {
    register(m) { const ok = checkRegistration(metrics, m); metrics.set(ok.key, ok); },
    definitions(): MetricDefinition[] { return [...metrics.values()].map(({ read: _read, ...d }) => d); },
    query(caller: ReportCaller, body: unknown): Promise<ReportAnswer> { return runMetrics(metrics, caller, body); },
    keys() { return [...metrics.keys()]; },
  };
}
