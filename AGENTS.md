# Agent Instructions

- This repository is the canonical workspace for the H0 Agentic Cashflow Management project.
- Do not use, push to, or modify any external legacy repository; this repository is the only project workspace.
- For Codex worktree orchestration, spawn workers from an exact repository-root thread/worktree, not from the parent `Cash Management` folder project.
- This thread is the single master orchestration surface unless the user explicitly appoints a different master.
- Create isolated Codex worktree sessions only for implementation or QA task lanes. Do not create separate "orchestrator", "monitor", "review repo", or recurring status-check sessions.
- Do not use Codex recurring automations for orchestration polling. The master session owns manual status checks, integration, merge review, verification, and worker cleanup.
- Archive completed worker-lane sessions after their work is merged and verified so the sidebar remains limited to active task lanes.
- Diagnose in layer order, not by symptom: if a feature is missing, unavailable, or not listed, first check registration/discovery/install state and official activation flows; only debug permissions/runtime after the feature is actually present.
- Keep secrets out of Git. Use `.env.local` locally and Vercel environment variables for deployments.
- Use Aurora PostgreSQL as the primary backend. MongoDB is not part of the target architecture for this repository.
