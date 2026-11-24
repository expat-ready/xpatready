import { defineBypassUse } from "../firm-scope.ts";

export const SUPPORT_QUEUE = defineBypassUse("platform.console.support-queue", { why: "our team's support queue lists every firm's tickets with their firm (PF-17 part 2, R1.93; system/support:list); one firm-less line per list call, as the firms list (Lead 1's ruling on #3155)", routes: [/^GET \/api\/system\/support\/tickets$/i], direct: true, audit: "platform" });

export const SUPPORT_TICKET = defineBypassUse("platform.console.support-ticket", { why: "our team opens one firm's ticket (system/support:list) or replies on it (system/support:manage) (PF-17 part 2, R1.93); that firm's own platform.bypass line", routes: [/^GET \/api\/system\/support\/tickets\/[^/]+$/i, /^POST \/api\/system\/support\/tickets\/[^/]+\/replies$/i], direct: true, audit: "per-firm" });
