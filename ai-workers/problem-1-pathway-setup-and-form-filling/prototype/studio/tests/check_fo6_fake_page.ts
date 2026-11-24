// FO-6 part 4c (plan product/screens/FO-6-4/plan-4c.md rows 1-3; Lead 29 on #3490): the stand-in signing page's own rules,
// without a running copy. Written before the build (red first):
//   * the feature registers the stand-in page only with PLATFORM_ENVIRONMENT=local, and a start that registers it anywhere
//     else fails (Lead 29: fail closed);
//   * the fake's embedded link is the copy's page only when a link base is given, else signing.fake.invalid (unchanged);
//   * a nonce is the page's only key: once, 10 minutes, for its own document and signer; a signature ends every link that
//     signer was given; a cancel ends the document's;
//   * the page answers 404 outside local, shows the title escaped and the signer's side, never a name or an address.
// The end-to-end walk (sign on the page, CLIENT_SIGNED, the firm signer last) is check_fo6_door.ts E on an isolated copy.
// Sample values only; US$0, no vendor call. Run from prototype/:  tsx studio/tests/check_fo6_fake_page.ts
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { recorder } from "./runtime/api.ts";

process.env.PLATFORM_ENVIRONMENT ??= "local";   // the feature imports the platform's mail feature, which reads the settings at load
const { ok, summary } = recorder();
const { signingFeatureFor } = await import("../api/src/features/front-office-signing.ts");
const { assertStandInPageAllowed, FakeSigningPageController } = await import("../api/src/front-office/signing/fake-page.ts");
const { fakeSigning } = await import("../api/src/front-office/signing/port.ts");
const { useSigningPort } = await import("../api/src/front-office/signing/handlers.ts");

const refused = (fn: () => unknown): string | null => { try { fn(); return null; } catch (e) { return String((e as Error)?.message ?? e); } };
const statusOf = async (fn: () => unknown): Promise<number | null> => { try { await fn(); return null; } catch (e) { return (e as { getStatus?: () => number }).getStatus?.() ?? -1; } };

// ---------------------------------------------------------------------------------------------- local only, failing closed
const has = (env: string) => (signingFeatureFor(env).controllers as unknown[]).includes(FakeSigningPageController);
ok("FO-6 4c fake page: the feature registers the stand-in page with PLATFORM_ENVIRONMENT=local", has("local"));
ok("FO-6 4c fake page: the feature has no stand-in page in test or production", !has("test") && !has("production"));
ok("FO-6 4c fake page (Lead 29): a start that registers the page outside local fails (production, test, unset)",
  ["production", "test", undefined].every((env) => !!refused(() => assertStandInPageAllowed([FakeSigningPageController], env))) && refused(() => assertStandInPageAllowed([FakeSigningPageController], "local")) === null);

// ---------------------------------------------------------------------------------------------- the fake's links and nonces
let clock = Date.parse("2026-11-24T10:00:00Z");
const firm = randomUUID(), client = randomUUID(), firmSigner = randomUUID();
const make = (base: string | null) => fakeSigning({ now: () => new Date(clock), linkBase: () => base });
const send = async (p: ReturnType<typeof make>, title = "Retainer agreement (version 1)") => (await p.send({ firmId: firm, requestId: randomUUID(), title, document: { bytes: new Uint8Array([1, 2, 3]), contentType: "application/pdf" },
  signers: [{ signerId: client, role: "CLIENT", name: "Client Sample-A" }, { signerId: firmSigner, role: "FIRM", name: "Representative Sample" }] })).providerDocumentId;
const parts = (url: string) => { const m = /\/api\/public\/sign-fake\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url); return m ? { doc: decodeURIComponent(m[1]), signer: m[2], nonce: m[3] } : null; };

const plain = make(null), d0 = await send(plain);
ok("FO-6 4c fake page: without a link base the fake's link stays signing.fake.invalid (the contract unchanged)", (await plain.embeddedLink(firm, d0, client)).url.startsWith("https://signing.fake.invalid/"));

const p = make("http://localhost:4461/"), d1 = await send(p);
const l1 = await p.embeddedLink(firm, d1, client), u1 = parts(l1.url);
ok("FO-6 4c fake page: with a base the link is <base>/api/public/sign-fake/<document>/<signer>/<43-char nonce>", l1.url.startsWith("http://localhost:4461/api/public/sign-fake/") && !!u1 && u1.doc === d1 && u1.signer === client && /^[A-Za-z0-9_-]{43}$/.test(u1.nonce), l1.url);
const t1 = u1 && p.pageTicket(u1.doc, u1.signer, u1.nonce);
ok("FO-6 4c fake page: a live nonce gives its ticket: firm, document, signer, title, side; never a name", !!t1 && t1.firmId === firm && t1.role === "CLIENT" && !JSON.stringify(t1).includes("Sample-A"), t1);
ok("FO-6 4c fake page: a nonce with another document or signer, a malformed one and an unknown one give nothing",
  !!u1 && !p.pageTicket(d0, u1.signer, u1.nonce) && !p.pageTicket(u1.doc, firmSigner, u1.nonce) && !p.pageTicket(u1.doc, u1.signer, "x") && !p.pageTicket(u1.doc, u1.signer, "A".repeat(43)));
