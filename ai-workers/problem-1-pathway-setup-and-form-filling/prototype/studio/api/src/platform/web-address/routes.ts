// PF-25: the public routes and the host routing's installation. Public (no sign-in): the availability check and the
// suggestion the sign-up field calls as a person types (PF-5's sign-up, PF-5s's field), on ExpatReady's own host only;
// and /api/public/site, which tells a public page on a firm's address which address it is on. The staff-only change has
// no route yet: it is wired with PF-4s's `system/firm:address` key (PF-17's console) once PF-4s is on main; until then
// WebAddresses.change is the service, tested with a StaffContext fake.
import { Controller, Get, Inject, Injectable, Query, Req, Res } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { systemClock } from "../../../../ports/clock.ts";
import { Db, OpenRead } from "../../core.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { publicFirmOf, sendPublicNotFound, webAddressHost } from "./host.ts";
import { catchUpFirmAddresses, type CatchUpResult } from "./firm-created.ts";
import { WebAddresses } from "./service.ts";
import { addressHostSuffixes } from "./rules.ts";
import { platformConfig } from "../config/settings.ts";
import { asBypass, touchingAudit } from "../firm-scope.ts";
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
