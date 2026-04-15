# NBS Project Preparation (Project Builder)

## Overview

POC / prototype for Nature-Based Solutions (NBS) project preparation. Helps cities move from prioritized climate actions to finance-ready project concepts. Part of the CityCatalyst ecosystem.

**Repo:** https://github.com/joaquinOEF/NBS-Project-Preparation
**Hosted on:** Replit (autoscale deployment)
**Default branch:** `main`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix primitives) + `@oef/components` (shared OEF library) |
| Routing | wouter |
| State | React Query (TanStack), React Context |
| i18n | react-i18next (en, pt) |
| Backend | Express.js (TypeScript, ESM) |
| Database | PostgreSQL (Neon serverless) via Drizzle ORM |
| Maps | Leaflet, Turf.js, pigeon-maps |
| Auth | Passport.js (local strategy) + express-session |
| Analytics | PostHog |

## Project Structure

```
client/
  src/
    core/
      components/layout/    # Header, Footer, shared layout
      components/ui/         # shadcn components (Button, Card, etc.)
      contexts/              # React contexts (sample-data-context, project-context)
      hooks/                 # Shared hooks (useSampleRoute, etc.)
      lib/                   # Utilities (queryClient, analytics)
      locales/               # en.json, pt.json
    modules/
      city-information/      # City detail page with action cards
      city-selection/        # City list / entry point
      project/               # Project preparation modules (blocks)
  public/
    assets/                  # Logos, icons (oef-logo.svg, nbs-icon.png)
    sample-data/             # Static JSON files for sample mode

server/
  index.ts                   # Entry point
  routes.ts                  # Express routes (API + sample init)
  storage.ts                 # IStorage interface + Drizzle implementation
  db.ts                      # Neon DB connection
  schema.ts                  # Drizzle schema definitions

shared/
  sample-constants.ts        # Sample IDs (project, city, user)
  schema.ts                  # Shared Zod schemas
```

## Key Architecture Patterns

### Dual Mode: Sample vs API

The app runs in two modes controlled by `SampleDataContext`:

- **Sample mode** (`isSampleMode = true`): Uses hardcoded data from `sample-data-context.tsx` and static JSON files in `client/public/sample-data/`. State is persisted to `localStorage`. No authentication required.
- **API mode** (`isSampleMode = false`): Fetches from Express API endpoints. Uses PostgreSQL via Drizzle. Requires authentication.

Most components check `useSampleContent` (which is `isSampleMode || isSampleRoute`) to decide data source. When adding new features, ensure both paths are handled.

### Module Block System

Project preparation is organized into "blocks" (modules). Each block type lives in the project module and handles a specific aspect of project preparation (e.g., site exploration, funder selection, impact model).

Key constant: Only `sample-ada-1` ("Nature Based Solutions for Climate Resilience") has full module support. Other sample actions show "Module Coming Soon" when initiated.

### Sample Data Constants

- **Sample city:** Porto Alegre, Brazil (`BR POA`)
- **Sample actions:** 3 mitigation + 3 adaptation actions (defined in `sample-data-context.tsx`)
- **NBS action ID:** `sample-ada-1` (the only action with full module flow)
- **Static GIS data:** Boundary, elevation, landcover, surface water, rivers, forest, population, grid, zones for Porto Alegre

### Routing

Uses `wouter` (lightweight alternative to react-router). Sample routes are prefixed via `useSampleRoute()` hook which provides `routePrefix` and `isSampleRoute`.

### i18n

All user-facing text goes through `react-i18next` with the `t()` function. Locale files:
- `client/src/core/locales/en.json` (English)
- `client/src/core/locales/pt.json` (Portuguese)

When adding new text, add keys to both files.

### UI Components

Uses a mix of:
- **shadcn/ui** (`client/src/core/components/ui/`): Button, Card, Badge, Skeleton, etc.
- **`@oef/components`**: Shared OEF typography (DisplayLarge, HeadlineLarge, TitleMedium, BodySmall, etc.)
- **lucide-react**: Icons

## Git & PRs

### Default Branch

The default branch is **`main`**. Replit syncs this branch.

- Always target `main` when creating PRs
- Feature branches should be created from `origin/main`
- After merging, Replit will auto-sync the changes

### Branch Naming

Use `feat/descriptive-name` for feature branches.

