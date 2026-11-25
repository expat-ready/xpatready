// PF-21w: the complaints record (api/src/platform/complaints/): its routes, ComplaintsService and its acknowledgement
// reminder on PF-14's job runner, registered once through registerComplaintJobs. The ports the running app gives the
// service, until each real adapter is on main (as FO-3's booking does): audit is real (PF-0p's interim AuditPort over
// audit_event); the clock is the system's; mail is the app's MailPort over MessagePort (MESSAGES_MAIL, PF-19r: the
// reminder goes through the outbox, the gate and the daily cap); jobs are PF-14's PlatformJobs.
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { systemClock } from "../../../ports/clock.ts";
import type { JobPort } from "../../../ports/jobs.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { ComplaintsService, registerComplaintJobs, type ComplaintDeps } from "../platform/complaints/complaints.ts";
import { ComplaintsController } from "../platform/complaints/routes.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

/** The service's ports other than the database and the job runner (a test gives its own). */
export const COMPLAINT_PORTS = "PF21_COMPLAINT_PORTS";
export type ComplaintPorts = Pick<ComplaintDeps, "audit" | "clock" | "mail">;
export const runtimeComplaintPorts = (mail: MailPort): ComplaintPorts => ({ audit: auditEvent, clock: systemClock, mail });

/** The job runners the reminder is already registered on: a second start on the same runner registers nothing new. */
const registered = new WeakSet<JobPort>();

/** Registers the acknowledgement reminder's handler when the app starts (before PF-14's worker starts, at bootstrap). */
@Injectable()
export class ComplaintJobs implements OnModuleInit {
  constructor(@Inject(PlatformJobs) private readonly jobs: JobPort, @Inject(ComplaintsService) private readonly svc: ComplaintsService) {}
  async onModuleInit() {
    if (registered.has(this.jobs)) return;
    registered.add(this.jobs);
    try { await registerComplaintJobs(this.jobs, this.svc); } catch (e) { registered.delete(this.jobs); throw e; }
  }
}

export default {
  controllers: [ComplaintsController],
  providers: [
    { provide: COMPLAINT_PORTS, useFactory: runtimeComplaintPorts, inject: [MESSAGES_MAIL] },
    { provide: ComplaintsService, useFactory: (db: Db, jobs: JobPort, p: ComplaintPorts) => new ComplaintsService({ db, jobs, ...p }), inject: [Db, PlatformJobs, COMPLAINT_PORTS] },
    ComplaintJobs,
  ],
} satisfies Feature;
