// PF-20 part 1 (R1.36): the automation engine (api/src/platform/automation/) as `Automation`, its step worker on PF-14's
// runner, and the firm's Automatic messages routes. It sends through MESSAGE_PORT (PF-19b: the outbox and its consent
// gate; the email adapter is the local one unless the environment names SES). Modules register their recipes into
// `automationRegistry` from their own feature files (FO-12b).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { Automation } from "../platform/automation/engine.ts";
import { automationRegistry } from "../platform/automation/registry.ts";
import { AutomationController } from "../platform/automation/routes.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import type { Messages } from "../platform/messages/send/messages.ts";
import { MESSAGE_PORT } from "./platform-messages.ts";

export default {
  controllers: [AutomationController],
  providers: [
    { provide: Automation, useFactory: (db: Db, messages: Messages, jobs: PlatformJobs) => new Automation({ db, messages, jobs, audit: auditEvent, registry: automationRegistry }), inject: [Db, MESSAGE_PORT, PlatformJobs] },
  ],
} satisfies Feature;
