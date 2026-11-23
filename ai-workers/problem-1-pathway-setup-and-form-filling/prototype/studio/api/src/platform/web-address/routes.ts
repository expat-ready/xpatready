// PF-25: the public routes and the host routing's installation. Public (no sign-in): the availability check and the
// suggestion the sign-up field calls as a person types (PF-5's sign-up, PF-5s's field), on ExpatReady's own host only;
// and /api/public/site, which tells a public page on a firm's address which address it is on. PF-25w (R1.24): the
// staff-only change, `POST /api/system/firms/:id/web-address`, for ExpatReady's own staff with PF-4s's
// `system/firm:address` key (Platform Owner and Admin, Appendix A) and a written reason; no step-up (SA-7-10 does not
// list it). Its firm-trail line names our staff as `ourstaff:<id>` (AUD-3a).
import { Body, Controller, Get, HttpCode, HttpException, Inject, Injectable, Param, Post, Query, Req, Res } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { systemClock } from "../../../../ports/clock.ts";
import { Db, OpenRead } from "../../core.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { publicFirmOf, sendPublicNotFound, webAddressHost } from "./host.ts";
import { catchUpFirmAddresses, type CatchUpResult } from "./firm-created.ts";
import { ADDRESS_CHANGE_KEY, WebAddresses } from "./service.ts";
import { addressHostSuffixes } from "./rules.ts";
import { platformConfig } from "../config/settings.ts";
import { asBypass, touchingAudit, withFirm } from "../firm-scope.ts";
import { SystemKeys, SystemReason, systemStaffOf, type SystemStaffContext } from "../system-identity/keys.ts";
import { logPort } from "../observability/log.ts";
import { dbRuleOf } from "../observability/redact.ts";
import { parseInput, query } from "../http/input.ts";

/** The suggestion's one query key. */
const SUGGESTION_QUERY = query("name");
const AVAILABILITY_QUERY = query("address");

/** The service as the app uses it: the app's database, the interim audit adapter (PF-0p; AUD-1 swaps it), the real clock. */
export const webAddressesProvider = { provide: WebAddresses, useFactory: (db: Db) => new WebAddresses({ db, audit: auditEvent, clock: systemClock, hostSuffixes: addressHostSuffixes(platformConfig().addressSuffix) }), inject: [Db] };

/** Installs the host routing on the HTTP server when the app is built, so it runs before everything main.ts adds later
 *  (the body parser, the static files, the single-page app's catch-all) and before every controller. A provider rather
 *  than a line in main.ts: features add controllers and providers only (api/src/features/README.md). */
export class WebAddressHostRouting {
  constructor(host: HttpAdapterHost, addresses: WebAddresses) {
    const server = host.httpAdapter?.getInstance?.() as { use?: (fn: unknown) => unknown } | undefined;
    if (typeof server?.use !== "function") throw new Error("PF-25: the HTTP server is not ready, so firm web addresses cannot be routed");
    server.use(webAddressHost(addresses));
  }
}

/** At app start, every firm created while no one listened (a `firm.created` event with no address yet, and the Sample
 *  firms) gets its address (firm-created.ts). In the background: it never delays or stops the start, and a firm that
 *  fails is logged by id. `done` lets a test wait for it. */
export class WebAddressCatchUp {
  done: Promise<CatchUpResult | null> = Promise.resolve(null);
  constructor(private readonly db: Db) {}
  onApplicationBootstrap() {
    // PF-12b: each firm's address is set in its own transaction with its own audit line; its platform.bypass line goes first
    // in that transaction (a line that cannot be written rolls that firm back; it is listed as failed).
    this.done = asBypass("platform.web-address.catch-up", () => catchUpFirmAddresses(this.db, touchingAudit(auditEvent))).then((r) => {   // PF-12: every firm at once
      if (r.failed.length) console.warn(`PF-25: ${r.failed.length} firm(s) got no web address at start: ${r.failed.map((f) => f.firmId).join(", ")}`);
      return r;
    }, (e) => { logPort.error("web_address_catch_up_failed", e, { rule: dbRuleOf(e) }); return null; });
  }
}

type PublicReq = { path: string; publicFirm?: { firmId: string } };
type PublicRes = { status(code: number): PublicRes; setHeader(k: string, v: string): unknown; end(body?: string): unknown; json(body: unknown): unknown };

export class WebAddressController {
  constructor(private readonly addresses: WebAddresses, private readonly db: Db) {}

