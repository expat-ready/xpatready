// AS-1g (R1.106): score grids as cited data, imported through the configurator's guarded change and released on snapshots.
import type { Feature } from "../features.ts";
import { ScoreGrids, ScoreGridsController } from "../library-score-grids.ts";
export default { controllers: [ScoreGridsController], providers: [ScoreGrids] } satisfies Feature;
