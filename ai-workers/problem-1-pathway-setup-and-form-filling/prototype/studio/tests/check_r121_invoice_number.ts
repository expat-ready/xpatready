// R1.21 follow-up (Lead 4, 22 Nov): our GST/HST registration number on our invoice to a firm, from the platform's own
// setting PLATFORM_GST_HST_NUMBER (labelled Sample while unset), and an old, unknown or wrong invoice link that opens a
// page in words (404), never raw JSON (review m8 on #2987). Each rule has a pass and a fail:
//   the setting: a plain shape loads; lower case, markup, a double space, too short or too long is refused, naming the
//     setting, never the value; unset is null. (Only a plain shape: the CRA's own format rule is not yet read and cited,
//     canada.ca being unreachable from a cloud lane; the Mac reads it, P-601 (5).)
//   the invoice: the number set prints as set; unset prints the Sample, labelled; markup in the number is never markup.
//   an old link: a wrong token, an unknown id, no token, or a server with no stand-in → the same page in words, 404,
//     HTML with the invoice page's headers, never JSON and never an attachment; the right link still opens the invoice.
// US$0; no Stripe call. Run from prototype/:
//   zsh studio/tools/isolated.sh r121num 4728 start PLATFORM_IDENTITY=local PLATFORM_GST_HST_NUMBER=000000001RT0001 && tsx studio/tests/check_r121_invoice_number.ts 4728 xr_studio_r121num
import "reflect-metadata";
import { fakeBilling } from "../ports/billing.ts";
import { ConfigRefused, loadPlatformConfig } from "../api/src/platform/config/settings.ts";
import { runtimeBillingPorts } from "../api/src/platform/firms/runtime-ports.ts";
import { BillingStandIn, BillingStandInPageController, gstHstLine, OLD_LINK_WORDS, SAMPLE_GST_HST_NUMBER } from "../api/src/platform/billing/stand-in.ts";
import { recorder } from "./runtime/api.ts";

const PORT = Number(process.argv[2] ?? 4728), BASE = `http://localhost:${PORT}`, SET = "000000001RT0001";
const { ok, summary } = recorder();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const run = Date.now().toString(36);

// ---------------------------------------------------------------------------------------------- the setting
const load = (v?: string) => { try { return loadPlatformConfig({ PLATFORM_ENVIRONMENT: "local", ...(v === undefined ? {} : { PLATFORM_GST_HST_NUMBER: v }) }); } catch (e) { return e as Error; } };
const good = ["123456789 RT 0001", "123456789RT0001", " 123456789 RT 0001 "].map((v) => load(v));
ok("R1.21 number: PLATFORM_GST_HST_NUMBER in a plain shape loads into the platform's settings (trimmed, as the loader trims every setting)", good.every((c) => !(c instanceof Error)) && (good[0] as { billing: { gstHstNumber: string } }).billing.gstHstNumber === "123456789 RT 0001" && (good[2] as { billing: { gstHstNumber: string } }).billing.gstHstNumber === "123456789 RT 0001");
const unset = load();
ok("R1.21 number: unset, the setting is null (the invoice then shows a Sample)", !(unset instanceof Error) && unset.billing.gstHstNumber === null);
const bads = ["123456789 rt 0001", "<b>123456789</b>", "123456789  RT 0001", "12345678", "1234567890 RT 0001 99999", "123456789-RT-0001"];
const refused = bads.map((v) => ({ v, e: load(v) }));
ok("R1.21 number fail: lower case, markup, a double space, too short, too long or other marks is refused, naming the setting and never the value",
  refused.every(({ v, e }) => e instanceof ConfigRefused && e.invalid.some((i) => i.name === "PLATFORM_GST_HST_NUMBER") && !e.message.includes(v.trim())), refused.map(({ v, e }) => `${JSON.stringify(v)}: ${e instanceof Error ? e.message.slice(0, 90) : "loaded"}`));
