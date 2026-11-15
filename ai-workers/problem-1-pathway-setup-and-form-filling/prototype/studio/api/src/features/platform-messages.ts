// PF-19b part 1: MessagePort (the outbox, the gate, the worker and the daily cap; api/src/platform/messages/send/) as
// MESSAGE_PORT, its job handlers on PF-14's runner, and the demo-only platform inbox of the local email adapter.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { LocalFiles } from "../front-office/files.ts";
import { consentStore } from "../platform/messages/consent/index.ts";
import { PlatformInbox, PlatformInboxController } from "../platform/messages/demo-inbox.ts";
import { appChannels } from "../platform/messages/send/channels.ts";
import { Messages } from "../platform/messages/send/messages.ts";
import { currentAlerts } from "../platform/observability/alerts.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";

export const MESSAGE_PORT = Symbol.for("platform.MessagePort");
const files = new LocalFiles();
export default {
  controllers: [PlatformInboxController],
  providers: [
    { provide: MESSAGE_PORT, useFactory: (db: Db, jobs: PlatformJobs) => new Messages({ db, consent: consentStore, files, jobs, alerts: currentAlerts, channels: appChannels() }), inject: [Db, PlatformJobs] },
    { provide: PlatformInbox, useFactory: (db: Db) => new PlatformInbox(db, files), inject: [Db] },
  ],
} satisfies Feature;
