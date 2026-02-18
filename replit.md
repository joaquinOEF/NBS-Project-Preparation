# Overview

The NBS Project Builder is a Nature Based Solutions planning tool that assists cities in developing climate action recommendations. It integrates with CityCatalyst's climate data platform to deliver evidence-based mitigation and adaptation strategies, utilizing Health Impact Assessment Policy (HIAP) data. The platform offers geospatial risk analysis, a business model wizard, and an AI-powered impact model. Its core purpose is to accelerate urban sustainability by simplifying NBS project development for cities, streamlining project planning and financing processes.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Frameworks**: React 18+ with TypeScript, Vite, Wouter.
- **Styling**: Tailwind CSS with shadcn/ui.
- **State Management**: React Query/TanStack Query, React Hook Form.

## Backend
- **Framework**: Express.js with TypeScript.
- **Authentication**: Session-based with OAuth 2.0 PKCE.
- **API Design**: RESTful with centralized error handling, Zod schema validation, and rate limiting.

## Data Storage
- **ORM**: Drizzle ORM.
- **Database**: PostgreSQL (production), in-memory (development).
- **Entities**: Users, Cities, Sessions, Projects.
- **Abstracted Storage Layer**: For flexible storage implementation.

## Conversational AI Agent
- **Architecture**: OpenAI client (`gpt-5.2`) for streaming and structured outputs, an agent service for multi-turn tool orchestration. Reasoning effort is configurable per request: `"none"` for per-block editing (fastest), `"low"` for general chat, `"medium"` for complex tasks. Passed via `AgentContext.reasoningEffort`.
- **Agent Tools**: Comprehensive set for project state management, evidence recording, module interaction, geospatial operations, and funder selection.
- **Chat Interface**: SSE streaming with `conversations` and `messages` schemas.
- **PageContext System**: Modules report their current state to the agent for step-aware guidance.

## RAG Knowledge Base
- **Database Tables**: `knowledge_sources` and `knowledge_chunks`.
- **Embedding Approach**: Hash-based TF-IDF for text embeddings for keyword-based similarity search.
- **Agent Tool**: `search_knowledge` with tag filtering.

## Document Knowledge Base
- **Categories**: `nbs_intervention_impacts`, `funder_guidelines`, `technical_standards`, `case_studies`, `local_context`, `economic_data`, `policy_frameworks`, `climate_science`.
- **Auto-Seeding**: Ensures missing documents are seeded on server startup.

## Authentication & Authorization
- **Mechanism**: OAuth 2.0 PKCE with CityCatalyst.
- **Session Management**: Server-side with secure token handling.
- **Access Control**: Project-based user access.

## Shared Project Context
- **`ProjectContextProvider`**: Facilitates data persistence and cross-module data sharing using `localStorage`, implementing a "Read Before Ask" principle.

## Geospatial Risk Analysis
- **Site Explorer**: Grid-based risk scoring for heat, flood, and landslide.
- **OSM Asset Discovery**: Integrates OpenStreetMap Overpass API for asset identification.
- **Custom Asset Addition**: Users can add custom assets via OSM name search (Nominatim API) or manual coordinate entry.

## Business Model Module
- A 6-step wizard guiding users through financing structure, archetypes, revenue, and funding pathways.

## Impact Model Module
- A 4-step AI-powered wizard (Setup → Quantify → Narrate → Lenses) for creating funder-ready impact narratives.
- **AI Integration**: Uses OpenAI GPT-5.2 for structured narrative generation.
- **Data Flow**: Integrates inputs from Funder Selection and Site Explorer, and outputs signals to Operations and Business Model.
- **Quantification Architecture**: KPIs are zone-specific and intervention-site-specific, with AI prompts receiving full intervention portfolio data.
- **3-Phase Narrative Pipeline**: Plan (outline generation), Generate (parallel block generation), Assemble (combination and validation). RAG integration occurs before Phase 1.
- **Selective Regeneration Pipeline**: Detects affected sections after manual edits, re-plans, and regenerates only necessary blocks.
- **Per-Block Editing**: "Update with Agent" opens chat with pre-filled input hint (not auto-sent). Uses `useQuickModel: true` in pageContext to trigger `reasoning: { effort: "none" }` for fastest responses. After single-block regeneration, an ACTION_BUTTON is auto-suggested for conflict detection across remaining blocks.

## Module Development Pattern
Modules follow a 5-layer integration: Page Goal, Block Type, Module Page, Context Integration, and RAG Ingestion for consistency and agent awareness.

## Real-Time Sync Pattern
Ensures real-time UI updates upon AI agent proposed changes approval through database updates, data fetching, context updates, event dispatch, and UI re-hydration.

## Navigation State Persistence
- **Purpose**: Users remain on the same step/view after page reload or AI agent updates.
- **Key Design**: Navigation state is stored in a SEPARATE `localStorage` key, isolated from domain data to prevent race conditions.

## Field Validation Registry
- **Purpose**: Scalable, declarative validation for patch values across all modules.

## Field Relationships Registry
- **Purpose**: Auto-create related patches when dependent fields are updated using various sync types.

