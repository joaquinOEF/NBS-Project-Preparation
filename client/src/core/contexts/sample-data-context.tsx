import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SampleDataContextType {
  isSampleMode: boolean;
  setSampleMode: (value: boolean) => void;
  sampleCity: SampleCityData;
  clearSampleMode: () => void;
  sampleActions: SampleAction[];
  initiatedProjects: string[];
  initiateProject: (actionId: string) => void;
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

  const [initiatedProjects, setInitiatedProjects] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (storedSampleMode) {
        localStorage.setItem(STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [storedSampleMode]);

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

export const SAMPLE_CITY_BOUNDARY = {
  cityLocode: 'BR POA',
  cityName: 'Porto Alegre',
  centroid: [-51.2177, -30.0346] as [number, number],
  bbox: [-51.3000, -30.2700, -51.0100, -29.9300] as [number, number, number, number],
  boundaryGeoJson: {
    type: "Feature",
    properties: { name: "Porto Alegre, Brazil" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-51.3000, -29.9300],
        [-51.0100, -29.9300],
        [-51.0100, -30.2700],
        [-51.3000, -30.2700],
        [-51.3000, -29.9300],
      ]],
    },
  },
};

export const SAMPLE_ELEVATION_DATA = {
  cityLocode: 'BR POA',
  bounds: { minLng: -51.3000, minLat: -30.2700, maxLng: -51.0100, maxLat: -29.9300 },
  elevationData: {
    width: 100,
    height: 100,
    cellSize: 90,
    minElevation: 0,
    maxElevation: 311,
  },
  contours: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: "contour-sample-1", elevation: 50, isMajor: true },
        geometry: {
          type: "LineString",
          coordinates: [[-51.25, -30.05], [-51.15, -30.08], [-51.10, -30.12]],
        },
      },
      {
        type: "Feature",
        properties: { id: "contour-sample-2", elevation: 100, isMajor: false },
        geometry: {
          type: "LineString",
          coordinates: [[-51.22, -30.10], [-51.12, -30.15], [-51.08, -30.20]],
        },
      },
      {
        type: "Feature",
        properties: { id: "contour-sample-3", elevation: 150, isMajor: true },
        geometry: {
          type: "LineString",
          coordinates: [[-51.20, -30.12], [-51.10, -30.18], [-51.05, -30.22]],
        },
      },
      {
        type: "Feature",
        properties: { id: "contour-sample-4", elevation: 200, isMajor: false },
        geometry: {
          type: "LineString",
          coordinates: [[-51.18, -30.15], [-51.08, -30.20], [-51.04, -30.24]],
        },
      },
      {
        type: "Feature",
        properties: { id: "contour-sample-5", elevation: 250, isMajor: true },
        geometry: {
          type: "LineString",
          coordinates: [[-51.15, -30.18], [-51.06, -30.22], [-51.03, -30.25]],
        },
      },
    ],
  },
};
