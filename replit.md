# Overview

This is the **NBS Project Builder** - a Nature Based Solutions planning tool that connects with CityCatalyst's climate data platform. The application helps cities explore climate action recommendations including mitigation and adaptation strategies, leveraging CityCatalyst's HIAP (Health Impact Assessment Policy) data for evidence-based action recommendations.

**Key Capabilities**:
- CityCatalyst OAuth 2.0 PKCE authentication flow
- Sample data mode for exploration without authentication
- Display of Climate Actions (Mitigation and Adaptation)
- Internationalization support (English and Portuguese)
- PostHog analytics integration
- Geospatial risk analysis for heat, flood, and landslide
- Business Model wizard for structuring project financing

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18+ with TypeScript
- **Build System**: Vite
- **Routing**: Wouter
- **Styling**: Tailwind CSS + shadcn/ui
- **Data Fetching**: React Query/TanStack Query
- **State Management**: Sample Data Context (for sample mode), React Query Cache (server state), Local Component State (UI state), React Hook Form (forms)

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Authentication**: Session-based with OAuth 2.0 PKCE
- **Storage**: In-memory (development), PostgreSQL (production)
- **API Design**: RESTful endpoints, centralized error handling, Zod schema validation, rate limiting

## Data Storage Design
- **ORM**: Drizzle ORM
- **Entities**: Users, Cities, Sessions, Projects
- **Abstracted Storage Layer**: Allows switching between in-memory and database implementations.

## Knowledge Workspace (Phase 1)
The platform now supports a database-backed project state that enables agent-aware workflows.

### New Database Tables
- **info_blocks**: Stores typed block state for each module (funder_selection, site_explorer, impact_model, operations, business_model)
- **evidence_records**: Evidence layer with source tracking, confidence levels, and linked paths
- **assumptions**: Project assumptions with scope, sensitivity, and validation tracking
- **agent_action_log**: Audit trail for all agent actions with proposed/applied patches
- **project_patches**: Field-level patches with draft/confirm workflow

### Key APIs
- `GET /api/projects/:id/state` - Unified project state with all blocks, evidence, assumptions, pending patches
- `POST /api/projects/:id/patch` - Propose field-level patches with evidence refs
- `POST /api/projects/:id/apply` - Apply pending patches with agent action logging
- `POST /api/projects/:id/reject` - Reject pending patches with feedback
- `GET /api/projects/:id/actions` - Agent action audit log
- `PUT /api/projects/:id/blocks/:blockType` - Update specific block with validation

### Module Registry (MODULE_REGISTRY)
Defines all modules with their routes, sections, and field paths for agent navigation:
- funder_selection: questionnaire, pathway, targetFunders sections
- site_explorer: zones, interventions, layers sections
- impact_model: prioritization, narrative, cobenefits, signals sections
- operations: model, serviceLevels, nbs, costs, readiness sections
- business_model: archetype, payment, revenue, financing, readiness sections

### Agent Action Protocol
- **propose_patch**: Agent proposes field-level updates for review
- **apply_patch**: Confirmed changes are applied to the project
- **reject_patch**: User rejected proposed changes
- **auto_complete**: Agent auto-fills a field based on context
- **suggest**: Agent provides suggestions without modifying
- **draft**: Agent drafts content for a field

### Schema Files
- `shared/workspace-schema.ts`: Drizzle table definitions and types
- `shared/block-schemas.ts`: Zod validation schemas for all module blocks
- `shared/sample-constants.ts`: Sample mode constants for Porto Alegre project

### Sample Mode Integration
Sample mode now uses the same database-backed architecture as authenticated users:
- **Shared Writable Project**: All sample mode users share a single Porto Alegre project record
- **Sample Constants**: `SAMPLE_USER_ID`, `SAMPLE_PROJECT_ID`, `SAMPLE_CITY_ID` defined in `shared/sample-constants.ts`
- **Init Endpoint**: `POST /api/sample/init` seeds sample user, city, and project with empty info blocks
- **Storage Methods**: `createUserWithId` and `createProjectWithId` support explicit ID assignment for sample entities
- **Idempotent Initialization**: Init checks for existing records before creating new ones

