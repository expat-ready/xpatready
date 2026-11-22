// CS-S1 part 2: the case side's search service (PartySearchPort's real adapter) and its finder, which registers on the
// one find door (features/platform-find.ts, PF-30a) at start-up. Registration only: the case side has no search route.
import type { Feature } from "../features.ts";
import { CaseFinder } from "../search/case-finder.ts";
import { CasePartySearch } from "../search/party-search.ts";

export default { providers: [CasePartySearch, CaseFinder] } satisfies Feature;
