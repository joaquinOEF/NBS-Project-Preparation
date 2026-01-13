import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Header } from '@/core/components/layout/header';
import { CityCard } from '@/core/components/city/city-card';
import { HeadlineLarge, BodyMedium } from '@oef/components';
import { Badge } from '@/core/components/ui/badge';
import { useAuth } from '@/core/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { City } from '@/core/types/city';
import { useTranslation } from 'react-i18next';
import { analytics } from '@/core/lib/analytics';
import { useSampleData } from '@/core/contexts/sample-data-context';

export default function CitySelection() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const { isSampleMode, sampleCity } = useSampleData();

  useEffect(() => {
    analytics.navigation.pageViewed('City Selection');
  }, []);

  const { data: inventoriesData, isLoading: citiesLoading } = useQuery<{ data: any[] }>({
    queryKey: ['/api/citycatalyst/inventories'],
    staleTime: 5 * 60 * 1000,
    enabled: !isSampleMode,
  });

  if (!authLoading && !isAuthenticated && !isSampleMode) {
    setLocation('/login');
    return null;
  }

  const handleCitySelect = (cityId: string) => {
    const city = cities.find(c => c.id === cityId);
    if (city) {
      analytics.navigation.citySelected(cityId, city.name);
    }
    setLocation(`/city-information/${cityId}`);
  };

  let cities: City[] = [];

  if (isSampleMode) {
    cities = [
      {
        id: sampleCity.locode,
        cityId: sampleCity.cityId,
        name: sampleCity.name,
        country: sampleCity.country,
        locode: sampleCity.locode,
        projectId: 'sample-project',
        metadata: { inventoryCount: sampleCity.totalInventories },
        createdAt: new Date(),
      },
    ];
  } else {
    cities = (inventoriesData?.data || []).map((city: any) => {
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
      const prefix = city.locode.split(' ')[0];
      return {
        id: city.locode,
        cityId: city.locode,
        name: city.name,
        country: countryMap[prefix] || prefix,
        locode: city.locode,
        projectId: `project-${prefix.toLowerCase()}`,
        metadata: { inventoryCount: city.years.length },
        createdAt: new Date(),
      };
    });
  }

  const isLoading = authLoading || (!isSampleMode && citiesLoading);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-background'>
        <Header />
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
          <div className='mb-8'>
            <div className='h-8 w-48 bg-muted animate-pulse rounded mb-2'></div>
            <div className='h-4 w-96 bg-muted animate-pulse rounded'></div>
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            {[1, 2, 3].map(i => (
              <div key={i} className='border rounded-lg p-6'>
                <div className='space-y-3'>
                  <div className='h-4 bg-muted animate-pulse rounded'></div>
                  <div className='h-3 bg-muted animate-pulse rounded w-3/4'></div>
                  <div className='h-3 bg-muted animate-pulse rounded w-1/2'></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background'>
      <Header />

      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        <div className='mb-8'>
          <div className='flex items-center gap-3 mb-2'>
            <HeadlineLarge data-testid='text-page-title'>
              {t('citySelection.title')}
            </HeadlineLarge>
            {isSampleMode && (
              <Badge variant='secondary' data-testid='badge-sample-mode'>
                {t('citySelection.sampleDataBadge')}
              </Badge>
            )}
          </div>
          <BodyMedium data-testid='text-page-subtitle'>
            {t('citySelection.subtitle')}
          </BodyMedium>
        </div>

        <div
          className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
          data-testid='grid-cities'
        >
          {cities.map((city: City) => (
            <CityCard
              key={city.id}
              city={city}
              onSelect={handleCitySelect}
              isActive={true}
            />
          ))}
        </div>

        {cities.length === 0 && !isLoading && (
          <div className='text-center py-12'>
            <BodyMedium className='mb-4' data-testid='text-no-cities'>
              {t('citySelection.noCitiesAvailable')}
            </BodyMedium>
          </div>
        )}
      </div>
    </div>
  );
}
