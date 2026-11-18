// FO-9a: the duplicate check (POST /api/front-office/duplicates/check).
import type { Feature } from "../features.ts";
import { DuplicatesController } from "../front-office/duplicates/routes.ts";
import { Duplicates } from "../front-office/duplicates/service.ts";

export default { controllers: [DuplicatesController], providers: [Duplicates] } satisfies Feature;