const c1 = u1 && p.claimTicket(u1.doc, u1.signer, u1.nonce), c1b = u1 && p.claimTicket(u1.doc, u1.signer, u1.nonce);
ok("FO-6 4c fake page: a nonce is claimed once; the second claim gets nothing", !!c1 && !c1b);
const l2 = parts((await p.embeddedLink(firm, d1, client)).url)!; clock += 10 * 60_000 + 1;
ok("FO-6 4c fake page: a nonce older than the link's 10 minutes gives nothing", !p.pageTicket(l2.doc, l2.signer, l2.nonce) && !p.claimTicket(l2.doc, l2.signer, l2.nonce));
const l3 = parts((await p.embeddedLink(firm, d1, client)).url)!, l4 = parts((await p.embeddedLink(firm, d1, client)).url)!;
await p.act(firm, d1, client, "signed");
ok("FO-6 4c fake page (challenge m1): once the signer signs, every link they were given ends", !p.pageTicket(l3.doc, l3.signer, l3.nonce) && !p.pageTicket(l4.doc, l4.signer, l4.nonce));
const d2 = await send(p), l5 = parts((await p.embeddedLink(firm, d2, client)).url)!;
await p.cancel(firm, d2);
ok("FO-6 4c fake page: a cancelled document's links end", !p.pageTicket(l5.doc, l5.signer, l5.nonce));

// ---------------------------------------------------------------------------------------------- the page
const ctrl = new FakeSigningPageController();
const res = () => { const h: Record<string, string> = {}; return { h, setHeader: (k: string, v: string) => { h[k.toLowerCase()] = v; }, status: () => undefined }; };
const q = make("http://localhost:4461"), d3 = await send(q, `Retainer <script>alert(1)</script> & "co"`), l6 = parts((await q.embeddedLink(firm, d3, client)).url)!;
const was = useSigningPort(q);
try {
  const r6 = res(), html = String(ctrl.show(l6.doc, l6.signer, l6.nonce, r6));
  ok("FO-6 4c fake page: the page shows the title escaped, the signer's side and one Sign button; no name, no script",
    html.includes("Retainer &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;") && !html.includes("<script") && /as the client/.test(html) && (html.match(/<button/g) ?? []).length === 1 && !html.includes("Sample-A") && !html.includes("Representative Sample"), html.slice(0, 300));
  ok("FO-6 4c fake page: its answers carry no-store, no-referrer and a CSP with default-src 'none' and form-action 'self'",
    r6.h["cache-control"] === "no-store" && r6.h["referrer-policy"] === "no-referrer" && /default-src 'none'/.test(r6.h["content-security-policy"] ?? "") && /form-action 'self'/.test(r6.h["content-security-policy"] ?? ""), r6.h);
  const rU: ReturnType<typeof res> & { code?: number } = Object.assign(res(), { status(c: number) { rU.code = c; } });
  const unknown = String(ctrl.show(l6.doc, l6.signer, "B".repeat(43), rU));
  ok("FO-6 4c fake page: an unknown nonce is the one 404, as a readable page (\"This test link does not work.\"), never raw JSON", rU.code === 404 && unknown.includes("This test link does not work.") && unknown.startsWith("<!doctype html>"), { code: rU.code });
  const env = process.env.PLATFORM_ENVIRONMENT; process.env.PLATFORM_ENVIRONMENT = "production";
  const outside = await statusOf(() => ctrl.show(l6.doc, l6.signer, l6.nonce, res()));
  process.env.PLATFORM_ENVIRONMENT = env;
  ok("FO-6 4c fake page (plan m6): at request time outside local the page is the one 404, even with a live nonce", outside === 404, outside);
  useSigningPort({ ...q, provider: "BOLDSIGN" } as never);
  ok("FO-6 4c fake page (plan m6): with a port that is not the fake the page is the one 404", await statusOf(() => ctrl.show(l6.doc, l6.signer, l6.nonce, res())) === 404);
} finally { useSigningPort(was); }

process.exit(summary() ? 1 : 0);
