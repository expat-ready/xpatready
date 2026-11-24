import { defineBypassUse } from "../firm-scope.ts";

export const REGISTER_FIRM_NAMES = defineBypassUse("platform.register.firm-names", { why: "our privacy registers (breaches, requests to ExpatReady, legal holds) show each firm they name by its name: the firm's id and operating name only, read only (PF-21rs R0, R1.86, R1.85); one firm-less line per read, never a line on each firm's trail (Lead 29 on #3492)", routes: [/^GET \/api\/system\/register\/(breaches|requests|holds)(\/[^/]+)?$/i], direct: true, audit: "platform" });
