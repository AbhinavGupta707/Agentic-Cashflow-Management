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
- Checkpoint 0 baseline commit: `077561f317134b9bab56c6326372300ccbfeca66`.

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

Production environment variables verified in Vercel:

- `AWS_ROLE_ARN`
- `AWS_REGION`
- `AWS_ACCOUNT_ID`
- `AURORA_CLUSTER_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE`
- `AWS_S3_BUCKET`
- non-secret runtime defaults

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
Cash Management Vercel runtime role ARN: arn:aws:iam::222634407676:role/h0-cash-management-vercel-runtime-role
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

Vercel project creation is done. AWS OIDC role creation is done and wired into Vercel production.

Confirmed state:

```text
OIDC provider: oidc.vercel.com/abhinavs-projects-f1cef581
Audience: sts.amazonaws.com
Role name: h0-cash-management-vercel-runtime-role
Role ARN: arn:aws:iam::222634407676:role/h0-cash-management-vercel-runtime-role
Attached policy: arn:aws:iam::222634407676:policy/h0-cash-management-runtime-policy
Trust scope: owner:abhinavs-projects-f1cef581:project:agentic-cashflow-management:environment:production
```

Production trust policy shape:

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

1. `AWS_ROLE_ARN` is set in Vercel production.
2. `AWS_REGION=eu-west-2` is set in Vercel production.
3. Aurora/S3 runtime env vars are set in Vercel production.

Important restriction:

- The AWS role is production-only. Preview/development deployments cannot assume it unless separate trust entries or roles are created.

Docs:

- https://vercel.com/docs/oidc/aws
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html
- https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html

## Checkpoint 0 Verdict

Checkpoint 0 is complete for checkpoint 1 orchestration.

Remaining non-blocking provider items:

- Fireworks API key/model IDs.
- LangSmith key if tracing is used during checkpoint 3.
- Google/Gmail OAuth credentials and encryption key.
- ElevenLabs/Twilio keys for voice/SMS paths.

Checkpoint 1 can proceed from this clean repository. The first checkpoint must include app scaffolding because this repository was empty at clone time.
