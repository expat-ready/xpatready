// CS-NT1 part 1 (map row 76): notes on a case (api/src/case-notes/). Behind PF-4's guard with declared keys, as
// features/case-close.ts.
import type { Feature } from "../features.ts";
import { CaseNotesController } from "../case-notes/routes.ts";
import { CaseNotes } from "../case-notes/service.ts";

export default { controllers: [CaseNotesController], providers: [CaseNotes] } satisfies Feature;
