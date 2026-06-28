# Checkpoint 0 Setup State

Date: 2026-06-29

This is the pre-orchestration baseline for the H0 Agentic Cashflow Management build.

## Repository Boundary

Canonical repository:

```text
https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git
```

Do not use or modify:

```text
https://github.com/AbhinavGupta707/RunwayOps.git
```

The old RunwayOps project is separate. This repo starts clean and checkpoint 1 should scaffold/implement the product here.

## Local State

Local path:

```text
/Users/abhinavgupta/Desktop/H0 AWS Hack/Cash Management /Agentic-Cashflow-Management
```

Current state:

- Repo cloned from `Agentic-Cashflow-Management`.
- Repo was empty at clone time.
- Vercel project is created and linked.
- No application code has been scaffolded yet.
- Checkpoint 1 should include app scaffolding plus Aurora foundation.

## Vercel

Created and linked project:

```text
Vercel team/context slug: abhinavs-projects-f1cef581
Vercel org ID: team_GIT6RlxBXVjXuY0g9nIeypsQ
Vercel project name: agentic-cashflow-management
Vercel project ID: prj_9bmLuB7kt2BcOOOHzHtpaJajFrWb
```

Local `.vercel/project.json` exists and is ignored by Git.

Vercel Git connection still needs to be confirmed after the first commit exists in this repository.

## AWS

Shared H0 account setup:

```text
AWS account ID: 222634407676
AWS region: eu-west-2
Budget: H0-Hackathon-Account-Spend-5USD
Budget alerts: 50%, 80%, 100%
```

Cash Management resources:

```text
Aurora cluster: h0-hackathon-aurora-pg
Aurora engine: PostgreSQL 17.7
Aurora cluster ARN: arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg
Aurora database: cash_management
Aurora Data API: enabled
Aurora public access: false
Aurora auto-pause: 0 ACU, resumes on demand
Cash Management app user: cash_management_app
Cash Management app secret ARN: arn:aws:secretsmanager:eu-west-2:222634407676:secret:h0/cash-management/rds/app-user-DHvZHY
Cash Management runtime policy ARN: arn:aws:iam::222634407676:policy/h0-cash-management-runtime-policy
S3 bucket: h0-cash-management-assets-222634407676-eu-west-2
```

Verified database capabilities:

- `pgcrypto` installed.
- `pg_trgm` installed.
- `vector` installed.
- App secret works through RDS Data API.
- App user can connect, use/create in `public`, and create/drop migration tables.

Implementation requirement:

- Data API calls must retry `DatabaseResumingException` because Aurora can auto-pause.

## Vercel OIDC

Vercel project creation is done. AWS OIDC role creation is still pending because this local shell does not have AWS credentials and IAM Identity Center was intentionally not enabled to preserve the AWS Free plan.

Create through AWS Console or CloudShell:

```text
OIDC provider URL: https://oidc.vercel.com/abhinavs-projects-f1cef581
Default audience: https://vercel.com/abhinavs-projects-f1cef581
AWS SDK audience: sts.amazonaws.com
Role name: h0-cash-management-vercel-runtime-role
Attach policy: h0-cash-management-runtime-policy
```

Recommended strict production trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::222634407676:oidc-provider/oidc.vercel.com/abhinavs-projects-f1cef581"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com/abhinavs-projects-f1cef581:aud": "sts.amazonaws.com",
          "oidc.vercel.com/abhinavs-projects-f1cef581:sub": "owner:abhinavs-projects-f1cef581:project:agentic-cashflow-management:environment:production"
        }
      }
    }
  ]
}
```

After role creation:

1. Set `AWS_ROLE_ARN` in Vercel.
2. Set `AWS_REGION=eu-west-2` in Vercel.
3. Set Aurora/S3/provider env vars in Vercel.

Docs:

- https://vercel.com/docs/oidc/aws
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html

## Checkpoint 0 Verdict

Checkpoint 0 is ready for user confirmation with one non-blocking setup item:

- AWS OIDC provider/role still needs creation in AWS after the Vercel project exists.

Checkpoint 1 can proceed from this clean repository. The first checkpoint must include app scaffolding because this repository was empty at clone time.

