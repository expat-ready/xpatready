// PF-8b (map row 1; the cloud halves of rows 15 and 24): the app service on Fargate with its secrets, mail and firm
// addresses, added to each environment's stack. Synth only: nothing is deployed, no AWS account (P-551).
//  * ECR repository (immutable tags, scanned on push); the image is PF-7's Dockerfile, run by digest only (a parameter
//    PF-8c's deploy fills: `ImageDigest`, sha256:…), never by a tag.
//  * ECS Fargate service of at least two tasks in the app subnets of two zones (RFP "Availability"), behind an internet-
//    facing Application Load Balancer: HTTPS only (TLS 1.2 or 1.3), port 80 answers with a redirect and nothing else.
//  * Task definition: PLATFORM_ENVIRONMENT=production and PLATFORM_IDENTITY=cognito set explicitly (rev 16.5); every
//    value PF-24's loader (api/src/platform/config/settings.ts) needs that is not known at synth is injected from AWS
//    Secrets Manager by name (SA-8-1 "supplied at deploy"), never a plain environment value. Only the execution role reads
//    those secrets, and only its own task definition's; the task role reads none.
//  * Migrations: a separate one-off task definition (`prisma migrate deploy`) holding the table owner's address; the
//    service holds only the app role's address (xr_app, owns no table: PF-12's split, rev 16.2). PF-8c runs the
//    migration task before it updates the service.
//  * Mail: an SES identity for the environment's domain with DKIM, a MAIL FROM subdomain with its SPF record (so SPF never
//    touches the apex, which may already carry the founder's mail provider's record) and a DMARC record (Sample policy).
//  * Firm addresses (PF-25, AG-4-16): a hosted zone with `*.<domain>` pointing at the load balancer and a wildcard ACM
//    certificate on it, so `<firm>.<domain>` reaches the app. Production's domain is `expatready.com`, staging's the
//    `staging.` sub-zone (P-607 (2)); `-c xr:domain=<name>` changes it.
//  * Cognito: three separate user pools in ca-central-1, the firms' staff (PF-4b), our own staff (PF-4s) and the firms'
//    clients (PF-4p), each with its own app client; both staff pools require two-step sign-in (P-567).
// Log groups and alarms are PF-23c's (not here); the deploy, rollback and smoke test are PF-8c's.
// Sizes (CPU, memory) and the DMARC policy are Sample.
import { CfnOutput, CfnParameter, Duration, Fn, RemovalPolicy, Stack, aws_certificatemanager as acm, aws_cognito as cognito, aws_ec2 as ec2, aws_ecr as ecr, aws_ecs as ecs, aws_elasticloadbalancingv2 as elbv2, aws_kms as kms, aws_rds as rds, aws_route53 as route53, aws_route53_targets as targets, aws_secretsmanager as sm, aws_ses as ses } from "aws-cdk-lib";
import { Construct } from "constructs";

export type Stage = "staging" | "production";
/** P-607 (2): firms at `<firm>.expatready.com` on Route 53 in the founder's account, with a `staging.` sub-zone. */
export const DEFAULT_DOMAIN = "expatready.com";
export const CONTAINER_PORT = 8080; // deploy/container-entry.mjs (PF-7)
export const MIN_TASKS = 2;

/** The values PF-24's loader requires in production that are unknown at synth: each one a Secrets Manager secret named
 *  `xr/<stage>/<NAME>`, supplied at deploy (deploy/RUNBOOK-secrets.md). The Cognito ids and the SES region are known
 *  here, so they are plain settings. DATABASE_URL and APP_DATABASE_URL both carry the app role's address: the service
 *  never holds the owner's (firm-scope.ts appDatabaseUrl reads APP_DATABASE_URL first). */
export const SERVICE_SECRETS = [
  "DATABASE_URL", "APP_DATABASE_URL", "PLATFORM_STRIPE_SECRET_KEY", "PLATFORM_STRIPE_WEBHOOK_SECRET", "PLATFORM_BOLDSIGN_API_KEY",
  "PLATFORM_ZOOM_CLIENT_ID", "PLATFORM_ZOOM_CLIENT_SECRET", "PLATFORM_ZOOM_WEBHOOK_SECRET_TOKEN", "PLATFORM_SECRET_BOX_KEYS", "PLATFORM_SECRET_BOX_KEY_VERSION",
] as const;
export const POOLS = ["staff", "own-staff", "clients"] as const;

