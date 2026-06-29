# Checkpoint 4 Orchestration

Date: 2026-06-29

Checkpoint: Approval-Gated Email And Gmail

Status: Ready to launch from `main` at commit `35c3c04` after CP3 was merged,
verified, pushed, and the CP3 worker lanes were archived.

## Product Outcome

Checkpoint 4 turns CP3 approval-ready actions and draft copy into an
approval-gated Gmail execution workflow:

- Persist and expose internal email drafts linked to CP3 actions, customers,
  contacts, approval records, and agent runs.
- Add Gmail OAuth/provider plumbing that is unavailable without keys/tokens and
  safe to enable after the user adds credentials.
- Create Gmail drafts or send approved messages only after explicit approval.
- Persist communication messages, provider execution records, provider ids, and
  outcome metadata in Aurora.
- Surface approval, draft, send, provider, and reply/outcome state in the
  cockpit without enabling voice or later checkpoints.

## Official Docs Consulted

- Gmail API sending guide:
  `https://developers.google.com/workspace/gmail/api/guides/sending`
- Gmail API drafts guide:
  `https://developers.google.com/workspace/gmail/api/guides/drafts`
- Gmail API scopes:
  `https://developers.google.com/workspace/gmail/api/auth/scopes`
- Google OAuth 2.0 for web server applications:
  `https://developers.google.com/identity/protocols/oauth2/web-server`

Implementation notes from those docs:

- Gmail sends and drafts use RFC 2822 MIME messages encoded as base64url in the
  `raw` field.
- Gmail drafts have stable draft IDs, but the draft message object is replaced
  when a draft is updated.
- Web-server OAuth should request offline access when a refresh token is needed.
- `gmail.compose` is required for Gmail draft create/update/send workflows;
  `gmail.send` can support send-only workflows. CP4 must document the exact
  scopes it needs and avoid requesting broader mail scopes.

## Provider And Key Posture

Required for deterministic CP4 no-key/local verification:

- Aurora env from CP1-CP3.

Optional after the user adds keys:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_GMAIL_SCOPES`
- `GMAIL_ENCRYPTION_KEY`
- `GMAIL_SENDER_EMAIL`

Missing Gmail env must not block internal draft/approval workflows. Gmail
provider operations must report honest unavailable/no-key status and must not
fake provider draft IDs, message IDs, sends, replies, or delivery outcomes.

## Lane Split

| Lane | Branch | Ownership |
| --- | --- | --- |
| Gmail OAuth And Provider Backend | `codex/cp4-gmail-provider-backend` | provider connection schema/migration, token encryption helpers, OAuth URL/callback contracts, Gmail MIME/base64url adapter, no-key/live provider status |
| Approval And Communication Runtime | `codex/cp4-approval-communication-runtime` | communication draft/message/provider execution repositories, approval-gated create/approve/reject/send routes or server actions, audit/idempotency behavior |
| Cockpit Email Approval UX | `codex/cp4-cockpit-email-approval-ux` | cockpit UI for provider connection state, draft preview, approval controls, send state, replies/outcomes, disabled/no-key/error states |
| QA Docs And Smoke | `codex/cp4-qa-docs-smoke` | CP4 contract checks, no-key/live smoke scripts, runbook/status docs, browser smoke checklist, CP5 handoff notes |

Do not create recurring Codex automations. Do not create orchestration or review
threads. These four task-lane worktree sessions are the only CP4 worker sessions
for this checkpoint.

## Launched Worker Sessions

Base commit: `3c70dd3`

| Lane | Thread | Worktree |
| --- | --- | --- |
| Gmail OAuth And Provider Backend | `019f12bf-7dbd-7c91-8e3c-0fea8b173bec` | `/Users/abhinavgupta/.codex/worktrees/b962/Agentic-Cashflow-Management` |
| Approval And Communication Runtime | `019f12bf-d7a3-70b3-ae6e-d0dcacf16ba5` | `/Users/abhinavgupta/.codex/worktrees/1e01/Agentic-Cashflow-Management` |
| Cockpit Email Approval UX | `019f12c0-262c-76f0-86f0-2fa82634a6db` | `/Users/abhinavgupta/.codex/worktrees/e37e/Agentic-Cashflow-Management` |
| QA Docs And Smoke | `019f12c0-83e8-76e1-9876-277b49aa8b0a` | `/Users/abhinavgupta/.codex/worktrees/6a0e/Agentic-Cashflow-Management` |

## Acceptance Checklist

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
git diff --check
rg -n -e 'Runway''Ops' -e 'external''-legacy-repo-placeholder' -e 'mongo''db\+srv' -e 'Mongo''DB' -e 'MONGO''DB' -e 'mongo''db' src scripts db package.json README.md docs/checkpoint-4*.md docs/schema.md
```

Additional CP4 checks:

- With no Gmail keys, create/read internal drafts and provider status without
  attempting Gmail network calls.
- With no approval, send routes must refuse to send and must not create sent
  communication rows.
- With an approved action but no Gmail keys/tokens, send routes must persist an
  honest failed/unavailable provider execution, not a fake message id.
- With real Gmail credentials added later, live smoke may create exactly one
  draft or send exactly one approved test message to a clearly configured test
  recipient; do not run that live smoke until credentials and destination are
  explicit.
- Browser smoke must show approval/draft/send state and no console errors.

## Non-Goals

- Voice execution and transcript learning are CP5.
- Replacing all cockpit surfaces is CP6.
- Cron/retry production hardening is later.
- Do not broaden Gmail scopes beyond CP4 needs.
- Do not store plaintext OAuth refresh tokens or secrets in Git, logs, provider
  execution payloads, or browser-visible API responses.