const passed = runtimeBillingPorts({ environment: "local", stripe: { secretKey: null, webhookSecret: null }, billing: { gstHstNumber: "123456789 RT 0001" } } as never, {});
ok("R1.21 number: the billing ports carry the number set to the stand-in; none set carries null", passed.gstHstNumber === "123456789 RT 0001" && runtimeBillingPorts({ environment: "local", stripe: { secretKey: null, webhookSecret: null } } as never, {}).gstHstNumber === null);
ok("R1.21 number: the invoice line says the number set, or the Sample labelled as not our real number", gstHstLine("123456789 RT 0001") === "GST/HST registration number: 123456789 RT 0001" && gstHstLine(null).includes(SAMPLE_GST_HST_NUMBER) && /Sample: not our real number/.test(gstHstLine(null)));

// ---------------------------------------------------------------------------------------------- the invoice, in process
const firmId = "33333333-3333-4333-8333-333333333333";
const db = {
  platformFirm: { findUniqueOrThrow: async () => ({ id: firmId, operatingName: "Sample <i>Firm</i>", businessAddress: { street_number: "1", street_name: "King St W", city: "Toronto", province_state: "ON", postal_code: "M5H 1A1" } }) },
  platformSubscription: { findFirst: async () => ({ billingPeriod: "MONTHLY", plan: { name: "Team", monthlyPriceCents: 9900, yearlyPriceCents: 99000, currency: "CAD" } }) },
};
const pageOf = async (n: string | null) => {
  const x = new BillingStandIn(db as never, { standIn: fakeBilling(), clock: { now: () => new Date("2026-11-22T12:00:00Z") }, appUrl: BASE, gstHstNumber: n });
  const issued = (await x.issue({ firmId } as never)) as { invoice: { id: string; hostedUrl: string } };
  return { x, id: issued.invoice.id, token: new URL(issued.invoice.hostedUrl).searchParams.get("t") ?? "", html: x.page(issued.invoice.id, new URL(issued.invoice.hostedUrl).searchParams.get("t") ?? "").html };
};
const withSet = await pageOf("123456789 RT 0001"), withSample = await pageOf(null), withMarkup = await pageOf("<script>x</script>");
ok("R1.21 number: the invoice prints our GST/HST registration number as set", /data-gst-hst-number>GST\/HST registration number: 123456789 RT 0001</.test(withSet.html));
ok("R1.21 number: with none set, the invoice prints the Sample number, labelled Sample", withSample.html.includes(`GST/HST registration number: ${SAMPLE_GST_HST_NUMBER} (Sample: not our real number)`));
ok("R1.21 number fail: markup in the number is printed as text, never as markup (the loader refuses it anyway)", !withMarkup.html.includes("<script>") && withMarkup.html.includes("&#60;script&#62;"));

// The page's controller on a fake response: an old link is the page in words, 404, HTML, never JSON.
type Sent = { status: number; headers: Record<string, string>; body: string };
const call = (x: BillingStandIn, id: string, t: string | undefined, download?: string): Sent => {
  const out: Sent = { status: 200, headers: {}, body: "" };
  const res = { setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; }, removeHeader: (k: string) => { delete out.headers[k.toLowerCase()]; }, status(s: number) { out.status = s; return res; }, send(b: string) { out.body = b; return res; } };
  new BillingStandInPageController(x as never).open(id, t, download, res as never);
  return out;
};
const isOldLinkPage = (s: Sent) => s.status === 404 && s.headers["content-type"]?.startsWith("text/html") && s.body.includes(OLD_LINK_WORDS) && s.body.includes('href="/settings/billing"') && !s.body.trim().startsWith("{") && !s.headers["content-disposition"] && s.headers["x-content-type-options"] === "nosniff" && s.headers["cache-control"] === "no-store";
const right = call(withSet.x, withSet.id, withSet.token);
ok("R1.21 old link: the right link still opens the invoice (200, with the number)", right.status === 200 && right.body.includes("123456789 RT 0001"));
const olds = { wrongToken: call(withSet.x, withSet.id, "wrong"), unknownId: call(withSet.x, "in_standin000000000000000000000000", withSet.token), noToken: call(withSet.x, withSet.id, undefined), downloadWrong: call(withSet.x, withSet.id, "wrong", "1") };
ok("R1.21 old link fail: a wrong token, an unknown id, no token, or a download with a wrong token → the same page in words (404, HTML, no attachment), never JSON", Object.values(olds).every(isOldLinkPage) && new Set(Object.values(olds).map((s) => s.body)).size === 1, Object.fromEntries(Object.entries(olds).map(([k, s]) => [k, `${s.status} ${s.headers["content-type"]} ${s.body.slice(0, 60)}`])));
const noStandIn = call(new BillingStandIn(db as never, { standIn: null, clock: { now: () => new Date() }, appUrl: BASE, gstHstNumber: null }), withSet.id, withSet.token);
ok("R1.21 old link fail: on a server with no stand-in, an invoice link is the same page in words (never says why)", isOldLinkPage(noStandIn) && noStandIn.body === olds.wrongToken.body);

