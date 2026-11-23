// PF-R1: the reporting service (MetricRegistry, MetricsPort's real adapter) and its one door under /api/platform/reports.
// Modules register their metrics on the registry at start-up in feature files of their own (PF-R2fo, PF-R2cm, CS-R1).
import type { Feature } from "../features.ts";
import { MetricRegistry } from "../platform/reports/registry.ts";
import { ReportsController } from "../platform/reports/routes.ts";

export default { controllers: [ReportsController], providers: [MetricRegistry] } satisfies Feature;
