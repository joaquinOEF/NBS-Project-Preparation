# Legacy city-prototype client (QUARANTINED)

Everything under `client/src/legacy/` belongs to the pre-COUGAR city-facing
prototype: the sample-project demo hub, its five module pages
(site-explorer, impact-model, funder-selection, project-operations,
business-model), the concept-note editor, the CityCatalyst OAuth login /
city-selection flow, the project agent ChatDrawer, and the
city-information module.

**Frozen.** Fix nothing here unless the legacy demo itself is the task
(docs/system-complexity-audit-2026-07.md, item DC-2). The server half lives
in `server/routes/legacyRoutes.ts` behind `ENABLE_LEGACY_ROUTES` (DS-3).
All routes are lazy-loaded (DC-3), so this tree costs nothing on the
workshop path. Deleting login/city-selection (the CityCatalyst OAuth
bridge) is a product decision — see the audit's rejected list.
