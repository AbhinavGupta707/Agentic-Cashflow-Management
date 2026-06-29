# Checkpoint 8 Final QA Checklist

Date: 2026-06-29

Purpose: final release and recording checklist for the CP8 end-state product.

## Preconditions

- Canonical repo only:
  `https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git`
- No work in parent `Cash Management` or legacy RunwayOps folders.
- Secrets are in `.env.local` locally and Vercel env in production.
- Demo state is reset before browser QA:

```bash
npm run db:seed
```

## Static And Build Checks

Run from the canonical repo root:

```bash
npm run typecheck
npm run build
npm run check:cp2
npm run check:cp3
npm run check:cp4
npm run check:cp5
CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6
CP7_REQUIRE_LIVE_WORKFLOW=true npm run check:cp7
npm run check:cp8
npm run smoke:product:no-key
npm run smoke:voice:no-key
git diff --check
```

During final master integration, also run:

```bash
CP8_REQUIRE_FINAL_PRODUCT=true npm run check:cp8
```

## Local Browser QA

Start:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Verify:

- Overview loads without debug/checkpoint language.
- Overview clearly states cash, risk, next obligation, recoverable cash, and
  next action.
- Upload or sample/intake flow is visible if CP8 runtime lanes landed it.
- Forecasts show baseline, optimistic, conservative, and no stale hardcoded
  2025 labels.
- Actions list pending approvals.
- Action detail fetches the selected action.
- Fireworks-generated draft/call preview appears when configured, or an honest
  deterministic fallback appears.
- Edit opens a real editor and persists through the product route.
- Approve and reject mutate Aurora state and refresh the UI.
- Approval does not silently send Gmail or place a Twilio call.
- Agent Activity shows events, forecast/checkpoint evidence, provider readiness,
  approval/audit state, and memory/outcome activity where available.
- Customers show exposure, behavior memory, interactions, evidence, and learned
  facts.
- Settings or Activity shows provider readiness without exposing secrets.
- No console errors.
- No horizontal overflow on desktop or mobile widths.

### Local QA Evidence 2026-06-29

Verified on `http://127.0.0.1:3108` through Chrome extension control:

- Overview rendered the live risk story, live intake control, Northstar actions,
  and persisted recommendation-agent activity.
- `POST /api/product/demo-intake` processed the sample finance pack with `4`
  files, `5` agent checkpoints, `9` recommendations, and no outbound provider
  execution.
- Actions rendered populated draft preview, real edit dialog, approval/reject
  controls, execution-memory panel, approved-test-call guardrail, and manual
  outcome-memory control.
- Approving `act_northstar_cfo_email` persisted via the product route and did
  not send email or place a call.
- Recording an outcome persisted via the product route and refreshed activity
  state.
- A fresh Chrome render after the final UI key fix reported no console warnings
  or errors on Overview or Actions.

## Upload And Event Loop

If CP8 runtime intake is available:

1. Reset the demo state.
2. Upload or load the sample finance pack.
3. Confirm raw/source provenance is recorded through S3/Aurora.
4. Confirm event inbox/import status changes.
5. Confirm Overview and Forecasts update from live API responses.
6. Confirm Agent Activity records import, forecast, and recommendation steps.

If intake is not visible in the final UI, record that as a release blocker for
first-place positioning.

## Approval And Execution

Baseline approval checks:

1. Open Actions.
2. Select the highest-impact action.
3. Verify rationale, evidence, and generated preview.
4. Edit and save a draft.
5. Approve or reject one action.
6. Confirm provider execution count remains zero unless explicit execution is
   triggered.
7. Reseed after mutation if recording needs the pending state.

Optional Twilio live call-to-self:

1. Confirm Twilio env is set.
2. Confirm `TWILIO_TWIML_URL` and `TWILIO_STATUS_CALLBACK_URL` point to the
   deployed production host.
3. Confirm `TWILIO_TEST_TO_NUMBER` is your own test number.
4. Approve a phone action.
5. Trigger execution with `live=true` and the exact test number.
6. Confirm one real Twilio provider call SID is persisted.
7. Confirm provider/audit/voice state appears in Agent Activity.
8. Reseed demo state after recording.

Never call a customer or any unapproved number.

## Outcome Memory

Verify after simulated or live outcome:

- provider outcome, webhook, or manual outcome is recorded
- learned customer fact is visible on the Customer detail screen
- Agent Activity shows outcome capture and memory write
- future recommendation copy can reference the learned fact

If Fireworks is unavailable, the UI should show a deterministic/honest fallback
without claiming live extraction.

## Production Browser QA

After Vercel deploy:

```text
https://agentic-cashflow-management.vercel.app
```

Verify the same flow as local QA, plus these production routes:

```text
/api/current-case
/api/product/overview
/api/product/actions
/api/product/actions/act_northstar_cfo_email
/api/product/scenarios
/api/product/customers
/api/product/agent-activity
/api/product/voice/status
/api/product/voice/twiml
```

Do not print or screenshot secrets.

## Submission Proof

Capture:

- production Overview screenshot
- Actions screenshot with generated preview and approval guardrails
- Agent Activity screenshot with persisted evidence
- Customers screenshot with memory/evidence
- AWS Aurora/RDS console screenshot proving database usage
- optional query/editor screenshot with table names or row counts
- Vercel project page screenshot showing project and Team ID
- optional LangSmith trace screenshot
- optional Twilio call log screenshot after call-to-self

## Video Recording Checklist

- Use [docs/h0-blue-sky-demo-script.md](./h0-blue-sky-demo-script.md).
- Keep the video under 3 minutes.
- Start with the product, not the architecture diagram.
- Show Aurora-backed product state before explaining internals.
- Mention deterministic finance versus agentic reasoning.
- Show approval guardrails.
- Show Agent Activity as proof.
- Do not overclaim Gmail, Twilio, or ElevenLabs if they are gated.

## Reset

After any approval, rejection, live call, or outcome mutation:

```bash
npm run db:seed
```

Then re-check:

- top action is pending if the recording expects pending approval
- provider execution count is zero unless the final video intentionally shows a
  real provider execution
- no accidental live call state remains in the default demo path
