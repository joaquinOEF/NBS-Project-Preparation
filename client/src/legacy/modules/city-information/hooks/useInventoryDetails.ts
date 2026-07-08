import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/core/lib/queryClient';

export interface InventoryDetails {
  inventoryId: string;
  inventoryName: string;
  year: number;
  totalEmissions: number | null;
  cityId: string;
  totalCountryEmissions: number | null;
  isPublic: boolean;
  publishedAt: string | null;
  inventoryType: string;
  globalWarmingPotentialType: string;
  lastUpdated: string;
  created: string;
  city: {
    cityId: string;
    locode: string;
    name: string;
    shape: any;
    country: string;
    region: string;
    countryLocode: string;
    regionLocode: string;
    area: string;
    projectId: string;
    created: string;
    last_updated: string;
    project: {
      projectId: string;
      name: string;
      organizationId: string;
    };
  };
}

export interface InventoryValue {
  id: string;
  gpcReferenceNumber: string;
  activityUnits: string | null;
  activityValue: string | null;
  co2eq: string;
  co2eqYears: number;
  unavailableReason: string | null;
  unavailableExplanation: string | null;
  inputMethodology: string | null;
  sectorId: string;
  subSectorId: string;
  subCategoryId: string;
  inventoryId: string;
  datasourceId: string | null;
  created: string;
  last_updated: string;
  activityValues: any[];
  dataSource: {
    datasourceId: string;
    sourceType: string;
    datasetName: {
      [key: string]: string;
    };
    datasourceName: string;
    dataQuality: string;
  } | null;
  subSector: {
    subsectorId: string;
    subsectorName: string;
  };
}

export interface InventoryDetailsDownload extends InventoryDetails {
  last_updated: string;
  inventoryValues: InventoryValue[];
}

async function getInventoryDetails(
  inventoryId: string
): Promise<{ data: InventoryDetails }> {
  const res = await apiRequest(
    'GET',
    `/api/citycatalyst/inventory/${inventoryId}`
  );
  return await res.json();
}

async function getInventoryDetailsDownload(
  inventoryId: string
): Promise<{ data: InventoryDetailsDownload }> {
  const res = await apiRequest(
    'GET',
    `/api/citycatalyst/inventory/${inventoryId}/download`
  );
  return await res.json();
}

export function useInventoryDetails(inventoryId: string | undefined) {
  return useQuery({
    queryKey: ['/api/citycatalyst/inventory', inventoryId],
    queryFn: () => getInventoryDetails(inventoryId!),
    enabled: !!inventoryId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useInventoryDetailsDownload(inventoryId: string | undefined) {
  return useQuery({
    queryKey: ['/api/citycatalyst/inventory', inventoryId, 'download'],
    queryFn: () => getInventoryDetailsDownload(inventoryId!),
    enabled: !!inventoryId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
