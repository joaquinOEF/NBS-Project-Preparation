import {
  type User,
  type InsertUser,
  type City,
  type InsertCity,
  type Session,
  type InsertSession,
  type Project,
  type InsertProject,
  type CityBoundaryCache,
  type InsertCityBoundaryCache,
  type ElevationCache,
  type InsertElevationCache,
  users,
  cities,
  sessions,
  projects,
  cityBoundaryCache,
  elevationCache,
} from '@shared/schema';
import { db } from './db';
import { eq, inArray } from 'drizzle-orm';

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  getCities(): Promise<City[]>;
  getCitiesByProjectIds(projectIds: string[]): Promise<City[]>;
  getCity(cityId: string): Promise<City | undefined>;
  createCity(city: InsertCity): Promise<City>;
  createOrUpdateCity(city: InsertCity): Promise<City>;

  getSession(id: string): Promise<Session | undefined>;
  getSessionByToken(token: string): Promise<Session | undefined>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;

  isCodeConsumed(code: string): Promise<boolean>;
  markCodeAsConsumed(code: string): Promise<void>;

  getProjectsByCityId(cityId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;

  getCityBoundaryCache(cityLocode: string): Promise<CityBoundaryCache | undefined>;
  setCityBoundaryCache(data: InsertCityBoundaryCache): Promise<CityBoundaryCache>;

  getElevationCache(cityLocode: string): Promise<ElevationCache | undefined>;
  setElevationCache(data: InsertElevationCache): Promise<ElevationCache>;
}

export class DatabaseStorage implements IStorage {
  private consumedCodes: Set<string> = new Set();

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async getCities(): Promise<City[]> {
    return db.select().from(cities);
  }

  async getCitiesByProjectIds(projectIds: string[]): Promise<City[]> {
    if (projectIds.length === 0) return [];
    return db.select().from(cities).where(inArray(cities.projectId, projectIds));
  }

  async getCity(cityId: string): Promise<City | undefined> {
    const [city] = await db.select().from(cities).where(eq(cities.cityId, cityId));
    return city || undefined;
  }

  async createCity(insertCity: InsertCity): Promise<City> {
    const [city] = await db.insert(cities).values(insertCity).returning();
    return city;
  }

  async createOrUpdateCity(insertCity: InsertCity): Promise<City> {
    const existing = await this.getCity(insertCity.cityId);
    if (existing) {
      const [city] = await db.update(cities).set(insertCity).where(eq(cities.cityId, insertCity.cityId)).returning();
      return city;
    }
    return this.createCity(insertCity);
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async getSessionByToken(token: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
    return session || undefined;
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const [session] = await db.insert(sessions).values(insertSession).returning();
    return session;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined> {
    const [session] = await db.update(sessions).set(updates).where(eq(sessions.id, id)).returning();
    return session || undefined;
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  async isCodeConsumed(code: string): Promise<boolean> {
    return this.consumedCodes.has(code);
  }

  async markCodeAsConsumed(code: string): Promise<void> {
    this.consumedCodes.add(code);
  }

  async getProjectsByCityId(cityId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.cityId, cityId));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || undefined;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async getCityBoundaryCache(cityLocode: string): Promise<CityBoundaryCache | undefined> {
    const [cache] = await db.select().from(cityBoundaryCache).where(eq(cityBoundaryCache.cityLocode, cityLocode));
    return cache || undefined;
  }

  async setCityBoundaryCache(data: InsertCityBoundaryCache): Promise<CityBoundaryCache> {
    const existing = await this.getCityBoundaryCache(data.cityLocode);
    if (existing) {
      const [updated] = await db.update(cityBoundaryCache)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(cityBoundaryCache.cityLocode, data.cityLocode))
        .returning();
      return updated;
    }
    const [cache] = await db.insert(cityBoundaryCache).values(data).returning();
    return cache;
  }

  async getElevationCache(cityLocode: string): Promise<ElevationCache | undefined> {
    const [cache] = await db.select().from(elevationCache).where(eq(elevationCache.cityLocode, cityLocode));
    return cache || undefined;
  }

  async setElevationCache(data: InsertElevationCache): Promise<ElevationCache> {
    const existing = await this.getElevationCache(data.cityLocode);
    if (existing) {
      const [updated] = await db.update(elevationCache)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(elevationCache.cityLocode, data.cityLocode))
        .returning();
      return updated;
    }
    const [cache] = await db.insert(elevationCache).values(data).returning();
    return cache;
  }
}

export const storage = new DatabaseStorage();
