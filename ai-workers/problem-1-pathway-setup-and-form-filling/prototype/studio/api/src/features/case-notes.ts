// CS-NT1 part 1 (map row 76): notes on a case (api/src/case-notes/). Behind PF-4's guard with declared keys, as
// features/case-close.ts. CS-NT1 part 3: notes on a case client and the case's timeline.
import type { Feature } from "../features.ts";
import { CaseNotesController, CaseTimelineController, ClientNotesController } from "../case-notes/routes.ts";
import { CaseNotes } from "../case-notes/service.ts";
import { CaseTimeline } from "../case-notes/timeline.ts";

export default { controllers: [CaseNotesController, ClientNotesController, CaseTimelineController], providers: [CaseNotes, CaseTimeline] } satisfies Feature;
