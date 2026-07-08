import { useEffect, useRef } from 'react';
import { Skeleton } from '@/core/components/ui/skeleton';
import { CityBoundary } from '../types/city-info';
import { MapPin } from 'lucide-react';

interface CityMapProps {
  boundary?: CityBoundary;
  isLoading: boolean;
  cityName: string;
}

export function CityMap({ boundary, isLoading, cityName }: CityMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  // Placeholder map component - can be enhanced with map library integration
  useEffect(() => {
    if (boundary && mapRef.current) {
      // Map initialization would go here
    }
  }, [boundary, cityName]);

  if (isLoading) {
    return (
      <div className='w-full h-96'>
        <Skeleton className='w-full h-full rounded-lg' />
      </div>
    );
  }

  if (!boundary) {
    return (
      <div className='w-full h-96 bg-muted rounded-lg flex items-center justify-center'>
        <div className='text-center'>
          <MapPin className='h-12 w-12 text-muted-foreground mx-auto mb-2' />
          <p className='text-sm text-muted-foreground'>
            Boundary data not available for {cityName}
          </p>
        </div>
      </div>
    );
  }

  // Placeholder map container
  return (
    <div
      ref={mapRef}
      className='w-full h-96 bg-muted rounded-lg flex items-center justify-center border'
      data-testid='city-map-container'
    >
      <div className='text-center'>
        <MapPin className='h-8 w-8 text-primary mx-auto mb-2' />
        <p className='text-sm font-medium'>{cityName}</p>
        <p className='text-xs text-muted-foreground'>
          Map will be displayed here
        </p>
      </div>
    </div>
  );
}
