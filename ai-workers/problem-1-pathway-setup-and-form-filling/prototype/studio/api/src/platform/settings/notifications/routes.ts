// PF-18a part 2 routes: the person's own notification settings (AG-16-10). Own only: the route is `me`, the staff id is the session's. Key
// `agent/notification:manage-preferences` (self-scoped; every starter role holds it, AG-16 §10).
import { Body, Controller, Get, Inject, Put, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { NotificationSettings } from "./service.ts";

type R = { platform?: StaffContext };

@Controller("api/platform/me/notifications")
export class NotificationSettingsController {
  constructor(@Inject(NotificationSettings) private readonly settings: NotificationSettings) {}
  @Get() @PermissionKeys("agent/notification:manage-preferences")
  read(@Req() r: R) { return this.settings.read(staffOf(r)); }
  @Put() @PermissionKeys("agent/notification:manage-preferences")
  save(@Req() r: R, @Body() b: unknown) { return this.settings.save(staffOf(r), b); }
}
