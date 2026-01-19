# Overview

The **NBS Project Builder** is a Nature Based Solutions planning tool designed to assist cities in developing climate action recommendations. It integrates with CityCatalyst's climate data platform to provide evidence-based mitigation and adaptation strategies, leveraging Health Impact Assessment Policy (HIAP) data. The platform offers features like geospatial risk analysis, a business model wizard, and an AI-powered impact model, all aimed at streamlining project planning and financing for urban sustainability initiatives.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Frameworks**: React 18+ with TypeScript, Vite for building, Wouter for routing.
- **Styling**: Tailwind CSS with shadcn/ui.
- **State Management**: React Query/TanStack Query for server state, local component state for UI, React Hook Form for forms, and a dedicated context for sample data.

## Backend
- **Framework**: Express.js with TypeScript.
- **Authentication**: Session-based with OAuth 2.0 PKCE.
- **API Design**: RESTful, with centralized error handling, Zod schema validation, and rate limiting.

## Data Storage
- **ORM**: Drizzle ORM.
- **Database**: PostgreSQL (production), in-memory (development).
- **Entities**: Users, Cities, Sessions, Projects.
- **Abstracted Storage Layer**: Enables flexible storage implementation.

## Knowledge Workspace
- **Database Tables**: `info_blocks` (module states), `evidence_records` (evidence tracking), `assumptions` (project assumptions), `agent_action_log` (audit trail), `project_patches` (field-level changes).
- **Module Registry**: Defines modules (funder_selection, site_explorer, impact_model, operations, business_model) with their sections and field paths.
- **Agent Action Protocol**: Supports proposing, applying, rejecting patches, auto-completion, and suggestions.
- **Sample Mode**: Utilizes the database-backed architecture with a shared, writable project for sample users.

## Conversational AI Agent
- **Architecture**: OpenAI client (`gpt-5.2`) for streaming and structured outputs, an agent service for multi-turn tool orchestration, and dedicated routes for chat management.
- **Agent Tools**: `get_project_state`, `get_block`, `list_modules`, `propose_patch`, `record_evidence`, `get_evidence`, `get_pending_patches`.
- **Chat Interface**: SSE streaming for real-time interaction, with database schemas for `conversations` and `messages`.

## RAG Knowledge Base
- **Database Tables**: `knowledge_sources` and `knowledge_chunks` for indexed content.
- **Embedding Approach**: Hash-based TF-IDF for text embeddings due to platform limitations, enabling keyword-based similarity search.
- **Services**: `embeddingService`, `chunkingService`, `knowledgeService` for ingestion and search.
- **Agent Tool**: `search_knowledge` for querying the knowledge base.

## Authentication & Authorization
- **Mechanism**: OAuth 2.0 PKCE with CityCatalyst.
- **Session Management**: Server-side with secure token handling.
- **Access Control**: Project-based user access.

## Shared Project Context
- **`ProjectContextProvider`**: Facilitates data persistence and cross-module data sharing using localStorage.
- **"Read Before Ask" Principle**: Modules prefill data from context to minimize user input.

## Geospatial Risk Analysis
- **Site Explorer**: Grid-based risk scoring for heat, flood, and landslide.
- **OSM Asset Discovery**: Integrates with OpenStreetMap Overpass API for real-world asset identification.
- **Linear Asset Handling**: Supports clipping and length calculation for linear features like roads and waterways.

## Business Model Module
- A 6-step wizard guiding users through financing structure, archetypes, revenue, and funding pathways.

## Impact Model Module
- A 5-step AI-powered wizard (Setup → Generate → Curate → Lenses → Export) for creating funder-ready impact narratives.
- **AI Integration**: Uses OpenAI GPT-5.2 via Replit AI Integrations for structured narrative generation.
- **AI Model Selection Strategy**: Differentiates models for narrative generation, chat, audio, images, and transcription based on task requirements.
- **Data Flow**: Integrates inputs from Funder Selection and Site Explorer, and outputs signals to Operations and Business Model.

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