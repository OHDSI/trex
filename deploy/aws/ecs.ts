import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { Sizing } from "../shared/config";
import {
  TREX_PORT,
  TREX_HEALTH_CHECK,
  buildTrexEnvVars,
} from "../shared/containers";

export interface EcsResult {
  cluster: aws.ecs.Cluster;
  service: aws.ecs.Service;
  taskDefinition: aws.ecs.TaskDefinition;
}

export function createEcs(opts: {
  env: string;
  sizing: Sizing;
  ghcrImage: string;
  vpcId: pulumi.Input<string>;
  subnetIds: pulumi.Input<string[]>;
  securityGroupId: pulumi.Input<string>;
  targetGroupArn: pulumi.Input<string>;
  databaseUrl: pulumi.Input<string>;
  authSecret: pulumi.Input<string>;
  endpointUrl: pulumi.Input<string>;
  s3BucketName: pulumi.Input<string>;
  pluginsInformationUrl?: string;
  tpmRegistryUrl?: string;
}): EcsResult {
  const cluster = new aws.ecs.Cluster(`trex-${opts.env}-cluster`, {
    settings: [{ name: "containerInsights", value: "enabled" }],
  });

  // IAM roles
  const executionRole = new aws.iam.Role(`trex-${opts.env}-execution-role`, {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
        },
      ],
    }),
  });

  new aws.iam.RolePolicyAttachment(`trex-${opts.env}-execution-policy`, {
    role: executionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });

  const taskRole = new aws.iam.Role(`trex-${opts.env}-task-role`, {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
        },
      ],
    }),
  });

  // S3 access for storage plugin
  new aws.iam.RolePolicy(`trex-${opts.env}-task-s3-policy`, {
    role: taskRole.name,
    policy: pulumi.output(opts.s3BucketName).apply((bucket) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
            Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
          },
        ],
      })
    ),
  });

  const logGroup = new aws.cloudwatch.LogGroup(`trex-${opts.env}-logs`, {
    name: `/ecs/trex-${opts.env}-${pulumi.getStack()}`,
    retentionInDays: 30,
  });

  const region = aws.getRegionOutput().name;
  const trexEnv = pulumi
    .all([opts.databaseUrl, opts.authSecret, opts.endpointUrl, opts.s3BucketName, region])
    .apply(([dbUrl, secret, endpoint, bucket, awsRegion]) =>
      buildTrexEnvVars({
        databaseUrl: dbUrl,
        authSecret: secret,
        endpointUrl: endpoint,
        pluginsInformationUrl: opts.pluginsInformationUrl,
        tpmRegistryUrl: opts.tpmRegistryUrl,
        s3Bucket: bucket,
        s3Region: awsRegion,
      })
    );

  const logGroupName = logGroup.name;
  const containerDefinitions = pulumi
    .all([trexEnv, opts.s3BucketName, logGroupName, region])
    .apply(([tEnv, bucketName, lgName, awsRegion]) =>
      JSON.stringify([
        {
          name: "trex",
          image: opts.ghcrImage,
          essential: true,
          portMappings: [
            { containerPort: 8001, protocol: "tcp" },
            { containerPort: TREX_PORT, protocol: "tcp" },
          ],
          environment: Object.entries(tEnv).map(([name, value]) => ({ name, value })),
          healthCheck: {
            command: ["CMD-SHELL", `curl -sf http://localhost:8001${TREX_HEALTH_CHECK.path} || exit 1`],
            interval: TREX_HEALTH_CHECK.intervalSeconds,
            timeout: TREX_HEALTH_CHECK.timeoutSeconds,
            retries: TREX_HEALTH_CHECK.unhealthyThreshold,
            startPeriod: 120,
          },
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": lgName,
              "awslogs-region": awsRegion,
              "awslogs-stream-prefix": "trex",
            },
          },
        },
      ])
    );

  const taskDefinition = new aws.ecs.TaskDefinition(`trex-${opts.env}-task`, {
    family: `trex-${opts.env}`,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: String(opts.sizing.cpu),
    memory: String(opts.sizing.memory),
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions,
  });

  const service = new aws.ecs.Service(`trex-${opts.env}-service`, {
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
    desiredCount: opts.sizing.minReplicas,
    launchType: "FARGATE",
    networkConfiguration: {
      subnets: opts.subnetIds,
      securityGroups: [opts.securityGroupId],
      assignPublicIp: false,
    },
    loadBalancers: [
      {
        targetGroupArn: opts.targetGroupArn,
        containerName: "trex",
        containerPort: 8001,
      },
    ],
  });

  return { cluster, service, taskDefinition };
}
