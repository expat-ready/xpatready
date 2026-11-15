// PF-19b part 1 (map rows 47-49; AG-10-1, -3, -5, -20, -22, -25; P-584 (1)): MessagePort over msg_outbox, msg_event and
// msg_send_counter (platform-messages.prisma). send() runs in the caller's transaction: the consent gate and the
// suppression list (ConsentPort.allows), the firm's sender, the template, then the rendered file through FilesPort (Lead B
// ruling: written before the row, so a rolled-back transaction leaves at most an orphan file under its outbox id and no
// row, hence nothing is ever sent for it) and the row, QUEUED or SUPPRESSED with the reason. dispatch() after the commit
// queues one JobPort job per row (key msg.send:<firm>:<id>); an hourly-keyed sweep each minute queues any QUEUED row a crash left
// without a job, and held rows again. The worker locks the row, sends only a QUEUED row (so a job run twice sends once),
// checks the file against rendered_hash (a change: FAILED "content changed", nothing sent), asks the gate again, counts the
// firm's day (DAILY_CAP; the 51st trial message stays QUEUED, reason "daily limit", one alert per firm per day) and hands
// the rendered message to its channel's adapter. Every query is scoped by firmScope; nothing here writes demo_message.
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AlertPort } from "../../../../../ports/alert.ts";
import { systemClock, type ClockPort } from "../../../../../ports/clock.ts";
import { normaliseAddress, type Channel, type ConsentPort } from "../../../../../ports/consent.ts";
import { sha256Hex, type FilesPort } from "../../../../../ports/files.ts";
import type { JobPort } from "../../../../../ports/jobs.ts";
import { DAILY_CAP, HELD_DAILY_LIMIT, MessageRefused, MessageSend, fillFields, gateReason, render, type MessagePort, type Rendered, type SendResult } from "../../../../../ports/messages.ts";
import { firmScope } from "../../firm-scope.ts";
import { readSetting, TIME_ZONE } from "../../settings.ts";
import { ensureMessagesFirm } from "../consent/messages-firm.ts";

type Tx = Prisma.TransactionClient;
export const SEND_QUEUE = "msg.send", SWEEP_QUEUE = "msg.outbox_sweep", CAP_ALERT_QUEUE = "msg.cap_alert";
/** A QUEUED row older than this with no send is picked up by the sweep (a crash between commit and dispatch). */
export const SWEEP_AFTER_MS = 2 * 60_000;

/** A channel's sending adapter: it gets the stored message and answers the provider's id (or throws: not sent). */
export type ChannelAdapter = { provider: string; deliver(tx: Tx, r: Rendered): Promise<{ providerId: string }> };
export type MessagesDeps = { db: PrismaClient; consent: ConsentPort<Tx>; files: FilesPort; jobs: JobPort; alerts: () => AlertPort; channels: Map<Channel, ChannelAdapter>; clock?: ClockPort };