  /** Is this address free? `{ address, available }`, or the plain reason and a suggestion. */
  async availability(q: unknown, req: PublicReq, res: PublicRes) {
    if (publicFirmOf(req)) return sendPublicNotFound(req, res);
    const { address } = parseInput(AVAILABILITY_QUERY, q);   // PF-28 part 4 (listed there by the sweep's path rule): an unknown query key is refused 422, named
    res.setHeader("Cache-Control", "no-store");
    res.json(await this.addresses.availability(address));
  }

  /** A free address made from the firm's operating name. */
  async suggestion(q: unknown, req: PublicReq, res: PublicRes) {
    if (publicFirmOf(req)) return sendPublicNotFound(req, res);
    const { name } = parseInput(SUGGESTION_QUERY, q);   // PF-28 part 2b (R1.10): an unknown query key is refused 422, named
    res.setHeader("Cache-Control", "no-store");
    res.json(await this.addresses.suggest(name));
  }

  /** The address this public page is on (a firm's address only; elsewhere the plain not-found). */
  async site(req: PublicReq, res: PublicRes) {
    const firmId = publicFirmOf(req);
    const own = firmId ? await this.db.platformFirmWebAddress.findUnique({ where: { firmId }, select: { address: true } }) : null;
    if (!own) return sendPublicNotFound(req, res);
    res.setHeader("Cache-Control", "no-store");
    res.json({ webAddress: own.address });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PF-25w: ExpatReady's own staff change a firm's web address (SA-2-27). The system guard has checked the key and the
 *  reason and written its line; the change runs inside the firm's own scope (PF-12's walls see that one firm), and its
 *  line on the firm's trail names our staff as `ourstaff:<id>` (AUD-3a). An id that is not a firm's is the one 404. */
export class SystemWebAddressController {
  constructor(private readonly addresses: WebAddresses) {}
  async change(id: string, body: unknown, req: { systemStaff?: SystemStaffContext }) {
    const staff = systemStaffOf(req);
    if (!UUID.test(id)) throw new HttpException({ type: "https://expatready.local/problems/not-found", title: "Not found", status: 404, detail: "No such firm.", code: "NOT_FOUND" }, 404);
    const input = (body !== null && typeof body === "object" && !Array.isArray(body) ? body : {}) as { address?: unknown; reason?: unknown };
    return withFirm(id, () => this.addresses.change(staff, id, { address: input.address, reason: input.reason }, `ourstaff:${staff.staffId}`));
  }
}

// Decorators as calls (this folder is outside api/tsconfig.json's decorator files, as PF-4's identity/guard.ts).
Injectable()(WebAddressHostRouting);
Injectable()(WebAddressCatchUp);
Inject(Db)(WebAddressCatchUp, undefined, 0);
[HttpAdapterHost, WebAddresses].forEach((token, i) => Inject(token)(WebAddressHostRouting, undefined, i));
Controller("api/public")(WebAddressController);
[WebAddresses, Db].forEach((token, i) => Inject(token)(WebAddressController, undefined, i));
const SIGN_UP = "a person choosing their firm's web address at sign-up, before they have an account";
const route = (method: "availability" | "suggestion" | "site", path: string, why: string, params: ((t: object, k: string, i: number) => void)[]) => {
  const proto = WebAddressController.prototype, d = Object.getOwnPropertyDescriptor(proto, method)!;
  Get(path)(proto, method, d);
  OpenRead(why)(proto, method, d);
  params.forEach((p, i) => p(proto, method, i));
};
route("availability", "web-address/availability", SIGN_UP, [Query(), Req(), Res()]);
route("suggestion", "web-address/suggestion", SIGN_UP, [Query(), Req(), Res()]);   // PF-28 part 2b: the whole query, read through the rule
route("site", "site", "someone on a firm's public page, who has no account", [Req(), Res()]);
Controller("api/system/firms")(SystemWebAddressController);
Inject(WebAddresses)(SystemWebAddressController, undefined, 0);
{
  const proto = SystemWebAddressController.prototype, d = Object.getOwnPropertyDescriptor(proto, "change")!;
  Post(":id/web-address")(proto, "change", d);
  HttpCode(200)(proto, "change", d);
  SystemKeys(ADDRESS_CHANGE_KEY)(proto, "change", d);
  SystemReason()(proto, "change", d);
  [Param("id"), Body(), Req()].forEach((p, i) => p(proto, "change", i));
}
