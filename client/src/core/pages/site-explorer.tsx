import { useParams, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { Badge } from '@/core/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useSampleData, loadSampleBoundaryData, loadSampleElevationData } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useEffect, useRef, useState } from 'react';
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

export default function SiteExplorerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { isSampleMode, sampleCity, sampleActions, initiatedProjects } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [boundaryData, setBoundaryData] = useState<BoundaryData | null>(null);
  const [elevationData, setElevationData] = useState<ElevationData | null>(null);

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

  useEffect(() => {
    if (!mapRef.current || !elevationData) return;

    if (elevationData.contours && elevationData.contours.features) {
      L.geoJSON(elevationData.contours, {
        style: (feature) => ({
          color: feature?.properties?.isMajor ? '#c9a87c' : '#a08060',
          weight: feature?.properties?.isMajor ? 1.5 : 0.8,
          opacity: feature?.properties?.isMajor ? 0.9 : 0.6,
        }),
        onEachFeature: (feature, layer) => {
          if (feature.properties?.elevation && feature.properties?.isMajor) {
            layer.bindTooltip(`${feature.properties.elevation}m`, {
              permanent: false,
              direction: 'center',
            });
          }
        },
      }).addTo(mapRef.current);
    }
  }, [elevationData]);

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
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
