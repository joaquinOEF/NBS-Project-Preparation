import { useParams, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Layers, Mountain, Droplets, Trees, Users, Map as MapIcon, Grid3X3, Flame, CloudRain } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { Badge } from '@/core/components/ui/badge';
import { Switch } from '@/core/components/ui/switch';
import { Label } from '@/core/components/ui/label';
import { useTranslation } from 'react-i18next';
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
  { id: 'grid_flood', name: 'Flood Risk', icon: CloudRain, color: '#3b82f6' },
  { id: 'grid_heat', name: 'Heat Risk', icon: Flame, color: '#ef4444' },
  { id: 'grid_landslide', name: 'Landslide Risk', icon: Mountain, color: '#a16207' },
  { id: 'elevation', name: 'Elevation', icon: Mountain, color: '#c9a87c' },
  { id: 'landcover', name: 'Land Cover', icon: MapIcon, color: '#4ade80' },
  { id: 'surface_water', name: 'Water Bodies', icon: Droplets, color: '#3b82f6' },
  { id: 'rivers', name: 'Rivers', icon: Droplets, color: '#06b6d4' },
  { id: 'forest', name: 'Forest', icon: Trees, color: '#22c55e' },
  { id: 'population', name: 'Population', icon: Users, color: '#f97316' },
];

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
      case 'grid_flood':
      case 'grid_heat':
      case 'grid_landslide':
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

  const createLayerFromData = useCallback((layerId: string, data: any): L.Layer | null => {
    if (!data) return null;

    switch (layerId) {
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
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const landuse = feature?.properties?.landuse || '';
              const natural = feature?.properties?.natural || '';
              let color = '#4ade80';
              if (landuse === 'residential' || landuse === 'commercial' || landuse === 'industrial') color = '#f97316';
              else if (natural === 'water' || landuse === 'reservoir') color = '#3b82f6';
              else if (natural === 'wood' || landuse === 'forest') color = '#22c55e';
              else if (landuse === 'grass' || natural === 'grassland') color = '#84cc16';
              return { color, weight: 1, fillColor: color, fillOpacity: 0.3, opacity: 0.6 };
            },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const type = props.landuse || props.natural || 'Unknown';
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              layer.bindTooltip(`${name}Type: ${type}`, { sticky: true });
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
          
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
