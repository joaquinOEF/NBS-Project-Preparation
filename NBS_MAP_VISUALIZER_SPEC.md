# NbS Map Visualizer — Standalone Build Specification

This document provides everything an agent needs to build a standalone geospatial map visualizer from scratch. It replicates the Site Explorer from the NbS Project Preparation platform as an independent application, using the same technology stack, component library, data sources, and visual design.

---

## 1. Project Overview

### What This App Does
A full-screen interactive map centered on **Porto Alegre, Brazil** that visualizes multi-layered geospatial evidence for Nature-Based Solutions (NbS) planning. Users can toggle evidence layers (risk grids, environmental data, raster tile overlays), inspect intervention zones, and browse NbS site recommendations.

### Key Capabilities
- Full-screen Leaflet map with dark basemap
- 3 groups of toggleable evidence layers: **Risk Analysis**, **Environment**, **OEF Geospatial Data**
- GeoJSON vector layers with dynamic color-coded styling
- Raster tile layers proxied from S3 (OEF pre-computed analytical data)
- Intervention zone selection with tooltip details
- Layer caching for instant toggle performance
- Responsive layout with bottom evidence drawer

---

## 2. Technology Stack

### Frontend
| Library | Version | Purpose |
|---------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.6.3 | Type safety |
| Vite | ^5.4.19 | Build tool / dev server |
| Wouter | ^3.3.5 | Client-side routing |
| Leaflet | ^1.9.4 | Map rendering |
| @types/leaflet | ^1.9.20 | Leaflet type definitions |
| @turf/turf | ^7.2.0 | Geospatial calculations (bbox, area, centroid) |
| @tanstack/react-query | ^5.60.5 | Server state / data fetching |
| Tailwind CSS | ^3.4.17 | Utility-first styling |
| tailwindcss-animate | ^1.0.7 | Animation utilities |
| @tailwindcss/typography | ^0.5.15 | Prose styling |
| class-variance-authority | ^0.7.1 | Component variant management |
| clsx | ^2.1.1 | Conditional class names |
| tailwind-merge | ^2.6.0 | Tailwind class deduplication |
| lucide-react | ^0.453.0 | Icon library |
| framer-motion | ^11.18.2 | Animations |
| react-hook-form | ^7.55.0 | Form state management |
| zod | ^3.25.76 | Schema validation |
| @hookform/resolvers | ^3.10.0 | Zod resolver for forms |

### Backend
| Library | Version | Purpose |
|---------|---------|---------|
| Express | ^4.21.2 | HTTP server |
| TypeScript | 5.6.3 | Type safety |
| tsx | ^4.19.1 | TypeScript execution |
| Drizzle ORM | ^0.39.1 | Database ORM (optional, for caching) |
| drizzle-zod | ^0.7.1 | Drizzle-to-Zod schema generation |
| osmtogeojson | ^3.0.0-beta.5 | Convert OSM XML to GeoJSON |
| geotiff | ^2.1.4-beta.1 | Parse GeoTIFF elevation tiles |

### shadcn/ui Components (Radix-based)
These are NOT npm packages — they are individual component files copied into the project. The build agent should initialize shadcn/ui and add these components:

**Required for the map visualizer:**
- `button`, `badge`, `card`, `tooltip`, `tabs`, `dialog`, `select`, `input`, `label`, `switch`, `accordion`, `scroll-area`, `separator`, `toast`, `toaster`, `skeleton`, `spinner`, `progress`

**Each component imports from these Radix primitives:**
- `@radix-ui/react-tooltip`, `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-accordion`, `@radix-ui/react-tabs`, `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-switch`, `@radix-ui/react-label`, `@radix-ui/react-slot`, `@radix-ui/react-toast`, `@radix-ui/react-popover`, `@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`

---

## 3. Project Structure

```
nbs-map-visualizer/
├── client/
│   ├── index.html
│   ├── public/
│   │   └── sample-data/              # Pre-computed GeoJSON data files
│   │       ├── porto-alegre-boundary.json
│   │       ├── porto-alegre-grid.json
│   │       ├── porto-alegre-zones.json
│   │       ├── porto-alegre-elevation.json
│   │       ├── porto-alegre-landcover.json
│   │       ├── porto-alegre-rivers.json
│   │       ├── porto-alegre-surface-water.json
│   │       ├── porto-alegre-forest.json
│   │       ├── porto-alegre-population.json
│   │       └── interventions.json
│   └── src/
│       ├── index.css                  # Tailwind + CSS variables
│       ├── main.tsx                   # React entry point
│       ├── App.tsx                    # Router
│       ├── lib/
│       │   ├── utils.ts              # cn() helper
│       │   └── queryClient.ts        # TanStack Query setup
│       ├── hooks/
│       │   └── use-toast.ts          # Toast notification hook
│       ├── components/
│       │   ├── ui/                   # shadcn/ui components
│       │   ├── map/
│       │   │   ├── MapViewer.tsx      # Main full-screen map page
│       │   │   ├── EvidenceDrawer.tsx # Bottom layer toggle panel
│       │   │   ├── ZonePriorityPanel.tsx # Right side zone list
│       │   │   └── ZoneDetailPanel.tsx   # Left floating zone detail
│       │   └── layout/
│       │       └── Header.tsx         # Top navigation bar
│       └── data/
│           ├── layer-configs.ts       # Layer definitions & groups
│           ├── sample-data-loaders.ts # Functions to load sample JSONs
│           └── colors.ts             # Color scale functions
├── server/
│   ├── index.ts                       # Express entry point
│   ├── routes.ts                      # API route registration
│   └── services/
│       ├── osmService.ts              # City boundary via Nominatim
│       ├── osmAssetService.ts         # OSM Overpass asset discovery
│       ├── copernicusService.ts       # DEM elevation data
│       ├── worldcoverService.ts       # Land cover classification
│       ├── surfaceWaterService.ts     # Water bodies
│       ├── riversService.ts           # Waterways
│       ├── forestService.ts           # Forest canopy
│       ├── populationService.ts       # Population density proxy
│       └── gridService.ts            # Grid generation + composite scoring
├── shared/
│   └── geospatial-schema.ts           # Shared types and schemas
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── drizzle.config.ts                  # Optional, for DB caching
```

