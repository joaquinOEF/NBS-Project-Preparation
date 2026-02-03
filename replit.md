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
- **Module Registry**: Defines module structure for `funder_selection`, `site_explorer`, `impact_model`, `operations`, and `business_model`.
- **Agent Action Protocol**: Supports proposing, applying, rejecting patches, auto-completion, and suggestions.
- **Sample Mode**: Uses database-backed architecture with a shared, writable project.

## Conversational AI Agent
- **Architecture**: OpenAI client (`gpt-5.2`) for streaming and structured outputs, an agent service for multi-turn tool orchestration.
- **Agent Tools**: `get_project_state`, `get_block`, `list_modules`, `propose_patch`, `record_evidence`, `get_evidence`, `get_pending_patches`, `lookup_location`, `find_zone_for_coordinates`, `add_intervention_site`, `select_funder`.
- **Chat Interface**: SSE streaming with `conversations` and `messages` schemas.
- **PageContext System**: Modules report their current state to the agent for step-aware guidance.

## RAG Knowledge Base
- **Database Tables**: `knowledge_sources` and `knowledge_chunks`.
- **Source Types**: `block_state`, `evidence`, `conversation`, `document`, `external`.
- **Embedding Approach**: Hash-based TF-IDF for text embeddings for keyword-based similarity search.
- **Services**: `embeddingService`, `chunkingService`, `knowledgeService`, `pdfService`.
- **Agent Tool**: `search_knowledge` with tag filtering.

## Document Knowledge Base
- **Registry**: `shared/document-knowledge-registry.ts` defines categories, tags, and document metadata.
- **Categories**: `nbs_intervention_impacts`, `funder_guidelines`, `technical_standards`, `case_studies`, `local_context`, `economic_data`, `policy_frameworks`, `climate_science`.
- **Global Project ID**: `global-knowledge-base` for project-agnostic documents.
- **API Endpoints**: `GET /api/knowledge/documents`, `POST /api/knowledge/documents/ingest`, `POST /api/knowledge/documents/seed`, `DELETE /api/knowledge/documents/:documentId`, `GET /api/knowledge/stats`.
- **Auto-Seeding**: On server startup, ensures missing documents from `INITIAL_KNOWLEDGE_DOCUMENTS` are seeded.

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
- A 5-step AI-powered wizard (Setup → Generate → Curate → Lenses → Export) for creating funder-ready impact narratives.
- **AI Integration**: Uses OpenAI GPT-5.2 via Replit AI Integrations for structured narrative generation.
- **Data Flow**: Integrates inputs from Funder Selection and Site Explorer, and outputs signals to Operations and Business Model.

## Module Development Pattern
Modules follow a 5-layer integration: Page Goal, Block Type, Module Page, Context Integration, and RAG Ingestion for consistency and agent awareness.

## Real-Time Sync Pattern
Ensures real-time UI updates upon AI agent proposed changes approval, involving database updates, data fetching, context updates, event dispatch, and UI re-hydration.

## Navigation State Persistence
- **Purpose**: Users remain on the same step/view after page reload or AI agent updates.
- **Hook**: `useNavigationPersistence` in `client/src/core/hooks/useNavigationPersistence.ts`.
- **Key Design**: Navigation state is stored in a SEPARATE localStorage key (`nbs-nav-state_{module}_{projectId}`), completely isolated from domain data.
- **Why Separated**: Prevents race conditions where navigation updates could overwrite agent patches in the database. Navigation is UI state, not domain data.
- **Usage**: Modules use the hook instead of storing navigation inside module data. The hook provides `navigationState`, `updateNavigationState`, and `navigationRestored`.

## Field Validation Registry
- **Location**: `shared/block-schemas.ts` - centralized `FIELD_VALIDATIONS` object.
- **Purpose**: Scalable, declarative validation for patch values across all modules.
- **Validation Types**: `enum`, `enumArray`, `string`, `number` (with min/max), `boolean`.
- **Integration**: Validates proposed patches and user-approved changes.

## Field Relationships Registry
- **Location**: `shared/block-schemas.ts` - centralized `FIELD_RELATIONSHIPS` object.
- **Purpose**: Auto-create related patches when dependent fields are updated.
- **Sync Types**: `ensure_in_array`, `copy_value`, `clear_if_not_in`, `custom`.
- **Current Relationships**: `funder_selection`: selectedFunds → shortlistedFunds; `business_model`: primaryPayerId → candidatePayers; `operations`: operatingModel/operatorEntityId → readiness checklist flags.

## Agent Tool Reference
The agent utilizes tools like `get_project_state`, `get_block`, `get_field_options`, `propose_patch`, `record_evidence`, `search_knowledge`, `get_pending_patches`, `lookup_location`, `find_zone_for_coordinates`, `add_intervention_site`, and `select_funder` for context understanding and modifications.

## Reusable UI/Agent Patterns
- **Update Banner Pattern**: For prompting users to update outdated information, using amber styling and `AlertCircle` icon.
- **Agent Context Integration**: `useChatState()` provides `openChatWithMessage(message: string)` for opening chat with pre-filled messages.
- **User-Friendly Agent Response Formatting**: System prompt ensures readable language, logical grouping, plain labels, translated enum values, and bullet points.
- **Cross-Module Navigation Buttons**: `[NAV_BUTTON:path|label]` syntax in chat messages to render clickable navigation buttons for modules.
- **Post-Patch Readiness Recalculation**: Shared utility `funding-readiness.ts` computes readiness scores and determines pathways after funder_selection questionnaire patches.

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