import { useParams, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Layers, Mountain, Droplets, Trees, Users, Map as MapIcon, Grid3X3, Flame, CloudRain, Building2, MapPinned, MapPin, X, Plus, Check, DollarSign, Clock, Wrench, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, Leaf, Trash2, CheckCircle, Eye, EyeOff, Search, Info } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { Badge } from '@/core/components/ui/badge';
import { Switch } from '@/core/components/ui/switch';
import { Label } from '@/core/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/core/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/core/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/core/components/ui/tabs';
import { Input } from '@/core/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/core/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/core/components/ui/tooltip';
import { useToast } from '@/core/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useProjectContext, SelectedZone, SelectedIntervention } from '@/core/contexts/project-context';
import { useChatState } from '@/core/contexts/chat-context';
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
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
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

function formatZoneName(zoneId: string): string {
  if (zoneId.startsWith('zone_')) {
    return `Zone ${zoneId.replace('zone_', '')}`;
  }
  return zoneId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function SiteExplorerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isSampleMode, sampleCity, sampleActions, initiatedProjects } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [boundaryData, setBoundaryData] = useState<BoundaryData | null>(null);
  const [elevationData, setElevationData] = useState<ElevationData | null>(null);
  const [showEvidenceDrawer, setShowEvidenceDrawer] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [layers, setLayers] = useState<LayerState[]>(() => 
    LAYER_CONFIGS.map(config => ({
      ...config,
      enabled: config.id === 'intervention_zones',
      loaded: false,
      data: null,
      leafletLayer: null,
    }))
  );
  const layerRefs = useRef<Map<string, L.Layer>>(new Map());
  const layerDataCache = useRef<Map<string, any>>(new Map());
  const [loadingLayers, setLoadingLayers] = useState<Set<string>>(new Set());

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
  const [selectedZoneFeature, setSelectedZoneFeature] = useState<any | null>(null);
  const [interventionsData, setInterventionsData] = useState<InterventionsData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [zonePortfolios, setZonePortfolios] = useState<Record<string, SelectedIntervention[]>>({});
  const [osmAssets, setOsmAssets] = useState<any[]>([]);
  const [isLoadingOsmAssets, setIsLoadingOsmAssets] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [showAddAssetDialog, setShowAddAssetDialog] = useState(false);
  const [addAssetTab, setAddAssetTab] = useState<'search' | 'manual'>('search');
  const [osmSearchQuery, setOsmSearchQuery] = useState('');
  const [osmSearchResults, setOsmSearchResults] = useState<any[]>([]);
  const [isSearchingOsm, setIsSearchingOsm] = useState(false);
  const [manualAssetName, setManualAssetName] = useState('');
  const [manualAssetCoords, setManualAssetCoords] = useState('');
  const [manualAssetArea, setManualAssetArea] = useState('');
  const [manualAssetType, setManualAssetType] = useState('');
  const highlightLayerRef = useRef<L.Layer | null>(null);
  const osmLayerRef = useRef<L.Layer | null>(null);
  const selectedAssetMarkerRef = useRef<L.Marker | null>(null);
  const interventionMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const { updateModule, context, loadContext } = useProjectContext();
  const { setPageContext } = useChatState();
  const [navigationRestored, setNavigationRestored] = useState(false);

  useEffect(() => {
    const selectedZoneCount = Object.keys(zonePortfolios).length;
    const totalInterventions = Object.values(zonePortfolios).reduce((sum, p) => sum + p.length, 0);
    
    setPageContext({
      moduleName: 'Site Explorer',
      currentStep: selectedZone ? 'Zone Detail View' : 'Map Overview',
      stepNumber: selectedZone ? 1 : 0,
      totalSteps: 2,
      viewState: selectedZone ? 'zone-selected' : 'map-view',
      additionalInfo: {
        selectedZoneId: selectedZone?.zoneId || null,
        selectedZoneTypology: selectedZone?.typologyLabel || null,
        primaryHazard: selectedZone?.primaryHazard || null,
        selectedCategory,
        zonesWithInterventions: selectedZoneCount,
        totalInterventionsSelected: totalInterventions,
      }
    });
  }, [selectedZone, selectedCategory, zonePortfolios, setPageContext]);

  useEffect(() => {
    return () => setPageContext(null);
  }, [setPageContext]);

  useEffect(() => {
    fetch('/sample-data/interventions.json')
      .then(res => res.json())
      .then(data => setInterventionsData(data))
      .catch(err => console.error('Failed to load interventions data:', err));
  }, []);

  const portfolioHydratedRef = useRef(false);
  
  // Load context on mount to ensure portfolios can be hydrated on page reload
  useEffect(() => {
    if (projectId) {
      console.log('🔄 Loading context for project:', projectId);
      const loaded = loadContext(projectId);
      console.log('📦 Context loaded:', loaded?.siteExplorer?.selectedZones?.length, 'zones');
      
      // Hydrate portfolios immediately from loaded context
      if (loaded?.siteExplorer?.selectedZones && !portfolioHydratedRef.current) {
        const portfolios: Record<string, SelectedIntervention[]> = {};
        loaded.siteExplorer.selectedZones.forEach(zone => {
          if (typeof zone === 'object' && zone.interventionPortfolio && zone.interventionPortfolio.length > 0) {
            console.log(`   Zone ${zone.zoneId}: ${zone.interventionPortfolio?.length} interventions`);
            portfolios[zone.zoneId] = zone.interventionPortfolio;
          }
        });
        if (Object.keys(portfolios).length > 0) {
          console.log('✅ Setting zonePortfolios from loaded context:', Object.keys(portfolios));
          setZonePortfolios(portfolios);
        }
        portfolioHydratedRef.current = true;
      }
    }
  }, [projectId, loadContext]);
  
  // Fallback hydration from context state (for navigation from other pages)
  useEffect(() => {
    if (portfolioHydratedRef.current) return; // Already hydrated
    if (!context?.siteExplorer?.selectedZones) return;
    
    const portfolios: Record<string, SelectedIntervention[]> = {};
    context.siteExplorer.selectedZones.forEach(zone => {
      if (typeof zone === 'object' && zone.interventionPortfolio && zone.interventionPortfolio.length > 0) {
        portfolios[zone.zoneId] = zone.interventionPortfolio;
      }
    });
    if (Object.keys(portfolios).length > 0) {
      console.log('✅ Setting zonePortfolios from context state:', Object.keys(portfolios));
      setZonePortfolios(portfolios);
      portfolioHydratedRef.current = true;
    }
  }, [context]);

  // Listen for intervention site additions from chat drawer
  useEffect(() => {
    const handleInterventionAdded = (event: CustomEvent<{ zoneId: string; value: any }>) => {
      const { zoneId, value } = event.detail;
      console.log('🔔 Intervention site added event received:', zoneId, value);
      
      setZonePortfolios(prev => {
        const updated = { ...prev };
        if (!updated[zoneId]) {
          updated[zoneId] = [];
        }
        // Check if already exists
        const existingIndex = updated[zoneId].findIndex(i => i.assetId === value.assetId);
        if (existingIndex >= 0) {
          updated[zoneId][existingIndex] = value;
        } else {
          updated[zoneId] = [...updated[zoneId], value];
        }
        return updated;
      });
    };
    
    window.addEventListener('intervention-site-added', handleInterventionAdded as EventListener);
    return () => {
      window.removeEventListener('intervention-site-added', handleInterventionAdded as EventListener);
    };
  }, []);

  // Mark navigation as restored on mount
  // Note: Site Explorer navigation tracks whether user was viewing a zone detail,
  // but we can't restore the exact zone because zones are dynamically loaded from the map.
  // The saved state is still useful for analytics and future features.
  useEffect(() => {
    if (projectId && !navigationRestored) {
      setNavigationRestored(true);
    }
  }, [projectId, navigationRestored]);

  // Persist only navigation state when view changes
  useEffect(() => {
    if (!projectId || !navigationRestored) return;
    
    const existingContext = loadContext(projectId, { skipDbSync: true });
    const existingData = existingContext?.siteExplorer;
    if (!existingData) return;
    
    // Only update if navigation actually changed
    const newNav = {
      currentStep: selectedZone ? 1 : 0,
      additionalState: { selectedZoneId: selectedZone?.zoneId ?? null },
    };
    
    const oldNav = existingData.navigation;
    if (oldNav?.currentStep === newNav.currentStep && 
        oldNav?.additionalState?.selectedZoneId === newNav.additionalState.selectedZoneId) {
      return; // No change, skip update
    }
    
    updateModule('siteExplorer', {
      ...existingData,
      navigation: newNav,
    });
  }, [projectId, selectedZone, navigationRestored, updateModule, loadContext]);

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
    if (!mapRef.current) return;
    
    if (highlightLayerRef.current) {
      mapRef.current.removeLayer(highlightLayerRef.current);
      highlightLayerRef.current = null;
    }
    
    if (osmLayerRef.current) {
      mapRef.current.removeLayer(osmLayerRef.current);
      osmLayerRef.current = null;
    }
    
    const zonesLayer = layerRefs.current.get('intervention_zones') as L.GeoJSON | undefined;
    if (zonesLayer) {
      zonesLayer.eachLayer((layer: any) => {
        const feature = layer.feature;
        const typology = feature?.properties?.typologyLabel || 'LOW';
        const color = TYPOLOGY_COLORS[typology] || '#10b981';
        const isSelected = selectedZone?.zoneId === feature?.properties?.zoneId;
        
        layer.setStyle({
          color: isSelected ? 'transparent' : color,
          weight: isSelected ? 0 : 2,
          fillColor: color,
          fillOpacity: isSelected ? 0.15 : 0.4,
          opacity: isSelected ? 0 : 0.9,
        });
      });
    }
    
    if (selectedZoneFeature && selectedZone) {
      const highlightLayer = L.geoJSON(selectedZoneFeature, {
        style: {
          color: '#ffffff',
          weight: 3,
          fillColor: TYPOLOGY_COLORS[selectedZone.typologyLabel] || '#10b981',
          fillOpacity: 0.25,
          opacity: 1,
          dashArray: '6, 4',
        },
      });
      highlightLayer.addTo(mapRef.current);
      highlightLayerRef.current = highlightLayer;
      
      const bounds = highlightLayer.getBounds();
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [selectedZoneFeature, selectedZone]);

  const [osmResultsTruncated, setOsmResultsTruncated] = useState(false);
  const [osmShowAll, setOsmShowAll] = useState(false);
  const OSM_RESULT_LIMIT = 50;
  const OSM_EXTENDED_LIMIT = 200;

  const [osmError, setOsmError] = useState<string | null>(null);
  
  const fetchOsmAssets = useCallback(async (zoneFeature: any, category: string) => {
    if (!zoneFeature?.geometry || !interventionsData) return;
    
    setIsLoadingOsmAssets(true);
    setOsmAssets([]);
    setOsmResultsTruncated(false);
    setOsmShowAll(false);
    setOsmError(null);
    
    try {
      const categoryData = interventionsData.categories[category];
      const interventionsInCategory = interventionsData.interventions.filter(i => i.category === category);
      const osmTypes = Array.from(new Set(interventionsInCategory.flatMap(i => i.osmAssetTypes)));
      
      const coords = zoneFeature.geometry.type === 'Polygon' 
        ? zoneFeature.geometry.coordinates[0]
        : zoneFeature.geometry.coordinates[0][0];
      
      const lats = coords.map((c: number[]) => c[1]);
      const lngs = coords.map((c: number[]) => c[0]);
      const bbox: [number, number, number, number] = [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)];
      
      const zoneId = zoneFeature.properties?.zoneId || `zone_${bbox.join('_')}`;
      
      const response = await fetch('/api/geospatial/osm-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId,
          category,
          bbox,
          osmTypes,
          zoneGeometry: zoneFeature.geometry,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        const errorMessage = data.error || `Server error: ${response.status}`;
        setOsmError(errorMessage);
        return;
      }
      
      const assets = data.assets.map((a: any) => ({
        ...a,
        compatibleInterventions: interventionsInCategory.filter(i => 
          i.osmAssetTypes.some(t => a.assetType === t || Object.entries(a.tags || {}).some(([k, v]) => `${k}=${v}` === t))
        ),
      })).filter((a: any) => a.compatibleInterventions.length > 0);
      
      assets.sort((a: any, b: any) => {
        const aHasName = a.tags?.name ? 1 : 0;
        const bHasName = b.tags?.name ? 1 : 0;
        if (aHasName !== bHasName) return bHasName - aHasName;
        const aSize = a.area || a.length || 0;
        const bSize = b.area || b.length || 0;
        return bSize - aSize;
      });
      
      if (assets.length > OSM_EXTENDED_LIMIT) {
        setOsmResultsTruncated(true);
        setOsmAssets(assets.slice(0, OSM_EXTENDED_LIMIT));
      } else if (assets.length > OSM_RESULT_LIMIT) {
        setOsmResultsTruncated(true);
        setOsmAssets(assets);
      } else {
        setOsmAssets(assets);
      }
      
      if (data.fromCache) {
        console.log(`📦 Loaded ${assets.length} cached assets`);
      }
      
      const displayAssets = assets.slice(0, OSM_EXTENDED_LIMIT);
      
      if (mapRef.current && displayAssets.length > 0) {
        const geoJsonFeatures = {
          type: 'FeatureCollection',
          features: displayAssets.map((a: any) => ({
            type: 'Feature',
            geometry: a.geometry,
            properties: { ...a, geometry: undefined },
          })),
        };
        
        const osmLayer = L.geoJSON(geoJsonFeatures as any, {
          style: {
            color: categoryData?.color || '#3b82f6',
            weight: 3,
            fillColor: categoryData?.color || '#3b82f6',
            fillOpacity: 0.3,
          },
          pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 8,
              color: categoryData?.color || '#3b82f6',
              fillColor: categoryData?.color || '#3b82f6',
              fillOpacity: 0.6,
            });
          },
          onEachFeature: (feature, layer) => {
            const props = feature.properties;
            const sizeLabel = props.length > 0 ? `Length: ${props.length.toFixed(0)} m` : `Area: ${(props.area / 10000).toFixed(2)} ha`;
            layer.bindTooltip(`<strong>${props.name}</strong><br/>${props.assetType}<br/>${sizeLabel}`, { sticky: true });
            layer.on('click', () => {
              setSelectedAsset(props);
            });
          },
        });
        osmLayer.addTo(mapRef.current);
        osmLayerRef.current = osmLayer;
      }
    } catch (error: any) {
      console.error('Failed to fetch OSM assets:', error);
      setOsmError(t('siteExplorer.assetLoadErrorGeneric'));
    } finally {
      setIsLoadingOsmAssets(false);
    }
  }, [interventionsData, t]);

  const prevCategoryRef = useRef<string | null>(null);
  const prevZoneIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    const currentZoneId = selectedZoneFeature?.properties?.zoneId;
    const categoryChanged = selectedCategory !== prevCategoryRef.current;
    const zoneChanged = currentZoneId !== prevZoneIdRef.current;
    
    if (selectedCategory && selectedZoneFeature && (categoryChanged || zoneChanged)) {
      prevCategoryRef.current = selectedCategory;
      prevZoneIdRef.current = currentZoneId;
      fetchOsmAssets(selectedZoneFeature, selectedCategory);
    }
  }, [selectedCategory, selectedZoneFeature, fetchOsmAssets]);

  useEffect(() => {
    if (selectedAssetMarkerRef.current) {
      selectedAssetMarkerRef.current.remove();
      selectedAssetMarkerRef.current = null;
    }
    
    if (selectedAsset && selectedAsset.centroid && mapRef.current) {
      const [lat, lng] = selectedAsset.centroid;
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'selected-asset-marker',
          html: `<div style="width: 24px; height: 24px; background: #ef4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4);"></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      });
      marker.addTo(mapRef.current);
      selectedAssetMarkerRef.current = marker;
      mapRef.current.flyTo([lat, lng], 17, { duration: 0.5 });
    }
  }, [selectedAsset]);

  // Display intervention site markers on the map
  useEffect(() => {
    if (!mapRef.current) return;

    const getCategoryIcon = (category: string): { color: string; icon: string } => {
      switch (category) {
        case 'urban_cooling':
          return { color: '#22c55e', icon: '🌳' }; // green - trees/cooling
        case 'flood_storage':
          return { color: '#3b82f6', icon: '💧' }; // blue - water/flood
        case 'erosion':
          return { color: '#a16207', icon: '🏔️' }; // brown - slope
        default:
          return { color: '#8b5cf6', icon: '📍' }; // purple - default
      }
    };

    // Collect all current intervention IDs
    const currentInterventionIds = new Set<string>();
    
    Object.entries(zonePortfolios).forEach(([zoneId, interventions]) => {
      interventions.forEach(intervention => {
        if (intervention.centroid) {
          const markerId = `${zoneId}_${intervention.assetId || intervention.interventionId}`;
          currentInterventionIds.add(markerId);
          
          // Only add if not already on map
          if (!interventionMarkersRef.current.has(markerId)) {
            const [lat, lng] = intervention.centroid;
            const { color, icon } = getCategoryIcon(intervention.category);
            
            const marker = L.marker([lat, lng], {
              icon: L.divIcon({
                className: 'intervention-site-marker',
                html: `
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    background: ${color};
                    border: 3px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    font-size: 14px;
                  ">${icon}</div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
              }),
            });
            
            marker.bindTooltip(`
              <div style="font-size: 12px;">
                <strong>${intervention.assetName || 'Site'}</strong><br/>
                ${intervention.interventionName}<br/>
                <em style="color: #888;">${formatZoneName(zoneId)}</em>
              </div>
            `, { permanent: false, direction: 'top', offset: [0, -16] });
            
            marker.addTo(mapRef.current!);
            interventionMarkersRef.current.set(markerId, marker);
          }
        }
      });
    });
    
    // Remove markers that are no longer in portfolios
    interventionMarkersRef.current.forEach((marker, markerId) => {
      if (!currentInterventionIds.has(markerId)) {
        marker.remove();
        interventionMarkersRef.current.delete(markerId);
      }
    });
  }, [zonePortfolios, mapReady]);

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

    const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
      updateWhenZooming: true,
      updateWhenIdle: false,
      keepBuffer: 4,
    }).addTo(map);
    
    tileLayer.on('tileerror', (error: any) => {
      console.warn('Tile load error, retrying...', error.tile?.src);
      setTimeout(() => {
        if (error.tile) {
          error.tile.src = error.tile.src;
        }
      }, 1000);
    });
    
    map.on('zoomend moveend', () => {
      setTimeout(() => map.invalidateSize(), 100);
    });

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
    setMapReady(true);
    
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(() => map.invalidateSize(), 50);
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, [boundaryData]);

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 350);
    }
  }, [showEvidenceDrawer]);

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

  const sortedZonesByRisk = useMemo(() => {
    const zonesLayer = layers.find(l => l.id === 'intervention_zones');
    const features = zonesLayer?.data?.geoJson?.features || [];
    return features
      .map((f: any) => ({
        ...f.properties,
        geometry: f.geometry,
        maxRisk: Math.max(f.properties?.meanFlood || 0, f.properties?.meanHeat || 0, f.properties?.meanLandslide || 0),
      }))
      .sort((a: any, b: any) => b.maxRisk - a.maxRisk);
  }, [layers]);

  const evidenceLayers = useMemo(() => {
    return layers.filter(l => l.id !== 'intervention_zones');
  }, [layers]);

  const zonesLayerEnabled = useMemo(() => {
    return layers.find(l => l.id === 'intervention_zones')?.enabled ?? true;
  }, [layers]);

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
      return { ...prev, [zoneId]: existing.filter(i => {
        if (i.assetId) {
          return `${i.assetId}_${i.interventionId}` !== interventionId;
        }
        return i.interventionId !== interventionId;
      })};
    });
  }, []);

  const addAssetInterventionToPortfolio = useCallback((zoneId: string, asset: any, intervention: InterventionType) => {
    const areaM2 = asset.area || 10000;
    const areaHa = areaM2 / 10000;
    const lengthM = asset.length || 0;
    const costUnit = intervention.costRange.unit;
    let costMultiplier = 1;
    let estimatedMeasure = areaHa;
    let measureUnit = 'ha';
    
    if (costUnit === 'USD/ha') {
      costMultiplier = areaHa;
      estimatedMeasure = areaHa;
      measureUnit = 'ha';
    } else if (costUnit === 'USD/m²') {
      costMultiplier = areaM2;
      estimatedMeasure = areaM2;
      measureUnit = 'm²';
    } else if (costUnit === 'USD/m') {
      costMultiplier = lengthM > 0 ? lengthM : Math.sqrt(areaM2) * 4;
      estimatedMeasure = lengthM > 0 ? lengthM : Math.sqrt(areaM2) * 4;
      measureUnit = 'm';
    } else {
      costMultiplier = areaHa;
      estimatedMeasure = areaHa;
      measureUnit = 'ha';
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
      estimatedArea: estimatedMeasure,
      areaUnit: measureUnit,
      impacts: intervention.impacts,
      addedAt: new Date().toISOString(),
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.assetType,
      osmId: asset.osmId,
      centroid: asset.centroid,
    };

    setZonePortfolios(prev => {
      const existing = prev[zoneId] || [];
      const filtered = existing.filter(i => i.assetId !== asset.id);
      return { ...prev, [zoneId]: [...filtered, newIntervention] };
    });
  }, []);

  const searchOsmByName = useCallback(async () => {
    if (!osmSearchQuery.trim() || !selectedZoneFeature || !selectedCategory) return;
    
    setIsSearchingOsm(true);
    setOsmSearchResults([]);
    
    try {
      const bounds = selectedZoneFeature.geometry.type === 'Polygon' 
        ? turf.bbox(selectedZoneFeature)
        : null;
      
      if (!interventionsData) return;
      
      const interventionsInCategory = interventionsData.interventions.filter(i => i.category === selectedCategory);
      const osmTypes = Array.from(new Set(interventionsInCategory.flatMap(i => i.osmAssetTypes)));
      
      const response = await apiRequest('POST', '/api/geospatial/osm-search', {
        query: osmSearchQuery,
        bbox: bounds,
        category: selectedCategory,
        osmTypes,
        zoneGeometry: selectedZoneFeature.geometry,
      });
      
      const data = await response.json();
      
      // Add compatible interventions to search results
      const assetsWithInterventions = (data.assets || []).map((asset: any) => ({
        ...asset,
        compatibleInterventions: interventionsInCategory,
      }));
      
      setOsmSearchResults(assetsWithInterventions);
    } catch (error) {
      console.error('OSM search error:', error);
      toast({
        title: 'Search failed',
        description: 'Could not search OpenStreetMap. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearchingOsm(false);
    }
  }, [osmSearchQuery, selectedZoneFeature, selectedCategory, interventionsData, toast]);

  const parseCoordinates = useCallback((coordString: string): { lat: number; lng: number } | null => {
    const cleaned = coordString.trim().replace(/\s+/g, ' ');
    const parts = cleaned.split(/[,\s]+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
    return null;
  }, []);

  const createManualAsset = useCallback(() => {
    if (!manualAssetName.trim() || !manualAssetCoords.trim() || !selectedCategory) return;
    
    const coords = parseCoordinates(manualAssetCoords);
    
    if (!coords) {
      toast({
        title: 'Invalid coordinates',
        description: 'Please enter valid coordinates in the format: latitude, longitude (e.g., -30.024, -51.220)',
        variant: 'destructive',
      });
      return;
    }
    
    const areaM2 = manualAssetArea ? parseFloat(manualAssetArea) * 10000 : 10000;
    const interventionsInCategory = interventionsData?.interventions.filter(i => i.category === selectedCategory) || [];
    
    const manualAsset = {
      id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: manualAssetName,
      assetType: manualAssetType || `manual=${selectedCategory}`,
      centroid: [coords.lat, coords.lng] as [number, number],
      area: areaM2,
      length: 0,
      compatibleInterventions: interventionsInCategory,
      source: 'manual' as const,
    };
    
    setOsmAssets(prev => [manualAsset, ...prev]);
    setSelectedAsset(manualAsset);
    setShowAddAssetDialog(false);
    setManualAssetName('');
    setManualAssetCoords('');
    setManualAssetArea('');
    setManualAssetType('');
  }, [manualAssetName, manualAssetCoords, manualAssetArea, manualAssetType, selectedCategory, interventionsData, toast, parseCoordinates]);

  const selectSearchResult = useCallback((asset: any) => {
    setOsmAssets(prev => {
      const exists = prev.some(a => a.id === asset.id);
      if (exists) return prev;
      return [asset, ...prev];
    });
    setSelectedAsset(asset);
    setShowAddAssetDialog(false);
    setOsmSearchQuery('');
    setOsmSearchResults([]);
  }, []);

  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  
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
    
    const zoneId = selectedZone?.zoneId;
    const interventionCount = zoneId ? zonePortfolios[zoneId]?.length || 0 : 0;
    
    setSaveSuccess(zoneId || null);
    toast({
      title: t('siteExplorer.interventionsSaved'),
      description: t('siteExplorer.interventionsSavedDescription', { count: interventionCount }),
    });
    
    setTimeout(() => setSaveSuccess(null), 2000);
  }, [projectId, zonePortfolios, layers, updateModule, selectedZone, toast, t]);

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
          // Calculate max and min risk across all zones for opacity normalization
          const features = data.geoJson.features;
          const risks = features.map((f: any) => 
            Math.max(f.properties?.meanFlood || 0, f.properties?.meanHeat || 0, f.properties?.meanLandslide || 0)
          );
          const globalMaxRisk = Math.max(...risks, 0.01);
          const globalMinRisk = Math.min(...risks);
          const riskRange = globalMaxRisk - globalMinRisk || 0.01;
          
          console.log('[Zones] Risk range:', globalMinRisk.toFixed(2), 'to', globalMaxRisk.toFixed(2));
          
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const typology = feature?.properties?.typologyLabel || 'LOW';
              const color = TYPOLOGY_COLORS[typology] || '#10b981';
              
              // Calculate this zone's risk and normalize opacity
              const p = feature?.properties || {};
              const zoneRisk = Math.max(p.meanFlood || 0, p.meanHeat || 0, p.meanLandslide || 0);
              // Normalize to 0-1 range based on actual min/max spread
              const normalizedRisk = (zoneRisk - globalMinRisk) / riskRange;
              // Fill opacity ranges from 0.08 (lowest risk) to 0.65 (highest risk)
              const fillOpacity = 0.08 + (normalizedRisk * 0.57);
              // Border opacity ranges from 0.3 (lowest risk) to 1.0 (highest risk)
              const borderOpacity = 0.3 + (normalizedRisk * 0.7);
              // Border weight also scales: 1px (lowest) to 3px (highest)
              const borderWeight = 1 + (normalizedRisk * 2);
              
              return {
                color: color,
                weight: borderWeight,
                fillColor: color,
                fillOpacity: fillOpacity,
                opacity: borderOpacity,
              };
            },
            onEachFeature: (feature, layer) => {
              const p = feature.properties || {};
              const typologyLabel = t(`interventionZones.typologies.${p.typologyLabel}`) || p.typologyLabel;
              const interventionLabel = t(`interventionZones.interventions.${p.interventionType}`) || p.interventionType;
              const interventionDesc = t(`interventionZones.interventions.${p.interventionType}_desc`) || '';
              
              let tooltip = `<div style="min-width: 200px;">` +
                `<strong style="font-size: 14px;">${formatZoneName(p.zoneId)}: ${typologyLabel}</strong><br/>` +
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
                setSelectedZoneFeature(feature);
                setSelectedCategory(null);
                setSelectedAsset(null);
                setOsmAssets([]);
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
    setLayers(prev => {
      const layer = prev.find(l => l.id === layerId);
      if (!layer) return prev;

      if (layer.enabled) {
        // Toggling OFF - remove layer from map
        console.log(`[Layer] Toggling OFF: ${layerId}`);
        const existingLayer = layerRefs.current.get(layerId);
        console.log(`[Layer] Found in refs: ${!!existingLayer}, map exists: ${!!mapRef.current}`);
        if (existingLayer && mapRef.current) {
          try {
            mapRef.current.removeLayer(existingLayer);
            console.log(`[Layer] Successfully removed: ${layerId}`);
          } catch (e) {
            console.error(`[Layer] Failed to remove: ${layerId}`, e);
          }
          layerRefs.current.delete(layerId);
        }
        return prev.map(l => l.id === layerId ? { ...l, enabled: false } : l);
      } else {
        // Toggling ON - add layer to map
        console.log(`[Layer] Toggling ON: ${layerId}`);
        
        // Safety: remove any existing layer first to prevent duplicates
        const existingLayer = layerRefs.current.get(layerId);
        if (existingLayer && mapRef.current) {
          mapRef.current.removeLayer(existingLayer);
          layerRefs.current.delete(layerId);
        }
        
        const cachedData = layerDataCache.current.get(layerId);
        
        if (cachedData && mapRef.current) {
          console.log(`[Layer] Using cached data for: ${layerId}`);
          const leafletLayer = createLayerFromData(layerId, cachedData);
          if (leafletLayer) {
            leafletLayer.addTo(mapRef.current);
            layerRefs.current.set(layerId, leafletLayer);
            console.log(`[Layer] Added from cache: ${layerId}, ref set: ${layerRefs.current.has(layerId)}`);
          }
          return prev.map(l => l.id === layerId ? { ...l, enabled: true, loaded: true, data: cachedData } : l);
        }
        
        if (layer.loaded && layer.data && mapRef.current) {
          console.log(`[Layer] Using layer.data for: ${layerId}`);
          const leafletLayer = createLayerFromData(layerId, layer.data);
          if (leafletLayer) {
            leafletLayer.addTo(mapRef.current);
            layerRefs.current.set(layerId, leafletLayer);
            console.log(`[Layer] Added from layer.data: ${layerId}, ref set: ${layerRefs.current.has(layerId)}`);
          }
          return prev.map(l => l.id === layerId ? { ...l, enabled: true } : l);
        }
        
        setLoadingLayers(prev => new Set(prev).add(layerId));
        console.log(`[Layer] Starting async load for: ${layerId}`);
        
        loadLayerData(layerId).then(data => {
          setLoadingLayers(prev => {
            const next = new Set(prev);
            next.delete(layerId);
            return next;
          });
          
          if (data) {
            layerDataCache.current.set(layerId, data);
            
            setLayers(currentLayers => {
              const currentLayer = currentLayers.find(l => l.id === layerId);
              if (!currentLayer?.enabled) {
                console.log(`[Layer] Async complete but disabled, skipping: ${layerId}`);
                return currentLayers;
              }
              
              if (layerRefs.current.has(layerId)) {
                console.log(`[Layer] Async complete but already added, skipping: ${layerId}`);
                return currentLayers.map(l => l.id === layerId ? { ...l, loaded: true, data } : l);
              }
              
              if (mapRef.current) {
                const leafletLayer = createLayerFromData(layerId, data);
                if (leafletLayer) {
                  leafletLayer.addTo(mapRef.current);
                  layerRefs.current.set(layerId, leafletLayer);
                  console.log(`[Layer] Added from async: ${layerId}, ref set: ${layerRefs.current.has(layerId)}`);
                }
              }
              
              return currentLayers.map(l => l.id === layerId ? { ...l, loaded: true, data } : l);
            });
          }
        }).catch(error => {
          console.error(`Failed to load layer ${layerId}:`, error);
          setLoadingLayers(prev => {
            const next = new Set(prev);
            next.delete(layerId);
            return next;
          });
          setLayers(currentLayers => currentLayers.map(l => l.id === layerId ? { ...l, enabled: false } : l));
        });
        
        return prev.map(l => l.id === layerId ? { ...l, enabled: true } : l);
      }
    });
  }, [loadLayerData, createLayerFromData]);

  // Cache elevation data when it arrives (don't auto-add to map)
  useEffect(() => {
    if (elevationData) {
      layerDataCache.current.set('elevation', elevationData);
      setLayers(prev => prev.map(l => l.id === 'elevation' ? { ...l, loaded: true, data: elevationData } : l));
    }
  }, [elevationData]);

  // Load and display intervention zones layer in sample mode
  useEffect(() => {
    if (!mapReady || !isSampleModeActive || !mapRef.current) return;
    
    const zonesLayer = layers.find(l => l.id === 'intervention_zones');
    
    // If layer is enabled and not yet on map, add it
    if (zonesLayer?.enabled && !layerRefs.current.has('intervention_zones')) {
      if (layerDataCache.current.has('intervention_zones')) {
        // Data already cached, just add the layer
        const data = layerDataCache.current.get('intervention_zones');
        const leafletLayer = createLayerFromData('intervention_zones', data);
        if (leafletLayer && mapRef.current) {
          leafletLayer.addTo(mapRef.current);
          layerRefs.current.set('intervention_zones', leafletLayer);
          console.log('[Layer] Auto-added intervention_zones from cache on mount');
        }
      } else {
        // Load data and add to map
        loadLayerData('intervention_zones').then(data => {
          if (data) {
            layerDataCache.current.set('intervention_zones', data);
            setLayers(prev => prev.map(l => l.id === 'intervention_zones' ? { ...l, loaded: true, data } : l));
            
            // Add to map if still enabled and map exists
            if (mapRef.current && !layerRefs.current.has('intervention_zones')) {
              const leafletLayer = createLayerFromData('intervention_zones', data);
              if (leafletLayer) {
                leafletLayer.addTo(mapRef.current);
                layerRefs.current.set('intervention_zones', leafletLayer);
                console.log('[Layer] Auto-added intervention_zones after load');
              }
            }
          }
        });
      }
    }
  }, [mapReady, isSampleModeActive, loadLayerData, layers, createLayerFromData]);

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
          {/* Map container - leaves room for right panel and bottom drawer */}
          <div 
            ref={mapContainerRef} 
            className="absolute top-0 left-0 z-0 h-full"
            style={{ 
              right: '320px', 
              bottom: showEvidenceDrawer ? '180px' : '48px',
              transition: 'bottom 0.3s ease'
            }}
          />
          
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 pointer-events-none">
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
          
          {/* Right Panel - Zone Priority List (Frosted Glass) - ends at 30% from bottom */}
          <div 
            className="absolute top-0 right-0 w-[320px] z-[1001] bg-zinc-900/80 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col rounded-bl-xl"
            style={{ pointerEvents: 'auto', bottom: '30%' }}
            onWheel={(e) => e.stopPropagation()}
            onMouseEnter={() => mapRef.current?.scrollWheelZoom.disable()}
            onMouseLeave={() => mapRef.current?.scrollWheelZoom.enable()}
          >
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPinned className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm text-white">{t('siteExplorer.zonePriority')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleLayer('intervention_zones')}
                  className="h-8 px-2 text-white hover:bg-white/10"
                >
                  {zonesLayerEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sortedZonesByRisk.length === 0 ? (
                <div className="text-center py-8 text-zinc-400 text-sm">
                  <MapPinned className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{t('siteExplorer.noZonesLoaded')}</p>
                </div>
              ) : (
                sortedZonesByRisk.map((zone: any) => {
                  const portfolio = zonePortfolios[zone.zoneId] || [];
                  const isSelected = selectedZone?.zoneId === zone.zoneId;
                  const groupedByCategory = portfolio.reduce((acc: any, item: SelectedIntervention) => {
                    if (!acc[item.category]) acc[item.category] = [];
                    acc[item.category].push(item);
                    return acc;
                  }, {});
                  
                  return (
                    <div 
                      key={zone.zoneId}
                      className={`rounded-lg border transition-colors ${isSelected ? 'border-primary bg-primary/20' : 'border-white/5 hover:border-white/20 hover:bg-white/5'}`}
                    >
                      <button
                        className="w-full p-2 text-left flex items-center gap-2"
                        onClick={() => {
                          const zonesLayer = layerRefs.current.get('intervention_zones') as L.GeoJSON | undefined;
                          if (zonesLayer) {
                            zonesLayer.eachLayer((layer: any) => {
                              if (layer.feature?.properties?.zoneId === zone.zoneId) {
                                layer.fire('click');
                              }
                            });
                          }
                        }}
                      >
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: TYPOLOGY_COLORS[zone.typologyLabel] || '#10b981' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate text-white">{formatZoneName(zone.zoneId)}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
                              {(zone.maxRisk * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400">
                            {t(`interventionZones.typologies.${zone.typologyLabel}`)}
                          </div>
                        </div>
                        {portfolio.length > 0 && (
                          <Badge className="flex-shrink-0 text-xs bg-primary/20 text-primary-foreground border-primary/30">
                            {portfolio.length}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                      </button>
                      
                      {portfolio.length > 0 && (
                        <div className="px-2 pb-2 space-y-1">
                          {/* Only show +N more if total sites in zone > 5 */}
                          {portfolio.length <= 5 ? (
                            // Show all items when 5 or fewer
                            Object.entries(groupedByCategory).map(([category, items]: [string, any]) => (
                              <div key={category} className="ml-5 pl-2 border-l border-white/20">
                                <div className="text-xs text-zinc-400 font-medium py-1">
                                  {interventionsData?.categories[category]?.name || category} ({items.length})
                                </div>
                                {items.map((item: SelectedIntervention) => (
                                  <div key={item.assetId || item.interventionId} className="text-xs py-0.5 truncate text-zinc-300">
                                    {item.assetName || item.interventionName}
                                  </div>
                                ))}
                              </div>
                            ))
                          ) : (
                            // Show limited items with +N more when > 5 total
                            Object.entries(groupedByCategory).map(([category, items]: [string, any]) => (
                              <div key={category} className="ml-5 pl-2 border-l border-white/20">
                                <div className="text-xs text-zinc-400 font-medium py-1">
                                  {interventionsData?.categories[category]?.name || category} ({items.length})
                                </div>
                                {items.slice(0, 2).map((item: SelectedIntervention) => (
                                  <div key={item.assetId || item.interventionId} className="text-xs py-0.5 truncate text-zinc-300">
                                    {item.assetName || item.interventionName}
                                  </div>
                                ))}
                                {items.length > 2 && (
                                  <div className="text-xs text-zinc-500">+{items.length - 2} more</div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bottom Drawer - Evidence Layers - takes 70% width with rounded top-right */}
          <div 
            className={`absolute left-0 bottom-0 z-[1001] bg-zinc-900/95 backdrop-blur-sm border-t border-r border-zinc-700 transition-all duration-300 rounded-tr-xl ${showEvidenceDrawer ? 'h-[180px]' : 'h-[48px]'}`}
            style={{ pointerEvents: 'auto', width: '70%' }}
          >
            <button
              className="w-full h-[48px] px-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
              onClick={() => setShowEvidenceDrawer(!showEvidenceDrawer)}
            >
              <div className="flex items-center gap-3">
                <Layers className="h-4 w-4 text-zinc-400" />
                <span className="font-medium text-sm text-white">{t('siteExplorer.evidenceLayers')}</span>
                <span className="text-xs text-zinc-500">
                  {evidenceLayers.filter(l => l.enabled).length} active
                </span>
              </div>
              {showEvidenceDrawer ? (
                <ChevronDown className="h-5 w-5 text-zinc-400" />
              ) : (
                <ChevronUp className="h-5 w-5 text-zinc-400" />
              )}
            </button>
            
            {showEvidenceDrawer && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-5 gap-2">
                  {evidenceLayers.map((layer) => {
                    const IconComponent = layer.icon;
                    const isLoading = loadingLayers.has(layer.id);
                    return (
                      <button
                        key={layer.id}
                        className={`p-2 rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                          layer.enabled 
                            ? 'border-primary bg-primary/10' 
                            : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
                        } ${isLoading ? 'opacity-70' : ''}`}
                        onClick={() => toggleLayer(layer.id)}
                        disabled={isLoading}
                      >
                        <div 
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: layer.enabled ? `${layer.color}30` : 'transparent' }}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" style={{ color: layer.color }} />
                          ) : (
                            <IconComponent className="h-4 w-4" style={{ color: layer.enabled ? layer.color : '#71717a' }} />
                          )}
                        </div>
                        <span className={`text-xs text-center leading-tight ${layer.enabled ? 'text-white' : 'text-zinc-500'}`}>
                          {layer.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {selectedZone && (
            <div 
              className="site-explorer-panel absolute top-4 left-4 z-[1001] w-[420px] max-h-[calc(100vh-160px)] bg-background rounded-lg shadow-xl border overflow-hidden flex flex-col"
              style={{ pointerEvents: 'auto' }}
              onWheel={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onMouseEnter={() => mapRef.current?.scrollWheelZoom.disable()}
              onMouseLeave={() => mapRef.current?.scrollWheelZoom.enable()}
            >
              <div className="p-4 border-b bg-muted/50 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: TYPOLOGY_COLORS[selectedZone.typologyLabel] || '#10b981' }}
                    />
                    <div>
                      <h3 className="font-semibold">{formatZoneName(selectedZone.zoneId)}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t(`interventionZones.typologies.${selectedZone.typologyLabel}`)}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => {
                    setSelectedZone(null);
                    setSelectedZoneFeature(null);
                    setSelectedCategory(null);
                    setSelectedAsset(null);
                    setOsmAssets([]);
                  }}>
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

              <div 
                className="flex-1 min-h-0 overflow-y-auto"
                style={{ pointerEvents: 'auto', maxHeight: 'calc(100vh - 350px)' }}
                onWheel={(e) => e.stopPropagation()}
              >
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
                            <h4 className="font-medium text-sm">Intervention Portfolio</h4>
                            <Badge variant="secondary">{zonePortfolios[selectedZone.zoneId]?.length || 0} sites</Badge>
                          </div>
                          <div className="space-y-2">
                            {zonePortfolios[selectedZone.zoneId]?.map(intervention => (
                              <div key={intervention.assetId || intervention.interventionId} className="p-3 rounded-lg border bg-muted/30">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    {intervention.assetName && (
                                      <div className="font-medium text-sm truncate">{intervention.assetName}</div>
                                    )}
                                    <div className={`text-sm ${intervention.assetName ? 'text-muted-foreground' : 'font-medium'}`}>
                                      {intervention.interventionName}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {intervention.estimatedArea?.toFixed(2) || '?'} {intervention.areaUnit || 'ha'}
                                      {intervention.estimatedCost && ` • ${formatCost(intervention.estimatedCost.min, intervention.estimatedCost.max)}`}
                                    </div>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="flex-shrink-0"
                                    onClick={() => removeInterventionFromPortfolio(
                                      selectedZone.zoneId, 
                                      intervention.assetId ? `${intervention.assetId}_${intervention.interventionId}` : intervention.interventionId
                                    )}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : !selectedAsset ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedCategory(null); setOsmAssets([]); }}>
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Back
                        </Button>
                        <span className="font-medium">
                          {interventionsData?.categories[selectedCategory]?.name}
                        </span>
                      </div>

                      {isLoadingOsmAssets ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">Searching for compatible assets...</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAddAssetDialog(true)}
                            className="gap-1 mt-2"
                          >
                            <Plus className="h-4 w-4" />
                            Add Custom Site
                          </Button>
                        </div>
                      ) : osmAssets.length === 0 ? (
                        <div className="text-center py-8">
                          <MapPinned className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                          {osmError ? (
                            <>
                              <p className="text-destructive font-medium">{t('siteExplorer.assetLoadError')}</p>
                              <p className="text-sm text-muted-foreground mt-1">{osmError}</p>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="mt-3"
                                onClick={() => selectedZoneFeature && selectedCategory && fetchOsmAssets(selectedZoneFeature, selectedCategory)}
                              >
                                {t('siteExplorer.assetLoadErrorRetry')}
                              </Button>
                            </>
                          ) : (
                            <>
                              <p className="text-muted-foreground">{t('siteExplorer.noAssetsError')}</p>
                              <p className="text-sm text-muted-foreground mt-1">{t('siteExplorer.noAssetsErrorDescription')}</p>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAddAssetDialog(true)}
                            className="gap-1 mt-3"
                          >
                            <Plus className="h-4 w-4" />
                            Add Custom Site
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm text-muted-foreground">
                              {osmResultsTruncated && !osmShowAll
                                ? `Showing top ${Math.min(OSM_RESULT_LIMIT, osmAssets.length)} assets (${osmAssets.length} available).`
                                : `Found ${osmAssets.length} compatible assets.`
                              }
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowAddAssetDialog(true)}
                              className="gap-1"
                            >
                              <Plus className="h-4 w-4" />
                              Add Custom Site
                            </Button>
                          </div>
                          {osmResultsTruncated && !osmShowAll && osmAssets.length > OSM_RESULT_LIMIT && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mb-2"
                              onClick={() => setOsmShowAll(true)}
                            >
                              Show all {osmAssets.length} assets
                            </Button>
                          )}
                          {osmAssets.length >= OSM_EXTENDED_LIMIT && (
                            <div className="flex items-center gap-2 p-2 mb-2 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 rounded-lg text-xs">
                              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                              <span>Many assets in this zone. Select a smaller zone or zoom in for more targeted selection.</span>
                            </div>
                          )}
                          <div className="space-y-2">
                            {(osmShowAll ? osmAssets : osmAssets.slice(0, OSM_RESULT_LIMIT)).map(asset => {
                              const hasIntervention = zonePortfolios[selectedZone.zoneId]?.some(
                                i => i.assetId === asset.id
                              );
                              return (
                                <button
                                  key={asset.id}
                                  className={`w-full p-3 rounded-lg border transition-colors text-left flex items-center gap-3 ${
                                    hasIntervention 
                                      ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                                      : 'hover:border-primary hover:bg-primary/5'
                                  }`}
                                  onClick={() => setSelectedAsset(asset)}
                                >
                                  <div 
                                    className="p-2 rounded-lg"
                                    style={{ 
                                      backgroundColor: `${interventionsData?.categories[selectedCategory]?.color}20`, 
                                      color: interventionsData?.categories[selectedCategory]?.color 
                                    }}
                                  >
                                    <MapPinned className="h-5 w-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{asset.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {asset.assetType.split('=')[1]} • {asset.length > 0 ? `${asset.length.toFixed(0)} m` : `${(asset.area / 10000).toFixed(2)} ha`}
                                    </div>
                                  </div>
                                  {hasIntervention ? (
                                    <Badge className="bg-green-100 text-green-800 flex-shrink-0">
                                      <Check className="h-3 w-3 mr-1" />
                                      Assigned
                                    </Badge>
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedAsset(null)}>
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Back to assets
                        </Button>
                      </div>

                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="font-medium">{selectedAsset.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {selectedAsset.assetType.split('=')[1]} • {selectedAsset.length > 0 ? `${selectedAsset.length.toFixed(0)} m` : `${(selectedAsset.area / 10000).toFixed(2)} ha`}
                        </div>
                      </div>

                      <h4 className="font-medium text-sm mt-4">Select Intervention for this Asset</h4>
                      <div className="space-y-3">
                        {selectedAsset.compatibleInterventions.map((intervention: InterventionType) => {
                          const existingIntervention = zonePortfolios[selectedZone.zoneId]?.find(
                            i => i.assetId === selectedAsset.id
                          );
                          const isSelected = existingIntervention?.interventionId === intervention.id;
                          
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
                                        removeInterventionFromPortfolio(selectedZone.zoneId, `${selectedAsset.id}_${intervention.id}`);
                                      } else {
                                        addAssetInterventionToPortfolio(selectedZone.zoneId, selectedAsset, intervention);
                                      }
                                    }}
                                  >
                                    {isSelected ? (
                                      <>
                                        <Check className="h-4 w-4 mr-1" />
                                        Selected
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="h-4 w-4 mr-1" />
                                        Select
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
              </div>

              {(zonePortfolios[selectedZone.zoneId]?.length || 0) > 0 && (
                <div className="p-4 border-t bg-muted/30 flex-shrink-0" style={{ pointerEvents: 'auto' }}>
                  <Button 
                    className={`w-full relative z-10 transition-all ${saveSuccess === selectedZone.zoneId ? 'bg-green-600 hover:bg-green-600' : ''}`}
                    onClick={savePortfolioToContext} 
                    style={{ pointerEvents: 'auto' }}
                  >
                    {saveSuccess === selectedZone.zoneId ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('siteExplorer.saved')}
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        {t('siteExplorer.saveInterventions')} ({zonePortfolios[selectedZone.zoneId]?.length || 0})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAddAssetDialog} onOpenChange={setShowAddAssetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Asset</DialogTitle>
            <DialogDescription>
              Search for a location by name or manually enter coordinates.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 mb-4">
            <Button
              variant={addAssetTab === 'search' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setAddAssetTab('search')}
            >
              <Search className="h-4 w-4 mr-2" />
              Search OSM
            </Button>
            <Button
              variant={addAssetTab === 'manual' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setAddAssetTab('manual')}
            >
              <MapPin className="h-4 w-4 mr-2" />
              Manual Entry
            </Button>
          </div>
          
          {addAssetTab === 'search' ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search for a place (e.g., 'Central Park')"
                  value={osmSearchQuery}
                  onChange={(e) => setOsmSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchOsmByName()}
                />
                <Button onClick={searchOsmByName} disabled={isSearchingOsm}>
                  {isSearchingOsm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              
              {osmSearchResults.length > 0 && (
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {osmSearchResults.map((result: any) => (
                    <button
                      key={result.id}
                      className="w-full p-3 text-left rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                      onClick={() => selectSearchResult(result)}
                    >
                      <div className="font-medium">{result.name || result.assetType}</div>
                      <div className="text-xs text-muted-foreground">
                        {result.area ? `${(result.area / 10000).toFixed(2)} ha` : result.length ? `${result.length.toFixed(0)}m` : 'Point'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {isSearchingOsm && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="assetName">Site Name</Label>
                <Input
                  id="assetName"
                  placeholder="Enter a name for this site"
                  value={manualAssetName}
                  onChange={(e) => setManualAssetName(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="coords">Coordinates</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground">
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">
                        <strong>How to get coordinates from Google Maps:</strong><br />
                        1. Open Google Maps and find your location<br />
                        2. Right-click on the exact spot<br />
                        3. Click the coordinates shown at the top (they'll be copied)<br />
                        4. Paste here directly<br /><br />
                        <span className="text-muted-foreground">Format: latitude, longitude (e.g., -30.024, -51.220)</span>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="coords"
                  placeholder="-30.024, -51.220"
                  value={manualAssetCoords}
                  onChange={(e) => setManualAssetCoords(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="assetType">Site Type</Label>
                <Select value={manualAssetType} onValueChange={setManualAssetType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a site type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="park">Park / Green Space</SelectItem>
                    <SelectItem value="plaza">Plaza / Public Square</SelectItem>
                    <SelectItem value="street">Street / Road</SelectItem>
                    <SelectItem value="building">Building / Structure</SelectItem>
                    <SelectItem value="waterway">Waterway / Canal</SelectItem>
                    <SelectItem value="slope">Slope / Hillside</SelectItem>
                    <SelectItem value="wetland">Wetland / Retention Area</SelectItem>
                    <SelectItem value="rooftop">Rooftop</SelectItem>
                    <SelectItem value="parking">Parking Lot</SelectItem>
                    <SelectItem value="vacant">Vacant Land</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="area">Approximate Area (hectares, optional)</Label>
                <Input
                  id="area"
                  type="number"
                  step="0.01"
                  placeholder="1.0"
                  value={manualAssetArea}
                  onChange={(e) => setManualAssetArea(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={createManualAsset}
                disabled={!manualAssetName.trim() || !manualAssetCoords.trim()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Site
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
