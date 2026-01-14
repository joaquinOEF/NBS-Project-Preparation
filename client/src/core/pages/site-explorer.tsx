import { useParams, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Map, Mountain, Loader2 } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { DisplayLarge } from '@oef/components';
import { Badge } from '@/core/components/ui/badge';
import { Card, CardContent } from '@/core/components/ui/card';
import { Skeleton } from '@/core/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { useSampleData, SAMPLE_CITY_BOUNDARY, SAMPLE_ELEVATION_DATA } from '@/core/contexts/sample-data-context';
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

  const action = isSampleModeActive 
    ? sampleActions.find(a => a.id === projectId)
    : null;

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

  useEffect(() => {
    if (isSampleModeActive) {
      setBoundaryData(SAMPLE_CITY_BOUNDARY);
      setElevationData(SAMPLE_ELEVATION_DATA);
      return;
    }

    if (cityName && cityLocode && !boundaryData && !boundaryMutation.isPending) {
      boundaryMutation.mutate({ cityName, cityLocode });
    }
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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    if (boundaryData.boundaryGeoJson) {
      const boundaryLayer = L.geoJSON(boundaryData.boundaryGeoJson, {
        style: {
          color: '#3b82f6',
          weight: 3,
          fillColor: '#3b82f6',
          fillOpacity: 0.1,
          dashArray: '5, 5',
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
          color: feature?.properties?.isMajor ? '#8b5cf6' : '#c4b5fd',
          weight: feature?.properties?.isMajor ? 2 : 1,
          opacity: 0.8,
        }),
        onEachFeature: (feature, layer) => {
          if (feature.properties?.elevation) {
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
    ? !action
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

  const isLoading = !isSampleModeActive && (isLoadingProject || isLoadingCity || boundaryMutation.isPending || elevationMutation.isPending);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Link href={`${routePrefix}/project/${projectId}`}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </Link>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <DisplayLarge>{t('siteExplorer.title')}</DisplayLarge>
            {isSampleModeActive && (
              <Badge variant="secondary">{t('cityInfo.sampleDataBadge')}</Badge>
            )}
          </div>
          {action && (
            <p className="text-muted-foreground">{action.name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Card className="h-[600px]">
              <CardContent className="p-0 h-full relative">
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        {boundaryMutation.isPending 
                          ? t('siteExplorer.loadingBoundary')
                          : t('siteExplorer.loadingElevation')}
                      </p>
                    </div>
                  </div>
                )}
                <div ref={mapContainerRef} className="h-full w-full rounded-lg" />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Map className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">{t('siteExplorer.cityInfo')}</h3>
                </div>
                {boundaryData ? (
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">{t('siteExplorer.cityName')}</dt>
                      <dd className="font-medium">{boundaryData.cityName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('siteExplorer.coordinates')}</dt>
                      <dd className="font-medium font-mono text-xs">
                        {boundaryData.centroid[1].toFixed(4)}, {boundaryData.centroid[0].toFixed(4)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Mountain className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">{t('siteExplorer.elevationInfo')}</h3>
                </div>
                {elevationData ? (
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">{t('siteExplorer.elevationRange')}</dt>
                      <dd className="font-medium">
                        {elevationData.elevationData.minElevation.toFixed(0)}m - {elevationData.elevationData.maxElevation.toFixed(0)}m
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('siteExplorer.resolution')}</dt>
                      <dd className="font-medium">{elevationData.elevationData.cellSize}m</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{t('siteExplorer.contourLines')}</dt>
                      <dd className="font-medium">{elevationData.contours?.features?.length || 0}</dd>
                    </div>
                  </dl>
                ) : (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">{t('siteExplorer.legend')}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-blue-500" style={{ borderStyle: 'dashed' }} />
                    <span>{t('siteExplorer.cityBoundary')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-purple-600" />
                    <span>{t('siteExplorer.majorContour')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-purple-300" />
                    <span>{t('siteExplorer.minorContour')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
