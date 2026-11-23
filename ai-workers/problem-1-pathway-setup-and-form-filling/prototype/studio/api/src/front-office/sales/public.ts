// FO-2 (contracts §0.6, §2.1, §7 §2.1; AG-2-5, AG-2-49): the firm's enquiry form, open to anyone. GET …/forms/:token
// (OpenRead): the form's words, "Interested in", a fresh submissionId and signed load stamp, `frame-ancestors`. POST
// …/submissions: the limits (30/min per address, 60 per token), 32 KB (also at the door), the token, the site (Origin), a
// strict body, the honeypot and 2-second fill (answered like anyone, nothing stored; a stamp not ours → reload), then the
// arrival path; the answer is the thank-you text, known person or not. Limits and stamp key (FO_FORM_STAMP_KEY, else random) in-process.
// FO-4b: the read, the send and the send's pre-flight (embed.ts) carry CORS headers for the form's allowed sites only (corsFor).
import { Body, Controller, Get, HttpCode, Inject, Injectable, Param, Post, Req, Res } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { NestExpressApplication } from "@nestjs/platform-express";
import express, { type NextFunction, type Request, type Response } from "express";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { ConsentPort } from "../../../../ports/consent.ts";
import { Db, OpenRead } from "../../core.ts";
import { z } from "zod";
import { parseInput, strict } from "../../platform/http/input.ts";
import { problem } from "../../platform/identity/keys.ts";
import { enterFirm, withFirm } from "../../platform/firm-scope.ts";
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
/** AG-2-49 rules 1-3 (its own defaults); reads limited per address only (FO-3 break R2-1). */
export const LIMITS = { postsPerIp: 30, postsPerForm: 60, readsPerIp: 120, windowSeconds: 60, minFillSeconds: 2, maxBytes: 32 * 1024, stampHours: 24 };

const unavailable = () => problem(404, "Not available", "This form is not available.", { code: "FORM_NOT_AVAILABLE" });
const tooMany = () => problem(429, "Too many requests", "Too many requests. Please wait a minute and try again.", { code: "TOO_MANY_REQUESTS" });
const badBody = () => problem(400, "Not sent", "We could not read this form. Please reload the page and try again.", { code: "BAD_REQUEST" });
const offSite = () => problem(403, "Not sent", "This form cannot be sent from this page.", { code: "SITE_NOT_ALLOWED" });
const tooBig = () => problem(413, "Too large", "This form is too long. Please shorten your message and try again.", { code: "TOO_LARGE" });

const ATTRIBUTION_KEYS = ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "clickId", "clickIdKind", "landingPage", "referrerUrl"] as const;
/** PF-28 part 3b (R1.10): the post through a strict schema (an unknown field 422, named; outer bounds, the 32 KB parser
 *  caps the whole), after the door's own limits, form lookup and site check, so a miss is still the one not-found. The
 *  submission id and load stamp are always needed. `website` (the trap field) takes any value: a bot still learns nothing.
 *  Attribution is captured, cut and never refused for length (attributionOf). Every other rule stays in submit. */
const s = (max: number) => z.string().max(max).nullish();
const PUBLIC_BODY = strict({ givenNames: s(1000), familyName: s(1000), email: s(1000), phone: s(1000), interestedIn: s(100), message: s(20_000),
  consent: z.boolean().optional(), submissionId: z.string().max(100), loadStamp: z.string().max(500), website: z.unknown().optional(),
  attribution: strict(Object.fromEntries(ATTRIBUTION_KEYS.map((k) => [k, z.string().max(40_000).nullish()]))).nullish() });   // 40 000 > the 32 KB parser: never refused for length (break m1)
const CAPTURED_JUNK = /[\u0000-\u001f\u007f\u00ad\u034f\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u2069\u3164\ufeff\u{e0000}-\u{e007f}]/gu;
/** At most `max` characters (what text() measures), never splitting one; normalised first so it cannot grow (break M4). */
const cut = (v: string, max: number) => [...v].slice(0, max).join("");
const CLICK_KINDS = new Set(["GCLID", "FBCLID", "MSCLKID", "TTCLID", "OTHER"]);

/** A site as the form stores and the browser sends it: scheme, host and port, lower case, no path. */
export const siteOf = (s: string): string | null => { try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.origin.toLowerCase() : null; } catch { return null; } };

