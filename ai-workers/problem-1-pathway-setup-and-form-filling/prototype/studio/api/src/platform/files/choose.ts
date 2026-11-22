// PF-F1 (rows rev 16.5 "fail closed"): which FilesPort adapter this server uses, by PLATFORM_FILES=local|s3.
//  * unset in production (NODE_ENV=production or PLATFORM_ENVIRONMENT=production) stops the start-up: production never
//    falls back to a folder on the server's own disk without being told to;
//  * unset anywhere else is `local` (the Mac, lane copies, CI);
//  * any other value stops the start-up, in every environment;
//  * `s3` needs PLATFORM_FILES_BUCKET and PLATFORM_FILES_KMS_KEY_ID; PLATFORM_FILES_REGION is optional (unset:
//    ca-central-1, AG-9-19; only a region in Canada, P-559). S3 signs with the task's role: no key is a setting (PF-24).
// A refusal names the setting and the rule it broke, never a value. Test: tests/check_pff1_s3_files.ts.
// PF-F1b: the one binding. `filesProviders` gives the app's FilesPort under the `LocalFiles` name the routes inject (the
// name is kept for now; a later row renames it) and S3FileLinks beside it; `boundFiles()` is the same store for the
// features that build their services by hand. The S3 links need PLATFORM_FILES_LINK_KEY (PF-24 secret, optional: a
// server on the local adapter starts without it; PLATFORM_FILES=s3 without it stops the start-up). Test:
// tests/check_pff1b_bind.ts.
import { LocalFiles } from "../../front-office/files.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import { platformConfig } from "../config/settings.ts";
import { PlatformClock } from "../identity/port.ts";
import { BUCKET_NAME, CANADA_REGIONS, DEFAULT_FILES_REGION, KMS_KEY, S3FileLinks, S3Files, type S3FilesOptions } from "./s3-files.ts";

export const FILES_ADAPTERS = ["local", "s3"] as const;
export type FilesAdapter = (typeof FILES_ADAPTERS)[number];
export type FilesEnv = Readonly<Record<string, string | undefined>>;

const set = (env: FilesEnv, name: string): string | null => { const v = env[name]?.trim(); return v ? v : null; };
const refuse = (text: string): never => { throw new Error(`configuration: ${text}`); };

/** Production however it is written (break m8): any case, spaces at the ends, or `prod`. */
const isProduction = (v: string | undefined) => ["production", "prod"].includes((v ?? "").trim().toLowerCase());

/** The adapter PLATFORM_FILES names, or the refusal. */
export function filesAdapterOf(env: FilesEnv = process.env): FilesAdapter {
  const v = set(env, "PLATFORM_FILES");
  if (v === null) {
    if (isProduction(env.NODE_ENV) || isProduction(env.PLATFORM_ENVIRONMENT)) return refuse("PLATFORM_FILES is not set (local or s3); production does not choose a file store by itself");
    return "local";
  }
  if (!(FILES_ADAPTERS as readonly string[]).includes(v)) return refuse("PLATFORM_FILES must be local or s3");
  return v as FilesAdapter;
}

/** The S3 settings, each checked; a missing or malformed one is refused by name. */
export function s3SettingsOf(env: FilesEnv = process.env): Pick<S3FilesOptions, "bucket" | "kmsKeyId"> & { region: string } {
  const bucket = set(env, "PLATFORM_FILES_BUCKET") ?? refuse("PLATFORM_FILES_BUCKET is not set (PLATFORM_FILES=s3 needs the bucket's name)");
  if (!BUCKET_NAME.test(bucket)) refuse("PLATFORM_FILES_BUCKET must be a bucket name (3 to 63 lower-case letters, digits or hyphens; no dots)");
  const kmsKeyId = set(env, "PLATFORM_FILES_KMS_KEY_ID") ?? refuse("PLATFORM_FILES_KMS_KEY_ID is not set (PLATFORM_FILES=s3 encrypts every file with this KMS key)");
  const kms = KMS_KEY.exec(kmsKeyId) ?? refuse("PLATFORM_FILES_KMS_KEY_ID must be a KMS key id, alias or ARN");
  const region = set(env, "PLATFORM_FILES_REGION") ?? DEFAULT_FILES_REGION;
  if (!CANADA_REGIONS.includes(region)) refuse("PLATFORM_FILES_REGION must be a region in Canada, ca-central-1 or ca-west-1 (P-559)");
  if (kms[2] && kms[2] !== region) refuse("PLATFORM_FILES_KMS_KEY_ID must be a key in the bucket's region");
  return { bucket, kmsKeyId, region };
}

/** The server's FilesPort. `s3` lets a test pass the recorded request handler. The local adapter keeps its own folder
 *  rule (FO_FILES_DIR, read from the same `env`; unset: LocalFiles' default). */
export function chooseFiles(env: FilesEnv = process.env, s3: Pick<S3FilesOptions, "requestHandler" | "credentials"> = {}): FilesPort {
  return filesAdapterOf(env) === "s3" ? new S3Files({ ...s3SettingsOf(env), ...s3 }) : new LocalFiles(set(env, "FO_FILES_DIR") ?? undefined);
}

/** Tests only: the recorded fake S3 client (tests/fixtures/pff1-s3/), put on globalThis under this symbol. Refused in
 *  production, so a test seam never reaches a real server. */
export const RECORDED_S3 = Symbol.for("expatready.pff1b.recordedS3");
let s3Bound: { settings: string; files: S3Files } | null = null;

/** The app's FilesPort, as PLATFORM_FILES names it: a LocalFiles each call (as the features made before), or one S3Files
 *  per process (one client, one connection pool). */
export function boundFiles(env: FilesEnv = process.env): FilesPort {
  if (filesAdapterOf(env) === "local") return chooseFiles(env);
  const recorded = (globalThis as Record<symbol, unknown>)[RECORDED_S3] as Pick<S3FilesOptions, "requestHandler"> | undefined;
  if (recorded && (isProduction(env.NODE_ENV) || isProduction(env.PLATFORM_ENVIRONMENT))) refuse("a recorded S3 client is a test seam and is refused in production");
  const settings = JSON.stringify([s3SettingsOf(env), !!recorded]);
  if (!s3Bound || s3Bound.settings !== settings || recorded) s3Bound = { settings, files: chooseFiles(env, recorded ?? {}) as S3Files };
  return s3Bound.files;
}

/** S3 download links for the bound store: null on the local adapter (the routes' FileLinks serve it); on S3 they need
 *  PLATFORM_FILES_LINK_KEY. */
export function boundLinks(files: FilesPort, now: () => number): S3FileLinks | null {
  if (!(files instanceof S3Files)) return null;
  const key = platformConfig().files.linkKey ?? refuse("PLATFORM_FILES_LINK_KEY is not set (PLATFORM_FILES=s3 signs its download links with it)");
  return new S3FileLinks(files, key, now);
}

/** The providers a feature lists to get the bound store (the same objects in every feature, so the app adds them once). */
export const filesProviders = Object.freeze([
  { provide: LocalFiles, useFactory: () => boundFiles() },
  { provide: S3FileLinks, useFactory: (files: FilesPort, clock: PlatformClock) => boundLinks(files, () => clock.now()), inject: [LocalFiles, PlatformClock] },
]);
