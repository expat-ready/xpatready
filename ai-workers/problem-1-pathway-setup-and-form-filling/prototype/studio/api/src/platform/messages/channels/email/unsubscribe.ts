// PF-19b part 2 (row 49; AG-10-22, AG-2-59 rule 11 "unsubscribe still applies"; RFC 8058): one-click unsubscribe. Marketing
// and service email carry List-Unsubscribe and List-Unsubscribe-Post; the link's token is the firm and outbox ids sealed
// with AES-256-GCM (a key derived from PF-24's secret-box key ring, its version in the token), so it names no firm or
// person in clear and cannot be made by anyone else. A GET shows a page with one button and changes nothing (a link
// scanner never unsubscribes anyone); the POST records the withdrawal through ConsentPort.withdraw (via UNSUBSCRIBE) for
// email marketing only: the person's other consents (WhatsApp opt-in, WhatsApp marketing) stay as they are, and service
// email needs no consent (PF-19a). A token is used once: its withdrawal is written `by system:unsubscribe:<outbox id>`, so
// a second POST, a forged token or one for a transactional message answers 404 and records nothing. Rate limited per link
// (break M2: behind the load balancer every caller has one IP); a token that does not open costs no query.
import type { Prisma, PrismaClient } from "@prisma/client";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { ConsentPort } from "../../../../../../ports/consent.ts";
import type { Rendered } from "../../../../../../ports/messages.ts";
import type { Secret } from "../../../config/secret.ts";
import { enterFirm, firmScope } from "../../../firm-scope.ts";

type Tx = Prisma.TransactionClient;
export const UNSUBSCRIBE_PATH = "/api/public/unsubscribe";
/** Sample: tries one link may take in a minute. */
export const UNSUBSCRIBE_PER_MINUTE = 20;
const INFO = "pf19b.unsubscribe.v1";

const hex = (s: string) => Buffer.from(s.replace(/-/g, ""), "hex");
const uuidOf = (b: Buffer) => b.toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

/** The token keys: one per secret-box key version (HKDF of it), sealed with the current one; a local server with no ring
 *  gets one random key for its life (tokens of a restarted local server stop working: Sample, local only). */
export class UnsubscribeTokens {
  private readonly keys = new Map<number, Buffer>();
  private readonly current: number;
  constructor(ring: { current: number; keys: ReadonlyMap<number, Secret> } | null) {
    if (!ring) { this.current = 0; this.keys.set(0, randomBytes(32)); return; }
    this.current = ring.current;
    for (const [v, k] of ring.keys) this.keys.set(v, Buffer.from(hkdfSync("sha256", Buffer.from(k.reveal(), "base64"), Buffer.alloc(0), INFO, 32)));
  }
  mint(firmId: string, outboxId: string): string {
    const iv = randomBytes(12), v = Buffer.alloc(4); v.writeUInt32BE(this.current);
    const c = createCipheriv("aes-256-gcm", this.keys.get(this.current)!, iv); c.setAAD(v);
    const body = Buffer.concat([c.update(Buffer.concat([hex(firmId), hex(outboxId)])), c.final()]);
    return Buffer.concat([v, iv, body, c.getAuthTag()]).toString("base64url");
  }
  /** The ids, or null for anything not sealed by us (any change to the token fails the tag). */
  open(token: string): { firmId: string; outboxId: string } | null {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{80,90}$/.test(token)) return null;
    const b = Buffer.from(token, "base64url");
    if (b.length !== 64) return null;
    const key = this.keys.get(b.readUInt32BE(0));
    if (!key) return null;
    try {
      const d = createDecipheriv("aes-256-gcm", key, b.subarray(4, 16)); d.setAAD(b.subarray(0, 4)); d.setAuthTag(b.subarray(48));
      const p = Buffer.concat([d.update(b.subarray(16, 48)), d.final()]);
      return { firmId: uuidOf(p.subarray(0, 16)), outboxId: uuidOf(p.subarray(16)) };
    } catch { return null; }
  }
}

