# Checkpoint 4 QA, Docs, And Smoke Runbook

Date: 2026-06-29

Checkpoint: Approval-Gated Email And Gmail

Status: CP4 worker lanes have been merged into `main`, and the master
integration pass wired the Gmail provider backend into the approval-gated
runtime. Offline/no-key verification passes. Live Aurora/Gmail verification is
blocked until the local AWS session is reauthenticated and Google/Gmail
credentials plus a test recipient are configured.

## Scope

Checkpoint 4 turns CP3 approval-ready actions and communication drafts into
approval-gated Gmail execution.

This runbook covers:

- offline schema contract checks for approvals, drafts, messages, provider
  executions, and optional provider connection schema
- no-key smoke expectations for missing Google/Gmail env and missing OAuth
  tokens
- exact Gmail env and scope documentation
- live Gmail smoke instructions that are disabled until credentials and a test
  recipient are explicit
- browser smoke checklist for approval, draft, send, provider, reply/outcome,
  console, and API health
- guardrails and CP5 handoff notes
- production Gmail OAuth/provider behavior now merged in CP4
- the default Gmail runtime adapter that uses encrypted provider tokens and
  refreshes access tokens before send when needed

## Official Gmail And OAuth Docs Reviewed

- Gmail API sending guide:
  `https://developers.google.com/workspace/gmail/api/guides/sending`
- Gmail API drafts guide:
  `https://developers.google.com/workspace/gmail/api/guides/drafts`
- Gmail API scopes:
  `https://developers.google.com/workspace/gmail/api/auth/scopes`
- Google OAuth 2.0 web server flow:
  `https://developers.google.com/identity/protocols/oauth2/web-server`

CP4 implementation and live smoke should follow these documented constraints:

- Gmail draft/send calls use RFC 2822 MIME messages encoded as base64url in the
  `raw` field.
- Draft creation returns a Gmail draft resource and a message resource. Updating
  a draft can replace the underlying message object, so provider IDs must be
  recorded carefully.
- Web-server OAuth should use anti-forgery `state`; request offline access only
  when the app needs a refresh token.
- Use the narrow Gmail scopes needed for CP4: `gmail.compose` for draft
  create/update/send flows and `gmail.send` only for send-only flows. Do not
  request broad mailbox scopes.

## Environment Variables

Required for deterministic CP4 live Aurora smoke:

- `AWS_REGION`
- `AURORA_CLUSTER_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE`

Optional for Gmail live smoke after the user configures credentials:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_GMAIL_SCOPES`
- `GMAIL_ENCRYPTION_KEY`
- `GMAIL_SENDER_EMAIL`
- `GMAIL_TEST_RECIPIENT`

Allowed CP4 Gmail scope values:

```text
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.send
```

`GOOGLE_GMAIL_SCOPES` may contain one or both allowed scopes, separated by
spaces or commas. CP4 must not use broader Gmail scopes such as
`https://mail.google.com/` or Gmail modify/read/settings scopes.

OAuth access tokens and refresh tokens are not env setup values. They must be
encrypted at rest through the CP4 provider connection design and must never be
committed, logged, stored in plaintext provider payloads, or returned in
browser-visible API responses.

## Offline Contract Check

Run:

```bash
npm run check:cp4
```

The check is deterministic and safe without provider keys. It reads the Aurora
migration files, inspects process env, and does not call Aurora or Gmail.

It verifies the current Aurora migration contains:

- `approval_records` with action links, pending/approved/rejected decision
  states, decision timestamp consistency, and tenant-scoped idempotency
- `communication_drafts` with action/customer/contact links, email channel
  support, approval/send states, provider metadata, and tenant-scoped
  idempotency
- `communication_messages` with draft/action/customer/contact links, email
  channel support, outbound/inbound direction, sent/received/bounced/failed
  outcome states, provider message uniqueness, and tenant-scoped idempotency
- `provider_executions` with action/draft/message links, operation payloads,
  provider execution IDs, retry/error fields, execution states, provider
  uniqueness, and tenant-scoped idempotency
- `provider_connections` with Gmail-only provider/state constraints, encrypted
  token fields, connection metadata, tenant/account uniqueness, and safe
  rollback coverage

The check also reports missing Aurora/Gmail env as unavailable state, rejects
configured broad Gmail scopes, and detects plaintext Google/Gmail token-like env
names.

## Gmail No-Key Smoke

Run:

```bash
npm run smoke:gmail:no-key
npm run smoke:cp4:runtime:no-key
```

Expected no-key result:

- missing Gmail env is reported as provider unavailable
- missing OAuth tokens are treated as expected, because plaintext token env is
  forbidden
- no Gmail API call is attempted
- no fake Gmail draft ID, message ID, provider execution ID, reply, or delivery
  outcome is produced
- internal approval/draft workflows should remain testable without Gmail keys
- with encrypted stored tokens and a mocked Gmail API, the approval runtime
  automatically uses the default Gmail adapter without requiring an injected
  test adapter

With an approved action but no Gmail keys or stored OAuth tokens, CP4 runtime
lanes should persist or return an honest unavailable/failed provider execution.
They must not write fake provider IDs or mark a message as sent.

