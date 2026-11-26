// CS-D1u (R1.64 part 4): the case side registers its STAFF upload door (documents/staff-door.ts) on PF-F2's registry at
// start-up, here and not in platform-files.ts, so a suite that builds the rail's own feature (tests/check_pff2_uploads.ts)
// registers its own test door. A door registers once (UploadDoorTaken); a module without the rail registers nothing.
// The door reads no stored file: the rail hands its check the finished bytes.
import { Inject, Injectable, Optional, type OnModuleInit } from "@nestjs/common";
import { CaseDocuments } from "../case-documents.ts";
import { Db } from "../core.ts";
import { caseStaffDoor } from "../documents/staff-door.ts";
import type { Feature } from "../features.ts";
import { UploadDoors } from "../platform/files/uploads/doors.ts";

@Injectable()
export class CaseStaffDoor implements OnModuleInit {
  constructor(@Inject(Db) private readonly db: Db, @Inject(CaseDocuments) private readonly documents: CaseDocuments,
    @Optional() @Inject(UploadDoors) private readonly doors?: UploadDoors) {}
  onModuleInit() {
    if (this.doors) this.doors.register("STAFF", caseStaffDoor({ db: this.db, documents: this.documents }));
  }
}

export default { providers: [CaseStaffDoor] } satisfies Feature;
