// FO-6 part 3 (P-785 (2): a bypass use is declared beside its module): the signing provider's webhook names its document,
// not our firm. The door finds the request by the provider's document id (unique across firms, part 1 review M4), writes
// the touched firm's platform.bypass line (per-firm), then applies the event as that firm (./service.ts). Accepted for
// part 3 only (Lead 5 on #3065): FO-6's next migration replaces it with a narrow SECURITY DEFINER lookup and removes it.
import { defineBypassUse } from "../../platform/firm-scope.ts";

export const SIGNING_WEBHOOK = defineBypassUse("front-office.signing.webhook", {
  why: "the signing provider's event names its document, not our firm: the door finds the request by the provider's document id (unique across firms), then applies it as that firm (FO-6 part 3)",
  routes: [/^POST \/api\/hooks\/signing\/[^/]+$/i],
  direct: true,
  audit: "per-firm",
});
