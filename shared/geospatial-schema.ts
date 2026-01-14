import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, jsonb, timestamp, real } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

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

export const geospatialLayers = pgTable('geospatial_layers', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  cityLocode: text('city_locode').notNull(),
  layerType: text('layer_type').notNull().$type<LayerType>(),
  bounds: jsonb('bounds').$type<GeoBounds>().notNull(),
  metadata: jsonb('metadata').$type<LayerMetadata>().notNull(),
  geoJson: jsonb('geo_json').$type<any>(),
  rasterStats: jsonb('raster_stats').$type<{
    min: number;
    max: number;
    mean: number;
    percentiles?: Record<number, number>;
  }>(),
  gridData: jsonb('grid_data').$type<{
    width: number;
    height: number;
    cellSize: number;
    values?: number[][];
  }>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertGeospatialLayerSchema = createInsertSchema(geospatialLayers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type GeospatialLayer = typeof geospatialLayers.$inferSelect;
export type InsertGeospatialLayer = z.infer<typeof insertGeospatialLayerSchema>;

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
