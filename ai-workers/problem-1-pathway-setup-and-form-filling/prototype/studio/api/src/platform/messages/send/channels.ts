// PF-19b: the channels messages go by, one adapter each (email here; WhatsApp is FO-11's one line below). A channel
// registered twice stops the start-up with its name.
import type { Channel } from "../../../../../ports/consent.ts";
import { localEmail } from "../channels/email/local.ts";
import type { ChannelAdapter } from "./messages.ts";

export function channelsOf(entries: [Channel, ChannelAdapter][]): Map<Channel, ChannelAdapter> {
  const m = new Map<Channel, ChannelAdapter>();
  for (const [c, a] of entries) { if (m.has(c)) throw new Error(`messages: channel ${c} registered twice`); m.set(c, a); }
  return m;
}

/** The app's channels. Part 2 picks the email adapter by setting (local or SES). */
export const appChannels = () => channelsOf([["EMAIL", localEmail]]);
