// PF-19b part 1: the `local` email adapter of the reference app. It sends nothing out: the worker marks the row SENT with
// provider id `local:<outbox id>`, and the demo-only GET /api/demo/platform-inbox (../../demo-inbox.ts) lists those rows
// with their stored words. It never writes demo_message (its link_id is a required key to person_link: Lead B, #1816).
// Part 2 adds the SES adapter (ca-central-1) beside it, chosen by setting.
import type { ChannelAdapter } from "../../send/messages.ts";

export const LOCAL_PROVIDER = "local";
export const localEmail: ChannelAdapter = {
  provider: LOCAL_PROVIDER,
  async deliver(_tx, r) { return { providerId: `${LOCAL_PROVIDER}:${r.outboxId}` }; },
};
