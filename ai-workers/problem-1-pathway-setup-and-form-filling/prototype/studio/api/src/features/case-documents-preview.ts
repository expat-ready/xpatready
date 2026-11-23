// CS-D5 part 1 (R1.68): the staff preview link and its bytes (api/src/documents/preview.ts).
import type { Feature } from "../features.ts";
import { DocumentPreviews, DocumentPreviewsController } from "../case-documents-preview.ts";
import { PreviewLinks } from "../case-preview-links.ts";
export default { controllers: [DocumentPreviewsController], providers: [{ provide: PreviewLinks, useFactory: () => new PreviewLinks() }, DocumentPreviews] } satisfies Feature;