export interface AppServiceProps {
  stage: Stage;
  vpc: ec2.IVpc;
  key: kms.IKey;
  database: rds.DatabaseInstance;
  /** Overrides the domain (default `expatready.com`; staging uses `staging.<domain>`). */
  domain?: string;
}

export class AppService extends Construct {
  readonly repository: ecr.Repository;
  readonly service: ecs.FargateService;
  readonly task: ecs.FargateTaskDefinition;
  readonly migration: ecs.FargateTaskDefinition;
  readonly zone: route53.PublicHostedZone;
  readonly certificate: acm.Certificate;
  readonly pools: Record<(typeof POOLS)[number], cognito.UserPool>;
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: AppServiceProps) {
    super(scope, id);
    const { stage, vpc, key } = props;
    const region = Stack.of(this).region;
    const base = props.domain ?? DEFAULT_DOMAIN;
    const domain = stage === "production" ? base : `staging.${base}`;

    // --- the image: ECR, run by digest only
    this.repository = new ecr.Repository(this, "Images", {
      repositoryName: `xr-${stage}-studio`,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.KMS,
      encryptionKey: key,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const digest = new CfnParameter(this, "ImageDigest", {
      type: "String",
      allowedPattern: "^sha256:[a-f0-9]{64}$",
      description: "The studio image's digest in this stack's repository (PF-8c's deploy fills it; never a tag)",
    });
    const image = ecs.ContainerImage.fromRegistry(this.repository.repositoryUriForDigest(digest.valueAsString));

    // --- secrets: names only here, values supplied at deploy (SA-8-1)
    const secret = (name: string) => new sm.Secret(this, `Secret${name}`, {
      secretName: `xr/${stage}/${name}`,
      description: `Expat Ready ${stage}: ${name} (supplied at deploy; deploy/RUNBOOK-secrets.md). Created holding a random placeholder, which the app refuses.`,
      encryptionKey: key,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const appSecrets = Object.fromEntries(SERVICE_SECRETS.filter((n) => n !== "APP_DATABASE_URL").map((n) => [n, secret(n)]));
    appSecrets.APP_DATABASE_URL = appSecrets.DATABASE_URL; // one secret, the app role's address, under both names
    const ownerUrl = secret("DATABASE_OWNER_URL"); // the table owner's address: the migration task's only

    // --- Cognito: three separate pools (PF-4b staff, PF-4s our own staff, PF-4p clients)
    const pool = (name: (typeof POOLS)[number], staff: boolean) => {
      const p = new cognito.UserPool(this, `Pool-${name}`, {
        userPoolName: `xr-${stage}-${name}`,
        selfSignUpEnabled: false, // staff are invited (PF-4b); our own staff added by us (PF-4s); clients invited by a firm (PF-4p)
        signInAliases: { email: true },
        signInCaseSensitive: false,
        mfa: staff ? cognito.Mfa.REQUIRED : cognito.Mfa.OPTIONAL, // P-567: two-step for every staff member; clients: not known (PF-4p)
        mfaSecondFactor: { otp: true, sms: false },
        passwordPolicy: { minLength: 12, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: false }, // Sample
        accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        deletionProtection: true,
        removalPolicy: RemovalPolicy.RETAIN,
      });
      p.addClient("App", { generateSecret: false, preventUserExistenceErrors: true, authFlows: { userSrp: true } });
      return p;
    };
    this.pools = { staff: pool("staff", true), "own-staff": pool("own-staff", true), clients: pool("clients", false) };
    const staffClient = this.pools.staff.node.findChild("App") as cognito.UserPoolClient;

    // --- the service's task: settings explicit, secrets by reference
    this.task = new ecs.FargateTaskDefinition(this, "Task", { cpu: 1024, memoryLimitMiB: 2048, runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX } }); // Sample sizes
    this.task.addContainer("studio", {
      image,
      portMappings: [{ containerPort: CONTAINER_PORT }],
      environment: {
        PLATFORM_ENVIRONMENT: "production", // rev 16.5: explicit, never defaulted
        PLATFORM_IDENTITY: "cognito",
        PLATFORM_COGNITO_USER_POOL_ID: this.pools.staff.userPoolId,
        PLATFORM_COGNITO_CLIENT_ID: staffClient.userPoolClientId,
        PLATFORM_SES_REGION: region,
      },
      secrets: Object.fromEntries(Object.entries(appSecrets).map(([n, s]) => [n, ecs.Secret.fromSecretsManager(s)])),
      readonlyRootFilesystem: false, // the image writes var/ (PF-7)
    });
    this.repository.grantPull(this.task.obtainExecutionRole());

    // --- the migration task: the owner's address only, the same image, `prisma migrate deploy`
    this.migration = new ecs.FargateTaskDefinition(this, "Migrate", { cpu: 512, memoryLimitMiB: 1024 }); // Sample sizes
    this.migration.addContainer("migrate", {
      image,
      command: ["./node_modules/.bin/prisma", "migrate", "deploy"],
      environment: { PLATFORM_ENVIRONMENT: "production" },
      secrets: { DATABASE_URL: ecs.Secret.fromSecretsManager(ownerUrl) },
    });
    this.repository.grantPull(this.migration.obtainExecutionRole());

    // --- mail: SES with DKIM, SPF on a MAIL FROM subdomain, DMARC (Sample policy)
    this.zone = new route53.PublicHostedZone(this, "Zone", { zoneName: domain, comment: `Expat Ready ${stage}: firm addresses <firm>.${domain} (PF-25)` });
    const identity = new ses.EmailIdentity(this, "Mail", {
      identity: ses.Identity.publicHostedZone(this.zone),
      dkimSigning: true,
      mailFromDomain: `mail.${domain}`,
    });
    new route53.TxtRecord(this, "Dmarc", { zone: this.zone, recordName: `_dmarc.${domain}`, values: ["v=DMARC1; p=none; adkim=s; aspf=r"] }); // Sample: monitor first; SPF relaxed (MAIL FROM is mail.<domain>), DKIM strict
    identity.grantSendEmail(this.task.taskRole);

    // --- network: load balancer in the public subnets, tasks in the app subnets, the database reachable from both tasks
    const albSg = new ec2.SecurityGroup(this, "LbSg", { vpc, allowAllOutbound: false, description: "load balancer: 443 and 80 (redirect) in" });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP, answered with a redirect only");
    const svcSg = new ec2.SecurityGroup(this, "ServiceSg", { vpc, description: "studio tasks: the load balancer only" });
    svcSg.addIngressRule(albSg, ec2.Port.tcp(CONTAINER_PORT), "from the load balancer");
    albSg.addEgressRule(svcSg, ec2.Port.tcp(CONTAINER_PORT), "to the tasks");
    const migrateSg = new ec2.SecurityGroup(this, "MigrateSg", { vpc, description: "migration task: no inbound" });
    props.database.connections.allowDefaultPortFrom(svcSg, "studio tasks");
    props.database.connections.allowDefaultPortFrom(migrateSg, "migration task");
    new CfnOutput(this, "MigrateSecurityGroup", { value: migrateSg.securityGroupId });
    new CfnOutput(this, "AppSubnets", { value: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds.join(",") });

    this.service = new ecs.FargateService(this, "Service", {
      cluster: new ecs.Cluster(this, "Cluster", { vpc, containerInsightsV2: ecs.ContainerInsights.ENABLED }),
      taskDefinition: this.task,
      desiredCount: MIN_TASKS,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [svcSg],
      assignPublicIp: false,
      circuitBreaker: { enable: true, rollback: true }, // PF-8c proves the rollback in the account
    });

    this.certificate = new acm.Certificate(this, "Wildcard", { domainName: `*.${domain}`, validation: acm.CertificateValidation.fromDns(this.zone) });
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "Lb", {
      vpc, internetFacing: true, securityGroup: albSg, vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, dropInvalidHeaderFields: true,
    });
    const https = this.loadBalancer.addListener("Https", { port: 443, protocol: elbv2.ApplicationProtocol.HTTPS, certificates: [this.certificate], sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS, open: false });
    https.addTargets("Studio", {
      port: CONTAINER_PORT, protocol: elbv2.ApplicationProtocol.HTTP, targets: [this.service],
      healthCheck: { path: "/api/health/live", healthyHttpCodes: "200", interval: Duration.seconds(15) },
      deregistrationDelay: Duration.seconds(30),
    });
    this.loadBalancer.addListener("Http", { port: 80, open: false, defaultAction: elbv2.ListenerAction.redirect({ protocol: "HTTPS", port: "443", permanent: true }) });

    new route53.ARecord(this, "Firms", { zone: this.zone, recordName: `*.${domain}`, target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(this.loadBalancer)) });
    // Delegation: these name servers go at the parent (the registrar for production, `base`'s zone for staging; README).
    new CfnOutput(this, "NameServers", { value: Fn.join(",", this.zone.hostedZoneNameServers!), description: `NS records for ${domain} at its parent` });
  }
}
