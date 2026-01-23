# NBS Project Builder

A **Nature-Based Solutions (NBS) planning platform** that helps cities develop climate action projects with evidence-based recommendations, AI-powered narratives, and structured financing pathways.

## Overview

The NBS Project Builder integrates with CityCatalyst's climate data platform to provide cities with a streamlined workflow for developing and financing urban sustainability initiatives. The platform combines geospatial risk analysis, funder matching, impact modeling, and business planning into a cohesive project development experience.

### Core Purpose

Empower cities to accelerate urban sustainability through accessible and efficient NBS project development by:

- **Identifying climate risks** through geospatial analysis of heat, flood, and landslide hazards
- **Matching funders** to project characteristics using an intelligent questionnaire system
- **Generating impact narratives** grounded in scientific evidence via AI
- **Building business models** with structured financing pathways
- **Planning operations** with maintenance schedules and capacity assessments

## Key Features

### 1. Funder Selection Module
A guided questionnaire that matches your project to appropriate funding sources based on:
- Project scale and geographic focus
- Climate hazards addressed (heat, flood, slope stability)
- Political and implementation context
- Desired funding timeline and structure

**Output**: Ranked list of recommended funders with compatibility scores and a funding plan.

### 2. Site Explorer Module
Interactive geospatial analysis for site selection:
- Grid-based risk scoring for heat, flood, and landslide hazards
- OpenStreetMap asset discovery (parks, streets, buildings)
- Zone portfolio management for multi-site projects
- Risk visualization with color-coded overlays

**Output**: Selected intervention zones with risk profiles and asset inventories.

### 3. Impact Model Module
AI-powered narrative generation for funder-ready documentation:
- 5-step wizard: Setup → Generate → Curate → Lenses → Export
- Evidence-based narratives grounded in RAG knowledge base
- Multiple "lenses" for different stakeholder perspectives
- Quantified co-benefits and impact metrics

**Output**: Professional impact narratives with citations and evidence links.

### 4. Operations Module
Operational planning and maintenance scheduling:
- Operating model selection (in-house, contracted, hybrid)
- Service level definitions and task planning
- O&M cost estimation with funding mechanisms
- Capacity assessment and readiness checklists

**Output**: Operational plan with cost projections and risk mitigation.

### 5. Business Model Module
Financial structuring and revenue planning:
- Business archetype selection (public program, service contract, etc.)
- Payer-beneficiary mapping
- Revenue stack with confidence ratings
- Financing pathway selection (grants, loans, blended finance)

**Output**: Complete business model with financing strategy.

## AI-Powered Assistant

The platform includes a conversational AI agent that:
- Understands your current context (which module, which step)
- Proposes field updates that you approve or reject
- Searches a knowledge base of NBS research and evidence
- Maintains conversation history across sessions
- Streams responses in real-time

### Knowledge Base

The RAG (Retrieval-Augmented Generation) system includes:
- NBS intervention impact studies
- Latin American case studies
- Flood resilience, heat mitigation, and slope stabilization research
- Funder guidelines and technical standards

## Technology Stack

### Frontend
- **React 18+** with TypeScript
- **Vite** for fast development builds
- **Tailwind CSS** with shadcn/ui components
- **TanStack Query** for server state management
- **Wouter** for client-side routing
- **Leaflet** for interactive maps

### Backend
- **Express.js** with TypeScript
- **Drizzle ORM** with PostgreSQL
- **OpenAI GPT** for AI features
- **Server-Sent Events (SSE)** for streaming responses

### Authentication
- **OAuth 2.0 PKCE** with CityCatalyst
- Session-based authentication with secure token handling

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- CityCatalyst OAuth credentials (for production)

### Environment Variables

```bash
# CityCatalyst OAuth
CLIENT_ID=your_citycatalyst_client_id
CLIENT_SECRET=your_citycatalyst_client_secret
AUTH_BASE_URL=https://citycatalyst.openearth.dev

# Application
NODE_ENV=development
SESSION_SECRET=your-session-secret

# Database
DATABASE_URL=postgresql://...

# AI Integration (managed by Replit)
OPENAI_API_KEY=your_openai_api_key
```

### Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application runs on port 5000 with both frontend and backend served together.

### Sample Mode

The platform includes a **sample mode** with pre-configured data for Porto Alegre, Brazil. This allows exploration of all features without authentication or real project setup.

## Project Structure

```
├── client/
│   └── src/
│       ├── core/
│       │   ├── pages/           # Module pages (funder-selection, site-explorer, etc.)
│       │   ├── components/      # Shared components (ChatDrawer, navigation, etc.)
│       │   └── contexts/        # React contexts (ProjectContext, etc.)
│       ├── components/ui/       # shadcn/ui components
│       └── lib/                 # Utilities and helpers
├── server/
│   ├── routes.ts               # API endpoints
│   ├── services/               # Business logic (agentService, knowledgeService, etc.)
│   └── storage.ts              # Database abstraction layer
├── shared/
│   ├── schema.ts               # Database schema (Drizzle)
│   ├── block-schemas.ts        # Module data types and validation
│   └── document-knowledge-registry.ts  # Knowledge base configuration
└── db/
    └── migrations/             # Database migrations
```

## Data Architecture

### Module Blocks
Each module stores its state as a "block" in the database:
- `funder_selection` - Questionnaire answers and funding plan
- `site_explorer` - Selected zones and risk data
- `impact_model` - Generated narratives and evidence
- `operations` - Operational plans and costs
- `business_model` - Financial structure and revenue

### AI Patches
The AI agent proposes changes through a patch system:
1. Agent analyzes context and proposes a field update
2. User approves or rejects the patch
3. Approved patches are applied to the module block
4. UI updates in real-time

## API Endpoints

### Projects
- `GET /api/projects/:id` - Get project details
- `GET /api/projects/:id/blocks/:blockType` - Get module block
- `PUT /api/projects/:id/blocks/:blockType` - Update module block

### AI Agent
- `POST /api/projects/:id/agent/chat` - Send message to AI agent (SSE)
- `GET /api/projects/:id/agent/conversations` - List conversations
- `POST /api/projects/:id/apply` - Apply pending patches

### Knowledge Base
- `GET /api/knowledge/documents` - List knowledge documents
- `POST /api/knowledge/documents/ingest` - Add new document
- `GET /api/knowledge/stats` - Knowledge base statistics

## Contributing

### Adding New Modules
1. Define the block type in `shared/block-schemas.ts`
2. Add field validations to `FIELD_VALIDATIONS`
3. Create the page component in `client/src/core/pages/`
4. Register the module in the module registry
5. Add navigation persistence hooks

### Extending the Knowledge Base
Add documents to `INITIAL_KNOWLEDGE_DOCUMENTS` in `shared/document-knowledge-registry.ts` or use the API to ingest PDFs at runtime.

## External Integrations

- **CityCatalyst API** - Climate data, city boundaries, HIAP recommendations
- **OpenStreetMap Overpass API** - Asset discovery for site analysis
- **OpenAI API** - Conversational agent and narrative generation

## Documentation

- **[Setup Guide](./SETUP.md)** - Detailed installation instructions
- **[API Documentation](./API.md)** - Complete endpoint reference
- **[OAuth Integration Guide](./CityCatalyst-OAuth-Integration-Guide.md)** - Authentication setup

## License

This project is developed for climate action planning and urban sustainability initiatives.

---

**Built for cities working toward a sustainable future.**
