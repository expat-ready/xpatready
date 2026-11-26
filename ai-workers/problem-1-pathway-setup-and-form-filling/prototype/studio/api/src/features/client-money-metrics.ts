// R1.79 part 3 (PF-R2cm): client money's dashboard figures, registered on PF-R1's one reporting door at start-up.
// Registration only: no report route of their own (batch 5).
import type { Feature } from "../features.ts";
import { MoneyReports } from "../client-money/reports/metrics.ts";

export default { providers: [MoneyReports] } satisfies Feature;
