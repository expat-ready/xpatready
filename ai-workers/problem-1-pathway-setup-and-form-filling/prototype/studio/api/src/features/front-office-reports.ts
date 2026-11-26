// R1.79 part 2 (PF-R2fo): the front office's sales numbers, registered on PF-R1's one reporting door at start-up.
// Registration only: the front office has no report route (batch 5).
import type { Feature } from "../features.ts";
import { SalesReports } from "../front-office/reports/metrics.ts";

export default { providers: [SalesReports] } satisfies Feature;
