import { useLocation } from 'wouter';

export function useSampleRoute() {
  const [location] = useLocation();
  
  const pathname = typeof window !== 'undefined' 
    ? new URL(window.location.href).pathname 
    : location;
  
  const isSampleRoute = pathname.startsWith('/sample/');
  const routePrefix = isSampleRoute ? '/sample' : '';
  
  return { isSampleRoute, routePrefix };
}
