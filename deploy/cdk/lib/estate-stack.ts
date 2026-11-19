// PF-8a: one environment of the Canadian estate: network, database, file buckets. Synth only in this row;
// the service, secrets and DNS are PF-8b, the deploy from CI is PF-8c, the backup copy and drill are PF-8r.
import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import {
  BACKUP_DAYS,
  POSTGRES_FULL_VERSION,
  POSTGRES_MAJOR_VERSION,
  REGION,
  ZONES,
  type EnvironmentConfig,
} from './environments.ts';

/** The file areas of the product: client documents, exports, and the import area. */
export const BUCKET_PURPOSES = ['documents', 'exports', 'imports'] as const;

export interface EstateStackProps extends Omit<StackProps, 'env'> {
  readonly config: EnvironmentConfig;
}

export class EstateStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly dataKey: kms.Key;
  readonly database: rds.DatabaseInstance;
  readonly buckets: Record<(typeof BUCKET_PURPOSES)[number], s3.Bucket>;

  constructor(scope: Construct, id: string, props: EstateStackProps) {
    // The region is fixed here, not passed in: no caller can place an environment elsewhere (P-559).
    // No account is named, so synth needs no AWS keys; the account comes from the deploy role (PF-8c).
    super(scope, id, { ...props, env: { region: REGION } });
    const { config } = props;

    // One customer-managed key per environment for data at rest; kept if the stack is ever removed.
    this.dataKey = new kms.Key(this, 'DataKey', {
      description: `Data at rest, ${config.name}: database, its secret, file buckets`,
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Two zones. Public subnets hold only the NAT gateways (and PF-8b's load balancer); tasks run in private
    // subnets with outbound access; the database subnets have no route to or from the internet at all.
    this.vpc = new ec2.Vpc(this, 'Network', {
      availabilityZones: [...ZONES],
      natGateways: config.natGateways,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24, mapPublicIpOnLaunch: false },
        { name: 'tasks', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'database', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.of(POSTGRES_FULL_VERSION, POSTGRES_MAJOR_VERSION),
    });

    // No ingress rule is added here: PF-8b opens 5432 to the service's own security group only.
    const databaseAccess = new ec2.SecurityGroup(this, 'DatabaseAccess', {
      vpc: this.vpc,
      description: `PostgreSQL, ${config.name}: reached only from inside the network`,
      allowAllOutbound: false,
    });

    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine,
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseAccess],
      publiclyAccessible: false,
      multiAz: config.multiAz,
      instanceType: new ec2.InstanceType(config.databaseInstanceClass),
      storageType: rds.StorageType.GP3,
      allocatedStorage: config.databaseStorageGib,
      storageEncrypted: true,
      storageEncryptionKey: this.dataKey,
      credentials: rds.Credentials.fromGeneratedSecret('studio', { encryptionKey: this.dataKey }),
      databaseName: 'studio',
      // 35 days of automated backups; RDS restores to any point in time inside that window.
      backupRetention: Duration.days(BACKUP_DAYS),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      parameterGroup: new rds.ParameterGroup(this, 'DatabaseParameters', {
        engine,
        description: `PostgreSQL ${POSTGRES_MAJOR_VERSION}, ${config.name}: TLS only, terse errors`,
        parameters: {
          // Refuse any connection that is not TLS.
          'rds.force_ssl': '1',
          // Keep statement text and detail lines (which can carry personal data) out of the error log.
          log_error_verbosity: 'terse',
        },
      }),
    });

    const bucket = (purpose: (typeof BUCKET_PURPOSES)[number]) =>
      new s3.Bucket(this, `${purpose[0]!.toUpperCase()}${purpose.slice(1)}Bucket`, {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        versioned: true,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: this.dataKey,
        bucketKeyEnabled: true,
        // Adds the bucket policy that denies any request not made over TLS.
        enforceSSL: true,
        minimumTLSVersion: 1.2,
        removalPolicy: RemovalPolicy.RETAIN,
      });
    this.buckets = { documents: bucket('documents'), exports: bucket('exports'), imports: bucket('imports') };
  }
}