---

## 4. Vite Configuration

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client', 'src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  root: path.resolve(import.meta.dirname, 'client'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
});
```

---

## 5. Tailwind Configuration

```typescript
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./client/index.html', './client/src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        success: { DEFAULT: 'var(--success)', foreground: 'var(--success-foreground)' },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        chart: { '1': 'var(--chart-1)', '2': 'var(--chart-2)', '3': 'var(--chart-3)', '4': 'var(--chart-4)', '5': 'var(--chart-5)' },
        sidebar: {
          DEFAULT: 'var(--sidebar-background)',
          foreground: 'var(--sidebar-foreground)',
          primary: 'var(--sidebar-primary)',
          'primary-foreground': 'var(--sidebar-primary-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config;
```

---

## 6. CSS Theme Variables

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: hsl(210 40% 96%);
  --foreground: hsl(222.2 84% 4.9%);
  --card: hsl(0 0% 100%);
  --card-foreground: hsl(222.2 84% 4.9%);
  --popover: hsl(0 0% 100%);
  --popover-foreground: hsl(222.2 84% 4.9%);
  --primary: hsl(224, 100%, 33%);
  --primary-foreground: hsl(210 40% 98%);
  --secondary: hsl(215 28% 17%);
  --secondary-foreground: hsl(210 40% 98%);
  --muted: hsl(210 40% 96%);
  --muted-foreground: hsl(215.4 16.3% 46.9%);
  --accent: hsl(210 40% 96%);
  --accent-foreground: hsl(222.2 47.4% 11.2%);
  --destructive: hsl(0, 84%, 60%);
  --destructive-foreground: hsl(210 40% 98%);
  --success: hsl(132, 76%, 36%);
  --success-foreground: hsl(0 0% 100%);
  --border: hsl(214.3 31.8% 91.4%);
  --input: hsl(214.3 31.8% 91.4%);
  --ring: hsl(224, 100%, 33%);
  --chart-1: hsl(224, 100%, 33%);
  --chart-2: hsl(159.7826 100% 36.0784%);
  --chart-3: hsl(42.029 92.8251% 56.2745%);
  --chart-4: hsl(147.1429 78.5047% 41.9608%);
  --chart-5: hsl(341.4894 75.2% 50.9804%);
  --font-sans: Poppins, system-ui, sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: Menlo, monospace;
  --radius: 0.5rem;
}

.dark {
  --background: hsl(0 0% 0%);
  --foreground: hsl(200 6.6667% 91.1765%);
  --card: hsl(228 9.8039% 10%);
  --card-foreground: hsl(0 0% 85.098%);
  --popover: hsl(0 0% 0%);
  --popover-foreground: hsl(200 6.6667% 91.1765%);
  --primary: hsl(224, 100%, 33%);
  --primary-foreground: hsl(0 0% 100%);
  --secondary: hsl(195 15.3846% 94.902%);
  --secondary-foreground: hsl(210 25% 7.8431%);
  --muted: hsl(0 0% 9.4118%);
  --muted-foreground: hsl(210 3.3898% 46.2745%);
  --accent: hsl(228 9.8039% 10%);
  --accent-foreground: hsl(200 6.6667% 91.1765%);
  --destructive: hsl(0, 84%, 60%);
  --destructive-foreground: hsl(0 0% 100%);
  --success: hsl(132, 76%, 36%);
  --success-foreground: hsl(0 0% 100%);
  --border: hsl(210 5.2632% 14.902%);
  --input: hsl(207.6923 27.6596% 18.4314%);
  --ring: hsl(224, 100%, 33%);
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground font-sans; }
}
```

---

## 7. Shared Geospatial Types

```typescript
// shared/geospatial-schema.ts

export type LayerType =
  | 'elevation'
  | 'landcover'
  | 'surface_water'
  | 'rivers'
  | 'forest_canopy'
  | 'population'
  | 'built_density';

export interface GeoBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface LayerMetadata {
  source: string;
  resolution: number;
  fetchedAt: string;
  processingTime?: number;
}

export interface LandcoverData {
  cityLocode: string;
  bounds: GeoBounds;
  classes: {
    builtUp: number;
    trees: number;
    shrubland: number;
    grassland: number;
    cropland: number;
    bareVegetation: number;
    water: number;
    wetland: number;
    mangroves: number;
    moss: number;
    snowIce: number;
  };
  geoJson?: any;
}
```

---

## 8. Sample Data Files

These files must be placed in `client/public/sample-data/`. They are pre-computed JSON files containing GeoJSON data for Porto Alegre.

**CRITICAL**: Copy these files verbatim from the source project at `client/public/sample-data/`. They contain real geospatial data for Porto Alegre that cannot be generated from scratch.

### File Inventory

| File | Content | Key Structure |
|------|---------|---------------|
| `porto-alegre-boundary.json` | City administrative boundary | `{ cityLocode, cityName, centroid: [lng,lat], bbox: [s,w,n,e], boundaryGeoJson }` |
| `porto-alegre-grid.json` | 1km analysis grid (~1200 cells) | `{ totalCells, cellSizeMeters, geoJson: FeatureCollection }`. Each cell has `metrics`: `elevation_mean`, `slope_mean`, `flow_accumulation`, `canopy_pct`, `impervious_pct`, `pop_density`, `building_density`, `river_proximity`, `water_proximity`, `flood_score`, `heat_score`, `landslide_score`, `composite_risk` |
| `porto-alegre-zones.json` | Clustered intervention zones | `{ totalZones, geoJson: FeatureCollection }`. Each zone: `zoneId`, `typologyLabel` (FLOOD/HEAT/LANDSLIDE/FLOOD_HEAT/etc), `primaryHazard`, `interventionType`, `meanFlood`, `meanHeat`, `meanLandslide`, `areaKm2`, `cellCount` |
| `porto-alegre-elevation.json` | Copernicus DEM terrain data | `{ elevationData: { width, height, cellSize, minElevation, maxElevation }, contours: GeoJSON }` |
| `porto-alegre-landcover.json` | OSM-derived land classification | `{ classes: {...counts}, geoJson: FeatureCollection }`. Features tagged with `landcover_class` |
| `porto-alegre-rivers.json` | Waterways | `{ majorRivers: string[], totalLengthKm, geoJson: FeatureCollection(LineString) }` |
| `porto-alegre-surface-water.json` | Lakes and water bodies | `{ occurrence: { permanent, seasonal }, geoJson: FeatureCollection(Polygon) }` |
| `porto-alegre-forest.json` | Forest canopy areas | `{ canopyCover: { mean, min, max }, geoJson: FeatureCollection(Polygon) }` |
| `porto-alegre-population.json` | Residential land use proxy | `{ geoJson: FeatureCollection(Polygon) }` |
| `interventions.json` | NbS intervention catalog | `{ version, categories: Record<id, Category>, interventions: Intervention[] }` |

### Interventions Data Structure

```typescript
interface InterventionCategory {
  id: string;             // e.g. "sponge_network", "cooling_network", "slope_stabilization", "multi_benefit"
  name: string;
  description: string;
  icon: string;           // lucide icon name
  color: string;
  applicableTypologies: string[];  // e.g. ["FLOOD", "FLOOD_HEAT"]
}

interface InterventionType {
  id: string;
  category: string;
  name: string;
  description: string;
  osmAssetTypes: string[];
  typicalScale: { min: number; max: number; unit: string };
  costRange: { min: number; max: number; unit: string };
  impacts: { flood: string; heat: string; landslide: string };
  implementationNotes: string;
  maintenanceRequirements: string;
  timeToImplement: { min: number; max: number; unit: string };
  cobenefits: string[];
}
```

---

## 9. Layer System Architecture

### Layer Type Definitions

```typescript
type LayerSource = 'geojson' | 'tiles';

interface LayerState {
  id: string;
  name: string;
  icon: any;              // Lucide icon component
  color: string;          // Hex color for UI and map styling
  enabled: boolean;
  loaded: boolean;
  data: any;
  leafletLayer: L.Layer | null;
  source: LayerSource;
  group: 'analysis' | 'environment' | 'oef';
  available: boolean;     // false = "Coming Soon"
  tileLayerId?: string;   // Maps to backend tile proxy layerId
}
```

### Layer Configuration

```typescript
const LAYER_CONFIGS: LayerConfig[] = [
  // Risk Analysis group
  { id: 'intervention_zones', name: 'Intervention Zones', icon: MapPinned, color: '#10b981', source: 'geojson', group: 'analysis', available: true },
  { id: 'grid_flood', name: 'Flood Risk', icon: CloudRain, color: '#3b82f6', source: 'geojson', group: 'analysis', available: true },
  { id: 'grid_heat', name: 'Heat Risk', icon: Flame, color: '#ef4444', source: 'geojson', group: 'analysis', available: true },
  { id: 'grid_landslide', name: 'Landslide Risk', icon: Mountain, color: '#a16207', source: 'geojson', group: 'analysis', available: true },
  { id: 'grid_population', name: 'Population Density', icon: Users, color: '#8b5cf6', source: 'geojson', group: 'analysis', available: true },
  { id: 'grid_buildings', name: 'Building Density', icon: Building2, color: '#f97316', source: 'geojson', group: 'analysis', available: true },

  // Environment group
  { id: 'elevation', name: 'Elevation', icon: Mountain, color: '#c9a87c', source: 'geojson', group: 'environment', available: true },
  { id: 'landcover', name: 'Land Cover', icon: MapIcon, color: '#4ade80', source: 'geojson', group: 'environment', available: true },
  { id: 'surface_water', name: 'Water Bodies', icon: Droplets, color: '#3b82f6', source: 'geojson', group: 'environment', available: true },
  { id: 'rivers', name: 'Rivers', icon: Droplets, color: '#06b6d4', source: 'geojson', group: 'environment', available: true },
  { id: 'forest', name: 'Forest', icon: Trees, color: '#22c55e', source: 'geojson', group: 'environment', available: true },

  // OEF Geospatial Data group
  { id: 'oef_dynamic_world', name: 'Land Use (Dynamic World)', icon: Grid3X3, color: '#06d6a0', source: 'tiles', group: 'oef', available: true, tileLayerId: 'dynamic_world' },
  { id: 'oef_slope', name: 'Slope', icon: Mountain, color: '#bc6c25', source: 'tiles', group: 'oef', available: false },
  { id: 'oef_flow_accumulation', name: 'Flow Accumulation', icon: Droplets, color: '#0077b6', source: 'tiles', group: 'oef', available: false },
  { id: 'oef_canopy_cover', name: 'Canopy Cover', icon: Trees, color: '#588157', source: 'tiles', group: 'oef', available: false },
  { id: 'oef_flood_hazard', name: 'Flood Hazard', icon: CloudRain, color: '#023e8a', source: 'tiles', group: 'oef', available: false },
  { id: 'oef_heat_hazard', name: 'Heat Hazard', icon: Flame, color: '#d00000', source: 'tiles', group: 'oef', available: false },
  { id: 'oef_exposure', name: 'Exposure Score', icon: Users, color: '#7b2cbf', source: 'tiles', group: 'oef', available: false },
  { id: 'oef_cooling', name: 'Cooling Capacity', icon: Leaf, color: '#2d6a4f', source: 'tiles', group: 'oef', available: false },
  { id: 'oef_composite_risk', name: 'Composite Risk', icon: AlertTriangle, color: '#e63946', source: 'tiles', group: 'oef', available: false },
  { id: 'oef_opportunity_zones', name: 'NbS Opportunity Zones', icon: MapPinned, color: '#06d6a0', source: 'tiles', group: 'oef', available: false },
];

const LAYER_GROUPS = [
  { id: 'analysis', label: 'Risk Analysis' },
  { id: 'environment', label: 'Environment' },
  { id: 'oef', label: 'OEF Geospatial Data' },
] as const;
```

---

## 10. Map Initialization

### Leaflet Setup

```typescript
// Basemap: CartoDB Dark Matter
const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const tileOptions = {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
};

// Map options
const mapOptions = {
  center: boundaryData.centroid as [number, number],  // Porto Alegre: [-30.0346, -51.2177]
  zoom: 11,
  zoomControl: true,
  attributionControl: true,
};
```

### Map Initialization Flow
1. Load `porto-alegre-boundary.json` to get `centroid` and `bbox`
2. Create `L.map` with center at centroid, zoom 11
3. Add CartoDB Dark Matter tile layer
4. Add boundary GeoJSON as a dashed outline (`dashArray: '8, 4'`, white color, no fill)
5. Fit bounds to boundary bbox
6. Auto-load and enable the `intervention_zones` layer
7. Attach `ResizeObserver` to call `map.invalidateSize()` on container resize

### Boundary Styling
```typescript
L.geoJSON(boundaryData.boundaryGeoJson, {
  style: {
    color: '#ffffff',
    weight: 2,
    fillOpacity: 0,
    dashArray: '8, 4',
    opacity: 0.6,
  },
}).addTo(map);
```

---

## 11. Layer Rendering — Color Functions

### Risk Score Color Scales

```typescript
function getFloodColor(score: number): string {
  if (score >= 0.7) return '#1e40af';
  if (score >= 0.5) return '#3b82f6';
  if (score >= 0.3) return '#60a5fa';
  if (score >= 0.1) return '#93c5fd';
  return '#dbeafe';
}

function getHeatColor(score: number): string {
  if (score >= 0.7) return '#991b1b';
  if (score >= 0.5) return '#dc2626';
  if (score >= 0.3) return '#f87171';
  if (score >= 0.1) return '#fca5a5';
  return '#fee2e2';
}

function getLandslideColor(score: number): string {
  if (score >= 0.7) return '#78350f';
  if (score >= 0.5) return '#a16207';
  if (score >= 0.3) return '#ca8a04';
  if (score >= 0.1) return '#eab308';
  return '#fef3c7';
}

function getPopulationColor(density: number): string {
  if (density >= 0.5) return '#5b21b6';
  if (density >= 0.3) return '#7c3aed';
  if (density >= 0.15) return '#8b5cf6';
  if (density >= 0.05) return '#a78bfa';
  if (density > 0) return '#c4b5fd';
  return '#ede9fe';
}

function getBuildingColor(density: number): string {
  if (density >= 0.5) return '#9a3412';
  if (density >= 0.3) return '#c2410c';
  if (density >= 0.15) return '#ea580c';
  if (density >= 0.05) return '#f97316';
  if (density > 0) return '#fb923c';
  return '#ffedd5';
}
```

### Intervention Zone Colors
```typescript
const TYPOLOGY_COLORS: Record<string, string> = {
  FLOOD: '#3b82f6',
  HEAT: '#ef4444',
  LANDSLIDE: '#a16207',
  FLOOD_HEAT: '#8b5cf6',
  FLOOD_LANDSLIDE: '#0891b2',
  HEAT_LANDSLIDE: '#db2777',
  LOW: '#10b981',
};
```

### Intervention Category Colors
```typescript
const INTERVENTION_COLORS: Record<string, string> = {
  sponge_network: '#3b82f6',
  cooling_network: '#ef4444',
  slope_stabilization: '#a16207',
  multi_benefit: '#10b981',
};
```

---

## 12. Layer Rendering — createLayerFromData

This is the core rendering function. It takes a `layerId` and loaded data, and returns a Leaflet layer.

### Intervention Zones
- Source: `porto-alegre-zones.json`
- Render as: `L.geoJSON` with MultiPolygon
- Styling: Color from `TYPOLOGY_COLORS[typologyLabel]`. Fill opacity normalized across all zones based on risk scores (0.08 lowest to 0.65 highest). Border weight 1-3px scaled by risk.
- Tooltips: Zone name, typology, intervention type, mean flood/heat/landslide %, area
- Click handler: Opens zone detail panel

### Risk Grids (grid_flood, grid_heat, grid_landslide)
- Source: `porto-alegre-grid.json` (shared file, different metric fields)
- Render as: `L.geoJSON` with square Polygon cells
- Styling: Color from respective `get[Risk]Color(score)` function. `fillOpacity` = score > 0 ? 0.6 : 0.1
- Metric fields: `feature.properties.metrics.flood_score`, `.heat_score`, `.landslide_score`
- Tooltips: Show the score value and contributing factors

### Population/Building Density Grids
- Source: Same `porto-alegre-grid.json`
- Metric fields: `.pop_density`, `.building_density`
- Color from `getPopulationColor()` / `getBuildingColor()`

### Elevation (Contours)
- Source: `porto-alegre-elevation.json`
- Render as: `L.geoJSON` with LineString contours
- Styling: `color: '#c9a87c'`, `weight: 1`, `opacity: 0.6`
- Tooltips: Elevation value in meters

### Land Cover
- Source: `porto-alegre-landcover.json`
- Render as: `L.geoJSON` with Polygon features
- Styling: Color mapped from `landcover_class`:
  - Tree cover: `#228B22`, Built-up: `#DC143C`, Grassland: `#98FB98`, Cropland: `#FFD700`, Water: `#1E90FF`, Bare: `#DEB887`, Shrubland: `#8B4513`
- `fillOpacity: 0.5`, `weight: 0.5`

### Water Bodies
- Source: `porto-alegre-surface-water.json`
- Styling: `color: '#3b82f6'`, `fillColor: '#1e40af'`, `fillOpacity: 0.4`, `weight: 1`

### Rivers
- Source: `porto-alegre-rivers.json`
- Styling: `color: '#06b6d4'`, `weight: 2`, `opacity: 0.8`

### Forest
- Source: `porto-alegre-forest.json`
- Styling: `color: '#22c55e'`, `fillColor: '#166534'`, `fillOpacity: 0.4`, `weight: 1`

### Population (Residential)
- Source: `porto-alegre-population.json`
- Styling: `color: '#f97316'`, `weight: 1`, `fillOpacity: 0.3`

---

## 13. Tile Layer Rendering (OEF Geospatial Data)

For layers with `source: 'tiles'`:

```typescript
function createTileLayer(layerConfig: LayerState): L.TileLayer | null {
  if (!layerConfig.tileLayerId) return null;
  const tileUrl = `/api/geospatial/tiles/${layerConfig.tileLayerId}/{z}/{x}/{y}.png`;
  return L.tileLayer(tileUrl, {
    opacity: 0.7,
    maxZoom: 18,
    minZoom: 10,
    errorTileUrl: '',
    className: 'oef-tile-layer',
  });
}
```

Tile layers are toggled differently from GeoJSON layers — no data loading needed, just create and add/remove the `L.tileLayer` instance.

---

## 14. Toggle Layer Logic

```
toggleLayer(layerId):
  1. Find layer in state
  2. If not available, return early (Coming Soon layers)
  3. If currently enabled → remove from map, update state to disabled
  4. If currently disabled:
     a. If source === 'tiles' → create L.tileLayer, add to map, mark enabled
     b. If cached data exists → create GeoJSON layer from cache, add to map
     c. If not loaded → async fetch from sample data, cache, create layer, add to map
  5. Store Leaflet layer ref in layerRefs Map for future removal
```

---

## 15. Backend API Endpoints

### Tile Proxy (Required)

```
GET /api/geospatial/tiles/:layerId/:z/:x/:y.png
```

Proxies pre-computed raster tiles from the OEF S3 bucket.

```typescript
const OEF_TILE_LAYERS: Record<string, string> = {
  dynamic_world: 'https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/land_use/dynamic_world/V1/2023/tiles_visual/{z}/{x}/{y}.png',
};

app.get('/api/geospatial/tiles/:layerId/:z/:x/:y.png', async (req, res) => {
  const { layerId, z, x, y } = req.params;

  // Validate numeric params
  if (!/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+$/.test(y)) {
    return res.status(400).json({ message: 'Invalid tile coordinates' });
  }

  const template = OEF_TILE_LAYERS[layerId];
  if (!template) {
    return res.status(404).json({ message: `Layer "${layerId}" not available` });
  }

  const tileUrl = template.replace('{z}', z).replace('{x}', x).replace('{y}', y);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const tileResponse = await fetch(tileUrl, { signal: controller.signal });
  clearTimeout(timeout);

  if (!tileResponse.ok) {
    if (tileResponse.status === 404 || tileResponse.status === 403) {
      res.set('Cache-Control', 'public, max-age=3600');
      return res.status(204).end();
    }
    return res.status(502).json({ message: `Upstream error: ${tileResponse.status}` });
  }

  const buffer = Buffer.from(await tileResponse.arrayBuffer());
  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
  });
  res.send(buffer);
});
```

### OSM Boundary (Optional — for live city loading)

```
POST /api/geospatial/boundary
Body: { cityName: string, cityLocode: string }
```

Calls Nominatim API to resolve city boundary. The sample data files provide this pre-computed, so this endpoint is only needed for loading cities other than Porto Alegre.

### OSM Asset Discovery (Optional — for site selection)

```
POST /api/geospatial/osm-assets
Body: { zoneId, bbox, osmTypes[], category, zoneGeometry }
```

Calls Overpass API to find physical assets (parks, buildings, rivers) matching specified OSM types within a bounding box.

### OSM Name Search (Optional)

```
POST /api/geospatial/osm-search
Body: { query, bbox?, category?, osmTypes? }
```

Calls Nominatim API for name-based location search.

---

## 16. Backend Services Reference

These services are used for LIVE data fetching when not using sample data. For the standalone map visualizer using sample data, these are optional but documented for completeness.

### osmService.ts
- **API**: OpenStreetMap Nominatim (`nominatim.openstreetmap.org/search`)
- **Function**: `getCityBoundary(cityName, cityLocode)` → `{ centroid, bbox, boundaryGeoJson }`
- **Headers**: Must include `User-Agent` with app name/URL

### osmAssetService.ts
- **API**: Overpass API (`overpass-api.de/api/interpreter`)
- **Function**: `fetchOsmAssets({ zoneId, bbox, osmTypes, category, zoneGeometry })` → `OsmAsset[]`
- **Returns**: Array of `{ osmId, tags, geometry, centroid, area, length }`
- **Uses**: `osmtogeojson` package to convert Overpass XML to GeoJSON

### copernicusService.ts
- **API**: Copernicus DEM S3 (`copernicus-dem-30m.s3.eu-central-1.amazonaws.com`)
- **Function**: `getElevationData(cityLocode, bounds, resolution)` → `{ elevationData, contours }`
- **Uses**: `geotiff` package to parse GeoTIFF tiles, generates contour lines

### worldcoverService.ts
- **API**: Overpass API (queries OSM `landuse` and `natural` tags)
- **Function**: `getLandcoverData(cityLocode, bounds)` → `LandcoverData`
- **Returns**: Classification counts + GeoJSON of landuse polygons

### surfaceWaterService.ts
- **API**: Overpass API (queries `natural=water`)
- **Function**: `getSurfaceWaterData(cityLocode, bounds)` → `{ occurrence, geoJson }`

### riversService.ts
- **API**: Overpass API (queries `waterway=river/stream/canal`)
- **Function**: `getRiversData(cityLocode, bounds)` → `{ majorRivers, totalLengthKm, geoJson }`

### forestService.ts
- **API**: Overpass API (queries `natural=wood`, `landuse=forest`)
- **Function**: `getForestCanopyData(cityLocode, bounds)` → `{ canopyCover, geoJson }`

### populationService.ts
- **API**: Overpass API (queries `landuse=residential` + building footprints)
- **Function**: `getPopulationData(cityLocode, bounds)` → `{ totalPopulation, densityPerSqKm, geoJson }`

### gridService.ts (The Analysis Engine)
- **Purpose**: Generates a square grid over the city and computes multi-factor risk scores per cell
- **Key Functions**:
  - `generateGrid(bounds, cellSize)` → Creates grid cells as GeoJSON squares
  - `computeElevationMetrics(grid, elevationData)` → Adds `elevation_mean`, `slope_mean`
  - `computeLandcoverMetrics(grid, landcoverData)` → Adds `canopy_pct`, `impervious_pct`
  - `computeRiverMetrics(grid, riversData)` → Adds `river_proximity`
  - `computeWaterMetrics(grid, waterData)` → Adds `water_proximity`
  - `computeForestMetrics(grid, forestData)` → Adds `forest_pct`
  - `computePopulationMetrics(grid, popData)` → Adds `pop_density`
  - `computeCompositeScores(grid)` → Computes `flood_score`, `heat_score`, `landslide_score`, `composite_risk`
- **Composite Score Formula**:
  - `flood_score = f(flow_accumulation, river_proximity, impervious_pct, slope_inverse)`
  - `heat_score = f(impervious_pct, canopy_inverse, building_density, pop_density)`
  - `landslide_score = f(slope, flow_accumulation, canopy_inverse, soil_saturation_proxy)`

---

## 17. Evidence Drawer UI

The evidence layers are shown in a bottom drawer that expands from 48px (collapsed) to ~320px (expanded). It takes 75% of the viewport width, anchored to the bottom-left.

### Layout Structure
```
┌──────────────────────────────────────────────┐
│ [Layers icon] Evidence Layers    3 active  ▲ │  ← 48px header, click to expand
├──────────────────────────────────────────────┤
│ RISK ANALYSIS ─────────────────────────────  │  ← Group label with divider
│ [Zones] [Flood] [Heat] [Landslide] [Pop] [B]│  ← 6-column grid of toggle buttons
│                                              │
│ ENVIRONMENT ───────────────────────────────  │
│ [Elev] [Land] [Water] [Rivers] [Forest]      │
│                                              │
│ OEF GEOSPATIAL DATA ──────────────────────  │
│ [LandUse●] [Slope] [Flow] [Canopy] [Flood]  │  ← ● = green dot for available tiles
│ [Heat] [Exposure] [Cooling] [Risk] [NbSOpp]  │  ← Grayed out = Coming Soon
└──────────────────────────────────────────────┘
```

### Button States
- **Enabled**: Blue border, colored background tint, white text, colored icon
- **Disabled (not toggled)**: Dark border, transparent background, gray text/icon
- **Unavailable (Coming Soon)**: 40% opacity, cursor-not-allowed, tooltip "Coming soon"
- **Loading**: Spinner icon replacing the layer icon, reduced opacity
- **Available tile layer indicator**: Small green dot badge (2px) on top-right of icon

### Styling
- Container: `bg-zinc-900/95 backdrop-blur-sm border-t border-r border-zinc-700 rounded-tr-xl`
- Group label: `text-[10px] font-semibold uppercase tracking-wider text-zinc-500`
- Buttons: `p-1.5 rounded-lg border` with conditional classes
- Grid: `grid grid-cols-6 gap-1.5`

---

## 18. Zone Priority Panel (Right Side)

A 320px-wide panel on the right side of the map listing all intervention zones sorted by risk level.

- Shows zone name, typology badge, primary hazard, risk score
- "Eye" toggle icon to show/hide the intervention zones layer
- Click on a zone to select it and open the detail panel
- Badge showing count of interventions assigned per zone

---

## 19. Zone Detail Panel (Left Floating)

A 420px-wide floating panel on the top-left when a zone is selected.

- Zone name, typology, risk scores (flood/heat/landslide as progress bars)
- Intervention categories applicable to the zone's typology
- Asset browser: Lists OSM assets found in the zone
- Intervention assignment: Select intervention type for each asset
- Close button to deselect zone

---

## 20. Data Loading Pattern

```typescript
// Sample data loader (for standalone use)
const sampleDataCache = new Map<string, any>();

async function loadSampleData(path: string): Promise<any> {
  if (sampleDataCache.has(path)) return sampleDataCache.get(path);
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  const data = await response.json();
  sampleDataCache.set(path, data);
  return data;
}

// Layer data routing
function loadLayerData(layerId: string): Promise<any> {
  switch (layerId) {
    case 'elevation': return loadSampleData('/sample-data/porto-alegre-elevation.json');
    case 'landcover': return loadSampleData('/sample-data/porto-alegre-landcover.json');
    case 'surface_water': return loadSampleData('/sample-data/porto-alegre-surface-water.json');
    case 'rivers': return loadSampleData('/sample-data/porto-alegre-rivers.json');
    case 'forest': return loadSampleData('/sample-data/porto-alegre-forest.json');
    case 'population': return loadSampleData('/sample-data/porto-alegre-population.json');
    case 'intervention_zones': return loadSampleData('/sample-data/porto-alegre-zones.json');
    case 'grid_flood':
    case 'grid_heat':
    case 'grid_landslide':
    case 'grid_population':
    case 'grid_buildings':
      return loadSampleData('/sample-data/porto-alegre-grid.json');
    default: return Promise.resolve(null);
  }
}
```

---

## 21. OEF Geospatial Data Source Reference

From https://github.com/Open-Earth-Foundation/geospatial-data:

### Analytical Pipeline Levels
- **Level 0 — Raw Source Data**: DEM, rainfall, population, land cover, etc.
- **Level 1 — Derived Indicators**: Slope, flow accumulation, canopy cover, impervious proxy
- **Level 2 — Composite Analytical Layers**: Hazards, exposure, ecosystem functions
- **Level 3 — Decision Outputs**: Risk indices, priority zones, opportunity zones

### Currently Available Tile Data
| Layer | S3 URL Template | Status |
|-------|----------------|--------|
| Dynamic World Land Use | `geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/land_use/dynamic_world/V1/2023/tiles_visual/{z}/{x}/{y}.png` | Available (via proxy) |
| Slope | TBD | Coming Soon |
| Flow Accumulation | TBD | Coming Soon |
| Canopy Cover % | TBD | Coming Soon |
| Flood Hazard | TBD | Coming Soon |
| Heat Hazard | TBD | Coming Soon |
| Exposure Score | TBD | Coming Soon |
| Cooling Capacity | TBD | Coming Soon |
| Composite Risk | TBD | Coming Soon |
| NbS Opportunity Zones | TBD | Coming Soon |

### Adding New Tile Layers
When OEF publishes new layers, add them to the backend allowlist:
```typescript
const OEF_TILE_LAYERS: Record<string, string> = {
  dynamic_world: '...existing...',
  slope: 'https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/terrain/slope/tiles_visual/{z}/{x}/{y}.png',
  // etc.
};
```
Then set `available: true` on the corresponding frontend layer config.

---

## 22. Key Lucide Icons Used

```typescript
import {
  MapPinned,    // Intervention zones, opportunity zones
  CloudRain,    // Flood risk, flood hazard
  Flame,        // Heat risk, heat hazard
  Mountain,     // Landslide, elevation, slope
  Users,        // Population, exposure
  Building2,    // Building density
  Droplets,     // Water bodies, rivers, flow accumulation
  Trees,        // Forest, canopy cover
  MapIcon,      // Land cover (Map as MapIcon)
  Grid3X3,      // Dynamic World land use grid
  Leaf,         // Cooling capacity
  AlertTriangle,// Composite risk
  Layers,       // Evidence drawer toggle
  Loader2,      // Loading spinner
  ChevronDown,  // Drawer collapse
  ChevronUp,    // Drawer expand
  Eye, EyeOff,  // Zone visibility toggle
  X,            // Close panels
  Plus,         // Add interventions
  Search,       // Asset search
  Info,         // Information tooltips
} from 'lucide-react';
```

---

## 23. Utility Function — cn()

```typescript
// lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 24. TanStack Query Setup

```typescript
// lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res;
}

