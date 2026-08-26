import { app } from "./routes";
import { appD1 } from "./routes-d1";

// appD1 (the D1-backed bearer-token API for Android, Phase 2 of the Supabase -> D1
// migration — see specs/d1-migration-plan.md) is mounted alongside the existing
// Supabase-backed app, not merged into it, so it can be removed with a one-line revert
// if Phase 2 verification finds a problem.
app.route("/", appD1);

export default app;
