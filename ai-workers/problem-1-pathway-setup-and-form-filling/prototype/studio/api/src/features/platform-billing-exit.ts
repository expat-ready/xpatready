// PF-5 part 4 (R1.105): the payment-hold clock's departure notices (days 0, 16, 46, 83 of the hold; P-799) on PF-14's
// runner, sent through the messages pipeline (MESSAGES_MAIL). No route: PF-11c and PF-11s read exitClock().
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { BILLING_PORTS } from "../platform/billing/routes.ts";
import type { BillingPorts } from "../platform/billing/webhook.ts";
import { ExitNotices } from "../platform/billing/exit-notices.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

export default {
  providers: [{ provide: ExitNotices, useFactory: async (db: Db, ports: BillingPorts, mail: MailPort | undefined, jobs: PlatformJobs) => {
    const notices = new ExitNotices({ db, mail: mail ?? null, audit: ports.audit, now: () => ports.clock.now(), appUrl: ports.appUrl });
    await notices.register(jobs);
    return notices;
  }, inject: [Db, BILLING_PORTS, { token: MESSAGES_MAIL, optional: true }, PlatformJobs] }],
} satisfies Feature;
