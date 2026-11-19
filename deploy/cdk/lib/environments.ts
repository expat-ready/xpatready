// PF-8a: the two environments of the estate. Everything that differs between them is on this page.
// Residency (P-559): every stack lives in REGION; test/region.test.ts refuses anything else.
export const REGION = 'ca-central-1';

// Two of the region's zones, named so that synth needs no AWS account to look them up.
export const ZONES = ['ca-central-1a', 'ca-central-1b'] as const;

// The PostgreSQL version main runs in prototype/studio/deploy/compose.test.yml (18.3).
export const POSTGRES_FULL_VERSION = '18.3';
export const POSTGRES_MAJOR_VERSION = '18';

// The RDS maximum for automated backups (SA-2-21, SA-11-32); point-in-time restore covers the same window.
export const BACKUP_DAYS = 35;

export type EnvironmentName = 'staging' | 'production';

export interface EnvironmentConfig {
  readonly name: EnvironmentName;
  /** A standby database in the second zone. Production yes; staging no, for cost (P-562). */
  readonly multiAz: boolean;
  /** One per zone in production; one shared in staging, for cost (P-562). */
  readonly natGateways: number;
  /**
   * Sample (not decided): the smallest current-generation classes, so the stack synthesises.
   * The real size is set from a measurement before the first deploy (PF-8b); changing it here is one line.
   */
  readonly databaseInstanceClass: string;
  /** Sample (not decided): the gp3 minimum, in GiB. */
  readonly databaseStorageGib: number;
}

export const ENVIRONMENTS: Record<EnvironmentName, EnvironmentConfig> = {
  staging: { name: 'staging', multiAz: false, natGateways: 1, databaseInstanceClass: 't4g.micro', databaseStorageGib: 20 },
  production: { name: 'production', multiAz: true, natGateways: 2, databaseInstanceClass: 't4g.medium', databaseStorageGib: 20 },
};
