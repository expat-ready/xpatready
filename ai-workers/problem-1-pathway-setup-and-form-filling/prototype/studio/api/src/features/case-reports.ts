// R1.79 part 1 (CS-R1 part 1): the case side's dashboard numbers, registered on PF-R1's one reporting door at start-up.
// Registration only: the case side has no report route (batch 5).
import { CaseReports } from "../case-reports.ts";
import type { Feature } from "../features.ts";

export default { providers: [CaseReports] } satisfies Feature;
