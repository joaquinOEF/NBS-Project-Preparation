import { useParams, Link } from 'wouter';
import { useMemo } from 'react';
import { Header } from '@/core/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { CCTerraButton } from '@oef/components';
import {
  DisplayLarge,
  HeadlineLarge,
  TitleMedium,
  BodyMedium,
  BodySmall,
} from '@oef/components';
import { Skeleton } from '@/core/components/ui/skeleton';
import { useCityInformation } from '../hooks/useCityInformation';
import { HIAPActionsModal } from '../components/hiap-actions-modal';
import {
  MapPin,
  Globe,
  ArrowLeft,
  Shield,
  Leaf,
  HeartHandshake,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSampleData, SAMPLE_HIAP_MITIGATION_DATA, SAMPLE_HIAP_ADAPTATION_DATA } from '@/core/contexts/sample-data-context';

export default function CityInformation() {
  const { cityId } = useParams<{ cityId: string }>();
  const { t } = useTranslation();
  const { isSampleMode, sampleCity } = useSampleData();

  const { data: cityInfo, isLoading, error } = useCityInformation(cityId, !isSampleMode);

  const latestInventory = useMemo(() => {
    if (isSampleMode) {
      return sampleCity.years[0];
    }
    if (!cityInfo?.data?.years || cityInfo.data.years.length === 0) return null;
    return [...cityInfo.data.years].sort(
      (a, b) => (b.year || 0) - (a.year || 0)
    )[0];
  }, [cityInfo?.data?.years, isSampleMode, sampleCity]);

  const city = isSampleMode ? sampleCity : cityInfo?.data;
  const showLoading = !isSampleMode && isLoading;
  const showError = !isSampleMode && (error || !cityInfo);

  if (showLoading) {
    return (
      <div className='min-h-screen bg-background'>
        <Header />
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
          <div className='space-y-6'>
            <Skeleton className='h-8 w-64' />
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <Skeleton className='h-48' />
              <Skeleton className='h-48' />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showError) {
    return (
      <div className='min-h-screen bg-background'>
        <Header />
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
          <div className='mb-6'>
            <Link href='/cities'>
              <CCTerraButton
                variant='text'
                className='mb-4'
                data-testid='button-back-to-cities'
              >
                <ArrowLeft className='h-4 w-4 mr-2' />
                {t('cityInfo.backToCities')}
              </CCTerraButton>
            </Link>
          </div>
          <Card>
            <CardContent className='pt-6'>
              <div className='text-center'>
                <TitleMedium className='mb-2'>
                  {t('cityInfo.errorLoadingCity')}
                </TitleMedium>
                <BodyMedium>
                  {t('cityInfo.failedToLoadCity')}: {cityId}
                </BodyMedium>
                {error && (
                  <BodySmall className='mt-2'>
                    {error instanceof Error
                      ? error.message
                      : t('cityInfo.unknownError')}
                  </BodySmall>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background'>
      <Header />

      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        <div className='mb-6'>
          <Link href='/cities'>
            <CCTerraButton
              variant='text'
              className='mb-4'
              data-testid='button-back-to-cities'
            >
              <ArrowLeft className='h-4 w-4 mr-2' />
              {t('cityInfo.backToCities')}
            </CCTerraButton>
          </Link>
        </div>

        <div className='mb-8'>
          <div className='flex items-center gap-3 mb-2'>
            <DisplayLarge data-testid='text-city-name'>
              {city?.name}
            </DisplayLarge>
            {isSampleMode && (
              <Badge variant='secondary' data-testid='badge-sample-mode'>
                {t('citySelection.sampleDataBadge')}
              </Badge>
            )}
          </div>
          <div className='flex flex-wrap gap-4 items-center text-muted-foreground'>
            <div className='flex items-center gap-2'>
              <Globe className='h-4 w-4' />
              <span data-testid='text-city-country'>{city?.country}</span>
            </div>
            <div className='flex items-center gap-2'>
              <MapPin className='h-4 w-4' />
              <span data-testid='text-city-locode'>{city?.locode}</span>
            </div>
          </div>
        </div>

        {isSampleMode && (
          <div className='mb-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-3'>
            <AlertCircle className='h-5 w-5 text-blue-600' />
            <BodySmall className='text-blue-700 dark:text-blue-300'>
              {t('cityInfo.sampleDataNotice')}
            </BodySmall>
          </div>
        )}

        {latestInventory && (
          <div className='mb-8'>
            <div className='flex items-center gap-2 mb-6'>
              <HeartHandshake className='h-5 w-5' />
              <HeadlineLarge>
                {t('cityInfo.climateActions')}
              </HeadlineLarge>
              <Badge variant='outline' data-testid='badge-hiap-year'>
                {latestInventory.year || 'N/A'}
              </Badge>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <HIAPActionsModal
                inventoryId={latestInventory.inventoryId}
                actionType='mitigation'
                title={t('cityInfo.mitigationActions')}
                description={t('cityInfo.mitigationDescription')}
                isSampleMode={isSampleMode}
                sampleData={SAMPLE_HIAP_MITIGATION_DATA}
                trigger={
                  <Card
                    className='cursor-pointer hover:shadow-md transition-shadow'
                    data-testid='card-mitigation-actions'
                  >
                    <CardHeader>
                      <CardTitle className='flex items-center gap-2'>
                        <Leaf className='h-5 w-5 text-green-600' />
                        {t('cityInfo.mitigationActions')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className='text-sm text-muted-foreground mb-4'>
                        {t('cityInfo.mitigationCardDescription')}
                      </p>
                      <div className='flex items-center text-sm text-primary font-medium'>
                        {t('cityInfo.viewActions')}
                        <ArrowLeft className='h-4 w-4 ml-2 rotate-180' />
                      </div>
                    </CardContent>
                  </Card>
                }
              />

              <HIAPActionsModal
                inventoryId={latestInventory.inventoryId}
                actionType='adaptation'
                title={t('cityInfo.adaptationActions')}
                description={t('cityInfo.adaptationDescription')}
                isSampleMode={isSampleMode}
                sampleData={SAMPLE_HIAP_ADAPTATION_DATA}
                trigger={
                  <Card
                    className='cursor-pointer hover:shadow-md transition-shadow'
                    data-testid='card-adaptation-actions'
                  >
                    <CardHeader>
                      <CardTitle className='flex items-center gap-2'>
                        <Shield className='h-5 w-5 text-blue-600' />
                        {t('cityInfo.adaptationActions')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className='text-sm text-muted-foreground mb-4'>
                        {t('cityInfo.adaptationCardDescription')}
                      </p>
                      <div className='flex items-center text-sm text-primary font-medium'>
                        {t('cityInfo.viewActions')}
                        <ArrowLeft className='h-4 w-4 ml-2 rotate-180' />
                      </div>
                    </CardContent>
                  </Card>
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
