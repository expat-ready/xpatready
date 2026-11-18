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
// PF-19p (Lead B rev 16.62, #1955): a platform account message (no firm) writes a PLATFORM_ACCOUNT row with no firm read,
// no consent gate (the person asked for it: sign-up's verification) and no daily cap, From "ExpatReady" at
// platform.account_mail_from. Its rendered file is kept in the file store's platform space (PLATFORM_FILES_SPACE: a
// folder name, not a firm: no table holds it). dispatch(null, …) queues a platform job (JobPort's `platform: true`,
// Lead B rev 16.66: never sent inside the caller's request) on SEND_QUEUE; the runner retries a send that throws, each
// try is counted on the row, the 5th failure ends it FAILED, and the sweep queues a row a crash or a failed job left
// QUEUED once per try, after a growing wait. They have no msg_event (events key on a firm). Every platform query names firm_id IS NULL and audience PLATFORM_ACCOUNT.
// PF-19e (Lead B rev 16.64): a TRANSACTIONAL body is stored sealed (body-seal.ts; the hash is the sealed bytes'), opened
// only by the worker here and the demo inbox. sendSystem() is staff and system mail (system-mail.ts): no daily cap, a
// per-address hourly limit instead.
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AlertPort } from "../../../../../ports/alert.ts";
import { systemClock, type ClockPort } from "../../../../../ports/clock.ts";
import { normaliseAddress, type Channel, type ConsentPort } from "../../../../../ports/consent.ts";
import { sha256Hex, type FilesPort } from "../../../../../ports/files.ts";
import type { JobPort } from "../../../../../ports/jobs.ts";
import { DAILY_CAP, HELD_DAILY_LIMIT, AnyMessageSend, MessageRefused, MessageRepeated, fillFields, gateReason, isPlatformAccount, render, type MessageSend, type MessagePort, type PlatformAccountSend, type PlatformAccountSendInput, type Rendered, type SendResult } from "../../../../../ports/messages.ts";
import type { z } from "zod";
import { firmScope } from "../../firm-scope.ts";
import { ACCOUNT_MAIL_FROM, readSetting, TIME_ZONE } from "../../settings.ts";
import { ensureMessagesFirm } from "../consent/messages-firm.ts";
import type { SecretBoxPort } from "../../../../../ports/secret-box.ts";
import { messageBodyBox, openStoredBody, storedBody } from "./body-seal.ts";
import { SYSTEM_KEY_PREFIX, SYSTEM_PER_ADDRESS_HOUR, SystemMailLimited } from "./system-mail.ts";

type Tx = Prisma.TransactionClient;
/** Queue names start "messages." (a short dotted head reads as a program key to B164's guard). */
export const SEND_QUEUE = "messages.send", SWEEP_QUEUE = "messages.outbox_sweep", CAP_ALERT_QUEUE = "messages.cap_alert";
/** A QUEUED row older than this with no send is picked up by the sweep (a crash between commit and dispatch). */
export const SWEEP_AFTER_MS = 2 * 60_000;
/** Sample: per firm and kind (lost, held), the rows one sweep queues. */
export const SWEEP_PER_FIRM = 50;
/** PF-19b part 2 (break M1): the worker's transaction holds the row while the adapter sends; it must outlive the slowest
 *  adapter answer (SES: SES_TIMEOUT_MS), else a slow but accepted send rolls back and is sent again. */
export const DELIVER_TX_MS = 60_000;
/** Sample (PF-19p, break F1): sends of one platform account row before it is FAILED "send failed". The firm path's retries
 *  are JobPort's; a platform row has no job, so it counts its own tries in state_reason ("send failed: try n of N"). */
export const PLATFORM_SEND_TRIES = 5;
/** How long one platform send's transaction may hold its row lock while the adapter answers (a provider call; review m6:
 *  Prisma's 5 s default would roll back a send the provider had accepted, and the next try would send it again). */
export const PLATFORM_DELIVER_TX_MS = DELIVER_TX_MS;
/** The wait before the sweep queues a platform row's next try: SWEEP_AFTER_MS, doubled after each counted failed try (2, 4,
 *  8, 16 minutes). With pg-boss the runner's own retries (its retry policy) usually make tries 2 to 4 first; the sweep
 *  then queues what is left, and the 5th counted failure ends the row FAILED (review m-r3). */
export const platformRetryAfterMs = (tries: number) => SWEEP_AFTER_MS * 2 ** Math.max(0, tries - 1);
/** A platform row's job key for its next try (the first is the dispatch's; each later try its own, so the sweep queues
 *  each try once). */
