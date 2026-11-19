// PF-19b part 2 (row 48; AG-10-1, AG-16-17): the Amazon SES email adapter (ca-central-1) through Nodemailer's SES
// transport and @aws-sdk/client-sesv2. Chosen by setting (../../send/channels.ts): PLATFORM_ENVIRONMENT test or production
// with PLATFORM_SES_REGION; local servers keep the `local` adapter. SES signs with the task's role (PF-24: no key in a
// setting); a caller that must pass keys passes PF-24 `Secret`s, revealed only inside the SDK's credential provider, so
// no value reaches a log line, an error or a response. Each email is tagged with its firm and outbox ids (ids only), which
// SES gives back on a bounce or complaint (./bounces.ts). CI and lanes use recorded SES answers: the client takes a
// `requestHandler`, never the network.
import { SESv2Client, SendEmailCommand, type SESv2ClientConfig } from "@aws-sdk/client-sesv2";
import { createTransport } from "nodemailer";
import type { FilesPort } from "../../../../../../ports/files.ts";
import type { Secret } from "../../../config/secret.ts";
import { filesSpaceOf, type ChannelAdapter } from "../../send/messages.ts";
import { unsubscribeHeaders, type UnsubscribeTokens } from "./unsubscribe.ts";

export const SES_PROVIDER = "ses";
/** Ids only (firm/outbox): SES returns it in a notice's `mail.headers` (our team turns on "include original headers"),
 *  so a bounce finds its message when no configuration set adds tags (review M2(b)). */
export const REF_HEADER = "X-Expatready-Ref";
/** An SES call gives up after this (connect 5 s), well inside the worker's transaction (DELIVER_TX_MS). */
export const SES_TIMEOUT_MS = 20_000;
export type SesOptions = {
  region: string; files: FilesPort; tokens: UnsubscribeTokens; publicBase: string;
  credentials?: { accessKeyId: Secret; secretAccessKey: Secret };
  /** Recorded answers (tests, lanes): the SDK's request handler. */
  requestHandler?: SESv2ClientConfig["requestHandler"];
  configurationSet?: string;
  /** The SES-verified sending address (the firm's name stays the display name). None set → nothing is sent (review:
   *  PLATFORM_FROM is a Sample address SES would refuse); a later PF-24 setting supplies it. */
  sender?: string;
};

export function sesEmail(o: SesOptions): ChannelAdapter {
  const client = new SESv2Client({
    region: o.region, maxAttempts: 1,
    ...(o.credentials ? { credentials: async () => ({ accessKeyId: o.credentials!.accessKeyId.reveal(), secretAccessKey: o.credentials!.secretAccessKey.reveal() }) } : {}),
    requestHandler: o.requestHandler ?? { requestTimeout: SES_TIMEOUT_MS, connectionTimeout: 5_000 },
  });
  const transport = createTransport({ SES: { sesClient: client, SendEmailCommand } });
  return {
    provider: SES_PROVIDER,
    async deliver(_tx, r) {
      if (!o.sender) throw new Error(`messages: SES did not take ${r.outboxId} (no verified sender is set)`);
      const attachments = [];
      for (const k of r.attachments) {
        const f = await o.files.get(filesSpaceOf(r.firmId), k);
        if (!f) throw new Error(`messages: attachment of ${r.outboxId} is missing`);
        attachments.push({ filename: k.split("/").at(-1)!, content: Buffer.from(f.bytes), contentType: f.contentType });
      }
      try {
        const info = await transport.sendMail({
          from: { name: r.from.name, address: o.sender }, to: r.to, replyTo: r.replyTo, subject: r.subject, text: r.text, html: r.html, attachments,
          // PF-19p: a platform account message has no firm; it is tagged "platform", which a bounce notice never matches to a firm.
          headers: { ...unsubscribeHeaders(r, o.tokens, o.publicBase), [REF_HEADER]: `${r.firmId ?? "platform"}/${r.outboxId}` },
          ses: { EmailTags: [{ Name: "firm", Value: r.firmId ?? "platform" }, { Name: "outbox", Value: r.outboxId }], ...(o.configurationSet ? { ConfigurationSetName: o.configurationSet } : {}) },
        });
        const id = String((info as { response?: unknown }).response ?? "");
        if (!/^[A-Za-z0-9._-]{1,200}$/.test(id)) throw new Error("no message id");
        return { providerId: `${SES_PROVIDER}:${id}` };
      } catch (e) {
        // The SDK's text can quote a request; the worker's error keeps only the error's name and code (PF-23).
        const err = e as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
        throw new Error(`messages: SES did not take ${r.outboxId} (${String(err?.name ?? "Error").slice(0, 60)}${err?.$metadata?.httpStatusCode ? ` ${err.$metadata.httpStatusCode}` : ""})`);
      }
    },
  };
}
