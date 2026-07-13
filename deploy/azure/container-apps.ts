import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import { Sizing } from "../shared/config";
import {
  TREX_HEALTH_CHECK,
  buildTrexEnvVars,
} from "../shared/containers";

export interface ContainerAppsResult {
  environment: azure.app.ManagedEnvironment;
  app: azure.app.ContainerApp;
}

export function createContainerApps(opts: {
  env: string;
  sizing: Sizing;
  ghcrImage: string;
  resourceGroupName: pulumi.Input<string>;
  location: pulumi.Input<string>;
  subnetId: pulumi.Input<string>;
  databaseUrl: pulumi.Input<string>;
  authSecret: pulumi.Input<string>;
  s3Endpoint: pulumi.Input<string>;
  s3AccessKey: pulumi.Input<string>;
  s3BucketName: string;
  pluginsInformationUrl?: string;
  tpmRegistryUrl?: string;
}): ContainerAppsResult {
  const logAnalytics = new azure.operationalinsights.Workspace(`trex-${opts.env}-logs`, {
    resourceGroupName: opts.resourceGroupName,
    location: opts.location,
    sku: { name: "PerGB2018" },
    retentionInDays: 30,
  });

  const environment = new azure.app.ManagedEnvironment(`trex-${opts.env}-env`, {
    resourceGroupName: opts.resourceGroupName,
    location: opts.location,
    vnetConfiguration: {
      infrastructureSubnetId: opts.subnetId,
      internal: false,
    },
    appLogsConfiguration: {
      destination: "log-analytics",
      logAnalyticsConfiguration: {
        customerId: logAnalytics.customerId,
        sharedKey: azure.operationalinsights
          .getSharedKeysOutput({
            resourceGroupName: opts.resourceGroupName,
            workspaceName: logAnalytics.name,
          })
          .apply((keys) => keys.primarySharedKey!),
      },
    },
  });

  const trexEnvVars = pulumi
    .all([opts.databaseUrl, opts.authSecret, opts.s3Endpoint])
    .apply(([dbUrl, secret, s3Endpoint]) => {
      const env = buildTrexEnvVars({
        databaseUrl: dbUrl,
        authSecret: secret,
        endpointUrl: "https://placeholder",
        pluginsInformationUrl: opts.pluginsInformationUrl,
        tpmRegistryUrl: opts.tpmRegistryUrl,
        s3Bucket: opts.s3BucketName,
        s3Endpoint,
        s3ForcePathStyle: true,
      });
      return Object.entries(env).map(([name, value]) => ({ name, value }));
    });

  const app = new azure.app.ContainerApp(`trex-${opts.env}-app`, {
    resourceGroupName: opts.resourceGroupName,
    location: opts.location,
    managedEnvironmentId: environment.id,
    configuration: {
      ingress: {
        external: true,
        targetPort: 8001,
        transport: "auto",
        allowInsecure: false,
      },
      secrets: [
        {
          name: "db-url",
          value: opts.databaseUrl,
        },
        {
          name: "auth-secret",
          value: opts.authSecret,
        },
        {
          name: "s3-access-key",
          value: opts.s3AccessKey,
        },
      ],
    },
    template: {
      containers: [
        {
          name: "trex",
          image: opts.ghcrImage,
          resources: {
            cpu: opts.sizing.cpu,
            memory: `${opts.sizing.memory}Gi`,
          },
          env: trexEnvVars.apply((vars) => [
            ...vars,
            { name: "AWS_ACCESS_KEY_ID", secretRef: "s3-access-key" },
          ]),
          probes: [
            {
              type: "liveness",
              httpGet: {
                path: TREX_HEALTH_CHECK.path,
                port: 8001,
              },
              periodSeconds: TREX_HEALTH_CHECK.intervalSeconds,
              timeoutSeconds: TREX_HEALTH_CHECK.timeoutSeconds,
              failureThreshold: TREX_HEALTH_CHECK.unhealthyThreshold,
            },
            {
              type: "readiness",
              httpGet: {
                path: TREX_HEALTH_CHECK.path,
                port: 8001,
              },
              periodSeconds: 10,
              timeoutSeconds: 5,
              failureThreshold: 3,
            },
          ],
        },
      ],
      scale: {
        minReplicas: opts.sizing.minReplicas,
        maxReplicas: opts.sizing.maxReplicas,
      },
    },
  });

  return { environment, app };
}
