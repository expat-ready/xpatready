// PF-24 (SA-8-1, SA-8-3, SA8-D1; SA-08 §3.1): the one typed configuration loader for every secret and service setting the
// platform reads. Read from the environment once (the deploy injects them from AWS Secrets Manager into the task's
// environment, PF-8; on the Mac and in lane copies they are simply unset). Rules:
//  * PLATFORM_ENVIRONMENT is required, with no default (PF-24w, rev 16.5 "fail closed"): unset or blank stops the start-up,
//    naming it and the three values; every launcher sets it (start.sh and isolated.sh `local`, the deploy its own).
//  * PLATFORM_ENVIRONMENT=test or production: every setting below is required (except the few marked optional, the
//    sign-in and Sample settings PF-4 reads); one missing stops the start-up, naming it.
//  * local: each may be unset (that service is then off on this server), but one that is set must be valid.
//  * PLATFORM_IDENTITY=local (PF-4's stand-in) is refused unless PLATFORM_ENVIRONMENT=local.
//  * a refusal names the setting and the rule it broke, never its value; a secret is held as a `Secret` (secret.ts), so
//    it prints, logs and serialises as "[secret NAME]".
//  * a Stripe live key is refused outside production (no live money from the Mac, a lane or the test environment).
// A later row adds its own setting as one entry in SETTINGS (and its field in PlatformConfig). PF-23's redaction reads
// SECRET_SETTING_NAMES. Rotation: deploy/RUNBOOK-secrets.md. Test: tests/check_pf24_secrets.ts.
import { z } from "zod";
import { Secret } from "./secret.ts";

export const ENVIRONMENTS = ["local", "test", "production"] as const;
export type PlatformEnvironment = (typeof ENVIRONMENTS)[number];

/** The demo database on the Mac and in lane copies (as api/src/core.ts DATABASE_URL); never used in test or production. */
export const LOCAL_DATABASE_URL = "postgresql://xr_studio@127.0.0.1:54329/xr_studio_demo";

/** PF-8b F2b: the firm-address domain when PLATFORM_ADDRESS_SUFFIX is unset (P-607 (2)). */
export const DEFAULT_ADDRESS_SUFFIX = "expatready.com";
/** Two or more DNS labels, lower case, each 1-63 characters with no hyphen at either end, a letters-only last label, 253
 *  characters at most. No port, no trailing dot, no wildcard. */
export const ADDRESS_SUFFIX_PATTERN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const KEY_ENTRY = /^[1-9][0-9]{0,5}:[A-Za-z0-9+/]{43}=$/;

type Setting = { name: string; secret: boolean; rule: z.ZodType<string>; expects: string; service: string; optional: boolean };
const s = (service: string, name: string, secret: boolean, rule: z.ZodType<string>, expects: string): Setting => ({ service, name, secret, rule, expects, optional: false });
/** A setting never required, in any environment (unset has a meaning of its own, written in `expects`'s setting). */
const opt = (service: string, name: string, secret: boolean, rule: z.ZodType<string>, expects: string): Setting => ({ ...s(service, name, secret, rule, expects), optional: true });

