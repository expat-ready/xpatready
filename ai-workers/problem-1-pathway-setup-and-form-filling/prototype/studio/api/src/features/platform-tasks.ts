// PF-29b (R1.75; shape screens/tk-tasks/shape-r175.md part p1): the firm's tasks (api/src/platform/tasks/). TaskHosts is
// the one registry each module's task host joins at start-up (the firm host is built in; the front office's and the case
// side's hosts come with part p2).
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
