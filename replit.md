# Overview

This is the **NBS Project Builder** - a Nature Based Solutions planning tool that connects with CityCatalyst's climate data platform. The application helps cities explore climate action recommendations including mitigation and adaptation strategies.

**Purpose**: This application demonstrates climate action planning with a focus on nature-based solutions, leveraging CityCatalyst's HIAP (Health Impact Assessment Policy) data for evidence-based action recommendations.

**What it provides:**
- CityCatalyst OAuth 2.0 PKCE authentication flow
- Sample data mode for exploring without authentication
- Climate Actions display (Mitigation and Adaptation)
- Internationalization support (English and Portuguese)
- PostHog analytics integration

# Sample Data Mode

The application includes a **Sample Data Mode** that allows users to explore the platform without requiring CityCatalyst authentication.

## How Sample Data Mode Works:
1. On the login page, click "Use Sample Data" button
2. The app loads sample data for **Porto Alegre, Brazil**
3. Navigate through the app with simulated API responses
4. Sample data persists in localStorage as `nbs_sample_mode`
5. Logout clears the sample mode and returns to login

## Sample Data Configuration:
- **Sample City**: Porto Alegre, Brazil (LOCODE: BR POA)
- **Sample Inventories**: 2023, 2022
- **Sample Actions**: 6 climate actions (3 mitigation, 3 adaptation)
  - Urban Reforestation Program (Mitigation)
  - Green Building Standards (Mitigation)
  - Sustainable Urban Mobility (Mitigation)
  - Nature Based Solutions for Climate Resilience (Adaptation)
  - Heat Wave Early Warning System (Adaptation)
  - Coastal Flood Protection (Adaptation)
- **Initiated Projects**: Stored in localStorage as `nbs_sample_projects`

## Files Involved:
- `client/src/core/contexts/sample-data-context.tsx` - Sample data provider and data
- Components check `isSampleMode` to switch between real API and sample data

# Development Contract

## ⚠️ Required for ALL New Features
Every new feature must include:
1. **Internationalization**: Add keys to both `en.json` and `pt.json`, use `useTranslation()` hook
2. **Analytics**: Track with PostHog using "Feature — Action — Result" naming convention

📚 **Documentation**: [docs/i18n.md](./docs/i18n.md) | [docs/analytics.md](./docs/analytics.md)  
📋 **Full Guidelines**: [CONTRIBUTING.md](./CONTRIBUTING.md)

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React 18+ with TypeScript**: Modern component-based frontend using functional components and hooks
- **Vite Build System**: Fast development server and optimized production builds
- **Wouter Routing**: Lightweight client-side routing for single-page application navigation
- **Tailwind CSS + shadcn/ui**: Utility-first CSS framework with pre-built accessible components
- **React Query/TanStack Query**: Declarative data fetching, caching, and synchronization
- **Sample Data Context**: React context for managing sample data mode state

## Backend Architecture
- **Express.js with TypeScript**: RESTful API server with type safety
- **Session-based Authentication**: OAuth 2.0 PKCE flow with CityCatalyst integration
- **In-Memory Storage**: Development-ready storage layer with interface for database migration
- **Middleware Chain**: Request logging, error handling, and security headers

## Data Storage Design
- **PostgreSQL Schema**: Drizzle ORM with strongly-typed database operations
- **Entities**: Users, Cities, Sessions, and Projects with proper relationships
- **Storage Interface**: Abstract storage layer allowing seamless transition between in-memory and database implementations

## Authentication & Authorization
- **OAuth 2.0 PKCE Flow**: Secure authentication with CityCatalyst using Proof Key for Code Exchange
- **Sample Data Mode**: Alternative authentication bypass for exploration
- **Session Management**: Server-side session storage with secure token handling
- **Project-based Access Control**: User access to cities based on project membership

## API Design Patterns
- **RESTful Endpoints**: Standard HTTP methods for resource operations
- **Error Handling**: Centralized error middleware with proper status codes
- **Request Validation**: Type-safe request/response validation using Zod schemas
- **Rate Limiting**: Protection against abuse (configured for production deployment)

## Frontend State Management
- **React Query Cache**: Server state management with automatic background updates
- **Sample Data Context**: Context provider for sample mode state management
- **Local Component State**: UI state managed with React hooks
- **Form Handling**: React Hook Form with validation for user inputs
- **Toast Notifications**: User feedback for actions and errors

## Build & Development Setup
- **Hot Module Replacement**: Fast development iteration with Vite
- **TypeScript Compilation**: Compile-time type checking across frontend and backend
- **Path Aliases**: Clean import statements using configured path mapping
- **Environment Configuration**: Separate development and production configurations

# External Dependencies

## Authentication Service
- **CityCatalyst OAuth**: OAuth 2.0 provider for user authentication and project access
- **JWT Token Handling**: Access and refresh token management for API calls

## Database
- **PostgreSQL**: Production database with spatial extensions support
- **Neon Database**: Cloud PostgreSQL service (based on connection string pattern)

## Build & Deployment
- **Replit Platform**: Development and hosting environment with integrated tooling
- **Node.js Runtime**: Server execution environment with ES modules support

## UI Component Libraries
- **Radix UI**: Accessible, unstyled component primitives
- **Lucide Icons**: Modern icon library for UI elements

## Development Tools
- **Drizzle Kit**: Database migration and introspection tools
- **TypeScript**: Static type checking for both frontend and backend
- **ESBuild**: Fast JavaScript/TypeScript bundler for production builds

# API Documentation

## CityCatalyst API Integration
Comprehensive API documentation is maintained in the service files for easy developer reference:

### Core Service Documentation
- **Primary API Reference**: `server/services/cityService.ts` 
  - Complete endpoint documentation with usage examples
  - Request/response type definitions
  - Error handling patterns
  - Authentication requirements

### Available API Endpoints

**Health Impact Assessment & Policy (HIAP):**
- `getHIAPData(inventoryId, actionType, language)` - Get ranked climate action recommendations
  - Returns ranked lists of mitigation and adaptation actions
  - Includes co-benefits analysis, GHG reduction potential, and implementation guidance
  - Supports multiple languages (en, pt, es, de, fr)
  - Provides detailed action metadata: costs, timelines, KPIs, and dependencies

**City Information:**
- `getCityDetail(cityId)` - Get detailed city information using UUID
- `getCityBoundary(locode)` - Retrieve city boundary as GeoJSON

### Frontend Integration Patterns
- **React Query Hooks**: Located in `client/src/modules/city-information/hooks/`
- **Type Definitions**: Located in `client/src/modules/city-information/types/city-info.ts`
- **Service Functions**: Located in `client/src/modules/city-information/services/`
- **Sample Data Context**: Located in `client/src/core/contexts/sample-data-context.tsx`

### Development Guidelines
- All API functions include comprehensive JSDoc documentation
- TypeScript interfaces ensure type safety across frontend/backend
- Error handling follows consistent patterns with proper HTTP status codes
- Authentication is handled automatically via OAuth 2.0 PKCE flow
- Sample data mode bypasses API calls with local mock data

**💡 When in doubt**: Always refer to the official [CityCatalyst Documentation](https://citycatalyst.openearth.dev/docs/) for the latest API specifications, authentication requirements, and best practices.
