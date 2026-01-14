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
  centroid: [-51.1784, -30.0346] as [number, number],
  bbox: [-51.29, -30.27, -51.01, -29.93] as [number, number, number, number],
  boundaryGeoJson: {
    type: "Feature",
    properties: { name: "Porto Alegre, Brazil" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-51.2650, -29.9380],
        [-51.2350, -29.9320],
        [-51.1850, -29.9350],
        [-51.1400, -29.9400],
        [-51.0950, -29.9500],
        [-51.0550, -29.9700],
        [-51.0250, -29.9950],
        [-51.0150, -30.0200],
        [-51.0180, -30.0600],
        [-51.0250, -30.1000],
        [-51.0350, -30.1400],
        [-51.0500, -30.1800],
        [-51.0700, -30.2100],
        [-51.0950, -30.2350],
        [-51.1250, -30.2550],
        [-51.1600, -30.2650],
        [-51.2000, -30.2600],
        [-51.2350, -30.2450],
        [-51.2600, -30.2200],
        [-51.2750, -30.1850],
        [-51.2850, -30.1450],
        [-51.2900, -30.1000],
        [-51.2880, -30.0550],
        [-51.2800, -30.0150],
        [-51.2650, -29.9380],
      ]],
    },
  },
};

function generateSampleContours() {
  const features: any[] = [];
  let id = 0;
  
  const hillCenters = [
    { lng: -51.18, lat: -30.05, maxElev: 280, radius: 0.06 },
    { lng: -51.12, lat: -30.10, maxElev: 250, radius: 0.05 },
    { lng: -51.20, lat: -30.12, maxElev: 220, radius: 0.04 },
    { lng: -51.08, lat: -30.15, maxElev: 200, radius: 0.045 },
    { lng: -51.15, lat: -30.18, maxElev: 180, radius: 0.035 },
    { lng: -51.22, lat: -30.08, maxElev: 240, radius: 0.05 },
    { lng: -51.10, lat: -30.22, maxElev: 160, radius: 0.04 },
    { lng: -51.06, lat: -30.08, maxElev: 200, radius: 0.04 },
    { lng: -51.25, lat: -30.15, maxElev: 180, radius: 0.03 },
    { lng: -51.14, lat: -30.02, maxElev: 260, radius: 0.05 },
  ];

  for (const hill of hillCenters) {
    for (let elev = 20; elev <= hill.maxElev; elev += 10) {
      const isMajor = elev % 50 === 0;
      const radiusFactor = 1 - (elev / hill.maxElev);
      const ringRadius = hill.radius * radiusFactor;
      
      if (ringRadius < 0.005) continue;
      
      const coords: [number, number][] = [];
      const numPoints = 24 + Math.floor(Math.random() * 8);
      
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * 2 * Math.PI;
        const jitter = (Math.random() - 0.5) * 0.008;
        const jitter2 = (Math.random() - 0.5) * 0.008;
        coords.push([
          hill.lng + Math.cos(angle) * ringRadius + jitter,
          hill.lat + Math.sin(angle) * ringRadius * 0.8 + jitter2
        ]);
      }
      
      features.push({
        type: "Feature",
        properties: { id: `contour-${id++}`, elevation: elev, isMajor },
        geometry: { type: "LineString", coordinates: coords },
      });
    }
  }

  for (let elev = 10; elev <= 100; elev += 10) {
    const isMajor = elev % 50 === 0;
    const baseY = -30.0 - (elev * 0.002);
    const coords: [number, number][] = [];
    
    for (let x = -51.27; x <= -51.03; x += 0.01) {
      const wave = Math.sin((x + 51.15) * 30) * 0.01;
      coords.push([x, baseY + wave + (Math.random() - 0.5) * 0.005]);
    }
    
    features.push({
      type: "Feature",
      properties: { id: `contour-${id++}`, elevation: elev, isMajor },
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  return features;
}

export const SAMPLE_ELEVATION_DATA = {
  cityLocode: 'BR POA',
  bounds: { minLng: -51.29, minLat: -30.27, maxLng: -51.01, maxLat: -29.93 },
  elevationData: {
    width: 100,
    height: 100,
    cellSize: 90,
    minElevation: 0,
    maxElevation: 311,
  },
  contours: {
    type: "FeatureCollection",
    features: generateSampleContours(),
  },
};