/** Every setting, in the order a refusal lists them. */
export const SETTINGS: readonly Setting[] = Object.freeze([
  s("database", "DATABASE_URL", true, z.string().regex(/^postgres(ql)?:\/\/\S+$/), "a postgresql:// address"),
  s("cognito", "PLATFORM_COGNITO_USER_POOL_ID", false, z.string().regex(/^[a-z]{2}-[a-z]+-[0-9]_[A-Za-z0-9]{1,55}$/), "a user pool id such as ca-central-1_AbC123"),
  s("cognito", "PLATFORM_COGNITO_CLIENT_ID", false, z.string().regex(/^[A-Za-z0-9]{1,128}$/), "an app client id (letters and digits)"),
  s("stripe", "PLATFORM_STRIPE_SECRET_KEY", true, z.string().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]{8,255}$/), "a Stripe secret or restricted key (sk_… or rk_…)"),
  s("stripe", "PLATFORM_STRIPE_WEBHOOK_SECRET", true, z.string().regex(/^whsec_[A-Za-z0-9+/=]{8,255}$/), "a Stripe webhook signing secret (whsec_…)"),
  opt("stripe", "PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET", true, z.string().regex(/^whsec_[A-Za-z0-9+/=]{8,255}$/), "the signing secret of Stripe's connected-accounts webhook endpoint (whsec_…; FO-7c; unset: card payments are not set up on this server)"),
  s("ses", "PLATFORM_SES_REGION", false, z.string().regex(/^[a-z]{2}-[a-z]+-[0-9]$/), "an AWS region such as ca-central-1 (SES signs with the task's role: no key)"),
  s("boldsign", "PLATFORM_BOLDSIGN_API_KEY", true, z.string().regex(/^[A-Za-z0-9+/=_-]{16,512}$/), "a BoldSign API key (16 or more characters)"),
  s("zoom", "PLATFORM_ZOOM_CLIENT_ID", false, z.string().regex(/^[A-Za-z0-9_-]{8,128}$/), "the Zoom app's client id"),
  s("zoom", "PLATFORM_ZOOM_CLIENT_SECRET", true, z.string().regex(/^[A-Za-z0-9_-]{16,256}$/), "the Zoom app's client secret (16 or more characters)"),
  s("zoom", "PLATFORM_ZOOM_WEBHOOK_SECRET_TOKEN", true, z.string().regex(/^[A-Za-z0-9_-]{16,256}$/), "the Zoom app's webhook secret token (16 or more characters)"),
  s("secret-box", "PLATFORM_SECRET_BOX_KEYS", true, z.string().refine((v) => v.split(",").every((e) => KEY_ENTRY.test(e.trim()))), "version:key pairs, comma-separated, each key 32 random bytes in base64 (e.g. 2:…=,1:…=)"),
  s("secret-box", "PLATFORM_SECRET_BOX_KEY_VERSION", false, z.string().regex(/^[1-9][0-9]{0,5}$/), "the key version new values are sealed with, one of the versions in PLATFORM_SECRET_BOX_KEYS"),
  // PF-4's sign-in settings (identity/port.ts identityConfig reads them from here, PF-24w): unset identity = no staff sign-in.
  opt("identity", "PLATFORM_IDENTITY", false, z.enum(["local", "cognito"]), "local or cognito (unset: no staff sign-in on this server)"),
  opt("identity", "PLATFORM_POOL_MFA_REQUIRED", false, z.enum(["true", "false"]), "true or false (unset: true)"),
  opt("identity", "PLATFORM_LOCAL_SECRET", true, z.string().min(32), "at least 32 characters (unset: a random key per start)"),
  // PF-4s (SA-7-1, SA-7-2): our own staff's sign-in, a second pool apart from every firm's staff (system-identity/). Unset
  // identity = no sign-in for our staff on this server (every /api/system route answers 401).
  opt("system-identity", "PLATFORM_SYSTEM_IDENTITY", false, z.enum(["local", "cognito"]), "local or cognito (unset: no sign-in for our own staff on this server)"),
  opt("system-identity", "PLATFORM_SYSTEM_COGNITO_USER_POOL_ID", false, z.string().regex(/^[a-z]{2}-[a-z]+-[0-9]_[A-Za-z0-9]{1,55}$/), "our own staff's user pool id such as ca-central-1_AbC123 (never the firm staff's pool)"),
  opt("system-identity", "PLATFORM_SYSTEM_COGNITO_CLIENT_ID", false, z.string().regex(/^[A-Za-z0-9]{1,128}$/), "our own staff pool's app client id (letters and digits)"),
  opt("system-identity", "PLATFORM_SYSTEM_LOCAL_SECRET", true, z.string().min(32), "at least 32 characters, never PLATFORM_LOCAL_SECRET's value (unset: a random key per start)"),
  // PF-4 (P-571 (2)): the Sample seed at start-up (identity/sample-seed.ts).
  opt("sample-seed", "PLATFORM_SAMPLE_SEED", false, z.enum(["on", "off"]), "on or off (unset: off)"),
  // PF-8b F2b: the domain firm addresses live under (`<firm>.<this>`); the deploy sets the stack's domain. `localhost` is
  // always kept as well (web-address/rules.ts).
  opt("web-address", "PLATFORM_ADDRESS_SUFFIX", false, z.string().regex(ADDRESS_SUFFIX_PATTERN), `a lower-case domain of two or more labels such as staging.example.com (unset: ${DEFAULT_ADDRESS_SUFFIX})`),
]);

/** The names whose values are secret: PF-23's log redaction drops them by name (and their values, wherever they appear). */
export const SECRET_SETTING_NAMES: readonly string[] = Object.freeze(SETTINGS.filter((x) => x.secret).map((x) => x.name));

