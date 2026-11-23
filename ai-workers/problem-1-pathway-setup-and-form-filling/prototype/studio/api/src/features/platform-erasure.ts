// PF-21d (R1.85): an approved deletion request on the register carried out. Part 1a: the erasure registry modules register
// their erasers into (ports/erasure.ts) and the "Data erasure" switch under /api/system/switches. Part 1b adds approve,
// cancel and the daily job.
import type { Feature } from "../features.ts";
import { ErasureRegistry } from "../platform/erasure/registry.ts";
import { PlatSwitchController } from "../platform/switches/routes.ts";
import { PlatSwitches } from "../platform/switches/service.ts";

export default {
  controllers: [PlatSwitchController],
  providers: [ErasureRegistry, PlatSwitches],
} satisfies Feature;
