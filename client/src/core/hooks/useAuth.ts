import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { User, AuthState } from '@/core/types/auth';
import {
  getUserProfile,
  logout as logoutService,
} from '@/core/services/authService';

const SAMPLE_MODE_KEY = 'nbs_sample_mode';

function isSampleModeActive(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(SAMPLE_MODE_KEY) === 'true';
  }
  return false;
}

export function useAuth(): AuthState & {
  logout: () => Promise<void>;
  refetch: () => void;
  initiateCityCatalystAuth: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const [location] = useLocation();

  const {
    data: user,
    isLoading,
    refetch,
  } = useQuery<User | null>({
    queryKey: ['/api/user/profile'],
    queryFn: async () => {
      if (isSampleModeActive()) {
        return null;
      }
      try {
        const profile = await getUserProfile();
        return profile;
      } catch (error: any) {
        if (error.message.includes('401')) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    enabled: !isSampleModeActive(),
  });

  const logoutMutation = useMutation({
    mutationFn: logoutService,
    onSuccess: () => {
      queryClient.setQueryData(['/api/user/profile'], null);
      queryClient.clear();
    },
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hasRetryParam =
      urlParams.get('retry') || urlParams.get('clear_cache');

    if (hasRetryParam && !user && !isLoading && !isSampleModeActive()) {
      console.log(
        '🔄 Auto-retrying OAuth with fresh state due to single-use code error...'
      );

      const clearBrowserCache = () => {
        const newUrl = new URL(window.location.href);
        newUrl.search = '';
        newUrl.hash = '';
        window.history.replaceState({}, '', newUrl.toString());

        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('code_verifier');

        queryClient.clear();

        setTimeout(() => {
          console.log('✨ Initiating completely fresh OAuth flow...');
          initiateCityCatalystAuth();
        }, 100);
      };

      clearBrowserCache();
    }
  }, [user, isLoading, location, queryClient]);

  const initiateCityCatalystAuth = async () => {
    try {
      const response = await fetch('/api/auth/oauth/initiate');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Failed to initiate OAuth:', error);
    }
  };

  return {
    user: user || null,
    isLoading: isSampleModeActive() ? false : isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutateAsync,
    refetch,
    initiateCityCatalystAuth,
  };
}
