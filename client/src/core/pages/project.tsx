import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Map, ArrowRight, DollarSign, Settings, Landmark, Database, ChevronRight, ChevronDown, Lightbulb, FileText, CheckCircle2, Circle, Download } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { DisplayLarge } from '@oef/components';
import { Badge } from '@/core/components/ui/badge';
import { Skeleton } from '@/core/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/core/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/core/components/ui/tabs';
import { Progress } from '@/core/components/ui/progress';
import { ScrollArea } from '@/core/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/core/components/ui/collapsible';
import { useTranslation } from 'react-i18next';
import { useSampleData, SAMPLE_DATA_READINESS, DataReadinessItem } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useProjectContext, ProjectContextData, SelectedZone } from '@/core/contexts/project-context';
import { computeReadinessScores, determinePathway } from '@/core/utils/funding-readiness';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { assembleConceptNote, ConceptNote } from '@/core/types/concept-note';

interface Project {
  id: string;
  actionId: string;
  actionName: string;
  actionDescription: string;
  actionType: string;
  cityId: string;
  status: string;
}

function ContextSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg mb-3">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-t-lg">
        <span className="font-medium text-sm">{title}</span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="p-3 pt-0 border-t">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    'NOT_STARTED': 'outline',
    'DRAFT': 'secondary',
    'READY': 'default',
  };
  const labels: Record<string, string> = {
    'NOT_STARTED': t('project.contextLabels.notStarted'),
    'DRAFT': t('project.contextLabels.draft'),
    'READY': t('project.contextLabels.ready'),
  };
  return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
}

function DataRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1">
      <span className="text-muted-foreground text-xs shrink-0">{label}:</span>
      <span className={`text-xs text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function FunderHighlight({ data }: { data: ProjectContextData['funderSelection'] | undefined }) {
  const { t } = useTranslation();
  
  if (!data || data.status === 'NOT_STARTED') {
    return (
      <div className="text-xs text-muted-foreground italic py-2 border-t mt-3">
        {t('project.highlights.funderEmpty')}
      </div>
    );
  }
  
  return (
    <div className="border-t mt-3 pt-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <StatusBadge status={data.status} />
        {data.pathway?.readinessLevel && (
          <Badge variant="outline" className="text-xs">{data.pathway.readinessLevel.replace(/_/g, ' ')}</Badge>
        )}
      </div>
      {data.pathway?.primary && (
        <div className="text-xs">
          <span className="text-muted-foreground">{t('project.highlights.pathway')}: </span>
          <span className="font-medium">{data.pathway.primary.replace(/_/g, ' ')}</span>
        </div>
      )}
      {(data.fundingPlan?.selectedFunderNowName || data.fundingPlan?.selectedFunderNextName) ? (
        <div className="text-xs space-y-1">
          {data.fundingPlan?.selectedFunderNowName && (
            <div>
              <span className="text-muted-foreground">{t('project.highlights.ppfFund')}: </span>
              <span className="font-medium">{data.fundingPlan.selectedFunderNowName}</span>
            </div>
          )}
          {data.fundingPlan?.selectedFunderNextName && (
            <div>
              <span className="text-muted-foreground">{t('project.highlights.targetFunder')}: </span>
              <span className="font-medium">{data.fundingPlan.selectedFunderNextName}</span>
            </div>
          )}
        </div>
      ) : data.shortlistedFunds?.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {data.shortlistedFunds.length} {t('project.highlights.fundsShortlisted')}
        </div>
      )}
    </div>
  );
}

function formatZoneName(zoneId: string): string {
  if (zoneId.startsWith('zone_')) {
    return `Zone ${zoneId.replace('zone_', '')}`;
  }
  return zoneId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function SiteExplorerHighlight({ data }: { data: ProjectContextData['siteExplorer'] | undefined }) {
  const { t } = useTranslation();
  
  if (!data || !data.selectedZones?.length) {
    return (
      <div className="text-xs text-muted-foreground italic py-2 border-t mt-3">
        {t('project.highlights.siteEmpty')}
      </div>
    );
  }
  
  const zonesWithInterventions = data.selectedZones.filter(
    zone => typeof zone === 'object' && zone.interventionPortfolio?.length > 0
  );
  
  return (
    <div className="border-t mt-3 pt-3 space-y-2">
      <div className="text-xs">
        <span className="font-medium">{data.selectedZones.length}</span>
        <span className="text-muted-foreground"> {t('project.highlights.zonesSelected')}</span>
      </div>
      {zonesWithInterventions.length > 0 && (
        <div className="space-y-1.5">
          {zonesWithInterventions.slice(0, 3).map((zone) => {
            if (typeof zone === 'string') return null;
            const zoneName = formatZoneName(zone.zoneName || zone.zoneId);
            const sitesByIntervention = zone.interventionPortfolio.reduce((acc, intervention) => {
              const key = intervention.interventionName;
              if (!acc[key]) acc[key] = [];
              if (intervention.assetName) {
                acc[key].push(intervention.assetName);
              }
              return acc;
            }, {} as Record<string, string[]>);
            
            return (
              <div key={zone.zoneId} className="text-xs">
                <span className="font-medium">{zoneName}:</span>
                <span className="text-muted-foreground ml-1">
                  {Object.entries(sitesByIntervention).map(([intervention, sites], idx) => (
                    <span key={intervention}>
                      {idx > 0 && ', '}
                      {sites.length > 0 ? sites.join(', ') : 'Zone-wide'} ({intervention})
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
          {zonesWithInterventions.length > 3 && (
            <div className="text-xs text-muted-foreground">
              +{zonesWithInterventions.length - 3} more zones
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OperationsHighlight({ data }: { data: ProjectContextData['operations'] | undefined }) {
  const { t } = useTranslation();
  
  if (!data || data.status === 'NOT_STARTED') {
    return (
      <div className="text-xs text-muted-foreground italic py-2 border-t mt-3">
        {t('project.highlights.opsEmpty')}
      </div>
    );
  }
  
  return (
    <div className="border-t mt-3 pt-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <StatusBadge status={data.status} />
      </div>
      {data.operatingModel && (
        <div className="text-xs">
          <span className="text-muted-foreground">{t('project.highlights.model')}: </span>
          <span className="font-medium">{data.operatingModel.replace(/_/g, ' ')}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {data.taskPlan?.length > 0 && (
          <span>{data.taskPlan.length} {t('project.highlights.tasks')}</span>
        )}
        {data.omCostBand?.low && data.omCostBand?.high && (
          <span>{data.omCostBand.currency} {(data.omCostBand.low / 1000).toFixed(0)}k-{(data.omCostBand.high / 1000).toFixed(0)}k</span>
        )}
      </div>
    </div>
  );
}

function BusinessModelHighlight({ data }: { data: ProjectContextData['businessModel'] | undefined }) {
  const { t } = useTranslation();
  
  if (!data || data.status === 'NOT_STARTED') {
    return (
      <div className="text-xs text-muted-foreground italic py-2 border-t mt-3">
        {t('project.highlights.bmEmpty')}
      </div>
    );
  }
  
  const highConfidenceRevenues = data.revenueStack?.filter(r => r.confidence === 'HIGH').length || 0;
  
  return (
    <div className="border-t mt-3 pt-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <StatusBadge status={data.status} />
      </div>
      {data.primaryArchetype && (
        <div className="text-xs">
          <span className="text-muted-foreground">{t('project.highlights.archetype')}: </span>
          <span className="font-medium">{data.primaryArchetype.replace(/_/g, ' ')}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {data.revenueStack?.length > 0 && (
          <span>{data.revenueStack.length} {t('project.highlights.revenueLines')}{highConfidenceRevenues > 0 && ` (${highConfidenceRevenues} HIGH)`}</span>
        )}
        {data.financingPathway?.pathway && (
          <Badge variant="outline" className="text-xs">{data.financingPathway.pathway.replace(/_/g, ' ')}</Badge>
        )}
      </div>
    </div>
  );
}

function ImpactModelHighlight({ data }: { data: ProjectContextData['impactModel'] | undefined }) {
  const { t } = useTranslation();
  
  if (!data || data.status === 'NOT_STARTED') {
    return (
      <div className="text-xs text-muted-foreground italic py-2 border-t mt-3">
        {t('project.highlights.impactEmpty')}
      </div>
    );
  }
  
  const totalSignals = Object.values(data.downstreamSignals || {}).flat().length;
  const includedCoBenefits = data.coBenefits?.filter(cb => cb.included).length || 0;
  
  return (
    <div className="border-t mt-3 pt-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <StatusBadge status={data.status} />
        {data.selectedLens && data.selectedLens !== 'neutral' && (
          <Badge variant="outline" className="text-xs">{data.selectedLens}</Badge>
        )}
      </div>
      {data.narrativeCache?.base && (
        <div className="text-xs text-muted-foreground">
          {data.narrativeCache.base.length} {t('project.highlights.narrativeBlocks')}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {includedCoBenefits > 0 && (
          <span>{includedCoBenefits} {t('project.highlights.coBenefits')}</span>
        )}
        {totalSignals > 0 && (
          <span>{totalSignals} {t('project.highlights.signals')}</span>
        )}
      </div>
    </div>
  );
}

const HAZARD_COLORS: Record<string, string> = {
  FLOOD: '#3b82f6',
  HEAT: '#ef4444',
  LANDSLIDE: '#a16207',
  FLOOD_HEAT: '#8b5cf6',
  FLOOD_LANDSLIDE: '#0891b2',
  HEAT_LANDSLIDE: '#db2777',
  LOW: '#10b981',
};

function EmptyCard({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Card className="border-dashed border-muted-foreground/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{t('project.overview.emptyState')}</p>
      </CardContent>
    </Card>
  );
}

function FunderReadinessCard({ data }: { data: ProjectContextData['funderSelection'] }) {
  const { t } = useTranslation();

  if (!data || data.status === 'NOT_STARTED') {
    return <EmptyCard title={t('project.overview.funderReadiness')} />;
  }

  const scores = computeReadinessScores(data.questionnaire || {});
  const pathway = determinePathway(data.questionnaire || {});

  const dimensionBars = [
    { label: t('project.overview.technical'), value: scores.technical, color: 'bg-blue-500' },
    { label: t('project.overview.financial'), value: scores.financial, color: 'bg-green-500' },
    { label: t('project.overview.political'), value: scores.political, color: 'bg-amber-500' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('project.overview.funderReadiness')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-3xl font-bold">{scores.overall}</div>
          <div className="flex-1 space-y-1">
            <div className="text-xs text-muted-foreground">{t('project.overview.overallScore')}</div>
            <Progress value={scores.overall} className="h-3" />
          </div>
          <Badge variant="outline">{scores.overallLabel.replace(/_/g, ' ')}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {dimensionBars.map(dim => (
            <div key={dim.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{dim.label}</span>
                <span className="font-medium">{dim.value}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${dim.color}`} style={{ width: `${dim.value}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <div className="text-xs text-muted-foreground">{t('project.overview.pathway')}:</div>
          <Badge variant="secondary">{pathway.primary.replace(/_/g, ' ')}</Badge>
          {pathway.secondary && (
            <Badge variant="outline">{pathway.secondary.replace(/_/g, ' ')}</Badge>
          )}
        </div>

        {pathway.limitingFactorKeys.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-muted-foreground">{t('project.overview.limitingFactors')}:</span>
            {pathway.limitingFactorKeys.map(f => (
              <Badge key={f} variant="outline" className="text-xs">{f.replace(/_/g, ' ')}</Badge>
            ))}
          </div>
        )}

        {data.targetFunders && data.targetFunders.length > 0 && (
          <div className="pt-2 border-t space-y-1">
            <div className="text-xs text-muted-foreground">{t('project.overview.targetFunders')}</div>
            {data.targetFunders.slice(0, 3).map(f => (
              <div key={f.fundId} className="flex justify-between items-center text-xs">
                <span className="font-medium">{f.fundName}</span>
                <Badge variant={f.confidence === 'high' ? 'default' : f.confidence === 'medium' ? 'secondary' : 'outline'} className="text-xs">
                  {f.confidence}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SiteOverviewCard({ data }: { data: ProjectContextData['siteExplorer'] }) {
  const { t } = useTranslation();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const zones: SelectedZone[] = data?.selectedZones
    ?.filter((z): z is SelectedZone => typeof z !== 'string') || [];

  useEffect(() => {
    if (!mapRef.current || zones.length === 0) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(map);

    const markers: L.CircleMarker[] = [];

    zones.forEach(zone => {
      const interventions = zone.interventionPortfolio || [];
      const firstWithCentroid = interventions.find(iv => iv.centroid);
      if (!firstWithCentroid?.centroid) return;

      const [lng, lat] = firstWithCentroid.centroid;
      const color = HAZARD_COLORS[zone.hazardType] || HAZARD_COLORS.LOW;

      const marker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: color,
        color: color,
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.4,
      }).addTo(map);

      marker.bindTooltip(`${zone.zoneName || formatZoneName(zone.zoneId)} (${zone.hazardType})`, {
        direction: 'top',
      });

      markers.push(marker);
    });

    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.3));
    } else {
      map.setView([-30.03, -51.23], 12);
    }

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [zones]);

  if (!data || !data.selectedZones?.length) {
    return <EmptyCard title={t('project.overview.siteOverview')} />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          {t('project.overview.siteOverview')} ({zones.length} {t('project.overview.zones')})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={mapRef} className="h-[280px] rounded-lg border overflow-hidden" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {zones.slice(0, 6).map(zone => (
            <div key={zone.zoneId} className="p-2 rounded-lg border text-xs space-y-1">
              <div className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: HAZARD_COLORS[zone.hazardType] || HAZARD_COLORS.LOW }}
                />
                <span className="font-medium truncate">{zone.zoneName || formatZoneName(zone.zoneId)}</span>
              </div>
              <div className="flex flex-wrap gap-1 text-muted-foreground">
                <span>{t('project.overview.hazard')}: {zone.hazardType.replace(/_/g, ' ')}</span>
                {zone.riskScore !== undefined && (
                  <span>| {t('project.overview.risk')}: {(zone.riskScore * 100).toFixed(0)}%</span>
                )}
                {zone.area && (
                  <span>| {zone.area.toFixed(2)} km²</span>
                )}
              </div>
              {zone.interventionPortfolio?.length > 0 && (
                <div className="text-muted-foreground">
                  {zone.interventionPortfolio.length} {t('project.overview.interventions')}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ImpactOverviewCard({ data }: { data: ProjectContextData['impactModel'] }) {
  const { t } = useTranslation();

  if (!data || data.status === 'NOT_STARTED') {
    return <EmptyCard title={t('project.overview.impactOverview')} />;
  }

  const includedCoBenefits = data.coBenefits?.filter(cb => cb.included) || [];
  const signals = data.downstreamSignals || { operations: [], businessModel: [], mrv: [], implementors: [] };
  const signalCounts = [
    { label: t('project.overview.operations'), count: signals.operations?.length || 0 },
    { label: t('project.overview.businessModelSignals'), count: signals.businessModel?.length || 0 },
    { label: t('project.overview.mrv'), count: signals.mrv?.length || 0 },
    { label: t('project.overview.implementors'), count: signals.implementors?.length || 0 },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('project.overview.impactOverview')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {includedCoBenefits.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">{t('project.overview.coBenefits')}</div>
            <div className="flex flex-wrap gap-1">
              {includedCoBenefits.slice(0, 5).map(cb => (
                <Badge key={cb.id} variant="secondary" className="text-xs">{cb.title}</Badge>
              ))}
              {includedCoBenefits.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  {t('project.overview.moreCount', { count: includedCoBenefits.length - 5 })}
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">{t('project.overview.downstreamSignals')}</div>
          <div className="grid grid-cols-4 gap-2">
            {signalCounts.map(s => (
              <div key={s.label} className="text-center p-2 rounded-lg bg-muted/50">
                <div className="text-lg font-bold">{s.count}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OperationsOverviewCard({ data }: { data: ProjectContextData['operations'] }) {
  const { t } = useTranslation();

  if (!data || data.status === 'NOT_STARTED') {
    return <EmptyCard title={t('project.overview.operationsOverview')} />;
  }

  const roleEntries = [
    { label: t('project.overview.assetOwner'), value: data.roles?.assetOwnerEntityId },
    { label: t('project.overview.programOwner'), value: data.roles?.programOwnerEntityId },
    { label: t('project.overview.operator'), value: data.roles?.operatorEntityId },
    { label: t('project.overview.maintainer'), value: data.roles?.maintainerEntityId },
    { label: t('project.overview.verifier'), value: data.roles?.verifierEntityId },
  ].filter(r => r.value);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('project.overview.operationsOverview')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.operatingModel && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('project.overview.operatingModel')}:</span>
            <Badge variant="secondary">{data.operatingModel.replace(/_/g, ' ')}</Badge>
          </div>
        )}

        {roleEntries.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">{t('project.overview.roles')}</div>
            <div className="grid grid-cols-2 gap-1">
              {roleEntries.map(r => (
                <DataRow key={r.label} label={r.label} value={r.value!} />
              ))}
            </div>
          </div>
        )}

        {data.omCostBand?.low != null && data.omCostBand?.high != null && (
          <div className="space-y-1 pt-2 border-t">
            <div className="text-xs text-muted-foreground">{t('project.overview.omCostBand')}</div>
            <div className="text-sm font-medium">
              {data.omCostBand.currency} {data.omCostBand.low.toLocaleString()} &ndash; {data.omCostBand.high.toLocaleString()}
            </div>
          </div>
        )}

        {data.nbsExtensions && (
          <div className="space-y-1 pt-2 border-t">
            <div className="text-xs text-muted-foreground">{t('project.overview.nbsParams')}</div>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs">
                {t('project.overview.establishment')}: {data.nbsExtensions.establishmentPeriodMonths} {t('project.overview.months')}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {t('project.overview.maintenance')}: {data.nbsExtensions.maintenanceIntensity}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {t('project.overview.survivalTarget')}: {data.nbsExtensions.survivalTargetPercent}%
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BusinessModelOverviewCard({ data }: { data: ProjectContextData['businessModel'] }) {
  const { t } = useTranslation();

  if (!data || data.status === 'NOT_STARTED') {
    return <EmptyCard title={t('project.overview.businessModelOverview')} />;
  }

  const topRevenue = data.revenueStack?.slice(0, 3) || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t('project.overview.businessModelOverview')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.primaryArchetype && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('project.overview.archetype')}:</span>
            <Badge variant="secondary">{data.primaryArchetype.replace(/_/g, ' ')}</Badge>
          </div>
        )}

        {topRevenue.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">{t('project.overview.revenueStack')}</div>
            {topRevenue.map(rev => (
              <div key={rev.id} className="flex items-center gap-2 text-xs">
                <Badge variant={rev.confidence === 'HIGH' ? 'default' : rev.confidence === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs shrink-0">
                  {rev.confidence}
                </Badge>
                <span>{rev.revenueType.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}

        {data.sourcesAndUsesRom && (data.sourcesAndUsesRom.capexBand || data.sourcesAndUsesRom.opexBand) && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            {data.sourcesAndUsesRom.capexBand && (
              <div>
                <div className="text-xs text-muted-foreground">{t('project.overview.capex')}</div>
                <div className="text-sm font-medium">
                  {data.sourcesAndUsesRom.capexBand.currency || 'USD'} {data.sourcesAndUsesRom.capexBand.low?.toLocaleString()} &ndash; {data.sourcesAndUsesRom.capexBand.high?.toLocaleString()}
                </div>
              </div>
            )}
            {data.sourcesAndUsesRom.opexBand && (
              <div>
                <div className="text-xs text-muted-foreground">{t('project.overview.opex')}</div>
                <div className="text-sm font-medium">
                  {data.sourcesAndUsesRom.opexBand.currency || 'USD'} {data.sourcesAndUsesRom.opexBand.low?.toLocaleString()} &ndash; {data.sourcesAndUsesRom.opexBand.high?.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        )}

        {data.financingPathway?.pathway && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground">{t('project.overview.financingPathway')}:</span>
            <Badge variant="outline">{data.financingPathway.pathway.replace(/_/g, ' ')}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectOverview({ context }: { context: ProjectContextData | null }) {
  if (!context) return null;

  return (
    <ScrollArea className="h-[65vh]">
      <div className="space-y-4 pr-4">
        <FunderReadinessCard data={context.funderSelection} />
        <SiteOverviewCard data={context.siteExplorer} />
        <ImpactOverviewCard data={context.impactModel} />
        <OperationsOverviewCard data={context.operations} />
        <BusinessModelOverviewCard data={context.businessModel} />
      </div>
    </ScrollArea>
  );
}

function DataFlowDiagram({ context }: { context: ProjectContextData | null }) {
  const { t } = useTranslation();
  
  const modules = [
    { 
      id: 'funder', 
      name: t('project.contextSections.funderSelection'),
      color: 'bg-green-500',
      hasData: Boolean(context?.funderSelection && context.funderSelection.status && context.funderSelection.status !== 'NOT_STARTED'),
      outputs: ['pathway', 'constraints', 'funds']
    },
    { 
      id: 'site', 
      name: t('project.contextSections.siteExplorer'),
      color: 'bg-blue-500',
      hasData: Boolean(context?.siteExplorer?.selectedZones && context.siteExplorer.selectedZones.length > 0),
      outputs: ['zones', 'risks', 'interventions']
    },
    { 
      id: 'impact', 
      name: t('project.contextSections.impactModel'),
      color: 'bg-purple-500',
      hasData: Boolean(context?.impactModel && context.impactModel.status && context.impactModel.status !== 'NOT_STARTED'),
      outputs: ['narratives', 'co-benefits', 'signals']
    },
    { 
      id: 'ops', 
      name: t('project.contextSections.operations'),
      color: 'bg-orange-500',
      hasData: Boolean(context?.operations && context.operations.status && context.operations.status !== 'NOT_STARTED'),
      outputs: ['costs', 'tasks', 'roles']
    },
    { 
      id: 'biz', 
      name: t('project.contextSections.businessModel'),
      color: 'bg-emerald-500',
      hasData: Boolean(context?.businessModel && context.businessModel.status && context.businessModel.status !== 'NOT_STARTED'),
      outputs: ['revenue', 'financing']
    },
  ];

  const connections = [
    { from: 'funder', to: 'impact', label: 'pathway' },
    { from: 'funder', to: 'biz', label: 'pathway' },
    { from: 'site', to: 'impact', label: 'zones' },
    { from: 'impact', to: 'ops', label: 'O&M signals' },
    { from: 'impact', to: 'biz', label: 'revenue signals' },
    { from: 'ops', to: 'biz', label: 'costs' },
  ];

  return (
    <div className="p-4 bg-muted/30 rounded-lg">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-5 gap-2">
          {modules.map((mod) => (
            <div 
              key={mod.id}
              className={`relative p-2 rounded-lg border-2 text-center text-xs ${
                mod.hasData 
                  ? `${mod.color}/20 border-current` 
                  : 'bg-muted/50 border-dashed border-muted-foreground/30'
              }`}
              style={{ borderColor: mod.hasData ? undefined : undefined }}
            >
              <div className={`w-2 h-2 rounded-full ${mod.hasData ? mod.color : 'bg-muted-foreground/30'} mx-auto mb-1`} />
              <span className={mod.hasData ? 'font-medium' : 'text-muted-foreground'}>
                {mod.name}
              </span>
              {mod.hasData && (
                <div className="mt-1 flex flex-wrap gap-0.5 justify-center">
                  {mod.outputs.map(o => (
                    <span key={o} className="text-[9px] bg-background/50 px-1 rounded">{o}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t('project.dataFlow.connections')}:</p>
          <div className="flex flex-wrap gap-2">
            {connections.map((conn, i) => {
              const fromMod = modules.find(m => m.id === conn.from);
              const toMod = modules.find(m => m.id === conn.to);
              const isActive = fromMod?.hasData;
              
              return (
                <div 
                  key={i}
                  className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full ${
                    isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span>{fromMod?.name?.split(' ')[0]}</span>
                  <span>→</span>
                  <span>{toMod?.name?.split(' ')[0]}</span>
                  <span className="opacity-60">({conn.label})</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] text-muted-foreground border-t pt-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>{t('project.dataFlow.hasData')}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            <span>{t('project.dataFlow.noData')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextViewer({ context }: { context: ProjectContextData | null }) {
  const { t } = useTranslation();
  const [showRawJson, setShowRawJson] = useState(false);
  const [showDataFlow, setShowDataFlow] = useState(true);
  
  if (!context) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('project.contextEmpty')}
      </div>
    );
  }

  if (showRawJson) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Raw JSON (for AI/debugging)</span>
          <Button variant="outline" size="sm" onClick={() => setShowRawJson(false)}>
            Show Formatted
          </Button>
        </div>
        <ScrollArea className="h-[55vh]">
          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(context, null, 2)}
          </pre>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button 
          variant={showDataFlow ? 'default' : 'ghost'} 
          size="sm" 
          onClick={() => setShowDataFlow(!showDataFlow)}
        >
          {t('project.dataFlow.toggle')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowRawJson(true)}>
          Show Raw JSON
        </Button>
      </div>
      
      {showDataFlow && (
        <ContextSection title={t('project.dataFlow.title')} defaultOpen={true}>
          <DataFlowDiagram context={context} />
        </ContextSection>
      )}
      
      <ScrollArea className="h-[50vh]">
        <div className="space-y-2 pr-4">
          <ContextSection title={t('project.contextSections.projectInfo')} defaultOpen={true}>
            <div className="space-y-1 text-sm">
              <DataRow label="ID" value={context.projectId} mono />
              <DataRow label="Name" value={context.projectName} />
              <DataRow label="Description" value={context.projectDescription || '-'} />
              <DataRow label="Type" value={<Badge variant={context.actionType === 'mitigation' ? 'default' : 'secondary'} className="text-xs">{context.actionType}</Badge>} />
              <DataRow label="City" value={`${context.cityName} (${context.cityLocode})`} />
              <DataRow label="Hazard Focus" value={
                <div className="flex gap-1 flex-wrap justify-end">
                  {context.hazardFocus?.map(h => (
                    <Badge key={h} variant="outline" className="text-xs">{h}</Badge>
                  ))}
                </div>
              } />
            </div>
          </ContextSection>

          <ContextSection title={`${t('project.contextSections.stakeholders')} (${context.stakeholders?.length || 0})`}>
            <div className="space-y-1">
              {context.stakeholders?.map(s => (
                <div key={s.id} className="flex justify-between items-center py-1 text-xs">
                  <span>{s.name}</span>
                  <Badge variant="outline" className="text-xs">{s.type}</Badge>
                </div>
              ))}
            </div>
          </ContextSection>

          <ContextSection title={`${t('project.contextSections.sites')} (${context.sites?.length || 0})`}>
            <div className="space-y-1">
              {context.sites?.map(s => (
                <div key={s.id} className="flex justify-between items-center py-1 text-xs">
                  <span>{s.name}</span>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-xs">{s.hazardType}</Badge>
                    <Badge variant="secondary" className="text-xs">{s.interventionType}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </ContextSection>

          <ContextSection title={t('project.contextSections.funderSelection')}>
            {context.funderSelection ? (
              <div className="space-y-2">
                <DataRow label="Status" value={<StatusBadge status={context.funderSelection.status} />} />
                
                {context.funderSelection.questionnaire && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Questionnaire Answers:</p>
                    {context.funderSelection.questionnaire.projectName && (
                      <DataRow label="Project Name" value={context.funderSelection.questionnaire.projectName} />
                    )}
                    {context.funderSelection.questionnaire.projectDescription && (
                      <DataRow label="Description" value={context.funderSelection.questionnaire.projectDescription} />
                    )}
                    {context.funderSelection.questionnaire.sectors?.length > 0 && (
                      <DataRow label="Sectors" value={context.funderSelection.questionnaire.sectors.join(', ')} />
                    )}
                    {context.funderSelection.questionnaire.projectStage && (
                      <DataRow label="Stage" value={context.funderSelection.questionnaire.projectStage} />
                    )}
                    {context.funderSelection.questionnaire.existingElements?.length > 0 && (
                      <DataRow label="Existing Elements" value={context.funderSelection.questionnaire.existingElements.join(', ')} />
                    )}
                    {context.funderSelection.questionnaire.budgetPreparation && (
                      <DataRow label="Budget for Preparation" value={context.funderSelection.questionnaire.budgetPreparation} />
                    )}
                    {context.funderSelection.questionnaire.budgetImplementation && (
                      <DataRow label="Budget for Implementation" value={context.funderSelection.questionnaire.budgetImplementation} />
                    )}
                    {context.funderSelection.questionnaire.generatesRevenue && (
                      <DataRow label="Generates Revenue" value={context.funderSelection.questionnaire.generatesRevenue} />
                    )}
                    {context.funderSelection.questionnaire.repaymentSource && (
                      <DataRow label="Repayment Source" value={context.funderSelection.questionnaire.repaymentSource} />
                    )}
                    {context.funderSelection.questionnaire.investmentSize && (
                      <DataRow label="Investment Size" value={context.funderSelection.questionnaire.investmentSize} />
                    )}
                    {context.funderSelection.questionnaire.fundingReceiver && (
                      <DataRow label="Funding Receiver" value={context.funderSelection.questionnaire.fundingReceiver} />
                    )}
                    {context.funderSelection.questionnaire.canTakeDebt && (
                      <DataRow label="Can Take Debt" value={context.funderSelection.questionnaire.canTakeDebt} />
                    )}
                    {context.funderSelection.questionnaire.nationalApproval && (
                      <DataRow label="National Approval" value={context.funderSelection.questionnaire.nationalApproval} />
                    )}
                    {context.funderSelection.questionnaire.openToBundling && (
                      <DataRow label="Open to Bundling" value={context.funderSelection.questionnaire.openToBundling} />
                    )}
                  </div>
                )}

                {context.funderSelection.pathway?.primary && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Pathway:</p>
                    <DataRow label="Primary" value={context.funderSelection.pathway.primary} />
                    {context.funderSelection.pathway.secondary && (
                      <DataRow label="Secondary" value={context.funderSelection.pathway.secondary} />
                    )}
                    <DataRow label="Readiness Level" value={context.funderSelection.pathway.readinessLevel} />
                    {context.funderSelection.pathway.limitingFactors?.length > 0 && (
                      <DataRow label="Limiting Factors" value={context.funderSelection.pathway.limitingFactors.join(', ')} />
                    )}
                  </div>
                )}

                {(context.funderSelection.selectedFunds?.length > 0 || context.funderSelection.shortlistedFunds?.length > 0) && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Funds:</p>
                    {context.funderSelection.selectedFunds?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-muted-foreground mb-1">Selected ({context.funderSelection?.selectedFunds?.length || 0}):</p>
                        <div className="flex flex-wrap gap-1">
                          {context.funderSelection?.selectedFunds?.map((fundId) => {
                            const fundInfo = context.funderSelection?.targetFunders?.find(t => t.fundId === fundId);
                            return (
                              <Badge key={fundId} variant="default" className="text-xs">
                                {fundInfo?.fundName || fundId}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {context.funderSelection.shortlistedFunds?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Shortlisted ({context.funderSelection?.shortlistedFunds?.length || 0}):</p>
                        <div className="flex flex-wrap gap-1">
                          {context.funderSelection?.shortlistedFunds?.map((fundId) => {
                            const fundInfo = context.funderSelection?.targetFunders?.find(t => t.fundId === fundId);
                            return (
                              <Badge key={fundId} variant="outline" className="text-xs">
                                {fundInfo?.fundName || fundId}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('project.contextLabels.notStarted')}</p>
            )}
          </ContextSection>

          <ContextSection title={t('project.contextSections.operations')}>
            {context.operations ? (
              <div className="space-y-2">
                <DataRow label="Status" value={<StatusBadge status={context.operations.status} />} />
                {context.operations.operatingModel && (
                  <DataRow label="Operating Model" value={<Badge variant="secondary" className="text-xs">{context.operations.operatingModel.replace(/_/g, ' ')}</Badge>} />
                )}

                {context.operations.roles && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Roles:</p>
                    {context.operations.roles.assetOwnerEntityId && (
                      <DataRow label="Asset Owner" value={context.operations.roles.assetOwnerEntityId} />
                    )}
                    {context.operations.roles.programOwnerEntityId && (
                      <DataRow label="Program Owner" value={context.operations.roles.programOwnerEntityId} />
                    )}
                    {context.operations.roles.operatorEntityId && (
                      <DataRow label="Operator" value={context.operations.roles.operatorEntityId} />
                    )}
                    {context.operations.roles.maintainerEntityId && (
                      <DataRow label="Maintainer" value={context.operations.roles.maintainerEntityId} />
                    )}
                    {context.operations.roles.verifierEntityId && (
                      <DataRow label="Verifier" value={context.operations.roles.verifierEntityId} />
                    )}
                    {context.operations.roles.communityRole && (
                      <DataRow label="Community Role" value={context.operations.roles.communityRole.replace(/_/g, ' ')} />
                    )}
                    {context.operations.roles.stewardshipScope && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">Stewardship Scope:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {context.operations.roles.stewardshipScope.routineMaintenance && <Badge variant="outline" className="text-xs">Routine Maintenance</Badge>}
                          {context.operations.roles.stewardshipScope.inspections && <Badge variant="outline" className="text-xs">Inspections</Badge>}
                          {context.operations.roles.stewardshipScope.minorRepairs && <Badge variant="outline" className="text-xs">Minor Repairs</Badge>}
                          {context.operations.roles.stewardshipScope.monitoringSupport && <Badge variant="outline" className="text-xs">Monitoring Support</Badge>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {context.operations.nbsExtensions && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">NBS Extensions:</p>
                    <DataRow label="Establishment Period" value={`${context.operations.nbsExtensions.establishmentPeriodMonths} months`} />
                    <DataRow label="Maintenance Intensity" value={context.operations.nbsExtensions.maintenanceIntensity} />
                    <DataRow label="Survival Target" value={`${context.operations.nbsExtensions.survivalTargetPercent}%`} />
                    <DataRow label="Replacement Policy" value={context.operations.nbsExtensions.replacementPolicy?.replace(/_/g, ' ')} />
                    {context.operations.nbsExtensions.nbsAssetTypes?.length > 0 && (
                      <DataRow label="Asset Types" value={context.operations.nbsExtensions.nbsAssetTypes.join(', ')} />
                    )}
                  </div>
                )}

                {context.operations.serviceLevels?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Service Levels ({context.operations.serviceLevels.length}):</p>
                    {context.operations.serviceLevels.map((sl, i) => (
                      <div key={i} className="bg-muted/50 p-2 rounded text-xs mb-1">
                        <div>{sl.serviceType}: {sl.targetStatement}</div>
                        <div className="text-muted-foreground">Metric: {sl.proxyMetric} | Freq: {sl.inspectionFrequency}</div>
                      </div>
                    ))}
                  </div>
                )}

                {context.operations.taskPlan?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Task Plan ({context.operations.taskPlan.length} tasks):</p>
                    {context.operations.taskPlan.slice(0, 5).map(task => (
                      <div key={task.id} className="text-xs py-1 border-b last:border-0">
                        <span className="font-medium">{task.name}</span>
                        <span className="text-muted-foreground ml-2">[{task.category}] {task.frequency}</span>
                      </div>
                    ))}
                    {context.operations.taskPlan.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-1">...and {context.operations.taskPlan.length - 5} more</p>
                    )}
                  </div>
                )}

                {context.operations.omCostBand && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Cost Band:</p>
                    <DataRow label="Range" value={`${context.operations.omCostBand.currency} ${context.operations.omCostBand.low?.toLocaleString()} - ${context.operations.omCostBand.high?.toLocaleString()}`} />
                    <DataRow label="Basis" value={context.operations.omCostBand.basis} />
                    {context.operations.omCostBand.assumptions && (
                      <DataRow label="Assumptions" value={context.operations.omCostBand.assumptions} />
                    )}
                  </div>
                )}

                {context.operations.omFunding && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Funding:</p>
                    <DataRow label="Duration" value={`${context.operations.omFunding.durationYears} years`} />
                    {context.operations.omFunding.mechanisms?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {context.operations.omFunding.mechanisms.map(m => (
                          <Badge key={m} variant="outline" className="text-xs">{m.replace(/_/g, ' ')}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {context.operations.capacity && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Capacity Assessment:</p>
                    {context.operations.capacity.assessment && (
                      <DataRow label="Assessment" value={context.operations.capacity.assessment.replace(/_/g, ' ')} />
                    )}
                    {context.operations.capacity.notes && (
                      <DataRow label="Notes" value={context.operations.capacity.notes} />
                    )}
                  </div>
                )}

                {context.operations.opsRisks?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Risks ({context.operations.opsRisks.length}):</p>
                    {context.operations.opsRisks.map(risk => (
                      <div key={risk.id} className="text-xs py-1">
                        <Badge variant={risk.riskLevel === 'HIGH' ? 'destructive' : risk.riskLevel === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs mr-2">
                          {risk.riskLevel}
                        </Badge>
                        {risk.riskType.replace(/_/g, ' ')}
                        {risk.mitigation && <span className="text-muted-foreground ml-1">({risk.mitigation})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {context.operations.readiness && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Readiness:</p>
                    {context.operations.readiness.blockers?.length > 0 && (
                      <div className="mb-2">
                        <span className="text-xs text-muted-foreground">Blockers: </span>
                        {context.operations.readiness.blockers.map((b, i) => (
                          <Badge key={i} variant="destructive" className="text-xs mr-1">{b}</Badge>
                        ))}
                      </div>
                    )}
                    {context.operations.readiness.checklist && (
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <span className={context.operations.readiness.checklist.operatingModelSelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.operatingModelSelected ? '✓' : '○'} Operating Model
                        </span>
                        <span className={context.operations.readiness.checklist.operatorAssigned ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.operatorAssigned ? '✓' : '○'} Operator Assigned
                        </span>
                        <span className={context.operations.readiness.checklist.taskPlanPresent ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.taskPlanPresent ? '✓' : '○'} Task Plan
                        </span>
                        <span className={context.operations.readiness.checklist.fundingMechanismSelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.fundingMechanismSelected ? '✓' : '○'} Funding Mechanism
                        </span>
                        <span className={context.operations.readiness.checklist.verifierSet ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.operations.readiness.checklist.verifierSet ? '✓' : '○'} Verifier Set
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('project.contextLabels.notStarted')}</p>
            )}
          </ContextSection>

          <ContextSection title={t('project.contextSections.businessModel')}>
            {context.businessModel ? (
              <div className="space-y-2">
                <DataRow label="Status" value={<StatusBadge status={context.businessModel.status} />} />
                {context.businessModel.primaryArchetype && (
                  <DataRow label="Archetype" value={<Badge variant="secondary" className="text-xs">{context.businessModel.primaryArchetype.replace(/_/g, ' ')}</Badge>} />
                )}

                {context.businessModel.payerBeneficiaryMap && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Payers & Beneficiaries:</p>
                    {context.businessModel.payerBeneficiaryMap.primaryPayerId && (
                      <DataRow label="Primary Payer" value={context.businessModel.payerBeneficiaryMap.primaryPayerId} />
                    )}
                    {context.businessModel.payerBeneficiaryMap.beneficiaries?.length > 0 && (
                      <div className="mt-1">
                        <span className="text-xs text-muted-foreground">Beneficiaries:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {context.businessModel.payerBeneficiaryMap.beneficiaries.map(b => (
                            <Badge key={b.stakeholderId} variant="outline" className="text-xs">
                              {b.stakeholderId}{b.benefitType ? ` (${b.benefitType})` : ''}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {context.businessModel.payerBeneficiaryMap.candidatePayers?.length > 0 && (
                      <div className="mt-1">
                        <span className="text-xs text-muted-foreground">Candidate Payers:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {context.businessModel.payerBeneficiaryMap.candidatePayers.map(p => (
                            <Badge key={p.stakeholderId} variant="secondary" className="text-xs">
                              {p.stakeholderId}{p.mechanismHint ? ` (${p.mechanismHint})` : ''}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {context.businessModel.paymentMechanism?.type && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Payment Mechanism:</p>
                    <DataRow label="Type" value={context.businessModel.paymentMechanism.type.replace(/_/g, ' ')} />
                    {context.businessModel.paymentMechanism.basis && (
                      <DataRow label="Basis" value={context.businessModel.paymentMechanism.basis.replace(/_/g, ' ')} />
                    )}
                    {context.businessModel.paymentMechanism.durationYears && (
                      <DataRow label="Duration" value={`${context.businessModel.paymentMechanism.durationYears} years`} />
                    )}
                  </div>
                )}

                {context.businessModel.revenueStack?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Revenue Stack ({context.businessModel.revenueStack.length}):</p>
                    {context.businessModel.revenueStack.map(rev => (
                      <div key={rev.id} className="text-xs py-1 border-b last:border-0 bg-muted/30 p-1 rounded mb-1">
                        <div className="flex items-center gap-1">
                          <Badge variant={rev.confidence === 'HIGH' ? 'default' : rev.confidence === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs">
                            {rev.confidence}
                          </Badge>
                          <span className="font-medium">{rev.revenueType.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Role: {rev.role.replace(/_/g, ' ')}
                          {rev.durationYears && ` | ${rev.durationYears}y`}
                        </div>
                        {rev.prerequisites && rev.prerequisites.length > 0 && (
                          <div className="text-muted-foreground">Prerequisites: {rev.prerequisites.join(', ')}</div>
                        )}
                        {rev.notes && <div className="text-muted-foreground">Notes: {rev.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {context.businessModel.sourcesAndUsesRom && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Sources & Uses (ROM):</p>
                    {context.businessModel.sourcesAndUsesRom.capexBand && (
                      <DataRow label="CAPEX Band" value={`${context.businessModel.sourcesAndUsesRom.capexBand.currency || 'USD'} ${context.businessModel.sourcesAndUsesRom.capexBand.low?.toLocaleString()} - ${context.businessModel.sourcesAndUsesRom.capexBand.high?.toLocaleString()}`} />
                    )}
                    {context.businessModel.sourcesAndUsesRom.opexBand && (
                      <DataRow label="OPEX Band" value={`${context.businessModel.sourcesAndUsesRom.opexBand.currency || 'USD'} ${context.businessModel.sourcesAndUsesRom.opexBand.low?.toLocaleString()} - ${context.businessModel.sourcesAndUsesRom.opexBand.high?.toLocaleString()}`} />
                    )}
                    {context.businessModel.sourcesAndUsesRom.mrvBudgetBand && (
                      <DataRow label="MRV Budget" value={`${context.businessModel.sourcesAndUsesRom.mrvBudgetBand.currency || 'USD'} ${context.businessModel.sourcesAndUsesRom.mrvBudgetBand.low?.toLocaleString()} - ${context.businessModel.sourcesAndUsesRom.mrvBudgetBand.high?.toLocaleString()}`} />
                    )}
                    {context.businessModel.sourcesAndUsesRom.assumptions && (
                      <DataRow label="Assumptions" value={context.businessModel.sourcesAndUsesRom.assumptions} />
                    )}
                  </div>
                )}

                {context.businessModel.financingPathway?.pathway && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Financing Pathway:</p>
                    <DataRow label="Pathway" value={<Badge variant="outline" className="text-xs">{context.businessModel.financingPathway.pathway.replace(/_/g, ' ')}</Badge>} />
                    {context.businessModel.financingPathway.rationale && (
                      <DataRow label="Rationale" value={context.businessModel.financingPathway.rationale} />
                    )}
                  </div>
                )}

                {context.businessModel.enablingActions?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Enabling Actions ({context.businessModel.enablingActions.length}):</p>
                    {context.businessModel.enablingActions.map(action => (
                      <div key={action.id} className="text-xs py-1">
                        <Badge variant={action.priority === 'HIGH' ? 'destructive' : action.priority === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs mr-2">
                          {action.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs mr-2">{action.category}</Badge>
                        {action.action}
                        {action.ownerStakeholderId && <span className="text-muted-foreground ml-1">({action.ownerStakeholderId})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {context.businessModel.bmRisks?.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Risks ({context.businessModel.bmRisks.length}):</p>
                    {context.businessModel.bmRisks.map(risk => (
                      <div key={risk.id} className="text-xs py-1">
                        <Badge variant={risk.riskLevel === 'HIGH' ? 'destructive' : risk.riskLevel === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs mr-2">
                          {risk.riskLevel}
                        </Badge>
                        {risk.riskType.replace(/_/g, ' ')}
                        {risk.mitigation && <span className="text-muted-foreground ml-1">({risk.mitigation})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {context.businessModel.readiness && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Readiness:</p>
                    {context.businessModel.readiness.blockers?.length > 0 && (
                      <div className="mb-2">
                        <span className="text-xs text-muted-foreground">Blockers: </span>
                        {context.businessModel.readiness.blockers.map((b, i) => (
                          <Badge key={i} variant="destructive" className="text-xs mr-1">{b}</Badge>
                        ))}
                      </div>
                    )}
                    {context.businessModel.readiness.checklist && (
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <span className={context.businessModel.readiness.checklist.primaryArchetypeSelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.primaryArchetypeSelected ? '✓' : '○'} Archetype
                        </span>
                        <span className={context.businessModel.readiness.checklist.primaryPayerSelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.primaryPayerSelected ? '✓' : '○'} Primary Payer
                        </span>
                        <span className={context.businessModel.readiness.checklist.oneHighConfidenceRevenueLine ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.oneHighConfidenceRevenueLine ? '✓' : '○'} HIGH Revenue
                        </span>
                        <span className={context.businessModel.readiness.checklist.durationSet ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.durationSet ? '✓' : '○'} Duration Set
                        </span>
                        <span className={context.businessModel.readiness.checklist.financingPathwaySelected ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.financingPathwaySelected ? '✓' : '○'} Financing Pathway
                        </span>
                        <span className={context.businessModel.readiness.checklist.consistencyCheckedWithOps ? 'text-green-600' : 'text-muted-foreground'}>
                          {context.businessModel.readiness.checklist.consistencyCheckedWithOps ? '✓' : '○'} O&M Consistency
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('project.contextLabels.notStarted')}</p>
            )}
          </ContextSection>

          <ContextSection title={t('project.contextSections.siteExplorer')}>
            {context.siteExplorer ? (
              <div className="space-y-2">
                {context.siteExplorer.selectedZones?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Selected Zones ({context.siteExplorer.selectedZones.length}):</p>
                    {context.siteExplorer.selectedZones.map((zone, i) => {
                      if (typeof zone === 'string') {
                        return (
                          <div key={zone} className="text-xs py-1 bg-muted/30 p-1 rounded mb-1">
                            <span className="font-medium">{zone}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={zone.zoneId || i} className="text-xs py-1 bg-muted/30 p-1 rounded mb-1">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">{zone.hazardType}</Badge>
                            <span className="font-medium">{zone.zoneName || formatZoneName(zone.zoneId)}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {zone.riskScore !== undefined && `Risk: ${(zone.riskScore * 100).toFixed(0)}%`}
                            {zone.area && ` | Area: ${zone.area.toFixed(2)} km²`}
                          </div>
                          {zone.interventionType && (
                            <Badge variant="secondary" className="text-xs mt-1">{zone.interventionType.replace(/_/g, ' ')}</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {context.siteExplorer.hazardSummary && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Hazard Summary:</p>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <DataRow label="Flood Cells" value={context.siteExplorer.hazardSummary.floodCells} />
                      <DataRow label="Heat Cells" value={context.siteExplorer.hazardSummary.heatCells} />
                      <DataRow label="Landslide Cells" value={context.siteExplorer.hazardSummary.landslideCells} />
                      <DataRow label="Total Cells" value={context.siteExplorer.hazardSummary.totalCells} />
                    </div>
                  </div>
                )}
                {context.siteExplorer.layerPreferences && Object.keys(context.siteExplorer.layerPreferences).length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs font-medium mb-2">Layer Preferences:</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(context.siteExplorer.layerPreferences)
                        .filter(([_, enabled]) => enabled)
                        .map(([layer]) => (
                          <Badge key={layer} variant="outline" className="text-xs">{layer}</Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('project.contextLabels.notStarted')}</p>
            )}
          </ContextSection>

          {context.lastUpdated && Object.keys(context.lastUpdated).length > 0 && (
          <ContextSection title={t('project.contextLabels.lastUpdated')}>
            <div className="space-y-1 text-xs text-muted-foreground">
              {Object.entries(context.lastUpdated).map(([module, date]) => (
                <div key={module} className="flex justify-between">
                  <span>{module}:</span>
                  <span>{date ? new Date(date).toLocaleString() : '-'}</span>
                </div>
              ))}
            </div>
          </ContextSection>
        )}
        </div>
      </ScrollArea>
    </div>
  );
}

function DataReadinessChecklist({ items }: { items: DataReadinessItem[] }) {
  const { t } = useTranslation();

  return (
    <div className="inline-flex items-center gap-2 border rounded-lg px-3 py-2 bg-card">
      {items.map(item => (
        <div
          key={item.key}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            item.available
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-muted/50 text-muted-foreground/60 border border-muted-foreground/20'
          }`}
        >
          {item.available ? (
            <CheckCircle2 className="h-3 w-3 shrink-0" />
          ) : (
            <Circle className="h-3 w-3 shrink-0" />
          )}
          <span>{t(`project.dataReadiness.${item.i18nKey}`)}</span>
        </div>
      ))}
    </div>
  );
}