export const platformJobKey = (outboxId: string, tries: number) => `msg.send:platform:${outboxId}${tries ? `:try:${tries}` : ""}`;
/** PF-19e: a stored body that will not open (another firm's key, a key no longer held, a moved part): never sent. */
export const UNOPENED = "body could not be opened";
const triesOf = (reason: string | null) => Number(/^send failed: try (\d+) of \d+$/.exec(reason ?? "")?.[1] ?? 0);

/** A channel's sending adapter: it gets the stored message and answers the provider's id (or throws: not sent). */
export type ChannelAdapter = { provider: string; deliver(tx: Tx, r: Rendered): Promise<{ providerId: string }> };
export type MessagesDeps = { db: PrismaClient; consent: ConsentPort<Tx>; files: FilesPort; jobs: JobPort; alerts: () => AlertPort; channels: Map<Channel, ChannelAdapter>; clock?: ClockPort; log?: (line: string) => void;
  /** PF-19e: seals TRANSACTIONAL bodies (default: the app's message-body box, body-seal.ts). */
  box?: SecretBoxPort };

export const fileKeyOf = (firmId: string | null, outboxId: string) => `msg/${firmId ?? "platform"}/outbox/${outboxId}.json`;
/** PF-19p: the file store space of platform account messages (FilesPort keys files by a uuid; this one is no firm's). */
export const PLATFORM_FILES_SPACE = "00000000-0000-0000-0000-000000000000";
/** The file store space of an outbox row: its firm, or the platform's (PF-19p). */
export const filesSpaceOf = (firmId: string | null) => firmId ?? PLATFORM_FILES_SPACE;
const dayIn = (zone: string, at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

function inTransaction(tx: Tx): Tx {
  if ("$disconnect" in (tx as object)) throw new TypeError("MessagePort.send: pass the caller's transaction (db.$transaction(tx => …)), not the client");
  return tx;
}

export class Messages implements MessagePort<Tx> {
  private readonly clock: ClockPort;
  private readonly box: SecretBoxPort;
  constructor(private readonly d: MessagesDeps) { this.clock = d.clock ?? systemClock; this.box = d.box ?? messageBodyBox(); }

  async send(txIn: Tx, input: MessageSend | PlatformAccountSendInput): Promise<SendResult> {
    const m = AnyMessageSend.parse(input);
    if (m.idempotencyKey.startsWith(SYSTEM_KEY_PREFIX)) throw new MessageRefused(`idempotency keys starting "${SYSTEM_KEY_PREFIX}" are the platform's own (sendSystem)`);
    return this.write(inTransaction(txIn), m);
  }

  /** PF-19e: staff and system mail sent by the platform (invitations, reset notices): TRANSACTIONAL, a firm's, with its
   *  key under SYSTEM_KEY_PREFIX, so the worker exempts it from the firm's daily cap. At most SYSTEM_PER_ADDRESS_HOUR such
   *  rows to one address in the firm in an hour (suppressed ones not counted), else SystemMailLimited and no row. */
  async sendSystem(txIn: Tx, input: MessageSend): Promise<SendResult> {
    const tx = inTransaction(txIn);
    const m = AnyMessageSend.parse({ ...input, idempotencyKey: `${SYSTEM_KEY_PREFIX}${input.idempotencyKey}` });
    if (isPlatformAccount(m) || m.class !== "TRANSACTIONAL") throw new MessageRefused("system mail is a firm's TRANSACTIONAL email");
    const { firmId } = firmScope(m.firmId), address = normaliseAddress(m.channel, m.address);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`msg_outbox:system:${firmId}:${address}`}))`;
    const had = await tx.msgOutbox.findFirst({ where: firmScope(firmId, { idempotencyKey: m.idempotencyKey }), select: { id: true } });
    if (!had) {
      const [{ n }] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "msg_outbox" WHERE "firm_id" = ${firmId}::uuid AND "address" = ${address}
        AND "idempotency_key" LIKE ${`${SYSTEM_KEY_PREFIX}%`} AND "state" <> 'SUPPRESSED' AND "created_at" > now() - interval '1 hour'`;
      if (n >= SYSTEM_PER_ADDRESS_HOUR) throw new SystemMailLimited();
    }
    return this.write(tx, m);
  }

  private async write(tx: Tx, m: z.output<typeof AnyMessageSend>): Promise<SendResult> {
    if (isPlatformAccount(m)) return this.sendPlatform(tx, m);
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
      if (!words.subject.trim() || words.subject.length > 200 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(words.subject)) throw new MessageRefused(`template ${m.content.templateKey} gives no subject, one over 200 characters, or one with a line break`);
      templateVersionId = v.id;
    } else words = m.content;
    for (const k of m.attachments) if (k.startsWith("msg/") || !(await this.d.files.exists(firmId, k))) throw new MessageRefused(`attachment ${k} is not a file of this firm`);
    const decision = await this.d.consent.allows(tx, { firmId, subject: m.person, channel: m.channel, address, class: m.class });
    const id = randomUUID(), rendered = render(id, { ...m, firmId }, { name: firm.operatingName, replyTo: firm.contactEmail }, words);
    const put = await this.d.files.put(firmId, fileKeyOf(firmId, id), storedBody(this.box, firmId, rendered), "application/json");
    const state = decision.allowed ? "QUEUED" : "SUPPRESSED", reason = gateReason(decision);
    // A caller at REPEATABLE READ cannot see a row a concurrent send committed after its snapshot: its insert meets the
    // key (P2002) and its transaction is spoilt, so it gets one typed answer; its retry answers the first row (Lead B, #1824).
    await tx.msgOutbox.create({
      data: {
        id, firmId, subjectKind: m.person?.kind ?? null, subjectId: m.person?.id.toLowerCase() ?? null, channel: m.channel, address, templateVersionId,
        renderedHash: put.sha256, class: m.class, state, stateReason: reason, consentId: decision.consentId ?? null, idempotencyKey: m.idempotencyKey,
      },
    }).catch((e: { code?: string; meta?: { target?: unknown } }) => { throw e?.code === "P2002" && /idempotency/.test(JSON.stringify(e.meta ?? {})) ? new MessageRepeated(m.idempotencyKey) : e; });
    return { outboxId: id, state, reason, repeated: false };
  }

  /** PF-19p: a platform account message, through the same outbox, file and idempotency (no firm, no gate). Under PF-12's
   *  walls its NULL-firm row is written only as the system role: the caller's transaction runs inside asBypass (MessagesMail
   *  uses "platform.account.mail"; a door already on its own bypass use, such as sign-up, passes its transaction). */
  private async sendPlatform(tx: Tx, m: z.output<typeof PlatformAccountSend>): Promise<SendResult> {
    const address = normaliseAddress("EMAIL", m.address), where = { audience: "PLATFORM_ACCOUNT" as const, firmId: null, idempotencyKey: m.idempotencyKey };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`msg_outbox:platform:${m.idempotencyKey}`}))`;
    const had = await tx.msgOutbox.findFirst({ where, select: { id: true, state: true, stateReason: true } });
    if (had) return { outboxId: had.id, state: had.state, reason: had.stateReason, repeated: true };
    const id = randomUUID(), rendered = render(id, m, ACCOUNT_MAIL_FROM.default, m.content);
    const put = await this.d.files.put(PLATFORM_FILES_SPACE, fileKeyOf(null, id), storedBody(this.box, PLATFORM_FILES_SPACE, rendered), "application/json");
    await tx.msgOutbox.create({
      data: { id, firmId: null, audience: "PLATFORM_ACCOUNT", channel: "EMAIL", address, renderedHash: put.sha256, class: "TRANSACTIONAL", state: "QUEUED", idempotencyKey: m.idempotencyKey },
    }).catch((e: { code?: string; meta?: { target?: unknown } }) => { throw e?.code === "P2002" && /idempotency/.test(JSON.stringify(e.meta ?? {})) ? new MessageRepeated(m.idempotencyKey) : e; });
    return { outboxId: id, state: "QUEUED", reason: null, repeated: false };
  }

  async dispatch(firmIdIn: string | null, outboxIds: string[]): Promise<void> {
    if (firmIdIn === null) {   // PF-19p: platform account rows, one platform job each (no firm)
      for (const id of outboxIds) await this.d.jobs.enqueue(SEND_QUEUE, { outboxId: id, platform: true }, { key: platformJobKey(id, 0), platform: true });
      return;
    }
    const { firmId } = firmScope(firmIdIn);
    for (const id of outboxIds) await this.d.jobs.enqueue(SEND_QUEUE, { firmId, outboxId: id }, { key: `msg.send:${firmId}:${id}`, firmId });
  }

  /** The worker: sends one outbox row at most once. Answers what happened (for logs and tests); `null`: a platform account row (PF-19p). */
  async deliver(firmIdIn: string | null, outboxId: string): Promise<"sent" | "skipped" | "held" | "failed" | "suppressed"> {
    if (firmIdIn === null) return this.deliverPlatform(outboxId);
    const { firmId } = firmScope(firmIdIn);
    let alertDay: string | null = null;
    const out = await this.d.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ state: string; channel: Channel; address: string; class: "TRANSACTIONAL" | "SERVICE" | "MARKETING"; subject_kind: "FO_PERSON" | "CASE_PARTY" | "STAFF" | null; subject_id: string | null; rendered_hash: string; idempotency_key: string | null }[]>`
        SELECT "state"::text AS state, "channel"::text AS channel, "address", "class"::text AS class, "subject_kind"::text AS subject_kind, "subject_id"::text AS subject_id, "rendered_hash", "idempotency_key"
        FROM "msg_outbox" WHERE "firm_id" = ${firmId}::uuid AND "id" = ${outboxId}::uuid FOR UPDATE`;
      if (!row || row.state !== "QUEUED") return "skipped" as const;
      const now = this.clock.now(), where = { firmId_id: { firmId, id: outboxId } };
      const end = async (state: "FAILED" | "SUPPRESSED", reason: string) => {
        await tx.msgOutbox.update({ where, data: { state, stateReason: reason } });
        if (state === "FAILED") await tx.msgEvent.create({ data: { firmId, outboxId, kind: "FAILED", occurredAt: now, detail: { reason } } });
      };
      const file = await this.d.files.get(firmId, fileKeyOf(firmId, outboxId));
      if (!file || (await sha256Hex(file.bytes)) !== row.rendered_hash) { await end("FAILED", "content changed"); return "failed" as const; }
      const rendered = this.opened(firmId, outboxId, file.bytes);
      if (!rendered) { await end("FAILED", UNOPENED); return "failed" as const; }
      if (rendered.outboxId !== outboxId || rendered.firmId !== firmId || rendered.to !== row.address || (row.class === "TRANSACTIONAL") !== (rendered.class === "TRANSACTIONAL")) { await end("FAILED", "content changed"); return "failed" as const; }
      const decision = await this.d.consent.allows(tx, { firmId, subject: row.subject_kind && row.subject_id ? { kind: row.subject_kind, id: row.subject_id } : undefined, channel: row.channel, address: row.address, class: row.class });
      if (!decision.allowed) { await end("SUPPRESSED", gateReason(decision)!); return "suppressed" as const; }
      const adapter = this.d.channels.get(row.channel);
      if (!adapter) { await end("FAILED", `no ${row.channel.toLowerCase()} channel registered`); return "failed" as const; }
      // PF-19e: the platform's own account and security mail is neither held by nor counted in the firm's daily cap.
      if (row.class === "TRANSACTIONAL" && row.idempotency_key?.startsWith(SYSTEM_KEY_PREFIX)) {
        const { providerId } = await adapter.deliver(tx, rendered);
        await tx.msgOutbox.update({ where, data: { state: "SENT", stateReason: null, providerId, sentAt: now, consentId: decision.consentId ?? null } });
        await tx.msgEvent.create({ data: { firmId, outboxId, kind: "SENT", providerEventId: providerId, occurredAt: now, detail: { provider: adapter.provider } } });
        return "sent" as const;
      }
      // The firm's day, counted under a row lock so two workers never both take the last place.
      const firm = await tx.platformFirm.findUniqueOrThrow({ where: { id: firmId }, select: { status: true } });
      const day = dayIn(await readSetting<string>(tx, firmId, TIME_ZONE.key), now), cap = DAILY_CAP[firm.status === "ACTIVE" ? "ACTIVE" : "TRIAL"];
      await tx.$executeRaw`INSERT INTO "msg_send_counter" ("firm_id", "day", "sent", "updated_at") VALUES (${firmId}::uuid, ${day}::date, 0, now()) ON CONFLICT DO NOTHING`;
      const [{ sent }] = await tx.$queryRaw<{ sent: number }[]>`SELECT "sent" FROM "msg_send_counter" WHERE "firm_id" = ${firmId}::uuid AND "day" = ${day}::date FOR UPDATE`;
      if (sent >= cap) { await tx.msgOutbox.update({ where, data: { stateReason: HELD_DAILY_LIMIT } }); alertDay = day; return "held" as const; }
      const { providerId } = await adapter.deliver(tx, rendered);
      await tx.$executeRaw`UPDATE "msg_send_counter" SET "sent" = "sent" + 1, "updated_at" = now() WHERE "firm_id" = ${firmId}::uuid AND "day" = ${day}::date`;
      await tx.msgOutbox.update({ where, data: { state: "SENT", stateReason: null, providerId, sentAt: now, consentId: decision.consentId ?? null } });
      await tx.msgEvent.create({ data: { firmId, outboxId, kind: "SENT", providerEventId: providerId, occurredAt: now, detail: { provider: adapter.provider } } });
      return "sent" as const;
    }, { timeout: DELIVER_TX_MS, maxWait: 10_000 });
    // One alert to our team per firm per day: the job key holds the day, so a second held message queues nothing.
    if (alertDay) await this.d.jobs.enqueue(CAP_ALERT_QUEUE, { firmId, day: alertDay }, { key: `msg.cap_alert:${firmId}:${alertDay}`, firmId });
    return out;
  }

  /** PF-19p: sends one platform account row at most once (the row lock and QUEUED, as deliver); no gate, no cap, no event.
   *  A send that throws (the provider refused, the network) counts its try on the row and writes one log line of ids
   *  (break F1), then throws on, so the job runner retries it; at PLATFORM_SEND_TRIES the row is FAILED "send failed". */
  async deliverPlatform(outboxId: string): Promise<"sent" | "skipped" | "failed"> {
    try { return await this.sendPlatformRow(outboxId); } catch (e) {
      const row = await this.d.db.msgOutbox.findFirst({ where: { id: outboxId, audience: "PLATFORM_ACCOUNT", firmId: null, state: "QUEUED" }, select: { stateReason: true } });
      if (!row) throw e;
      const tries = triesOf(row.stateReason) + 1, last = tries >= PLATFORM_SEND_TRIES;
      await this.d.db.msgOutbox.updateMany({ where: { id: outboxId, state: "QUEUED", stateReason: row.stateReason }, data: last ? { state: "FAILED", stateReason: "send failed", updatedAt: this.clock.now() } : { stateReason: `send failed: try ${tries} of ${PLATFORM_SEND_TRIES}`, updatedAt: this.clock.now() } });
      this.d.log?.(`messages: platform account outbox ${outboxId} send failed (${e instanceof Error ? e.name : "error"}), try ${tries} of ${PLATFORM_SEND_TRIES}${last ? ": FAILED" : ""}`);
      if (!last) throw e;
      return "failed";
    }
  }

  private async sendPlatformRow(outboxId: string): Promise<"sent" | "skipped" | "failed"> {
    return this.d.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ state: string; channel: Channel; address: string; rendered_hash: string }[]>`
        SELECT "state"::text AS state, "channel"::text AS channel, "address", "rendered_hash" FROM "msg_outbox"
        WHERE "firm_id" IS NULL AND "audience" = 'PLATFORM_ACCOUNT' AND "id" = ${outboxId}::uuid FOR UPDATE`;
      if (!row || row.state !== "QUEUED") return "skipped" as const;
      const where = { id: outboxId }, fail = async (reason: string) => { await tx.msgOutbox.update({ where, data: { state: "FAILED", stateReason: reason } }); return "failed" as const; };
      const file = await this.d.files.get(PLATFORM_FILES_SPACE, fileKeyOf(null, outboxId));
      if (!file || (await sha256Hex(file.bytes)) !== row.rendered_hash) return fail("content changed");
      const rendered = this.opened(PLATFORM_FILES_SPACE, outboxId, file.bytes);
      if (!rendered) return fail(UNOPENED);
      if (rendered.outboxId !== outboxId || rendered.firmId !== null || rendered.to !== row.address) return fail("content changed");
      const adapter = this.d.channels.get(row.channel);
      if (!adapter) return fail(`no ${row.channel.toLowerCase()} channel registered`);
      const { providerId } = await adapter.deliver(tx, rendered);
      await tx.msgOutbox.update({ where, data: { state: "SENT", stateReason: null, providerId, sentAt: this.clock.now() } });
      return "sent" as const;
    }, { timeout: PLATFORM_DELIVER_TX_MS, maxWait: PLATFORM_DELIVER_TX_MS });
  }

  /** PF-19e: the stored body, opened (sealed or, stored before PF-19e, plain); null when it will not open (another
   *  space's, moved, or a retired key): the caller ends the row FAILED UNOPENED, and nothing of it is logged. */
  private opened(space: string, outboxId: string, bytes: Uint8Array): Rendered | null {
    try { return openStoredBody(this.box, space, outboxId, bytes); } catch { return null; }
  }

  /** Each minute: every QUEUED row older than SWEEP_AFTER_MS gets a job keyed by the hour (a held row tries once an hour);
   *  PF-19p: a QUEUED platform account row gets a platform job for its next try, SWEEP_PER_FIRM a run, once its wait
   *  (platformRetryAfterMs) is over: never-tried rows first, so rows that keep failing never hold back a new one. */
  async sweep(): Promise<number> {
    const now = this.clock.now(), hour = now.toISOString().slice(0, 13);
    // Each firm gets its own share (SWEEP_PER_FIRM rows a crash left, and as many held by the cap, oldest first), so one
    // firm's backlog never hides another firm's rows (break M1, re-review M2); a crash row goes before a held one, and the batch takes each firm's first rows before any firm's later ones (re-review m-d).
    const rows = await this.d.db.$queryRaw<{ id: string; firmId: string }[]>`
      SELECT "id"::text AS id, "firm_id"::text AS "firmId" FROM (
        SELECT "id", "firm_id", "created_at", "state_reason", row_number() OVER (PARTITION BY "firm_id", "state_reason" IS NULL ORDER BY "created_at", "id") AS rn
        FROM "msg_outbox" WHERE "firm_id" IS NOT NULL AND "state" = 'QUEUED' AND "created_at" < ${new Date(now.getTime() - SWEEP_AFTER_MS)}::timestamptz
          AND ("state_reason" IS NULL OR "state_reason" = ${HELD_DAILY_LIMIT})) x
      WHERE rn <= ${SWEEP_PER_FIRM} ORDER BY ("state_reason" IS NOT NULL), rn, "created_at" LIMIT 2000`;
    let n = 0;
    for (const r of rows) if ((await this.d.jobs.enqueue(SEND_QUEUE, { firmId: r.firmId, outboxId: r.id }, { key: `msg.send:${r.id}:sweep:${hour}`, firmId: r.firmId })).queued) n++;
    const due = await this.d.db.msgOutbox.findMany({
      where: { audience: "PLATFORM_ACCOUNT", firmId: null, state: "QUEUED", updatedAt: { lt: new Date(now.getTime() - SWEEP_AFTER_MS) } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 2000, select: { id: true, stateReason: true, updatedAt: true },
    });
    // A row never tried goes first, then the fewest tries, then the least recently tried (break F1: stuck rows never starve a new one).
    const platform = due.filter((r) => r.updatedAt.getTime() <= now.getTime() - platformRetryAfterMs(triesOf(r.stateReason)))
      .sort((x, y) => triesOf(x.stateReason) - triesOf(y.stateReason) || x.updatedAt.getTime() - y.updatedAt.getTime()).slice(0, SWEEP_PER_FIRM);
    // The hour is in the key (as the firm rows'), so a try that failed before it was counted is queued again next hour
    // instead of waiting on a key already used (break R2, review m-r2).
    for (const r of platform) if ((await this.d.jobs.enqueue(SEND_QUEUE, { outboxId: r.id, platform: true }, { key: `${platformJobKey(r.id, triesOf(r.stateReason))}:sweep:${hour}`, platform: true })).queued) n++;
    return n;
  }

  /** Registers the worker, the sweep and the cap alert on the job runner. */
  async register(): Promise<void> {
    // The job's own firm picks the path, never its payload: a job with no firm only ever sends a platform row (break R1, review m-r1).
    await this.d.jobs.handle(SEND_QUEUE, async (j) => { await this.deliver(j.firmId, String(j.payload.outboxId)); });
    await this.d.jobs.handle(SWEEP_QUEUE, async () => { await this.sweep(); });
    await this.d.jobs.handle(CAP_ALERT_QUEUE, async (j) => { await this.d.alerts().raise("send_cap_reached", { rule: "PF-19b.daily_cap", firmId: String(j.payload.firmId), entity: "msg_send_counter", entityKey: String(j.payload.day) }); });
    await this.d.jobs.recurring(SWEEP_QUEUE, "* * * * *", "UTC");
  }
  /** Nest: handlers are registered before the job runner starts (PlatformJobs starts on application bootstrap). */
  async onModuleInit(): Promise<void> { await this.register(); }
}
