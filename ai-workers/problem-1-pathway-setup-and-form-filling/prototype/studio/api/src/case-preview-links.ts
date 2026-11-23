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
 *  firm's, a person's or a file's name (DW5). Used tokens are kept in memory until they expire (one process). */
export class PreviewLinks {
  private readonly macKey: Buffer;
  private readonly used = new Map<string, number>();   // token MAC → expiry (s)
  constructor(keyText = process.env.CASE_PREVIEW_LINK_KEY) { this.macKey = keyText ? Buffer.from(keyText, "utf8") : randomBytes(32); }

  sign(workspaceId: string, actorId: string, documentId: string, nowMs: number, seconds = PREVIEW_SECONDS): { token: string; expiresAt: string } {
    const exp = Math.floor(nowMs / 1000) + seconds;
    const body = Buffer.from(JSON.stringify({ w: workspaceId.toLowerCase(), a: actorId.toLowerCase(), d: documentId.toLowerCase(), e: exp, n: randomBytes(9).toString("base64url") })).toString("base64url");
    return { token: `${body}.${this.mac(body)}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** The document a token names for this asker, or why not. Does not use it up: `consume` does. */
  check(token: string, workspaceId: string, actorId: string, nowMs: number): { document: string; mac: string; exp: number } | Refused {
    const m = /^([A-Za-z0-9_-]{1,600})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
    if (!m) return { refused: "invalid" };
    const want = Buffer.from(this.mac(m[1]!)), got = Buffer.from(m[2]!);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return { refused: "invalid" };
    let p: { w?: unknown; a?: unknown; d?: unknown; e?: unknown };
    try { p = JSON.parse(Buffer.from(m[1]!, "base64url").toString("utf8")); } catch { return { refused: "invalid" }; }
    if (typeof p.w !== "string" || typeof p.a !== "string" || typeof p.d !== "string" || typeof p.e !== "number") return { refused: "invalid" };
    if (p.w !== workspaceId.toLowerCase() || p.a !== actorId.toLowerCase()) return { refused: "invalid" };
    const now = Math.floor(nowMs / 1000);
    if (now >= p.e) return { refused: "expired" };
    if (this.used.has(m[2]!)) return { refused: "used" };
    return { document: p.d, mac: m[2]!, exp: p.e };
  }

  /** Marks a checked token used; false when another request used it first (single use, concept M2). */
  consume(mac: string, exp: number, nowMs: number): boolean {
    const now = Math.floor(nowMs / 1000);
    for (const [k, e] of this.used) if (e <= now) this.used.delete(k);
    if (this.used.has(mac)) return false;
    this.used.set(mac, exp);
    return true;
  }

  /** The workspace and asker a token claims, read before the reach check (still verified by `check`). */
  claims(token: string): { workspaceId: string; documentId: string } | null {
    try { const p = JSON.parse(Buffer.from((token ?? "").split(".")[0] ?? "", "base64url").toString("utf8")) as { w?: unknown; d?: unknown };
      return typeof p.w === "string" && typeof p.d === "string" && UUID.test(p.d) ? { workspaceId: p.w, documentId: p.d } : null; } catch { return null; }
  }

  private mac(body: string) { return createHmac("sha256", this.macKey).update(`case-preview-link:${body}`).digest("base64url"); }
}

