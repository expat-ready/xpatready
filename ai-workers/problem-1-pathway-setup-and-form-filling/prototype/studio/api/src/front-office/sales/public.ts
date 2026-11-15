// FO-2 (contracts §0.6 public doors, §2.1, §7 §2.1; AG-2-5 the web form, AG-2-49 the door's protections): the firm's
// enquiry form, open to anyone. GET /api/public/forms/:token is an open read (OpenRead): the form's words, its
// "Interested in" list, a fresh submissionId and a signed load stamp, with `frame-ancestors` naming the firm's allowed
// sites. POST …/submissions: size first (32 KB), then the limits (30 a minute per address, 60 a minute per form token;
// AG-2-49 rule 1), the token (an unknown token and a form that is off give one answer, "This form is not available"),
// the allowed site (the Origin), a strict body, then the honeypot and the minimum fill time of 2 seconds measured on the
// server from the signed stamp (a bot is answered like anyone else and nothing is stored), then the arrival path in one
// transaction. The answer is the form's thank-you text, the same whether or not the person is known (AG-2-5 rule 10).
// Limits, used stamps and the stamp's key live in this process (sized for about 100 firms, P-562); the key is
// FO_FORM_STAMP_KEY when set, else random per process (a restart asks open pages to reload).
import { Body, Controller, Get, HttpCode, Inject, Injectable, Param, Post, Req, Res } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ConsentPort } from "../../../../ports/consent.ts";
import { Db, OpenRead } from "../../core.ts";
import { problem } from "../../platform/identity/keys.ts";
import { arrive, type Attribution } from "./arrival.ts";
import { email, phone, text, UUID, type Tx } from "./common.ts";

export const SALES_PORTS = "FO2_SALES_PORTS";
export type SalesPorts = {
  audit: AuditPort<Tx>; consent: ConsentPort<Tx>;
  now?: () => number;
  formKey?: Buffer;
  /** Our own origin, where the hosted form page lives (always allowed). */
  publicOrigin?: string;
  limits?: Partial<typeof LIMITS>;
};
/** AG-2-49 rule 1 (starting defaults, "the tests check these defaults"), rule 2 (32 KB), rule 3 (2 seconds). Reads are
 *  limited per address only (a per-firm read cap let a few addresses close a firm's page, FO-3 break R2-1). */
export const LIMITS = { postsPerIp: 30, postsPerForm: 60, readsPerIp: 120, windowSeconds: 60, minFillSeconds: 2, maxBytes: 32 * 1024, stampHours: 24 };

const unavailable = () => problem(404, "Not available", "This form is not available.", { code: "FORM_NOT_AVAILABLE" });
const tooMany = () => problem(429, "Too many requests", "Too many requests. Please wait a minute and try again.", { code: "TOO_MANY_REQUESTS" });
const badBody = () => problem(400, "Not sent", "We could not read this form. Please reload the page and try again.", { code: "BAD_REQUEST" });
const offSite = () => problem(403, "Not sent", "This form cannot be sent from this page.", { code: "SITE_NOT_ALLOWED" });
const tooBig = () => problem(413, "Too large", "This form is too long. Please shorten your message and try again.", { code: "TOO_LARGE" });

const BODY_KEYS = new Set(["givenNames", "familyName", "email", "phone", "interestedIn", "message", "consent", "submissionId", "loadStamp", "website", "attribution"]);
const ATTRIBUTION_KEYS = ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "clickId", "clickIdKind", "landingPage", "referrerUrl"] as const;
const CLICK_KINDS = new Set(["GCLID", "FBCLID", "MSCLKID", "TTCLID", "OTHER"]);

/** A site as the form stores and the browser sends it: scheme, host and port, lower case, no path. */
export const siteOf = (s: string): string | null => { try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.origin.toLowerCase() : null; } catch { return null; } };

type Req = { ip?: string; socket?: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): unknown };
const header = (r: Req, n: string) => { const h = r.headers[n]; return Array.isArray(h) ? h[0] : h; };
const ipOf = (r: Req) => String(r.ip ?? r.socket?.remoteAddress ?? "unknown").slice(0, 64);

@Injectable()
export class PublicForms {
  private readonly hits = new Map<string, number[]>();
  private readonly limits: typeof LIMITS;
  private readonly key: Buffer;
  private readonly now: () => number;
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {
    this.limits = { ...LIMITS, ...ports.limits };
    this.key = ports.formKey ?? (process.env.FO_FORM_STAMP_KEY ? Buffer.from(process.env.FO_FORM_STAMP_KEY) : randomBytes(32));
    this.now = ports.now ?? Date.now;
  }

