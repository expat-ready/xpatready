// FO-14 part A: the staff read of a client's engagement (R1.62's strip, data side): when the client was last seen at one
// of our doors and their newest 20 events. A person the firm does not have, or an id that is not one, is the one 404.
// Part B: "Tell the client" (one email through MessagePort per Idempotency-Key, recorded in fo_client_update) and "last
// update", the newest update the outbox has SENT or DELIVERED (never an activity event, a NOT_SENT, queued, held, failed
// or suppressed update, or a government letter); streamFor feeds the portal. Reads take the asked person's whole merge tree
// (treeOf, down the chain); the engagement of a merged-away id is its survivor's (follow.ts's livePersonId).
import { Inject } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MessagePort, SendResult } from "../../../../ports/messages.ts";
import { PORTAL_ACTIVITY_PORT, type PortalActivityItem, type PortalActivityPort } from "../../../../ports/portal-activity.ts";
import { Db } from "../../core.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import { firmScope, notInFirm, withFirm } from "../../platform/firm-scope.ts";
import { livePersonId } from "../duplicates/merge/follow.ts";
import { treeOf } from "./adapter.ts";
import { parseInput, strict } from "../../platform/http/input.ts";
import { lockRequestKey, readIdempotencyKey, requestHash } from "../../platform/idempotency.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ENGAGEMENT_EVENTS = 20;
/** Bound useExisting MESSAGE_PORT (features/front-office-activity.ts). */
export const CLIENT_UPDATE_MESSAGES = Symbol.for("front-office.ClientUpdateMessages");
// Code points, as the database counts; a control or format character (NUL, zero-width, bidi) is refused, \n \r \t kept.
const Text = z.string().trim().refine((s) => s.replace(/\p{Cf}/gu, "").trim() !== "", "This is required.")   // ZWNJ, ZWJ kept; no lone surrogate
  .refine((s) => !/[^\P{Cc}\n\r\t]|[^\P{Cf}\u200c\u200d]|\p{Cs}/u.test(s), "Remove control and invisible characters (line breaks and tabs are fine).")
  .refine((s) => [...s].length <= 2000, "This is too long: at most 2000 characters.");
const UpdateBody = strict({ text: Text, caseId: z.string().regex(UUID).optional() });
const ACCEPTED: ReadonlySet<SendResult["state"]> = new Set(["QUEUED", "SENT", "DELIVERED"]);

export class Engagement {
  constructor(@Inject(Db) private readonly db: Db, @Inject(PORTAL_ACTIVITY_PORT) private readonly activity: PortalActivityPort,
    @Inject(CLIENT_UPDATE_MESSAGES) private readonly messages: MessagePort) {}

  async read(ctx: StaffContext, personId: string): Promise<{ lastSeen: Date | null; lastUpdate: Date | null; activity: PortalActivityItem[] }> {
    if (typeof personId !== "string" || !UUID.test(personId)) return notInFirm("person");
    const live = await livePersonId(this.db, ctx.firmId, personId.toLowerCase());
    if (!live) return notInFirm("person");
    const activity = await this.activity.recent(ctx.firmId, live, ENGAGEMENT_EVENTS);
    return { lastSeen: activity[0]?.at ?? null, lastUpdate: (await this.delivered(ctx.firmId, live, 1))[0]?.at ?? null, activity };
  }

