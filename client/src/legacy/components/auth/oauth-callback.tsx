import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { handleOAuthCallback } from '@/core/services/authService';
import { extractOAuthParams } from '@/core/utils/oauth';
import { useToast } from '@/core/hooks/use-toast';
import { Spinner } from '@/core/components/ui/spinner';
import { TitleMedium, BodyMedium } from '@oef/components';
import { useAuth } from '@/core/hooks/useAuth';
import { analytics, identify } from '@/core/lib/analytics';

export function OAuthCallback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { refetch } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const { code, state, error } = extractOAuthParams();

      if (error) {
        analytics.auth.loginFailure(error, 'oauth');
        toast({
          title: 'Authentication Error',
          description: error,
          variant: 'destructive',
        });
        setLocation('/login');
        return;
      }

      if (!code || !state) {
        analytics.auth.loginFailure('missing_code_or_state', 'oauth');
        toast({
          title: 'Authentication Error',
          description: 'Missing authorization code or state',
          variant: 'destructive',
        });
        setLocation('/login');
        return;
      }

      try {
        const loginResponse = await handleOAuthCallback(code, state);
        await refetch(); // Refetch user profile

        // Track successful login and identify user
        analytics.auth.loginSuccess(
          loginResponse.user?.id || 'unknown',
          'oauth'
        );
        identify({
          id: loginResponse.user?.id || 'unknown',
          email: loginResponse.user?.email,
          name: loginResponse.user?.name,
        });

        toast({
          title: 'Welcome!',
          description: 'You have been successfully authenticated.',
        });
        setLocation('/cities');
      } catch (error: any) {
        console.error('OAuth callback error:', error);
        analytics.auth.loginFailure(error.message || 'callback_error', 'oauth');
        toast({
          title: 'Authentication Failed',
          description: error.message || 'Failed to complete authentication',
          variant: 'destructive',
        });
        setLocation('/login');
      }
    };

    handleCallback();
  }, [setLocation, toast, refetch]);

  return (
    <div className='min-h-screen bg-muted flex items-center justify-center'>
      <div className='text-center'>
        <Spinner className='w-8 h-8 mx-auto mb-4' />
        <TitleMedium className='mb-2'>Completing Authentication...</TitleMedium>
        <BodyMedium>Please wait while we process your login.</BodyMedium>
      </div>
    </div>
  );
}
