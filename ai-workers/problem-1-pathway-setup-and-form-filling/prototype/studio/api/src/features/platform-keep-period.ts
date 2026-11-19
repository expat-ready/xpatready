// AUD-5 part 1 (R1.105): keep periods as data: the table's read and the firm's own number for closed client files.
import type { Feature } from "../features.ts";
import { KeepPeriodController } from "../platform/keep-period/routes.ts";
import { KeepPeriods } from "../platform/keep-period/service.ts";

export default { controllers: [KeepPeriodController], providers: [KeepPeriods] } satisfies Feature;
