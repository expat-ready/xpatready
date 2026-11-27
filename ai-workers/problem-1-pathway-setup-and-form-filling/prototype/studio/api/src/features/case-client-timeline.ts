// CS-NT1t (map row 76): a person's own timeline (api/src/case-notes/person-timeline.ts), behind PF-4's guard with its key.
import type { Feature } from "../features.ts";
import { PersonTimelineController } from "../case-notes/routes.ts";
import { PersonTimeline } from "../case-notes/person-timeline.ts";

export default { controllers: [PersonTimelineController], providers: [PersonTimeline] } satisfies Feature;
