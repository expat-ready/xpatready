// PF-F1 (rows rev 16.5 "fail closed"): which FilesPort adapter this server uses, by PLATFORM_FILES=local|s3.
//  * unset in production (NODE_ENV=production or PLATFORM_ENVIRONMENT=production) stops the start-up: production never
//    falls back to a folder on the server's own disk without being told to;
//  * unset anywhere else is `local` (the Mac, lane copies, CI);
//  * any other value stops the start-up, in every environment;
//  * `s3` needs PLATFORM_FILES_BUCKET and PLATFORM_FILES_KMS_KEY_ID; PLATFORM_FILES_REGION is optional (unset:
//    ca-central-1, AG-9-19; only a region in Canada, P-559). S3 signs with the task's role: no key is a setting (PF-24).
// A refusal names the setting and the rule it broke, never a value. Test: tests/check_pff1_s3_files.ts.
import { LocalFiles } from "../../front-office/files.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import { BUCKET_NAME, CANADA_REGIONS, DEFAULT_FILES_REGION, KMS_KEY, S3Files, type S3FilesOptions } from "./s3-files.ts";

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
