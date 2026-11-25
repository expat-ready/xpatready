// PF-11 part 2: the front office's sections of the firm's full data download, registered on the platform's PgFirmExport
// (features/platform-firm-export.ts) from the front office's own feature file; no edit to the front office's services.
import type { Feature } from "../features.ts";
import { FRONT_OFFICE_MODULE, frontOfficeSections } from "../front-office/export/sections.ts";
import { PgFirmExport } from "../platform/firm-export/registry.ts";

export const FO_EXPORT_REGISTERED = "FO_EXPORT_REGISTERED";
export default {
  providers: [{ provide: FO_EXPORT_REGISTERED, useFactory: (port: PgFirmExport) => { port.register(FRONT_OFFICE_MODULE, frontOfficeSections); return true; }, inject: [PgFirmExport] }],
} satisfies Feature;
