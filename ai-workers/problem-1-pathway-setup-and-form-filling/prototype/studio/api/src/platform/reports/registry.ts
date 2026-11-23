// PF-R1: the reporting service's registry, MetricsPort's real adapter (ports/metrics.ts). One instance for the app (a Nest
// provider): each module registers its metrics on it at start-up (PF-R2fo, PF-R2cm, CS-R1), and the door answers them
// with the port's one run rule. It keeps no figure and writes nothing (AG-14-1); a read that fails or answers the wrong
// shape is logged by metric key and reason word only (PF-23: never the error's words or a figure).
import { Injectable, Logger } from "@nestjs/common";
import { checkRegistration, definitionsOf, runMetrics, type MetricDefinition, type MetricRegistration, type MetricsPort, type ReportAnswer } from "../../../../ports/metrics.ts";
import type { StaffContext } from "../identity/keys.ts";

@Injectable()
export class MetricRegistry implements MetricsPort<StaffContext> {
  private readonly metrics = new Map<string, MetricRegistration>();
  private readonly log = new Logger("reports");
  register(metric: MetricRegistration): void { const ok = checkRegistration(this.metrics, metric); this.metrics.set(ok.key, ok); }
  definitions(): MetricDefinition[] { return definitionsOf(this.metrics); }
  has(key: string): boolean { return this.metrics.has(key); }
  /** The registrations, for the CI read-budget test (ports/metrics.ts overBudget). */
  all(): ReadonlyMap<string, MetricRegistration> { return this.metrics; }
  query(caller: StaffContext, body: unknown): Promise<ReportAnswer> {
    return runMetrics(this.metrics, caller, body, (key, reason) => this.log.warn(`reports: metric ${key} unavailable (${reason})`));
  }
}
