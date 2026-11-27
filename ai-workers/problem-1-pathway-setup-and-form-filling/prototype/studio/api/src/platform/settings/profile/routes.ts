// PF-5fp (R1.92; AG-01 §3.1, AG01-29(7)): the firm profile. Reading: every role holding agent/settings:list; changing: agent/settings:edit
// (Owner and Admin) at the door, and the billing email Owner only (agent/firm-profile:manage) in the service. The guard's firm is the only
// firm: there is no firm in the path, so another firm's profile cannot be named.
import { Body, Controller, Get, Inject, Put, Req } from "@nestjs/common";
import { z } from "zod";
import { parseInput } from "../../http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { FirmProfile } from "./service.ts";
import { Versioned } from "../../http/if-match.ts";

type R = { platform?: StaffContext };
/** PF-28 (the one input rule): the body is an object of named fields, parsed here (an array, a string or a key over 64 characters is
 *  422). Each field is then checked by its own rule in the service, every bad one named at once (SaveProfile, READ_ONLY).
 *  R1.10 (j_10 B7): its fields are declared, so a reader of the code knows them: the ones the service saves and the read-only ones it
 *  refuses in words. Loose on purpose: any other key passes on to the service, which names it with the rest (review m4). */
const unknownField = z.unknown().optional();
// PF-5fp-2 (review r3-m1): plain words, never the library's "This must be a record."/"This must be a object.": a custom check first
// (parseInput keeps its message), then the fields; a key over 64 characters keeps its own message too.
export const ProfileBody = z.unknown()
  .refine((v) => v !== null && typeof v === "object" && !Array.isArray(v), "Send the firm profile as one set of named fields.")
  .pipe(z.looseObject({
    version: unknownField, publicPhone: unknownField, publicEmail: unknownField, website: unknownField, language: unknownField,
    timeZone: unknownField, currency: unknownField, billingEmail: unknownField,
    legalName: unknownField, operatingName: unknownField, countryCode: unknownField, key: unknownField, businessAddress: unknownField,
  }).superRefine((v, c) => { for (const k of Object.keys(v)) if (k.length > 64) c.addIssue({ code: "custom", path: [k], message: "A field name is at most 64 characters." }); }));

@Controller("api/platform/firm/profile")
export class FirmProfileController {
  constructor(@Inject(FirmProfile) private readonly profile: FirmProfile) {}
  @Get() @PermissionKeys("agent/settings:list")
  get(@Req() r: R) { return this.profile.get(staffOf(r)); }
  @Put() @PermissionKeys("agent/settings:edit") @Versioned()   // PF-31: the version as If-Match too
  save(@Req() r: R, @Body() b: unknown) { return this.profile.save(staffOf(r), parseInput(ProfileBody, b ?? {})); }
}
