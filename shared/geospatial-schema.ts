
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

// (audit DS-10) The old `geospatialLayers` pgTable + its insert schema/types
// were deleted: the table was never wired into shared/schema.ts, so it never
// existed in any database — the fetch-on-demand services cache to disk, not
// Postgres. GeoBounds / LayerType / LAYER_CONFIGS and the data interfaces
// below are LIVE (imported by six services + the tile pipeline) and stay.

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

export interface SurfaceWaterData {
  cityLocode: string;
  bounds: GeoBounds;
  occurrence: {
    permanent: number;
    seasonal: number;
    ephemeral: number;
  };
  waterMask: any;
}

export interface RiverData {
  cityLocode: string;
  bounds: GeoBounds;
  rivers: any;
  totalLengthKm: number;
  majorRivers: string[];
}

export interface ForestCanopyData {
  cityLocode: string;
  bounds: GeoBounds;
  canopyCover: {
    mean: number;
    min: number;
    max: number;
  };
  geoJson?: any;
}

export interface PopulationData {
  cityLocode: string;
  bounds: GeoBounds;
  totalPopulation: number;
  densityPerSqKm: number;
  geoJson?: any;
}

export const LAYER_CONFIGS: Record<LayerType, {
  name: string;
  description: string;
  source: string;
  color: string;
  fillColor: string;
  opacity: number;
}> = {
  elevation: {
    name: 'Elevation Contours',
    description: 'Terrain elevation from Copernicus DEM',
    source: 'Copernicus DEM GLO-30',
    color: '#c9a87c',
    fillColor: 'transparent',
    opacity: 0.8,
  },
  landcover: {
    name: 'Land Cover',
    description: 'Land use classification (built-up, vegetation, water)',
    source: 'ESA WorldCover 10m',
    color: '#4ade80',
    fillColor: '#4ade80',
    opacity: 0.6,
  },
  surface_water: {
    name: 'Surface Water',
    description: 'Water occurrence and seasonality',
    source: 'JRC Global Surface Water',
    color: '#3b82f6',
    fillColor: '#3b82f6',
    opacity: 0.7,
  },
  rivers: {
    name: 'River Network',
    description: 'Major rivers and waterways',
    source: 'HydroSHEDS / OSM',
    color: '#0ea5e9',
    fillColor: 'transparent',
    opacity: 0.9,
  },
  forest_canopy: {
    name: 'Forest Canopy',
    description: 'Tree canopy cover percentage',
    source: 'Hansen Global Forest',
    color: '#22c55e',
    fillColor: '#22c55e',
    opacity: 0.5,
  },
  population: {
    name: 'Population Density',
    description: 'Population distribution',
    source: 'WorldPop',
    color: '#f97316',
    fillColor: '#f97316',
    opacity: 0.5,
  },
  built_density: {
    name: 'Built-up Density',
    description: 'Urban built-up intensity',
    source: 'GHSL Built-Up',
    color: '#8b5cf6',
    fillColor: '#8b5cf6',
    opacity: 0.5,
  },
};