export type SecretBoxKeys = { current: number; keys: ReadonlyMap<number, Secret> };
export type PlatformConfig = Readonly<{
  environment: PlatformEnvironment;
  databaseUrl: Secret;
  cognito: Readonly<{ userPoolId: string | null; clientId: string | null }>;
  stripe: Readonly<{ secretKey: Secret | null; webhookSecret: Secret | null; connectWebhookSecret?: Secret | null }>;
  ses: Readonly<{ region: string | null }>;
  boldsign: Readonly<{ apiKey: Secret | null }>;
  zoom: Readonly<{ clientId: string | null; clientSecret: Secret | null; webhookSecretToken: Secret | null }>;
  /** null when this server holds no secret-box key (local only): sealing or opening then says so. */
  secretBox: SecretBoxKeys | null;
  /** PF-4's sign-in: which adapter, the pool's two-step rule, the local stand-in's signing key (local only). */
  identity: Readonly<{ via: "local" | "cognito" | "none"; poolMfaRequired: boolean; localSecret: Secret | null }>;
  /** PF-4s: our own staff's sign-in: which adapter, its own pool and client, the local stand-in's own signing key. */
  systemIdentity: Readonly<{ via: "local" | "cognito" | "none"; userPoolId: string | null; clientId: string | null; localSecret: Secret | null }>;
  /** PF-4 (P-571 (2)): PLATFORM_SAMPLE_SEED=on (production never seeds; sample-seed.ts says so). */
  sampleSeed: boolean;
  /** PF-8b F2b: the domain firm addresses live under (PLATFORM_ADDRESS_SUFFIX, unset: expatready.com). */
  addressSuffix: string;
}>;

/** The configuration cannot start the app. Holds setting names only, never a value. */
export class ConfigRefused extends Error {
  constructor(readonly environment: string, readonly missing: string[], readonly invalid: { name: string; expects: string }[]) {
    super([
      `The app cannot start (PLATFORM_ENVIRONMENT=${environment}).`,
      missing.length ? `Missing required setting${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` : "",
      missing.includes("PLATFORM_ENVIRONMENT") ? "Set PLATFORM_ENVIRONMENT to local, test or production (there is no default)." : "",
      ...invalid.map((i) => `${i.name} is set but not valid: expected ${i.expects}.`),
      "Values are never shown. How to supply them: deploy/RUNBOOK-secrets.md.",
    ].filter(Boolean).join(" "));
    this.name = "ConfigRefused";
  }
}

/** A read-only view of a private Map: no set, delete or clear, and not a Map, so Map.prototype.set.call on it throws
 *  too (break m6). The key ring is fixed once loaded. */
function frozenMap<K, V>(src: Map<K, V>): ReadonlyMap<K, V> {
  const m = new Map(src);
  const view: ReadonlyMap<K, V> = {
    get: (k) => m.get(k), has: (k) => m.has(k), get size() { return m.size; },
    forEach: (cb, self) => m.forEach((v, k) => cb.call(self, v, k, view)),
    entries: () => m.entries(), keys: () => m.keys(), values: () => m.values(), [Symbol.iterator]: () => m[Symbol.iterator](),
  };
  return Object.freeze(view);
}

