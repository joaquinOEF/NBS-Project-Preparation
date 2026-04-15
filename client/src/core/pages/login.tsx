import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/core/components/ui/card';
import { CCTerraButton, TitleLarge, BodyMedium, BodySmall } from '@oef/components';
import { Button } from '@/core/components/ui/button';
import { useAuth } from '@/core/hooks/useAuth';
import { initiateOAuth } from '@/core/services/authService';
import { useToast } from '@/core/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { analytics } from '@/core/lib/analytics';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { ArrowRight, Database } from 'lucide-react';

export default function Login() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { setSampleMode } = useSampleData();

  // Only auto-redirect when the user is actually authenticated. We used to
  // also auto-redirect when `isSampleMode` was true, but since sample mode
  // persists in localStorage and can now be toggled from the role-selection
  // landing, that auto-redirect was hijacking anyone who came back to /login
  // intentionally (e.g. to sign in as a city after trying the CBO demo).
  // If the user wants sample data, the "Use Sample Data" button below still
  // sets sample mode and navigates explicitly.
  useEffect(() => {
    if (isAuthenticated) {
      setLocation('/cities');
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    analytics.navigation.pageViewed('Login');
  }, []);

  const handleOAuthLogin = async () => {
    try {
      analytics.auth.loginAttempt('oauth');
      const oauthResponse = await initiateOAuth();
      window.location.href = oauthResponse.authUrl;
    } catch (error: any) {
      analytics.auth.loginFailure(error.message || 'network_error', 'oauth');
      toast({
        title: t('errors.authenticationFailed'),
        description: error.message || t('errors.networkError'),
        variant: 'destructive',
      });
    }
  };

  const handleSampleLogin = () => {
    analytics.auth.loginAttempt('sample_data');
    analytics.auth.loginSuccess('sample_user', 'sample_data');
    setSampleMode(true);
    setLocation('/sample/cities');
  };

  if (isLoading) {
    return (
      <div className='min-h-screen bg-muted flex items-center justify-center'>
        <div className='h-8 w-24 bg-card animate-pulse rounded'></div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-muted flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
      <div className='max-w-md w-full space-y-8'>
        <Card>
          <CardContent className='p-8'>
            <div className='text-center'>
              <div className='mx-auto w-16 h-16 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg flex items-center justify-center mb-6 p-0 overflow-hidden'>
                <img
                  src='/poc-icon.png'
                  alt={t('header.iconAlt')}
                  className='w-16 h-16 object-cover'
                />
              </div>
              <TitleLarge className='mb-2' data-testid='text-login-title'>
                {t('login.title')}
              </TitleLarge>
              <BodyMedium className='mb-8' data-testid='text-login-subtitle'>
                {t('login.subtitle')}
              </BodyMedium>
            </div>

            <div className='space-y-4'>
              <CCTerraButton
                className='w-full'
                onClick={handleOAuthLogin}
                data-testid='button-oauth-login'
                variant='filled'
                leftIcon={<ArrowRight className='w-5 h-5' />}
              >
                {t('login.continueButton')}
              </CCTerraButton>

              <div className='relative'>
                <div className='absolute inset-0 flex items-center'>
                  <span className='w-full border-t' />
                </div>
                <div className='relative flex justify-center text-xs uppercase'>
                  <span className='bg-card px-2 text-muted-foreground'>
                    or
                  </span>
                </div>
              </div>

              <Button
                variant='outline'
                className='w-full'
                onClick={handleSampleLogin}
                data-testid='button-sample-login'
              >
                <Database className='w-4 h-4 mr-2' />
                {t('login.sampleButton')}
              </Button>
              <BodySmall className='text-center text-muted-foreground'>
                {t('login.sampleButtonDescription')}
              </BodySmall>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