/** The headers a marketing or service email carries (none on transactional mail: a code, a link, a receipt). */
export function unsubscribeHeaders(r: Pick<Rendered, "firmId" | "outboxId" | "class">, tokens: UnsubscribeTokens, base: string): Record<string, string> {
  if (r.class === "TRANSACTIONAL" || r.firmId === null) return {};   // PF-19p: a platform account message (no firm) is transactional
  return { "List-Unsubscribe": `<${base}${UNSUBSCRIBE_PATH}/${tokens.mint(r.firmId, r.outboxId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;margin:4rem auto;max-width:32rem;padding:0 1rem;color:#1f2937;overflow-wrap:anywhere"><h1 style="font-size:1.5rem">${esc(title)}</h1>${body}</body></html>`;

export class Unsubscribe {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly d: { db: PrismaClient; consent: ConsentPort<Tx>; tokens: UnsubscribeTokens; now?: () => number }) {}

  /** "open" when the link may be tried now, "limited" after UNSUBSCRIBE_PER_MINUTE tries of it, "unknown" for a token
   *  that is not ours (no query, nothing counted). */
  allow(token: string): "open" | "limited" | "unknown" {
    const ids = this.d.tokens.open(token);
    if (!ids) return "unknown";
    const now = this.d.now?.() ?? Date.now(), key = ids.outboxId, list = (this.hits.get(key) ?? []).filter((t) => t > now - 60_000);
    if (list.length >= UNSUBSCRIBE_PER_MINUTE) { this.hits.set(key, list); return "limited"; }
    list.push(now); this.hits.set(key, list);
    if (this.hits.size > 50_000) for (const [k, v] of this.hits) if (!v.some((t) => t > now - 60_000)) this.hits.delete(k);   // break m5: only spent entries go
    return "open";
  }

  /** The message a token is for, while its link still works; else null (the route answers 404). */
  private async find(db: Tx | PrismaClient, token: string) {
    const ids = this.d.tokens.open(token);
    if (!ids) return null;
    const { firmId } = firmScope(ids.firmId);
    enterFirm(firmId);   // PF-12: the sealed token names the firm; the door runs as it (no bypass needed)
    const row = await db.msgOutbox.findFirst({ where: firmScope(firmId, { id: ids.outboxId, channel: "EMAIL" as const, class: { in: ["MARKETING" as const, "SERVICE" as const] }, state: { in: ["SENT" as const, "DELIVERED" as const, "BOUNCED" as const] } }), select: { id: true, subjectKind: true, subjectId: true } });
    if (!row?.subjectKind || !row.subjectId) return null;
    const by = `system:unsubscribe:${row.id}`;
    if (await db.msgConsentWithdrawal.findFirst({ where: firmScope(firmId, { withdrawnBy: by }), select: { id: true } })) return null;   // used before
    const firm = await db.platformFirm.findUnique({ where: { id: firmId }, select: { operatingName: true } });
    return { firmId, subject: { kind: row.subjectKind, id: row.subjectId }, by, firmName: firm?.operatingName ?? "the firm" };
  }

  /** GET: the page with the one button (records nothing). */
  async page(token: string): Promise<string | null> {
    const f = await this.find(this.d.db, token);
    if (!f) return null;
    return page(`Unsubscribe from ${f.firmName}'s marketing email?`, `<p>You will stop getting marketing email from ${esc(f.firmName)}. Messages about your own file, and any WhatsApp choices you made, stay as they are.</p><form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit" style="font-size:1rem;padding:.6rem 1.2rem">Unsubscribe</button></form>`);
  }

  /** POST (the button, or the mail client's one click): withdraws email marketing once; null when the link does not work. */
  async confirm(token: string): Promise<string | null> {
    const opened = this.d.tokens.open(token);
    if (opened) enterFirm(opened.firmId);   // PF-12: before the transaction, which keeps the firm it opens with
    const done = await this.d.db.$transaction(async (tx) => {
      const ids = this.d.tokens.open(token);
      if (!ids) return null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`msg_unsubscribe:${ids.outboxId}`}))`;   // two clicks at once: one withdrawal
      const f = await this.find(tx, token);
      if (!f) return null;
      await this.d.consent.withdraw(tx, { firmId: f.firmId, subject: f.subject, channel: "EMAIL", purpose: "MARKETING", via: "UNSUBSCRIBE", by: f.by });
      return f.firmName;
    });
    return done === null ? null : page("You are unsubscribed", `<p>${esc(done)} will not send you marketing email any more. Messages about your own file, and any WhatsApp choices you made, stay as they are.</p>`);
  }
}