## Live Gmail Smoke For Later

Do not run live Gmail smoke until all of these are true:

1. CP4 provider/runtime lanes are merged.
2. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
   `GOOGLE_GMAIL_SCOPES`, `GMAIL_ENCRYPTION_KEY`, and `GMAIL_SENDER_EMAIL` are
   configured.
3. A stored Gmail OAuth connection exists for the sender and refresh tokens are
   encrypted.
4. `GMAIL_TEST_RECIPIENT` is explicitly configured for the test.
5. The operator explicitly chooses either draft creation or approved send.

Live draft-only smoke:

1. Seed or create one CP4 email draft linked to an action and approval record.
2. Approve only the draft-create operation, not send.
3. Create exactly one Gmail draft.
4. Persist the real Gmail draft ID and provider execution ID in Aurora.
5. Verify no outbound `communication_messages` row is marked `sent`.

Live approved-send smoke:

1. Seed or create one CP4 email draft linked to an action and approval record.
2. Confirm the recipient is exactly `GMAIL_TEST_RECIPIENT`.
3. Approve exactly one send operation.
4. Send exactly one test message.
5. Persist the real Gmail message/provider IDs and sent state in Aurora.
6. Verify no duplicate send occurs on replay.

Never send without approval. Never run both draft-only and send smoke in the
same pass unless the user explicitly requests that expanded live test.

## Browser Smoke Checklist

Run against the local app after CP4 runtime and cockpit lanes are integrated:

1. Start the app with Aurora env configured.
2. Open the cockpit for the seeded demo company/case.
3. Confirm Gmail/provider connection state is visible and honest when no Gmail
   env or OAuth connection exists.
4. Confirm an internal email draft can be viewed with subject/body, customer,
   contact, linked action, approval state, and evidence.
5. Confirm send controls are disabled or refuse execution while approval is
   pending/rejected/expired/revoked.
6. Approve one test draft/action and confirm the UI moves through queued/running
   provider execution state without duplicating records.
7. With no Gmail credentials, confirm provider execution reports unavailable or
   failed and does not show fake Gmail IDs.
8. With live Gmail credentials, run only the selected one-draft or one-send smoke
   and confirm provider IDs match persisted Aurora rows.
9. Confirm reply/outcome state appears as pending, received, bounced, failed, or
   archived only when backed by persisted communication/provider data.
10. Refresh the page and confirm approval/draft/send/provider state reloads from
    Aurora.
11. Check browser console and API responses. Provider-unavailable states are
    acceptable; unhandled exceptions are not.

## Acceptance Checks

Run after CP4 lanes are integrated:

```bash
npm install
npm run typecheck
npm run build
npm run db:migrate:dry
npm run db:seed:dry
npm run check:cp2
npm run check:cp3
npm run check:cp4
npm run forecast:dry
npm run smoke:agent:no-key
npm run agent:smoke
npm run smoke:gmail:no-key
npm run smoke:cp4:runtime:no-key
git diff --check
rg -n -e 'Runway''Ops' -e 'external''-legacy-repo-placeholder' -e 'mongo''db\+srv' -e 'Mongo''DB' -e 'MONGO''DB' -e 'mongo''db' src scripts db package.json README.md docs/checkpoint-4*.md docs/schema.md
```

## Current Verification

Verified on 2026-06-29 after CP4 integration:

```bash
npm run typecheck
npm run check:cp2
npm run check:cp3
npm run check:cp4
npm run smoke:gmail:no-key
npm run smoke:cp4:runtime:no-key
npm run smoke:agent:no-key
npm run build
npm run db:migrate:dry
npm run db:seed:dry
npm run forecast:dry
```

Live checks that require Aurora currently stop before product assertions because
the local AWS session is expired:

```text
Your session has expired. Please reauthenticate.
```

Affected commands:

- `npm run db:check-data-api`
- `npm run forecast:smoke`
- `npm run agent:smoke`
- `npm run smoke:cp4:approval-gate`

## Guardrails

- No fake Gmail provider IDs, draft IDs, message IDs, reply IDs, or delivery
  outcomes.
- No Gmail sending without an approved action/draft and an explicit live smoke
  recipient.
- No CP5 voice execution in CP4.
- No broad Gmail scopes.
- No plaintext OAuth tokens in Git, env, logs, provider execution payloads, or
  browser-visible API responses.
- No external legacy repository.
- No Mongo&#68;B or other non-Aurora primary datastore.
- No Codex recurring automations or extra orchestration/review sessions.

## CP5 Handoff

CP4 should leave CP5 with durable, provider-backed communication state:

- approved/rejected/expired approval records for outbound conduct
- email drafts and outbound/inbound communication messages linked to actions,
  customers, contacts, and provider executions
- real Gmail draft/message/provider IDs only when live Gmail actually created or
  sent them
- provider execution error/outcome metadata for learning and retry decisions
- no voice call rows or transcripts unless CP5 creates them

CP5 owns ElevenLabs/Twilio voice execution, call metadata, transcripts, and
voice-derived memory learning. It should consume CP4 approval and communication
outcome patterns without broadening Gmail scope or reusing plaintext tokens.
