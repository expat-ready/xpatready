// PF-19b (map rows 47-49; AG-10-1, -3, -5, -20, -22, -25; P-584 (1)): the one sending path for both sides. A caller
// writes a message into the outbox inside its own transaction (send); after commit it calls dispatch, and a JobPort worker
// sends each QUEUED row once through its channel's adapter. The consent gate (ConsentPort.allows) runs at send time and
// again in the worker. The rendered message (sender, Reply-To, subject, text, HTML, attachment keys) is stored through
// FilesPort at msg/<firm id>/outbox/<outbox id>.json before the row is written, and the row keeps its SHA-256 (Lead B
// ruling, 15 Nov): the worker sends nothing when the file no longer matches. One fixed layout (row 47). This folder
// imports only zod and its own files.
import { z } from "zod";
import { FirmId } from "./audit.ts";
import { Channel, MessageClass, Subject, normaliseAddress, type ConsentDecision, type ConsentPort } from "./consent.ts";
import { FileKey } from "./files.ts";

/** Sample: the platform's sending address; the firm's own name is the sender name and its contact address the Reply-To. */
export const PLATFORM_FROM = "messages@mail.expatready.example";
/** Sample (row 48's F14 risk): messages a firm may send in one day of its own time zone. */
export const DAILY_CAP = { TRIAL: 50, ACTIVE: 2000 } as const;
export const HELD_DAILY_LIMIT = "daily limit";

const FieldName = z.string().regex(/^[a-z][a-z0-9_]*$/, "a field name (lower case, _)");
export const TemplateKey = z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, "a dotted lower-case key").max(100);
const Words = z.strictObject({ subject: z.string().trim().min(1).max(200), text: z.string().min(1).max(100_000), html: z.string().min(1).max(500_000).optional() });
const FromTemplate = z.strictObject({ templateKey: TemplateKey, values: z.record(FieldName, z.string().max(10_000)), language: z.enum(["en", "fr"]).default("en") });

export const MessageSend = z.strictObject({
  firmId: FirmId,
  /** The person the message is to (consent is theirs); absent only for a TRANSACTIONAL message to a bare address. */
  person: Subject.optional(),
  channel: Channel,
  class: MessageClass,
  address: z.string().min(3).max(320),
  content: z.union([Words, FromTemplate]),
  /** Files of the same firm to attach (FilesPort keys). */
  attachments: z.array(FileKey).max(10).default([]),
  /** The caller's key: the same key in the same firm is the same message (a retry returns the first row). */
  idempotencyKey: z.string().min(1).max(200),
});
export type MessageSend = z.input<typeof MessageSend>;

/** The stored, rendered message (the worker sends exactly this). */
export type Rendered = {
  outboxId: string; firmId: string; channel: Channel; class: MessageClass; to: string;
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
  send(tx: Tx, m: MessageSend): Promise<SendResult>;
  /** After the caller's commit: queues the worker for these outbox rows (a sweep finds any row a crash left unqueued). */
  dispatch(firmId: string, outboxIds: string[]): Promise<void>;
}

/** Refused: an unknown template, a field the template needs and the caller did not give, a missing attachment. */
export class MessageRefused extends Error {
  constructor(message: string) { super(message); this.name = "MessageRefused"; }
}

/** Plain named-field replacement ({{ field }}); a field without a value is refused, never sent blank. */
export function fillFields(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g, (_, f: string) => {
    if (!Object.hasOwn(values, f)) throw new MessageRefused(`the template needs the field "${f}"`);
    return values[f];
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** The one fixed layout (row 47): the firm's name on top, the body, and a line naming who sent it. */
export function layout(firmName: string, subject: string, text: string, html?: string): string {
  const body = html ?? text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(subject)}</title></head><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#1f2933">`
    + `<div style="max-width:600px;margin:0 auto;background:#fff"><div style="padding:16px 24px;border-bottom:3px solid #1f4e79;font-weight:bold">${esc(firmName)}</div>`
    + `<div style="padding:24px">${body}</div><div style="padding:16px 24px;font-size:12px;color:#616e7c">Sent by ${esc(firmName)}. Reply to this email to reach them.</div></div></body></html>`;
}

/** Renders a checked message for its firm's sender (shared by the adapter and the fake, so both store the same shape). */
export function render(outboxId: string, m: z.output<typeof MessageSend>, sender: { name: string; replyTo: string }, words: { subject: string; text: string; html?: string }): Rendered {
  return {
    outboxId, firmId: m.firmId.toLowerCase(), channel: m.channel, class: m.class, to: normaliseAddress(m.channel, m.address),
    from: { name: sender.name, address: PLATFORM_FROM }, replyTo: sender.replyTo, subject: words.subject, text: words.text,
    html: layout(sender.name, words.subject, words.text, words.html), attachments: m.attachments,
  };
}

export type FakeMessages = MessagePort & { readonly sent: ReadonlyArray<Rendered>; readonly outbox: ReadonlyArray<SendResult & { rendered: Rendered }> };

/** The fake: the same input, gate and rendering as the adapter, in memory; dispatch delivers each QUEUED row once.
 *  Templates are `templates[key]` (subject and body with {{ fields }}); senders by firm id. No daily cap (the adapter's
 *  counter is proved by its own test). */
export function fakeMessages(o: { consent: ConsentPort; senders: Record<string, { name: string; replyTo: string }>; templates?: Record<string, { subject: string; body: string }> }): FakeMessages {
  const outbox: (SendResult & { rendered: Rendered; key: string; delivered: boolean })[] = [], sent: Rendered[] = [];
  return {
    get sent() { return sent.map((r) => ({ ...r })); },
    get outbox() { return outbox.map(({ key: _k, delivered: _d, ...r }) => ({ ...r })); },
    async send(tx, input) {
      const m = MessageSend.parse(input), firm = m.firmId.toLowerCase(), key = `${firm}|${m.idempotencyKey}`;
      const had = outbox.find((r) => r.key === key);
      if (had) return { outboxId: had.outboxId, state: had.state, reason: had.reason, repeated: true };
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
    async dispatch(_firmId, ids) {
      for (const r of outbox) if (ids.includes(r.outboxId) && r.state === "QUEUED" && !r.delivered) { r.delivered = true; sent.push(r.rendered); }
    },
  };
}
