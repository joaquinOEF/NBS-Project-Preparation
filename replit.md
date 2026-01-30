# Overview

The NBS Project Builder is a Nature Based Solutions planning tool designed to assist cities in developing climate action recommendations. It integrates with CityCatalyst's climate data platform to provide evidence-based mitigation and adaptation strategies, leveraging Health Impact Assessment Policy (HIAP) data. The platform offers features like geospatial risk analysis, a business model wizard, and an AI-powered impact model, all aimed at streamlining project planning and financing for urban sustainability initiatives. Its core purpose is to empower cities to accelerate urban sustainability through accessible and efficient NBS project development.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Frameworks**: React 18+ with TypeScript, Vite, Wouter.
- **Styling**: Tailwind CSS with shadcn/ui.
- **State Management**: React Query/TanStack Query for server state, local component state, React Hook Form, and a dedicated context for sample data.

## Backend
- **Framework**: Express.js with TypeScript.
- **Authentication**: Session-based with OAuth 2.0 PKCE.
- **API Design**: RESTful with centralized error handling, Zod schema validation, and rate limiting.

## Data Storage
- **ORM**: Drizzle ORM.
- **Database**: PostgreSQL (production), in-memory (development).
- **Entities**: Users, Cities, Sessions, Projects.
- **Abstracted Storage Layer**: For flexible storage implementation.

## Knowledge Workspace
- **Core Tables**: `info_blocks`, `evidence_records`, `assumptions`, `agent_action_log`, `project_patches`.
- **Module Registry**: Defines module structure, sections, and field paths for `funder_selection`, `site_explorer`, `impact_model`, `operations`, and `business_model`.
- **Agent Action Protocol**: Supports proposing, applying, rejecting patches, auto-completion, and suggestions.
- **Sample Mode**: Uses database-backed architecture with a shared, writable project.

## Conversational AI Agent
- **Architecture**: OpenAI client (`gpt-5.2`) for streaming and structured outputs, an agent service for multi-turn tool orchestration.
- **Agent Tools**: `get_project_state`, `get_block`, `list_modules`, `propose_patch`, `record_evidence`, `get_evidence`, `get_pending_patches`, `lookup_location`, `find_zone_for_coordinates`.
- **Chat Interface**: SSE streaming with `conversations` and `messages` schemas.
- **PageContext System**: Modules report their current state (step, view, context details) to the agent, enabling step-aware guidance.
  - Interface: `{ moduleName, currentStep, stepNumber, totalSteps, viewState, additionalInfo }`
  - Implemented in: Funder Selection, Site Explorer, Impact Model
  - Pattern: Separate useEffects for context updates (on state change) and cleanup (on unmount only)

## RAG Knowledge Base
- **Database Tables**: `knowledge_sources` and `knowledge_chunks`.
- **Source Types**: `block_state`, `evidence`, `conversation`, `document`, `external`.
- **Embedding Approach**: Hash-based TF-IDF for text embeddings for keyword-based similarity search.
- **Services**: `embeddingService`, `chunkingService`, `knowledgeService`, `pdfService`.
- **Agent Tool**: `search_knowledge` with tag filtering and global knowledge inclusion.

## Document Knowledge Base
- **Registry**: `shared/document-knowledge-registry.ts` defines categories, tags, and document metadata structure.
- **Categories**: `nbs_intervention_impacts`, `funder_guidelines`, `technical_standards`, `case_studies`, `local_context`, `economic_data`, `policy_frameworks`, `climate_science`.
- **Tags**: `flood-resilience`, `heat-mitigation`, `slope-stabilization`, `co-benefits`, `latin-america`, `urban-greening`, etc.
- **Global Project ID**: `global-knowledge-base` - documents are project-agnostic and available to all projects.
- **API Endpoints**:
  - `GET /api/knowledge/documents` - List all documents with metadata.
  - `POST /api/knowledge/documents/ingest` - Ingest a new document with metadata.
  - `POST /api/knowledge/documents/seed` - Seed initial knowledge documents from registry.
  - `DELETE /api/knowledge/documents/:documentId` - Remove a document.
  - `GET /api/knowledge/stats` - Global knowledge base statistics.
- **Initial Documents**: NBS Urban Climate Resilience research synthesis (flood, heat, slope evidence with Latin American case studies).
- **Scalability**: Add new documents by adding entries to `INITIAL_KNOWLEDGE_DOCUMENTS` array or via API.

## Authentication & Authorization
- **Mechanism**: OAuth 2.0 PKCE with CityCatalyst.
- **Session Management**: Server-side with secure token handling.
- **Access Control**: Project-based user access.

## Shared Project Context
- **`ProjectContextProvider`**: Facilitates data persistence and cross-module data sharing using `localStorage`.
- **"Read Before Ask" Principle**: Modules prefill data from context to minimize user input.

## Geospatial Risk Analysis
- **Site Explorer**: Grid-based risk scoring for heat, flood, and landslide.
- **OSM Asset Discovery**: Integrates OpenStreetMap Overpass API for asset identification.
- **Linear Asset Handling**: Supports clipping and length calculation for linear features.
- **Custom Asset Addition**: Users can add custom assets via OSM name search (Nominatim API) or manual coordinate entry. Custom assets include `source: 'manual'` or `source: 'nominatim'` to distinguish from auto-discovered OSM assets.

## Business Model Module
- A 6-step wizard guiding users through financing structure, archetypes, revenue, and funding pathways.

## Impact Model Module
- A 5-step AI-powered wizard (Setup → Generate → Curate → Lenses → Export) for creating funder-ready impact narratives.
- **AI Integration**: Uses OpenAI GPT-5.2 via Replit AI Integrations for structured narrative generation.
- **AI Model Selection Strategy**: Differentiates models for narrative generation, chat, audio, images, and transcription based on task requirements.
- **Data Flow**: Integrates inputs from Funder Selection and Site Explorer, and outputs signals to Operations and Business Model.

