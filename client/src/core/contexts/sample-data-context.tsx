import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  SAMPLE_PROJECT_ID,
  SAMPLE_CITY_ID,
  SAMPLE_USER_ID,
} from '@shared/sample-constants';

interface SampleDataContextType {
  isSampleMode: boolean;
  setSampleMode: (value: boolean) => void;
  sampleCity: SampleCityData;
  clearSampleMode: () => void;
  sampleActions: SampleAction[];
  initiatedProjects: string[];
  initiateProject: (actionId: string) => void;
  sampleProjectId: string;
  sampleCityId: string;
  sampleUserId: string;
  isSampleInitialized: boolean;
  initializeSampleProject: () => Promise<void>;
}

export interface SampleCityData {
  id: string;
  cityId: string;
  name: string;
  country: string;
  locode: string;
  locodePrefix: string;
  totalInventories: number;
  availableYears: number[];
  latestUpdate: string;
  years: SampleInventoryYear[];
}

export interface SampleInventoryYear {
  inventoryId: string;
  year: number;
  status: string;
}

export interface SampleAction {
  id: string;
  name: string;
  description: string;
  type: 'mitigation' | 'adaptation';
  cityId: string;
}

const SAMPLE_CITY: SampleCityData = {
  id: 'BR POA',
  cityId: 'BR POA',
  name: 'Porto Alegre',
  country: 'Brazil',
  locode: 'BR POA',
  locodePrefix: 'BR',
  totalInventories: 2,
  availableYears: [2023, 2022],
  latestUpdate: new Date().toISOString(),
  years: [
    {
      inventoryId: 'sample-inv-2023',
      year: 2023,
      status: 'published',
    },
    {
      inventoryId: 'sample-inv-2022',
      year: 2022,
      status: 'published',
    },
  ],
};

const SAMPLE_ACTIONS: SampleAction[] = [
  {
    id: 'sample-mit-1',
    name: 'Urban Reforestation Program',
    description: 'Large-scale urban tree planting to reduce heat island effect and sequester carbon.',
    type: 'mitigation',
    cityId: 'BR POA',
  },
  {
    id: 'sample-mit-2',
    name: 'Green Building Standards',
    description: 'Mandate energy-efficient construction standards for new buildings.',
    type: 'mitigation',
    cityId: 'BR POA',
  },
  {
    id: 'sample-mit-3',
    name: 'Sustainable Urban Mobility',
    description: 'Expand public transit and cycling infrastructure to reduce vehicle emissions.',
    type: 'mitigation',
    cityId: 'BR POA',
  },
  {
    id: 'sample-ada-1',
    name: 'Nature Based Solutions for Climate Resilience',
    description: 'Implement green infrastructure including wetlands, bioswales, and urban forests for flood management and cooling.',
    type: 'adaptation',
    cityId: 'BR POA',
  },
  {
    id: 'sample-ada-2',
    name: 'Heat Wave Early Warning System',
    description: 'Community-based heat warning and cooling center network for vulnerable populations.',
    type: 'adaptation',
    cityId: 'BR POA',
  },
  {
    id: 'sample-ada-3',
    name: 'Coastal Flood Protection',
    description: 'Develop comprehensive flood protection through drainage improvements and natural barriers.',
    type: 'adaptation',
    cityId: 'BR POA',
  },
];

const STORAGE_KEY = 'nbs_sample_mode';
const PROJECTS_STORAGE_KEY = 'nbs_sample_projects';

const SampleDataContext = createContext<SampleDataContextType | undefined>(undefined);

