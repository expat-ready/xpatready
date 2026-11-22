// PF-19a (rows rev 14/16, P-584 (1); contracts §9): ConsentPort over msg_consent, msg_consent_wording and msg_suppression
// (platform-messages.prisma). The only writer of those tables. Every write runs inside the caller's transaction and
// writes one audit line through AuditPort.record(tx, …) (fail-closed: a failed line rolls the change back). Every query
// is scoped by firmScope (api/src/platform/firm-scope.ts); the database adds the rest (composite keys keep a consent on
// its own firm's wording; triggers keep wording write-once and a withdrawal set once). Audit detail carries ids and
// enum words only, plus (R1.8, P-687) a suppressed address in full in the line's after; never a name or the wording's text.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { systemClock, type ClockPort } from "../../../../../ports/clock.ts";
import {
  AllowsQuery, ConsentRecordInput, ConsentRefused, PublishWordingInput, SuppressInput, WithdrawInput, decide,
  copyKeeps, endingWithdrawal, liftsAddressOptOut, normaliseAddress, notInFuture, purposeNeeded, sha256Hex,
  type ConsentDecision, type ConsentPort, type PublishedWording, type Withdrawn,
} from "../../../../../ports/consent.ts";
import { firmScope } from "../../firm-scope.ts";
import { ensureMessagesFirm } from "./messages-firm.ts";

type Tx = Prisma.TransactionClient;
type DbOrTx = PrismaClient | Tx;

/** Writes need the caller's transaction: a bare client would commit the row before its audit line (break report 8). A
 *  transaction client has no $disconnect; the client has. */
function inTransaction(tx: Tx): Tx {
  if ("$disconnect" in (tx as object)) throw new TypeError("ConsentStore: pass the caller's transaction (db.$transaction(tx => …)), not the client");
  return tx;
}

export class ConsentStore implements ConsentPort<Tx> {
  constructor(private readonly audit: AuditPort<Tx>, private readonly clock: ClockPort = systemClock) {}

