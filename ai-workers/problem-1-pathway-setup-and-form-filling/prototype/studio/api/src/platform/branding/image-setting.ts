// PF-13 part 1b: which image a firm uses now, as registered settings (one audit line per change, hash and size only), and
// its stable public link. Kept apart from images.ts (the upload and the public doors) so the email brand (branding.ts)
// can read the logo link without an import cycle.
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { readSetting, registerSetting } from "../settings.ts";

type DbOrTx = PrismaClient | Prisma.TransactionClient;

export const IMAGE_KINDS = ["logo", "favicon", "banner"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
const KB = 1024, MB = 1024 * KB;
/** Sample limits (brief PF-13; no source sets them). */
export const IMAGE_LIMITS: Record<ImageKind, { bytes: number; words: string }> = { logo: { bytes: 2 * MB, words: "2 MB" }, favicon: { bytes: 256 * KB, words: "256 KB" }, banner: { bytes: 2 * MB, words: "2 MB" } };

export const StoredImage = z.strictObject({
  sha256: z.string().regex(/^[0-9a-f]{64}$/), mediaType: z.enum(["image/png", "image/jpeg"]),
  width: z.number().int().min(1).max(65535), height: z.number().int().min(1).max(65535),
}).nullable();
export type StoredImage = z.infer<typeof StoredImage>;

export const IMAGE_SETTING = Object.fromEntries(IMAGE_KINDS.map((k) => [k, registerSetting<StoredImage>({
  key: `platform.branding.${k}`, ownerModule: "platform", changePermission: "agent/settings:edit", schema: StoredImage, default: null,
  description: `The firm's ${k} (PNG or JPEG, metadata removed, at most ${IMAGE_LIMITS[k].words}; AG-1-6): its sha256, type and size in pixels. The bytes are in the firm's files under branding/${k}/. Unset: none (ExpatReady's neutral look).`,
})])) as Record<ImageKind, ReturnType<typeof registerSetting<StoredImage>>>;

export const isImageKind = (k: unknown): k is ImageKind => typeof k === "string" && (IMAGE_KINDS as readonly string[]).includes(k);
export const imageKey = (kind: ImageKind, img: NonNullable<StoredImage>) => `branding/${kind}/${img.sha256}.${img.mediaType === "image/png" ? "png" : "jpg"}`;
/** A link names its image: a new image is a new link (`?v=`), an old link stops answering. */
export const imageVersion = (img: NonNullable<StoredImage>) => img.sha256.slice(0, 16);
export function imageLink(base: string, firmKey: string, kind: ImageKind, img: StoredImage): string | null {
  return img ? `${base}/api/public/firms/${encodeURIComponent(firmKey)}/branding/${kind}?v=${imageVersion(img)}` : null;
}
/** The firm's current image of a kind; a stored value that no longer fits reads as none (never stops a page or an email). */
export async function readImage(db: DbOrTx, firmId: string, kind: ImageKind): Promise<StoredImage> {
  return readSetting<StoredImage>(db, firmId, IMAGE_SETTING[kind].key).catch(() => null);
}
/** The app's public address, as the messages feature builds it (features/platform-messages.ts). */
export const publicBaseUrl = () => process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}`;
