# Trex — Cloud Deployment

Infrastructure-as-Code for deploying Trex to **AWS** (ECS Fargate) or **Azure** (Container Apps, *in development*) using [Pulumi](https://www.pulumi.com/) with TypeScript.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [Pulumi CLI](https://www.pulumi.com/docs/install/)
- [AWS CLI](https://aws.amazon.com/cli/) (for AWS deployments)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) (for Azure deployments)

## Quick Start

```bash
cd deploy
npm install

# Login to Pulumi (free account for state management)
pulumi login

# Initialize a stack (one-time per cloud+environment)
pulumi stack init aws-dev    # or azure-dev, aws-prod, azure-prod

# Deploy
pulumi up
```

## Stacks

Each stack represents one cloud + one environment. You can have multiple stacks deployed simultaneously.

| Stack | Cloud | Environment | Description |
|-------|-------|-------------|-------------|
| `aws-dev` | AWS | Dev/Staging | Small instances, single-AZ DB, 1 task |
| `aws-prod` | AWS | Production | HA DB (Multi-AZ), auto-scaling (2-4 tasks) |
| `azure-dev` | Azure | Dev/Staging | Burstable DB, 1 replica *(in development)* |
| `azure-prod` | Azure | Production | HA DB (zone-redundant), 2-4 replicas *(in development)* |

### Switch between stacks

```bash
pulumi stack select aws-dev
pulumi up

pulumi stack select azure-prod
pulumi up

# List all stacks
pulumi stack ls
```

## Architecture

### AWS (ECS Fargate)

```
Internet → ALB (HTTPS 443) → ECS Fargate Task
                                └── trex container (port 8000)
                              RDS PostgreSQL 16
                              S3 (storage plugin)
                              EFS (DuckDB workspace persistence)
```

### Azure (Container Apps) — *in development*

```
Internet → Container Apps Ingress (HTTPS 443) → Container App
                                                    └── trex container (port 8000)
                                                  PostgreSQL Flexible Server
                                                  Blob Storage (S3-compatible)
```

## Configuration

Stack config files (`Pulumi.<stack>.yaml`) contain:

| Key | Description | Example |
|-----|-------------|---------|
| `deploy:cloud` | Target cloud | `aws` or `azure` |
| `deploy:environment` | Target environment | `dev` or `prod` |
| `deploy:ghcrImage` | Public GHCR image | `ghcr.io/org/trex:latest` |
| `deploy:region` | Cloud region | `us-east-1` or `eastus` |
| `deploy:certificateArn` | AWS ACM cert ARN (AWS only) | `arn:aws:acm:...` |

### Secrets

**Required pre-deploy step.** The AWS stack will refuse to deploy if these
secrets are not set — there are no placeholder fallbacks. Generate strong
random values and store them encrypted in Pulumi config:

```bash
pulumi config set --secret deploy:authSecret $(openssl rand -base64 48)
pulumi config set --secret deploy:dbPassword $(openssl rand -base64 32)
```

If you run `pulumi up` without setting these, Pulumi will fail with a
`Missing required configuration variable 'deploy:authSecret'` (or
`deploy:dbPassword`) error naming the exact key that needs to be set.

### Secret recovery window

AWS Secrets Manager supports a soft-delete recovery window. The deploy stack
defaults to **7 days** (the AWS-recommended minimum for production), so a
`pulumi destroy` schedules deletion rather than immediately wiping the secret.

Override via:

```bash
pulumi config set deploy:secretRecoveryWindowDays 7
```

Trade-off: `0` means immediate, irrecoverable deletion on `pulumi destroy` —
fine for short-lived dev environments where you want clean teardown, but
dangerous in production where an accidental destroy followed by an immediate
re-create would lose any secret history. Use `7` or higher for any stack you
care about.

## Outputs

After deployment, view outputs:

```bash
pulumi stack output endpointUrl      # Application URL
pulumi stack output dbHost --show-secrets  # Database host
pulumi stack output storageEndpoint  # Storage endpoint
```

## AWS-Specific Setup

### ACM Certificate

Before deploying to AWS, create an ACM certificate for your domain:

```bash
aws acm request-certificate \
  --domain-name your-domain.com \
  --validation-method DNS

# Then set the ARN in config
pulumi config set deploy:certificateArn "arn:aws:acm:..."
```

### Authenticate

```bash
aws configure  # or aws sso login
```

## Azure-Specific Setup *(in development)*

### Authenticate

```bash
az login
az account set --subscription "your-subscription-id"
```

Azure Container Apps automatically provisions managed TLS certificates.

## Tear Down

```bash
pulumi destroy
```

## Container Image

The Trex Docker image is pulled from GitHub Container Registry (public). The image is built and pushed by CI — no manual image push is needed.

Database migrations are applied automatically on container startup via the built-in migration framework.

## Cost Estimates

| Stack | Estimated Monthly Cost |
|-------|----------------------|
| `aws-dev` | ~$120 (Fargate + RDS t4g.micro + ALB + S3 + EFS) |
| `aws-prod` | ~$680 (Fargate ×2 + RDS r6g.large Multi-AZ + ALB + S3 + EFS) |
| `azure-dev` | ~$85 (Container Apps + PG Burstable + Blob Storage) |
| `azure-prod` | ~$425 (Container Apps ×2 + PG GP HA + Blob Storage) |