export async function apiRequest(method: string, url: string, data?: unknown) {
  const res = await fetch(url, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });
  await throwIfResNotOk(res);
  return res;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const res = await fetch(queryKey[0] as string, { credentials: 'include' });
        await throwIfResNotOk(res);
        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
  },
});
```

---

## 25. Build & Run Instructions

```bash
# Install dependencies
npm install

# Development (starts both Express backend + Vite frontend)
npm run dev

# Build for production
npm run build

# Start production
npm start
```

### package.json scripts
```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --bundle --platform=node --outdir=dist --format=esm",
    "start": "NODE_ENV=production node dist/index.js"
  }
}
```

The Express server serves both the API and the Vite-built frontend from the same port. In development, Vite's dev server is used as middleware. In production, Express serves the static build from `dist/public/`.

---

## 26. Important Implementation Notes

1. **No authentication required** — This standalone app has no OAuth/session management. All endpoints are open.

2. **Sample data is the default mode** — The app should load and render all layers from the pre-computed sample JSON files. The backend services for live data fetching are optional extensions.

3. **Dark mode by default** — The map uses a dark basemap and the UI should use the `.dark` CSS class on the document root.

4. **Layer toggle performance** — Use a `Map<string, L.Layer>` ref to track active Leaflet layers, and a `Map<string, any>` ref to cache loaded data. This allows instant toggle without re-fetching.

5. **Tile layers vs GeoJSON layers** — Tile layers (`source: 'tiles'`) don't need data loading. They create an `L.tileLayer` directly. GeoJSON layers (`source: 'geojson'`) fetch JSON files and create `L.geoJSON` instances.

6. **ResizeObserver** — The map container needs a `ResizeObserver` to call `map.invalidateSize()` when the container resizes (e.g., when panels open/close).

7. **z-index management** — Use `z-[1001]` for UI panels (zone detail, evidence drawer) to sit above the map. Leaflet defaults to `z-index: 400` for tile layers.

8. **Scroll prevention** — Panels overlaying the map must call `e.stopPropagation()` on `wheel`, `mousedown`, and `touchstart` events, and toggle `map.scrollWheelZoom.disable/enable()` on mouse enter/leave.

9. **Porto Alegre coordinates** — Center: `[-30.0346, -51.2177]`, Bbox: approximately `[-30.27, -51.27, -29.87, -50.97]`.

10. **Tooltips** — All GeoJSON layers use `layer.bindTooltip(htmlString, { sticky: true })` for hover information. Sticky tooltips follow the cursor.
