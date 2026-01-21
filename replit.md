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
- **Agent Tools**: `get_project_state`, `get_block`, `list_modules`, `propose_patch`, `record_evidence`, `get_evidence`, `get_pending_patches`.
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

## Agent Tool Reference
The agent utilizes tools like `get_project_state`, `get_block`, `propose_patch`, `record_evidence`, `search_knowledge`, and `get_pending_patches` for understanding context, making changes, and managing information.

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