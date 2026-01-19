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
  type InfoBlock,
  type InsertInfoBlock,
  type EvidenceRecord,
  type InsertEvidenceRecord,
  type Assumption,
  type InsertAssumption,
  type AgentActionLogEntry,
  type InsertAgentActionLog,
  type ProjectPatch,
  type InsertProjectPatch,
  type InfoBlockType,
  type BlockStatus,
  type UpdatedByType,
  users,
  cities,
  sessions,
  projects,
  cityBoundaryCache,
  elevationCache,
  infoBlocks,
  evidenceRecords,
  assumptions,
  agentActionLog,
  projectPatches,
} from '@shared/schema';
import { db } from './db';
import { eq, and, inArray, desc } from 'drizzle-orm';

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createUserWithId(id: string, user: InsertUser): Promise<User>;
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
  createProjectWithId(id: string, project: InsertProject): Promise<Project>;

  getCityBoundaryCache(cityLocode: string): Promise<CityBoundaryCache | undefined>;
  setCityBoundaryCache(data: InsertCityBoundaryCache): Promise<CityBoundaryCache>;

  getElevationCache(cityLocode: string): Promise<ElevationCache | undefined>;
  setElevationCache(data: InsertElevationCache): Promise<ElevationCache>;

  // Info Blocks (Knowledge Workspace)
  getInfoBlock(projectId: string, blockType: InfoBlockType): Promise<InfoBlock | undefined>;
  getInfoBlocksByProject(projectId: string): Promise<InfoBlock[]>;
  createInfoBlock(data: InsertInfoBlock): Promise<InfoBlock>;
  updateInfoBlock(id: string, updates: Partial<InfoBlock>): Promise<InfoBlock | undefined>;
  upsertInfoBlock(projectId: string, blockType: InfoBlockType, data: Partial<InsertInfoBlock>): Promise<InfoBlock>;

  // Evidence Records
  getEvidenceRecord(id: string): Promise<EvidenceRecord | undefined>;
  getEvidenceByProject(projectId: string): Promise<EvidenceRecord[]>;
  createEvidenceRecord(data: InsertEvidenceRecord): Promise<EvidenceRecord>;
  updateEvidenceRecord(id: string, updates: Partial<EvidenceRecord>): Promise<EvidenceRecord | undefined>;

  // Assumptions
  getAssumption(id: string): Promise<Assumption | undefined>;
  getAssumptionsByProject(projectId: string): Promise<Assumption[]>;
  createAssumption(data: InsertAssumption): Promise<Assumption>;
  updateAssumption(id: string, updates: Partial<Assumption>): Promise<Assumption | undefined>;

  // Agent Action Log
  getAgentActions(projectId: string, limit?: number): Promise<AgentActionLogEntry[]>;
  createAgentAction(data: InsertAgentActionLog): Promise<AgentActionLogEntry>;
  updateAgentAction(id: string, updates: Partial<AgentActionLogEntry>): Promise<AgentActionLogEntry | undefined>;

  // Project Patches
  getPendingPatches(projectId: string): Promise<ProjectPatch[]>;
  createPatch(data: InsertProjectPatch): Promise<ProjectPatch>;
  updatePatch(id: string, updates: Partial<ProjectPatch>): Promise<ProjectPatch | undefined>;
  getPatchesByIds(ids: string[]): Promise<ProjectPatch[]>;
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

  async createUserWithId(id: string, insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({ ...insertUser, id } as typeof users.$inferInsert).returning();
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

  async createProjectWithId(id: string, insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values({ ...insertProject, id } as typeof projects.$inferInsert).returning();
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

  // Info Blocks (Knowledge Workspace)
  async getInfoBlock(projectId: string, blockType: InfoBlockType): Promise<InfoBlock | undefined> {
    const [block] = await db.select().from(infoBlocks)
      .where(and(eq(infoBlocks.projectId, projectId), eq(infoBlocks.blockType, blockType)));
    return block || undefined;
  }

  async getInfoBlocksByProject(projectId: string): Promise<InfoBlock[]> {
    return db.select().from(infoBlocks).where(eq(infoBlocks.projectId, projectId));
  }

  async createInfoBlock(data: InsertInfoBlock): Promise<InfoBlock> {
    const [block] = await db.insert(infoBlocks).values(data as typeof infoBlocks.$inferInsert).returning();
    return block;
  }

  async updateInfoBlock(id: string, updates: Partial<InfoBlock>): Promise<InfoBlock | undefined> {
    const { blockType, ...rest } = updates;
    const [block] = await db.update(infoBlocks)
      .set({ ...rest, ...(blockType && { blockType: blockType as InfoBlockType }), updatedAt: new Date() })
      .where(eq(infoBlocks.id, id))
      .returning();
    return block || undefined;
  }

  async upsertInfoBlock(projectId: string, blockType: InfoBlockType, data: Partial<InsertInfoBlock>): Promise<InfoBlock> {
    const existing = await this.getInfoBlock(projectId, blockType);
    if (existing) {
      const { blockType: _, status, updatedBy, ...updateData } = data;
      const updateSet: any = { ...updateData, updatedAt: new Date(), version: (existing.version || 1) + 1 };
      if (status) updateSet.status = status as BlockStatus;
      if (updatedBy) updateSet.updatedBy = updatedBy as UpdatedByType;
      const [updated] = await db.update(infoBlocks)
        .set(updateSet)
        .where(eq(infoBlocks.id, existing.id))
        .returning();
      return updated;
    }
    const insertData: typeof infoBlocks.$inferInsert = {
      projectId,
      blockType,
      status: (data.status || 'NOT_STARTED') as BlockStatus,
      blockStateJson: data.blockStateJson || {},
      completionPercent: data.completionPercent ?? 0,
      updatedBy: (data.updatedBy || 'user') as UpdatedByType,
      updatedByAgentId: data.updatedByAgentId,
      version: 1,
    };
    const [block] = await db.insert(infoBlocks).values(insertData).returning();
    return block;
  }

  // Evidence Records
  async getEvidenceRecord(id: string): Promise<EvidenceRecord | undefined> {
    const [record] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, id));
    return record || undefined;
  }

  async getEvidenceByProject(projectId: string): Promise<EvidenceRecord[]> {
    return db.select().from(evidenceRecords).where(eq(evidenceRecords.projectId, projectId));
  }

  async createEvidenceRecord(data: InsertEvidenceRecord): Promise<EvidenceRecord> {
    const [record] = await db.insert(evidenceRecords).values(data as typeof evidenceRecords.$inferInsert).returning();
    return record;
  }

  async updateEvidenceRecord(id: string, updates: Partial<EvidenceRecord>): Promise<EvidenceRecord | undefined> {
    const [record] = await db.update(evidenceRecords)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(evidenceRecords.id, id))
      .returning();
    return record || undefined;
  }

  // Assumptions
  async getAssumption(id: string): Promise<Assumption | undefined> {
    const [assumption] = await db.select().from(assumptions).where(eq(assumptions.id, id));
    return assumption || undefined;
  }

  async getAssumptionsByProject(projectId: string): Promise<Assumption[]> {
    return db.select().from(assumptions).where(eq(assumptions.projectId, projectId));
  }

  async createAssumption(data: InsertAssumption): Promise<Assumption> {
    const [assumption] = await db.insert(assumptions).values(data as typeof assumptions.$inferInsert).returning();
    return assumption;
  }

  async updateAssumption(id: string, updates: Partial<Assumption>): Promise<Assumption | undefined> {
    const [assumption] = await db.update(assumptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(assumptions.id, id))
      .returning();
    return assumption || undefined;
  }

  // Agent Action Log
  async getAgentActions(projectId: string, limit: number = 50): Promise<AgentActionLogEntry[]> {
    return db.select().from(agentActionLog)
      .where(eq(agentActionLog.projectId, projectId))
      .orderBy(desc(agentActionLog.createdAt))
      .limit(limit);
  }

  async createAgentAction(data: InsertAgentActionLog): Promise<AgentActionLogEntry> {
    const [action] = await db.insert(agentActionLog).values(data as typeof agentActionLog.$inferInsert).returning();
    return action;
  }

  async updateAgentAction(id: string, updates: Partial<AgentActionLogEntry>): Promise<AgentActionLogEntry | undefined> {
    const [action] = await db.update(agentActionLog)
      .set(updates)
      .where(eq(agentActionLog.id, id))
      .returning();
    return action || undefined;
  }

  // Project Patches
  async getPendingPatches(projectId: string): Promise<ProjectPatch[]> {
    return db.select().from(projectPatches)
      .where(and(eq(projectPatches.projectId, projectId), eq(projectPatches.status, 'pending')));
  }

  async createPatch(data: InsertProjectPatch): Promise<ProjectPatch> {
    const [patch] = await db.insert(projectPatches).values(data as typeof projectPatches.$inferInsert).returning();
    return patch;
  }

  async updatePatch(id: string, updates: Partial<ProjectPatch>): Promise<ProjectPatch | undefined> {
    const [patch] = await db.update(projectPatches)
      .set(updates)
      .where(eq(projectPatches.id, id))
      .returning();
    return patch || undefined;
  }

  async getPatchesByIds(ids: string[]): Promise<ProjectPatch[]> {
    if (ids.length === 0) return [];
    return db.select().from(projectPatches).where(inArray(projectPatches.id, ids));
  }
}

export const storage = new DatabaseStorage();