## Conversational AI Agent (Phase 2)
The platform includes a conversational AI agent that can read/write the Knowledge Workspace and interact with users through a streaming chat interface.

### Agent Architecture
- **OpenAI Client**: `server/services/openaiClient.ts` - GPT-5.2 Responses API with streaming and structured outputs
- **Agent Service**: `server/services/agentService.ts` - Multi-turn tool orchestration with 7 tools
- **Agent Routes**: `server/routes/agentRoutes.ts` - SSE streaming chat, conversation management, patch workflows
- **Chat UI**: `client/src/core/components/agent/ChatDrawer.tsx` - Floating chat drawer with pending patch display

### Agent Tools
- `get_project_state`: Fetch full project state (blocks, evidence, assumptions, patches)
- `get_block`: Get specific module block state
- `list_modules`: List available modules with sections and field paths
- `propose_patch`: Propose field-level updates for user approval
- `record_evidence`: Record evidence linked to field paths
- `get_evidence`: Retrieve all evidence records
- `get_pending_patches`: List patches awaiting approval

### Chat APIs
- `POST /api/projects/:id/agent/chat`: Streaming chat with SSE events
- `GET /api/projects/:id/agent/conversations`: List conversations
- `GET /api/projects/:id/agent/conversations/:cid`: Get conversation with messages
- `DELETE /api/projects/:id/agent/conversations/:cid`: Delete conversation
- `GET /api/projects/:id/patches`: Get pending patches
- `POST /api/projects/:id/patches/:pid/apply`: Apply a pending patch
- `POST /api/projects/:id/patches/:pid/reject`: Reject a pending patch

### SSE Event Types
- `text`: Streaming text content from assistant
- `tool_call`: Agent calling a tool (name + arguments)
- `tool_result`: Result from tool execution
- `done`: Response complete with conversationId
- `error`: Error occurred during processing

### Chat Database Schema
- `conversations`: Stores chat sessions with title and timestamps
- `messages`: Stores individual messages with role, content, and conversationId

### Multi-Turn Tool Calling
The agent uses a loop-based approach for tool calls:
1. Send user message to GPT-5.2 with available tools
2. If model returns function_call, execute the tool
3. Append tool result to message history
4. Continue until model returns text without function calls
5. Maximum 5 tool iterations per request

## Authentication & Authorization
- **Mechanism**: OAuth 2.0 PKCE with CityCatalyst, Sample Data Mode bypass
- **Session Management**: Server-side with secure token handling
- **Access Control**: Project-based user access to cities

## Shared Project Context Architecture
- A unified `ProjectContextProvider` for data persistence and cross-module data sharing.
- Modules should `Read Before Ask` to prefill data from the shared context, minimizing redundant user input.
- Data available for prefill includes information from Funder Selection, Site Explorer, Impact Model, Operations (O&M), Business Model, and Core Project modules.
- Data is primarily persisted to `nbs_project_context_${projectId}` in localStorage.

## Feature Development Requirements
- All new features must include Internationalization (en.json, pt.json).
- Analytics tracking with PostHog ("Feature — Action — Result" convention).
- Integration with the Shared Project Context for data storage and retrieval.

## Geospatial Risk Analysis
- **Site Explorer**: Uses a grid-based risk scoring system with asset-based intervention selection.
- **Risk Formulas**:
    - **Heat Risk**: Based on building density, population density, vegetation deficit, water deficit.
    - **Flood Risk**: Based on D8 flow accumulation, topographic depressions, river proximity, low-lying areas.
    - **Landslide Risk**: Based on slope, vegetation cover deficit, terrain position.
