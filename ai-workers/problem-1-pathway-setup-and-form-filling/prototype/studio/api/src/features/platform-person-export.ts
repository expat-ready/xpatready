// PF-26 part 1 (R1.34): the person export registry modules register their exporters into (ports/person-export.ts). The
// request, the job and the download come with part 2 (api/src/platform/person-export/).
import type { Feature } from "../features.ts";
import { PersonExportRegistry } from "../platform/person-export/registry.ts";

export default {
  providers: [PersonExportRegistry],
} satisfies Feature;
