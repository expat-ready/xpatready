// AUD-3 part 1 (R1.87): the line each of our own staff's calls owes on a firm's trail, or on the platform's own trail for
// a read across firms, written after the handler and before the answer (api/src/platform/audit/access/), and the
// start-up rule that every route our staff call declares what it does with firms' data. Part 2: our side's per-firm
// access report and its CSV export (access/report.ts).
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { Feature } from "../features.ts";
import { SystemAccessLines } from "../platform/audit/access/lines.ts";
import { AccessReport, AccessReportController } from "../platform/audit/access/report.ts";

export default {
  controllers: [AccessReportController],
  providers: [SystemAccessLines, { provide: APP_INTERCEPTOR, useExisting: SystemAccessLines }, AccessReport],
} satisfies Feature;
