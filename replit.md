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
- **Site Explorer**: Uses a grid-based risk scoring system.
- **Risk Formulas**:
    - **Heat Risk**: Based on building density, population density, vegetation deficit, water deficit.
    - **Flood Risk**: Based on D8 flow accumulation, topographic depressions, river proximity, low-lying areas.
    - **Landslide Risk**: Based on slope, vegetation cover deficit, terrain position.

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
    - Impact Narrative (gpt-5.2): Complex analysis requiring high-quality reasoning
    - Chat Conversations (gpt-5.2): Best quality for user interactions
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