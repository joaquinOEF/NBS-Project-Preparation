import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/i18n'; // Initialize i18n
import { PostHogProvider } from 'posthog-js/react';
import { PostHogBoot } from '@/core/components/analytics/posthog-boot';
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
import { appTheme } from './app-theme';

// ⚠️ A tab opened before a deploy asks for code files the new build no longer
// has; the import fails and the page goes white (Ksa Rosa, 10 Nov 2026, during
// a Replit republish). Vite reports it as `vite:preloadError`: reload once to
// pick up the new build. The session flag stops a loop if the file is truly gone.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const key = 'cougar:reloaded-after-deploy';
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch { /* storage blocked: still reload once below */ }
  event.preventDefault();
  window.location.reload();
});

// Read PostHog environment variables
const PH_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const PH_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

// PostHog provider options (EU host + SPA pageviews)
const options = {
  api_host: PH_HOST,
  capture_pageview: false, // We'll handle this manually for better control
  capture_pageleave: true, // Track when users leave pages
  loaded: (posthog: any) => {
    if (import.meta.env.DEV) {
      console.log('PostHog loaded for development');
    }
  },
  bootstrap: {
    distinctID: undefined, // Let PostHog generate this
  },
};

// Only render with PostHog if API key is available
const AppWithAnalytics = PH_KEY ? (
  <PostHogProvider apiKey={PH_KEY} options={options}>
    <PostHogBoot />
    <App />
  </PostHogProvider>
) : (
  <App />
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChakraProvider value={appTheme}>{AppWithAnalytics}</ChakraProvider>
  </StrictMode>
);
