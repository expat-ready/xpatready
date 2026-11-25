// FO-14 part A: the staff read of a client's engagement (R1.62's strip, data side): when the client was last seen at one
// of our doors and their newest 20 events. A person the firm does not have, or an id that is not one, is the one 404.
// Part B: "Tell the client" (one email through MessagePort, recorded in fo_client_update) and "last update", the newest
// DELIVERED update's time (never an activity event, a NOT_SENT update or a government letter); streamFor feeds the portal.
import { Inject } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MessagePort, SendResult } from "../../../../ports/messages.ts";
import { PORTAL_ACTIVITY_PORT, type PortalActivityItem, type PortalActivityPort } from "../../../../ports/portal-activity.ts";
import { Db } from "../../core.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import { firmScope, notInFirm, withFirm } from "../../platform/firm-scope.ts";
import { parseInput, strict, text } from "../../platform/http/input.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ENGAGEMENT_EVENTS = 20;
/** Bound useExisting MESSAGE_PORT (features/front-office-activity.ts). */
export const CLIENT_UPDATE_MESSAGES = Symbol.for("front-office.ClientUpdateMessages");
const UpdateBody = strict({ text: text(2000).pipe(z.string().min(1)), caseId: z.string().regex(UUID).optional() });
const DELIVERED: ReadonlySet<SendResult["state"]> = new Set(["QUEUED", "SENT", "DELIVERED"]);

export class Engagement {
  constructor(@Inject(Db) private readonly db: Db, @Inject(PORTAL_ACTIVITY_PORT) private readonly activity: PortalActivityPort,
    @Inject(CLIENT_UPDATE_MESSAGES) private readonly messages: MessagePort) {}

  async read(ctx: StaffContext, personId: string): Promise<{ lastSeen: Date | null; lastUpdate: Date | null; activity: PortalActivityItem[] }> {
    if (typeof personId !== "string" || !UUID.test(personId)) return notInFirm("person");
    const p = await this.db.foPerson.findFirst({ where: firmScope(ctx.firmId, { id: personId.toLowerCase() }), select: { id: true } });
    if (!p) return notInFirm("person");
    const activity = await this.activity.recent(ctx.firmId, p.id, ENGAGEMENT_EVENTS);
    return { lastSeen: activity[0]?.at ?? null, lastUpdate: (await this.delivered(ctx.firmId, p.id, 1))[0]?.at ?? null, activity };
  }

  /** POST people/:id/updates { text, caseId? }: one email to the person, recorded DELIVERED or NOT_SENT with the reason. */
  async tell(ctx: StaffContext, personId: string, input: unknown) {
    if (typeof personId !== "string" || !UUID.test(personId)) return notInFirm("person");
    const b = parseInput(UpdateBody, input), firm = ctx.firmId, by = `staff:${ctx.staffId}`, id = randomUUID();
    const caseId = b.caseId?.toLowerCase() ?? null;
    const done = await withFirm(firm, () => this.db.$transaction(async (tx) => {
      const p = await tx.foPerson.findFirst({ where: firmScope(firm, { id: personId.toLowerCase() }), select: { id: true, email: true } });
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
          content: { subject: `An update from ${f?.name ?? "your firm"}`, text: b.text }, idempotencyKey: `client-update:${id}` });
      }
      const state = sent && DELIVERED.has(sent.state) ? "DELIVERED" : "NOT_SENT";
      const reason = !sent ? "no email address" : state === "DELIVERED" ? null : (sent.reason ?? sent.state);
      const outboxId = sent?.outboxId ?? null;
      await tx.foClientUpdate.create({ data: { id, ...firmScope(firm), personId: p.id, caseId, body: b.text, sentBy: by, outboxId, state, reason }, select: { id: true } });
      await auditEvent.record(tx, { firmId: firm, actor: by, action: "fo.client_update.recorded", entity: "fo_client_update", entityKey: id, ...(caseId ? { caseId } : {}),
        summary: state === "DELIVERED" ? "Told the client: an update was sent by email." : `An update to the client was not sent (${reason}).`,
        detail: { personId: p.id, ...(caseId ? { caseId } : {}), ...(outboxId ? { outboxId } : {}) }, before: null, after: { state, reason, caseId, outboxId, sentBy: by } });
      return { state, reason, queued: sent?.state === "QUEUED" ? outboxId : null };
    }));
    // After the commit: the worker sends; a dispatch that fails is left to the outbox sweep.
    if (done.queued) await this.messages.dispatch(firm, [done.queued]).catch(() => undefined);
    return { id, state: done.state, reason: done.reason, lastUpdate: (await this.delivered(firm, personId.toLowerCase(), 1))[0]?.at ?? null };
  }

  /** For the client portal's read (a later part): last update, the newest 20 DELIVERED updates and the newest 20 events. */
  async streamFor(firmId: string, personId: string) {
    if (typeof personId !== "string" || !UUID.test(personId)) return { lastUpdate: null, updates: [], activity: [] };
    const pid = personId.toLowerCase(), updates = await this.delivered(firmId, pid, ENGAGEMENT_EVENTS);
    return { lastUpdate: updates[0]?.at ?? null, updates, activity: await withFirm(firmId, () => this.activity.recent(firmId, pid, ENGAGEMENT_EVENTS)) };
  }

  private async delivered(firmId: string, personId: string, take: number) {
    const rows = await withFirm(firmId, () => this.db.foClientUpdate.findMany({ where: firmScope(firmId, { personId, state: "DELIVERED" }), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, select: { createdAt: true, body: true, caseId: true } }));
    return rows.map((r) => ({ at: r.createdAt, text: r.body, caseId: r.caseId }));
  }
}
