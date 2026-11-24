// PF-19b (map rows 47-49; AG-10-1, -3, -5, -20, -22, -25; P-584 (1)): the one sending path for both sides. A caller
// writes a message into the outbox inside its own transaction (send); after commit it calls dispatch, and a JobPort worker
// sends each QUEUED row once through its channel's adapter. The consent gate (ConsentPort.allows) runs at send time and
// again in the worker. The rendered message (sender, Reply-To, subject, text, HTML, attachment keys) is stored through
// FilesPort at msg/<firm id>/outbox/<outbox id>.json before the row is written, and the row keeps its SHA-256 (Lead B
// ruling, 15 Nov): the worker sends nothing when the file no longer matches. One fixed layout (row 47). This folder
// imports only zod and its own files.
// PF-19p (Lead B rev 16.62, #1955): a platform account message (`platformAccount: true`, no firm) is the platform's own
// email to a person before any firm exists (sign-up's verification): EMAIL, TRANSACTIONAL, the caller's words, no person,
// no attachment; sent as "ExpatReady" from and replying to the platform setting platform.account_mail_from; no consent
// gate (the person asked for it), no firm read, no daily cap; the same outbox, file, idempotency and channel adapter.
import { z } from "zod";
import { FirmId } from "./audit.ts";
import { Channel, MessageClass, Subject, normaliseAddress, type ConsentDecision, type ConsentPort } from "./consent.ts";
import { FileKey } from "./files.ts";

/** Sample: the platform's sending address; the firm's own name is the sender name and its contact address the Reply-To. */
export const PLATFORM_FROM = "messages@mail.expatready.example";
/** Sample (row 48's F14 risk): messages a firm may send in one day of its own time zone. */
export const DAILY_CAP = { TRIAL: 50, ACTIVE: 2000 } as const;
export const HELD_DAILY_LIMIT = "daily limit";
/** Sample (PF-19e): account and security messages the platform sends one address in one hour (they skip the daily cap). */
export const SYSTEM_PER_ADDRESS_HOUR = 5;
/** PF-19e: the stored idempotency key of a system message starts so (the worker reads it from the row it locked). */
export const SYSTEM_KEY_PREFIX = "system:";
/** PF-19p: the sender name of a platform account message. */
export const PLATFORM_ACCOUNT_NAME = "ExpatReady";
/** Sample (PF-19p): platform.account_mail_from's default, the From and Reply-To of platform account messages. */
export const PLATFORM_ACCOUNT_FROM_SAMPLE = "no-reply@expatready.com";

const FieldName = z.string().regex(/^[a-z][a-z0-9_]*$/, "a field name (lower case, _)");
export const TemplateKey = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, "a dotted lower-case key").max(100);
const Words = z.strictObject({ subject: z.string().trim().min(1).max(200).regex(/^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]*$/, "a subject on one line"), text: z.string().min(1).max(100_000), html: z.string().min(1).max(500_000).optional() });
const FromTemplate = z.strictObject({ templateKey: TemplateKey, values: z.record(FieldName, z.string().max(10_000)), language: z.enum(["en", "fr"]).default("en") });

export const MessageSend = z.strictObject({
  platformAccount: z.undefined().optional(),
  firmId: FirmId,
  /** The person the message is to (consent is theirs); absent only for a TRANSACTIONAL message to a bare address. The
   *  gate judges the person's consent and the address's suppression. For SERVICE and MARKETING, the caller passes the
   *  subject's own address from its own record; PF-19ad makes the gate check it (Lead B, #1824). */
  person: Subject.optional(),
  channel: Channel,
  class: MessageClass,
  address: z.string().min(3).max(320),
  content: z.union([Words, FromTemplate]),
  /** Files of the same firm to attach (FilesPort keys; never a stored message under msg/). Caller HTML is trusted module
   *  output, stored as given (PF-19c's templates feed it). */
  attachments: z.array(FileKey).max(10).default([]),
  /** The caller's key: the same key in the same firm is the same message (a retry returns the first row). */
  idempotencyKey: z.string().min(1).max(200),
  /** PF-19e: account and security mail the platform itself sends (an invitation, a code, a reset notice; never staff
   *  writing to a client): TRANSACTIONAL only, not counted on the firm's daily cap, at most SYSTEM_PER_ADDRESS_HOUR an hour
   *  to one address (MessageLimited above it). */
  system: z.literal(true).optional(),
});
/** PF-19p: a platform account message. Never a firm's, never marketing, never a copy (no person, no attachment). */
export const PlatformAccountSend = z.strictObject({
  platformAccount: z.literal(true),
  channel: z.literal("EMAIL"),
  class: z.literal("TRANSACTIONAL"),
  address: z.string().min(3).max(320),
  content: Words,
  /** The same key among platform account messages is the same message. */
  idempotencyKey: z.string().min(1).max(200),
});
export type MessageSend = z.input<typeof MessageSend>;
export type PlatformAccountSendInput = z.input<typeof PlatformAccountSend>;
/** Either a firm's message or a platform account message, never both and never neither (each side is strict). */
export const AnyMessageSend = z.discriminatedUnion("platformAccount", [MessageSend, PlatformAccountSend]);
type AnySend = z.output<typeof AnyMessageSend>;
export const isPlatformAccount = (m: AnySend): m is z.output<typeof PlatformAccountSend> => m.platformAccount === true;