- **OSM Asset Discovery**: Fetches real assets from OpenStreetMap Overpass API based on intervention-compatible asset types.
- **Linear Asset Handling**: 
    - Roads, waterways, and other linear features use `turf.bboxClip` for clipping to zone bounds
    - Supports both LineString and MultiLineString geometries
    - Length calculated from clipped geometry for accurate USD/m cost scaling
    - Common OSM tags: leisure=park, leisure=garden, natural=water, highway=residential, waterway=stream, place=square, amenity=marketplace

## Business Model Module
- A 6-step wizard to structure project financing.
- Guides users through selecting payers, beneficiaries, business model archetypes, revenue stacks, and financing pathways.
- Validates bankability requirements and provides readiness gate checks.

## Impact Model Module
- A 5-step wizard to generate AI-powered impact narratives: **Setup → Generate → Curate → Lenses → Export**
- Translates Site Explorer zones and interventions into credible, funder-ready impact narratives
- **AI Integration**: Uses OpenAI GPT-5.2 via Replit AI Integrations (no API key required)
    - Endpoint: `POST /api/impact-model/generate`
    - Service: `server/services/impactModelService.ts`
    - Uses JSON response format for structured narrative output
    - Model: `gpt-5.2` - chosen for complex reasoning and long-context understanding
- **AI Model Selection Strategy**:
    - Impact Narrative (gpt-5.2, reasoning_effort: "none"): Fast structured JSON generation
    - Chat Conversations (gpt-5.2, reasoning_effort: "low"): Balanced speed and quality
    - Voice/Audio (gpt-audio-mini): Specialized audio model for TTS/STT
    - Images (gpt-image-1): Specialized image generation model
    - Transcription (gpt-4o-mini-transcribe): Optimized for accurate speech recognition
- **Key Data Structures**:
    - `NarrativeBlock`: Structured narrative sections with lens variants (neutral, climate, social, financial, institutional)
    - `CoBenefitCard`: Co-benefits with category, confidence, evidence tier, and include/exclude flags
    - `SignalCard`: Downstream signals for O&M, Business Model, MRV, and implementors
    - `PrioritizationWeights`: Adjustable weights (floodRiskReduction, heatReduction, landslideRiskReduction, socialEquity, costCertainty, biodiversityWaterQuality)
- **Data Flow**:
    - Inputs FROM Funder Selection: pathway, funder constraints, narrative tone
    - Inputs FROM Site Explorer: selectedZones with hazardType, interventionType, riskScore (0-1 scale)
    - Outputs TO Operations: downstream signals for maintenance requirements
    - Outputs TO Business Model: revenue-relevant signals and co-benefits
- **Sample Data Mode**: Uses sampleSiteExplorer and sampleFunderSelection exports for realistic exploration without real data
- **Lens Caching**: Lens-specific narratives are generated once and cached to preserve edits

# External Dependencies

## Authentication Service
- **CityCatalyst OAuth**: OAuth 2.0 provider for authentication.

## Database
- **PostgreSQL**: Production database, supports spatial extensions.
- **Neon Database**: Cloud PostgreSQL service.

## Build & Deployment
- **Replit Platform**: Development and hosting.
- **Node.js Runtime**: Server execution environment.

## UI Component Libraries
- **Radix UI**: Accessible, unstyled component primitives.
- **Lucide Icons**: Modern icon library.

## Development Tools
- **Drizzle Kit**: Database migration and introspection.
- **TypeScript**: Static type checking.
- **ESBuild**: Fast JavaScript/TypeScript bundler.

## API Integrations
- **CityCatalyst API**: For HIAP data, city details, and city boundaries.
    - `getHIAPData(inventoryId, actionType, language)`: Provides ranked climate action recommendations with co-benefits, GHG reduction, and implementation guidance.
    - `getCityDetail(cityId)`: Retrieves detailed city information.
    - `getCityBoundary(locode)`: Retrieves city boundary as GeoJSON.