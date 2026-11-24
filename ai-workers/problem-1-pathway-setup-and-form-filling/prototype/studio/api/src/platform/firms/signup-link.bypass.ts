import { defineBypassUse } from "../firm-scope.ts";

/** R1.90 (P-785 (2): a new bypass use beside its module): our staff make a private single-use sign-up link, a row with no
 *  firm until it is used, on PF-4s's /api/system plane (`system/signup-link:manage`). One firm-less line per link. */
export const SIGNUP_LINK_USE = defineBypassUse("platform.firms.signup-link", { why: "our staff make a private single-use sign-up link: a row with no firm until it is used (R1.90, PF-4s's system/signup-link:manage)", routes: [/^POST \/api\/system\/signup-links$/i], direct: true, audit: "platform" });
