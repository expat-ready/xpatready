// FO-6 part 4c (BACKLOG row FO-6; note product/screens/FO-6-4/note.md rule 11; plan plan-4c.md; Lead 29 on #3490): the
// lane copy's stand-in for the signing vendor's frame, so a copy can be signed end to end on the fake adapter (P-561: no
// vendor call). Not a product screen: the client's page is FO-5s, the vendor's frame FO-6v.
//   * It exists only when PLATFORM_ENVIRONMENT is `local`: the feature registers it there only, the start fails if it is
//     registered anywhere else (`assertStandInPageAllowed`, Lead 29), and every call checks again (local and the fake port).
//   * The fake's embedded link names it: `/api/public/sign-fake/<document>/<signer>/<nonce>`. The nonce (in the fake's
//     memory, 10 minutes, used once) is the only key, as a vendor's embedded link is (Lead 29, answer 3): the page opens in
//     a browser that holds no door cookie. An unknown, used, expired or malformed one is one 404.
//   * Sign plays the fake's `signed` step and POSTs each webhook call it returns, with its exact bytes and signature, over
//     loopback to this copy's own webhook door `POST /api/hooks/signing/fake` (part 3's door and its bypass use, which is
//     bound to that route only: plan challenge B1). So part 3's order, consent, expiry and evidence rules apply unchanged.
//   * The page shows the document title (escaped) and the signer's side, never a name or an address; no script.
// Every value is Sample. Legal points (what a click on a test page proves): Unconfirmed: no counsel.
import { Controller, Get, HttpCode, Inject, Param, Post, Res } from "@nestjs/common";
import { OpenRead } from "../../core.ts";
import { problem } from "../../platform/identity/keys.ts";
import { signingPort } from "./handlers.ts";
import type { FakePageTicket, SigningHookCall } from "./port.ts";

export const STAND_IN_ROUTE = "api/public/sign-fake";
const NOT_WORK = "This test link does not work.";
const RETRIES = 2, RETRY_MS = 200;   // a 409 NOT_YET or CHANGED from the door: the fake never sends again (plan challenge m2)

type Rs = { setHeader(name: string, value: string): unknown; status(code: number): unknown };
type Fake = { pageTicket(d: string, s: string, n: string): FakePageTicket | null; claimTicket(d: string, s: string, n: string): FakePageTicket | null;
  act(firmId: string, d: string, s: string, step: "signed"): Promise<SigningHookCall[]> };

const isLocal = () => process.env.PLATFORM_ENVIRONMENT === "local";
/** Start-up guard (Lead 29 on #3490: fail closed): the stand-in page signs without a signer, so outside `local` it must
 *  never be registered. Throws, which stops the start. */
export function assertStandInPageAllowed(controllers: readonly unknown[], env: string | undefined) {
  if (controllers.includes(FakeSigningPageController) && env !== "local") throw new Error(`FO-6 part 4c: the stand-in signing page is registered with PLATFORM_ENVIRONMENT=${env ?? "(unset)"}; it exists only in local`);
}
/** The fake port with its page tickets, only on a local copy; else the one 404 (a request-time check, plan m6). */
function fake(): Fake {
  const p = signingPort() as unknown as Partial<Fake> & { provider: string };
  if (!isLocal() || p.provider !== "FAKE" || typeof p.claimTicket !== "function" || typeof p.pageTicket !== "function") return notWork();
  return p as Fake;
}
const notWork = (): never => problem(404, "Not found", NOT_WORK, { code: "LINK_NOT_WORKING" });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const side = (t: FakePageTicket) => (t.role === "CLIENT" ? "the client" : "the firm");

function headers(res: Rs) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'");
}
function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Test signing page</title>`
    + `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}`
    + `.note{background:#fff4d6;border:1px solid #c99a00;padding:.5rem .75rem;border-radius:4px}button{font:inherit;padding:.5rem 1.5rem;border-radius:4px;border:1px solid #0b4f8a;background:#0b5fa5;color:#fff;cursor:pointer}</style></head>`
    + `<body><main><h1>Test signing page (no real signature)</h1><p class="note">This page stands in for the signing provider on a test copy. It is not a real signature service.</p><h2>${esc(title)}</h2>${body}</main></body></html>`;
}

/** POSTs one call to this copy's own webhook door, retrying a "not yet" or "changed at the same time" answer. */
async function deliver(call: SigningHookCall): Promise<{ ok: boolean; status: number; reason?: string }> {
  const url = `http://127.0.0.1:${process.env.STUDIO_PORT ?? 4400}/api/hooks/signing/fake`;
  let last = { ok: false, status: 0, reason: "not sent" as string | undefined };
  for (let i = 0; i <= RETRIES; i++) {
    if (i) await new Promise((r) => setTimeout(r, RETRY_MS));
    try {
      const r = await fetch(url, { method: "POST", headers: Object.fromEntries(Object.entries(call.headers).filter((e): e is [string, string] => typeof e[1] === "string")), body: Buffer.from(call.body) });
      const j = await r.json().catch(() => null) as { applied?: boolean; reason?: string; code?: string } | null;
      last = { ok: r.ok && j?.applied !== false, status: r.status, reason: j?.reason ?? j?.code };
      if (r.status !== 409 || !/NOT_YET|CHANGED|NOT_READY/.test(String(j?.code))) return last;
    } catch { last = { ok: false, status: 0, reason: "the copy's webhook door did not answer" }; }
  }
  return last;
}

@Controller(STAND_IN_ROUTE)
export class FakeSigningPageController {
  @OpenRead("the copy's stand-in for the signing vendor's frame on the fake adapter, local only, its nonce the key, FO-6 part 4c") @Get(":doc/:signer/:nonce")   // QA-53 REVIEWED
  show(@Param("doc") doc: string, @Param("signer") signer: string, @Param("nonce") nonce: string, @Res({ passthrough: true }) res: Rs) {
    headers(res);
    const t = fake().pageTicket(doc, signer, nonce);
    if (!t) return notWork();
    return page(t.title, `<p>You are signing as ${side(t)}.</p><form method="post"><button type="submit">Sign</button></form>`);
  }

  @Post(":doc/:signer/:nonce") @HttpCode(200)
  async sign(@Param("doc") doc: string, @Param("signer") signer: string, @Param("nonce") nonce: string, @Res({ passthrough: true }) res: Rs) {
    headers(res);
    const f = fake(), t = f.claimTicket(doc, signer, nonce);   // taken now: a second Sign on this nonce is the 404
    if (!t) return notWork();
    let calls: SigningHookCall[];
    try { calls = await f.act(t.firmId, t.providerDocumentId, t.signerId, "signed"); } catch { return page(t.title, `<p role="alert">This document can no longer be signed here. Ask the firm to send it again.</p>`); }
    for (const c of calls) {
      const d = await deliver(c);
      if (!d.ok) { res.status(409); return page(t.title, `<p role="alert">The signature was not recorded (${esc(String(d.reason ?? d.status))}). Ask the firm to send it again.</p>`); }
    }
    return page(t.title, `<p role="status">Signed. You can close this page.</p>`);
  }
}
