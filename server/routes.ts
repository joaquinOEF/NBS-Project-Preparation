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
      const project = await storage.createProject({
        actionId,
        actionName,
        actionDescription,
        actionType,
        cityId,
        status: 'initiated',
      });
      res.json({ project });
    } catch (error) {
      console.error('Create project error:', error);
      res.status(500).json({ message: 'Failed to create project' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
