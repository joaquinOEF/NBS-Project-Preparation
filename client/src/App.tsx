import { Switch, Route, useLocation } from 'wouter';
import { queryClient } from '@/core/lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/core/components/ui/toaster';
import { TooltipProvider } from '@/core/components/ui/tooltip';
import { SampleDataProvider } from '@/core/contexts/sample-data-context';
import { ProjectContextProvider } from '@/core/contexts/project-context';
import { ChatProvider, useChatState } from '@/core/contexts/chat-context';
import { RoleProvider } from '@/core/contexts/role-context';
import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

// Route-level code splitting (audit item DC-3): every page loads its own
// chunk on first navigation instead of riding in the entry bundle. Before
// this, the entry was ~722 kB gzip — site-explorer's STATIC leaflet import
// alone dragged the whole map stack into first paint, defeating the
// workshop's carefully lazy-loaded MapMicroapp — on a phone-first product.
// The landing gate stays EAGER: it is the first paint for every visitor and
// must never flash a route spinner.
import RoleSelectionPage from '@/core/pages/role-selection';
import NotFound from '@/core/pages/not-found';

const Login = lazy(() => import('@/core/pages/login'));
const OrchestratorLandingPage = lazy(() => import('@/core/pages/orchestrator-landing'));
const CoordinatorLoginPage = lazy(() => import('@/core/pages/coordinator-login'));
const CitySelection = lazy(() => import('@/core/pages/city-selection'));
const ProjectPage = lazy(() => import('@/core/pages/project'));
const SiteExplorerPage = lazy(() => import('@/core/pages/site-explorer'));
const FunderSelectionPage = lazy(() => import('@/core/pages/funder-selection'));
const ProjectOperationsPage = lazy(() => import('@/core/pages/project-operations'));
const BusinessModelPage = lazy(() => import('@/core/pages/business-model'));
const ImpactModelPage = lazy(() => import('@/core/pages/impact-model'));
const ConceptNotePage = lazy(() => import('@/core/pages/concept-note'));
const CboProfilePage = lazy(() => import('@/core/pages/cbo-profile'));
// Named exports — lazy() wants a default, so remap.
const OAuthCallback = lazy(() =>
  import('@/core/components/auth/oauth-callback').then(m => ({ default: m.OAuthCallback })),
);
const ChatDrawer = lazy(() =>
  import('@/core/components/agent/ChatDrawer').then(m => ({ default: m.ChatDrawer })),
);

// Dynamic module routing
import { DynamicModuleRoutes } from '@/core/routing/dynamic-routes';

// Route-chunk loading state. Brief (chunks are small and cached after first
// hit) — a centered spinner, no layout shift.
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path='/' component={RoleSelectionPage} />
      <Route path='/login' component={Login} />
      <Route path='/coordinator-login' component={CoordinatorLoginPage} />
      <Route path='/orchestrator' component={OrchestratorLandingPage} />
      <Route path='/auth/callback' component={OAuthCallback} />
      {/* City view is hidden from the landing (no role card) but stays reachable
          by direct URL. /city is the memorable entry; /cities kept for existing links. */}
      <Route path='/city' component={CitySelection} />
      <Route path='/cities' component={CitySelection} />
      <Route path='/project/:projectId' component={ProjectPage} />
      
      {/* Site Explorer routes */}
      <Route path='/site-explorer/:projectId' component={SiteExplorerPage} />
      
      {/* Funder Selection routes */}
      <Route path='/funder-selection/:projectId' component={FunderSelectionPage} />
      
      {/* Project Operations routes */}
      <Route path='/project-operations/:projectId' component={ProjectOperationsPage} />
      
      {/* Business Model routes */}
      <Route path='/business-model/:projectId' component={BusinessModelPage} />
      
      {/* Impact Model routes */}
      <Route path='/impact-model/:projectId' component={ImpactModelPage} />

      {/* Concept Note — split-screen agent + document editor */}
      <Route path='/concept-note' component={ConceptNotePage} />
      <Route path='/cbo-profile' component={CboProfilePage} />
      
      {/* Sample mode routes - no API calls, uses local data */}
      <Route path='/sample/cities' component={CitySelection} />
      <Route path='/sample/project/:projectId' component={ProjectPage} />
      <Route path='/sample/site-explorer/:projectId' component={SiteExplorerPage} />
      <Route path='/sample/funder-selection/:projectId' component={FunderSelectionPage} />
      <Route path='/sample/project-operations/:projectId' component={ProjectOperationsPage} />
      <Route path='/sample/business-model/:projectId' component={BusinessModelPage} />
      <Route path='/sample/impact-model/:projectId' component={ImpactModelPage} />

      {/* Dynamically loaded module routes */}
      <DynamicModuleRoutes />

      <Route component={NotFound} />
    </Switch>
  );
}

// The floating chat button + drawer is the CITY project agent (it talks to
// /api/projects/:id/agent/*). It only belongs on the legacy project surfaces:
// the project hub + the 5 module pages (and their /sample variants). Mounted
// globally it leaked onto the CBO chat and the orchestrator console — sample
// mode gives it a projectId anywhere, so its button rendered there too
// (audit item DC-7; full move into the legacy pages comes with the
// quarantine wave).
const LEGACY_AGENT_ROUTES =
  /^\/(sample\/)?(project|site-explorer|funder-selection|project-operations|business-model|impact-model|city-information)(\/|$)/;

function AppLayout() {
  const { isChatOpen } = useChatState();
  const [location] = useLocation();
  const showAgentDrawer = LEGACY_AGENT_ROUTES.test(location);

  // Margin only applies while the drawer can actually render — isChatOpen
  // survives SPA navigation, and a stale 400px gutter would squeeze the
  // workshop views after leaving a legacy page with the drawer open.
  return (
    <div className="flex min-h-screen">
      <div className={`flex-1 min-w-0 transition-all duration-300 ${isChatOpen && showAgentDrawer ? 'mr-[400px]' : ''}`}>
        <Suspense fallback={<RouteFallback />}>
          <Router />
        </Suspense>
      </div>
      {/* Lazy + route-gated: the drawer chunk only ever downloads on legacy
          project pages. Suspense fallback null — it's a floating button, not
          page content. */}
      {showAgentDrawer && (
        <Suspense fallback={null}>
          <ChatDrawer />
        </Suspense>
      )}
    </div>
  );
}

function App() {
  const { i18n } = useTranslation();

  // Sync HTML lang attribute with current language for accessibility and SEO
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <QueryClientProvider client={queryClient}>
      <SampleDataProvider>
        <RoleProvider>
          <ProjectContextProvider>
            <ChatProvider>
              <TooltipProvider>
                <Toaster />
                <AppLayout />
              </TooltipProvider>
            </ChatProvider>
          </ProjectContextProvider>
        </RoleProvider>
      </SampleDataProvider>
    </QueryClientProvider>
  );
}

export default App;
