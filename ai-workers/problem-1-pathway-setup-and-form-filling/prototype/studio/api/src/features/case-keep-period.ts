// CS-D6 part 2 (R1.69): "Documents past their keep period" (closed client files, api/src/documents/keep-period.ts) and its
// weekly reminder. The list sits behind PF-4's guard (a staff session and agent/document:dispose, never x-actor), as part
// 1's routes. The reminder registers at start once NotificationPort is bound (PF-18n's adapter, features/platform-
// notifications.ts); without it the app says so once in its log and reminds nobody. The clock is the system's (P-607).
import { Controller, Get, HttpException, HttpStatus, Inject, Injectable, Optional, Query, Req, type OnModuleInit } from "@nestjs/common";
import { z } from "zod";
import { systemClock } from "../../../ports/clock.ts";
import type { JobPort } from "../../../ports/jobs.ts";
import type { NotificationPort } from "../../../ports/notifications.ts";
import { CaseRead, Db } from "../core.ts";
import { badCursor, DISPOSE_KEY, KeepListCursor, KeepPeriodReminders, keepListFor } from "../documents/keep-period.ts";
import type { Feature } from "../features.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../platform/identity/keys.ts";
import { PlatformJobs } from "../platform/jobs/platform-jobs.ts";
import { KeepPeriods } from "../platform/keep-period/service.ts";
import { NOTIFICATION_PORT } from "../platform/notifications/store.ts";
import { logPort } from "../platform/observability/log.ts";

type R = { platform?: StaffContext };
/** The list's query: only ?after= (the cursor's own rule, KeepListCursor). */
const KeepListQuery = z.strictObject({ after: KeepListCursor.optional() });

@CaseRead()
@Controller("api/runtime/documents")
export class CaseKeepPeriodController {
  constructor(@Inject(Db) private readonly db: Db, @Inject(KeepPeriods) private readonly keep: KeepPeriods) {}

  /** SA-11-33: the closed client files past the firm's keep period, each only if the person can see the case (AG-9-53). */
  @Get("past-keep-period") @PermissionKeys(DISPOSE_KEY)
  list(@Req() r: R, @Query() query: Record<string, unknown> = {}) {
    // R1.10 A5 (W5): the whole query through one strict schema: an unknown key is refused 400 and named, as the case side's other
    // doors; a cursor the list did not give is still badCursor()'s 400.
    const q = KeepListQuery.safeParse(query ?? {});
    const unknown = q.success ? undefined : q.error.issues.find((i) => i.code === "unrecognized_keys") as { keys: string[] } | undefined;
    if (unknown) { const k = String(unknown.keys[0]).slice(0, 64); throw new HttpException({ type: "https://expatready.local/problems/validation", title: "Some details need fixing", status: 400, detail: `${k} is not a field of this list.`, errors: [{ field: k, message: "This field is not allowed here." }] }, HttpStatus.BAD_REQUEST); }
    return q.success ? keepListFor(this.db, this.keep, systemClock, staffOf(r), q.data.after) : badCursor();
  }
}

const registered = new WeakSet<JobPort>();
let saidWaiting = false;

@Injectable()
export class KeepPeriodJobs implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: Db, @Inject(PlatformJobs) private readonly jobs: JobPort, @Inject(KeepPeriods) private readonly keep: KeepPeriods,
    @Optional() @Inject(NOTIFICATION_PORT) private readonly notifications?: NotificationPort) {}
  async onModuleInit() {
    if (!this.notifications) { if (!saidWaiting) logPort.info("keep_period_waiting", { why: "no NotificationPort bound (PF-18n): keep-period reminders are not scheduled" }); saidWaiting = true; return; }
    if (registered.has(this.jobs)) return;
    registered.add(this.jobs);
    try { await new KeepPeriodReminders({ db: this.db, jobs: this.jobs, notifications: this.notifications as never, clock: systemClock, keepPeriods: this.keep }).register(); }
    catch (e) { registered.delete(this.jobs); throw e; }
  }
}

export default { controllers: [CaseKeepPeriodController], providers: [KeepPeriodJobs] } satisfies Feature;
