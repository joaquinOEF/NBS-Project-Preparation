// ============================================================================
// RUNTIME ENVIRONMENT DETECTION — the backstop for demo/test seams.
// ============================================================================
//
// The demo/test flags (ENABLE_PHASE_SKIP, ENABLE_TEST_ROUTES, CBO_FAKE_MODEL)
// were guarded only by "never set them on the prod Deployment". But Replit
// shares App secrets with Deployments by default, so a flag set for a
// workspace demo CAN ride into prod on the next republish. This module makes
// the guard structural: Replit sets REPLIT_DEPLOYMENT=1 (and
// REPLIT_DEPLOYMENT_ID) inside deployed apps and not in the workspace, so a
// deployment refuses the seams REGARDLESS of which secrets it received.
//
// Local dev and the Playwright webServer have neither variable → seams work
// exactly as before wherever a human is actually developing or testing.

export function isReplitDeployment(): boolean {
  return process.env.REPLIT_DEPLOYMENT === '1' || !!process.env.REPLIT_DEPLOYMENT_ID;
}

/** Demo-only phase skipping ([SKIP TO phase:X] + clickable progress
 *  segments). Requires the explicit opt-in flag AND a non-deployment
 *  environment — it overwrites real answers with sample data. */
export function isPhaseSkipEnabled(): boolean {
  return process.env.ENABLE_PHASE_SKIP === '1' && !isReplitDeployment();
}

/** Deterministic geocoding for the e2e suite: address lookups resolve to a
 *  fixed Porto Alegre coordinate instead of calling Nominatim, so the site-
 *  from-address path can be tested without network. Same structural guard as
 *  the other seams — flag AND non-deployment. */
export function isFakeGeocodeEnabled(): boolean {
  return process.env.CBO_FAKE_GEOCODE === '1' && !isReplitDeployment();
}

