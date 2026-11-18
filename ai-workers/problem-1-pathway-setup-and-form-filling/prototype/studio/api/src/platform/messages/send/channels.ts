// PF-19b: the channels messages go by, one adapter each (email here; WhatsApp is FO-11's one line below). A channel
// registered twice stops the start-up with its name.
import type { Channel } from "../../../../../ports/consent.ts";
import type { FilesPort } from "../../../../../ports/files.ts";
import type { PlatformConfig } from "../../config/settings.ts";
import { localEmail } from "../channels/email/local.ts";
import { sesEmail } from "../channels/email/ses.ts";
import type { UnsubscribeTokens } from "../channels/email/unsubscribe.ts";
import type { ChannelAdapter } from "./messages.ts";

export function channelsOf(entries: [Channel, ChannelAdapter][]): Map<Channel, ChannelAdapter> {
  const m = new Map<Channel, ChannelAdapter>();
  for (const [c, a] of entries) { if (m.has(c)) throw new Error(`messages: channel ${c} registered twice`); m.set(c, a); }
  return m;
}

/** The email adapter by setting (part 2): SES when PLATFORM_ENVIRONMENT is test or production and PLATFORM_SES_REGION is
 *  set; the `local` adapter (nothing leaves the machine) otherwise. */
export function emailAdapter(config: Pick<PlatformConfig, "environment" | "ses">, o: { files: FilesPort; tokens: UnsubscribeTokens; publicBase: string }): ChannelAdapter {
  return config.environment !== "local" && config.ses.region ? sesEmail({ region: config.ses.region, ...o }) : localEmail;
}

/** The app's channels. */
export const appChannels = (email: ChannelAdapter) => channelsOf([["EMAIL", email]]);