  async record(txIn: Tx, input: Parameters<ConsentPort["record"]>[1]): Promise<{ id: string }> {
    const tx = inTransaction(txIn);
    const c = ConsentRecordInput.parse(input);
    const { firmId } = firmScope(c.firmId);
    await ensureMessagesFirm(tx, firmId);
    if (c.wordingId) {
      const w = await tx.msgConsentWording.findFirst({ where: firmScope(firmId, { id: c.wordingId.toLowerCase(), channel: c.channel, purpose: c.purpose }), select: { id: true } });
      if (!w) throw new ConsentRefused(`wording ${c.wordingId} is not this firm's ${c.channel} ${c.purpose} wording`);
    }
    // A Link or Merge copy carries the original's withdrawal (AG-2-83 rule 8: Merge copies withdrawals too), so a copy
    // of a withdrawn consent is never live.
    const from = c.copiedFromId
      ? await tx.msgConsent.findFirst({ where: firmScope(firmId, { id: c.copiedFromId.toLowerCase() }), select: { id: true, subjectKind: true, subjectId: true, channel: true, purpose: true, wordingId: true, givenAt: true, withdrawnAt: true, withdrawnBy: true, withdrawnVia: true } })
      : null;
    if (c.copiedFromId && !from) throw new ConsentRefused(`consent ${c.copiedFromId} is not in this firm`);
    if (from) copyKeeps(from, c);
    const now = this.clock.now();
    const givenAt = from ? from.givenAt : notInFuture(c.givenAt ?? now, now, "givenAt");
    // The withdrawal that already ends this consent, if any: the copied row's own, a withdrawal row of the copied row's
    // key, or one of this row's key, at or after its time. Such a row is written withdrawn (never live, never revivable).
    const firstOut = async (kind: typeof c.subject.kind, subjectId: string) => {
      const w = await tx.msgConsentWithdrawal.findFirst({
        where: firmScope(firmId, { subjectKind: kind, subjectId: subjectId.toLowerCase(), channel: c.channel, purpose: c.purpose, withdrawnAt: { gte: givenAt } }),
        orderBy: { withdrawnAt: "asc" }, select: { withdrawnAt: true, withdrawnBy: true, via: true },
      });
      return w ? { at: w.withdrawnAt, by: w.withdrawnBy, via: w.via } : null;
    };
    const end = endingWithdrawal(givenAt, [
      from?.withdrawnAt && from.withdrawnBy && from.withdrawnVia ? { at: from.withdrawnAt, by: from.withdrawnBy, via: from.withdrawnVia } : null,
      from ? await firstOut(from.subjectKind, from.subjectId) : null,
      await firstOut(c.subject.kind, c.subject.id),
    ]);
    const withdrawal = end ? { withdrawnAt: end.at, withdrawnBy: end.by, withdrawnVia: end.via } : {};
    const row = await tx.msgConsent.create({
      data: {
        firmId, subjectKind: c.subject.kind, subjectId: c.subject.id.toLowerCase(), channel: c.channel, purpose: c.purpose,
        wordingId: c.wordingId?.toLowerCase() ?? null, basis: c.basis, source: c.source, sourceRef: c.sourceRef ?? null, evidenceRef: c.evidenceRef ?? null,
        locale: c.locale ?? null, ipHash: c.ipHash ?? null, jurisdiction: c.jurisdiction ?? null, recordedKind: c.recordedKind, recordedBy: c.recordedBy,
        copiedFromId: c.copiedFromId ?? null, givenAt, ...withdrawal,
      },
      select: { id: true },
    });
    await this.audit.record(tx, {
      firmId, actor: c.recordedBy, action: "consent.recorded", entity: "msg_consent", entityKey: row.id,
      summary: `Consent recorded: ${c.channel.toLowerCase()} ${c.purpose.toLowerCase()}, from ${c.source.toLowerCase().replace(/_/g, " ")}.`,
      detail: { subjectKind: c.subject.kind, subjectId: c.subject.id.toLowerCase(), channel: c.channel, purpose: c.purpose, basis: c.basis, source: c.source, wordingId: c.wordingId ?? null, copiedFromId: c.copiedFromId ?? null, writtenWithdrawn: !!end },
      // R1.8 (QA-594): the consent row as created (never the IP's hash: no hash or secret is an audit value).
      before: null, after: { subjectKind: c.subject.kind, subjectId: c.subject.id.toLowerCase(), channel: c.channel, purpose: c.purpose, wordingId: c.wordingId?.toLowerCase() ?? null, basis: c.basis, source: c.source,
        sourceRef: c.sourceRef ?? null, evidenceRef: c.evidenceRef ?? null, locale: c.locale ?? null, jurisdiction: c.jurisdiction ?? null, recordedKind: c.recordedKind, recordedBy: c.recordedBy,
        copiedFromId: c.copiedFromId ?? null, givenAt: givenAt.toISOString(), withdrawnAt: end ? end.at.toISOString() : null },
    });
    return row;
  }

