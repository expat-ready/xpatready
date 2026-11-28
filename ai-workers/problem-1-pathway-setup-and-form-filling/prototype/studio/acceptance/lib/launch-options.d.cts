// Types for launch-options.cjs (LR-179, LR-182), so the .ts checks import it under TypeScript strict.
type LaunchOpts = { channel?: string; executablePath?: string; headless?: boolean; [k: string]: unknown };
type Machine = { platform: string; exists: (p: string) => boolean; own?: string };
declare const lib: {
  CHROME: string;
  PW_IMAGE: string;
  chromeChannel(env?: Machine): boolean;
  launchOptions<T extends LaunchOpts>(extra?: T, env?: Machine): T & { channel?: string };
  chromiumOptions<T extends LaunchOpts>(extra?: T, env?: Machine): T & { channel?: string; executablePath?: string };
  browsersPath(env?: Record<string, string | undefined>, platform?: string): string;
  ffmpegRevision(): string | null;
  videoGap(env?: Record<string, string | undefined>, platform?: string, exists?: (p: string) => boolean): string | null;
};
export = lib;
