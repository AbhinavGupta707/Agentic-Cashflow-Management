# Checkpoint 5/6 QA, Docs, And Smoke Runbook

Date: 2026-06-29

Checkpoint: CP5 approval-gated voice execution and CP6 live product cockpit
replacement.

Status: QA/docs lane added deterministic offline checks and no-key smokes. At
this lane base, CP5/CP6 runtime and product API implementation may still be
landing in adjacent lanes, so route readiness is reported as pending unless
strict route mode is enabled.

## Scope

This runbook covers:

- CP5 schema contract checks for voice calls, transcripts, provider executions,
  approval records, voice scripts, and memory learning.
- CP6 route and UI reference checks for the live product surface.
- no-key smokes for honest provider-unavailable behavior without Fireworks,
  LangSmith, Twilio, ElevenLabs, Gmail, or Aurora credentials.
- live provider verification steps for Fireworks, LangSmith, Twilio,
  ElevenLabs invalid/unavailable state, Aurora Data API, and browser QA.
- the manual browser smoke checklist for the four reference-style screens:
  Overview, Actions, Customers, and Forecasts.

Live Gmail OAuth linkage is not required for this CP5/CP6 pass. Gmail remains a
CP4 capability and should be shown as disconnected or unavailable unless an
operator intentionally runs a CP4 Gmail live smoke.

## Offline Checks

Run:

```bash
npm run check:cp5
npm run check:cp6
npm run smoke:voice:no-key
npm run smoke:product:no-key
```

These commands are deterministic and safe without provider keys or live Aurora
credentials. They do not call Fireworks, LangSmith, Twilio, ElevenLabs, Gmail,
or the Aurora Data API.

`npm run check:cp5` verifies:

- `actions` supports `call_customer`.
- `approval_records` gates execution before outbound conduct.
- `communication_drafts` supports `voice_script`.
- `communication_messages` supports `voice`.
- `provider_executions` can record queued/running/succeeded/failed/cancelled
  attempts and leave provider IDs null until a real provider returns one.
- `voice_calls` persists action/customer/contact/provider links, direction,
  lifecycle state, idempotency, and nullable provider call IDs.
- `voice_transcripts` persists ordered transcript turns with speaker and
  confidence constraints.
- `memory_chunks` accepts `voice_call` and `voice_transcript` sources.

`npm run check:cp6` verifies:

- all four `Ui References/*.png` files are present.
- orchestration docs name the Overview, Actions, Customers, and Forecasts
  target screens.
- the live product plan documents the expected `/api/product/*` surface.
- if product routes exist, their method exports and route/repository contract
  keywords are checked.

By default, missing CP6 product routes are reported as pending adjacent-lane
work and do not fail this isolated QA/docs lane. During integration, run strict
mode to require every product route:

```bash
CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6
```

`npm run smoke:voice:no-key` verifies:

- missing Twilio env produces unavailable/no-key state.
- missing ElevenLabs env produces unavailable/no-key state.
- pending approval blocks voice provider execution before any call row or
  provider ID exists.
- approved no-key voice execution records provider unavailable without
  fabricating a provider execution ID or call ID.

`npm run smoke:product:no-key` verifies:

- missing Aurora env is reported as unavailable state.
- Fireworks and LangSmith no-key states stay honest.
- Twilio and ElevenLabs no-key states contain null provider IDs.
- the four reference screens are available for manual browser QA.
- product route files, when present, do not hard-code fake provider IDs.

## Environment Variables

Required for deterministic live Aurora/product API smoke:

- `AWS_REGION`
- `AURORA_CLUSTER_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE`

Optional for Fireworks live smoke:

- `FIREWORKS_API_KEY`
- `FIREWORKS_MODEL`
- `FIREWORKS_BASE_URL`

Optional for LangSmith live trace smoke:

- `LANGSMITH_TRACING=true`
- `LANGSMITH_API_KEY`
- `LANGSMITH_PROJECT`
- `LANGSMITH_ENDPOINT`

Optional for Twilio live voice status smoke:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_PHONE_NUMBER`
- `TWILIO_TEST_TO_PHONE` for live call smoke only

Optional for ElevenLabs status smoke:

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_VOICE_ID`

Do not commit, print, or paste secret values. Local values belong in
`.env.local`; deployment values belong in the Vercel project environment.

## Live Provider Verification

Run live checks only after the matching runtime lane has landed and the operator
has configured credentials.

Fireworks:

