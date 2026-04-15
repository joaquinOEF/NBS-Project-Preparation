import { Switch, Route } from 'wouter';
import { queryClient } from '@/core/lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/core/components/ui/toaster';
import { TooltipProvider } from '@/core/components/ui/tooltip';
import { SampleDataProvider } from '@/core/contexts/sample-data-context';
import { ProjectContextProvider } from '@/core/contexts/project-context';
import { ChatProvider, useChatState } from '@/core/contexts/chat-context';
import { RoleProvider } from '@/core/contexts/role-context';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Core pages
import Login from '@/core/pages/login';
import RoleSelectionPage from '@/core/pages/role-selection';
import OrchestratorLandingPage from '@/core/pages/orchestrator-landing';
import CitySelection from '@/core/pages/city-selection';
import ProjectPage from '@/core/pages/project';
import SiteExplorerPage from '@/core/pages/site-explorer';
import FunderSelectionPage from '@/core/pages/funder-selection';
import ProjectOperationsPage from '@/core/pages/project-operations';
import BusinessModelPage from '@/core/pages/business-model';
import ImpactModelPage from '@/core/pages/impact-model';
import ConceptNotePage from '@/core/pages/concept-note';
import CboProfilePage from '@/core/pages/cbo-profile';
import { OAuthCallback } from '@/core/components/auth/oauth-callback';
import NotFound from '@/core/pages/not-found';

// Dynamic module routing
import { DynamicModuleRoutes } from '@/core/routing/dynamic-routes';
import { ChatDrawer } from '@/core/components/agent/ChatDrawer';

function Router() {
  return (
    <Switch>
      <Route path='/' component={RoleSelectionPage} />
      <Route path='/login' component={Login} />
      <Route path='/orchestrator' component={OrchestratorLandingPage} />
      <Route path='/auth/callback' component={OAuthCallback} />
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

function AppLayout() {
  const { isChatOpen } = useChatState();
  
  return (
    <div className="flex min-h-screen">
      <div className={`flex-1 transition-all duration-300 ${isChatOpen ? 'mr-[400px]' : ''}`}>
        <Router />
      </div>
      <ChatDrawer />
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