  async withdraw(txIn: Tx, input: Parameters<ConsentPort["withdraw"]>[1]): Promise<Withdrawn> {
    const tx = inTransaction(txIn);
    const w = WithdrawInput.parse(input);
    const { firmId } = firmScope(w.firmId);
    const now = this.clock.now();
    const at = notInFuture(w.at ?? now, now, "at");
    const subjectId = w.subject.id.toLowerCase();
    await ensureMessagesFirm(tx, firmId);
    // The withdrawal is its own row, whether or not a live consent exists (AG-10-24 "SHALL write a withdrawal").
    const out = await tx.msgConsentWithdrawal.create({
      data: { firmId, subjectKind: w.subject.kind, subjectId, channel: w.channel, purpose: w.purpose, via: w.via, withdrawnBy: w.by, withdrawnAt: at },
      select: { id: true },
    });
    // It ends every live consent of the key given at or before it; one given after `at` (a late-processed click) stays.
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "msg_consent" SET "withdrawn_at" = ${at}::timestamptz, "withdrawn_by" = ${w.by}, "withdrawn_via" = ${w.via}::"MsgWithdrawalVia"
      WHERE "firm_id" = ${firmId}::uuid AND "subject_kind" = ${w.subject.kind}::"MsgSubjectKind" AND "subject_id" = ${subjectId}::uuid
        AND "channel" = ${w.channel}::"MsgChannel" AND "purpose" = ${w.purpose}::"MsgPurpose" AND "withdrawn_at" IS NULL AND "given_at" <= ${at}::timestamptz
      RETURNING "id"::text AS id`;
    await this.audit.record(tx, {
      firmId, actor: w.by, action: "consent.withdrawn", entity: "msg_consent_withdrawal", entityKey: out.id,
      summary: `Consent withdrawn: ${w.channel.toLowerCase()} ${w.purpose.toLowerCase()}, by ${w.via.toLowerCase()} (${rows.length} live record${rows.length === 1 ? "" : "s"} ended).`,
      detail: { subjectKind: w.subject.kind, subjectId, channel: w.channel, purpose: w.purpose, via: w.via, consentIds: rows.slice(0, 50).map((r) => r.id), count: rows.length },
      before: null, after: { subjectKind: w.subject.kind, subjectId, channel: w.channel, purpose: w.purpose, via: w.via, withdrawnBy: w.by, withdrawnAt: at.toISOString(), consentsEnded: rows.length },
    });
    return { withdrawalId: out.id, withdrawn: rows.length };
  }

  async suppress(txIn: Tx, input: Parameters<ConsentPort["suppress"]>[1]): Promise<{ created: boolean }> {
    const tx = inTransaction(txIn);
    const s = SuppressInput.parse(input);
    const { firmId } = firmScope(s.firmId);
    const address = normaliseAddress(s.channel, s.address);
    await ensureMessagesFirm(tx, firmId);
    // ON CONFLICT DO NOTHING: a second bounce changes nothing and never aborts the caller's transaction.
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "msg_suppression" ("id", "firm_id", "channel", "address", "reason", "note", "created_by")
      VALUES (gen_random_uuid(), ${firmId}::uuid, ${s.channel}::"MsgChannel", ${address}, ${s.reason}::"MsgSuppressionReason", ${s.note ?? null}, ${s.by})
      ON CONFLICT ("firm_id", "channel", "address") DO NOTHING RETURNING "id"::text AS id`;
    if (!rows.length) return { created: false };
    await this.audit.record(tx, {
      firmId, actor: s.by, action: "message.address.suppressed", entity: "msg_suppression", entityKey: rows[0].id,
      summary: `An ${s.channel === "EMAIL" ? "email address" : "WhatsApp number"} was suppressed: ${s.reason.toLowerCase().replace(/_/g, " ")}.`,
      detail: { channel: s.channel, reason: s.reason },
      before: null, after: { channel: s.channel, address, reason: s.reason, note: s.note?.slice(0, 4000) ?? null },   // R1.8 (P-687): the address in full
    });
    return { created: true };
  }

