import { useParams, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Layers, Mountain, Droplets, Trees, Users, Map as MapIcon, Grid3X3, Flame, CloudRain, Building2, MapPinned, X, Plus, Check, DollarSign, Clock, Wrench, ChevronRight, ChevronDown, AlertTriangle, Leaf, Trash2 } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { Badge } from '@/core/components/ui/badge';
import { Switch } from '@/core/components/ui/switch';
import { Label } from '@/core/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { ScrollArea } from '@/core/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/core/components/ui/accordion';
import { useTranslation } from 'react-i18next';
import { useProjectContext, SelectedZone, SelectedIntervention } from '@/core/contexts/project-context';
import { 
  useSampleData, 
  loadSampleBoundaryData, 
  loadSampleElevationData,
  loadSampleLandcoverData,
  loadSampleSurfaceWaterData,
  loadSampleRiversData,
  loadSampleForestData,
  loadSamplePopulationData,
  loadSampleGridData,
  loadSampleZonesData,
} from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiRequest } from '@/core/lib/queryClient';

interface BoundaryData {
  cityLocode: string;
  cityName: string;
  centroid: [number, number];
  bbox: [number, number, number, number];
  boundaryGeoJson: any;
}

interface ElevationData {
  cityLocode: string;
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  elevationData: {
    width: number;
    height: number;
    cellSize: number;
    minElevation: number;
    maxElevation: number;
  };
  contours: any;
}

interface Project {
  id: string;
  actionId: string;
  actionName: string;
  actionDescription: string;
  actionType: string;
  cityId: string;
  status: string;
}

interface CityInfo {
  name: string;
  locode: string;
  country: string;
}

interface LayerState {
  id: string;
  name: string;
  icon: any;
  color: string;
  enabled: boolean;
  loaded: boolean;
  data: any;
  leafletLayer: L.Layer | null;
}

const LAYER_CONFIGS: Omit<LayerState, 'enabled' | 'loaded' | 'data' | 'leafletLayer'>[] = [
  { id: 'intervention_zones', name: 'Intervention Zones', icon: MapPinned, color: '#10b981' },
  { id: 'grid_flood', name: 'Flood Risk', icon: CloudRain, color: '#3b82f6' },
  { id: 'grid_heat', name: 'Heat Risk', icon: Flame, color: '#ef4444' },
  { id: 'grid_landslide', name: 'Landslide Risk', icon: Mountain, color: '#a16207' },
  { id: 'grid_population', name: 'Population Density', icon: Users, color: '#8b5cf6' },
  { id: 'grid_buildings', name: 'Building Density', icon: Building2, color: '#f97316' },
  { id: 'elevation', name: 'Elevation', icon: Mountain, color: '#c9a87c' },
  { id: 'landcover', name: 'Land Cover', icon: MapIcon, color: '#4ade80' },
  { id: 'surface_water', name: 'Water Bodies', icon: Droplets, color: '#3b82f6' },
  { id: 'rivers', name: 'Rivers', icon: Droplets, color: '#06b6d4' },
  { id: 'forest', name: 'Forest', icon: Trees, color: '#22c55e' },
];

const INTERVENTION_COLORS: Record<string, string> = {
  sponge_network: '#3b82f6',
  cooling_network: '#ef4444',
  slope_stabilization: '#a16207',
  multi_benefit: '#10b981',
};

const TYPOLOGY_COLORS: Record<string, string> = {
  FLOOD: '#3b82f6',
  HEAT: '#ef4444',
  LANDSLIDE: '#a16207',
  FLOOD_HEAT: '#8b5cf6',
  FLOOD_LANDSLIDE: '#0891b2',
  HEAT_LANDSLIDE: '#db2777',
  LOW: '#10b981',
};

interface InterventionCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  applicableTypologies: string[];
}

interface InterventionType {
  id: string;
  category: string;
  name: string;
  description: string;
  osmAssetTypes: string[];
  typicalScale: { min: number; max: number; unit: string };
  costRange: { min: number; max: number; unit: string };
  impacts: { flood: string; heat: string; landslide: string };
  implementationNotes: string;
  maintenanceRequirements: string;
  timeToImplement: { min: number; max: number; unit: string };
  cobenefits: string[];
}

interface InterventionsData {
  version: string;
  categories: Record<string, InterventionCategory>;
  interventions: InterventionType[];
}

interface ZoneProperties {
  zoneId: string;
  typologyLabel: string;
  primaryHazard: string;
  secondaryHazard?: string;
  interventionType: string;
  meanFlood: number;
  meanHeat: number;
  meanLandslide: number;
  areaKm2: number;
  cellCount: number;
  populationSum?: number;
}

