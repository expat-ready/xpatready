// PF-22a part 2: CustomFieldPort's real adapter (ports/custom-fields.ts), one instance for the app (a Nest provider). Each
// module registers its record kinds on it at start-up (front-office/sales/custom-field-entities.ts); the routes read a
// kind's checks from it. The rule is the port's EntityRegistry, the same one the fake uses.
import { Injectable } from "@nestjs/common";
import { EntityRegistry } from "../../../../ports/custom-fields.ts";
import type { StaffContext } from "../identity/keys.ts";

@Injectable()
export class CustomFieldRegistry extends EntityRegistry<StaffContext> {}
