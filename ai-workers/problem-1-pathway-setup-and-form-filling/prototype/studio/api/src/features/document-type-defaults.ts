// CS-D7c (map row 70): a document type's cited translation, notarisation and validity defaults, a governed library change.
import type { Feature } from "../features.ts";
import { DocumentTypeDefaults, DocumentTypeDefaultsController } from "../document-type-defaults.ts";
export default { controllers: [DocumentTypeDefaultsController], providers: [DocumentTypeDefaults] } satisfies Feature;
