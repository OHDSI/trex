
import * as pulumi from "@pulumi/pulumi";

export interface SecretsResult {
  dbPasswordPlain: pulumi.Output<string>;
  authSecretPlain: pulumi.Output<string>;
}

export function createSecrets(): SecretsResult {
  const config = new pulumi.Config("deploy");

  const dbPasswordPlain = config.getSecret("dbPassword") ??
    pulumi.output("change-me-in-production-32chars!!");
  const authSecretPlain = config.getSecret("authSecret") ??
    pulumi.output("change-me-auth-secret-32chars!!!");

  return { dbPasswordPlain, authSecretPlain };
}
