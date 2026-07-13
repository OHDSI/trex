export const TREX_PORT = 8000;

export interface ContainerEnvVars {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BASE_PATH: string;
  SCHEMA_DIR: string;
  PLUGINS_PATH: string;
  PLUGINS_DEV_PATH: string;
  SWARM_CONFIG: string;
  SWARM_NODE: string;
}

export function buildSwarmConfig(port: number, tlsPort: number): string {
  return JSON.stringify({
    cluster_id: "cloud",
    nodes: {
      cloud: {
        gossip_addr: "0.0.0.0:4200",
        extensions: [
          {
            name: "trexas",
            config: {
              host: "0.0.0.0",
              port,
              main_service_path: "/usr/src/core/server",
              event_worker_path: "/usr/src/core/event",
              tls_port: tlsPort,
              tls_cert_path: "/usr/src/server.crt",
              tls_key_path: "/usr/src/server.key",
            },
          },
          {
            name: "pgwire",
            config: { host: "0.0.0.0", port: 5432 },
          },
        ],
      },
    },
  });
}

export function buildTrexEnvVars(opts: {
  databaseUrl: string;
  authSecret: string;
  endpointUrl: string;
  pluginsInformationUrl?: string;
  tpmRegistryUrl?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Endpoint?: string;
  s3ForcePathStyle?: boolean;
}): Record<string, string> {
  const env: Record<string, string> = {
    DATABASE_URL: opts.databaseUrl,
    BETTER_AUTH_SECRET: opts.authSecret,
    BETTER_AUTH_URL: `${opts.endpointUrl}/trex`,
    BASE_PATH: "/trex",
    // REST is served in-process by the @trex/postgrest plugin, which
    // consumes this PGRST_* config.
    ...buildPostgrestEnvVars({
      databaseUrl: opts.databaseUrl,
      jwtSecret: opts.authSecret,
      endpointUrl: opts.endpointUrl,
    }),
    SCHEMA_DIR: "/usr/src/core/schema",
    PLUGINS_PATH: "/usr/src/plugins",
    PLUGINS_DEV_PATH: "/usr/src/plugins-dev",
    SWARM_CONFIG: buildSwarmConfig(8001, TREX_PORT),
    SWARM_NODE: "cloud",
  };
  if (opts.pluginsInformationUrl) env.PLUGINS_INFORMATION_URL = opts.pluginsInformationUrl;
  if (opts.tpmRegistryUrl) env.TPM_REGISTRY_URL = opts.tpmRegistryUrl;
  if (opts.s3Bucket) {
    env.STORAGE_BACKEND = "s3";
    env.STORAGE_S3_BUCKET = opts.s3Bucket;
    env.STORAGE_S3_REGION = opts.s3Region || "us-east-1";
    if (opts.s3Endpoint) env.STORAGE_S3_ENDPOINT = opts.s3Endpoint;
    if (opts.s3ForcePathStyle) env.STORAGE_S3_FORCE_PATH_STYLE = "true";
  }
  return env;
}

export function buildPostgrestEnvVars(opts: {
  databaseUrl: string;
  jwtSecret: string;
  endpointUrl: string;
}): Record<string, string> {
  // PostgREST needs an authenticator role connection
  const dbUrl = opts.databaseUrl.replace(
    /\/\/[^@]+@/,
    "//authenticator:authenticator_pass@"
  );
  return {
    PGRST_DB_URI: dbUrl,
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: opts.jwtSecret,
    PGRST_DB_PRE_REQUEST: "public.postgrest_pre_request",
    PGRST_DB_USE_LEGACY_GUCS: "false",
    PGRST_OPENAPI_SERVER_PROXY_URI: `${opts.endpointUrl}/trex/rest/v1`,
  };
}

export const TREX_HEALTH_CHECK = {
  path: "/trex/_internal/health",
  port: TREX_PORT,
  intervalSeconds: 30,
  timeoutSeconds: 10,
  healthyThreshold: 2,
  unhealthyThreshold: 5,
};
