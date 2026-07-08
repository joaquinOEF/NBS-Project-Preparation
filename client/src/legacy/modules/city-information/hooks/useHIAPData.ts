import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/core/lib/queryClient';
import { HIAPData } from '../types/city-info';

async function getHIAPData(
  inventoryId: string,
  actionType: 'mitigation' | 'adaptation',
  language: string,
  ignoreExisting?: boolean
): Promise<{ data: HIAPData }> {
  const params = new URLSearchParams({
    actionType,
    lng: language,
  });

  if (ignoreExisting !== undefined) {
    params.append('ignoreExisting', ignoreExisting.toString());
  }

  const res = await apiRequest(
    'GET',
    `/api/citycatalyst/inventory/${inventoryId}/hiap?${params.toString()}`
  );
  return await res.json();
}

export function useHIAPData(
  inventoryId: string | undefined,
  actionType: 'mitigation' | 'adaptation',
  language: string = 'en',
  ignoreExisting?: boolean
) {
  return useQuery({
    queryKey: [
      '/api/citycatalyst/inventory',
      inventoryId,
      'hiap',
      actionType,
      language,
      ignoreExisting,
    ],
    queryFn: () =>
      getHIAPData(inventoryId!, actionType, language, ignoreExisting),
    enabled: !!inventoryId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
