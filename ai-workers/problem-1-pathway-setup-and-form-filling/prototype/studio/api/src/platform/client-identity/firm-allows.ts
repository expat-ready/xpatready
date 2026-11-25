// PF-4p part 1 (SA-2-35): the firm's state on every client request. PF-27's `firmAllows(firmId, action)` (a held or locked
// firm: status and own documents only, a neutral refusal otherwise) is not on main; until it lands this stub allows every
// action, and tests/check_pf4p_client_identity.ts carries the pending line that turns into PF-27's test. PF-27 replaces
// this file's body with a call to its guard helper; the callers stay.
export type PortalAction = "portal.read" | "portal.upload" | "portal.sign" | "portal.message" | "portal.pay";
export async function firmAllows(_firmId: string, _action: PortalAction): Promise<boolean> { return true; }
