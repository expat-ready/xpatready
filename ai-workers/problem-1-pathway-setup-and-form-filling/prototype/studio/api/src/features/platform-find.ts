// PF-30a: the one find door (GET /api/platform/find), its registry (FindPort's real adapter) and the front office's
// finder, which registers on it at start-up. CS-S1 part 2 adds the case finder in a feature file of its own.
import type { Feature } from "../features.ts";
import { FrontOfficeFinder } from "../front-office/find.ts";
import { FindRegistry } from "../platform/find/registry.ts";
import { FindController } from "../platform/find/routes.ts";

export default { controllers: [FindController], providers: [FindRegistry, FrontOfficeFinder] } satisfies Feature;
