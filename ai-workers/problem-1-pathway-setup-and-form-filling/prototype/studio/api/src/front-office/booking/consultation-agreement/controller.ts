// FO-3c: the consultation agreement's routes. Staff routes sit behind PF-4's guard (default deny); the client's door is
// under /api/public (its emailed link's token is the key; one identical not-found otherwise). The service answers 404 for
// another firm's agreement, booking or person. Decorators in @ form: api/tsconfig.json compiles them for src/front-office/**.
import { Body, Controller, Get, HttpCode, HttpException, Inject, Injectable, Optional, Param, Post, Req, Res, type OnModuleInit } from "@nestjs/common";
import type { Response } from "express";
import { FileLinks, LocalFiles } from "../../files.ts";
import { systemClock } from "../../../../../ports/clock.ts";
import type { FilesPort } from "../../../../../ports/files.ts";
import type { JobPort } from "../../../../../ports/jobs.ts";
import type { MailPort } from "../../../../../ports/mail.ts";
import { Db } from "../../../core.ts";
import { auditEvent } from "../../../platform/audit/audit-event.ts";
import { AnyStaff, PermissionKeys, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { PlatformJobs } from "../../../platform/jobs/platform-jobs.ts";
import { idParam, parseInput, strict, text } from "../../../platform/http/input.ts";
import { z } from "zod";
import { fakeSigning, type SigningPort } from "../../signing/port.ts";
import { ConsultationAgreementService, type AgreementPorts } from "./service.ts";
import { Booking } from "../public.controller.ts";

/** The ports as given: a test names them all; the running app leaves `jobs` to PF-14's runner. */
export const CONSULTATION_AGREEMENT_PORTS = "FO3C_CONSULTATION_AGREEMENT_PORTS";
export type GivenAgreementPorts = Omit<AgreementPorts, "jobs"> & { jobs?: JobPort };
/** The running app's ports. Signing is the fake, the only SigningPort adapter on main (FO-6v swaps the vendor's in: J-104). */
export function runtimeAgreementPorts(mail: MailPort, files: FilesPort, signing: SigningPort = fakeSigning()): GivenAgreementPorts {
  return { audit: auditEvent, clock: systemClock, mail, files, signing, publicBaseUrl: process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}` };
}

@Injectable()
export class ConsultationAgreements extends ConsultationAgreementService implements OnModuleInit {
  constructor(@Inject(Db) db: Db, @Inject(CONSULTATION_AGREEMENT_PORTS) ports: GivenAgreementPorts, @Optional() @Inject(PlatformJobs) runner?: PlatformJobs | null,
    @Optional() @Inject(Booking) bookings?: Booking | null) {
    const jobs = ports.jobs ?? runner;
    if (!jobs) throw new Error("FO-3c consultation agreement: no JobPort (PF-14's PlatformJobs is not registered, and the ports name none)");
    // FO-3c part 2 (Lead 10, FO-3vr): the reads follow the booking's visibility (the booking service's own staffBooking).
    super(db, { ...ports, jobs, seeBooking: ports.seeBooking ?? (bookings ? (ctx, id) => bookings.staffBooking(ctx, id) : undefined) });
  }
  async onModuleInit() { await this.registerJobs(); }
}

type R = { platform?: StaffContext };
/** PF-28's one input rule: each body through a strict schema before any lookup (an unknown, wrong or missing field → 422). */
export const HostLinkBody = strict({ consent: z.literal(true) });
export const OpenBody = strict({ token: text(200).min(1), consent: z.boolean().optional(), code: text(12).optional(), resend: z.boolean().optional() });
const READ = "agent/booking:list";
const SIGNS = "only the person the agreement names signs for the firm; the service checks it (403) and answers 404 for another firm's";

@Controller("api/front-office/consultation-agreements")
export class ConsultationAgreementController {
  constructor(@Inject(ConsultationAgreements) private readonly a: ConsultationAgreements, @Inject(FileLinks) private readonly links: FileLinks, @Inject(LocalFiles) private readonly files: LocalFiles) {}

  @Get("template-check") @PermissionKeys("agent/booking-event-type:list")
  templateCheck(@Req() r: R) { return this.a.templateCheck(staffOf(r)); }
  @Get("needs-you") @AnyStaff("a person's own unsigned agreements: the ones they sign for the firm")
  needsYou(@Req() r: R) { return this.a.needsYou(staffOf(r)); }
  /** Part 2 (FO-3vr): the booking's host always, anyone else by the list key and the record rule (the service checks; 404). */
  @Get("by-booking/:bookingId") @AnyStaff("the booking's host, or the list key and the booking's record rule; the service answers 404 otherwise")
  forBooking(@Req() r: R, @Param("bookingId") id: string) { return this.a.forBooking(staffOf(r), id); }
  @Get("by-person/:personId") @PermissionKeys(READ)
  forPerson(@Req() r: R, @Param("personId") id: string) { return this.a.forPerson(staffOf(r), id); }
  /** Part 2: the signed copy, through a short-lived link for the person who asked (BR-15; FO-5's FileLinks). */
  @Post(":id/signed-copy/download-link") @HttpCode(200) @PermissionKeys(READ)
  async copyLink(@Req() r: R, @Param("id") id: string) {
    const ctx = staffOf(r), key = await this.a.signedCopyKey(ctx, idParam(id, "agreement"));
    const l = this.links.sign(ctx.firmId, ctx.staffId, key, systemClock.now().getTime());
    return { url: `/api/front-office/consultation-agreements/files/${l.token}`, expiresAt: l.expiresAt };
  }
  /** The file a link names: another firm's, another person's or an altered link is 404, an expired one 410; the person
   *  must still see the agreement's booking. */
  @Get("files/:token") @PermissionKeys(READ)
  async copy(@Req() r: R, @Param("token") token: string, @Res() res: Response) {
    const ctx = staffOf(r), c = this.links.check(token, ctx.firmId, ctx.staffId, systemClock.now().getTime());
    const gone = (status: number, title: string, detail: string, code: string) => { throw new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, detail, code }, status); };
    if ("refused" in c) return c.refused === "expired" ? gone(410, "Link expired", "This download link has expired. Open the page again.", "LINK_EXPIRED") : gone(404, "Not found", "No such file in your firm.", "NOT_FOUND");
    if (!(await this.a.copyVisible(ctx, c.key))) return gone(404, "Not found", "No such file in your firm.", "NOT_FOUND");
    const f = await this.files.get(ctx.firmId, c.key);
    if (!f) return gone(404, "Not found", "No such file in your firm.", "NOT_FOUND");
    res.setHeader("Content-Disposition", `attachment; filename="consultation-agreement-signed.${c.key.split(".").pop()}"`).setHeader("Cache-Control", "no-store").setHeader("X-Content-Type-Options", "nosniff").type(f.contentType).send(Buffer.from(f.bytes));
  }
  @Get(":id") @PermissionKeys(READ)
  read(@Req() r: R, @Param("id") id: string) { return this.a.read(staffOf(r), id); }
  @Post(":id/host-link") @HttpCode(200) @AnyStaff(SIGNS)
  hostLink(@Req() r: R, @Param("id") id: string, @Body() body: unknown) { const aid = idParam(id, "agreement"), b = parseInput(HostLinkBody, body ?? {}); return this.a.hostLink(staffOf(r), aid, b); }
}

@Controller("api/public/consultation-agreements")
export class ConsultationAgreementPublicController {
  constructor(@Inject(ConsultationAgreements) private readonly a: ConsultationAgreements) {}
  /** The client's link: `{ token }` records the view; `{ token, consent: true }` records the consent and emails the one-time
   *  code (P-564); `{ token, consent: true, code }` checks it and answers the signing link; `resend: true` sends a new code. */
  @Post("open") @HttpCode(200)
  open(@Body() body: unknown, @Req() req: { ip?: string; socket?: { remoteAddress?: string } }) {
    const b = parseInput(OpenBody, body ?? {});
    return this.a.open(b.token, { consent: b.consent, code: b.code, resend: b.resend }, String(req.ip ?? req.socket?.remoteAddress ?? "unknown"));
  }
}