  /** The form and its words, for drawing it (open read). Sets `frame-ancestors` to the firm's allowed sites. */
  async read(token: string, req: Req, res?: Res) {
    this.limit(`read:ip:${ipOf(req)}`, this.limits.readsPerIp);
    const form = await this.form(token);
    res?.setHeader("Content-Security-Policy", frameAncestors(form.allowedSites, this.ports.publicOrigin));
    const [services, wording] = await Promise.all([
      this.db.foService.findMany({ where: { firmId: form.firmId, active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, label: true } }),
      form.consentWordingVersionId ? this.db.msgConsentWording.findFirst({ where: { firmId: form.firmId, id: form.consentWordingVersionId }, select: { text: true } }) : null,
    ]);
    const submissionId = randomUUID();
    return {
      name: form.name, thankYouText: form.thankYouText,
      fields: ["givenNames", "familyName", "email", "phone", "interestedIn", "message", "consent"],
      interestedIn: services, consentText: wording?.text ?? null,
      submissionId, loadStamp: this.stamp(form.id, submissionId, this.now()),
    };
  }

  /** One enquiry (AG-2-5 rule 10, AG-2-49). */
  async submit(token: string, body: unknown, req: Req) {
    const length = Number(header(req, "content-length") ?? 0);
    if (length > this.limits.maxBytes || Buffer.byteLength(JSON.stringify(body ?? null)) > this.limits.maxBytes) return tooBig();
    const ip = ipOf(req);
    this.limit(`post:ip:${ip}`, this.limits.postsPerIp);
    this.limit(`post:form:${String(token).slice(0, 100)}`, this.limits.postsPerForm);
    const form = await this.form(token);
    const origin = siteOf(header(req, "origin") ?? "");
    const allowed = new Set([...form.allowedSites.map(siteOf), siteOf(this.ports.publicOrigin ?? "")].filter(Boolean));
    if (!origin || !allowed.has(origin)) return offSite();
    const b = body as Record<string, unknown>;
    if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some((k) => !BODY_KEYS.has(k))) return badBody();
    if (typeof b.submissionId !== "string" || !UUID.test(b.submissionId) || typeof b.loadStamp !== "string") return badBody();
    const thanks = { thankYouText: form.thankYouText };
    // A bot (the honeypot filled, a stamp not ours, or sent faster than a person fills the form) is answered like anyone
    // else, and nothing is stored (AG-2-49 rules 3, 7).
    if ((b.website !== undefined && b.website !== "") || !this.stampOk(form.id, b.submissionId, b.loadStamp)) return thanks;
    const person = {
      givenNames: text(b.givenNames, { field: "givenNames", what: "First name", max: 100, required: true }),
      familyName: text(b.familyName, { field: "familyName", what: "Last name", max: 100 }),
      email: email(b.email), phone: phone(b.phone),
    };
    if (!person.email && !person.phone) problem(422, "Check the details", "Add an email or a phone number.", { code: "INVALID", fields: { email: "Add an email or a phone number." } });
    const message = text(b.message, { field: "message", what: "Message", max: 5000, multiline: true });
    let interestedInServiceId: string | null = null;
    if (b.interestedIn !== undefined && b.interestedIn !== null && b.interestedIn !== "") {
      const s = typeof b.interestedIn === "string" && UUID.test(b.interestedIn) ? await this.db.foService.findFirst({ where: { firmId: form.firmId, id: b.interestedIn, active: true }, select: { id: true } }) : null;
      if (!s) problem(422, "Check the details", "Choose what you are interested in from the list.", { code: "INVALID", fields: { interestedIn: "Choose from the list." } });
      interestedInServiceId = s!.id;
    }
    if (b.consent !== undefined && typeof b.consent !== "boolean") return badBody();
    const attribution = attributionOf(b.attribution);
    const wording = b.consent === true && form.consentWordingVersionId
      ? await this.db.msgConsentWording.findFirst({ where: { firmId: form.firmId, id: form.consentWordingVersionId }, select: { id: true, channel: true, purpose: true, locale: true } }) : null;
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    await this.db.$transaction((tx) => arrive(tx, {
      firmId: form.firmId, door: "WEB_FORM", intakeKey: `form:${form.id}:${b.submissionId!.toString().toLowerCase()}`, webFormId: form.id,
      person, source: form.source, sourceDetail: form.name, interestedInServiceId, message, attribution,
      consent: wording ? { wordingId: wording.id, channel: wording.channel, purpose: wording.purpose, locale: wording.locale } : null,
      ipHash: createHmac("sha256", this.key).update(ip).digest("hex"),
      actor: "system:web-form", payloadHash: hash(JSON.stringify([person, message, interestedInServiceId, b.consent === true, attribution])),
    }, this.ports));
    return thanks;
  }

  private async form(token: unknown) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{22,100}$/.test(token)) return unavailable();
    const f = await this.db.foWebForm.findUnique({ where: { publicToken: token } });
    if (!f || !f.enabled) return unavailable();
    const firm = await this.db.platformFirm.findUnique({ where: { id: f.firmId }, select: { status: true } });
    if (!firm || !["TRIAL", "ACTIVE"].includes(firm.status)) return unavailable();
    return f;
  }

  /** A rolling one-minute limit per key (counted on every request, refused or not; AG-2-49 rule 1). */
  private limit(key: string, max: number) {
    const now = this.now(), since = now - this.limits.windowSeconds * 1000;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= max) { this.hits.set(key, list); return tooMany(); }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 50_000) for (const [k, v] of this.hits) if (!v.some((t) => t > since)) this.hits.delete(k);
  }

  /** `<ms>.<hmac>` over the form, the submission id and the time the form was drawn. */
  stamp(formId: string, submissionId: string, at: number) { return `${at}.${this.mac(formId, submissionId, String(at))}`; }
  private mac(formId: string, submissionId: string, ms: string) { return createHmac("sha256", this.key).update(`${formId}|${submissionId.toLowerCase()}|${ms}`).digest("base64url"); }
  private stampOk(formId: string, submissionId: string, stamp: string) {
    const [ms, mac, extra] = stamp.split(".");
    if (!/^\d{1,15}$/.test(ms ?? "") || !mac || extra !== undefined) return false;
    const want = Buffer.from(this.mac(formId, submissionId, ms)), have = Buffer.from(mac);
    if (have.length !== want.length || !timingSafeEqual(have, want)) return false;
    const age = this.now() - Number(ms);
    return age >= this.limits.minFillSeconds * 1000 && age <= this.limits.stampHours * 3_600_000;
  }
}

