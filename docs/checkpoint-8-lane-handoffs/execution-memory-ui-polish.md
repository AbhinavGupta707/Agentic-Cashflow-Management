# Checkpoint 8 Lane Handoff: Execution, Memory, And Product UI Polish

## Summary

This lane tightened the final product flow from recommended action to human approval, approval-gated voice execution, outcome capture, customer memory, and activity evidence. The UI now tells the demo story without fabricating provider sends/calls: approvals remain separate from provider execution, Twilio IDs are only shown when persisted from Twilio, and manual outcomes write real Aurora memory.

## Files Changed

- `src/components/cashflow-cockpit.tsx`
- `src/app/api/product/actions/[id]/record-outcome/route.ts`
- `src/app/api/product/voice/calls/route.ts`
- `src/server/repositories/product-actions.ts`
- `src/server/repositories/product-agent-activity.ts`
- `src/server/repositories/product-customers.ts`

## Product Changes

- Added an Actions detail section named `Execution & outcome learning`.
- Added a visible approved-test-call affordance for phone actions.
- The call button is disabled unless action detail is loaded, the action is approved, the action has a customer phone number, Twilio readiness is available, and no mutation is pending.
- Clicking the call button sends `approved=true` and `live=true` to `/api/product/voice/calls`, after a browser confirmation. The runtime still enforces the hard safety gates.
- Added an outcome recorder for `promise_to_pay`, `payment_confirmed`, `no_answer`, `dispute_raised`, and `manual_note`.
- Recording an outcome inserts a `memory_chunks` row with `source_type='manual_note'`, links it to the action/customer/company, writes audit evidence, refreshes action detail, action list, and agent activity.
- Customers now surface the top Aurora memory fact instead of hardcoded transcript/email examples.
- Agent Activity now includes memory timeline entries from `manual_note`, `voice_call`, `voice_transcript`, and `agent_extract` memory sources.

## Live-Call Gating Behavior

No live call was placed in this lane.

The UI and route now expose the path, but Twilio execution still requires all of the following:

- Approved action record.
- `approved=true` in the request.
- `live=true` in the request.
- Twilio env configured.
- `TWILIO_TEST_TO_NUMBER` configured.
- Destination phone exactly matching `TWILIO_TEST_TO_NUMBER`.

Provider execution IDs and call SIDs are only persisted when returned by Twilio. Failed/unavailable/gated attempts do not invent provider IDs.

## Verification

Passed:

- `npm run typecheck`
- `node --import tsx scripts/check-cp5-contract.ts`
- `CP6_REQUIRE_PRODUCT_ROUTES=true node --import tsx scripts/check-cp6-contract.ts`
- `CP7_REQUIRE_LIVE_WORKFLOW=true node --import tsx scripts/check-cp7-live-workflow.ts`
- `node --import tsx scripts/smoke-voice-no-key.ts`
- `npm run build`
- `git diff --check`

Notes:

- `npm run check:cp5` and `npm run smoke:voice:no-key` hit sandbox `tsx` IPC errors (`listen EPERM` under `/var/folders/.../tsx-501/*.pipe`). The same scripts passed with the sandbox-safe `node --import tsx ...` invocation.
- `npm run check:cp6` passed once under package script form after escalation was allowed by the environment, and also passed with `node --import tsx ...`.
- Local rendered browser QA was not completed. `npm run dev -- --hostname 127.0.0.1 --port 3108` was blocked by sandbox port binding (`listen EPERM`), and escalation for the dev server was rejected by policy. Production build did pass and included the new `record-outcome` route.

## Integration Notes

- The new API route is `POST /api/product/actions/[id]/record-outcome`.
- The existing action detail contract now advertises `mutationRoutes.recordOutcome` and `mutationRoutes.executeVoice`.
- The outcome memory write uses existing schema allowances: `source_type='manual_note'` and fact types `promise_to_pay`, `payment_behavior`, `risk_signal`, or `general`.
- Downstream integration should run browser QA from a master environment that can bind a local dev server or against a deployed preview.

## Remaining Risks

- Browser interaction QA is still needed after merge/deploy because this worker could not start a local server.
- Live Twilio call execution was intentionally not attempted. It should only be tested with explicit master/user approval and a configured `TWILIO_TEST_TO_NUMBER`.
- The Customers screen uses the top memory fact from the list endpoint; the richer customer detail route remains available for future deeper customer-detail UI.
