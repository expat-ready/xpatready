// FO-3v part 1 (AG-4-58 §8, AG-4-59, AG-16-73): My account → Video, the caller's own record, behind PF-4's guard. Both
// routes declare AnyStaff (no permission key: everyone's own settings, every plan); there is no route that takes another
// person's id, and the service refuses a body naming one (403).
// Nest's decorators in @ form: api/tsconfig.json compiles them for src/front-office/** (PF-4t, #1775).
import { Body, Controller, Get, Headers, HttpException, Inject, Injectable, Put, Req } from "@nestjs/common";
import { Db } from "../../../core.ts";
import { AnyStaff, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { BOOKING_PORTS } from "../public.controller.ts";
import type { GivenBookingPorts } from "../service.ts";
import { VideoService } from "./service.ts";

type R = { platform?: StaffContext };
const WHO = "everyone's own video settings, no key (AG-4-58 rule 5, AG-4-59 rule 2); the service reads and writes only the caller's row";

@Injectable()
export class MyVideo extends VideoService {
  constructor(@Inject(Db) db: Db, @Inject(BOOKING_PORTS) ports: GivenBookingPorts) { super(db, { audit: ports.audit }); }
}

@Controller("api/front-office/me/video")
export class MyVideoController {
  constructor(@Inject(MyVideo) private readonly v: MyVideo) {}

  @Get() @AnyStaff(WHO)
  read(@Req() r: R) { return this.v.get(staffOf(r)); }

  @Put() @AnyStaff(WHO)
  save(@Req() r: R, @Body() body: unknown, @Headers("content-type") type?: string) {
    // Only JSON is read: a form or text body is never taken as an empty save.
    if (!/^application\/json\b/i.test(type ?? "")) throw new HttpException({ type: "https://expatready.local/problems/unsupported-media-type", title: "Not saved", status: 415, detail: "Send the settings as JSON (Content-Type: application/json)." }, 415);
    return this.v.put(staffOf(r), body);
  }
}
