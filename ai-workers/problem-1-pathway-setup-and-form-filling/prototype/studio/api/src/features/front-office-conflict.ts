// FO-13c: the conflict-of-interest check's routes (api/src/front-office/compliance/conflict/), on the platform clock
// (PF-4's). No PartySearchPort until CS-S1b merges its real adapter: the answer says other parties on cases are not searched.
import { Inject } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { ConflictChecksController } from "../front-office/compliance/conflict/routes.ts";
import { ConflictChecks } from "../front-office/compliance/conflict/service.ts";
import { PlatformClock } from "../platform/identity/port.ts";
[Db, PlatformClock].forEach((t, i) => Inject(t)(ConflictChecks, undefined, i));
export default { controllers: [ConflictChecksController], providers: [ConflictChecks] } satisfies Feature;