// ---------------------------------------------------------------------------------------------- on the isolated copy
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the journeys
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const email = `owner.r121n.${run}@example.com`;
const pub = await j("GET", "/api/public/plans"); await wait(3300);
await j("POST", "/api/public/signup", { email, password: "Correct-horse-9!", firmName: `Sample Number ${run}`, countryCode: "CA", planCode: "team", acceptedTerms: (pub.body.terms ?? []).map((t: { id: string }) => t.id), formStamp: pub.body.formStamp });
let mail: { subject: string; body: string } | undefined;
for (let i = 0; i < 75 && !mail; i++) { await wait(200); mail = ((await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(email)}`)).body.messages ?? []).find((m: { subject: string }) => m.subject === "Your ExpatReady verification code"); }
const m = mail?.body.match(/sign-up\/verify#token=([A-Za-z0-9_-]{43})&code=(\d{6})/);
const made = m ? await j("POST", "/api/public/signup/verify", { token: m[1], code: m[2] }) : { status: 0, body: {} };
if (!made.body.firmKey) throw new Error("STOP  no firm from the sign-up door: the check needs it");
const signIn = await j("POST", "/api/platform/session/local", { firmKey: made.body.firmKey, email, secondStep: true });
const tok: string = signIn.body?.token ?? "";
if (!tok) throw new Error(`STOP  no staff session (${signIn.status}): the check needs it`);
await j("PUT", "/api/platform/billing/address", { street_number: "100", street_name: "King Street West", city: "Toronto", province_state: "ON", postal_code: "M5V 2T6" }, tok);
const issued = await j("POST", "/api/platform/billing/stand-in/invoice", {}, tok);
const link: string = issued.body?.invoice?.hostedUrl ?? "";
const opened = link ? await fetch(link) : null, html = opened ? await opened.text() : "";
ok(`R1.21 number (copy): the invoice opened from its link prints the number set on the server (${SET})`, issued.status === 200 && opened?.status === 200 && html.includes(`GST/HST registration number: ${SET}`) && !html.includes("Sample: not our real number"), { issued: issued.status, open: opened?.status ?? null });
const stale = link ? await fetch(link.replace(/t=[^&]+/, "t=an-old-token")) : null, staleText = stale ? await stale.text() : "";
const unknown = await fetch(`${BASE}/api/demo/billing/invoices/in_standinffffffffffffffffffffffff?t=x`), unknownText = await unknown.text();
ok("R1.21 old link fail (copy): an old or unknown invoice link opens the page in words (404, HTML), not raw JSON", stale?.status === 404 && /text\/html/.test(stale.headers.get("content-type") ?? "") && staleText.includes(OLD_LINK_WORDS) && unknown.status === 404 && unknownText.includes(OLD_LINK_WORDS) && !/^\s*\{/.test(staleText + unknownText), { stale: stale?.status ?? null, type: stale?.headers.get("content-type") ?? null, unknown: unknown.status });

process.exit(summary() ? 1 : 0);