/** The stored, rendered message (the worker sends exactly this). */
export type Rendered = {
  /** null: a platform account message (PF-19p). */
  outboxId: string; firmId: string | null; channel: Channel; class: MessageClass; to: string;
  from: { name: string; address: string }; replyTo: string; subject: string; text: string; html: string; attachments: string[];
};
export type OutboxState = "QUEUED" | "SENT" | "DELIVERED" | "BOUNCED" | "FAILED" | "SUPPRESSED";
/** `repeated`: the idempotency key was used before, and this is that first row as it is now. */
export type SendResult = { outboxId: string; state: OutboxState; reason: string | null; repeated: boolean };

/** Why the gate stopped a message, as the row keeps it (AG-10-27): `SUPPRESSED: HARD_BOUNCE`, `NO_CONSENT: MARKETING`. */
export function gateReason(d: ConsentDecision): string | null {
  if (d.allowed) return null;
  return d.reason === "SUPPRESSED" ? `SUPPRESSED: ${d.suppression}` : `${d.reason}: ${d.purpose}`;
}

export interface MessagePort<Tx = unknown> {
  /** Writes one message into the outbox inside the caller's transaction: QUEUED, or SUPPRESSED with the gate's reason. */
  send(tx: Tx, m: MessageSend | PlatformAccountSendInput): Promise<SendResult>;
  /** After the caller's commit: queues the worker for these outbox rows (a sweep finds any row a crash left unqueued).
   *  `null`: platform account rows (PF-19p). */
  dispatch(firmId: string | null, outboxIds: string[]): Promise<void>;
}

/** Refused: an unknown template, a field the template needs and the caller did not give, a missing attachment. */
export class MessageRefused extends Error {
  constructor(message: string) { super(message); this.name = "MessageRefused"; }
}

/** A concurrent send with the same key committed first, after this caller's snapshot (REPEATABLE READ): nothing was
 *  written; run the caller's transaction again and send answers the first row (repeated: true). */
/** PF-19e: a system message over SYSTEM_PER_ADDRESS_HOUR to one address this hour; nothing was written. */
export class MessageLimited extends Error {
  constructor() { super(`not sent: at most ${SYSTEM_PER_ADDRESS_HOUR} account emails an hour go to one address`); this.name = "MessageLimited"; }
}
export class MessageRepeated extends Error {
  constructor(readonly idempotencyKey: string) { super(`a concurrent send used idempotency key ${idempotencyKey} first: retry, and the retry answers that message`); this.name = "MessageRepeated"; }
}

