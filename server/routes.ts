import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { storage } from './storage';
import {
  generateOAuthState,
  exchangeCodeForToken,
  getUserProfile,
  createOrUpdateUser,
  generateSessionToken,
} from './services/authService';
import {
  type InfoBlockType,
  type InsertProjectPatch,
  MODULE_REGISTRY,
  BLOCK_SCHEMAS,
  proposePatchRequestSchema,
  applyPatchRequestSchema,
} from '@shared/schema';
import {
  SAMPLE_USER_ID,
  SAMPLE_USER_EMAIL,
  SAMPLE_USER_NAME,
  SAMPLE_PROJECT_ID,
  SAMPLE_CITY_ID,
  SAMPLE_CITY_LOCODE,
  SAMPLE_CITY_NAME,
  SAMPLE_CITY_COUNTRY,
} from '@shared/sample-constants';
import {
  getUserAccessibleCities,
  getCityById,
  getCityDetail,
  getInventory,
  getCityBoundary,
  getInventoriesByCity,
  getInventoryDetails,
  getInventoryDownload,
  getCCRADashboard,
  getHIAPData,
} from './services/cityService';
import { getCityBoundary as getOSMCityBoundary } from './services/osmService';
import { getElevationData } from './services/copernicusService';
import { getLandcoverData } from './services/worldcoverService';
import { getSurfaceWaterData } from './services/surfaceWaterService';
import { getRiversData } from './services/riversService';
import { getForestCanopyData } from './services/forestService';
import { getPopulationData } from './services/populationService';
import {
  generateGrid,
  computeElevationMetrics,
  computeLandcoverMetrics,
  computeRiverMetrics,
  computeWaterMetrics,
  computeForestMetrics,
  computePopulationMetrics,
  computeCompositeScores,
  calculateCoverageSummary,
} from './services/gridService';
import { generateImpactNarrative, generateLensVariant, regenerateBlock } from './services/impactModelService';
import { fetchOsmAssets } from './services/osmAssetService';
import type { LayerType } from '../shared/geospatial-schema';
import { registerAgentRoutes } from './routes/agentRoutes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.get('/api/auth/oauth/initiate', async (req, res) => {
    try {
      // Clear any existing session to ensure completely fresh start
      const oldSessionId = req.cookies.session_id;
      if (oldSessionId) {
        await storage.deleteSession(oldSessionId);
        res.clearCookie('session_id');
      }

      const oauthState = generateOAuthState();

      // Debug: Log the complete authorization URL
      console.log('🔗 OAuth authorization initiated');

      // Store the state and code verifier in session
      const session = await storage.createSession({
        userId: '', // Will be filled after OAuth callback
        token: generateSessionToken(),
        codeVerifier: oauthState.codeVerifier,
        state: oauthState.state,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      });

      // Set session cookie
      res.cookie('session_id', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 10 * 60 * 1000, // 10 minutes
      });

      res.json({
        authUrl: oauthState.authUrl,
        state: oauthState.state,
      });
    } catch (error) {
      console.error('OAuth initiation error:', error);
      res.status(500).json({ message: 'Failed to initiate OAuth flow' });
    }
  });

  app.get('/api/auth/oauth/callback', async (req, res) => {
    try {
      // OAuth callback processing

      const { code, state, error, error_description } = req.query;

      // Handle OAuth errors with enhanced logging
      if (error) {
        console.error('❌ OAuth error detected:', error, error_description);
        return res.redirect(
          `/login?error=${encodeURIComponent((error_description as string) || (error as string))}`
        );
      }

      // Validate required parameters
      if (!code || !state) {
        return res.redirect('/login?error=Missing authorization code or state');
      }

      // Check if code was already consumed (prevent "Single-use code" error)
      const codeStr = code as string;
      if (await storage.isCodeConsumed(codeStr)) {
        return res.redirect('/cities');
      }

      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.redirect('/login?error=No session found');
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.state !== state) {
        return res.redirect('/login?error=Invalid state parameter');
      }

      // Exchange code for token
      let tokenResponse;
      try {
        tokenResponse = await exchangeCodeForToken(
          codeStr,
          session.codeVerifier!
        );
        // Mark code as consumed only after successful exchange
        await storage.markCodeAsConsumed(codeStr);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Single-use code')) {
          // Clear ALL existing sessions and state for this user
          if (sessionId) {
            await storage.deleteSession(sessionId);
          }
          res.clearCookie('session_id');

          // Force browser to clear any cached OAuth state by adding cache-busting parameters
          const timestamp = Date.now();
          const clearCacheUrl = `/?clear_cache=${timestamp}&retry=${Math.random().toString(36).substr(2, 9)}`;

          return res.redirect(clearCacheUrl);
        }
        throw error;
      }

      // Get user profile (pass full token response for ID token access)
      let cityCatalystUser;
      try {
        cityCatalystUser = await getUserProfile(
          tokenResponse.access_token,
          tokenResponse
        );
      } catch (profileError) {
        console.error('❌ Failed to get user profile:', profileError);
        throw new Error('Failed to retrieve user profile');
      }

      // Create or update user
      let user;
      try {
        user = await createOrUpdateUser(
          cityCatalystUser,
          tokenResponse.access_token,
          tokenResponse.refresh_token
        );
      } catch (userError) {
        console.error('❌ Failed to create/update user:', userError);
        throw new Error('Failed to create or update user');
      }

      // Update session with user ID
      await storage.updateSession(session.id, {
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });

      // Set long-term session cookie
      res.cookie('session_id', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      // Redirect to cities page after successful authentication
      res.redirect('/cities');
    } catch (error) {
      console.error('❌ OAuth callback error:', error);

      // Enhanced error logging to identify the source of undefined errors
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      } else {
        console.error('Non-Error object thrown:', error);
        console.error('Type:', typeof error);
        console.error('Stringified:', String(error));
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Authentication failed';
      res.redirect(`/login?error=${encodeURIComponent(errorMessage)}`);
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (sessionId) {
        await storage.deleteSession(sessionId);
      }

      res.clearCookie('session_id');
      res.json({ success: true });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ message: 'Logout failed' });
    }
  });

  // Sample mode project initialization
  app.post('/api/sample/init', async (req, res) => {
    try {
      // Check if sample project already exists
      let project = await storage.getProject(SAMPLE_PROJECT_ID);
      const isNew = !project;
      
      if (!project) {
        // Create sample user if not exists
        let user = await storage.getUser(SAMPLE_USER_ID);
        if (!user) {
          user = await storage.createUserWithId(SAMPLE_USER_ID, {
            email: SAMPLE_USER_EMAIL,
            name: SAMPLE_USER_NAME,
            projects: [SAMPLE_PROJECT_ID],
          });
          console.log('📦 Created sample user:', SAMPLE_USER_ID);
        }

        // Create sample city if not exists
        let city = await storage.getCity(SAMPLE_CITY_ID);
        if (!city) {
          city = await storage.createCity({
            cityId: SAMPLE_CITY_ID,
            name: SAMPLE_CITY_NAME,
            country: SAMPLE_CITY_COUNTRY,
            locode: SAMPLE_CITY_LOCODE,
            projectId: SAMPLE_PROJECT_ID,
          });
          console.log('🏙️ Created sample city:', SAMPLE_CITY_ID);
        }

        // Create sample project with required fields
        project = await storage.createProjectWithId(SAMPLE_PROJECT_ID, {
          actionId: 'sample-nbs-action',
          actionName: 'Porto Alegre NBS Project',
          actionDescription: 'Nature Based Solutions project for Porto Alegre exploring climate resilience interventions.',
          actionType: 'adaptation',
          cityId: SAMPLE_CITY_ID,
        });
        console.log('📋 Created sample project:', SAMPLE_PROJECT_ID);

        // Initialize empty info blocks for each module type
        const blockTypes: InfoBlockType[] = ['funder_selection', 'site_explorer', 'impact_model', 'operations', 'business_model'];
        for (const blockType of blockTypes) {
          await storage.upsertInfoBlock(SAMPLE_PROJECT_ID, blockType, {
            blockStateJson: {},
            status: 'NOT_STARTED',
            completionPercent: 0,
            updatedBy: 'system',
          });
        }
        console.log('📝 Initialized sample info blocks');
      }

      res.json({
        success: true,
        projectId: SAMPLE_PROJECT_ID,
        cityId: SAMPLE_CITY_ID,
        userId: SAMPLE_USER_ID,
        isNew,
      });
    } catch (error: any) {
      console.error('Sample init error:', error);
      res.status(500).json({ message: error.message || 'Failed to initialize sample project' });
    }
  });

  // Get sample project info (no auth required for sample mode)
  app.get('/api/sample/project', async (req, res) => {
    try {
      const project = await storage.getProject(SAMPLE_PROJECT_ID);
      
      if (!project) {
        return res.status(404).json({ 
          message: 'Sample project not initialized. Call POST /api/sample/init first.',
          initialized: false,
        });
      }

      res.json({
        initialized: true,
        projectId: SAMPLE_PROJECT_ID,
        cityId: SAMPLE_CITY_ID,
        userId: SAMPLE_USER_ID,
        project,
      });
    } catch (error: any) {
      console.error('Get sample project error:', error);
      res.status(500).json({ message: error.message || 'Failed to get sample project' });
    }
  });

  // Authentication middleware
  async function requireAuth(req: any, res: any, next: any) {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ message: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      // Check if access token is expired and needs refresh
      if (
        user.tokenExpiry &&
        user.tokenExpiry < new Date() &&
        user.refreshToken
      ) {
        // For now, just extend the expiry - proper refresh can be added later
        await storage.updateUser(user.id, {
          tokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // Extend by 1 hour
        });
      }

      req.user = user;
      req.session = session;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({ message: 'Authentication error' });
    }
  }

  // User routes
  app.get('/api/user/profile', requireAuth, async (req: any, res) => {
    res.json({
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      title: req.user.title,
      projects: req.user.projects,
    });
  });

  // City routes
  app.get('/api/cities', requireAuth, async (req: any, res) => {
    try {
      // Pass access token to fetch real city data from CityCatalyst
      const cities = await getUserAccessibleCities(
        req.user.id,
        req.user.accessToken
      );

      res.json({ cities });
    } catch (error) {
      console.error('Get cities error:', error);
      res.status(500).json({ message: 'Failed to fetch cities' });
    }
  });

  app.get('/api/cities/:cityId', requireAuth, async (req: any, res) => {
    try {
      const { cityId } = req.params;
      const city = await getCityById(cityId);

      if (!city) {
        return res.status(404).json({ message: 'City not found' });
      }

      // Check if user has access to this city
      const userCities = await getUserAccessibleCities(req.user.id);
      const hasAccess = userCities.some(c => c.cityId === cityId);

      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }

      res.json({ city });
    } catch (error) {
      console.error('Get city error:', error);
      res.status(500).json({ message: 'Failed to fetch city' });
    }
  });

  // CityCatalyst API routes
  app.get(
    '/api/citycatalyst/city/:cityId',
    requireAuth,
    async (req: any, res) => {
      try {
        const { cityId } = req.params;

        // Validate UUID format
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(cityId)) {
          return res
            .status(400)
            .json({ message: 'Invalid cityId format. Expected UUID.' });
        }

        const cityDetail = await getCityDetail(cityId, req.user.accessToken);
        res.json({ data: cityDetail });
      } catch (error: any) {
        console.error('Get city detail error:', error);
        res
          .status(500)
          .json({ message: error.message || 'Failed to fetch city detail' });
      }
    }
  );

  app.get(
    '/api/citycatalyst/city/:locode/inventory/:year',
    requireAuth,
    async (req: any, res) => {
      try {
        const { locode, year } = req.params;
        const inventory = await getInventory(
          locode,
          parseInt(year),
          req.user.accessToken
        );
        res.json({ data: inventory });
      } catch (error: any) {
        console.error('Get inventory error:', error);
        res
          .status(500)
          .json({ message: error.message || 'Failed to fetch inventory' });
      }
    }
  );

  app.get(
    '/api/citycatalyst/city/:locode/boundary',
    requireAuth,
    async (req: any, res) => {
      try {
        const { locode } = req.params;
        const boundary = await getCityBoundary(locode, req.user.accessToken);
        res.json({ data: boundary });
      } catch (error: any) {
        console.error('Get city boundary error:', error);
        res
          .status(500)
          .json({ message: error.message || 'Failed to fetch city boundary' });
      }
    }
  );

  app.get(
    '/api/citycatalyst/inventories',
    requireAuth,
    async (req: any, res) => {
      try {
        const inventories = await getInventoriesByCity(req.user.accessToken);
        res.json({ data: inventories });
      } catch (error: any) {
        console.error('Get inventories error:', error);
        res
          .status(500)
          .json({ message: error.message || 'Failed to fetch inventories' });
      }
    }
  );

  // INVENTORY API ENDPOINTS
  // See server/services/cityService.ts for detailed documentation on when to use each endpoint

  // Get detailed inventory information by inventory ID (metadata only)
  app.get(
    '/api/citycatalyst/inventory/:inventoryId',
    requireAuth,
    async (req: any, res) => {
      try {
        const { inventoryId } = req.params;
        console.log(`📊 Getting inventory details for ID: ${inventoryId}`);
        const inventoryDetails = await getInventoryDetails(
          inventoryId,
          req.user.accessToken
        );
        res.json({ data: inventoryDetails });
      } catch (error: any) {
        console.error('Get inventory details error:', error);
        res
          .status(500)
          .json({
            message: error.message || 'Failed to fetch inventory details',
          });
      }
    }
  );

  // Get comprehensive inventory data with emissions breakdown (download endpoint)
  // This endpoint provides detailed GPC sector/subsector emissions data
  app.get(
    '/api/citycatalyst/inventory/:inventoryId/download',
    requireAuth,
    async (req: any, res) => {
      try {
        const { inventoryId } = req.params;
        console.log(
          `📊 Getting inventory download data for ID: ${inventoryId}`
        );
        const inventoryDownload = await getInventoryDownload(
          inventoryId,
          req.user.accessToken
        );
        res.json({ data: inventoryDownload });
      } catch (error: any) {
        console.error('Get inventory download error:', error);
        res
          .status(500)
          .json({
            message: error.message || 'Failed to fetch inventory download data',
          });
      }
    }
  );

  // Get CCRA dashboard data for a city inventory
  // Requires both city UUID (from inventory.city.cityId) and inventory UUID
  app.get(
    '/api/citycatalyst/inventory/:inventoryId/ccra',
    requireAuth,
    async (req: any, res) => {
      try {
        const { inventoryId } = req.params;
        console.log(
          `🌡️ Getting CCRA dashboard data for inventory ID: ${inventoryId}`
        );

        // First get inventory details to extract city UUID
        const inventoryDetails = await getInventoryDetails(
          inventoryId,
          req.user.accessToken
        );
        const cityId = inventoryDetails.city.cityId;

        console.log(`🏙️ Extracted city UUID: ${cityId} from inventory`);

        // Now fetch CCRA data using both city and inventory UUIDs
        const ccraData = await getCCRADashboard(
          cityId,
          inventoryId,
          req.user.accessToken
        );
        res.json({ data: ccraData });
      } catch (error: any) {
        console.error('Get CCRA dashboard error:', error);
        res
          .status(500)
          .json({
            message: error.message || 'Failed to fetch CCRA dashboard data',
          });
      }
    }
  );

  // Get HIAP data for an inventory (mitigation and adaptation actions)
  // Query parameters: actionType, lng, ignoreExisting
  app.get(
    '/api/citycatalyst/inventory/:inventoryId/hiap',
    requireAuth,
    async (req: any, res) => {
      try {
        const { inventoryId } = req.params;
        const { actionType, lng, ignoreExisting } = req.query;

        console.log(
          `🌱 Getting HIAP data for inventory ID: ${inventoryId}, actionType: ${actionType}, language: ${lng}`
        );

        if (!actionType || !lng) {
          return res
            .status(400)
            .json({
              message: 'actionType and lng query parameters are required',
            });
        }

        if (!['mitigation', 'adaptation'].includes(actionType)) {
          return res
            .status(400)
            .json({
              message: 'actionType must be either "mitigation" or "adaptation"',
            });
        }

        const hiapData = await getHIAPData(
          inventoryId,
          actionType as 'mitigation' | 'adaptation',
          lng as string,
          req.user.accessToken,
          ignoreExisting ? ignoreExisting === 'true' : undefined
        );

        res.json({ data: hiapData });
      } catch (error: any) {
        console.error('Get HIAP data error:', error);
        res
          .status(500)
          .json({ message: error.message || 'Failed to fetch HIAP data' });
      }
    }
  );

  // City Information API (uses working inventories data)
  app.get(
    '/api/city-information/:cityId',
    requireAuth,
    async (req: any, res) => {
      try {
        const { cityId } = req.params;
        console.log(`🏙️ Getting city information for: ${cityId}`);

        // Get all inventories data (this works!)
        const inventoriesData = await getInventoriesByCity(
          req.user.accessToken
        );
        console.log(
          `📊 Found ${inventoriesData.length} cities with inventory data`
        );

        // Find the city by cityId or locode
        const cityInfo = inventoriesData.find(
          city =>
            city.locode === cityId ||
            city.locode.replace(/\s+/g, '_') === cityId ||
            city.name.toLowerCase().replace(/\s+/g, '-') ===
              cityId.toLowerCase()
        );

        if (!cityInfo) {
          console.log(`❌ City not found: ${cityId}`);
          return res.status(404).json({ message: 'City not found' });
        }

        // Map country from locode prefix
        const getCountryFromLocode = (locode: string): string => {
          const prefix = locode.split(' ')[0];
          const countryMap: Record<string, string> = {
            AR: 'Argentina',
            BR: 'Brazil',
            US: 'United States',
            MX: 'Mexico',
            JP: 'Japan',
            ZM: 'Zambia',
            DE: 'Germany',
            CA: 'Canada',
            AU: 'Australia',
          };
          return countryMap[prefix] || prefix;
        };

        const enrichedCityInfo = {
          ...cityInfo,
          country: getCountryFromLocode(cityInfo.locode),
          locodePrefix: cityInfo.locode.split(' ')[0],
          totalInventories: cityInfo.years.length,
          availableYears: cityInfo.years
            .filter((year): year is number => typeof year === 'number')
            .sort((a, b) => b - a),
          latestUpdate: null, // Note: lastUpdate information is not available in the current data structure
        };

        console.log(`✅ Found city: ${cityInfo.name} (${cityInfo.locode})`);
        res.json({ data: enrichedCityInfo });
      } catch (error: any) {
        console.error('Get city information error:', error);
        res.status(500).json({ message: 'Failed to fetch city information' });
      }
    }
  );

  // Project routes (for authenticated users)
  app.get('/api/projects/:cityId', requireAuth, async (req: any, res) => {
    try {
      const { cityId } = req.params;
      const projects = await storage.getProjectsByCityId(cityId);
      res.json({ projects });
    } catch (error) {
      console.error('Get projects error:', error);
      res.status(500).json({ message: 'Failed to fetch projects' });
    }
  });

  app.get('/api/project/:projectId', requireAuth, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }
      res.json({ project });
    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({ message: 'Failed to fetch project' });
    }
  });

  app.post('/api/projects', requireAuth, async (req: any, res) => {
    try {
      const { actionId, actionName, actionDescription, actionType, cityId } = req.body;
      
      if (!actionId || !actionName || !actionDescription || !actionType || !cityId) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      if (!['mitigation', 'adaptation'].includes(actionType)) {
        return res.status(400).json({ message: 'actionType must be mitigation or adaptation' });
      }
      
      const project = await storage.createProject({
        actionId: String(actionId),
        actionName: String(actionName),
        actionDescription: String(actionDescription),
        actionType: String(actionType),
        cityId: String(cityId),
        status: 'initiated',
      });
      res.json({ project });
    } catch (error) {
      console.error('Create project error:', error);
      res.status(500).json({ message: 'Failed to create project' });
    }
  });

  // Geospatial API routes (for Site Explorer)
  app.post('/api/geospatial/boundary', async (req: any, res) => {
    try {
      const { cityName, cityLocode } = req.body;
      
      if (!cityName || !cityLocode) {
        return res.status(400).json({ message: 'cityName and cityLocode are required' });
      }

      console.log(`📍 Getting boundary for ${cityName} (${cityLocode})`);
      const boundary = await getOSMCityBoundary(cityName, cityLocode);
      res.json({ data: boundary });
    } catch (error: any) {
      console.error('Get city boundary error:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch city boundary' });
    }
  });

  app.post('/api/geospatial/elevation', async (req: any, res) => {
    try {
      const { cityLocode, bounds, resolution } = req.body;
      
      if (!cityLocode || !bounds) {
        return res.status(400).json({ message: 'cityLocode and bounds are required' });
      }

      console.log(`🏔️ Getting elevation for ${cityLocode}`);
      const elevationData = await getElevationData(cityLocode, bounds, resolution || 90);
      res.json({ data: elevationData });
    } catch (error: any) {
      console.error('Get elevation data error:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch elevation data' });
    }
  });

  app.post('/api/geospatial/layer/:layerType', async (req: any, res) => {
    try {
      const { layerType } = req.params as { layerType: LayerType };
      const { cityLocode, bounds } = req.body;
      
      if (!cityLocode || !bounds) {
        return res.status(400).json({ message: 'cityLocode and bounds are required' });
      }

      console.log(`🗺️ Getting ${layerType} layer for ${cityLocode}`);

      let result;
      switch (layerType) {
        case 'landcover':
          result = await getLandcoverData(cityLocode, bounds);
          break;
        case 'surface_water':
          result = await getSurfaceWaterData(cityLocode, bounds);
          break;
        case 'rivers':
          result = await getRiversData(cityLocode, bounds);
          break;
        case 'forest_canopy':
          result = await getForestCanopyData(cityLocode, bounds);
          break;
        case 'population':
          result = await getPopulationData(cityLocode, bounds);
          break;
        default:
          return res.status(400).json({ message: `Unknown layer type: ${layerType}` });
      }

      res.json({ data: result });
    } catch (error: any) {
      console.error(`Get ${req.params.layerType} layer error:`, error);
      res.status(500).json({ message: error.message || 'Failed to fetch layer data' });
    }
  });

  app.post('/api/geospatial/grid', async (req: any, res) => {
    try {
      const { cityLocode, bounds, cellSizeMeters = 250 } = req.body;
      
      if (!cityLocode || !bounds) {
        return res.status(400).json({ message: 'cityLocode and bounds are required' });
      }

      console.log(`🔲 Generating grid for ${cityLocode} with ${cellSizeMeters}m cells`);

      let grid = generateGrid(bounds, cellSizeMeters);
      console.log(`   Generated ${grid.features.length} cells`);

      const [elevationData, landcoverData, riversData, waterData, forestData, populationData] = await Promise.all([
        getElevationData(cityLocode, bounds).catch(() => null),
        getLandcoverData(cityLocode, bounds).catch(() => null),
        getRiversData(cityLocode, bounds).catch(() => null),
        getSurfaceWaterData(cityLocode, bounds).catch(() => null),
        getForestCanopyData(cityLocode, bounds).catch(() => null),
        getPopulationData(cityLocode, bounds).catch(() => null),
      ]);

      if (elevationData) grid = computeElevationMetrics(grid, elevationData);
      if (landcoverData) grid = computeLandcoverMetrics(grid, landcoverData);
      if (riversData) grid = computeRiverMetrics(grid, riversData);
      if (waterData) grid = computeWaterMetrics(grid, waterData);
      if (forestData) grid = computeForestMetrics(grid, forestData);
      if (populationData) grid = computePopulationMetrics(grid, populationData);

      grid = computeCompositeScores(grid);
      const coverage = calculateCoverageSummary(grid);

      console.log(`   Coverage: elevation=${coverage.elevation}%, rivers=${coverage.rivers}%, forest=${coverage.forest}%`);

      res.json({
        data: {
          cityLocode,
          bounds,
          cellSizeMeters,
          totalCells: grid.features.length,
          coverage,
          geoJson: grid,
          metadata: {
            generatedAt: new Date().toISOString(),
            version: '1.0',
          },
        },
      });
    } catch (error: any) {
      console.error('Grid generation error:', error);
      res.status(500).json({ message: error.message || 'Failed to generate grid' });
    }
  });

  // OSM Asset fetching with caching
  app.post('/api/geospatial/osm-assets', async (req: any, res) => {
    try {
      const { zoneId, category, bbox, osmTypes, zoneGeometry } = req.body;
      
      if (!zoneId || !category || !bbox || !osmTypes) {
        return res.status(400).json({ 
          message: 'zoneId, category, bbox, and osmTypes are required' 
        });
      }

      console.log(`🗺️ Fetching OSM assets for zone ${zoneId}, category ${category}`);

      const result = await fetchOsmAssets({
        zoneId,
        category,
        bbox,
        osmTypes,
        zoneGeometry,
      });

      if (result.error) {
        console.warn(`⚠️ OSM fetch warning: ${result.error}`);
        const statusCode = result.errorCode === 'RATE_LIMIT' ? 429 
          : result.errorCode === 'TIMEOUT' ? 504 
          : result.errorCode === 'SIZE_EXCEEDED' ? 413 
          : 502;
        return res.status(statusCode).json({
          assets: [],
          fromCache: false,
          totalFound: 0,
          error: result.error,
          errorCode: result.errorCode,
        });
      }

      console.log(`   Found ${result.totalFound} assets (cached: ${result.fromCache})`);
      res.json(result);
    } catch (error: any) {
      console.error('OSM asset fetch error:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to fetch OSM assets',
        error: 'An unexpected error occurred while fetching map assets.',
        errorCode: 'UNKNOWN',
      });
    }
  });

  // Impact Model AI narrative generation
  app.post('/api/impact-model/generate', async (req: any, res) => {
    try {
      const { selectedZones, interventionBundles, funderPathway, prioritizationWeights, projectName, cityName } = req.body;

      if (!selectedZones || !interventionBundles) {
        return res.status(400).json({ message: 'selectedZones and interventionBundles are required' });
      }

      console.log(`🧠 Generating impact narrative for ${interventionBundles.length} bundles, ${selectedZones.length} zones`);

      const result = await generateImpactNarrative({
        selectedZones,
        interventionBundles,
        funderPathway: funderPathway || { primary: 'BLENDED_FINANCE' },
        prioritizationWeights: prioritizationWeights || {
          floodRiskReduction: 0.3,
          heatReduction: 0.25,
          landslideRiskReduction: 0.15,
          socialEquity: 0.1,
          costCertainty: 0.1,
          biodiversityWaterQuality: 0.1,
        },
        projectName,
        cityName,
      });

      console.log(`   Generated ${result.narrativeBlocks.length} blocks, ${result.coBenefits.length} co-benefits`);

      res.json(result);
    } catch (error: any) {
      console.error('Impact narrative generation error:', error);
      res.status(500).json({ message: error.message || 'Failed to generate impact narrative' });
    }
  });

  // Generate lens variant for impact narrative
  app.post('/api/impact-model/generate-lens', async (req: any, res) => {
    try {
      const { lens, baseNarrativeBlocks, funderPathway, customInstructions } = req.body;

      if (!lens || !baseNarrativeBlocks) {
        return res.status(400).json({ message: 'lens and baseNarrativeBlocks are required' });
      }

      console.log(`🔍 Generating ${lens} lens variant for ${baseNarrativeBlocks.length} blocks`);

      const result = await generateLensVariant({
        lens,
        baseNarrativeBlocks,
        funderPathway: funderPathway || { primary: 'BLENDED_FINANCE' },
        customInstructions,
      });

      console.log(`   Generated ${result.length} blocks for ${lens} lens`);

      res.json({ narrativeBlocks: result });
    } catch (error: any) {
      console.error('Lens generation error:', error);
      res.status(500).json({ message: error.message || 'Failed to generate lens variant' });
    }
  });

  // Regenerate a single narrative block
  app.post('/api/impact-model/regenerate-block', async (req: any, res) => {
    try {
      const { block, customPrompt, projectContext } = req.body;

      if (!block || !customPrompt) {
        return res.status(400).json({ message: 'block and customPrompt are required' });
      }

      console.log(`🔄 Regenerating block: ${block.title}`);

      const result = await regenerateBlock({
        block,
        customPrompt,
        projectContext: projectContext || {},
      });

      console.log(`   Block regenerated successfully`);

      res.json({ block: result });
    } catch (error: any) {
      console.error('Block regeneration error:', error);
      res.status(500).json({ message: error.message || 'Failed to regenerate block' });
    }
  });

  // ============================================
  // KNOWLEDGE WORKSPACE APIs (Phase 1)
  // ============================================

  // GET /api/projects/:id/state - Unified project state
  app.get('/api/projects/:id/state', async (req, res) => {
    try {
      const { id: projectId } = req.params;
      const { blocks: blocksFilter } = req.query;

      // Verify project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      // Get all info blocks for this project
      const infoBlocksData = await storage.getInfoBlocksByProject(projectId);
      
      // Build blocks map
      const blocks: Record<string, any> = {};
      const blockTypes: InfoBlockType[] = ['funder_selection', 'site_explorer', 'impact_model', 'operations', 'business_model'];
      
      // Filter if requested
      const requestedBlocks = blocksFilter 
        ? (blocksFilter as string).split(',') as InfoBlockType[]
        : blockTypes;

      for (const blockType of requestedBlocks) {
        const existingBlock = infoBlocksData.find(b => b.blockType === blockType);
        if (existingBlock) {
          blocks[blockType] = {
            id: existingBlock.id,
            status: existingBlock.status,
            completionPercent: existingBlock.completionPercent,
            updatedBy: existingBlock.updatedBy,
            updatedAt: existingBlock.updatedAt,
            version: existingBlock.version,
            data: existingBlock.blockStateJson || {},
          };
        } else {
          // Return empty block with NOT_STARTED status
          blocks[blockType] = {
            id: null,
            status: 'NOT_STARTED',
            completionPercent: 0,
            updatedBy: null,
            updatedAt: null,
            version: 0,
            data: {},
          };
        }
      }

      // Get evidence and assumptions
      const [evidence, projectAssumptions, pendingPatches] = await Promise.all([
        storage.getEvidenceByProject(projectId),
        storage.getAssumptionsByProject(projectId),
        storage.getPendingPatches(projectId),
      ]);

      res.json({
        projectId,
        blocks,
        evidence: evidence.map(e => ({
          id: e.id,
          type: e.evidenceType,
          title: e.title,
          summary: e.summary,
          linkedPaths: e.linkedPaths,
          linkedBlockTypes: e.linkedBlockTypes,
          confidence: e.confidence,
          isActive: e.isActive,
          sourceUrl: e.sourceUrl,
          sourceLabel: e.sourceLabel,
          createdBy: e.createdBy,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        })),
        assumptions: projectAssumptions.map(a => ({
          id: a.id,
          statement: a.statement,
          scope: a.scope,
          scopeRef: a.scopeRef,
          sensitivity: a.sensitivity,
          linkedPaths: a.linkedPaths,
          linkedBlockTypes: a.linkedBlockTypes,
          status: a.status,
          evidenceId: a.evidenceId,
          validatedBy: a.validatedBy,
          validatedAt: a.validatedAt,
          createdBy: a.createdBy,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
        pendingPatches: pendingPatches.map(p => ({
          id: p.id,
          blockType: p.blockType,
          fieldPath: p.fieldPath,
          operation: p.operation,
          value: p.value,
          proposedBy: p.proposedBy,
          createdAt: p.createdAt,
        })),
        moduleRegistry: MODULE_REGISTRY,
      });
    } catch (error: any) {
      console.error('Project state fetch error:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch project state' });
    }
  });

  // POST /api/projects/:id/patch - Propose patches
  app.post('/api/projects/:id/patch', async (req, res) => {
    try {
      const { id: projectId } = req.params;
      
      // Validate request body
      const parseResult = proposePatchRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: 'Invalid patch request',
          errors: parseResult.error.errors,
        });
      }

      const { patches, actor, actorId, explanation } = parseResult.data;

      // Verify project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      // Create agent action log entry if actor is agent
      let agentActionId: string | undefined;
      if (actor === 'agent') {
        const action = await storage.createAgentAction({
          projectId,
          actionType: 'propose_patch',
          actionStatus: 'proposed',
          actor,
          actorId,
          proposedPatch: { patches },
          explanation,
        });
        agentActionId = action.id;
      }

      // Create patch records
      const createdPatches = await Promise.all(
        patches.map(async (patch) => {
          // Get current value if updating existing block
          let previousValue: any = null;
          if (patch.blockType) {
            const block = await storage.getInfoBlock(projectId, patch.blockType);
            if (block?.blockStateJson) {
              // Navigate to the field path to get previous value
              const pathParts = patch.path.split('.');
              let current: any = block.blockStateJson;
              for (const part of pathParts) {
                if (current && typeof current === 'object') {
                  current = current[part];
                } else {
                  current = undefined;
                  break;
                }
              }
              previousValue = current;
            }
          }

          const patchData: InsertProjectPatch = {
            projectId,
            blockType: patch.blockType,
            fieldPath: patch.path,
            operation: patch.operation,
            value: patch.value,
            previousValue,
            status: patch.status === 'confirmed' ? 'applied' : 'pending',
            evidenceRefs: patch.evidenceRefs || [],
            proposedBy: actor,
            proposedByAgentId: actor === 'agent' ? actorId : undefined,
            agentActionId,
          };

          return storage.createPatch(patchData);
        })
      );

      // If patches are confirmed, apply them immediately
      const confirmedPatches = patches.filter(p => p.status === 'confirmed');
      if (confirmedPatches.length > 0) {
        const patchIds = createdPatches
          .filter(p => p.status === 'applied')
          .map(p => p.id);
        
        // Apply each confirmed patch
        for (const patch of createdPatches.filter(p => p.status === 'applied')) {
          if (patch.blockType) {
            await applyPatchToBlock(projectId, patch.blockType, patch.fieldPath, patch.operation, patch.value, actor);
          }
        }
      }

      res.json({
        success: true,
        patches: createdPatches.map(p => ({
          id: p.id,
          blockType: p.blockType,
          fieldPath: p.fieldPath,
          operation: p.operation,
          status: p.status,
        })),
        agentActionId,
      });
    } catch (error: any) {
      console.error('Patch creation error:', error);
      res.status(500).json({ message: error.message || 'Failed to create patches' });
    }
  });

  // POST /api/projects/:id/apply - Apply pending patches
  app.post('/api/projects/:id/apply', async (req, res) => {
    try {
      const { id: projectId } = req.params;
      
      // Validate request body
      const parseResult = applyPatchRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: 'Invalid apply request',
          errors: parseResult.error.errors,
        });
      }

      const { patchIds, actor, actorId } = parseResult.data;

      // Get patches to apply
      const patches = await storage.getPatchesByIds(patchIds);
      if (patches.length === 0) {
        return res.status(404).json({ message: 'No patches found' });
      }

      // Verify all patches belong to this project
      const invalidPatches = patches.filter(p => p.projectId !== projectId);
      if (invalidPatches.length > 0) {
        return res.status(400).json({ message: 'Some patches do not belong to this project' });
      }

      // Apply each patch
      const results: { patchId: string; success: boolean; error?: string }[] = [];
      
      for (const patch of patches) {
        try {
          if (patch.status !== 'pending') {
            results.push({ patchId: patch.id, success: false, error: 'Patch already processed' });
            continue;
          }

          if (patch.blockType) {
            await applyPatchToBlock(
              projectId, 
              patch.blockType as InfoBlockType, 
              patch.fieldPath, 
              patch.operation as 'set' | 'merge' | 'append' | 'remove', 
              patch.value, 
              actor
            );
          }

          // Update patch status
          await storage.updatePatch(patch.id, {
            status: 'applied',
            appliedBy: actor,
            appliedAt: new Date(),
          });

          // Update agent action if applicable
          if (patch.agentActionId) {
            await storage.updateAgentAction(patch.agentActionId, {
              actionStatus: 'accepted',
              appliedPatch: { patchId: patch.id, fieldPath: patch.fieldPath, value: patch.value },
            });
          }

          results.push({ patchId: patch.id, success: true });
        } catch (err: any) {
          results.push({ patchId: patch.id, success: false, error: err.message });
        }
      }

      res.json({
        success: results.every(r => r.success),
        results,
      });
    } catch (error: any) {
      console.error('Patch apply error:', error);
      res.status(500).json({ message: error.message || 'Failed to apply patches' });
    }
  });

  // POST /api/projects/:id/reject - Reject pending patches
  app.post('/api/projects/:id/reject', async (req, res) => {
    try {
      const { id: projectId } = req.params;
      const { patchIds, reason } = req.body;

      if (!patchIds || !Array.isArray(patchIds)) {
        return res.status(400).json({ message: 'patchIds array is required' });
      }

      const patches = await storage.getPatchesByIds(patchIds);
      
      // Filter to only patches belonging to this project
      const projectPatches = patches.filter(p => p.projectId === projectId);
      let rejectedCount = 0;
      
      for (const patch of projectPatches) {
        // Only reject pending patches
        if (patch.status !== 'pending') continue;
        
        await storage.updatePatch(patch.id, { status: 'rejected' });
        rejectedCount++;
        
        if (patch.agentActionId) {
          await storage.updateAgentAction(patch.agentActionId, {
            actionStatus: 'rejected',
            userFeedback: reason,
          });
        }
      }

      res.json({ success: true, rejectedCount });
    } catch (error: any) {
      console.error('Patch reject error:', error);
      res.status(500).json({ message: error.message || 'Failed to reject patches' });
    }
  });

  // GET /api/projects/:id/actions - Get agent action log
  app.get('/api/projects/:id/actions', async (req, res) => {
    try {
      const { id: projectId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const actions = await storage.getAgentActions(projectId, limit);

      res.json({
        actions: actions.map(a => ({
          id: a.id,
          actionType: a.actionType,
          actionStatus: a.actionStatus,
          actor: a.actor,
          actorId: a.actorId,
          targetBlockType: a.targetBlockType,
          targetFieldPath: a.targetFieldPath,
          explanation: a.explanation,
          createdAt: a.createdAt,
        })),
      });
    } catch (error: any) {
      console.error('Action log fetch error:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch action log' });
    }
  });

  // PUT /api/projects/:id/blocks/:blockType - Update a specific block
  app.put('/api/projects/:id/blocks/:blockType', async (req, res) => {
    try {
      const { id: projectId, blockType } = req.params;
      const { data, status, actor = 'user' } = req.body;

      if (!['funder_selection', 'site_explorer', 'impact_model', 'operations', 'business_model'].includes(blockType)) {
        return res.status(400).json({ message: 'Invalid block type' });
      }

      // Validate data against block schema if provided
      if (data) {
        const schema = BLOCK_SCHEMAS[blockType as keyof typeof BLOCK_SCHEMAS];
        if (schema) {
          const parseResult = schema.safeParse(data);
          if (!parseResult.success) {
            return res.status(400).json({
              message: 'Invalid block data',
              errors: parseResult.error.errors,
            });
          }
        }
      }

      const block = await storage.upsertInfoBlock(projectId, blockType as InfoBlockType, {
        blockStateJson: data,
        status: status || 'DRAFT',
        updatedBy: actor,
        completionPercent: calculateBlockCompletion(blockType as InfoBlockType, data),
      });

      res.json({
        id: block.id,
        blockType: block.blockType,
        status: block.status,
        completionPercent: block.completionPercent,
        version: block.version,
        updatedAt: block.updatedAt,
      });
    } catch (error: any) {
      console.error('Block update error:', error);
      res.status(500).json({ message: error.message || 'Failed to update block' });
    }
  });

  // POST /api/projects/:id/evidence - Add evidence record
  app.post('/api/projects/:id/evidence', async (req, res) => {
    try {
      const { id: projectId } = req.params;
      const { type, title, summary, sourceUrl, sourceLabel, linkedPaths, linkedBlockTypes, confidence, payloadJson } = req.body;

      if (!type || !title) {
        return res.status(400).json({ message: 'type and title are required' });
      }

      const record = await storage.createEvidenceRecord({
        projectId,
        evidenceType: type,
        title,
        summary,
        sourceUrl,
        sourceLabel,
        linkedPaths: linkedPaths || [],
        linkedBlockTypes: linkedBlockTypes || [],
        confidence: confidence || 'MEDIUM',
        payloadJson,
        createdBy: 'user',
      });

      res.json({
        id: record.id,
        type: record.evidenceType,
        title: record.title,
        createdAt: record.createdAt,
      });
    } catch (error: any) {
      console.error('Evidence creation error:', error);
      res.status(500).json({ message: error.message || 'Failed to create evidence' });
    }
  });

  // POST /api/projects/:id/assumptions - Add assumption
  app.post('/api/projects/:id/assumptions', async (req, res) => {
    try {
      const { id: projectId } = req.params;
      const { statement, scope, scopeRef, sensitivity, linkedPaths, linkedBlockTypes, evidenceId } = req.body;

      if (!statement) {
        return res.status(400).json({ message: 'statement is required' });
      }

      const assumption = await storage.createAssumption({
        projectId,
        statement,
        scope: scope || 'project',
        scopeRef,
        sensitivity: sensitivity || 'medium',
        linkedPaths: linkedPaths || [],
        linkedBlockTypes: linkedBlockTypes || [],
        evidenceId,
        createdBy: 'user',
      });

      res.json({
        id: assumption.id,
        statement: assumption.statement,
        scope: assumption.scope,
        createdAt: assumption.createdAt,
      });
    } catch (error: any) {
      console.error('Assumption creation error:', error);
      res.status(500).json({ message: error.message || 'Failed to create assumption' });
    }
  });

  registerAgentRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to apply a patch to a block with defensive cloning
