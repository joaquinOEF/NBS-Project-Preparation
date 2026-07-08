import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/core/lib/queryClient';

export interface CityInformation {
  locode: string;
  name: string;
  country: string;
  locodePrefix: string;
  totalInventories: number;
  availableYears: number[];
  latestUpdate: number | null;
  years: Array<{
    year: number;
    inventoryId: string;
    lastUpdate: string;
  }>;
  inventories: any[];
}

async function getCityInformation(
  cityId: string
): Promise<{ data: CityInformation }> {
  const res = await apiRequest('GET', `/api/city-information/${cityId}`);
  return await res.json();
}

export function useCityInformation(cityId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['/api/city-information', cityId],
    queryFn: () => getCityInformation(cityId!),
    enabled: !!cityId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}
