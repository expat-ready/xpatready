// PF-19b part 1: MessagePort (the outbox, the gate, the worker and the daily cap; api/src/platform/messages/send/) as
// MESSAGE_PORT, its job handlers on PF-14's runner, and the demo-only platform inbox of the local email adapter;
// MESSAGES_MAIL, MailPort over MessagePort (booking mail: qa #1855). Part 2: the email adapter by setting (local or SES),
// the one-click unsubscribe door and SES's bounce and complaint notices (api/src/platform/messages/public-routes.ts).
// Part 3: SES's Delivery notices, the local adapter's test events (connected here when email goes by the local adapter)
// and the staff read GET /api/platform/messages (api/src/platform/messages/staff-routes.ts).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { boundFiles } from "../platform/files/choose.ts";
import { platformConfig } from "../platform/config/settings.ts";
import { SesNotices } from "../platform/messages/channels/email/bounces.ts";
import { connectLocalNotices, LOCAL_PROVIDER } from "../platform/messages/channels/email/local.ts";
import { StaffMessages, StaffMessagesController } from "../platform/messages/staff-routes.ts";
import { Unsubscribe, UnsubscribeTokens } from "../platform/messages/channels/email/unsubscribe.ts";
import { consentStore } from "../platform/messages/consent/index.ts";
import { PlatformInbox, PlatformInboxController } from "../platform/messages/demo-inbox.ts";
import { MessagesPublicController } from "../platform/messages/public-routes.ts";
import { appChannels, emailAdapter } from "../platform/messages/send/channels.ts";
import { MessagesMail } from "../platform/messages/send/mail.ts";
import { Messages } from "../platform/messages/send/messages.ts";
import { currentAlerts } from "../platform/observability/alerts.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";

export const MESSAGE_PORT = Symbol.for("platform.MessagePort");
export const MESSAGES_MAIL = Symbol.for("platform.MessagesMail");
const files = boundFiles();
const config = platformConfig(), tokens = new UnsubscribeTokens(config.secretBox);
/** Where the unsubscribe link points (the same address PF-5's sign-up links use). */
const publicBase = process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}`;
const email = emailAdapter(config, { files, tokens, publicBase });
export default {
  controllers: [PlatformInboxController, MessagesPublicController, StaffMessagesController],
  providers: [
    { provide: MESSAGE_PORT, useFactory: (db: Db, jobs: PlatformJobs) => new Messages({ db, consent: consentStore, files, jobs, alerts: currentAlerts, channels: appChannels(email), log: (l) => console.warn(l) }), inject: [Db, PlatformJobs] },
    { provide: MESSAGES_MAIL, useFactory: (db: Db, messages: Messages) => new MessagesMail({ db, messages, files, log: (l) => console.warn(l) }), inject: [Db, MESSAGE_PORT] },
    { provide: PlatformInbox, useFactory: (db: Db) => new PlatformInbox(db, files, undefined, { tokens, publicBase }), inject: [Db] },
    { provide: Unsubscribe, useFactory: (db: Db) => new Unsubscribe({ db, consent: consentStore, tokens }), inject: [Db] },
    { provide: SesNotices, useFactory: (db: Db) => {
      const n = new SesNotices({ db, consent: consentStore, requireTopics: config.environment !== "local" });
      if (email.provider === LOCAL_PROVIDER) connectLocalNotices(n);   // part 3: the local adapter's test events
      return n;
    }, inject: [Db] },
    StaffMessages,
  ],
} satisfies Feature;