export const fileKeyOf = (firmId: string, outboxId: string) => `msg/${firmId}/outbox/${outboxId}.json`;
const dayIn = (zone: string, at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

function inTransaction(tx: Tx): Tx {
  if ("$disconnect" in (tx as object)) throw new TypeError("MessagePort.send: pass the caller's transaction (db.$transaction(tx => …)), not the client");
  return tx;
}

export class Messages implements MessagePort<Tx> {
  private readonly clock: ClockPort;
  constructor(private readonly d: MessagesDeps) { this.clock = d.clock ?? systemClock; }

  async send(txIn: Tx, input: MessageSend): Promise<SendResult> {
    const tx = inTransaction(txIn);
    const m = MessageSend.parse(input);
    const { firmId } = firmScope(m.firmId);
    const address = normaliseAddress(m.channel, m.address);
    const firm = await tx.platformFirm.findUnique({ where: { id: firmId }, select: { operatingName: true, contactEmail: true } });
    if (!firm) throw new MessageRefused(`firm ${firmId} is not a platform firm`);
    await ensureMessagesFirm(tx, firmId);
    // One writer per firm and key: a second send with the key answers the first row (never a second message).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`msg_outbox:${firmId}:${m.idempotencyKey}`}))`;
    const had = await tx.msgOutbox.findFirst({ where: firmScope(firmId, { idempotencyKey: m.idempotencyKey }), select: { id: true, state: true, stateReason: true } });
    if (had) return { outboxId: had.id, state: had.state, reason: had.stateReason, repeated: true };
    let words: { subject: string; text: string; html?: string }, templateVersionId: string | null = null;
    if ("templateKey" in m.content) {
      // The firm's own version first, else the platform's; the newest published one.
      const v = await tx.msgTemplateVersion.findFirst({
        where: { OR: [{ firmId }, { firmId: null }], template: { key: m.content.templateKey, channel: m.channel, language: m.content.language, OR: [{ firmId }, { owner: "PLATFORM", firmId: null }] } },
        orderBy: [{ template: { owner: "desc" } }, { version: "desc" }], select: { id: true, subject: true, body: true },
      });
      if (!v) throw new MessageRefused(`no ${m.channel.toLowerCase()} template ${m.content.templateKey} (${m.content.language}) for this firm`);
      words = { subject: fillFields(v.subject ?? "", m.content.values), text: fillFields(v.body, m.content.values) };
      if (!words.subject.trim() || words.subject.length > 200 || /[\u0000-\u001f\u007f]/.test(words.subject)) throw new MessageRefused(`template ${m.content.templateKey} gives no subject, one over 200 characters, or one with a line break`);
      templateVersionId = v.id;
    } else words = m.content;
    for (const k of m.attachments) if (k.startsWith("msg/") || !(await this.d.files.exists(firmId, k))) throw new MessageRefused(`attachment ${k} is not a file of this firm`);
    const decision = await this.d.consent.allows(tx, { firmId, subject: m.person, channel: m.channel, address, class: m.class });
    const id = randomUUID(), rendered = render(id, { ...m, firmId }, { name: firm.operatingName, replyTo: firm.contactEmail }, words);
    const put = await this.d.files.put(firmId, fileKeyOf(firmId, id), new TextEncoder().encode(JSON.stringify(rendered)), "application/json");
    const state = decision.allowed ? "QUEUED" : "SUPPRESSED", reason = gateReason(decision);
    await tx.msgOutbox.create({
      data: {
        id, firmId, subjectKind: m.person?.kind ?? null, subjectId: m.person?.id.toLowerCase() ?? null, channel: m.channel, address, templateVersionId,
        renderedHash: put.sha256, class: m.class, state, stateReason: reason, consentId: decision.consentId ?? null, idempotencyKey: m.idempotencyKey,
      },
    });
    return { outboxId: id, state, reason, repeated: false };
  }

  async dispatch(firmIdIn: string, outboxIds: string[]): Promise<void> {
    const { firmId } = firmScope(firmIdIn);
    for (const id of outboxIds) await this.d.jobs.enqueue(SEND_QUEUE, { firmId, outboxId: id }, { key: `msg.send:${firmId}:${id}`, firmId });
  }

  /** The worker: sends one outbox row at most once. Answers what happened (for logs and tests). */
  async deliver(firmIdIn: string, outboxId: string): Promise<"sent" | "skipped" | "held" | "failed" | "suppressed"> {
    const { firmId } = firmScope(firmIdIn);
    let alertDay: string | null = null;
    const out = await this.d.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ state: string; channel: Channel; address: string; class: "TRANSACTIONAL" | "SERVICE" | "MARKETING"; subject_kind: "FO_PERSON" | "CASE_PARTY" | "STAFF" | null; subject_id: string | null; rendered_hash: string }[]>`
        SELECT "state"::text AS state, "channel"::text AS channel, "address", "class"::text AS class, "subject_kind"::text AS subject_kind, "subject_id"::text AS subject_id, "rendered_hash"
        FROM "msg_outbox" WHERE "firm_id" = ${firmId}::uuid AND "id" = ${outboxId}::uuid FOR UPDATE`;
      if (!row || row.state !== "QUEUED") return "skipped" as const;
      const now = this.clock.now(), where = { firmId_id: { firmId, id: outboxId } };
      const end = async (state: "FAILED" | "SUPPRESSED", reason: string) => {
        await tx.msgOutbox.update({ where, data: { state, stateReason: reason } });
        if (state === "FAILED") await tx.msgEvent.create({ data: { firmId, outboxId, kind: "FAILED", occurredAt: now, detail: { reason } } });
      };
      const file = await this.d.files.get(firmId, fileKeyOf(firmId, outboxId));
      if (!file || (await sha256Hex(file.bytes)) !== row.rendered_hash) { await end("FAILED", "content changed"); return "failed" as const; }
      const rendered = JSON.parse(new TextDecoder().decode(file.bytes)) as Rendered;
      if (rendered.outboxId !== outboxId || rendered.firmId !== firmId || rendered.to !== row.address) { await end("FAILED", "content changed"); return "failed" as const; }
      const decision = await this.d.consent.allows(tx, { firmId, subject: row.subject_kind && row.subject_id ? { kind: row.subject_kind, id: row.subject_id } : undefined, channel: row.channel, address: row.address, class: row.class });
      if (!decision.allowed) { await end("SUPPRESSED", gateReason(decision)!); return "suppressed" as const; }
      const adapter = this.d.channels.get(row.channel);
      if (!adapter) { await end("FAILED", `no ${row.channel.toLowerCase()} channel registered`); return "failed" as const; }
      // The firm's day, counted under a row lock so two workers never both take the last place.
      const firm = await tx.platformFirm.findUniqueOrThrow({ where: { id: firmId }, select: { status: true } });
      const day = dayIn(await readSetting<string>(tx, firmId, TIME_ZONE.key), now), cap = DAILY_CAP[firm.status === "ACTIVE" ? "ACTIVE" : "TRIAL"];
      await tx.$executeRaw`INSERT INTO "msg_send_counter" ("firm_id", "day", "sent", "updated_at") VALUES (${firmId}::uuid, ${day}::date, 0, now()) ON CONFLICT DO NOTHING`;
      const [{ sent }] = await tx.$queryRaw<{ sent: number }[]>`SELECT "sent" FROM "msg_send_counter" WHERE "firm_id" = ${firmId}::uuid AND "day" = ${day}::date FOR UPDATE`;
      if (sent >= cap) { await tx.msgOutbox.update({ where, data: { stateReason: HELD_DAILY_LIMIT } }); alertDay = day; return "held" as const; }
      const { providerId } = await adapter.deliver(tx, rendered);
      await tx.$executeRaw`UPDATE "msg_send_counter" SET "sent" = "sent" + 1, "updated_at" = now() WHERE "firm_id" = ${firmId}::uuid AND "day" = ${day}::date`;
      await tx.msgOutbox.update({ where, data: { state: "SENT", stateReason: null, providerId, sentAt: now } });
      await tx.msgEvent.create({ data: { firmId, outboxId, kind: "SENT", providerEventId: providerId, occurredAt: now, detail: { provider: adapter.provider } } });
      return "sent" as const;
    });
    // One alert to our team per firm per day: the job key holds the day, so a second held message queues nothing.
    if (alertDay) await this.d.jobs.enqueue(CAP_ALERT_QUEUE, { firmId, day: alertDay }, { key: `msg.cap_alert:${firmId}:${alertDay}`, firmId });
    return out;
  }

  /** Each minute: every QUEUED row older than SWEEP_AFTER_MS gets a job keyed by the hour (a held row tries once an hour). */
  async sweep(): Promise<number> {
    const now = this.clock.now(), hour = now.toISOString().slice(0, 13);
    // Rows a crash left (no reason) apart from rows the cap holds, so one firm's held backlog never hides another's lost row.
    const stale = { state: "QUEUED" as const, createdAt: { lt: new Date(now.getTime() - SWEEP_AFTER_MS) } }, pick = { select: { id: true, firmId: true }, orderBy: { createdAt: "asc" as const }, take: 500 };
    const rows = [...await this.d.db.msgOutbox.findMany({ where: { ...stale, stateReason: null }, ...pick }), ...await this.d.db.msgOutbox.findMany({ where: { ...stale, stateReason: HELD_DAILY_LIMIT }, ...pick })];
    let n = 0;
    for (const r of rows) if ((await this.d.jobs.enqueue(SEND_QUEUE, { firmId: r.firmId, outboxId: r.id }, { key: `msg.send:${r.id}:sweep:${hour}`, firmId: r.firmId })).queued) n++;
    return n;
  }

  /** Registers the worker, the sweep and the cap alert on the job runner. */
  async register(): Promise<void> {
    await this.d.jobs.handle(SEND_QUEUE, async (j) => { await this.deliver(String(j.payload.firmId), String(j.payload.outboxId)); });
    await this.d.jobs.handle(SWEEP_QUEUE, async () => { await this.sweep(); });
    await this.d.jobs.handle(CAP_ALERT_QUEUE, async (j) => { await this.d.alerts().raise("send_cap_reached", { rule: "PF-19b.daily_cap", firmId: String(j.payload.firmId), entity: "msg_send_counter", entityKey: String(j.payload.day) }); });
    await this.d.jobs.recurring(SWEEP_QUEUE, "* * * * *", "UTC");
  }
  /** Nest: handlers are registered before the job runner starts (PlatformJobs starts on application bootstrap). */
  async onModuleInit(): Promise<void> { await this.register(); }
}
