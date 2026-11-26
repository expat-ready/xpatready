// PF-22v: SavedViewPort's real adapter (ports/saved-views.ts), one instance for the app (a Nest provider). Each module
// registers its lists on it at start-up (front-office/sales/saved-view-lists.ts). The rule is the port's ListRegistry,
// the same one the fake uses.
import { Injectable } from "@nestjs/common";
import { ListRegistry } from "../../../../ports/saved-views.ts";
import type { StaffContext } from "../identity/keys.ts";

@Injectable()
export class SavedViewRegistry extends ListRegistry<StaffContext> {}
