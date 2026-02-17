# Overview

The NBS Project Builder is a Nature Based Solutions planning tool designed to help cities develop climate action recommendations. It integrates with CityCatalyst's climate data platform to provide evidence-based mitigation and adaptation strategies, utilizing Health Impact Assessment Policy (HIAP) data. The platform features geospatial risk analysis, a business model wizard, and an AI-powered impact model. Its primary goal is to accelerate urban sustainability by making NBS project development more accessible and efficient for cities, streamlining project planning and financing.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Frameworks**: React 18+ with TypeScript, Vite, Wouter.
- **Styling**: Tailwind CSS with shadcn/ui.
- **State Management**: React Query/TanStack Query, React Hook Form, and a dedicated context for sample data.

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
- **Agent Tools**: Comprehensive set for project state management, evidence recording, module interaction, geospatial operations, and funder selection.
- **Chat Interface**: SSE streaming with `conversations` and `messages` schemas.
- **PageContext System**: Modules report their current state to the agent for step-aware guidance.

## RAG Knowledge Base
- **Database Tables**: `knowledge_sources` and `knowledge_chunks`.
- **Embedding Approach**: Hash-based TF-IDF for text embeddings for keyword-based similarity search.
- **Agent Tool**: `search_knowledge` with tag filtering.

## Document Knowledge Base
- **Registry**: `shared/document-knowledge-registry.ts` defines categories, tags, and document metadata.
- **Categories**: `nbs_intervention_impacts`, `funder_guidelines`, `technical_standards`, `case_studies`, `local_context`, `economic_data`, `policy_frameworks`, `climate_science`.
- **Auto-Seeding**: Ensures missing documents from `INITIAL_KNOWLEDGE_DOCUMENTS` are seeded on server startup.

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
- **Per-Block Editing**: Allows inline editing and chat-driven changes for individual narrative blocks.

## Module Development Pattern
Modules follow a 5-layer integration: Page Goal, Block Type, Module Page, Context Integration, and RAG Ingestion for consistency and agent awareness.

## Real-Time Sync Pattern
Ensures real-time UI updates upon AI agent proposed changes approval through database updates, data fetching, context updates, event dispatch, and UI re-hydration.

## Navigation State Persistence
- **Purpose**: Users remain on the same step/view after page reload or AI agent updates.
- **Key Design**: Navigation state is stored in a SEPARATE `localStorage` key, isolated from domain data to prevent race conditions.

## Field Validation Registry
- **Location**: `shared/block-schemas.ts` - centralized `FIELD_VALIDATIONS` object.
- **Purpose**: Scalable, declarative validation for patch values across all modules.

## Field Relationships Registry
- **Location**: `shared/block-schemas.ts` - centralized `FIELD_RELATIONSHIPS` object.
- **Purpose**: Auto-create related patches when dependent fields are updated using various sync types.

## Agent Tool Reference
The agent utilizes tools like `get_project_state`, `get_block`, `propose_patch`, `record_evidence`, `search_knowledge`, `lookup_location`, `add_intervention_site`, `select_funder`, `regenerate_kpis`, `regenerate_narrative`, and `regenerate_block` for context understanding and modifications.

## Reusable UI/Agent Patterns
- **Update Banner Pattern**: For prompting users to update outdated information.
- **Agent Context Integration**: `useChatState()` provides `openChatWithMessage(message: string)` for opening chat with pre-filled messages.
- **User-Friendly Agent Response Formatting**: System prompt ensures readable language, logical grouping, plain labels, translated enum values, and bullet points.
- **Cross-Module Navigation Buttons**: `[NAV_BUTTON:path|label]` syntax in chat messages for clickable navigation.
- **Post-Patch Readiness Recalculation**: Shared utility `funding-readiness.ts` computes readiness scores and determines pathways.

## SSE Progress Streaming
- **Pattern**: Long-running AI endpoints use Server-Sent Events to stream real-time progress updates.
- **Backend**: `ProgressCallback` for key stage updates, `text/event-stream` headers, and event emission.
- **Frontend**: `processSSERequest()` utility for SSE parsing and `ProgressLog` component for animated activity feed.

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