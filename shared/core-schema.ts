import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const users = pgTable('users', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  title: text('title'),
  projects: jsonb('projects').$type<string[]>().default([]),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiry: timestamp('token_expiry'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const cities = pgTable('cities', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  cityId: text('city_id').notNull().unique(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  locode: text('locode'),
  projectId: text('project_id').notNull(),
  currentBoundary: jsonb('current_boundary').$type<any>(),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text('user_id').notNull(),
  token: text('token').notNull(),
  codeVerifier: text('code_verifier'),
  state: text('state'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const projects = pgTable('projects', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  actionId: text('action_id').notNull(),
  actionName: text('action_name').notNull(),
  actionDescription: text('action_description').notNull(),
  actionType: text('action_type').notNull(),
  cityId: text('city_id').notNull(),
  status: text('status').notNull().default('initiated'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertCitySchema = createInsertSchema(cities).omit({
  id: true,
  createdAt: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type City = typeof cities.$inferSelect;
export type InsertCity = z.infer<typeof insertCitySchema>;

export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const cityBoundaryCache = pgTable('city_boundary_cache', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  cityLocode: text('city_locode').notNull().unique(),
  cityName: text('city_name').notNull(),
  centroid: jsonb('centroid').$type<[number, number]>().notNull(),
  bbox: jsonb('bbox').$type<[number, number, number, number]>().notNull(),
  boundaryGeoJson: jsonb('boundary_geojson').$type<any>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const elevationCache = pgTable('elevation_cache', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  cityLocode: text('city_locode').notNull().unique(),
  bounds: jsonb('bounds').$type<{ minLng: number; minLat: number; maxLng: number; maxLat: number }>().notNull(),
  elevationData: jsonb('elevation_data').$type<{
    width: number;
    height: number;
    cellSize: number;
    minElevation: number;
    maxElevation: number;
  }>().notNull(),
  contours: jsonb('contours').$type<any>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const insertCityBoundaryCacheSchema = createInsertSchema(cityBoundaryCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertElevationCacheSchema = createInsertSchema(elevationCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CityBoundaryCache = typeof cityBoundaryCache.$inferSelect;
export type InsertCityBoundaryCache = z.infer<typeof insertCityBoundaryCacheSchema>;

export type ElevationCache = typeof elevationCache.$inferSelect;
export type InsertElevationCache = z.infer<typeof insertElevationCacheSchema>;

export const osmAssetCache = pgTable('osm_asset_cache', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  cacheKey: text('cache_key').notNull().unique(),
  zoneId: text('zone_id').notNull(),
  category: text('category').notNull(),
  bbox: jsonb('bbox').$type<[number, number, number, number]>().notNull(),
  assets: jsonb('assets').$type<any[]>().notNull(),
  assetCount: text('asset_count').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const insertOsmAssetCacheSchema = createInsertSchema(osmAssetCache).omit({
  id: true,
  createdAt: true,
});

export type OsmAssetCache = typeof osmAssetCache.$inferSelect;
export type InsertOsmAssetCache = z.infer<typeof insertOsmAssetCacheSchema>;
