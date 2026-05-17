import * as pulumi from "@pulumi/pulumi";
import { DeployConfig, getSizing } from "../shared/config";
import { exportOutputs, StackOutputs } from "../shared/outputs";
import { createNetworking } from "./networking";
import { createRds } from "./rds";
import { createS3 } from "./s3";
import { createSecrets } from "./secrets";
import { createEcs } from "./ecs";

export function deployAws(config: DeployConfig) {
  const env = config.environment;
  const sizing = getSizing("aws", env);

  const secrets = createSecrets(env);

  // ACM certificate — optional; if not set, ALB uses HTTP only
  const certArn = new pulumi.Config("deploy").get("certificateArn");

  const networking = createNetworking(env, sizing, certArn);

  const rds = createRds(
    env,
    sizing,
    networking.vpc.vpcId,
    networking.vpc.privateSubnetIds,
    networking.rdsSecurityGroup.id,
    secrets.dbPasswordPlain
  );

  const s3 = createS3(env);

  const protocol = certArn ? "https" : "http";
  const endpointUrl = pulumi.interpolate`${protocol}://${networking.alb.dnsName}`;

  const _ecs = createEcs({
    env,
    sizing,
    ghcrImage: config.ghcrImage,
    vpcId: networking.vpc.vpcId,
    subnetIds: networking.vpc.privateSubnetIds,
    securityGroupId: networking.ecsSecurityGroup.id,
    targetGroupArn: networking.targetGroup.arn,
    databaseUrl: rds.connectionString,
    authSecret: secrets.authSecretPlain,
    endpointUrl,
    s3BucketName: s3.bucket.bucket,
    pluginsInformationUrl: config.pluginsInformationUrl,
    tpmRegistryUrl: config.tpmRegistryUrl,
  });

  const outputs: StackOutputs = {
    endpointUrl,
    dbHost: rds.instance.endpoint,
    storageEndpoint: pulumi.interpolate`s3://${s3.bucket.bucket}`,
  };

  return exportOutputs(outputs);
}