/** Plain named-field replacement ({{ field }}); a field without a value is refused, never sent blank. */
export function fillFields(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_, f: string) => {
    if (!Object.hasOwn(values, f)) throw new MessageRefused(`the template needs the field "${f}"`);
    return values[f];
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** What the one layout draws for a firm (PF-13): its sender name, brand colour, footer and logo link. Never the tagline,
 *  banner or favicon (P-629). Unset values are ExpatReady's neutral look. */
export type LayoutBrand = { name: string; colour?: string | null; footer?: string | null; logoUrl?: string | null };
/** The one fixed layout (row 47), as a plain string: the firm's name on top, the body, a line naming who sent it, and
 *  with PF-13 the firm's colour and footer. A platform account message (`replyable` false) is not answered by a person,
 *  so its line says only who sent it. The fake stores this; the real adapter draws the same values with react-email
 *  (api/src/platform/messages/layout/email-layout.ts, PF-13; ports stay zod only). */
export function layout(brand: string | LayoutBrand, subject: string, text: string, html?: string, replyable = true): string {
  const b = typeof brand === "string" ? { name: brand } : brand, firmName = b.name, colour = /^#[0-9a-f]{6}$/.test(b.colour ?? "") ? b.colour : "#1f4e79";
  const body = html ?? text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const footer = b.footer ? `<div style="padding:16px 24px 0;font-size:12px;color:#616e7c">${esc(b.footer).replace(/\n/g, "<br>")}</div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(subject)}</title></head><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#1f2933">`
    + `<div style="max-width:600px;margin:0 auto;background:#fff"><div style="padding:16px 24px;border-bottom:3px solid ${colour};font-weight:bold">${esc(firmName)}</div>`
    + `<div style="padding:24px">${body}</div>${footer}<div style="padding:16px 24px;font-size:12px;color:#616e7c">Sent by ${esc(firmName)}.${replyable ? " Reply to this email to reach them." : ""}</div></div></body></html>`;
}

/** Renders a checked message for its firm's sender (shared by the adapter and the fake, so both store the same shape).
 *  A platform account message (PF-19p) is from "ExpatReady" at `platformFrom`, which is also its Reply-To. */
export function render(outboxId: string, m: z.output<typeof MessageSend>, sender: { name: string; replyTo: string; brand?: LayoutBrand }, words: { subject: string; text: string; html?: string }): Rendered;
export function render(outboxId: string, m: z.output<typeof PlatformAccountSend>, platformFrom: string, words: { subject: string; text: string; html?: string }): Rendered;
export function render(outboxId: string, m: AnySend, sender: { name: string; replyTo: string; brand?: LayoutBrand } | string, words: { subject: string; text: string; html?: string }): Rendered {
  const base = { outboxId, channel: m.channel, class: m.class, to: normaliseAddress(m.channel, m.address), subject: words.subject, text: words.text };
  if (isPlatformAccount(m)) {
    if (typeof sender !== "string") throw new TypeError("render: a platform account message takes the platform's From address");
    return { ...base, firmId: null, from: { name: PLATFORM_ACCOUNT_NAME, address: sender }, replyTo: sender, html: layout(PLATFORM_ACCOUNT_NAME, words.subject, words.text, words.html, false), attachments: [] };
  }
  if (typeof sender === "string") throw new TypeError("render: a firm's message takes its firm's sender");
  return {
    ...base, firmId: m.firmId.toLowerCase(), from: { name: sender.name, address: PLATFORM_FROM }, replyTo: sender.replyTo,
    html: layout(sender.brand ?? sender.name, words.subject, words.text, words.html), attachments: m.attachments,
  };
}

export type FakeMessages = MessagePort & { readonly sent: ReadonlyArray<Rendered>; readonly outbox: ReadonlyArray<SendResult & { rendered: Rendered }> };

/** The fake: the same input, gate and rendering as the adapter, in memory; dispatch delivers each QUEUED row once.
 *  Templates are `templates[key]` (subject and body with {{ fields }}); senders by firm id. No daily cap (the adapter's
 *  counter is proved by its own test). */
export function fakeMessages(o: { consent: ConsentPort; senders: Record<string, { name: string; replyTo: string }>; templates?: Record<string, { subject: string; body: string }>; platformFrom?: string }): FakeMessages {
  const outbox: (SendResult & { rendered: Rendered; key: string; delivered: boolean })[] = [], sent: Rendered[] = [];
  return {
    get sent() { return sent.map((r) => ({ ...r })); },
    get outbox() { return outbox.map(({ key: _k, delivered: _d, ...r }) => ({ ...r })); },
    async send(tx, input) {
      const m = AnyMessageSend.parse(input), key = `${isPlatformAccount(m) ? "platform" : m.firmId.toLowerCase()}|${m.idempotencyKey}`;
      const had = outbox.find((r) => r.key === key);
      if (had) return { outboxId: had.outboxId, state: had.state, reason: had.reason, repeated: true };
      if (isPlatformAccount(m)) {   // PF-19p: no firm, no gate
        const row = { outboxId: crypto.randomUUID(), state: "QUEUED" as const, reason: null, repeated: false, key, delivered: false, rendered: undefined as unknown as Rendered };
        row.rendered = render(row.outboxId, m, o.platformFrom ?? PLATFORM_ACCOUNT_FROM_SAMPLE, m.content);
        outbox.push(row);
        return { outboxId: row.outboxId, state: row.state, reason: null, repeated: false };
      }
      const firm = m.firmId.toLowerCase();
      const sender = o.senders[firm];
      if (!sender) throw new MessageRefused(`firm ${firm} has no sender`);
      let words: { subject: string; text: string; html?: string };
      if ("templateKey" in m.content) {
        const t = o.templates?.[m.content.templateKey];
        if (!t) throw new MessageRefused(`no template ${m.content.templateKey}`);
        words = { subject: fillFields(t.subject, m.content.values), text: fillFields(t.body, m.content.values) };
      } else words = m.content;
      const d = await o.consent.allows(tx, { firmId: m.firmId, subject: m.person, channel: m.channel, address: m.address, class: m.class });
      const row = { outboxId: crypto.randomUUID(), state: d.allowed ? "QUEUED" as const : "SUPPRESSED" as const, reason: gateReason(d), repeated: false, key, delivered: false, rendered: undefined as unknown as Rendered };
      row.rendered = render(row.outboxId, m, sender, words);
      outbox.push(row);
      return { outboxId: row.outboxId, state: row.state, reason: row.reason, repeated: false };
    },
    async dispatch(firmId, ids) {
      const f = firmId?.toLowerCase() ?? null;
      for (const r of outbox) if (ids.includes(r.outboxId) && r.rendered.firmId === f && r.state === "QUEUED" && !r.delivered) { r.delivered = true; sent.push(r.rendered); }
    },
  };
}
