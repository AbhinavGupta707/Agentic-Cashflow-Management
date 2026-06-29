# CP8 QA, Submission Package, And Demo Evidence Handoff

Date: 2026-06-29

Lane: QA, Submission Package, And Demo Evidence

Status: Ready for master integration. This lane intentionally does not claim
overall CP8 completion because the runtime/UI implementation lanes still own
the final live intake, call execution, and polished product loop.

## Scope

This lane owns CP8 verification and submission-readiness artifacts:

- `npm run check:cp8`
- final architecture diagram
- Devpost-ready submission package
- public content draft
- final QA checklist
- CP8 status/evidence templates
- README verification instructions

## Files Changed

- `README.md` - adds the CP8 final product/submission-readiness asset map and
  the strict final integration command.
- `package.json` - adds `npm run check:cp8`.
- `scripts/check-cp8-final-product.ts` - adds a static CP8 final-product
  contract checker for docs, routes, provider honesty, submission assets, and
  final runtime proof gates.
- `docs/checkpoint-8-final-product-status.md` - adds launch registry structure,
  final done criteria, and expanded evidence fields.
- `docs/h0-architecture-diagram.md` - adds a repo-native Mermaid architecture
  diagram covering Vercel, API routes/server actions, Aurora PostgreSQL via RDS
  Data API, S3 provenance, LangGraph, Fireworks, LangSmith, Twilio/Gmail gated
  providers, and Aurora audit/memory/provider tables.
- `docs/h0-final-submission-package.md` - adds a Devpost-ready story, Built
  With list, AWS database explanation, Vercel project/team fields, public
  content draft, and submission link placeholders.
- `docs/checkpoint-8-final-qa-checklist.md` - adds the final local/production
  QA, provider, proof screenshot, video recording, and reset checklist.
- `docs/checkpoint-8-lane-handoffs/qa-submission-demo-evidence.md` - this
  handoff.

## Commands Run

- `npm install` - passed; installed local dependencies required for `tsx` and
  verification scripts.
- `npm run typecheck` - passed.
- `npm run build` - passed; Next.js production build completed and listed all
  product/API routes, including uploads, manual records, product actions,
  agent activity, scenarios, voice calls/status/Twilio webhook, and CP3/CP4
  APIs.
- `npm run check:cp8` - passed in default mode with two expected pending final
  runtime checks owned by the runtime/UI lanes.
- `git diff --check` - passed.

Notes:

- The local `tsx` runner uses a Node IPC/temp path that is blocked by this
  restricted worktree sandbox, so `npm run check:cp8` was run with approved
  escalation after the sandbox failure.
- `CP8_REQUIRE_FINAL_PRODUCT=true npm run check:cp8` is expected to hard-fail
  until the runtime/UI lanes expose the upload/sample-pack UI hook and the
  explicit approved test-call execution hook.

## Final Submission Assets

- Architecture diagram: `docs/h0-architecture-diagram.md`
- Devpost package: `docs/h0-final-submission-package.md`
- QA checklist: `docs/checkpoint-8-final-qa-checklist.md`
- Demo script: `docs/h0-blue-sky-demo-script.md`
- Readiness plan: `docs/h0-final-submission-readiness-plan.md`

## Remaining Proof Gaps

These are expected to remain until master integration and final recording:

- merge/integration of the CP8 live intake/event loop lane
- merge/integration of the CP8 execution/memory/UI polish lane
- strict CP8 final contract pass:
  `CP8_REQUIRE_FINAL_PRODUCT=true npm run check:cp8`
- production browser QA after all CP8 lanes merge
- AWS Aurora proof screenshot
- public content URL after publishing
- final demo video URL
- optional Twilio call-to-self evidence if live execution is used

## Integration Notes

- This lane can merge before the runtime lanes because `npm run check:cp8`
  passes in default mode and reports runtime gaps as pending rather than
  failing.
- Master should run `CP8_REQUIRE_FINAL_PRODUCT=true npm run check:cp8` only
  after the runtime/UI lanes land. That strict mode is the final merge gate.
- The CP8 checker deliberately separates live, readiness-gated, deterministic
  fallback, and optional provider execution states. It scans runtime source for
  fake provider success markers and verifies that provider IDs are not claimed
  without real execution.
- Submission copy is honest by design: Aurora PostgreSQL is the primary
  database, Vercel hosts the app/API routes, Fireworks/LangSmith/Twilio/Gmail
  are described as gated/live where appropriate, and deterministic fallback
  behavior is separated from live provider execution.
- Before recording the final video, update `docs/h0-final-submission-package.md`
  with the production URL, repository URL, public post URL, demo video URL, and
  any final teammate/submission fields.
