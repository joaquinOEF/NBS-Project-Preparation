import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SampleDataContextType {
  isSampleMode: boolean;
  setSampleMode: (value: boolean) => void;
  sampleCity: SampleCityData;
  clearSampleMode: () => void;
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

const STORAGE_KEY = 'nbs_sample_mode';

const SampleDataContext = createContext<SampleDataContextType | undefined>(undefined);

export function SampleDataProvider({ children }: { children: ReactNode }) {
  const [isSampleMode, setIsSampleMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isSampleMode) {
        localStorage.setItem(STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [isSampleMode]);

  const setSampleMode = (value: boolean) => {
    setIsSampleMode(value);
  };

  const clearSampleMode = () => {
    setIsSampleMode(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <SampleDataContext.Provider
      value={{
        isSampleMode,
        setSampleMode,
        sampleCity: SAMPLE_CITY,
        clearSampleMode,
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
    actions: [
      {
        id: 'sample-mit-1',
        name: 'Urban Reforestation Program',
        description: 'Implement large-scale urban tree planting to reduce heat island effect and sequester carbon.',
        ghg_reduction_potential: 'High',
        cost_level: 'Medium',
        implementation_timeline: '3-5 years',
        co_benefits: ['Air quality improvement', 'Urban cooling', 'Biodiversity'],
        kpis: ['Trees planted', 'CO2 sequestered', 'Temperature reduction'],
      },
      {
        id: 'sample-mit-2',
        name: 'Green Building Standards',
        description: 'Mandate energy-efficient construction standards for new buildings.',
        ghg_reduction_potential: 'High',
        cost_level: 'Low',
        implementation_timeline: '1-2 years',
        co_benefits: ['Energy savings', 'Improved indoor air quality', 'Job creation'],
        kpis: ['Energy efficiency rating', 'Buildings certified', 'Energy saved'],
      },
      {
        id: 'sample-mit-3',
        name: 'Sustainable Urban Mobility',
        description: 'Expand public transit and cycling infrastructure to reduce vehicle emissions.',
        ghg_reduction_potential: 'Very High',
        cost_level: 'High',
        implementation_timeline: '5-10 years',
        co_benefits: ['Reduced congestion', 'Health benefits', 'Equity'],
        kpis: ['Modal shift percentage', 'Km of bike lanes', 'Transit ridership'],
      },
    ],
  },
};

export const SAMPLE_HIAP_ADAPTATION_DATA = {
  data: {
    actions: [
      {
        id: 'sample-ada-1',
        name: 'Flood Risk Management',
        description: 'Develop comprehensive flood protection through green infrastructure and drainage improvements.',
        risk_addressed: 'Flooding',
        cost_level: 'High',
        implementation_timeline: '3-5 years',
        co_benefits: ['Water quality', 'Recreation areas', 'Property protection'],
        kpis: ['Flood events mitigated', 'Area protected', 'Damage reduction'],
      },
      {
        id: 'sample-ada-2',
        name: 'Heat Wave Early Warning System',
        description: 'Implement community-based heat warning and cooling center network.',
        risk_addressed: 'Extreme Heat',
        cost_level: 'Low',
        implementation_timeline: '1 year',
        co_benefits: ['Public health protection', 'Community engagement', 'Equity'],
        kpis: ['Warning response time', 'People reached', 'Heat-related illness reduction'],
      },
      {
        id: 'sample-ada-3',
        name: 'Wetland Restoration',
        description: 'Restore urban wetlands for natural water management and ecosystem services.',
        risk_addressed: 'Water Scarcity / Flooding',
        cost_level: 'Medium',
        implementation_timeline: '2-4 years',
        co_benefits: ['Biodiversity', 'Recreation', 'Carbon sequestration'],
        kpis: ['Wetland area restored', 'Species diversity', 'Water retention capacity'],
      },
    ],
  },
};
