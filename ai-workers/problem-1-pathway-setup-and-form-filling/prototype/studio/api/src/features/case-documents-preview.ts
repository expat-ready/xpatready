// CS-D5 part 1 (R1.68): the staff preview link and its bytes (`case-documents-preview.ts`, the signer `case-preview-links.ts`; api/src/documents/ is outside tsconfig's include).
import type { Feature } from "../features.ts";
import { DocumentPreviews, DocumentPreviewsController } from "../case-documents-preview.ts";
import { PreviewLinks } from "../case-preview-links.ts";
export default { controllers: [DocumentPreviewsController], providers: [{ provide: PreviewLinks, useFactory: () => new PreviewLinks() }, DocumentPreviews] } satisfies Feature;