  async allows(db: DbOrTx, input: Parameters<ConsentPort["allows"]>[1]): Promise<ConsentDecision> {
    const q = AllowsQuery.parse(input);
    const { firmId } = firmScope(q.firmId);
    const address = normaliseAddress(q.channel, q.address);
    const sup = await db.msgSuppression.findFirst({ where: firmScope(firmId, { channel: q.channel, address }), select: { reason: true } });
    const purpose = purposeNeeded(q.class, q.channel);
    const key = q.subject && purpose && !sup ? firmScope(firmId, { subjectKind: q.subject.kind, subjectId: q.subject.id.toLowerCase(), channel: q.channel, purpose }) : null;
    const rows = key ? await db.msgConsent.findMany({ where: key, select: { id: true, givenAt: true, withdrawnAt: true, basis: true, source: true, wordingId: true, copiedFromId: true, recordedKind: true } }) : [];
    const outs = key ? await db.msgConsentWithdrawal.findMany({ where: key, select: { withdrawnAt: true } }) : [];
    const d = decide(q, sup?.reason ?? null, rows, outs.map((o) => o.withdrawnAt));
    if (!d.allowed || d.reason !== "CONSENT" || d.purpose !== "MARKETING" || q.channel !== "EMAIL") return d;
    // QA-518: the latest one-click unsubscribe of marketing email from this address, by any person of the firm. The
    // unsubscribe door writes its withdrawal `by system:unsubscribe:<outbox id>` (unsubscribe.ts), and that outbox row
    // holds the address the message went to (stored lower case: the msg_address_ok check). The read starts from the
    // address (index msg_outbox(firm_id, channel, address)) and finds an unsubscribe of each row by its writer (index
    // msg_consent_withdrawal(firm_id, withdrawn_by)); both indexes are this row's migration (review M1). Known limit: the
    // stop lives as long as that outbox row; a future retention or erasure of msg_outbox must keep the address of an
    // unsubscribed row, or this stop is lost (review m4).
    const [opt] = await db.$queryRaw<{ at: Date | null }[]>`
      SELECT max(w."withdrawn_at") AS at FROM "msg_outbox" o
      JOIN "msg_consent_withdrawal" w ON w."firm_id" = o."firm_id" AND w."withdrawn_by" = 'system:unsubscribe:' || o."id"::text
      WHERE o."firm_id" = ${firmId}::uuid AND o."channel" = 'EMAIL'::"MsgChannel" AND o."address" = ${address}
        AND w."via" = 'UNSUBSCRIBE'::"MsgWithdrawalVia" AND w."channel" = 'EMAIL'::"MsgChannel" AND w."purpose" = 'MARKETING'::"MsgPurpose"`;
    if (!opt?.at) return d;
    const optOutAt = opt.at;
    // Withdrawn rows still count for the person's own last withdrawal; live rows count only when they lift the opt-out.
    const lifted = decide(q, null, rows.filter((r) => r.withdrawnAt || liftsAddressOptOut(optOutAt, r)), outs.map((o) => o.withdrawnAt));
    // Its own reason (review m1): this person may never have withdrawn; someone at the address unsubscribed.
    return lifted.allowed ? lifted : { allowed: false, reason: "ADDRESS_UNSUBSCRIBED", purpose: "MARKETING" };
  }

  async publishWording(txIn: Tx, input: Parameters<ConsentPort["publishWording"]>[1]): Promise<PublishedWording> {
    const tx = inTransaction(txIn);
    const w = PublishWordingInput.parse(input);
    const { firmId } = firmScope(w.firmId);
    await ensureMessagesFirm(tx, firmId);
    // One publisher at a time per firm, channel, purpose and language, so two publishers never take one number.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`msg_consent_wording:${firmId}:${w.channel}:${w.purpose}:${w.locale}`}))`;
    const last = await tx.msgConsentWording.aggregate({ where: firmScope(firmId, { channel: w.channel, purpose: w.purpose, locale: w.locale }), _max: { version: true } });
    const version = (last._max.version ?? 0) + 1;
    const textHash = await sha256Hex(w.text);
    const row = await tx.msgConsentWording.create({
      data: { firmId, channel: w.channel, purpose: w.purpose, locale: w.locale, version, text: w.text, textHash, publishedBy: w.by },
      select: { id: true },
    });
    await this.audit.record(tx, {
      firmId, actor: w.by, action: "consent.wording.published", entity: "msg_consent_wording", entityKey: row.id,
      summary: `Consent wording published: ${w.channel.toLowerCase()} ${w.purpose.toLowerCase()} (${w.locale}), version ${version}.`,
      detail: { channel: w.channel, purpose: w.purpose, locale: w.locale, version, textHash },
      before: null, after: { channel: w.channel, purpose: w.purpose, locale: w.locale, version, textLength: w.text.length },   // the wording is free text, kept in its own table
    });
    return { id: row.id, version, textHash };
  }
}
