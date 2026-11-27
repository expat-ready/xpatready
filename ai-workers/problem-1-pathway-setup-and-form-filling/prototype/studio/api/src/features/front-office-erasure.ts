// PF-21d part 2b-1 (R1.85): the front office registers its eraser (api/src/front-office/erase/eraser.ts) into the erasure
// job's registry (platform-erasure.ts), so an approved, window-elapsed deletion clears the person's front-office data.
import type { Feature } from "../features.ts";
import { ErasureRegistry } from "../platform/erasure/registry.ts";
import { frontOfficeEraser } from "../front-office/erase/eraser.ts";

/** Resolved at start-up: the eraser is registered once (a second register is refused, ports/erasure.ts rule 1). */
export const FO_ERASER_REGISTERED = Symbol("FrontOffice.eraserRegistered");

export default {
  providers: [{ provide: FO_ERASER_REGISTERED, useFactory: (registry: ErasureRegistry) => { registry.register(frontOfficeEraser); return true; }, inject: [ErasureRegistry] }],
} satisfies Feature;