/** The CSP that lets only the firm's allowed sites (and our own page) show the form in a frame (AG-2-49 rule 4). */
export function frameAncestors(sites: string[], own?: string) {
  const list = [...new Set(sites.map(siteOf).filter((s): s is string => !!s))];
  return `frame-ancestors 'self'${own && siteOf(own) ? ` ${siteOf(own)}` : ""}${list.map((s) => ` ${s}`).join("")}`;
}

/** The page's campaign facts as sent; absent facts stay empty, nothing is guessed (AG-2-8a). */
function attributionOf(v: unknown): Attribution | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v) || Object.keys(v).some((k) => !(ATTRIBUTION_KEYS as readonly string[]).includes(k))) return badBody();
  const a: Attribution = {};
  for (const k of ATTRIBUTION_KEYS) {
    const x = (v as Record<string, unknown>)[k];
    if (x === undefined || x === null || x === "") continue;
    if (k === "clickIdKind") { if (typeof x !== "string" || !CLICK_KINDS.has(x)) return badBody(); a.clickIdKind = x as Attribution["clickIdKind"]; continue; }
    const t = text(x, { field: `attribution.${k}`, what: k, max: k === "landingPage" || k === "referrerUrl" ? 2000 : 200 });
    if (t) a[k] = t;
  }
  return Object.keys(a).length ? a : null;
}

@Controller("api/public/forms")
export class PublicFormsController {
  constructor(@Inject(PublicForms) private readonly forms: PublicForms) {}

  @Get(":token") @OpenRead("the firm's public enquiry form: its words, a submission id and load stamp (contracts §0.6, §7 §2.1)")
  read(@Param("token") token: string, @Req() req: Req, @Res({ passthrough: true }) res: Res) { return this.forms.read(token, req, res); }

  @Post(":token/submissions") @HttpCode(201)
  submit(@Param("token") token: string, @Body() body: unknown, @Req() req: Req) { return this.forms.submit(token, body, req); }
}