  /** POST people/:id/updates { text, caseId? }: one email to the person, recorded DELIVERED or NOT_SENT with the reason. */
  async tell(ctx: StaffContext, personId: string, input: unknown, rawKey: unknown) {
    if (typeof personId !== "string" || !UUID.test(personId)) return notInFirm("person");
    const b = parseInput(UpdateBody, input), key = readIdempotencyKey(rawKey, "Send an Idempotency-Key header with each new update.");
    const firm = ctx.firmId, by = `staff:${ctx.staffId}`, id = randomUUID(), caseId = b.caseId?.toLowerCase() ?? null;
    const hash = requestHash({ personId: personId.toLowerCase(), by, input });
    const done = await withFirm(firm, () => this.db.$transaction(async (tx) => {
      await lockRequestKey(tx, "fo-client-update", firm, key);
      const was = await tx.foClientUpdate.findFirst({ where: firmScope(firm, { requestKey: key }), select: { id: true, state: true, reason: true, requestHash: true, createdAt: true } });
      if (was && was.requestHash !== hash) problem(422, "Request key already used", "This request key was already used for a different update.", { code: "IDEMPOTENCY_KEY_REUSED" });
      if (was) return { ...was, queued: null, repeated: true };
      const p = await tx.foPerson.findFirst({ where: firmScope(firm, { id: personId.toLowerCase(), mergedIntoId: null }), select: { id: true, email: true } });
      if (!p) return notInFirm("person");
      if (caseId) {
        const [c] = await tx.$queryRaw<{ id: string }[]>`SELECT c.id::text AS id FROM runtime_case c JOIN case_client k ON k.id = c.client_id AND k.firm_id = c.firm_id
          WHERE c.id = ${caseId}::uuid AND c.firm_id = ${firm}::uuid AND k.fo_person_id = ${p.id}::uuid`;
        if (!c) problem(404, "Not found", "No such case.", { code: "NOT_FOUND" });
      }
      let sent: SendResult | null = null;
      if (p.email) {
        const [f] = await tx.$queryRaw<{ name: string }[]>`SELECT operating_name AS name FROM platform_firm WHERE id = ${firm}::uuid`;
        sent = await this.messages.send(tx, { firmId: firm, person: { kind: "FO_PERSON", id: p.id }, channel: "EMAIL", class: "TRANSACTIONAL", address: p.email,
          content: { subject: `An update from ${Array.from(f?.name ?? "your firm").slice(0, 90).join("")}`, text: b.text }, idempotencyKey: `client-update:${requestHash(key)}` });
      }
      const state = sent && ACCEPTED.has(sent.state) ? "ACCEPTED" : "NOT_SENT";
      const reason = !sent ? "no email address" : state === "ACCEPTED" ? null : (sent.reason ?? sent.state);
      const outboxId = sent?.outboxId ?? null;
      const { createdAt } = await tx.foClientUpdate.create({ data: { id, ...firmScope(firm), personId: p.id, caseId, body: b.text, sentBy: by, outboxId, state, reason, requestKey: key, requestHash: hash }, select: { createdAt: true } });
      await auditEvent.record(tx, { firmId: firm, actor: by, action: "fo.client_update.recorded", entity: "fo_client_update", entityKey: id, ...(caseId ? { caseId } : {}),
        summary: state === "ACCEPTED" ? "Told the client: an update was sent by email." : `An update to the client was not sent (${reason}).`,
        detail: { personId: p.id, ...(caseId ? { caseId } : {}), ...(outboxId ? { outboxId } : {}) }, before: null, after: { state, reason, caseId, outboxId, sentBy: by } });
      return { id, state, reason, createdAt, queued: sent?.state === "QUEUED" ? outboxId : null, repeated: false };
    }));
    // After the commit: the worker sends (a failed dispatch is left to the outbox sweep). lastUpdate is as of the update's
    // own time, so a repeat answers the first answer's (with today's outbox states).
    if (done.queued) await this.messages.dispatch(firm, [done.queued]).catch(() => undefined);
    return { repeated: done.repeated, answer: { id: done.id, state: done.state, reason: done.reason, lastUpdate: (await this.delivered(firm, personId.toLowerCase(), 1, done.createdAt))[0]?.at ?? null } };
  }

  /** For the client portal's read (a later part): last update, the newest 20 sent updates and the newest 20 events. */
  async streamFor(firmId: string, personId: string) {
    if (typeof personId !== "string" || !UUID.test(personId)) return { lastUpdate: null, updates: [], activity: [] };
    const pid = personId.toLowerCase(), updates = await this.delivered(firmId, pid, ENGAGEMENT_EVENTS);
    return { lastUpdate: updates[0]?.at ?? null, updates, activity: await withFirm(firmId, () => this.activity.recent(firmId, pid, ENGAGEMENT_EVENTS)) };
  }

  /** Reads PF-19's outbox state: an ACCEPTED update counts once its msg_outbox row is SENT or DELIVERED. */
  private delivered(firmId: string, personId: string, take: number, before = new Date("9999-01-01")) {
    return withFirm(firmId, async () => this.db.$queryRaw<{ at: Date; text: string; caseId: string | null }[]>`SELECT u.created_at AS at, u.body AS text, u.case_id::text AS "caseId"
      FROM fo_client_update u JOIN msg_outbox o ON o.firm_id = u.firm_id AND o.id = u.outbox_id WHERE u.firm_id = ${firmId}::uuid AND u.state = 'ACCEPTED' AND o.state IN ('SENT', 'DELIVERED')
      AND u.created_at < ${before} AND u.person_id = ANY(${await treeOf(this.db, firmId, personId)}::uuid[]) ORDER BY u.created_at DESC, u.id DESC LIMIT ${take}`);
  }
}