function ConceptNotePanel({ context }: { context: ProjectContextData | null }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState<ConceptNote | null>(null);

  const handleGenerate = () => {
    const assembled = assembleConceptNote(context);
    setNote(assembled);
    setIsOpen(true);
  };

  const sectionKeys = [
    'summary', 'contextBaseline', 'projectDescription',
    'expectedResults', 'implementation', 'financing', 'evidenceBase',
  ] as const;

  const sectionColors: Record<string, string> = {
    summary: 'border-l-blue-500',
    contextBaseline: 'border-l-amber-500',
    projectDescription: 'border-l-green-500',
    expectedResults: 'border-l-purple-500',
    implementation: 'border-l-orange-500',
    financing: 'border-l-emerald-500',
    evidenceBase: 'border-l-cyan-500',
  };

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-lg transition-shadow border-2 border-dashed border-primary/30 bg-primary/5"
        onClick={handleGenerate}
      >
        <CardContent className="flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{t('project.conceptNote.exportBanner')}</h3>
              <p className="text-sm text-muted-foreground">{t('project.conceptNote.exportBannerDescription')}</p>
            </div>
          </div>
          <Button size="lg">
            {t('project.conceptNote.exportButton')}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{t('project.conceptNote.viewerTitle')}</DialogTitle>
            <DialogDescription>{t('project.conceptNote.viewerDescription')}</DialogDescription>
          </DialogHeader>
          {note && (
            <ScrollArea className="h-[60vh] pr-4">
              <div className="space-y-6">
                <div className="text-xs text-muted-foreground text-right">
                  {t('project.conceptNote.generatedFrom', {
                    date: new Date(note.generatedAt).toLocaleDateString(),
                  })}
                </div>

                <div className="text-center pb-4 border-b">
                  <h2 className="text-xl font-bold">{note.projectName}</h2>
                  <p className="text-sm text-muted-foreground">{note.cityName}</p>
                </div>

                {sectionKeys.map(key => {
                  const section = note.sections[key];
                  return (
                    <div key={key} className={`border-l-4 ${sectionColors[key]} pl-4 space-y-2`}>
                      <h3 className="font-semibold text-sm">
                        {t(`project.conceptNote.${section.title}`)}
                      </h3>
                      {section.hasData ? (
                        <div className="space-y-1">
                          {section.content.map((line, i) => (
                            <p key={i} className={`text-sm ${line.startsWith('  -') ? 'ml-4 text-muted-foreground' : ''}`}>
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          {t('project.conceptNote.noData')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="h-4 w-4 mr-2" />
              {t('project.conceptNote.downloadPdf')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { isSampleMode, sampleActions, initiatedProjects, sampleCity } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  const { context, loadContext, migrateExistingData } = useProjectContext();
  const [contextOpen, setContextOpen] = useState(false);

  const { data: projectData, isLoading } = useQuery<{ project: Project }>({
    queryKey: ['/api/project', projectId],
    enabled: !isSampleMode && !isSampleRoute && !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    
    const existing = loadContext(projectId);
    if (!existing && (isSampleMode || isSampleRoute)) {
      const action = sampleActions.find(a => a.id === projectId);
      if (action) {
        migrateExistingData(projectId, {
          name: action.name,
          description: action.description,
          actionType: action.type,
          cityId: action.cityId,
          cityName: sampleCity?.name || 'Porto Alegre',
          cityLocode: sampleCity?.locode || 'BR POA',
        });
      }
    }
  }, [projectId, isSampleMode, isSampleRoute, loadContext, migrateExistingData, sampleActions, sampleCity]);

  if (isSampleMode || isSampleRoute) {
    const action = sampleActions.find(a => a.id === projectId);
    const isInitiated = initiatedProjects.includes(projectId || '');
    
    if (!action || !isInitiated) {
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

    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Link href={`${routePrefix}/city-information/${action.cityId}`}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <DisplayLarge>{action.name}</DisplayLarge>
              <Badge variant="secondary">{t('cityInfo.sampleDataBadge')}</Badge>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <Badge variant={action.type === 'mitigation' ? 'default' : 'secondary'}>
                {action.type === 'mitigation' ? t('cityInfo.mitigation') : t('cityInfo.adaptation')}
              </Badge>
              <Dialog open={contextOpen} onOpenChange={setContextOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Database className="h-4 w-4 mr-2" />
                    {t('project.showContext')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-5xl max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>{t('project.contextModalTitle')}</DialogTitle>
                    <DialogDescription>{t('project.contextModalDescription')}</DialogDescription>
                  </DialogHeader>
                  <Tabs defaultValue="overview">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="overview">{t('project.contextTabs.overview')}</TabsTrigger>
                      <TabsTrigger value="rawData">{t('project.contextTabs.rawData')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview">
                      <ProjectOverview context={context} />
                    </TabsContent>
                    <TabsContent value="rawData">
                      <ContextViewer context={context} />
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
              <DataReadinessChecklist items={SAMPLE_DATA_READINESS} />
            </div>
          </div>

          {/* PREPARE Section */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold tracking-tight">{t('project.sections.prepare')}</h2>
              <span className="text-sm text-muted-foreground">{t('project.sections.prepareDescription')}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Link href={`${routePrefix}/funder-selection/${projectId}`}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <DollarSign className="h-6 w-6 text-green-600" />
                      </div>
                      <CardTitle className="text-lg">{t('project.funderSelection')}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t('project.funderSelectionDescription')}
                    </CardDescription>
                    <FunderHighlight data={context?.funderSelection} />
                    <div className="flex items-center text-green-600 text-sm font-medium mt-3">
                      {t('common.view')}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href={`${routePrefix}/site-explorer/${projectId}`}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Map className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{t('project.siteExplorer')}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t('project.siteExplorerDescription')}
                    </CardDescription>
                    <SiteExplorerHighlight data={context?.siteExplorer} />
                    <div className="flex items-center text-primary text-sm font-medium mt-3">
                      {t('common.view')}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href={`${routePrefix}/impact-model/${projectId}`}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-500/10 rounded-lg">
                        <Lightbulb className="h-6 w-6 text-amber-600" />
                      </div>
                      <CardTitle className="text-lg">{t('project.impactModel')}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t('project.impactModelDescription')}
                    </CardDescription>
                    <ImpactModelHighlight data={context?.impactModel} />
                    <div className="flex items-center text-amber-600 text-sm font-medium mt-3">
                      {t('common.view')}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href={`${routePrefix}/project-operations/${projectId}`}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500/10 rounded-lg">
                        <Settings className="h-6 w-6 text-orange-600" />
                      </div>
                      <CardTitle className="text-lg">{t('project.projectOperations')}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t('project.projectOperationsDescription')}
                    </CardDescription>
                    <OperationsHighlight data={context?.operations} />
                    <div className="flex items-center text-orange-600 text-sm font-medium mt-3">
                      {t('common.view')}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href={`${routePrefix}/business-model/${projectId}`}>
                <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-500/10 rounded-lg">
                        <Landmark className="h-6 w-6 text-purple-600" />
                      </div>
                      <CardTitle className="text-lg">{t('project.businessModel')}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      {t('project.businessModelDescription')}
                    </CardDescription>
                    <BusinessModelHighlight data={context?.businessModel} />
                    <div className="flex items-center text-purple-600 text-sm font-medium mt-3">
                      {t('common.view')}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>

          {/* OUTPUT Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold tracking-tight">{t('project.sections.output')}</h2>
              <span className="text-sm text-muted-foreground">{t('project.sections.outputDescription')}</span>
            </div>
            <ConceptNotePanel context={context} />
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-32 mb-4" />
          <Skeleton className="h-12 w-64 mb-2" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
    );
  }

  const project = projectData?.project;

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Link href="/cities">
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Link href={`/city-information/${project.cityId}`}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </Link>

        <div className="mb-8">
          <DisplayLarge>{project.actionName}</DisplayLarge>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={project.actionType === 'mitigation' ? 'default' : 'secondary'}>
              {project.actionType === 'mitigation' ? t('cityInfo.mitigation') : t('cityInfo.adaptation')}
            </Badge>
            <Dialog open={contextOpen} onOpenChange={setContextOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Database className="h-4 w-4 mr-2" />
                  {t('project.showContext')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[90vh]">
                <DialogHeader>
                  <DialogTitle>{t('project.contextModalTitle')}</DialogTitle>
                  <DialogDescription>{t('project.contextModalDescription')}</DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="overview">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="overview">{t('project.contextTabs.overview')}</TabsTrigger>
                    <TabsTrigger value="rawData">{t('project.contextTabs.rawData')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview">
                    <ProjectOverview context={context} />
                  </TabsContent>
                  <TabsContent value="rawData">
                    <ContextViewer context={context} />
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* PREPARE Section */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold tracking-tight">{t('project.sections.prepare')}</h2>
            <span className="text-sm text-muted-foreground">{t('project.sections.prepareDescription')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link href={`/funder-selection/${projectId}`}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                    <CardTitle className="text-lg">{t('project.funderSelection')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {t('project.funderSelectionDescription')}
                  </CardDescription>
                  <div className="flex items-center text-green-600 text-sm font-medium">
                    {t('common.view')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`/site-explorer/${projectId}`}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Map className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{t('project.siteExplorer')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {t('project.siteExplorerDescription')}
                  </CardDescription>
                  <div className="flex items-center text-primary text-sm font-medium">
                    {t('common.view')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`/impact-model/${projectId}`}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                      <Lightbulb className="h-6 w-6 text-amber-600" />
                    </div>
                    <CardTitle className="text-lg">{t('project.impactModel')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {t('project.impactModelDescription')}
                  </CardDescription>
                  <div className="flex items-center text-amber-600 text-sm font-medium">
                    {t('common.view')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`/project-operations/${projectId}`}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                      <Settings className="h-6 w-6 text-orange-600" />
                    </div>
                    <CardTitle className="text-lg">{t('project.projectOperations')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {t('project.projectOperationsDescription')}
                  </CardDescription>
                  <div className="flex items-center text-orange-600 text-sm font-medium">
                    {t('common.view')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href={`/business-model/${projectId}`}>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <Landmark className="h-6 w-6 text-purple-600" />
                    </div>
                    <CardTitle className="text-lg">{t('project.businessModel')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {t('project.businessModelDescription')}
                  </CardDescription>
                  <div className="flex items-center text-purple-600 text-sm font-medium">
                    {t('common.view')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* OUTPUT Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold tracking-tight">{t('project.sections.output')}</h2>
            <span className="text-sm text-muted-foreground">{t('project.sections.outputDescription')}</span>
          </div>
          <ConceptNotePanel context={context} />
        </div>
      </div>
    </div>
  );
}