type Req = { ip?: string; socket?: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> };
type Res = { setHeader(name: string, value: string): unknown; removeHeader?(name: string): unknown };
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
    openRefusals(res);
    this.limit(`read:ip:${ipOf(req)}`, this.limits.readsPerIp);
    const form = await this.form(token);
    res?.setHeader("Content-Security-Policy", frameAncestors(form.allowedSites, this.ports.publicOrigin));
    res?.setHeader("Cache-Control", "no-store");   // a fresh submissionId and stamp each draw (review m7)
    this.corsFor(form, req, res);   // FO-4b: the embed script on an allowed site may read it; any other site cannot
    const [services, wording] = await Promise.all([
      this.db.foService.findMany({ where: { firmId: form.firmId, active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, label: true } }),
      form.consentWordingVersionId ? this.db.msgConsentWording.findFirst({ where: { firmId: form.firmId, id: form.consentWordingVersionId }, select: { text: true } }) : null,
    ]);
    const submissionId = randomUUID();
    return {
      name: form.name, thankYouText: form.thankYouText,
      fields: ["givenNames", "familyName", "email", "phone", "interestedIn", "message", "consent"],
      interestedIn: services, consentText: wording?.text ?? null,
      submissionId, loadStamp: this.stamp(form.id, submissionId, this.now(), form.consentWordingVersionId),
    };
  }

  /** One enquiry (AG-2-5 rule 10, AG-2-49). */
  async submit(token: string, body: unknown, req: Req, res?: Res) {
    openRefusals(res);
    const ip = ipOf(req);
    this.limit(`post:ip:${ip}`, this.limits.postsPerIp);
    this.limit(`post:form:${String(token).slice(0, 100)}`, this.limits.postsPerForm);
    // A body nested too deep to measure (thousands of [ … ]) overflows JSON.stringify: it is unreadable, never a 500 (PF-28 part 3b, break M1).
    let bytes: number; try { bytes = Buffer.byteLength(JSON.stringify(body ?? null)); } catch { return badBody(); }
    if (Number(header(req, "content-length") ?? 0) > this.limits.maxBytes || bytes > this.limits.maxBytes) return tooBig();
    const form = await this.form(token);
    if (!this.corsFor(form, req, res)) return offSite();
    // A "__proto__" inside attribution is refused like any other unknown key (the schema's copy would drop it; break m2).
    const at = (body as { attribution?: unknown } | null)?.attribution;
    if (at !== null && typeof at === "object" && Object.hasOwn(at, "__proto__")) return problem(422, "Check the details", "One field needs a change: attribution.__proto__: This field is not allowed here. Nothing was saved.", { code: "INVALID", fields: { "attribution.__proto__": "This field is not allowed here." } });
    const b: Record<string, unknown> = parseInput(PUBLIC_BODY, body ?? {});
    if (typeof b.submissionId !== "string" || !UUID.test(b.submissionId) || typeof b.loadStamp !== "string") return badBody();
    const thanks = { thankYouText: form.thankYouText };
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
    // After the field checks (break m1): honeypot or too fast → thanks, nothing stored; a stamp not ours or a day old → reload (break M1).
    const stamp = this.stampOf(form.id, b.submissionId, b.loadStamp, form.consentWordingVersionId);   // a changed wording → reload (Devin)
    if (stamp === "stale") return problem(400, "Not sent", "This page is out of date. Please reload it and send the form again.", { code: "RELOAD" });
    if ((b.website !== undefined && b.website !== "") || stamp === "fast") return thanks;
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

  /** FO-4b: a send from the embed script on the firm's own site is pre-flighted by the browser: an allowed site is told
   *  POST with a JSON body may come (no credentials, ever); any other site is refused like its send would be. */
  async preflight(token: string, req: Req, res: Res) {
    this.limit(`read:ip:${ipOf(req)}`, this.limits.readsPerIp);
    const form = await this.form(token);
    if (!this.corsFor(form, req, res)) return offSite();
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "content-type, accept");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  /** The browser's Origin is one of the form's allowed sites or our own (AG-2-49 rule 4). When it is, the answer may be
   *  read by that site's page (FO-4b's embed script, CORS without credentials); otherwise no CORS header is sent. */
  private corsFor(form: { allowedSites: string[] }, req: Req, res?: Res): boolean {
    res?.setHeader("Vary", "Origin");
    const origin = siteOf(header(req, "origin") ?? "");
    const allowed = new Set([...form.allowedSites.map(siteOf), siteOf(this.ports.publicOrigin ?? "")].filter(Boolean));
    if (!origin || !allowed.has(origin)) { res?.removeHeader?.("Access-Control-Allow-Origin"); return false; }
    res?.setHeader("Access-Control-Allow-Origin", origin);
    return true;
  }

  private async form(token: unknown) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{22,100}$/.test(token)) return unavailable();
    // PF-12b part 2: the form's firm through the narrow definer lookup (its id only), then the form is read as that firm.
    const firmId = (await this.db.$queryRaw<{ f: string | null }[]>`select fo_sales_web_form_firm(${token}) as f`)[0]?.f;
    const f = firmId ? await withFirm(firmId, () => this.db.foWebForm.findUnique({ where: { publicToken: token } })) : null;
    if (f) enterFirm(f.firmId);   // PF-12: the form's firm, for the rest of the request
    const firm = f?.enabled ? await this.db.platformFirm.findUnique({ where: { id: f.firmId }, select: { status: true } }) : null;
    return f && firm && ["TRIAL", "ACTIVE"].includes(firm.status) ? f : unavailable();
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

  /** `<ms>.<hmac>` over the form, the submission id, the time the form was drawn and the consent wording it showed. */
  stamp(formId: string, submissionId: string, at: number, wording: string | null) { return `${at}.${this.mac(formId, submissionId, String(at), wording)}`; }
  private mac(formId: string, sub: string, ms: string, wording: string | null) { return createHmac("sha256", this.key).update(`${formId}|${sub.toLowerCase()}|${ms}|${wording ?? ""}`).digest("base64url"); }
  private stampOf(formId: string, submissionId: string, stamp: string, wording: string | null): "ok" | "fast" | "stale" {
    const [ms, mac, extra] = stamp.split(".");
    if (!/^\d{1,15}$/.test(ms ?? "") || !mac || extra !== undefined) return "stale";
    const want = Buffer.from(this.mac(formId, submissionId, ms, wording)), have = Buffer.from(mac);
    if (have.length !== want.length || !timingSafeEqual(have, want)) return "stale";
    const age = this.now() - Number(ms);
    return age > this.limits.stampHours * 3_600_000 ? "stale" : age < this.limits.minFillSeconds * 1000 ? "fast" : "ok";
  }
}

