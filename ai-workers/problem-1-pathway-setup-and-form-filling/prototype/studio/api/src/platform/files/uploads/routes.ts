// PF-F2 part 1: the upload rail's one route, every tus method at /api/platform/files/uploads (batch 2, amendment 4).
// Behind PF-4's guard: a staff session uses the STAFF door. The client doors (CLIENT_LINK, CLIENT_PORTAL) and SUPPORT get
// their session here when their rows register them (CS-D1, the client link and portal rows, PF-17); until then their
// uploads answer 404 like any unregistered door. The request body is tus's raw stream (application/offset+octet-stream),
// never a JSON body, so no input parse applies: tus checks every header, and the rail every id and its owner.
import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AnyStaff, staffOf, type StaffContext } from "../../identity/keys.ts";
import { UploadRail } from "./rail.ts";

@Controller("api/platform/files/uploads")
export class UploadsController {
  constructor(@Inject(UploadRail) private readonly rail: UploadRail) {}

  @All(["", "*rest"]) @AnyStaff("PF-F2: any staff member may upload through the STAFF door; the door's authorize decides what for")
  async upload(@Req() req: Request & { platform?: StaffContext }, @Res() res: Response): Promise<void> {
    const s = staffOf(req);
    await this.rail.handle({ firmId: s.firmId, door: "STAFF", actorId: s.staffId }, req, res);
  }
}