## Module Development Pattern
Modules follow a 5-layer integration: Page Goal, Block Type, Module Page, Context Integration, and RAG Ingestion. This ensures consistency and agent awareness for all modules like Funder Selection, Site Explorer, Impact Model, Operations, and Business Model.

## Real-Time Sync Pattern
The system ensures real-time UI updates when the AI agent proposes changes and the user approves them. This involves updating the database, fetching fresh data, updating the `ProjectContext`, dispatching a custom event, and triggering UI re-hydration.

## Navigation State Persistence
- **Purpose**: Users stay on the same step/view after page reload or when AI agent updates module data.
- **Interface**: `ModuleNavigation { currentStep: number, showResults?: boolean, additionalState?: Record<string, any> }`
- **Implementation Pattern**:
  1. `navigationRestored` flag prevents persistence effects from running until hydration completes
  2. Restoration effect: On mount, reads saved navigation from context and restores local state
  3. Persistence effect: When navigation changes, saves only the navigation field (not full module data)
  4. Change detection: Skips updates when navigation hasn't actually changed to prevent loops
- **Modules**: All 5 main modules (Funder Selection, Site Explorer, Impact Model, Operations, Business Model)
- **Limitation**: Site Explorer cannot restore exact zone selection since zones are loaded dynamically from the map

## Field Validation Registry
- **Location**: `shared/block-schemas.ts` - centralized `FIELD_VALIDATIONS` object
- **Purpose**: Scalable, declarative validation for patch values across all modules
- **Validation Types**: `enum` (single value), `enumArray` (array of values), `string`, `number` (with min/max), `boolean`
- **How to Add**: Add entries to `FIELD_VALIDATIONS[module_name]` array with `fieldPath`, `validation`, and optional `label`
- **Runtime**: `validateFieldValue(blockType, fieldPath, value)` returns null if valid, error message if invalid
- **Integration**: Called at two stages: (1) when agent proposes a patch via `propose_patch` tool, (2) when user approves via `/api/projects/:id/apply`

## Agent Tool Reference
The agent utilizes the following tools for understanding context and making changes:
- `get_project_state`: Get overall project state including blocks, evidence, and pending patches
- `get_block`: Read current state of a specific module block
- `get_field_options`: **MUST use before proposing patches** - looks up valid values for enum/enumArray fields
- `propose_patch`: Propose a field update (validated before creation, rejected if invalid)
- `record_evidence`: Link evidence to a specific field path
- `search_knowledge`: Search the RAG knowledge base with tag filtering
- `get_pending_patches`: Check status of proposed patches
- `lookup_location`: Look up coordinates for a location by name/address using OpenStreetMap Nominatim
- `find_zone_for_coordinates`: Given lat/lng coordinates, find which intervention zone contains that location

**Agent Workflow for Field Updates:**
1. Use `get_block` to see current module state
2. Use `get_field_options` to look up valid values BEFORE proposing any patch
3. For Impact Model: Use `search_knowledge` to find evidence before proposing narratives
4. Use `propose_patch` with ONLY valid values - user must approve each change

## Reusable UI/Agent Patterns

### Update Banner Pattern
Use for prompting users to update outdated information:
- **Styling**: Amber/warning colors (border-amber-200, bg-amber-50)
- **Icon**: AlertCircle for visual cue
- **Buttons**: Primary button for main action, outline for secondary (agent)
- **Example**: `client/src/core/pages/funder-selection.tsx` - update questionnaire banner

### Agent Context Integration (openChatWithMessage)
Pattern for opening chat with a pre-filled message:
- **Context**: `useChatState()` from `chat-context.tsx` provides `openChatWithMessage(message: string)`
- **Usage**: `openChatWithMessage(t('module.updateBanner.agentMessage'))`
- **Flow**: Message is queued, chat drawer opens, message auto-sends after history loads
- **Implementation**: `pendingInitialMessage` state + `clearPendingMessage` cleanup

### User-Friendly Agent Response Formatting
Agent system prompt includes instructions to format responses in readable language:
- Group by logical sections (Project Status, Budget & Financing, Governance)
- Use plain language labels, not schema field names
- Translate enum values (e.g., "idea" → "Early idea phase", "over_50m" → "Over $50 million")
- Use bullet points for readability
- **Location**: `server/services/agentService.ts` SYSTEM_PROMPT

### Cross-Module Navigation Buttons
When agent updates module data and user is not on that module's page:
- Use `[NAV_BUTTON:path|label]` syntax in chat messages to render clickable navigation buttons
- ChatDrawer's `parseNavigationButtons()` extracts these markers and renders actual `<Button>` components
- **Syntax**: `[NAV_BUTTON:/sample/funder-selection/sample-ada-1|View Funder Selection Results]`
- **Implementation**: ChatDrawer parses content, strips markers, renders buttons with `setLocation(path)` onClick
- **Path Building**: Use `isSampleMode` to construct correct path (sample vs regular project routes)
- **Example**: `showReadinessUpdate()` in ChatDrawer adds navigation button when off funder-selection page

### Post-Patch Readiness Recalculation
After funder_selection questionnaire patches are applied:
- **Shared Utility**: `client/src/core/utils/funding-readiness.ts`
- **Functions**: `computeReadinessScores()`, `determinePathway()`, `formatReadinessSummary()`
- **Trigger**: ChatDrawer calls `showReadinessUpdate()` after applying funder_selection patches
- **Output**: Formatted summary with scores, pathway, and navigation prompt if not on page

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