/** AG-2-49 rule 2: the door's own 32 KB JSON parser before the app's 5 MB one (main.ts hook): refused as it is read. */
export function publicFormBodyLimit(app: Pick<express.Express, "use"> | Pick<NestExpressApplication, "use">) {
  (app as Pick<express.Express, "use">).use("/api/public/forms", express.json({ limit: LIMITS.maxBytes }), (err: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (err?.type !== "entity.too.large") return next(err);
    res.status(413).type("application/problem+json").json({ type: "https://expatready.local/problems/too-large", title: "Too large", status: 413, detail: "This form is too long. Please shorten your message and try again.", code: "TOO_LARGE" });
  });
}

/** FO-4b (break R1): the door's generic refusals made before the form is known (too many requests, too large, not
 *  available: the same words for every firm and token, no credentials, no data) may be read by any page, so the embed
 *  script tells "the form is off" or "wait a minute" from a lost connection instead of guessing. corsFor takes the
 *  header away again, or names the one site, once the form is known: a form's own answers stay its allowed sites'. */
function openRefusals(res?: Res) { res?.setHeader("Access-Control-Allow-Origin", "*"); }

/** Only the allowed sites and our own page may frame the form (AG-2-49 rule 4). */
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
    const max = k === "landingPage" || k === "referrerUrl" ? 2000 : 200;   // captured, not typed: cut to length, never refused (Devin)
    // Captured, not typed: control and invisible marks dropped, cut by characters (never mid-emoji), never refused (break n3, n4).
    const t = text(typeof x === "string" ? cut(x.normalize("NFC").replace(CAPTURED_JUNK, ""), max) : x, { field: `attribution.${k}`, what: k, max });
    if (t) a[k] = t;
  }
  return Object.keys(a).length ? a : null;
}

@Controller("api/public/forms")
export class PublicFormsController {
  constructor(@Inject(PublicForms) private readonly forms: PublicForms) {}

  @OpenRead("the firm's public enquiry form: its words, a submission id and load stamp, contracts §0.6") @Get(":token")   // QA-53 REVIEWED
  read(@Param("token") token: string, @Req() req: Req, @Res({ passthrough: true }) res: Res) { return this.forms.read(token, req, res); }

  @Post(":token/submissions") @HttpCode(201)
  submit(@Param("token") token: string, @Body() body: unknown, @Req() req: Req, @Res({ passthrough: true }) res: Res) { return this.forms.submit(token, body, req, res); }
}
