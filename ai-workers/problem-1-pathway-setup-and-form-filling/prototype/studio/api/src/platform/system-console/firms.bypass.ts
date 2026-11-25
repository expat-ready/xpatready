import { defineBypassUse } from "../firm-scope.ts";

export const FIRMS_LIST = defineBypassUse("platform.console.firms-list", { why: "our team's firms list reads every firm's status, plan and usage, read only (PF-17 part 1, R1.93; system/firm:read); one firm-less line per list call (Lead 9's ruling on #3155)", routes: [/^GET \/api\/system\/firms$/i], direct: true, audit: "platform" });

export const FIRM_READ = defineBypassUse("platform.console.firm-read", { why: "our team opens one firm's status, plan and usage, read only (PF-17 part 1, R1.93; system/firm:read); that firm's own platform.bypass line (Lead 9's ruling on #3155)", routes: [/^GET \/api\/system\/firms\/[^/]+$/i], direct: true, audit: "per-firm" });
