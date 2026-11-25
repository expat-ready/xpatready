// CS-K1 part 2: the case side's live delivery of `prospect.won` and the one-time client-link job (case-clients/live.ts).
import type { Feature } from "../features.ts";
import { ProspectWonPoll } from "../case-clients/live.ts";
export default { providers: [ProspectWonPoll] } satisfies Feature;
