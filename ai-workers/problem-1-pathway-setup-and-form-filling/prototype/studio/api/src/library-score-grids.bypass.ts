// AS-1g (P-588 (1)): the score grid tables are platform-wide and the app role cannot write them (migration
// as1g_score_grids); an approved grid import is written on this one named use, with one firm-less platform.bypass line.
import { defineBypassUse } from "./platform/firm-scope.ts";

export const SCORE_GRIDS_APPLY = defineBypassUse("configurator.score-grids.apply", { why: "a second person's approval writes an imported score grid to the platform-wide grid tables, which the app role may only read (AS-1g, P-588 (1)); no firm's rows", routes: [/^POST \/api\/library\/changes\/[^/]+\/approve$/i], direct: true, audit: "platform" });
