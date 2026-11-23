// PF-5fp (R1.92; AG-01 §3.1, AG01-29(7)): the firm profile. Reading: every role holding agent/settings:list; changing: agent/settings:edit
// (Owner and Admin) at the door, and the billing email Owner only (agent/firm-profile:manage) in the service. The guard's firm is the only
// firm: there is no firm in the path, so another firm's profile cannot be named.
import { Body, Controller, Get, Inject, Put, Req } from "@nestjs/common";
import { z } from "zod";
import { parseInput } from "../../http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { FirmProfile } from "./service.ts";

type R = { platform?: StaffContext };
/** PF-28 (the one input rule): the body is an object of named fields, parsed here (an array, a string or a key over 64 characters is
 *  422). Each field is then checked by its own rule in the service, every bad one named at once (SaveProfile, READ_ONLY). */
export const ProfileBody = z.unknown()
  // PF-5fp-2 (review r3-m1): plain words, never the library's "This must be a record." or "Invalid key in record". A custom check
  // first (parseInput keeps its message), then the record, whose key error keeps its own message too.
  .refine((v) => v !== null && typeof v === "object" && !Array.isArray(v), "Send the firm profile as one set of named fields.")
  .pipe(z.record(z.string().max(64), z.unknown(), { error: "A field name is at most 64 characters." }));

@Controller("api/platform/firm/profile")
export class FirmProfileController {
  constructor(@Inject(FirmProfile) private readonly profile: FirmProfile) {}
  @Get() @PermissionKeys("agent/settings:list")
  get(@Req() r: R) { return this.profile.get(staffOf(r)); }
  @Put() @PermissionKeys("agent/settings:edit")
  save(@Req() r: R, @Body() b: unknown) { return this.profile.save(staffOf(r), parseInput(ProfileBody, b ?? {})); }
}