1. Confirm `FIREWORKS_API_KEY` and `FIREWORKS_MODEL` are set.
2. Run the agent/product smoke that uses the real Fireworks adapter.
3. Verify the result says the provider is available and stores only real
   response metadata.
4. Verify deterministic fallback is still used if Fireworks returns an error.

LangSmith:

1. Set `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, and `LANGSMITH_PROJECT`.
2. Run one agent/product smoke.
3. Verify a real trace/project is reachable and no fake trace URL is emitted.
4. Keep trace metadata scoped to tenant/company/case/action, not secrets.

Twilio:

1. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
   `TWILIO_FROM_PHONE_NUMBER`.
2. Run a provider status smoke first; it must not place a call.
3. Only if `TWILIO_TEST_TO_PHONE` is explicit and a human approves the action,
   run exactly one live outbound call smoke.
4. Persist the real Twilio call/provider IDs returned by Twilio. Do not invent
   IDs if Twilio fails.

ElevenLabs:

1. Set `ELEVENLABS_API_KEY` and the selected agent/voice env.
2. If the key is invalid, report ElevenLabs as unavailable or provider-error.
3. Do not downgrade invalid credentials into a fake available state.
4. Keep Twilio-first voice status usable while ElevenLabs is unavailable.

Aurora Data API:

1. Ensure the AWS session is authenticated.
2. Run `npm run db:check-data-api`.
3. Run the product API/browser smoke against seeded data.
4. Missing or expired AWS credentials must fail with a clear unavailable
   message, not a fixture-only success.

## Browser Smoke Checklist

Run after CP5/CP6 product UI and product API lanes are integrated.

1. Start the app locally with `npm run dev`.
2. Open the local app and verify the first screen is the customer product
   surface, not a checkpoint/debug cockpit.
3. Overview: confirm KPI strip, cashflow/runway chart, critical actions,
   approvals, agent health, live status, and last-updated affordance.
4. Overview: with missing Aurora/provider env, confirm degraded states are clear
   and do not show fake provider success.
5. Actions: confirm pending approvals list, selected action detail, explanation,
   draft or call preview, evidence, guardrails, and approve/edit/reject controls.
6. Actions: confirm outbound email/voice execution is disabled or refused until
   approval is recorded.
7. Actions: with no Twilio/ElevenLabs keys, confirm approved voice attempts show
   unavailable/failed provider state with no fake provider IDs.
8. Customers: confirm exposure, risk/lateness, behavior summary, interaction
   history, learned memory, outreach strategy, script preview, and evidence.
9. Customers: confirm learned facts are backed by persisted memory or honestly
   marked unavailable.
10. Forecasts: confirm baseline, optimistic, and conservative projections,
    scenario controls, comparison cards, recommended plan, and sensitivity
    analysis.
11. Forecasts: confirm scenario changes preview or persist through the product
    API without requiring live provider keys.
12. Confirm the left navigation, top company/case selector, live status, and
    premium dark visual style match `Ui References/1.png` through
    `Ui References/4.png`.
13. Refresh each screen and confirm state reloads from product APIs or shows
    honest unavailable state.
14. Inspect browser console and network responses. Provider-unavailable states
    are acceptable; unhandled exceptions and fake success states are not.

## Acceptance Checks

Minimum local verification for this lane:

```bash
npm run typecheck
npm run build
npm run check:cp2
npm run check:cp3
npm run check:cp4
npm run check:cp5
npm run check:cp6
npm run smoke:agent:no-key
npm run smoke:gmail:no-key
npm run smoke:cp4:runtime:no-key
npm run smoke:voice:no-key
npm run smoke:product:no-key
git diff --check
```

Integration verification after adjacent CP5/CP6 runtime/API/UI lanes land:

```bash
CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6
npm run db:check-data-api
npm run forecast:smoke
npm run agent:smoke
```

Run live Twilio/Gmail/provider execution smokes only with explicit credentials,
an explicit test recipient or phone number, and recorded human approval.

## Guardrails

- No fake Fireworks, LangSmith, Twilio, ElevenLabs, Gmail, provider execution,
  call, draft, message, reply, trace, or delivery IDs.
- No outbound voice call without approval and an explicit test phone number.
- No live Gmail OAuth linkage is required for CP5/CP6.
- No secret values in Git, logs, browser-visible API responses, docs, or
  provider execution payloads.
- No MongoDB or external legacy repository.
- Missing keys, invalid ElevenLabs credentials, expired AWS sessions, and absent
  Gmail OAuth connections are acceptable unavailable states.
