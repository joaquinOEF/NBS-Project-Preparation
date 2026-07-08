import { useQuery } from '@tanstack/react-query';
import {
  getCityDetail,
  getInventory,
  getCityBoundary,
} from '../services/cityInfoService';

export function useCityDetail(locode: string) {
  return useQuery({
    queryKey: ['/api/citycatalyst/city', locode],
    queryFn: () => getCityDetail(locode),
    enabled: !!locode,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useInventory(locode: string, year: number) {
  return useQuery({
    queryKey: ['/api/citycatalyst/city', locode, 'inventory', year],
    queryFn: () => getInventory(locode, year),
    enabled: !!locode && !!year,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useCityBoundary(locode: string) {
  return useQuery({
    queryKey: ['/api/citycatalyst/city', locode, 'boundary'],
    queryFn: () => getCityBoundary(locode),
    enabled: !!locode,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
