// PF-29b (R1.75 part p1): the task routes behind PF-4's guard. Each declares its least key (view.own, all six starter roles;
// :create to add); the service checks the rest per task (BR-8). A task the person may not read is 404 (PF-3).
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { Tasks, KEY } from "./service.ts";

type R = { platform?: StaffContext };

@Controller("api/platform/tasks")
export class TasksController {
  constructor(@Inject(Tasks) private readonly tasks: Tasks) {}
  @Post() @PermissionKeys(KEY.create)
  create(@Req() r: R, @Body() b: unknown) { return this.tasks.create(staffOf(r), b); }
  @Get(":id") @PermissionKeys(KEY.own)
  get(@Req() r: R, @Param("id") id: string) { return this.tasks.get(staffOf(r), id); }
  @Patch(":id") @PermissionKeys(KEY.own)
  edit(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.tasks.edit(staffOf(r), id, b); }
  @Post(":id/assign") @HttpCode(200) @PermissionKeys(KEY.own)
  assign(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.tasks.assign(staffOf(r), id, b); }
  @Post(":id/take") @HttpCode(200) @PermissionKeys(KEY.own)
  take(@Req() r: R, @Param("id") id: string) { return this.tasks.take(staffOf(r), id); }
  @Post(":id/complete") @HttpCode(200) @PermissionKeys(KEY.own)
  complete(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.tasks.complete(staffOf(r), id, b); }
  @Post(":id/reopen") @HttpCode(200) @PermissionKeys(KEY.own)
  reopen(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.tasks.reopen(staffOf(r), id, b); }
  @Post(":id/cancel") @HttpCode(200) @PermissionKeys(KEY.own)
  cancel(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.tasks.cancel(staffOf(r), id, b); }
}