### Creating PRs from Local (without gh CLI)

If `gh` CLI is not available or authenticated, use the GitHub REST API directly:

```bash
curl -s -X POST "https://api.github.com/repos/joaquinOEF/NBS-Project-Preparation/pulls" \
  -H "Authorization: token $(security find-internet-password -s github.com -w)" \
  -H "Accept: application/vnd.github.v3+json" \
  -d '{
    "title": "PR title",
    "body": "Description",
    "head": "feat/branch-name",
    "base": "main"
  }'
```

## Development

### Running Locally

```bash
npm run dev          # Start dev server (port 5000)
npm run build        # Production build (Vite + esbuild)
npm run check        # TypeScript check
npm run db:push      # Push Drizzle schema to database
npm run format       # Format with Prettier
```

### Environment

Requires `DATABASE_URL` for PostgreSQL (Neon). See `.env.example` for all variables.

### Adding a New Sample Action

1. Add the action object to `SAMPLE_ACTIONS` in `client/src/core/contexts/sample-data-context.tsx`
2. Add an icon entry in `ACTION_ICONS` in `client/src/modules/city-information/pages/city-information.tsx`
3. If the action has full module support, update the conditional in `handleStartProject` and the "Module Coming Soon" check in `renderActionCard`

### Adding a New API Endpoint

1. Define the Drizzle schema in `server/schema.ts`
2. Add storage methods to `IStorage` interface and `DatabaseStorage` in `server/storage.ts`
3. Add the Express route in `server/routes.ts`
4. Run `npm run db:push` to sync schema

## Geospatial Tile Proxy

All OEF tile layers are served through `server/routes/tileProxyRoutes.ts` via `registerTileProxyRoutes()`.

**CRITICAL**: Do NOT add tile routes in `server/routes.ts` — they will shadow the routes registered by `registerTileProxyRoutes()` (which runs later). This caused a bug where only 1 of 48 layers worked because an old catch-all route in `routes.ts` intercepted requests first.

- **Visual tiles**: `/api/geospatial/tiles/{layerId}/{z}/{x}/{y}.png` — proxied from S3
- **Value tiles**: `/api/geospatial/proxy-tile?url={s3_url}` — generic proxy for RGB→value decode
- **Layer list**: `/api/geospatial/tile-layers` — returns all registered layers
- **OSM reference**: `/api/osm/{layerId}` — Overpass API proxy (parks, schools, hospitals, wetlands)

Layer definitions (with value encodings) live in `shared/geospatial-layers.ts`. The `ValueTooltip` component decodes pixel values on hover using `client/src/lib/valueTileUtils.ts`.

## Lessons Learned

### Persisted-state swap loop (useNavigationPersistence)

**Symptom**: a module page jittering at ~125 renders/sec — two state values (one local, one inside `savedNavState`) alternate true↔false on every React commit.

**Cause**: a restoration effect with `[navigationRestored, savedNavState]` deps that reads from `savedNavState` into local state, paired with a write-back effect that pushes local state into `savedNavState`. Once the two sides disagree by one value, each commit makes them swap.

**Fix**: restoration MUST be one-shot. Use a `useRef(false)` latch that flips to `true` after the first apply; subsequent savedNavState changes are ignored for reads (writes continue as normal). See the JSDoc on `client/src/core/hooks/useNavigationPersistence.ts` for the exact pattern.

**Also watch for** any effect that has `savedNavState` in its deps and calls `loadContext` / `setContext` — its reference churn cascades through every context subscriber (same class of loop, longer chain). The questionnaire-hydration effect in funder-selection hit this.

Fixed across all 5 module pages in PRs #114, #115.

### Replit Sync

Replit tracks the default branch (`main`). If you create a PR targeting a different branch, merged changes won't appear in Replit. Always verify the base branch before creating PRs.

### Large Files in Git

PNG files over ~500KB can cause git push failures (HTTP 400). Resize images before committing — 512x512 is sufficient for icons.

### PR Workflow

When working across multiple features:
- Create a clean feature branch from `origin/main` for each PR
- If a commit lands after a PR is already merged/closed, create a new branch and cherry-pick
- Use `git cherry-pick --skip` for commits already in the target branch

### TypeScript Build

The project has some pre-existing type errors. Use `npx tsc --noEmit` to check for new errors — focus on files you changed, not the entire output.
