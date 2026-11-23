// CS-D7 (map row 70): expiry, translation and notarisation flags on each case document, set by staff and audited.
import type { Feature } from "../features.ts";
import { CaseDocumentFlags, CaseDocumentFlagsController } from "../case-document-flags.ts";
export default { controllers: [CaseDocumentFlagsController], providers: [CaseDocumentFlags] } satisfies Feature;
