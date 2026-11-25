// PF-17 part 2 (R1.93): our team's support queue (/api/system/support/tickets). The reply is PF-18b's own
// SupportService.replyAsSupport (registered by platform-support.ts), run in the queue's bypass transaction. Part 4: each
// row's firm plan is PF-15's read on PlatformClock, as the Firms page binds it (platform-system-console.ts).
import { Db } from "../core.ts";
import type { Feature } from "../features.ts";
import { SystemSupportController } from "../platform/system-console/support-routes.ts";
import { SystemSupport } from "../platform/system-console/support.ts";
import { SupportService } from "../platform/support/support.ts";
import { PlatformClock } from "../platform/identity/port.ts";

export default {
  controllers: [SystemSupportController],
  providers: [{ provide: SystemSupport, useFactory: (db: Db, support: SupportService, clock: PlatformClock) => new SystemSupport({ db, support, now: () => clock.now() }), inject: [Db, SupportService, PlatformClock] }],
} satisfies Feature;