/** Reads and checks every setting from `env`; throws ConfigRefused naming each missing or invalid one. */
export function loadPlatformConfig(env: NodeJS.ProcessEnv): PlatformConfig {
  const rawEnv = (env.PLATFORM_ENVIRONMENT ?? "").trim();
  // Required, no default (PF-24w): a deploy, a lane or a test that forgot it never starts as local, the most permissive
  // setting (rev 16.5; PF-24's break m7 refused it on AWS only).
  if (!rawEnv) throw new ConfigRefused("unset", ["PLATFORM_ENVIRONMENT"], []);
  // The refusal never repeats what was set (it may be a pasted key, break m1).
  if (!(ENVIRONMENTS as readonly string[]).includes(rawEnv)) throw new ConfigRefused("not recognised", [], [{ name: "PLATFORM_ENVIRONMENT", expects: "local, test or production" }]);
  const environment = rawEnv as PlatformEnvironment;
  const required = environment !== "local";
  const missing: string[] = [], invalid: { name: string; expects: string }[] = [];
  const got = new Map<string, string>();
  for (const x of SETTINGS) {
    const v = env[x.name]?.trim();
    if (!v) { if (required && !x.optional) missing.push(x.name); continue; }
    if (!x.rule.safeParse(v).success) { invalid.push({ name: x.name, expects: x.expects }); continue; }
    got.set(x.name, v);
  }
  // Rules across settings (names only in what they say).
  const stripeKey = got.get("PLATFORM_STRIPE_SECRET_KEY");
  if (stripeKey && /^(sk|rk)_live_/.test(stripeKey) && environment !== "production") invalid.push({ name: "PLATFORM_STRIPE_SECRET_KEY", expects: `a test-mode key (sk_test_… or rk_test_…): a live key is refused when PLATFORM_ENVIRONMENT=${environment}` });
  // PF-4's rule, here since PF-24w: the local stand-in never runs in the test environment or production.
  if (got.get("PLATFORM_IDENTITY") === "local" && environment !== "local") invalid.push({ name: "PLATFORM_IDENTITY", expects: `cognito, or unset: PLATFORM_IDENTITY=local is refused when PLATFORM_ENVIRONMENT=${environment} (the local stand-in never runs in the test environment or production)` });
  // PF-4s: the same rule for our own staff's stand-in; and the two sign-in groups never share a pool or a signing key
  // (SA-7-1: a firm's token must never verify as our staff's, nor ours as a firm's).
  if (got.get("PLATFORM_SYSTEM_IDENTITY") === "local" && environment !== "local") invalid.push({ name: "PLATFORM_SYSTEM_IDENTITY", expects: `cognito, or unset: PLATFORM_SYSTEM_IDENTITY=local is refused when PLATFORM_ENVIRONMENT=${environment} (the local stand-in never runs in the test environment or production)` });
  // Cognito for our staff names its own pool and client, or the start-up stops (review m5: never a quiet "not set up").
  if (got.get("PLATFORM_SYSTEM_IDENTITY") === "cognito") for (const n of ["PLATFORM_SYSTEM_COGNITO_USER_POOL_ID", "PLATFORM_SYSTEM_COGNITO_CLIENT_ID"])
    if (!got.has(n) && !invalid.some((i) => i.name === n)) missing.push(n);
  if (got.has("PLATFORM_SYSTEM_COGNITO_USER_POOL_ID") && got.get("PLATFORM_SYSTEM_COGNITO_USER_POOL_ID") === got.get("PLATFORM_COGNITO_USER_POOL_ID")) invalid.push({ name: "PLATFORM_SYSTEM_COGNITO_USER_POOL_ID", expects: "a pool of its own: our own staff never share PLATFORM_COGNITO_USER_POOL_ID's pool with firm staff" });
  if (got.has("PLATFORM_SYSTEM_LOCAL_SECRET") && got.get("PLATFORM_SYSTEM_LOCAL_SECRET") === got.get("PLATFORM_LOCAL_SECRET")) invalid.push({ name: "PLATFORM_SYSTEM_LOCAL_SECRET", expects: "a key of its own: never the same value as PLATFORM_LOCAL_SECRET" });
  let secretBox: SecretBoxKeys | null = null;
  const keysRaw = got.get("PLATFORM_SECRET_BOX_KEYS"), versionRaw = got.get("PLATFORM_SECRET_BOX_KEY_VERSION");
  if (keysRaw || versionRaw) {
    // One without the other is refused even locally: half a key ring would seal nothing and say nothing.
    for (const n of ["PLATFORM_SECRET_BOX_KEYS", "PLATFORM_SECRET_BOX_KEY_VERSION"])
      if (!got.has(n) && !missing.includes(n) && !invalid.some((i) => i.name === n)) missing.push(n);
    if (keysRaw && versionRaw) {
      const keys = new Map<number, Secret>();
      let dup = false;
      for (const e of keysRaw.split(",").map((t) => t.trim())) {
        const at = e.indexOf(":"), version = Number(e.slice(0, at));
        if (keys.has(version)) dup = true;
        keys.set(version, new Secret(`PLATFORM_SECRET_BOX_KEYS v${version}`, e.slice(at + 1)));
      }
      const current = Number(versionRaw);
      // Compared as bytes, in canonical base64 only: two spellings of one key never pass as two keys (break m2).
      const bytes = [...keys.values()].map((k) => Buffer.from(k.reveal(), "base64"));
      const canonical = [...keys.values()].every((k) => Buffer.from(k.reveal(), "base64").toString("base64") === k.reveal());
      const distinct = new Set(bytes.map((b) => b.toString("hex"))).size === keys.size;
      const random = bytes.every((b) => b.length === 32 && new Set(b).size > 8);
      if (dup || !distinct || !canonical || !random) invalid.push({ name: "PLATFORM_SECRET_BOX_KEYS", expects: "each version once, each with its own random 32-byte key written as openssl rand -base64 32 prints it" });
      else if (!keys.has(current)) invalid.push({ name: "PLATFORM_SECRET_BOX_KEY_VERSION", expects: "one of the versions listed in PLATFORM_SECRET_BOX_KEYS" });
      else secretBox = Object.freeze({ current, keys: frozenMap(keys) });
    }
  }
  if (missing.length || invalid.length) throw new ConfigRefused(environment, missing, invalid);
  const secret = (name: string) => (got.has(name) ? new Secret(name, got.get(name)!) : null);
  const plain = (name: string) => got.get(name) ?? null;
  return Object.freeze({
    environment,
    databaseUrl: secret("DATABASE_URL") ?? new Secret("DATABASE_URL", LOCAL_DATABASE_URL),
    cognito: Object.freeze({ userPoolId: plain("PLATFORM_COGNITO_USER_POOL_ID"), clientId: plain("PLATFORM_COGNITO_CLIENT_ID") }),
    stripe: Object.freeze({ secretKey: secret("PLATFORM_STRIPE_SECRET_KEY"), webhookSecret: secret("PLATFORM_STRIPE_WEBHOOK_SECRET"), connectWebhookSecret: secret("PLATFORM_STRIPE_CONNECT_WEBHOOK_SECRET") }),
    ses: Object.freeze({ region: plain("PLATFORM_SES_REGION") }),
    boldsign: Object.freeze({ apiKey: secret("PLATFORM_BOLDSIGN_API_KEY") }),
    zoom: Object.freeze({ clientId: plain("PLATFORM_ZOOM_CLIENT_ID"), clientSecret: secret("PLATFORM_ZOOM_CLIENT_SECRET"), webhookSecretToken: secret("PLATFORM_ZOOM_WEBHOOK_SECRET_TOKEN") }),
    secretBox,
    identity: Object.freeze({ via: (plain("PLATFORM_IDENTITY") ?? "none") as "local" | "cognito" | "none", poolMfaRequired: plain("PLATFORM_POOL_MFA_REQUIRED") !== "false", localSecret: secret("PLATFORM_LOCAL_SECRET") }),
    systemIdentity: Object.freeze({ via: (plain("PLATFORM_SYSTEM_IDENTITY") ?? "none") as "local" | "cognito" | "none", userPoolId: plain("PLATFORM_SYSTEM_COGNITO_USER_POOL_ID"), clientId: plain("PLATFORM_SYSTEM_COGNITO_CLIENT_ID"), localSecret: secret("PLATFORM_SYSTEM_LOCAL_SECRET") }),
    sampleSeed: plain("PLATFORM_SAMPLE_SEED") === "on",
    addressSuffix: plain("PLATFORM_ADDRESS_SUFFIX") ?? DEFAULT_ADDRESS_SUFFIX,
  });
}

/**
 * Secret settings taken out of process.env once loaded, so a child process (a PDF reader, the AI launcher, the form
 * filler: each starts with the server's environment) never inherits them (break M1). DATABASE_URL stays: api/src/core.ts
 * reads it from the environment itself (outside api/src/platform/; a later row moves it to this loader) and child jobs
 * may use it.
 */
export const SCRUBBED_FROM_ENV: readonly string[] = Object.freeze(SECRET_SETTING_NAMES.filter((n) => n !== "DATABASE_URL"));

/** PF-15 (SA-3-40): our shared team inbox, alerted when a firm with no account manager goes over its storage limit.
 *  Sample: no real address until the founder names one (there is no account manager on main). */
export const TEAM_INBOX_SAMPLE = "team-inbox@expatready.example";

let loaded: PlatformConfig | null = null;
/** This process's configuration, read from process.env the first time it is asked for and then kept (read once). */
export function platformConfig(): PlatformConfig {
  if (!loaded) {
    loaded = loadPlatformConfig(process.env);
    for (const n of SCRUBBED_FROM_ENV) delete process.env[n];
  }
  return loaded;
}
