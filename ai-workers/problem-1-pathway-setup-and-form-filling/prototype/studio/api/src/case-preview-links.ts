// CS-D5 part 1 (R1.68): the case side's preview link signer, pure code (no Nest), so a check can use it in-process.
// Short-lived (AG-09 line 426: "today 300s"), single use (concept M2: no read goes unrecorded), nameless (DW5).
// The case side's own signer (contract gap 1: `FileLinks` is the front office's and may not be imported here); it folds
// into the platform's link module when that gap is closed.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** The link's life in seconds (AG-09 line 426: "a small number of minutes; today 300s"). */
export const PREVIEW_SECONDS = 300;
/** The URL path a link lives under; the rest of the URL is only the token. */
export const PREVIEW_PATH = "/api/runtime/document-previews/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Refused = { refused: "invalid" | "expired" | "used" };

/** Short-lived single-use tokens for (workspace, the asker, the document). The readable part holds ids only: never a
 *  firm's, a person's or a file's name (DW5). Used tokens are kept in memory until they expire: single use holds for ONE process. Before a deploy with more than
 *  one task (deploy/cdk MIN_TASKS = 2), used tokens move to a table with a unique key and the key to PF-24 settings
 *  (reviewer and breaker, #3188). */
export class PreviewLinks {
  private readonly macKey: Buffer;
  private readonly used = new Map<string, number>();   // token MAC → expiry (s)
  constructor(keyText = process.env.CASE_PREVIEW_LINK_KEY) { this.macKey = keyText ? Buffer.from(keyText, "utf8") : randomBytes(32); }

  sign(workspaceId: string, actorId: string, documentId: string, nowMs: number, seconds = PREVIEW_SECONDS): { token: string; expiresAt: string } {
    const exp = Math.floor(nowMs / 1000) + seconds;
    const body = Buffer.from(JSON.stringify({ w: workspaceId.toLowerCase(), a: actorId.toLowerCase(), d: documentId.toLowerCase(), e: exp, n: randomBytes(9).toString("base64url") })).toString("base64url");
    return { token: `${body}.${this.mac(body)}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** A token's own claims when it is unaltered, unexpired and unused, or why not: checked before any database read.
   *  Does not use it up: `consume` does. */
  verify(token: string, nowMs: number): { workspace: string; actor: string; document: string; mac: string; exp: number } | Refused {
    const m = /^([A-Za-z0-9_-]{1,600})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
    if (!m) return { refused: "invalid" };
    const want = Buffer.from(this.mac(m[1]!)), got = Buffer.from(m[2]!);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return { refused: "invalid" };
    let p: { w?: unknown; a?: unknown; d?: unknown; e?: unknown };
    try { p = JSON.parse(Buffer.from(m[1]!, "base64url").toString("utf8")); } catch { return { refused: "invalid" }; }
    if (typeof p.w !== "string" || typeof p.a !== "string" || typeof p.d !== "string" || typeof p.e !== "number" || !UUID.test(p.d)) return { refused: "invalid" };
    if (Math.floor(nowMs / 1000) >= p.e) return { refused: "expired" };
    if (this.used.has(m[2]!)) return { refused: "used" };
    return { workspace: p.w, actor: p.a, document: p.d, mac: m[2]!, exp: p.e };
  }

  /** The document a token names for this asker in this workspace, or why not. Does not use it up. */
  check(token: string, workspaceId: string, actorId: string, nowMs: number): { document: string; mac: string; exp: number } | Refused {
    const v = this.verify(token, nowMs);
    if ("refused" in v) return v;
    if (v.workspace !== workspaceId.toLowerCase() || v.actor !== actorId.toLowerCase()) return { refused: "invalid" };
    return { document: v.document, mac: v.mac, exp: v.exp };
  }

  /** Marks a checked token used; false when another request used it first (single use, concept M2). */
  consume(mac: string, exp: number, nowMs: number): boolean {
    const now = Math.floor(nowMs / 1000);
    for (const [k, e] of this.used) if (e <= now) this.used.delete(k);
    if (this.used.has(mac)) return false;
    this.used.set(mac, exp);
    return true;
  }

  private mac(body: string) { return createHmac("sha256", this.macKey).update(`case-preview-link:${body}`).digest("base64url"); }
}