export function SampleDataProvider({ children }: { children: ReactNode }) {
  const [storedSampleMode, setStoredSampleMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    }
    return false;
  });

  const isSampleMode = storedSampleMode;
  const [isSampleInitialized, setIsSampleInitialized] = useState(false);

  const [initiatedProjects, setInitiatedProjects] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });

  const initializeSampleProject = useCallback(async () => {
    try {
      const response = await fetch('/api/sample/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        setIsSampleInitialized(true);
        console.log('📦 Sample project initialized');
      } else {
        console.error('Failed to initialize sample project');
      }
    } catch (error) {
      console.error('Sample init error:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (storedSampleMode) {
        localStorage.setItem(STORAGE_KEY, 'true');
        initializeSampleProject();
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [storedSampleMode, initializeSampleProject]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(initiatedProjects));
    }
  }, [initiatedProjects]);

  const setSampleMode = (value: boolean) => {
    setStoredSampleMode(value);
  };

  const clearSampleMode = () => {
    setStoredSampleMode(false);
    setInitiatedProjects([]);
    setIsSampleInitialized(false);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROJECTS_STORAGE_KEY);
  };

  const initiateProject = (actionId: string) => {
    if (!initiatedProjects.includes(actionId)) {
      setInitiatedProjects(prev => [...prev, actionId]);
    }
  };

  return (
    <SampleDataContext.Provider
      value={{
        isSampleMode,
        setSampleMode,
        sampleCity: SAMPLE_CITY,
        clearSampleMode,
        sampleActions: SAMPLE_ACTIONS,
        initiatedProjects,
        initiateProject,
        sampleProjectId: SAMPLE_PROJECT_ID,
        sampleCityId: SAMPLE_CITY_ID,
        sampleUserId: SAMPLE_USER_ID,
        isSampleInitialized,
        initializeSampleProject,
      }}
    >
      {children}
    </SampleDataContext.Provider>
  );
}

export function useSampleData() {
  const context = useContext(SampleDataContext);
  if (context === undefined) {
    throw new Error('useSampleData must be used within a SampleDataProvider');
  }
  return context;
}

export const SAMPLE_HIAP_MITIGATION_DATA = {
  data: {
    actions: SAMPLE_ACTIONS.filter(a => a.type === 'mitigation'),
  },
};

export const SAMPLE_HIAP_ADAPTATION_DATA = {
  data: {
    actions: SAMPLE_ACTIONS.filter(a => a.type === 'adaptation'),
  },
};

// Data readiness checklist - describes which upstream datasets are available for this city.
// In sample mode these are hardcoded; in API mode, replace with a fetch to the project's data status endpoint.
export interface DataReadinessItem {
  key: string;
  i18nKey: string; // maps to project.dataReadiness.[key]
  available: boolean;
}

export const SAMPLE_DATA_READINESS: DataReadinessItem[] = [
  { key: 'ghgInventory', i18nKey: 'ghgInventory', available: true },
  { key: 'ccra', i18nKey: 'ccra', available: true },
  { key: 'hiap', i18nKey: 'hiap', available: true },
  { key: 'localDataEnhancement', i18nKey: 'localDataEnhancement', available: false },
];

export async function loadSampleBoundaryData(): Promise<any> {
  const response = await fetch('/sample-data/porto-alegre-boundary.json');
  if (!response.ok) {
    throw new Error('Failed to load sample boundary data');
  }
  return response.json();
}

export async function loadSampleElevationData(): Promise<any> {
  const response = await fetch('/sample-data/porto-alegre-elevation.json');
  if (!response.ok) {
    throw new Error('Failed to load sample elevation data');
  }
  return response.json();
}

export async function loadSampleLandcoverData(): Promise<any> {
  const response = await fetch('/sample-data/porto-alegre-landcover.json');
  if (!response.ok) {
    throw new Error('Failed to load sample landcover data');
  }
  return response.json();
}

export async function loadSampleSurfaceWaterData(): Promise<any> {
  const response = await fetch('/sample-data/porto-alegre-surface-water.json');
  if (!response.ok) {
    throw new Error('Failed to load sample surface water data');
  }
  return response.json();
}

export async function loadSampleRiversData(): Promise<any> {
  const response = await fetch('/sample-data/porto-alegre-rivers.json');
  if (!response.ok) {
    throw new Error('Failed to load sample rivers data');
  }
  return response.json();
}

export async function loadSampleForestData(): Promise<any> {
  const response = await fetch('/sample-data/porto-alegre-forest.json');
  if (!response.ok) {
    throw new Error('Failed to load sample forest data');
  }
  return response.json();
}

export async function loadSamplePopulationData(): Promise<any> {
  const response = await fetch('/sample-data/porto-alegre-population.json');
  if (!response.ok) {
    throw new Error('Failed to load sample population data');
  }
  return response.json();
}

export async function loadSampleGridData(): Promise<any> {
  const response = await fetch('/sample-data/porto-alegre-grid.json');
  if (!response.ok) {
    throw new Error('Failed to load sample grid data');
  }
  return response.json();
}

export async function loadSampleZonesData(): Promise<any> {
  const response = await fetch('/sample-data/porto-alegre-zones.json');
  if (!response.ok) {
    throw new Error('Failed to load sample zones data');
  }
  return response.json();
}
