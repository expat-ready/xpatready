// Types for launch-options.cjs (LR-179), so the .ts checks import it under TypeScript strict.
type LaunchOpts = { channel?: string; executablePath?: string; headless?: boolean; [k: string]: unknown };
type Machine = { platform: string; exists: (p: string) => boolean };
declare const lib: {
  CHROME: string;
  chromeChannel(env?: Machine): boolean;
  launchOptions<T extends LaunchOpts>(extra?: T, env?: Machine): T & { channel?: string };
  browsersPath(env?: Record<string, string | undefined>, platform?: string): string;
  ffmpegRevision(): string | null;
  videoGap(env?: Record<string, string | undefined>, platform?: string, exists?: (p: string) => boolean): string | null;
};
export = lib;
