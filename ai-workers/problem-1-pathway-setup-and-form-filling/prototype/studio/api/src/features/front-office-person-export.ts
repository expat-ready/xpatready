// PF-26 part 2 (R1.34): the front office registers its person-export sections (api/src/front-office/person-export/) into
// the one registry (features/platform-person-export.ts).
import type { Feature } from "../features.ts";
import { PersonExportRegistry } from "../platform/person-export/registry.ts";
import { personRecordExporter } from "../front-office/person-export/person.ts";

/** The registration's token (one provider: Nest builds it once, at start-up). */
export const FO_PERSON_EXPORT = Symbol("FrontOffice.personExport");

export default {
  providers: [{ provide: FO_PERSON_EXPORT, useFactory: (registry: PersonExportRegistry) => { registry.register(personRecordExporter); return true; }, inject: [PersonExportRegistry] }],
} satisfies Feature;
