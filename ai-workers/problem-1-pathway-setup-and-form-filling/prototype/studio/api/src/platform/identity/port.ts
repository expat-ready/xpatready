// PF-4 (contracts §0.3): IdentityPort, the one door to the identity provider. Two adapters: `cognito` (Amazon Cognito,
// ca-central-1; cognito.ts) and `local` (the stand-in, a signed token of our own; local.ts, only when
// PLATFORM_IDENTITY=local). The guard (guard.ts) asks the port who a bearer token is; the port never reads our tables.
// Configuration, all from the environment (no real pool id, client id or secret is ever committed), read by PF-24's one
// loader (config/settings.ts, PF-24w); identityConfig only shapes its answer:
//   PLATFORM_IDENTITY            "local" | "cognito"; unset: no staff sign-in on this server (every platform route 401s)
//   PLATFORM_ENVIRONMENT         "local" | "test" | "production", required (no default); the stand-in never runs in test or production
//   PLATFORM_COGNITO_USER_POOL_ID, PLATFORM_COGNITO_CLIENT_ID   the pool (ca-central-1_…) and its app client
//   PLATFORM_POOL_MFA_REQUIRED   "true" (default) | "false": the pool requires two-step sign-in for everyone (P-567);
//                                "false" makes every Cognito sign-in refused, saying why (PF-4b verifies the pool itself)
//   PLATFORM_LOCAL_SECRET        the local stand-in's signing key (at least 32 characters); unset: a random one per start
import { loadPlatformConfig, platformConfig } from "../config/settings.ts";

/** Who a verified token is. Times are seconds since 1970 (JWT NumericDate; the local stand-in's carry milliseconds). */
export type VerifiedIdentity = {
  via: "local" | "cognito";
  /** How to find the staff member: the local stand-in names our staff id; Cognito names its `sub` (identity_subject). */
  lookup: { staffId: string } | { identitySubject: string };
  /** When this session's sign-in happened (`auth_time`): a step-up check and the one-session rule read it. */
  authTime: number;
  /** Whether the second step of sign-in was done (local: the token says so; Cognito: the pool requires it for everyone). */
  secondStep: boolean;
};

/** A token the port refuses: always 401, with a reason a person can act on. */
export class IdentityRefused extends Error {
  constructor(readonly detail: string, readonly code = "TOKEN_REFUSED") { super(detail); }
}

export interface IdentityPort {
  readonly via: "local" | "cognito";
  verify(token: string): Promise<VerifiedIdentity>;
  /** Warm whatever the adapter needs before the first request (Cognito: the pool's keys). */
  warm?(): Promise<void>;
}

export type IdentityConfig = {
  identity: "local" | "cognito" | "none";
  environment: "local" | "test" | "production";
  cognito: { userPoolId: string | null; clientId: string | null; mfaRequired: boolean };
  localSecret: string | null;
};

/** The sign-in configuration, from PF-24's loader (PF-24w): this process's, read once at start (platformConfig), or, given
 *  another `env`, that one's. A value the loader does not know stops the start-up with its name and never its value. */
export function identityConfig(env: NodeJS.ProcessEnv = process.env): IdentityConfig {
  const c = env === process.env ? platformConfig() : loadPlatformConfig(env), key = c.identity.localSecret;
  return {
    identity: c.identity.via, environment: c.environment,
    cognito: { userPoolId: c.cognito.userPoolId, clientId: c.cognito.clientId, mfaRequired: c.identity.poolMfaRequired },
    localSecret: key ? key.reveal() : null,
  };
}

/** The clock the module reads (tests give their own, so a 5-minute step-up rule is tested without waiting). */
export class PlatformClock {
  now(): number { return Date.now(); }
}
