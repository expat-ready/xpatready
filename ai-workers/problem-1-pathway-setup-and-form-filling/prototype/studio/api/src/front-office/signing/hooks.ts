// FO-6 part 3: the signing provider's webhook door, POST /api/hooks/signing/:provider. Public under /api/hooks as Stripe's (no session: the provider
// signs the body, the adapter checks it), rate limited per caller address (rolling minute, Sample 120), never a 500 for a
// hostile call. The request is found by the provider's document id under PF-12's bypass use `front-office.signing.webhook`
// (declared in ./webhook.bypass.ts), then everything runs as its firm (./service.ts).
// The body: the adapter verifies the exact bytes. With no raw-body mount for this path (main.ts is not this part's file),
// the JSON parser's object is written back with JSON.stringify, which gives the fake's bytes exactly (it writes its body
// with JSON.stringify); FO-6v mounts express.raw for this path as PF-5 did for Stripe, and a Buffer body is used as is.
import { Body, Controller, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { parseInput } from "../../platform/http/input.ts";
import { problem } from "../../platform/identity/keys.ts";
import { Signing } from "./service.ts";

const WINDOW_MS = 60_000, MAX_PER_WINDOW = 120;   // Sample
const hits = new Map<string, number[]>();
function limited(key: string, now = Date.now()): boolean {
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return false;
}

/** The raw bytes the provider signed (see the header). */
export function hookBytes(body: unknown): Uint8Array | null {
  if (Buffer.isBuffer(body)) return new Uint8Array(body);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body && typeof body === "object") { try { return new TextEncoder().encode(JSON.stringify(body)); } catch { return null; } }   // break m1: too deep → 400
  return null;
}

const HookBody = z.union([z.instanceof(Buffer), z.record(z.string().max(64), z.unknown())]);

@Controller("api/hooks/signing")
export class SigningHooksController {
  constructor(@Inject(Signing) private readonly signing: Signing) {}

  @Post(":provider") @HttpCode(200)
  async receive(@Param("provider") provider: string, @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }, @Body() body: unknown) {
    if (limited(req.ip ?? "unknown")) problem(429, "Too many requests", "Too many requests. Please wait a minute and try again.", { code: "TOO_MANY_REQUESTS" });
    // PF-28: the body is a JSON object or raw bytes, nothing else; its fields are the provider's, checked by the adapter
    // after the signature (port.ts verifyWebhook's strict schema). Nothing is stored before both.
    // Review m1: anything but an object or raw bytes is not the provider's call: 400, as an unverified one.
    if (!Buffer.isBuffer(body) && (body === null || typeof body !== "object" || Array.isArray(body))) problem(400, "Not signed", "This call is not the signing provider's own.", { code: "SIGNATURE" });
    const bytes = hookBytes(parseInput(HookBody, body));
    if (!bytes?.length) problem(400, "Not signed", "This call is not the signing provider's own.", { code: "SIGNATURE" });
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? undefined : v]));
    return this.signing.receive(provider, { headers, body: bytes! });
  }
}
