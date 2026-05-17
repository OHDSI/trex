
import { DeployConfig, getSizing } from "../shared/config";
import { exportOutputs, StackOutputs } from "../shared/outputs";
import { createNetworking } from "./networking";
import { createPostgres } from "./postgres";
import { createStorage } from "./storage";
import { createSecrets } from "./secrets";
import { createContainerApps } from "./container-apps";

export function deployAzure(config: DeployConfig) {
  const env = config.environment;
  const sizing = getSizing("azure", env);

  const secrets = createSecrets();

  const networking = createNetworking(env, config.region);

  const postgres = createPostgres({
    env,
    sizing,
    resourceGroupName: networking.resourceGroup.name,
    location: networking.resourceGroup.location,
    subnetId: networking.postgresSubnet.id,
    vnetId: networking.vnet.id,
    adminPassword: secrets.dbPasswordPlain,
  });

  const storage = createStorage({
    env,
    resourceGroupName: networking.resourceGroup.name,
    location: networking.resourceGroup.location,
  });

  const containerApps = createContainerApps({
    env,
    sizing,
    ghcrImage: config.ghcrImage,
    resourceGroupName: networking.resourceGroup.name,
    location: networking.resourceGroup.location,
    subnetId: networking.containerAppsSubnet.id,
    databaseUrl: postgres.connectionString,
    authSecret: secrets.authSecretPlain,
    s3Endpoint: storage.s3Endpoint,
    s3AccessKey: storage.accessKey,
    s3BucketName: `trex-${env}-storage`,
    pluginsInformationUrl: config.pluginsInformationUrl,
    tpmRegistryUrl: config.tpmRegistryUrl,
  });

  const endpointUrl = containerApps.app.latestRevisionFqdn.apply(
    (fqdn) => `https://${fqdn}`
  );

  const outputs: StackOutputs = {
    endpointUrl,
    dbHost: postgres.server.fullyQualifiedDomainName.apply((h) => h ?? ""),
    storageEndpoint: storage.s3Endpoint,
  };

  return exportOutputs(outputs);
}
