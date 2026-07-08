import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/core/lib/queryClient';
import { CCRADashboardData } from '../types/city-info';

async function getCCRADashboard(
  inventoryId: string
): Promise<{ data: CCRADashboardData }> {
  const res = await apiRequest(
    'GET',
    `/api/citycatalyst/inventory/${inventoryId}/ccra`
  );
  return await res.json();
}

export function useCCRADashboard(inventoryId: string | undefined) {
  return useQuery({
    queryKey: ['/api/citycatalyst/inventory', inventoryId, 'ccra'],
    queryFn: () => getCCRADashboard(inventoryId!),
    enabled: !!inventoryId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
