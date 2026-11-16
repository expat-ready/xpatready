// PF-19b part 2 (row 49; AG-10-25): SES bounce and complaint notifications by Amazon SNS. The SNS signature is verified
// before anything in the notice is read (SignatureVersion 1 or 2, the certificate only from an https sns.<region>.
// amazonaws.com address, optionally only from the configured topics); an unverified notice is refused (400) and stores
// nothing. A verified notice is matched to its message by the ids SES returns in its tags and the SES message id the
// outbox row holds, so a notice can only act on a message we sent. A hard bounce (Permanent) or a complaint adds the
// message's own address to the firm's suppression list once (ConsentPort.suppress; the same notice twice, or two notices
// for one address, give one row) and marks the row BOUNCED; a soft bounce is kept as an event only. Events keep ids and
// codes, never an address.
import type { Prisma, PrismaClient } from "@prisma/client";
import { createVerify } from "node:crypto";
import { normaliseAddress, type ConsentPort } from "../../../../../../ports/consent.ts";
import { firmScope } from "../../../firm-scope.ts";
import { SES_PROVIDER } from "./ses.ts";

type Tx = Prisma.TransactionClient;
export const NOTICE_PATH = "/api/public/messages/ses-notices";
export const BOUNCE_ACTOR = "system:ses-notice";
const CERT_HOST = /^sns\.[a-z]{2}-[a-z]+-[0-9]\.amazonaws\.com$/;

export class NoticeRefused extends Error { constructor(m: string) { super(m); this.name = "NoticeRefused"; } }
export type CertFetch = (url: string) => Promise<string>;
const fetchCert: CertFetch = async (url) => { const r = await fetch(url, { redirect: "error" }); if (!r.ok) throw new NoticeRefused("certificate not fetched"); return r.text(); };

const FIELDS: Record<string, string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
};

/** The SNS string to sign (AWS: "Verifying the signatures of Amazon SNS messages"). */
export function snsStringToSign(n: Record<string, unknown>): string {
  const keys = FIELDS[String(n.Type)];
  if (!keys) throw new NoticeRefused("unknown notice type");
  return keys.filter((k) => !(k === "Subject" && n[k] === undefined)).map((k) => { if (typeof n[k] !== "string") throw new NoticeRefused(`notice field ${k} missing`); return `${k}\n${n[k]}\n`; }).join("");
}

export class SesNotices {
  private readonly certs = new Map<string, string>();
  constructor(private readonly d: { db: PrismaClient; consent: ConsentPort<Tx>; fetchCert?: CertFetch; topics?: string[] }) {}

  /** Throws NoticeRefused unless SNS signed this notice. */
  async verify(n: Record<string, unknown>): Promise<void> {
    const url = typeof n.SigningCertURL === "string" ? n.SigningCertURL : "";
    let u: URL;
    try { u = new URL(url); } catch { throw new NoticeRefused("no signing certificate"); }
    if (u.protocol !== "https:" || !CERT_HOST.test(u.hostname) || u.port || u.username || !u.pathname.endsWith(".pem")) throw new NoticeRefused("certificate not from Amazon SNS");
    const alg = n.SignatureVersion === "1" ? "RSA-SHA1" : n.SignatureVersion === "2" ? "RSA-SHA256" : null;
    if (!alg || typeof n.Signature !== "string") throw new NoticeRefused("no signature");
    if (this.d.topics?.length && !this.d.topics.includes(String(n.TopicArn))) throw new NoticeRefused("not our topic");
    const text = snsStringToSign(n);
    let cert = this.certs.get(u.href);
    if (!cert) { cert = await (this.d.fetchCert ?? fetchCert)(u.href); if (this.certs.size < 20) this.certs.set(u.href, cert); }
    let good = false;
    try { good = createVerify(alg).update(text, "utf8").verify(cert, n.Signature, "base64"); } catch { good = false; }
    if (!good) throw new NoticeRefused("signature does not verify");
  }

  /** Verifies, then applies one notice. Answers what it did (for tests and the log: ids only). */
  async receive(raw: unknown): Promise<"applied" | "repeated" | "ignored" | "confirmation"> {
    const n = (typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw) as Record<string, unknown> | null;
    if (!n || typeof n !== "object" || Array.isArray(n)) throw new NoticeRefused("not a notice");
    await this.verify(n);
    // Subscribing a topic is done once by our team in the AWS console; a confirmation request is never followed from here.
    if (n.Type !== "Notification") return "confirmation";
    let m: { notificationType?: string; eventType?: string; mail?: { messageId?: string; tags?: Record<string, string[]> }; bounce?: { bounceType?: string; bounceSubType?: string; bouncedRecipients?: { emailAddress?: string }[] }; complaint?: { complainedRecipients?: { emailAddress?: string }[]; complaintFeedbackType?: string } };
    try { m = JSON.parse(String(n.Message)); } catch { return "ignored"; }
    const kind = m.notificationType ?? m.eventType, firm = m.mail?.tags?.firm?.[0], outbox = m.mail?.tags?.outbox?.[0], sesId = m.mail?.messageId;
    if ((kind !== "Bounce" && kind !== "Complaint") || !firm || !outbox || !sesId) return "ignored";
    let firmId: string;
    try { firmId = firmScope(firm).firmId; } catch { return "ignored"; }
    if (!/^[0-9a-f-]{36}$/i.test(outbox)) return "ignored";
    return this.d.db.$transaction(async (tx) => {
      const row = await tx.msgOutbox.findFirst({ where: firmScope(firmId, { id: outbox.toLowerCase(), providerId: `${SES_PROVIDER}:${sesId}` }), select: { id: true, channel: true, address: true } });
      if (!row) return "ignored" as const;
      const eventId = String(n.MessageId).slice(0, 200);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`msg_notice:${firmId}:${eventId}`}))`;
      if (await tx.msgEvent.findFirst({ where: firmScope(firmId, { outboxId: row.id, providerEventId: eventId }), select: { id: true } })) return "repeated" as const;
      const people = (kind === "Bounce" ? m.bounce?.bouncedRecipients : m.complaint?.complainedRecipients) ?? [];
      const named = people.some((p) => { try { return normaliseAddress("EMAIL", String(p.emailAddress ?? "")) === row.address; } catch { return false; } });
      const hard = kind === "Complaint" || m.bounce?.bounceType === "Permanent";
      if (hard && named) {
        await this.d.consent.suppress(tx, { firmId, channel: row.channel, address: row.address, reason: kind === "Complaint" ? "COMPLAINT" : "HARD_BOUNCE", by: BOUNCE_ACTOR });
        await tx.msgOutbox.update({ where: { firmId_id: { firmId, id: row.id } }, data: { state: "BOUNCED", stateReason: kind === "Complaint" ? "complaint" : "hard bounce" } });
      }
      const code = (s: unknown) => (typeof s === "string" ? s.replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 40) : null);
      await tx.msgEvent.create({ data: { firmId, outboxId: row.id, kind: kind === "Complaint" ? "COMPLAINED" : "BOUNCED", providerEventId: eventId, occurredAt: new Date(), detail: { type: code(m.bounce?.bounceType ?? m.complaint?.complaintFeedbackType), subType: code(m.bounce?.bounceSubType), suppressed: hard && named } } });
      return "applied" as const;
    });
  }
}
