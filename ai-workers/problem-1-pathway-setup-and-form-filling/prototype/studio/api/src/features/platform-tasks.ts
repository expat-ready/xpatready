// PF-29b (R1.75 part p1): the firm's tasks; TaskHosts is the registry each module's task host joins at start-up (p2 adds them).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { OFFICE_CLOCK } from "../platform/settings/offices/clock.ts";
import type { OfficeClockPort } from "../../../ports/offices.ts";
import { TaskHosts } from "../platform/tasks/hosts.ts";
import { Tasks } from "../platform/tasks/service.ts";
import { TasksController } from "../platform/tasks/routes.ts";

export default {
  controllers: [TasksController],
  providers: [
    TaskHosts,
    { provide: Tasks, useFactory: (db: Db, hosts: TaskHosts, offices: OfficeClockPort) => new Tasks({ db, audit: auditEvent, hosts, offices }), inject: [Db, TaskHosts, OFFICE_CLOCK] },
  ],
} satisfies Feature;
