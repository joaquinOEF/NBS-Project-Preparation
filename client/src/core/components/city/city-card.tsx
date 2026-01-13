import { Card, CardContent } from '@/core/components/ui/card';
import { TitleMedium, BodySmall, LabelSmall } from '@oef/components';
import { City } from '@/core/types/city';

interface CityCardProps {
  city: City;
  onSelect: (cityId: string) => void;
  isActive?: boolean;
}

export function CityCard({ city, onSelect, isActive = true }: CityCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        !isActive ? 'opacity-60' : ''
      }`}
      onClick={() => isActive && onSelect(city.locode || city.cityId)}
      data-testid={`card-city-${city.cityId}`}
    >
      <CardContent className='p-6'>
        <div className='space-y-2'>
          <TitleMedium data-testid={`text-city-name-${city.cityId}`}>
            {city.name}
          </TitleMedium>
          <BodySmall data-testid={`text-city-country-${city.cityId}`}>
            {city.country}
          </BodySmall>
          {city.locode && (
            <LabelSmall
              className='font-mono text-muted-foreground'
              data-testid={`text-city-locode-${city.cityId}`}
            >
              {city.locode}
            </LabelSmall>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