export default function SiteExplorerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { isSampleMode, sampleCity, sampleActions, initiatedProjects } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [boundaryData, setBoundaryData] = useState<BoundaryData | null>(null);
  const [elevationData, setElevationData] = useState<ElevationData | null>(null);
  const [showLayerPanel, setShowLayerPanel] = useState(true);
  const [layers, setLayers] = useState<LayerState[]>(() => 
    LAYER_CONFIGS.map(config => ({
      ...config,
      enabled: config.id === 'elevation',
      loaded: false,
      data: null,
      leafletLayer: null,
    }))
  );
  const layerRefs = useRef<Map<string, L.Layer>>(new Map());

  const isSampleModeActive = isSampleMode || isSampleRoute;

  const sampleAction = isSampleModeActive 
    ? sampleActions.find(a => a.id === projectId)
    : null;
  const isSampleProjectInitiated = isSampleModeActive && initiatedProjects.includes(projectId || '');

  const { data: projectData, isLoading: isLoadingProject } = useQuery<{ project: Project }>({
    queryKey: ['/api/project', projectId],
    enabled: !isSampleModeActive && !!projectId,
  });

  const cityId = isSampleModeActive ? sampleCity.locode : projectData?.project?.cityId;

  const { data: cityInfoData, isLoading: isLoadingCity } = useQuery<{ data: CityInfo }>({
    queryKey: ['/api/city-information', cityId],
    enabled: !isSampleModeActive && !!cityId,
  });

  const cityName = isSampleModeActive ? sampleCity.name : (cityInfoData?.data?.name || '');
  const cityLocode = isSampleModeActive ? sampleCity.locode : (cityInfoData?.data?.locode || '');

  const boundaryMutation = useMutation({
    mutationFn: async (params: { cityName: string; cityLocode: string }) => {
      const response = await apiRequest('POST', '/api/geospatial/boundary', params);
      return response.json();
    },
    onSuccess: (data) => {
      setBoundaryData(data.data);
    },
  });

  const elevationMutation = useMutation({
    mutationFn: async (params: { cityLocode: string; bounds: any; resolution?: number }) => {
      const response = await apiRequest('POST', '/api/geospatial/elevation', params);
      return response.json();
    },
    onSuccess: (data) => {
      setElevationData(data.data);
    },
  });

  const [isLoadingSampleData, setIsLoadingSampleData] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ZoneProperties | null>(null);
  const [interventionsData, setInterventionsData] = useState<InterventionsData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [zonePortfolios, setZonePortfolios] = useState<Record<string, SelectedIntervention[]>>({});
  const { updateModule, context } = useProjectContext();

  useEffect(() => {
    fetch('/sample-data/interventions.json')
      .then(res => res.json())
      .then(data => setInterventionsData(data))
      .catch(err => console.error('Failed to load interventions data:', err));
  }, []);

  useEffect(() => {
    if (context?.siteExplorer?.selectedZones) {
      const portfolios: Record<string, SelectedIntervention[]> = {};
      context.siteExplorer.selectedZones.forEach(zone => {
        if (typeof zone === 'object' && zone.interventionPortfolio) {
          portfolios[zone.zoneId] = zone.interventionPortfolio;
        }
      });
      setZonePortfolios(portfolios);
    }
  }, [context?.siteExplorer?.selectedZones]);

  useEffect(() => {
    let cancelled = false;
    
    if (isSampleModeActive) {
      setBoundaryData(null);
      setElevationData(null);
      setIsLoadingSampleData(true);
      Promise.all([loadSampleBoundaryData(), loadSampleElevationData()])
        .then(([boundary, elevation]) => {
          if (!cancelled) {
            setBoundaryData(boundary);
            setElevationData(elevation);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (!cancelled) setIsLoadingSampleData(false);
        });
    } else {
      setBoundaryData(null);
      setElevationData(null);
      if (cityName && cityLocode && !boundaryMutation.isPending) {
        boundaryMutation.mutate({ cityName, cityLocode });
      }
    }
    
    return () => { cancelled = true; };
  }, [cityName, cityLocode, isSampleModeActive]);

  useEffect(() => {
    if (isSampleModeActive) return;
    
    if (boundaryData && !elevationData && !elevationMutation.isPending) {
      const bounds = {
        minLng: boundaryData.bbox[0],
        minLat: boundaryData.bbox[1],
        maxLng: boundaryData.bbox[2],
        maxLat: boundaryData.bbox[3],
      };
      elevationMutation.mutate({ cityLocode: boundaryData.cityLocode, bounds, resolution: 90 });
    }
  }, [boundaryData, isSampleModeActive]);

  useEffect(() => {
    if (!mapContainerRef.current || !boundaryData) return;

    if (mapRef.current) {
      mapRef.current.remove();
      layerRefs.current.clear();
    }

    const map = L.map(mapContainerRef.current, {
      center: [boundaryData.centroid[1], boundaryData.centroid[0]],
      zoom: 11,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    if (boundaryData.boundaryGeoJson) {
      const boundaryLayer = L.geoJSON(boundaryData.boundaryGeoJson, {
        style: {
          color: '#c9a87c',
          weight: 2,
          fillColor: 'transparent',
          fillOpacity: 0,
        },
      }).addTo(map);

      map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });
    }

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [boundaryData]);

  const loadLayerData = useCallback(async (layerId: string): Promise<any> => {
    if (!isSampleModeActive) return null;
    
    switch (layerId) {
      case 'elevation': return loadSampleElevationData();
      case 'landcover': return loadSampleLandcoverData();
      case 'surface_water': return loadSampleSurfaceWaterData();
      case 'rivers': return loadSampleRiversData();
      case 'forest': return loadSampleForestData();
      case 'population': return loadSamplePopulationData();
      case 'intervention_zones': return loadSampleZonesData();
      case 'grid_flood':
      case 'grid_heat':
      case 'grid_landslide':
      case 'grid_population':
      case 'grid_buildings':
        return loadSampleGridData();
      default: return null;
    }
  }, [isSampleModeActive]);

  const getFloodColor = (score: number): string => {
    if (score >= 0.7) return '#1e40af';
    if (score >= 0.5) return '#3b82f6';
    if (score >= 0.3) return '#60a5fa';
    if (score >= 0.1) return '#93c5fd';
    return '#dbeafe';
  };

  const getHeatColor = (score: number): string => {
    if (score >= 0.7) return '#991b1b';
    if (score >= 0.5) return '#dc2626';
    if (score >= 0.3) return '#f87171';
    if (score >= 0.1) return '#fca5a5';
    return '#fee2e2';
  };

  const getLandslideColor = (score: number): string => {
    if (score >= 0.7) return '#78350f';
    if (score >= 0.5) return '#a16207';
    if (score >= 0.3) return '#ca8a04';
    if (score >= 0.1) return '#eab308';
    return '#fef3c7';
  };

  const getPopulationColor = (density: number): string => {
    if (density >= 0.5) return '#5b21b6';
    if (density >= 0.3) return '#7c3aed';
    if (density >= 0.15) return '#8b5cf6';
    if (density >= 0.05) return '#a78bfa';
    if (density > 0) return '#c4b5fd';
    return '#ede9fe';
  };

  const getBuildingColor = (density: number): string => {
    if (density >= 0.5) return '#9a3412';
    if (density >= 0.3) return '#c2410c';
    if (density >= 0.15) return '#ea580c';
    if (density >= 0.05) return '#f97316';
    if (density > 0) return '#fb923c';
    return '#ffedd5';
  };

  const getApplicableCategories = useCallback((typology: string): InterventionCategory[] => {
    if (!interventionsData) return [];
    return Object.values(interventionsData.categories).filter(cat => 
      cat.applicableTypologies.includes(typology)
    );
  }, [interventionsData]);

  const getInterventionsByCategory = useCallback((categoryId: string): InterventionType[] => {
    if (!interventionsData) return [];
    return interventionsData.interventions.filter(i => i.category === categoryId);
  }, [interventionsData]);

  const addInterventionToPortfolio = useCallback((zoneId: string, intervention: InterventionType, areaKm2: number) => {
    const costUnit = intervention.costRange.unit;
    let costMultiplier = 1;
    
    if (costUnit === 'USD/ha') {
      costMultiplier = areaKm2 * 100;
    } else if (costUnit === 'USD/m²') {
      costMultiplier = areaKm2 * 1000000;
    } else if (costUnit === 'USD/m') {
      const approxPerimeterM = Math.sqrt(areaKm2) * 4 * 1000;
      costMultiplier = approxPerimeterM;
    } else {
      costMultiplier = areaKm2 * 100;
    }

    const newIntervention: SelectedIntervention = {
      interventionId: intervention.id,
      interventionName: intervention.name,
      category: intervention.category,
      estimatedCost: {
        min: Math.round(intervention.costRange.min * costMultiplier),
        max: Math.round(intervention.costRange.max * costMultiplier),
        unit: 'USD',
      },
      estimatedArea: areaKm2,
      areaUnit: 'km²',
      impacts: intervention.impacts,
      addedAt: new Date().toISOString(),
    };

    setZonePortfolios(prev => {
      const existing = prev[zoneId] || [];
      if (existing.some(i => i.interventionId === intervention.id)) {
        return prev;
      }
      return { ...prev, [zoneId]: [...existing, newIntervention] };
    });
  }, []);

  const removeInterventionFromPortfolio = useCallback((zoneId: string, interventionId: string) => {
    setZonePortfolios(prev => {
      const existing = prev[zoneId] || [];
      return { ...prev, [zoneId]: existing.filter(i => i.interventionId !== interventionId) };
    });
  }, []);

  const savePortfolioToContext = useCallback(() => {
    if (!projectId) return;
    
    const zonesLayer = layers.find(l => l.id === 'intervention_zones');
    const zonesData = zonesLayer?.data?.geoJson?.features || [];
    
    const selectedZones: SelectedZone[] = Object.entries(zonePortfolios)
      .filter(([_, portfolio]) => portfolio.length > 0)
      .map(([zoneId, portfolio]) => {
        const zoneFeature = zonesData.find((f: any) => f.properties?.zoneId === zoneId);
        const props = zoneFeature?.properties || {};
        return {
          zoneId,
          zoneName: props.zoneName || zoneId,
          hazardType: props.typologyLabel || 'LOW',
          primaryHazard: props.primaryHazard,
          secondaryHazard: props.secondaryHazard,
          riskScore: Math.max(props.meanFlood || 0, props.meanHeat || 0, props.meanLandslide || 0),
          meanFlood: props.meanFlood,
          meanHeat: props.meanHeat,
          meanLandslide: props.meanLandslide,
          area: (props.areaKm2 || 0) * 1000000,
          areaKm2: props.areaKm2,
          populationSum: props.populationSum,
          interventionType: props.interventionType,
          interventionPortfolio: portfolio,
        };
      });

    const totalCells = zonesData.reduce((sum: number, f: any) => sum + (f.properties?.cellCount || 0), 0);
    const floodCells = zonesData.filter((f: any) => f.properties?.typologyLabel?.includes('FLOOD')).reduce((sum: number, f: any) => sum + (f.properties?.cellCount || 0), 0);
    const heatCells = zonesData.filter((f: any) => f.properties?.typologyLabel?.includes('HEAT')).reduce((sum: number, f: any) => sum + (f.properties?.cellCount || 0), 0);
    const landslideCells = zonesData.filter((f: any) => f.properties?.typologyLabel?.includes('LANDSLIDE')).reduce((sum: number, f: any) => sum + (f.properties?.cellCount || 0), 0);

    updateModule('siteExplorer', {
      selectedZones,
      layerPreferences: layers.reduce((acc, l) => ({ ...acc, [l.id]: l.enabled }), {}),
      hazardSummary: { floodCells, heatCells, landslideCells, totalCells },
    });
  }, [projectId, zonePortfolios, layers, updateModule]);

  const formatCost = (min: number, max: number): string => {
    const formatNum = (n: number) => {
      if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
      return `$${n.toFixed(0)}`;
    };
    return `${formatNum(min)} - ${formatNum(max)}`;
  };

  const getImpactBadgeColor = (impact: string): string => {
    if (impact === 'high') return 'bg-green-100 text-green-800';
    if (impact === 'medium-high' || impact === 'medium') return 'bg-yellow-100 text-yellow-800';
    if (impact === 'low-medium') return 'bg-orange-100 text-orange-800';
    return 'bg-gray-100 text-gray-600';
  };

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'droplets': return <Droplets className="h-5 w-5" />;
      case 'trees': return <Trees className="h-5 w-5" />;
      case 'mountain': return <Mountain className="h-5 w-5" />;
      case 'layers': return <Layers className="h-5 w-5" />;
      default: return <Leaf className="h-5 w-5" />;
    }
  };

  const createLayerFromData = useCallback((layerId: string, data: any): L.Layer | null => {
    if (!data) return null;

    switch (layerId) {
      case 'intervention_zones':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const typology = feature?.properties?.typologyLabel || 'LOW';
              const color = TYPOLOGY_COLORS[typology] || '#10b981';
              return {
                color: color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.4,
                opacity: 0.9,
              };
            },
            onEachFeature: (feature, layer) => {
              const p = feature.properties || {};
              const typologyLabel = t(`interventionZones.typologies.${p.typologyLabel}`) || p.typologyLabel;
              const interventionLabel = t(`interventionZones.interventions.${p.interventionType}`) || p.interventionType;
              const interventionDesc = t(`interventionZones.interventions.${p.interventionType}_desc`) || '';
              
              let tooltip = `<div style="min-width: 200px;">` +
                `<strong style="font-size: 14px;">${p.zoneId}: ${typologyLabel}</strong><br/>` +
                `<hr style="margin: 4px 0; border-color: rgba(255,255,255,0.3);"/>` +
                `<strong>${t('interventionZones.metrics.intervention')}:</strong> ${interventionLabel}<br/>` +
                `<em style="font-size: 11px;">${interventionDesc}</em><br/>` +
                `<hr style="margin: 4px 0; border-color: rgba(255,255,255,0.3);"/>` +
                `${t('interventionZones.metrics.meanFlood')}: ${((p.meanFlood || 0) * 100).toFixed(0)}%<br/>` +
                `${t('interventionZones.metrics.meanHeat')}: ${((p.meanHeat || 0) * 100).toFixed(0)}%<br/>` +
                `${t('interventionZones.metrics.meanLandslide')}: ${((p.meanLandslide || 0) * 100).toFixed(0)}%<br/>` +
                `<hr style="margin: 4px 0; border-color: rgba(255,255,255,0.3);"/>` +
                `${t('interventionZones.metrics.area')}: ${(p.areaKm2 || 0).toFixed(1)} km²<br/>` +
                `${t('interventionZones.metrics.cells')}: ${p.cellCount || 0}<br/>` +
                `<em style="font-size: 11px; color: #60a5fa;">Click to select interventions</em>` +
                `</div>`;
              
              layer.bindTooltip(tooltip, { sticky: true });
              
              layer.on('click', () => {
                setSelectedZone(p as ZoneProperties);
                setSelectedCategory(null);
              });
            },
          });
        }
        return null;

      case 'grid_flood':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const score = feature?.properties?.metrics?.flood_score ?? 0;
              return {
                color: getFloodColor(score),
                weight: 0.5,
                fillColor: getFloodColor(score),
                fillOpacity: score > 0 ? 0.6 : 0.1,
                opacity: 0.8,
              };
            },
            onEachFeature: (feature, layer) => {
              const m = feature.properties?.metrics || {};
              const cov = feature.properties?.coverage || {};
              const coverageList = Object.entries(cov)
                .filter(([_, v]) => v)
                .map(([k]) => k)
                .join(', ');
              layer.bindTooltip(
                `<strong>Flood Risk: ${((m.flood_score || 0) * 100).toFixed(0)}%</strong><br/>` +
                `Flow accumulation: ${((m.flow_accum_pct || 0) * 100).toFixed(0)}%<br/>` +
                `Depression: ${m.is_depression ? 'Yes' : 'No'}<br/>` +
                `River proximity: ${((m.river_prox_pct || 0) * 100).toFixed(0)}%<br/>` +
                `Low-lying: ${((m.low_lying_pct || 0) * 100).toFixed(0)}%<br/>` +
                `<em>Coverage: ${coverageList || 'none'}</em>`,
                { sticky: true }
              );
            },
          });
        }
        return null;

      case 'grid_heat':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const score = feature?.properties?.metrics?.heat_score ?? 0;
              return {
                color: getHeatColor(score),
                weight: 0.5,
                fillColor: getHeatColor(score),
                fillOpacity: score > 0 ? 0.6 : 0.1,
                opacity: 0.8,
              };
            },
            onEachFeature: (feature, layer) => {
              const m = feature.properties?.metrics || {};
              const cov = feature.properties?.coverage || {};
              const coverageList = Object.entries(cov)
                .filter(([_, v]) => v)
                .map(([k]) => k)
                .join(', ');
              layer.bindTooltip(
                `<strong>Heat Risk: ${((m.heat_score || 0) * 100).toFixed(0)}%</strong><br/>` +
                `Building density: ${((m.building_density || 0) * 100).toFixed(0)}%<br/>` +
                `Population: ${m.pop_density_raw ? m.pop_density_raw.toFixed(0) + '/km²' : ((m.pop_density || 0) * 100).toFixed(0) + '%'}<br/>` +
                `Vegetation: ${((m.vegetation_pct || 0) * 100).toFixed(0)}%<br/>` +
                `Water cooling: ${((m.water_cooling || 0) * 100).toFixed(0)}%<br/>` +
                `<em>Coverage: ${coverageList || 'none'}</em>`,
                { sticky: true }
              );
            },
          });
        }
        return null;

      case 'grid_landslide':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const score = feature?.properties?.metrics?.landslide_score ?? 0;
              return {
                color: getLandslideColor(score),
                weight: 0.5,
                fillColor: getLandslideColor(score),
                fillOpacity: score > 0 ? 0.6 : 0.1,
                opacity: 0.8,
              };
            },
            onEachFeature: (feature, layer) => {
              const m = feature.properties?.metrics || {};
              const cov = feature.properties?.coverage || {};
              const coverageList = Object.entries(cov)
                .filter(([_, v]) => v)
                .map(([k]) => k)
                .join(', ');
              layer.bindTooltip(
                `<strong>Landslide Risk: ${((m.landslide_score || 0) * 100).toFixed(0)}%</strong><br/>` +
                `Slope: ${(m.slope_mean || 0).toFixed(1)} m/km<br/>` +
                `Canopy: ${((m.canopy_pct || 0) * 100).toFixed(0)}%<br/>` +
                `Low-lying: ${((m.low_lying_pct || 0) * 100).toFixed(0)}%<br/>` +
                `<em>Coverage: ${coverageList || 'none'}</em>`,
                { sticky: true }
              );
            },
          });
        }
        return null;

      case 'grid_population':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const density = feature?.properties?.metrics?.pop_density ?? 0;
              return {
                color: getPopulationColor(density),
                weight: 0.5,
                fillColor: getPopulationColor(density),
                fillOpacity: density > 0 ? 0.6 : 0.1,
                opacity: 0.8,
              };
            },
            onEachFeature: (feature, layer) => {
              const m = feature.properties?.metrics || {};
              const popRaw = m.pop_density_raw;
              const popDisplay = popRaw ? `${popRaw.toFixed(0)} people/km²` : 'No data';
              const popPct = ((m.pop_density || 0) * 100).toFixed(0);
              layer.bindTooltip(
                `<strong>Population: ${popDisplay}</strong><br/>` +
                `Normalized: ${popPct}% of max<br/>` +
                `Data: WorldPop 100m raster`,
                { sticky: true }
              );
            },
          });
        }
        return null;

      case 'grid_buildings':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const density = feature?.properties?.metrics?.building_density ?? 0;
              return {
                color: getBuildingColor(density),
                weight: 0.5,
                fillColor: getBuildingColor(density),
                fillOpacity: density > 0 ? 0.6 : 0.1,
                opacity: 0.8,
              };
            },
            onEachFeature: (feature, layer) => {
              const m = feature.properties?.metrics || {};
              const buildingPct = ((m.building_density || 0) * 100).toFixed(0);
              const impervPct = ((m.imperv_pct || 0) * 100).toFixed(0);
              layer.bindTooltip(
                `<strong>Building Density: ${buildingPct}%</strong><br/>` +
                `Impervious surface: ${impervPct}%<br/>` +
                `Data: OSM building footprints`,
                { sticky: true }
              );
            },
          });
        }
        return null;

      case 'elevation':
        if (data.contours?.features) {
          return L.geoJSON(data.contours, {
            style: (feature) => ({
              color: feature?.properties?.isMajor ? '#c9a87c' : '#a08060',
              weight: feature?.properties?.isMajor ? 1.5 : 0.8,
              opacity: feature?.properties?.isMajor ? 0.9 : 0.6,
            }),
            onEachFeature: (feature, layer) => {
              if (feature.properties?.elevation && feature.properties?.isMajor) {
                layer.bindTooltip(`${feature.properties.elevation}m`, { permanent: false, direction: 'center' });
              }
            },
          });
        }
        return null;
      
      case 'landcover':
        if (data.geoJson?.features) {
          const landcoverColors: { [key: string]: string } = {
            tree_cover: '#006400',
            shrubland: '#ffbb22',
            grassland: '#84cc16',
            cropland: '#f096ff',
            built_up: '#fa0000',
            bare_sparse: '#b4b4b4',
            water: '#0064c8',
            wetland: '#0096a0',
          };
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const props = feature?.properties || {};
              const lc = props.landcover_class || '';
              const landuse = props.landuse || '';
              const natural = props.natural || '';
              let color = landcoverColors[lc] || '#4ade80';
              if (!lc) {
                if (landuse === 'residential' || landuse === 'commercial' || landuse === 'industrial') color = '#fa0000';
                else if (natural === 'water' || landuse === 'reservoir') color = '#0064c8';
                else if (natural === 'wood' || landuse === 'forest') color = '#006400';
                else if (landuse === 'grass' || natural === 'grassland') color = '#84cc16';
              }
              return { color, weight: 1, fillColor: color, fillOpacity: 0.4, opacity: 0.7 };
            },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const lc = props.landcover_class || props.landuse || props.natural || 'Unknown';
              const lcDisplay = lc.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              layer.bindTooltip(`${name}Land cover: ${lcDisplay}`, { sticky: true });
            },
          });
        }
        return null;
      
      case 'surface_water':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: { color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.4, opacity: 0.8 },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              const waterType = props.water || props.natural || 'Water body';
              const intermittent = props.intermittent === 'yes' ? ' (seasonal)' : '';
              layer.bindTooltip(`${name}${waterType}${intermittent}`, { sticky: true });
            },
          });
        }
        return null;
      
      case 'rivers':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: (feature) => ({
              color: feature?.properties?.waterway === 'river' ? '#06b6d4' : '#22d3ee',
              weight: feature?.properties?.waterway === 'river' ? 2.5 : 1.5,
              opacity: 0.8,
            }),
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              const type = props.waterway || 'Waterway';
              layer.bindTooltip(`${name}${type.charAt(0).toUpperCase() + type.slice(1)}`, { sticky: true });
            },
          });
        }
        return null;
      
      case 'forest':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: { color: '#22c55e', weight: 1, fillColor: '#22c55e', fillOpacity: 0.4, opacity: 0.7 },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              const type = props.natural === 'wood' ? 'Natural woodland' : 'Forest';
              layer.bindTooltip(`${name}${type}`, { sticky: true });
            },
          });
        }
        return null;
      
      case 'population':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: { color: '#f97316', weight: 1, fillColor: '#f97316', fillOpacity: 0.3, opacity: 0.6 },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              layer.bindTooltip(`${name}Residential area`, { sticky: true });
            },
          });
        }
        return null;
      
      default:
        return null;
    }
  }, []);

  const toggleLayer = useCallback(async (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    if (layer.enabled) {
      const existingLayer = layerRefs.current.get(layerId);
      if (existingLayer && mapRef.current) {
        mapRef.current.removeLayer(existingLayer);
        layerRefs.current.delete(layerId);
      }
      setLayers(prev => prev.map(l => l.id === layerId ? { ...l, enabled: false } : l));
    } else {
      setLayers(prev => prev.map(l => l.id === layerId ? { ...l, enabled: true } : l));
      
      if (!layer.loaded) {
        try {
          const data = await loadLayerData(layerId);
          
          setLayers(prev => {
            const currentLayer = prev.find(l => l.id === layerId);
            if (!currentLayer?.enabled) {
              return prev;
            }
            
            if (mapRef.current && data) {
              const leafletLayer = createLayerFromData(layerId, data);
              if (leafletLayer) {
                leafletLayer.addTo(mapRef.current);
                layerRefs.current.set(layerId, leafletLayer);
              }
            }
            
            return prev.map(l => l.id === layerId ? { ...l, loaded: true, data } : l);
          });
        } catch (error) {
          console.error(`Failed to load layer ${layerId}:`, error);
          setLayers(prev => prev.map(l => l.id === layerId ? { ...l, enabled: false } : l));
        }
      } else if (layer.data && mapRef.current) {
        const leafletLayer = createLayerFromData(layerId, layer.data);
        if (leafletLayer) {
          leafletLayer.addTo(mapRef.current);
          layerRefs.current.set(layerId, leafletLayer);
        }
      }
    }
  }, [layers, loadLayerData, createLayerFromData]);

  useEffect(() => {
    if (!mapRef.current || !elevationData) return;

    const elevationLayer = layers.find(l => l.id === 'elevation');
    if (elevationLayer?.enabled && !layerRefs.current.has('elevation')) {
      const leafletLayer = createLayerFromData('elevation', elevationData);
      if (leafletLayer) {
        leafletLayer.addTo(mapRef.current);
        layerRefs.current.set('elevation', leafletLayer);
        setLayers(prev => prev.map(l => l.id === 'elevation' ? { ...l, loaded: true, data: elevationData } : l));
      }
    }
  }, [elevationData, layers, createLayerFromData]);

  const isNotFound = isSampleModeActive 
    ? (!sampleAction || !isSampleProjectInitiated)
    : (!projectData?.project && !isLoadingProject);

  if (isNotFound) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Link href={`${routePrefix}/cities`}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>
          <p>{t('project.notFound')}</p>
        </div>
      </div>
    );
  }

  const isLoading = isLoadingSampleData || (!isSampleModeActive && (isLoadingProject || isLoadingCity || boundaryMutation.isPending || elevationMutation.isPending));

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-3 flex items-center gap-4 border-b">
          <Link href={`${routePrefix}/project/${projectId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <span className="font-semibold">{t('siteExplorer.title')}</span>
            {isSampleModeActive && (
              <Badge variant="secondary" className="text-xs">{t('cityInfo.sampleDataBadge')}</Badge>
            )}
            {(sampleAction || projectData?.project) && (
              <span className="text-muted-foreground text-sm">
                {sampleAction?.name || projectData?.project?.actionName}
              </span>
            )}
          </div>
        </div>
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {isLoadingSampleData 
                    ? t('siteExplorer.loadingData')
                    : boundaryMutation.isPending 
                      ? t('siteExplorer.loadingBoundary')
                      : t('siteExplorer.loadingElevation')}
                </p>
              </div>
            </div>
          )}
          
          <div className="absolute top-4 right-4 z-[1000]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowLayerPanel(!showLayerPanel)}
              className="shadow-lg"
            >
              <Layers className="h-4 w-4 mr-2" />
              Layers
            </Button>
          </div>
          
          {showLayerPanel && (
            <div className="absolute top-14 right-4 z-[1000] bg-zinc-900/95 backdrop-blur-sm rounded-lg shadow-xl border border-zinc-700 p-4 min-w-[240px]">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-700">
                <span className="font-medium text-sm text-white">Data Layers</span>
                <span className="text-xs text-zinc-400">
                  {layers.filter(l => l.enabled).length}/{layers.length}
                </span>
              </div>
              <div className="space-y-1">
                {layers.map((layer) => {
                  const IconComponent = layer.icon;
                  return (
                    <div 
                      key={layer.id}
                      className="flex items-center justify-between py-2 px-2 rounded hover:bg-zinc-800/70 transition-colors cursor-pointer"
                      onClick={() => toggleLayer(layer.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: layer.enabled ? layer.color : 'transparent', border: `2px solid ${layer.color}` }}
                        />
                        <IconComponent className="h-4 w-4" style={{ color: layer.color }} />
                        <span className="text-sm text-white font-medium">{layer.name}</span>
                      </div>
                      <Switch
                        checked={layer.enabled}
                        onCheckedChange={() => toggleLayer(layer.id)}
                        className="scale-75"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedZone && (
            <div className="absolute top-4 left-4 z-[1000] w-[420px] max-h-[calc(100vh-160px)] bg-background rounded-lg shadow-xl border overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-muted/50 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: TYPOLOGY_COLORS[selectedZone.typologyLabel] || '#10b981' }}
                    />
                    <div>
                      <h3 className="font-semibold">{selectedZone.zoneId}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t(`interventionZones.typologies.${selectedZone.typologyLabel}`)}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedZone(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-blue-50 dark:bg-blue-950">
                    <div className="text-lg font-semibold text-blue-600">{((selectedZone.meanFlood || 0) * 100).toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground">{t('interventionZones.metrics.meanFlood')}</div>
                  </div>
                  <div className="p-2 rounded bg-red-50 dark:bg-red-950">
                    <div className="text-lg font-semibold text-red-600">{((selectedZone.meanHeat || 0) * 100).toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground">{t('interventionZones.metrics.meanHeat')}</div>
                  </div>
                  <div className="p-2 rounded bg-amber-50 dark:bg-amber-950">
                    <div className="text-lg font-semibold text-amber-600">{((selectedZone.meanLandslide || 0) * 100).toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground">{t('interventionZones.metrics.meanLandslide')}</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{t('interventionZones.metrics.area')}: {(selectedZone.areaKm2 || 0).toFixed(1)} km²</span>
                  {selectedZone.populationSum && (
                    <span>Pop: {(selectedZone.populationSum / 1000).toFixed(0)}K</span>
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {!selectedCategory ? (
                    <>
                      <h4 className="font-medium text-sm">Select Intervention Category</h4>
                      <div className="space-y-2">
                        {getApplicableCategories(selectedZone.typologyLabel).map(category => (
                          <button
                            key={category.id}
                            className="w-full p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left flex items-center gap-3"
                            onClick={() => setSelectedCategory(category.id)}
                          >
                            <div 
                              className="p-2 rounded-lg"
                              style={{ backgroundColor: `${category.color}20`, color: category.color }}
                            >
                              {getCategoryIcon(category.icon)}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{category.name}</div>
                              <div className="text-sm text-muted-foreground">{category.description}</div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </button>
                        ))}
                      </div>

                      {(zonePortfolios[selectedZone.zoneId]?.length || 0) > 0 && (
                        <div className="mt-6">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-sm">Selected Interventions</h4>
                            <Badge variant="secondary">{zonePortfolios[selectedZone.zoneId]?.length || 0}</Badge>
                          </div>
                          <div className="space-y-2">
                            {zonePortfolios[selectedZone.zoneId]?.map(intervention => (
                              <div key={intervention.interventionId} className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-sm">{intervention.interventionName}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatCost(intervention.estimatedCost.min, intervention.estimatedCost.max)}
                                  </div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => removeInterventionFromPortfolio(selectedZone.zoneId, intervention.interventionId)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)}>
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Back
                        </Button>
                        <span className="font-medium">
                          {interventionsData?.categories[selectedCategory]?.name}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {getInterventionsByCategory(selectedCategory).map(intervention => {
                          const isSelected = zonePortfolios[selectedZone.zoneId]?.some(
                            i => i.interventionId === intervention.id
                          );
                          
                          return (
                            <Card key={intervention.id} className={isSelected ? 'border-primary bg-primary/5' : ''}>
                              <CardHeader className="p-4 pb-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <CardTitle className="text-base">{intervention.name}</CardTitle>
                                    <CardDescription className="mt-1">{intervention.description}</CardDescription>
                                  </div>
                                  <Button
                                    variant={isSelected ? 'secondary' : 'default'}
                                    size="sm"
                                    onClick={() => {
                                      if (isSelected) {
                                        removeInterventionFromPortfolio(selectedZone.zoneId, intervention.id);
                                      } else {
                                        addInterventionToPortfolio(selectedZone.zoneId, intervention, selectedZone.areaKm2 || 1);
                                      }
                                    }}
                                  >
                                    {isSelected ? (
                                      <>
                                        <Check className="h-4 w-4 mr-1" />
                                        Added
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="h-4 w-4 mr-1" />
                                        Add
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </CardHeader>
                              <CardContent className="p-4 pt-2 space-y-3">
                                <div className="flex flex-wrap gap-2">
                                  <div className="flex items-center gap-1 text-sm">
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    <span>{intervention.costRange.min.toLocaleString()}-{intervention.costRange.max.toLocaleString()} {intervention.costRange.unit}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-sm">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span>{intervention.timeToImplement.min}-{intervention.timeToImplement.max} {intervention.timeToImplement.unit}</span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-1">
                                  <Badge className={getImpactBadgeColor(intervention.impacts.flood)}>
                                    Flood: {intervention.impacts.flood}
                                  </Badge>
                                  <Badge className={getImpactBadgeColor(intervention.impacts.heat)}>
                                    Heat: {intervention.impacts.heat}
                                  </Badge>
                                  <Badge className={getImpactBadgeColor(intervention.impacts.landslide)}>
                                    Landslide: {intervention.impacts.landslide}
                                  </Badge>
                                </div>

                                <Accordion type="single" collapsible className="w-full">
                                  <AccordionItem value="details" className="border-none">
                                    <AccordionTrigger className="py-2 text-sm">
                                      More details
                                    </AccordionTrigger>
                                    <AccordionContent className="text-sm space-y-2">
                                      <div>
                                        <span className="font-medium">Scale:</span> {intervention.typicalScale.min}-{intervention.typicalScale.max} {intervention.typicalScale.unit}
                                      </div>
                                      <div>
                                        <span className="font-medium">Implementation:</span> {intervention.implementationNotes}
                                      </div>
                                      <div>
                                        <span className="font-medium">Maintenance:</span> {intervention.maintenanceRequirements}
                                      </div>
                                      <div>
                                        <span className="font-medium">Co-benefits:</span> {intervention.cobenefits.join(', ')}
                                      </div>
                                    </AccordionContent>
                                  </AccordionItem>
                                </Accordion>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>

              {(zonePortfolios[selectedZone.zoneId]?.length || 0) > 0 && (
                <div className="p-4 border-t bg-muted/30 flex-shrink-0">
                  <Button className="w-full" onClick={savePortfolioToContext}>
                    <Check className="h-4 w-4 mr-2" />
                    Save Interventions ({zonePortfolios[selectedZone.zoneId]?.length || 0})
                  </Button>
                </div>
              )}
            </div>
          )}
          
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
