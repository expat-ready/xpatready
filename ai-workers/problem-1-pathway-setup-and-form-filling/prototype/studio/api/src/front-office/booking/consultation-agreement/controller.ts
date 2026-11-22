// FO-3c: the consultation agreement's routes. Staff routes sit behind PF-4's guard (default deny); the client's door is
// under /api/public (its emailed link's token is the key; one identical not-found otherwise). The service answers 404 for
// another firm's agreement, booking or person. Decorators in @ form: api/tsconfig.json compiles them for src/front-office/**.
import { Body, Controller, Get, HttpCode, Inject, Injectable, Optional, Param, Post, Req, type OnModuleInit } from "@nestjs/common";
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

/** The ports as given: a test names them all; the running app leaves `jobs` to PF-14's runner. */
export const CONSULTATION_AGREEMENT_PORTS = "FO3C_CONSULTATION_AGREEMENT_PORTS";
export type GivenAgreementPorts = Omit<AgreementPorts, "jobs"> & { jobs?: JobPort };
/** The running app's ports. Signing is the fake, the only SigningPort adapter on main (FO-6v swaps the vendor's in: J-104). */
export function runtimeAgreementPorts(mail: MailPort, files: FilesPort, signing: SigningPort = fakeSigning()): GivenAgreementPorts {
  return { audit: auditEvent, clock: systemClock, mail, files, signing, publicBaseUrl: process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}` };
}

@Injectable()
export class ConsultationAgreements extends ConsultationAgreementService implements OnModuleInit {
  constructor(@Inject(Db) db: Db, @Inject(CONSULTATION_AGREEMENT_PORTS) ports: GivenAgreementPorts, @Optional() @Inject(PlatformJobs) runner?: PlatformJobs | null) {
    const jobs = ports.jobs ?? runner;
    if (!jobs) throw new Error("FO-3c consultation agreement: no JobPort (PF-14's PlatformJobs is not registered, and the ports name none)");
    super(db, { ...ports, jobs });
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
  constructor(@Inject(ConsultationAgreements) private readonly a: ConsultationAgreements) {}

  @Get("template-check") @PermissionKeys("agent/booking-event-type:list")
  templateCheck(@Req() r: R) { return this.a.templateCheck(staffOf(r)); }
  @Get("needs-you") @AnyStaff("a person's own unsigned agreements: the ones they sign for the firm")
  needsYou(@Req() r: R) { return this.a.needsYou(staffOf(r)); }
  @Get("by-booking/:bookingId") @PermissionKeys(READ)
  forBooking(@Req() r: R, @Param("bookingId") id: string) { return this.a.forBooking(staffOf(r), id); }
  @Get("by-person/:personId") @PermissionKeys(READ)
  forPerson(@Req() r: R, @Param("personId") id: string) { return this.a.forPerson(staffOf(r), id); }
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
