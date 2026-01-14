import { Switch, Route } from 'wouter';
import { queryClient } from '@/core/lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/core/components/ui/toaster';
import { TooltipProvider } from '@/core/components/ui/tooltip';
import { CityCatalystTab } from '@/core/components/layout/citycatalyst-tab';
import { SampleDataProvider } from '@/core/contexts/sample-data-context';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Core pages
import Login from '@/core/pages/login';
import CitySelection from '@/core/pages/city-selection';
import ProjectPage from '@/core/pages/project';
import SiteExplorerPage from '@/core/pages/site-explorer';
import FunderSelectionPage from '@/core/pages/funder-selection';
import ProjectOperationsPage from '@/core/pages/project-operations';
import { OAuthCallback } from '@/core/components/auth/oauth-callback';
import NotFound from '@/core/pages/not-found';

// Dynamic module routing
import { DynamicModuleRoutes } from '@/core/routing/dynamic-routes';

function Router() {
  return (
    <Switch>
      <Route path='/' component={Login} />
      <Route path='/login' component={Login} />
      <Route path='/auth/callback' component={OAuthCallback} />
      <Route path='/cities' component={CitySelection} />
      <Route path='/project/:projectId' component={ProjectPage} />
      
      {/* Site Explorer routes */}
      <Route path='/site-explorer/:projectId' component={SiteExplorerPage} />
      
      {/* Funder Selection routes */}
      <Route path='/funder-selection/:projectId' component={FunderSelectionPage} />
      
      {/* Project Operations routes */}
      <Route path='/project-operations/:projectId' component={ProjectOperationsPage} />
      
      {/* Sample mode routes - no API calls, uses local data */}
      <Route path='/sample/cities' component={CitySelection} />
      <Route path='/sample/project/:projectId' component={ProjectPage} />
      <Route path='/sample/site-explorer/:projectId' component={SiteExplorerPage} />
      <Route path='/sample/funder-selection/:projectId' component={FunderSelectionPage} />
      <Route path='/sample/project-operations/:projectId' component={ProjectOperationsPage} />

      {/* Dynamically loaded module routes */}
      <DynamicModuleRoutes />

      <Route component={NotFound} />
    </Switch>
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
        <TooltipProvider>
          <Toaster />
          <Router />
          <CityCatalystTab />
        </TooltipProvider>
      </SampleDataProvider>
    </QueryClientProvider>
  );
}

export default App;