## Agent Action Button Pattern
- **Purpose**: AI agent suggests long-running or destructive actions via `ACTION_BUTTON` in messages for user confirmation instead of direct execution.
- **Frontend Handling**: `ChatDrawer` parses `ACTION_BUTTON`s, renders them with loading/completion states.
- **Backend Handling**: `POST /api/projects/:projectId/agent/action` receives action and parameters, dispatches to appropriate service function.
- **Agent Prompting**: System prompt instructs the agent to use `ACTION_BUTTON` syntax.

## Hydration & Real-Time Sync (CRITICAL — Anti-Jitter Rules)

### Problem Solved
Module pages (Impact Model, Site Explorer, etc.) display data from the database. When the AI agent changes data, or when the page loads, data must flow through a single path to avoid **jitter** (UI flickering caused by multiple competing state updates).

### The Single Data Path Rule
Each module page has exactly ONE authoritative data source at any given time:
- **On page load**: `hydrateFromDB()` fetches from API → sets `localData` → syncs to context via `updateModule(…, { skipDbSync: true })`.
- **On AI agent update**: `syncBlockToLocalStorage` (in ChatDrawer) fetches from API → calls `updateModule` → dispatches `nbs-block-updated` event WITH data in `detail.data` → module page reads data from event detail and applies directly to `localData`. **No second API fetch.**

### Anti-Jitter Rules (DO NOT VIOLATE)
1. **Never add a `useEffect([context?.moduleName])` that calls `setLocalData`**. This creates a second write path. The context is updated as a side-effect of hydration, not as a trigger for it. The old pattern `useEffect(() => { if (context?.impactModel) setLocalData(...) }, [context?.impactModel])` caused double-renders and was removed.
2. **Never re-fetch from API in `nbs-block-updated` handler**. The event already carries the data in `detail.data`. Use it directly. The old pattern `hydrateFromDB()` inside the event handler caused a redundant API call and triple state update.
3. **Navigation state is SEPARATE from domain data**. Use `useNavigationPersistence` hook with its own `localStorage` key (`nbs-nav-state_<module>_<projectId>`). Never store step/navigation in the module's domain data object.
4. **Wait for `dataHydrated` before restoring navigation**. The effect that sets `currentStep` from saved navigation must guard on both `navigationRestored && dataHydrated`.
5. **Use `hydratingRef` guard** to prevent overlapping hydrations. Set a ref before fetching, clear it in `finally`.
6. **`updateModule` with `skipDbSync: true`** when writing data that was just read from the DB. This prevents a write-back loop.

### Data Flow Diagram
```
PAGE LOAD:
  loadContext(projectId)          → reads localStorage → sets context (fast, sync)
  hydrateFromDB()                 → fetches API → normalizes → setLocalData + updateModule(skipDbSync) → sets dataHydrated=true
  useNavigationPersistence        → reads separate localStorage key → sets navigationRestored=true
  Navigation restore effect       → waits for BOTH dataHydrated + navigationRestored → sets currentStep

AI AGENT UPDATE:
  syncBlockToLocalStorage()       → fetches API → updateModule(data) → dispatches nbs-block-updated(data)
  Module event handler            → reads data from event.detail → setLocalData(normalize(data))
                                    (NO additional API fetch, NO context effect trigger)
```

### Files Involved
- `client/src/core/pages/impact-model.tsx` — `hydrateFromDB`, `normalizeRawData`, `applyHydratedData`, event listener
- `client/src/core/components/agent/ChatDrawer.tsx` — `syncBlockToLocalStorage` function
- `client/src/core/contexts/project-context.tsx` — `updateModule`, `loadContext`
- `client/src/core/hooks/useNavigationPersistence.ts` — navigation state persistence hook

## SSE Progress Streaming
- **Pattern**: Long-running AI endpoints use Server-Sent Events to stream real-time progress updates.
- **Backend**: `ProgressCallback` for key stage updates, `text/event-stream` headers, and event emission.
- **Frontend**: `processSSERequest()` utility for SSE parsing and `ProgressLog` component for animated activity feed.
- **SSE Event Format**: `data: JSON\n\n` with `type` field (`progress`, `result`, `error`).
- **`stepId` Merging**: Ensures progress entries are correctly merged and updated in the UI.

# External Dependencies

## Authentication Service
- **CityCatalyst OAuth**: OAuth 2.0 provider.

## Database
- **PostgreSQL**: Production database.
- **Neon Database**: Cloud PostgreSQL service.

## Platform & Runtime
- **Replit Platform**: Development and hosting environment.
- **Node.js Runtime**: Server execution.

## UI Components
- **Radix UI**: Accessible component primitives.
- **Lucide Icons**: Icon library.

## API Integrations
- **CityCatalyst API**: Provides HIAP data, city details, and city boundaries.
- **OpenStreetMap Overpass API**: For geospatial asset discovery.
- **OpenStreetMap Nominatim API**: For location lookup.
- **OpenAI GPT-5.2**: For AI-powered conversational agent and impact model generation.