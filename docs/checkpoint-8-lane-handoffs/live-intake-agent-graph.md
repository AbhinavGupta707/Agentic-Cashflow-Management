# CP8 Live Intake, Event Loop, And Agent Graph Handoff

## Summary

Implemented a server-side CP8 demo intake path that uses the real upload, S3 provenance, Aurora event inbox, event processor, deterministic forecast, and cashflow agent graph stack. The new route can load a deterministic finance pack or a focused Northstar payment event; it does not execute Gmail, Twilio, ElevenLabs, or any outbound provider action.

## Files Changed

- `src/server/demo/cp8-live-intake.ts`
  - Added deterministic CP8 sample finance-pack builder.
  - Added `runCp8DemoIntake`, which uploads CSV files through `uploadSourceFile`, processes the resulting `event_inbox` rows, refreshes the base forecast, and persists a cashflow agent graph run/checkpoints.
  - Added plan validation through the existing CSV normalizer for no-key/offline contract safety.
- `src/app/api/product/demo-intake/route.ts`
  - Added `GET /api/product/demo-intake` to inspect the deterministic plan without AWS/provider calls.
  - Added `POST /api/product/demo-intake` to run the live intake loop.
- `scripts/smoke-cp8-demo-intake-no-key.ts`
  - Added no-key contract smoke for the CP8 intake pack and focused payment-event replay.
- `package.json`
  - Added `smoke:cp8:intake:no-key`.
- `docs/checkpoint-8-lane-handoffs/live-intake-agent-graph.md`
  - This handoff.

## API Routes Added

### `GET /api/product/demo-intake`

Returns the deterministic CP8 intake plan only. This is safe without AWS/provider credentials and validates each generated CSV against the ingestion normalizer.

Optional query params:

- `mode=finance_pack` default
- `mode=payment_event`
- `companyExternalId` or `companyId`
- `caseId`

### `POST /api/product/demo-intake`

Runs the real demo intake loop:

1. Generates deterministic CSV payloads server-side.
2. Calls `uploadSourceFile` for each file, writing to S3 and Aurora provenance tables.
3. Processes each returned `event_inbox` row with `processEventInbox`.
4. Recomputes and persists the base deterministic forecast/action plan.
5. Runs and persists the cashflow agent graph with checkpoint evidence.

Body:

```json
{
  "mode": "finance_pack",
  "companyExternalId": "cmp_marlow_finch",
  "caseId": "case_payroll_2026_05_08",
  "process": true
}
```

`mode=payment_event` uploads only the Northstar payment confirmation CSV.

## Data And Idempotency Notes

- The finance pack includes:
  - customer risk refresh
  - fresh receivables export
  - upcoming supplier obligation
  - Northstar payment confirmation for `inv_ns_1048` / `NS-1048`
- The payment event is a posted `GBP 18,600.00` inflow against the seeded Northstar invoice. The event processor refreshes invoice paid amount through the existing deterministic payment path.
- Upload idempotency remains controlled by the existing checksum/source/import keys in `uploadSourceFile`.
- Event processing remains controlled by existing `event_inbox` and `event_ledger` idempotency.
- Forecast persistence uses the existing base scenario idempotency and updates the current product state.
- Agent graph persistence uses a stable CP8 intake idempotency key derived from mode, company, case, and sample payload hash, so repeated demo replays refresh the same run/checkpoints instead of creating uncontrolled runs.
- Fireworks may be used by the existing agent graph when configured. Missing keys produce the existing honest unavailable/fallback state.
- This lane does not call Gmail, Twilio, ElevenLabs, or any outbound execution provider.

## Verification

Commands run:

- `npm install`
  - Installed dependencies from the existing lockfile in this isolated worktree.
- `npm run typecheck`
  - Passed.
- `npm run check:cp2`
  - Passed. Reported expected no-key live ingestion unavailable state when AWS/Aurora/S3 env is absent.
- `npm run check:cp3`
  - Passed. Reported expected no-key Aurora/Fireworks/LangSmith unavailable state.
- `npm run smoke:product:no-key`
  - Passed. Confirmed no provider/Gmail/Twilio/ElevenLabs/Aurora calls.
- `npm run smoke:cp8:intake:no-key`
  - Passed. Confirmed deterministic CP8 sample pack, valid CSV normalization, stable idempotency, and no provider calls.
- `git diff --check`
  - Passed.

`tsx` scripts required escalated execution because the local sandbox blocks the IPC pipe `tsx` opens under the system temp directory. No secrets were printed.

## Remaining Risks And Integration Notes

- I did not run the `POST /api/product/demo-intake` live against Aurora/S3 from this worker. The master should decide when to mutate the shared live demo state, ideally after UI wiring is merged.
- Lane 2 should wire the UI import/replay control to this route and refresh Overview, Forecasts, Actions, and Agent Activity after success.
- Lane 3 should include `npm run smoke:cp8:intake:no-key` in the final CP8 check surface.
- Browser QA should verify that after `POST /api/product/demo-intake`, Northstar invoice/action state, forecast low point/action count, and Agent Activity graph/checkpoints visibly refresh.
