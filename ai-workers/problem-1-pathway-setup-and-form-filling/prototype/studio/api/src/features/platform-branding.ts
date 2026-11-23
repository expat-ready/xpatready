// PF-13: the firm's branding (api/src/platform/branding/): GET|PUT /api/platform/branding, PUT|DELETE
// /api/platform/branding/:kind (logo, favicon, banner; part 1b), and the public reads under /api/public/firms/:firmKey/branding.
// The one email layout reads it at send time (platform/messages/send/messages.ts, platform/messages/layout/).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { LocalFiles } from "../front-office/files.ts";
import { filesProviders } from "../platform/files/choose.ts";
import { publicBaseUrl } from "../platform/branding/image-setting.ts";
import { BrandingImages } from "../platform/branding/images.ts";
import { BrandingController, BrandingPublicController } from "../platform/branding/routes.ts";

export default {
  controllers: [BrandingController, BrandingPublicController],
  providers: [...filesProviders, { provide: BrandingImages, useFactory: (db: Db, files: LocalFiles) => new BrandingImages({ db, files, publicBase: publicBaseUrl() }), inject: [Db, LocalFiles] }],
} satisfies Feature;