async function applyPatchToBlock(
  projectId: string,
  blockType: InfoBlockType,
  fieldPath: string,
  operation: 'set' | 'merge' | 'append' | 'remove',
  value: any,
  actor: 'user' | 'agent' | 'system'
): Promise<void> {
  const block = await storage.getInfoBlock(projectId, blockType);
  // Deep clone to avoid mutating the original object
  const currentData = JSON.parse(JSON.stringify(block?.blockStateJson || {}));

  // Navigate to the field and apply the operation
  const pathParts = fieldPath.split('.');
  let target: any = currentData;
  
  // Navigate to parent of target field, creating intermediate objects as needed
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!(part in target) || typeof target[part] !== 'object' || target[part] === null) {
      target[part] = {};
    }
    target = target[part];
  }

  const lastPart = pathParts[pathParts.length - 1];

  try {
    switch (operation) {
      case 'set':
        target[lastPart] = value;
        break;
      case 'merge':
        if (typeof target[lastPart] === 'object' && !Array.isArray(target[lastPart]) && typeof value === 'object' && !Array.isArray(value)) {
          target[lastPart] = { ...target[lastPart], ...value };
        } else {
          target[lastPart] = value;
        }
        break;
      case 'append':
        if (Array.isArray(target[lastPart])) {
          target[lastPart] = [...target[lastPart], value];
        } else if (target[lastPart] === undefined || target[lastPart] === null) {
          target[lastPart] = [value];
        } else {
          // Convert existing value to array and append
          target[lastPart] = [target[lastPart], value];
        }
        break;
      case 'remove':
        if (Array.isArray(target[lastPart])) {
          const index = target[lastPart].findIndex((item: any) => 
            JSON.stringify(item) === JSON.stringify(value)
          );
          if (index > -1) {
            target[lastPart] = [
              ...target[lastPart].slice(0, index),
              ...target[lastPart].slice(index + 1)
            ];
          }
        } else {
          delete target[lastPart];
        }
        break;
    }
  } catch (err) {
    console.error(`Failed to apply ${operation} to ${fieldPath}:`, err);
    throw new Error(`Cannot apply ${operation} operation to field ${fieldPath}`);
  }

  // Preserve existing block status unless explicitly changed
  const existingStatus = block?.status || 'DRAFT';

  // Save updated block
  await storage.upsertInfoBlock(projectId, blockType, {
    blockStateJson: currentData,
    status: existingStatus === 'NOT_STARTED' ? 'DRAFT' : existingStatus,
    updatedBy: actor,
    completionPercent: calculateBlockCompletion(blockType, currentData),
  });
}

// Helper to get nested value from object using dot path
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

// Helper function to calculate block completion percentage with nested path support
function calculateBlockCompletion(blockType: InfoBlockType, data: any): number {
  if (!data || Object.keys(data).length === 0) return 0;

  const registry = MODULE_REGISTRY[blockType];
  if (!registry) return 0;

  let totalFields = 0;
  let filledFields = 0;

  for (const section of registry.sections) {
    for (const field of section.fields) {
      totalFields++;
      // Support nested paths like 'questionnaire.projectName'
      const value = getNestedValue(data, field);
      if (value !== undefined && value !== null && value !== '' && 
          !(Array.isArray(value) && value.length === 0) &&
          !(typeof value === 'object' && Object.keys(value).length === 0)) {
        filledFields++;
      }
    }
  }

  return totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
}
