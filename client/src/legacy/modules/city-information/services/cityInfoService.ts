import { apiRequest } from '@/core/lib/queryClient';
import {
  CityCatalystCityDetail,
  CityCatalystInventoryData,
  CityBoundary,
  CityInventorySummary,
} from '../types/city-info';

/**
 * Get detailed city information including inventories list
 */
export async function getCityDetail(
  locode: string
): Promise<CityCatalystCityDetail> {
  const response = await apiRequest(
    'GET',
    `/api/citycatalyst/city/${encodeURIComponent(locode)}`
  );
  const result = await response.json();
  return result.data;
}

/**
 * Get inventory data for a specific city and year
 */
export async function getInventory(
  locode: string,
  year: number
): Promise<CityCatalystInventoryData> {
  const response = await apiRequest(
    'GET',
    `/api/citycatalyst/city/${encodeURIComponent(locode)}/inventory/${year}`
  );
  const result = await response.json();
  return result.data;
}

/**
 * Get city boundary as GeoJSON
 */
export async function getCityBoundary(locode: string): Promise<CityBoundary> {
  const response = await apiRequest(
    'GET',
    `/api/citycatalyst/city/${encodeURIComponent(locode)}/boundary`
  );
  const result = await response.json();
  return result.data;
}

/**
 * Get all inventories for multiple cities (used for overview)
 */
export async function getInventoriesByCity(): Promise<CityInventorySummary[]> {
  const response = await apiRequest('GET', '/api/citycatalyst/inventories');
  const result = await response.json();
  return result.data;
}
