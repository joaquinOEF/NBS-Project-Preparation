import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, Link } from 'wouter';
import DOMPurify from 'dompurify';
import { ArrowLeft, Lightbulb, Settings, Sparkles, Edit3, Eye, Download, Check, ChevronDown, ChevronUp, Plus, Trash2, RefreshCw, Copy, FileText, Clock, AlertCircle, Scale, Thermometer, Users, TrendingUp, Building2, Info, Droplets, Mountain, Loader2 } from 'lucide-react';
import { useNavigationPersistence } from '@/core/hooks/useNavigationPersistence';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { Progress } from '@/core/components/ui/progress';
import { Label } from '@/core/components/ui/label';
import { Input } from '@/core/components/ui/input';
import { Checkbox } from '@/core/components/ui/checkbox';
import { Textarea } from '@/core/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/core/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/core/components/ui/collapsible';
import { ScrollArea } from '@/core/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/core/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useProjectContext, ImpactModelData, LensType, InterventionBundle, NarrativeBlock, CoBenefitCard, SignalCard, QuantifyResponse, QuantifiedImpactGroup, QuantifiedKPI, sampleSiteExplorer, sampleFunderSelection } from '@/core/contexts/project-context';
import { useToast } from '@/core/hooks/use-toast';
import { useChatState } from '@/core/contexts/chat-context';

type WizardStep = 'setup' | 'quantify' | 'narrate';

const WIZARD_STEPS: WizardStep[] = ['setup', 'quantify', 'narrate'];

const GENERATION_PHRASES = [
  'Searching knowledge base for evidence',
  'Planning narrative outline',
  'Estimating project impact',
  'Generating concept note sections',
  'Connecting co-benefits with expected impact',
  'Writing intervention portfolio details',
  'Analyzing intervention synergies',
  'Assembling narrative blocks',
  'Building funding-aligned recommendations'
];

const getDefaultImpactModelData = (): ImpactModelData => ({
  status: 'NOT_STARTED',
  interventionBundles: [],
  quantifiedImpacts: null,
  narrativeCache: {
    base: null,
    lensVariants: {
      neutral: [],
      climate: [],
      social: [],
      financial: [],
      institutional: [],
    },
  },
  coBenefits: [],
  downstreamSignals: {
    operations: [],
    businessModel: [],
    mrv: [],
    implementors: [],
  },
  selectedLens: 'neutral',
  generationMeta: null,
});

const normalizeSignalCard = (signal: unknown, prefix: string, index: number): SignalCard => {
  if (typeof signal === 'string') {
    return {
      id: `${prefix}-${index + 1}`,
      title: signal,
      description: '',
      whyItMatters: '',
      triggeredBy: [],
      ownerCandidates: [],
      timeHorizon: '0-2y',
      riskIfMissing: '',
      confidence: 'MEDIUM',
      included: true,
      userNotes: '',
    };
  }
  const obj = signal as Partial<SignalCard>;
  return {
    id: obj.id || `${prefix}-${index + 1}`,
    title: obj.title || '',
    description: obj.description || '',
    whyItMatters: obj.whyItMatters || '',
    triggeredBy: Array.isArray(obj.triggeredBy) ? obj.triggeredBy : [],
    ownerCandidates: Array.isArray(obj.ownerCandidates) ? obj.ownerCandidates : [],
    timeHorizon: obj.timeHorizon || '0-2y',
    riskIfMissing: obj.riskIfMissing || '',
    confidence: obj.confidence || 'MEDIUM',
    included: obj.included !== false,
    userNotes: obj.userNotes || '',
  };
};

const normalizeCoBenefit = (cb: unknown, index: number): CoBenefitCard => {
  if (typeof cb === 'string') {
    return {
      id: `cb-${index + 1}`,
      title: cb,
      category: 'OTHER',
      description: '',
      whoBenefits: [],
      where: [],
      kpiOrProxy: null,
      confidence: 'MEDIUM',
      evidenceTier: 'ASSUMPTION',
      dependencies: [],
      included: true,
      userNotes: '',
    };
  }
  const obj = cb as Partial<CoBenefitCard>;
  return {
    id: obj.id || `cb-${index + 1}`,
    title: obj.title || '',
    category: obj.category || 'OTHER',
    description: obj.description || '',
    whoBenefits: Array.isArray(obj.whoBenefits) ? obj.whoBenefits : [],
    where: Array.isArray(obj.where) ? obj.where : [],
    kpiOrProxy: obj.kpiOrProxy || null,
    confidence: obj.confidence || 'MEDIUM',
    evidenceTier: obj.evidenceTier || 'ASSUMPTION',
    dependencies: Array.isArray(obj.dependencies) ? obj.dependencies : [],
    included: obj.included !== false,
    userNotes: obj.userNotes || '',
  };
};

interface RawDownstreamSignals {
  operations?: unknown[];
  businessModel?: unknown[];
  mrv?: unknown[];
  implementors?: unknown[];
}

const normalizeAIResponse = (result: {
  narrativeBlocks?: NarrativeBlock[];
  coBenefits?: unknown[];
  downstreamSignals?: RawDownstreamSignals;
}): {
  narrativeBlocks: NarrativeBlock[];
  coBenefits: CoBenefitCard[];
  downstreamSignals: {
    operations: SignalCard[];
    businessModel: SignalCard[];
    mrv: SignalCard[];
    implementors: SignalCard[];
  };
} => {
  const rawSignals = result.downstreamSignals || {};
  return {
    narrativeBlocks: (result.narrativeBlocks || []).map((block, idx) => ({
      ...block,
      id: block.id || `block-${idx + 1}`,
    })),
    coBenefits: (result.coBenefits || []).map((cb, idx) => normalizeCoBenefit(cb, idx)),
    downstreamSignals: {
      operations: (rawSignals.operations || []).map((s, i) => normalizeSignalCard(s, 'ops', i)),
      businessModel: (rawSignals.businessModel || []).map((s, i) => normalizeSignalCard(s, 'bm', i)),
      mrv: (rawSignals.mrv || []).map((s, i) => normalizeSignalCard(s, 'mrv', i)),
      implementors: (rawSignals.implementors || []).map((s, i) => normalizeSignalCard(s, 'impl', i)),
    },
  };
};

function StepIndicator({ currentStep, steps, onStepClick }: { currentStep: WizardStep; steps: WizardStep[]; onStepClick?: (step: WizardStep) => void }) {
  const { t } = useTranslation();
  const currentIndex = steps.indexOf(currentStep);
  
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;
        const canClick = onStepClick && (isCompleted || isActive);
        
        return (
          <div key={step} className="flex items-center">
            <button
              type="button"
              onClick={() => canClick && onStepClick(step)}
              disabled={!canClick}
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors
                ${isActive ? 'bg-amber-500 text-white' : isCompleted ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}
                ${canClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
            </button>
            <button
              type="button"
              onClick={() => canClick && onStepClick(step)}
              disabled={!canClick}
              className={`ml-2 text-sm ${isActive ? 'font-medium' : 'text-muted-foreground'} ${canClick ? 'cursor-pointer hover:underline' : 'cursor-default'}`}
            >
              {t(`impactModel.steps.${step}`)}
            </button>
            {index < steps.length - 1 && (
              <div className={`w-8 h-0.5 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SetupStep({ 
  data, 
  onUpdate,
  siteExplorerZones,
  usingSampleData,
  cityName,
  projectName,
  targetFunderName
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
  siteExplorerZones: any[];
  usingSampleData: boolean;
  cityName: string;
  projectName: string;
  targetFunderName: string;
}) {
  const { t } = useTranslation();

  const formatCost = (cost: { min: number; max: number; unit: string }) => {
    const formatNum = (n: number) => {
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
      return n.toString();
    };
    return `${cost.unit} ${formatNum(cost.min)} - ${formatNum(cost.max)}`;
  };

  // Format population to thousands (e.g., 830967 → "831K")
  const formatPopulation = (pop: number) => {
    if (pop >= 1000000) return `${(pop / 1000000).toFixed(1)}M`;
    if (pop >= 1000) return `${Math.round(pop / 1000)}K`;
    return Math.round(pop).toString();
  };

  // Format area consistently - prefer hectares for smaller areas, km² for larger
  const formatArea = (area: number, unit: string) => {
    if (unit === 'ha') {
      if (area >= 100) return `${(area / 100).toFixed(1)} km²`;
      return `${area.toFixed(area < 10 ? 1 : 0)} ha`;
    }
    if (unit === 'm²' || unit === 'm2') {
      if (area >= 10000) return `${(area / 10000).toFixed(1)} ha`;
      return `${Math.round(area).toLocaleString()} m²`;
    }
    if (unit === 'km²' || unit === 'km2') {
      return `${area.toFixed(area < 10 ? 1 : 0)} km²`;
    }
    // Default: assume hectares
    return `${area.toFixed(area < 10 ? 1 : 0)} ha`;
  };

  const formatZoneName = (zone: any, index: number) => {
    // Check zoneName first, but also format it if it contains zone_
    const rawName = zone.zoneName || zone.name || zone.zoneId;
    if (rawName) {
      const match = rawName.match(/zone_(\d+)/i);
      if (match) {
        return `Zone ${match[1]}`;
      }
      // If it's already formatted (e.g., "Zone 12") return as-is
      if (/^Zone \d+$/i.test(rawName)) {
        return rawName;
      }
      return rawName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    }
    return `Zone ${index + 1}`;
  };

  const formatInterventionType = (type: string) => {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l: string) => l.toUpperCase());
  };

  const getHazardIcon = (hazard: string) => {
    const h = hazard?.toLowerCase();
    if (h?.includes('flood')) return <Droplets className="h-4 w-4 text-blue-500" />;
    if (h?.includes('heat')) return <Thermometer className="h-4 w-4 text-orange-500" />;
    if (h?.includes('landslide')) return <Mountain className="h-4 w-4 text-amber-700" />;
    return <AlertCircle className="h-4 w-4 text-gray-500" />;
  };

  const getImpactLevel = (level: string) => {
    if (level === 'high') return { label: 'High Impact', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
    if (level === 'medium') return { label: 'Medium Impact', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
    return { label: 'Low Impact', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  };

  const totalInterventions = siteExplorerZones.reduce((sum, zone) => sum + (zone.interventionPortfolio?.length || 0), 0);
  const totalCost = siteExplorerZones.reduce((sum, zone) => {
    const portfolio = zone.interventionPortfolio || [];
    return sum + portfolio.reduce((s: number, i: any) => s + ((i.estimatedCost?.min || 0) + (i.estimatedCost?.max || 0)) / 2, 0);
  }, 0);

  return (
    <div className="space-y-8">
      {/* Project & City Context Summary */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{projectName}</h3>
                <p className="text-muted-foreground">{cityName}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('impactModel.zones')}</p>
                  <p className="text-xl font-semibold">{siteExplorerZones.length}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('impactModel.interventions')}</p>
                  <p className="text-xl font-semibold">{totalInterventions}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('impactModel.estimatedInvestment')}</p>
                  <p className="text-xl font-semibold">${(totalCost / 1000000).toFixed(1)}M</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('impactModel.targetFunder')}</p>
                  <p className="text-sm font-medium">{targetFunderName}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {usingSampleData && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800">
          <CardContent className="py-4 px-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">{t('impactModel.usingSampleData')}</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">{t('impactModel.usingSampleDataHint')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Intervention Bundles - Open Format */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-1">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">{t('impactModel.interventionBundles')}</h2>
            <p className="text-sm text-muted-foreground">{t('impactModel.bundlesDescriptionExpanded')}</p>
          </div>
        </div>

        {siteExplorerZones.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>{t('impactModel.noZonesSelected')}</p>
              <p className="text-sm mt-2">{t('impactModel.selectZonesFirst')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {siteExplorerZones.map((zone, index) => {
              const zoneId = zone.zoneId || `zone-${index}`;
              const zoneName = formatZoneName(zone, index);
              const isSelected = data.interventionBundles.some(b => b.id === zoneId);
              const interventions = zone.interventionPortfolio || [];
              const zonePopulation = zone.populationSum ? formatPopulation(zone.populationSum) : null;
              const zoneArea = zone.areaKm2 || zone.area;
              
              return (
                <Card 
                  key={`${zoneId}-${index}`} 
                  className={`overflow-hidden transition-all flex flex-col ${isSelected ? 'ring-2 ring-primary/50 border-primary' : 'hover:border-primary/30'}`}
                >
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <Checkbox 
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            const bundleInterventions = interventions.map((i: any) => {
                              const name = i.interventionName || i.name || 'Intervention';
                              const area = i.estimatedArea ? `${i.estimatedArea} ${i.areaUnit || 'ha'}` : '';
                              const category = i.category ? i.category.replace(/_/g, ' ') : '';
                              const impacts = i.impacts ? 
                                `(Flood: ${i.impacts.flood || 'n/a'}, Heat: ${i.impacts.heat || 'n/a'})` : '';
                              return `${name}${area ? ` - ${area}` : ''}${category ? ` [${category}]` : ''} ${impacts}`.trim();
                            });
                            
                            onUpdate({
                              interventionBundles: [
                                ...data.interventionBundles,
                                {
                                  id: zoneId,
                                  name: zoneName,
                                  objective: zone.interventionType ? formatInterventionType(zone.interventionType) : '',
                                  targetHazards: [zone.hazardType || zone.primaryHazard || 'FLOOD'],
                                  interventions: bundleInterventions,
                                  locations: [{ zoneId, name: zoneName, geometryType: 'polygon' }],
                                  capexRange: { 
                                    low: interventions.reduce((sum: number, i: any) => sum + (i.estimatedCost?.min || 0), 0),
                                    high: interventions.reduce((sum: number, i: any) => sum + (i.estimatedCost?.max || 0), 0),
                                  },
                                  enabled: true,
                                },
                              ],
                            });
                          } else if (checked === false) {
                            onUpdate({
                              interventionBundles: data.interventionBundles.filter(b => b.id !== zoneId),
                            });
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-semibold truncate">{zoneName}</h3>
                          {zone.riskScore && (
                            <span className={`text-sm font-semibold shrink-0 ${zone.riskScore > 0.7 ? 'text-red-600' : zone.riskScore > 0.4 ? 'text-amber-600' : 'text-green-600'}`}>
                              {(zone.riskScore * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          {zoneArea && <span>{formatArea(zoneArea, 'km²')}</span>}
                          {zonePopulation && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-0.5">
                                <Users className="h-3 w-3" />
                                {zonePopulation}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(zone.hazardType || zone.primaryHazard) && (
                            <Badge variant="outline" className="flex items-center gap-1 text-xs py-0.5 px-2">
                              {getHazardIcon(zone.hazardType || zone.primaryHazard)}
                              <span>{(zone.hazardType || zone.primaryHazard).replace(/_/g, ' ')}</span>
                            </Badge>
                          )}
                          {zone.secondaryHazard && (
                            <Badge variant="outline" className="flex items-center gap-1 text-xs py-0.5 px-2 opacity-70">
                              {getHazardIcon(zone.secondaryHazard)}
                              <span>{zone.secondaryHazard.replace(/_/g, ' ')}</span>
                            </Badge>
                          )}
                          {zone.interventionType && (
                            <Badge variant="secondary" className="text-xs py-0.5 px-2">
                              {formatInterventionType(zone.interventionType)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0 pb-4 px-4 flex-1">
                    {interventions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {interventions.length} {interventions.length === 1 ? 'Intervention' : 'Interventions'}
                        </p>
                        <div className="space-y-2">
                          {interventions.map((intervention: any) => {
                            const impacts = intervention.impacts || {};
                            const hasHighImpact = Object.values(impacts).some(v => v === 'high');
                            
                            return (
                              <div 
                                key={intervention.interventionId || intervention.id} 
                                className="p-3 bg-muted/30 rounded-lg border border-border/50"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    {intervention.assetName ? (
                                      <>
                                        <p className="text-sm font-semibold truncate">{intervention.assetName}</p>
                                        <p className="text-xs text-primary/80 truncate">
                                          {intervention.interventionName || intervention.name}
                                        </p>
                                      </>
                                    ) : (
                                      <p className="text-sm font-semibold truncate">{intervention.interventionName || intervention.name}</p>
                                    )}
                                  </div>
                                  {hasHighImpact && (
                                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 shrink-0 text-[11px] py-0 px-1.5 h-5">
                                      <TrendingUp className="h-3 w-3 mr-0.5" />
                                      High
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                  {intervention.estimatedCost && (
                                    <span>{formatCost(intervention.estimatedCost)}</span>
                                  )}
                                  {intervention.estimatedArea && (
                                    <span>{formatArea(intervention.estimatedArea, intervention.areaUnit || 'ha')}</span>
                                  )}
                                </div>
                                {intervention.impacts && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {intervention.impacts.flood && (
                                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${getImpactLevel(intervention.impacts.flood).color}`}>
                                        <Droplets className="h-3 w-3" />
                                        {intervention.impacts.flood}
                                      </div>
                                    )}
                                    {intervention.impacts.heat && (
                                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${getImpactLevel(intervention.impacts.heat).color}`}>
                                        <Thermometer className="h-3 w-3" />
                                        {intervention.impacts.heat}
                                      </div>
                                    )}
                                    {intervention.impacts.landslide && intervention.impacts.landslide !== 'low' && (
                                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${getImpactLevel(intervention.impacts.landslide).color}`}>
                                        <Mountain className="h-3 w-3" />
                                        {intervention.impacts.landslide}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center text-muted-foreground bg-muted/20 rounded-lg">
                        <p className="text-sm">{t('impactModel.noInterventionsInZone')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function GenerationModal({ 
  isOpen, 
  estimatedTime 
}: { 
  isOpen: boolean;
  estimatedTime: string;
}) {
  const { t } = useTranslation();
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    
    const interval = setInterval(() => {
      setCurrentPhraseIndex((prev) => (prev + 1) % GENERATION_PHRASES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4">
        <Card className="border-primary/20 shadow-xl">
          <CardContent className="py-12 px-8">
            <div className="flex flex-col items-center text-center space-y-8">
              {/* Animated Loader */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 to-primary/80 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-white animate-pulse" />
                </div>
                <div className="absolute -inset-2 rounded-full border-2 border-primary/30 animate-ping opacity-30" />
              </div>

              {/* Rotating Phrases */}
              <div className="space-y-3 min-h-[60px]">
                <p 
                  key={currentPhraseIndex}
                  className="text-lg font-medium text-foreground animate-fade-in"
                >
                  {GENERATION_PHRASES[currentPhraseIndex]}...
                </p>
                <div className="flex justify-center gap-1.5">
                  {GENERATION_PHRASES.map((_, index) => (
                    <div 
                      key={index}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        index === currentPhraseIndex 
                          ? 'bg-primary scale-110' 
                          : 'bg-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Time Estimate */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{t('impactModel.estimatedTime')}: {estimatedTime}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function renderMarkdown(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  const escaped = DOMPurify.sanitize(trimmed, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  let html = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4 class="text-base font-semibold mt-4 mb-2">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-lg font-semibold mt-5 mb-2">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc space-y-1 my-2">$&</ul>')
    .replace(/\n\n/g, '</p><p class="my-3">')
    .replace(/\n/g, '<br/>');
  const wrapped = `<p>${html}</p>`;
  const cleaned = wrapped.replace(/<p>\s*<\/p>/g, '').replace(/<p class="my-3">\s*<\/p>/g, '');
  return DOMPurify.sanitize(cleaned);
}

interface EditingKPI {
  groupId: string;
  kpiId: string;
  low: number;
  high: number;
  unit: string;
  evidenceSource: string;
}

function QuantifyStep({
  data,
  onUpdate,
  isQuantifying,
  onQuantify,
  siteExplorerZones,
}: {
  data: ImpactModelData;
  onUpdate: (d: Partial<ImpactModelData>) => void;
  isQuantifying: boolean;
  onQuantify: () => Promise<void>;
  siteExplorerZones: any[];
}) {
  const { t } = useTranslation();
  const qi = data.quantifiedImpacts;
  const [editingKPI, setEditingKPI] = useState<EditingKPI | null>(null);

  const handleEditKPI = (groupId: string, kpi: any) => {
    setEditingKPI({
      groupId,
      kpiId: kpi.id,
      low: kpi.valueRange.low,
      high: kpi.valueRange.high,
      unit: kpi.unit,
      evidenceSource: kpi.userEvidenceSource || '',
    });
  };

  const handleSaveKPI = () => {
    if (!editingKPI || !qi) return;
    
    const updatedGroups = qi.impactGroups.map((group: any) => {
      if (group.id !== editingKPI.groupId) return group;
      return {
        ...group,
        kpis: group.kpis.map((kpi: any) => {
          if (kpi.id !== editingKPI.kpiId) return kpi;
          return {
            ...kpi,
            valueRange: { low: editingKPI.low, high: editingKPI.high },
            unit: editingKPI.unit,
            userEvidenceSource: editingKPI.evidenceSource || undefined,
            evidenceTier: editingKPI.evidenceSource ? 'EVIDENCE' : kpi.evidenceTier,
          };
        }),
      };
    });

    onUpdate({
      quantifiedImpacts: {
        ...qi,
        impactGroups: updatedGroups,
      },
    });
    setEditingKPI(null);
  };

  const confidenceDescriptions: Record<string, string> = {
    HIGH: 'Strong evidence from multiple peer-reviewed studies or validated local data supports this estimate.',
    MEDIUM: 'Moderate evidence from similar projects or regional studies. Values may vary based on local conditions.',
    LOW: 'Limited evidence or expert judgment. Actual results could differ significantly.',
  };

  const evidenceDescriptions: Record<string, string> = {
    EVIDENCE: 'Based on direct measurements or peer-reviewed scientific literature with strong empirical support.',
    MODELLED: 'Derived from validated models calibrated with similar project data or regional benchmarks.',
    ASSUMPTION: 'Expert estimate based on professional judgment. Requires validation during implementation.',
  };

  const getConfidenceBadge = (confidence: string) => {
    const colors: Record<string, string> = {
      HIGH: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      MEDIUM: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      LOW: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`text-xs cursor-help ${colors[confidence] || colors.MEDIUM}`}>{confidence}</Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm">{confidenceDescriptions[confidence] || 'Confidence level for this estimate.'}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const getEvidenceBadge = (tier: string) => {
    const colors: Record<string, string> = {
      EVIDENCE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      MODELLED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      ASSUMPTION: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    };
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`text-xs cursor-help ${colors[tier] || colors.ASSUMPTION}`}>{tier}</Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm">{evidenceDescriptions[tier] || 'Source of the estimate.'}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const getConfidencePercentTooltip = (confidence: number) => {
    const pct = Math.round(confidence * 100);
    let description = 'Confidence level for this estimate.';
    if (pct >= 70) description = 'High confidence: Strong evidence supports this estimate.';
    else if (pct >= 40) description = 'Medium confidence: Moderate evidence from similar projects.';
    else description = 'Low confidence: Limited evidence, actual results may vary.';
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground cursor-help">{pct}%</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm">{description}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const enabledBundles = data.interventionBundles.filter(b => b.enabled);
  const totalInterventionCount = enabledBundles.reduce((sum, b) => sum + (b.interventions?.length || 0), 0);

  const getZoneInterventions = (bundleId: string) => {
    const zone = siteExplorerZones.find(z => (z.zoneId || z.id) === bundleId);
    return zone?.interventionPortfolio || [];
  };

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <Card className="bg-white dark:bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('impactModel.quantify.title')}</CardTitle>
          <CardDescription>{t('impactModel.quantify.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {enabledBundles.length > 0 && (
            <div className="p-4 rounded-lg bg-muted/40 border border-border/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {enabledBundles.length} {enabledBundles.length === 1 ? 'Zone' : 'Zones'} · {totalInterventionCount} {totalInterventionCount === 1 ? 'intervention' : 'interventions'}
                  </p>
                </div>
                {(() => {
                  const totalCapex = enabledBundles.reduce((sum, b) => sum + ((b.capexRange?.low || 0) + (b.capexRange?.high || 0)) / 2, 0);
                  if (totalCapex > 0) {
                    const fmt = totalCapex >= 1000000 ? `$${(totalCapex / 1000000).toFixed(1)}M` : totalCapex >= 1000 ? `$${(totalCapex / 1000).toFixed(0)}K` : `$${totalCapex.toFixed(0)}`;
                    return <span className="text-xs text-muted-foreground">Est. investment: {fmt}</span>;
                  }
                  return null;
                })()}
              </div>
              <div className="flex flex-wrap gap-2">
                {enabledBundles.map(bundle => {
                  const zoneInterventions = getZoneInterventions(bundle.id);
                  const interventionCount = zoneInterventions.length || bundle.interventions?.length || 0;
                  const hazards = bundle.targetHazards?.map(h => h.replace(/_/g, ' ')).join(', ');
                  return (
                    <Tooltip key={bundle.id}>
                      <TooltipTrigger asChild>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-sm cursor-default hover:border-primary/40 transition-colors">
                          <span className="font-medium">{bundle.name}</span>
                          {hazards && (
                            <span className="text-[11px] text-muted-foreground">({hazards})</span>
                          )}
                          <Badge variant="secondary" className="text-[11px] py-0 px-1.5 h-5 ml-0.5">
                            {interventionCount}
                          </Badge>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs p-3">
                        <p className="text-xs font-semibold mb-1.5">{bundle.name}</p>
                        {hazards && (
                          <p className="text-xs text-muted-foreground mb-2">Hazards: {hazards}</p>
                        )}
                        {bundle.capexRange && (bundle.capexRange.low > 0 || bundle.capexRange.high > 0) && (
                          <p className="text-xs text-muted-foreground mb-2">
                            CAPEX: ${((bundle.capexRange.low) / 1000000).toFixed(1)}M – ${((bundle.capexRange.high) / 1000000).toFixed(1)}M
                          </p>
                        )}
                        {zoneInterventions.length > 0 ? (
                          <ul className="space-y-1">
                            {zoneInterventions.map((inv: any, idx: number) => (
                              <li key={inv.interventionId || idx} className="text-xs flex items-start gap-1.5">
                                <span className="text-muted-foreground mt-0.5">·</span>
                                <span>
                                  <span className="font-medium">{inv.assetName || inv.interventionName || inv.name}</span>
                                  {inv.interventionName && inv.assetName && (
                                    <span className="text-muted-foreground"> — {inv.interventionName}</span>
                                  )}
                                  {inv.category && (
                                    <span className="text-muted-foreground"> [{inv.category.replace(/_/g, ' ')}]</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : bundle.interventions?.length > 0 ? (
                          <ul className="space-y-1">
                            {bundle.interventions.map((desc, idx) => (
                              <li key={idx} className="text-xs flex items-start gap-1.5">
                                <span className="text-muted-foreground mt-0.5">·</span>
                                <span>{desc}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">No interventions</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}

          {qi && (
            <div className="flex items-center gap-3">
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                {qi.evidenceContext.chunksUsed} {t('impactModel.quantify.evidenceChunks')}
              </Badge>
            </div>
          )}

          {!qi && (
            <Button
              onClick={onQuantify}
              disabled={isQuantifying || (data.interventionBundles.filter(b => b.enabled).length === 0)}
              className="w-full"
            >
              {isQuantifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('impactModel.quantify.quantifying')}
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {t('impactModel.quantify.quantifyButton')}
                </>
              )}
            </Button>
          )}

          {qi && qi.impactGroups.length === 0 && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {t('impactModel.quantify.noResultsMessage', 'Quantification completed but found no impact data. This may happen if the knowledge base is empty or the evidence doesn\'t match your interventions.')}
                </p>
              </div>
              <Button
                onClick={onQuantify}
                disabled={isQuantifying || (data.interventionBundles.filter(b => b.enabled).length === 0)}
                variant="outline"
                className="w-full"
              >
                {isQuantifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('impactModel.quantify.quantifying')}
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('impactModel.quantify.retryQuantify', 'Try Again')}
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quantified KPI cards */}
      {qi && qi.impactGroups.length > 0 && (() => {
        const allKpis = qi.impactGroups.flatMap((g: any) => g.kpis);
        const hazardMap = new Map<string, any[]>();
        for (const group of qi.impactGroups) {
          const h = group.hazardType || 'OTHER';
          if (!hazardMap.has(h)) hazardMap.set(h, []);
          hazardMap.get(h)!.push(group);
        }

        const normalizeUnit = (u: string) => {
          const lower = u.toLowerCase().trim();
          const aliases: Record<string, string> = { 'ha': 'hectares', 'hectare': 'hectares', 'sqm': 'm²', 'sq m': 'm²', 'square meters': 'm²', 'square metres': 'm²', 'cubic meters': 'm³', 'cubic metres': 'm³', 'tons': 'tonnes', 'ton': 'tonnes', 'tonne': 'tonnes', 't co2': 'tCO₂/year', 'tco2': 'tCO₂/year', 'tco2/year': 'tCO₂/year', 'tonnes co2/year': 'tCO₂/year', 't co2e': 'tCO₂/year', 'tco2e/year': 'tCO₂/year' };
          return aliases[lower] || lower;
        };

        const aggregateByUnit = (kpis: any[]) => {
          const metricMap = new Map<string, { low: number; high: number; names: string[]; unit: string; count: number }>();
          for (const kpi of kpis) {
            const rawUnit = kpi.unit || '';
            const u = normalizeUnit(rawUnit);
            if (!u || u === 'n/a') continue;
            if (u.includes('%') || u.includes('ratio') || u.includes('score')) continue;
            const key = u;
            const existing = metricMap.get(key);
            if (existing) {
              existing.low += kpi.valueRange?.low || 0;
              existing.high += kpi.valueRange?.high || 0;
              existing.count++;
              if (kpi.name && !existing.names.includes(kpi.name)) {
                existing.names.push(kpi.name);
              }
            } else {
              metricMap.set(key, {
                low: kpi.valueRange?.low || 0,
                high: kpi.valueRange?.high || 0,
                names: kpi.name ? [kpi.name] : [],
                unit: u,
                count: 1,
              });
            }
          }
          return Array.from(metricMap.entries())
            .filter(([, v]) => v.count >= 1)
            .sort((a, b) => (b[1].high - a[1].high))
            .slice(0, 4);
        };

        const summaryLabel = (agg: { names: string[]; unit: string; count: number }) => {
          if (agg.names.length === 1) return agg.names[0];
          if (agg.names.length <= 2) return agg.names.join(' + ');
          return `${agg.names[0]} + ${agg.names.length - 1} more`;
        };

        const projectTotals = aggregateByUnit(allKpis);
        const fmtVal = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0);

        const zoneNameLookup = new Map<string, string>();
        siteExplorerZones.forEach((z: any) => {
          const id = z.zoneId || z.id;
          const name = z.zoneName || z.name;
          if (id && name && !/^zone_\d+$/i.test(name)) zoneNameLookup.set(id, name);
        });
        data.interventionBundles?.forEach((b: any) => {
          if (b.id && b.name && !/^zone_\d+$/i.test(b.name) && !zoneNameLookup.has(b.id)) {
            zoneNameLookup.set(b.id, b.name);
          }
        });

        const cleanZoneRefs = (text: string) => {
          if (!text || typeof text !== 'string') return text;
          return text.replace(/\bzone_(\d+)\b/gi, (_m, num) => {
            const fullId = `zone_${num}`;
            return zoneNameLookup.get(fullId) || `Zone ${num}`;
          });
        };

        const resolveZoneName = (group: any) => {
          const isRawId = (s: string) => /^zone_\d+$/i.test(s);
          if (group.interventionBundle && !isRawId(group.interventionBundle)) {
            return group.interventionBundle;
          }
          if (group.zoneId && zoneNameLookup.has(group.zoneId)) {
            return zoneNameLookup.get(group.zoneId);
          }
          const raw = group.interventionBundle || group.zoneId || 'Zone';
          const match = raw.match(/zone_(\d+)/i);
          if (match) return `Zone ${match[1]}`;
          return raw.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        };

        const hazardSectionTitle = (hazardType: string) => {
          const labels: Record<string, string> = {
            'HEAT': 'Heat Adaptation Measures',
            'FLOOD': 'Flood Mitigation Measures',
            'LANDSLIDE': 'Landslide Prevention Measures',
            'DROUGHT': 'Drought Resilience Measures',
            'WILDFIRE': 'Wildfire Prevention Measures',
            'OTHER': 'Other Intervention Measures',
          };
          return labels[hazardType] || `${hazardType.replace(/_/g, ' ')} Measures`;
        };

        return (
        <div className="space-y-6">
          {projectTotals.length > 0 && (
            <Card className="bg-white dark:bg-card border-primary/20">
              <CardContent className="py-4 px-5">
                <p className="text-sm font-semibold mb-3">Project-Wide Impact Summary</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {projectTotals.map(([, agg]) => (
                    <div key={agg.unit} className="text-center p-3 rounded-lg bg-primary/5">
                      <p className="text-xl font-bold text-primary">{fmtVal(agg.low)}–{fmtVal(agg.high)}</p>
                      <p className="text-xs font-medium text-foreground/70 mt-0.5">{summaryLabel(agg)}</p>
                      <p className="text-[11px] text-muted-foreground">{agg.unit}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {Array.from(hazardMap.entries()).map(([hazardType, groups]) => {
            const totalKpiCount = groups.reduce((sum: number, g: any) => sum + g.kpis.length, 0);

            return (
              <div key={hazardType} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{hazardSectionTitle(hazardType)}</h3>
                  <Badge variant="outline" className="text-xs">{groups.length} {groups.length === 1 ? 'zone' : 'zones'}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{totalKpiCount} metrics</span>
                </div>

                {groups.map((group: any) => {
                  const zoneName = resolveZoneName(group);
                  const zonePortfolio = siteExplorerZones.find((z: any) => (z.zoneId || z.id) === group.zoneId)?.interventionPortfolio || [];
                  const interventionCount = zonePortfolio.length || Array.from(new Set(group.kpis.map((k: any) => k.interventionName).filter(Boolean) as string[])).length;
                  return (
                    <Card key={group.id} className="bg-white dark:bg-card">
                      <CardHeader className="pb-2 pt-4 px-5">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-semibold">{zoneName}</CardTitle>
                          {interventionCount > 0 && (
                            <span className="text-xs text-muted-foreground">{interventionCount} {interventionCount === 1 ? 'intervention' : 'interventions'}</span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="px-5 pb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {group.kpis.map((kpi: any) => {
                            const isEditing = editingKPI?.groupId === group.id && editingKPI?.kpiId === kpi.id;
                            return (
                              <div key={kpi.id} className="relative group/card p-4 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                                {isEditing && editingKPI ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-xs">Min</Label>
                                        <Input type="number" value={editingKPI.low} onChange={(e) => setEditingKPI({ ...editingKPI, low: parseFloat(e.target.value) || 0 })} className="h-7 text-sm" />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Max</Label>
                                        <Input type="number" value={editingKPI.high} onChange={(e) => setEditingKPI({ ...editingKPI, high: parseFloat(e.target.value) || 0 })} className="h-7 text-sm" />
                                      </div>
                                    </div>
                                    <div>
                                      <Label className="text-xs">Unit</Label>
                                      <Input value={editingKPI.unit} onChange={(e) => setEditingKPI({ ...editingKPI, unit: e.target.value })} className="h-7 text-sm" />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Evidence (optional)</Label>
                                      <Textarea value={editingKPI.evidenceSource} onChange={(e) => setEditingKPI({ ...editingKPI, evidenceSource: e.target.value })} className="h-14 text-xs resize-none" />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={handleSaveKPI} className="flex-1 h-7 text-xs"><Check className="h-3 w-3 mr-1" />Save</Button>
                                      <Button size="sm" variant="outline" onClick={() => setEditingKPI(null)} className="flex-1 h-7 text-xs">Cancel</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <Button variant="ghost" size="icon" className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover/card:opacity-100 transition-opacity" onClick={() => handleEditKPI(group.id, kpi)}>
                                      <Edit3 className="h-3 w-3" />
                                    </Button>
                                    <p className="text-sm font-medium leading-snug pr-6">{cleanZoneRefs(kpi.name)}</p>
                                    <div>
                                      <p className="text-2xl font-bold text-primary leading-tight">
                                        {fmtVal(kpi.valueRange.low)}–{fmtVal(kpi.valueRange.high)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">{kpi.unit}</p>
                                    </div>
                                    {kpi.interventionName && (
                                      <p className="text-xs text-muted-foreground">{cleanZoneRefs(kpi.interventionName)}{kpi.category ? ` · ${kpi.category.replace(/_/g, ' ')}` : ''}</p>
                                    )}
                                    {kpi.userEvidenceSource && (
                                      <p className="text-xs text-blue-600 dark:text-blue-400 italic line-clamp-1">{kpi.userEvidenceSource}</p>
                                    )}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-1.5 cursor-help">
                                          {typeof kpi.confidence === 'number' ? getConfidencePercentTooltip(kpi.confidence) : getConfidenceBadge(String(kpi.confidence))}
                                          {getEvidenceBadge(kpi.evidenceTier)}
                                        </div>
                                      </TooltipTrigger>
                                      {kpi.methodology && (
                                        <TooltipContent side="bottom" className="max-w-xs p-3">
                                          <p className="text-xs font-medium mb-1">Methodology</p>
                                          <p className="text-xs text-muted-foreground">{kpi.methodology}</p>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}

          {qi.coBenefits.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{t('impactModel.quantify.coBenefitsTitle')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {qi.coBenefits.map((cb) => (
                  <div key={cb.id} className="p-4 rounded-lg border bg-white dark:bg-card text-left">
                    <div className="space-y-2 text-left">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wide">{cb.category?.replace(/[_/]/g, ' ')}</p>
                      {cb.valueRange && typeof cb.valueRange.low === 'number' && typeof cb.valueRange.high === 'number' && (cb.valueRange.low > 0 || cb.valueRange.high > 0) ? (
                        <div>
                          <p className="text-xl font-bold text-primary">
                            {fmtVal(cb.valueRange.low)}–{fmtVal(cb.valueRange.high)}
                          </p>
                          <p className="text-xs text-muted-foreground">{cb.unit}</p>
                        </div>
                      ) : cb.metric ? (
                        <p className="text-sm text-muted-foreground italic">{cleanZoneRefs(cb.metric)}</p>
                      ) : null}
                      <p className="text-sm font-medium leading-snug">{cleanZoneRefs(cb.title)}</p>
                      <div className="flex items-center gap-1.5">
                        {getConfidenceBadge(cb.confidence)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {qi.mrvIndicators.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{t('impactModel.quantify.mrvTitle')}</h3>
              <div className="space-y-2">
                {qi.mrvIndicators.map((mrv) => (
                  <div key={mrv.id} className="p-4 rounded-lg border bg-white dark:bg-card">
                    <p className="text-sm font-medium mb-1">{mrv.name}</p>
                    <p className="text-sm font-bold text-primary mb-1">{typeof mrv.baselineValue === 'object' ? JSON.stringify(mrv.baselineValue) : mrv.baselineValue} → {typeof mrv.targetValue === 'object' ? JSON.stringify(mrv.targetValue) : mrv.targetValue}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{mrv.dataSource}</span>
                      {mrv.frequency && <span>· {mrv.frequency}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            onClick={onQuantify}
            disabled={isQuantifying}
            className="w-full"
          >
            {isQuantifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('impactModel.quantify.quantifying')}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('impactModel.quantify.reQuantify')}
              </>
            )}
          </Button>
        </div>
        );
      })()}
    </div>
    </TooltipProvider>
  );
}

const LENS_ICONS: Record<LensType, ReactNode> = {
  neutral: <Scale className="h-4 w-4" />,
  climate: <Thermometer className="h-4 w-4" />,
  social: <Users className="h-4 w-4" />,
  financial: <TrendingUp className="h-4 w-4" />,
  institutional: <Building2 className="h-4 w-4" />,
};

function NarrateStep({
  data,
  onUpdate,
  isNarrating,
  onNarrate,
  onFinalize,
}: {
  data: ImpactModelData;
  onUpdate: (d: Partial<ImpactModelData>) => void;
  isNarrating: boolean;
  onNarrate: (lens?: LensType, lensInstructions?: string) => Promise<void>;
  onFinalize: () => void;
}) {
  const { t } = useTranslation();
  const hasNarrative = (data.narrativeCache?.base?.length ?? 0) > 0;
  const hasKPIs = (data.quantifiedImpacts?.impactGroups?.length ?? 0) > 0;
  const [selectedLensForGen, setSelectedLensForGen] = useState<LensType>('neutral');
  const [lensInstructions, setLensInstructions] = useState('');

  const activeLens = data.selectedLens || 'neutral';
  const activeBlocks = activeLens === 'neutral'
    ? (data.narrativeCache?.base || [])
    : (data.narrativeCache?.lensVariants?.[activeLens]?.length
        ? data.narrativeCache.lensVariants[activeLens]
        : data.narrativeCache?.base || []);
  const blocks = activeBlocks;

  const coBenefits = data.coBenefits || [];
  const availableLenses: LensType[] = ['neutral', 'climate', 'social', 'financial', 'institutional'];
  const lensesWithContent = availableLenses.filter(l => {
    if (l === 'neutral') return (data.narrativeCache?.base?.length ?? 0) > 0;
    return (data.narrativeCache?.lensVariants?.[l]?.length ?? 0) > 0;
  });

  const handleLensGenerate = async () => {
    if (selectedLensForGen === 'neutral') {
      await onNarrate();
    } else {
      await onNarrate(selectedLensForGen, lensInstructions || undefined);
    }
  };

  const totalKPIs = data.quantifiedImpacts?.impactGroups?.reduce((sum, g) => sum + (g.kpis?.length || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {!hasNarrative && !isNarrating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('impactModel.narrate.title')}</CardTitle>
            <CardDescription>{t('impactModel.narrate.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasKPIs && (
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm font-medium mb-1">{t('impactModel.narrate.kpiSummary')}</p>
                <p className="text-xs text-muted-foreground">
                  {data.quantifiedImpacts!.impactGroups.length} {t('impactModel.narrate.impactGroups')},
                  {' '}{totalKPIs} KPIs,
                  {' '}{data.quantifiedImpacts!.coBenefits.length} {t('impactModel.narrate.coBenefitsCount')},
                  {' '}{data.quantifiedImpacts!.mrvIndicators.length} {t('impactModel.narrate.mrvCount')}
                </p>
              </div>
            )}

            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-1">3-Phase Generation Pipeline</p>
              <p className="text-xs text-blue-600 dark:text-blue-300">
                1. Plan outline to prevent content overlap between sections{' \u2192 '}
                2. Generate all 10 blocks in parallel{' \u2192 '}
                3. Assemble with co-benefits and downstream signals
              </p>
            </div>

            <Button onClick={() => onNarrate()} disabled={isNarrating} className="w-full">
              <Sparkles className="h-4 w-4 mr-2" />
              {t('impactModel.generateNarrative')}
            </Button>
          </CardContent>
        </Card>
      )}

      {!hasNarrative && isNarrating && (
        <Card className="border-primary/20">
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div>
                <p className="text-lg font-medium">{t('impactModel.narrate.generating')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Planning outline, generating 10 blocks in parallel, and assembling narrative
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasNarrative && (
        <div className="space-y-6">
          {/* Header with lens toggle */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">{t('impactModel.narrate.generatedNarrative')}</h2>
                <Badge variant="secondary">{blocks.length} blocks</Badge>
              </div>
              <Button variant="outline" onClick={() => onNarrate()} disabled={isNarrating} size="sm">
                {isNarrating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('impactModel.regenerateNarrative')}
                  </>
                )}
              </Button>
            </div>

            {/* Active lens indicator + lens toggle */}
            {lensesWithContent.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Viewing:</span>
                {lensesWithContent.map((l) => (
                  <Button
                    key={l}
                    size="sm"
                    variant={activeLens === l ? "default" : "outline"}
                    className="h-7 text-xs gap-1.5"
                    onClick={() => onUpdate({ selectedLens: l })}
                  >
                    {LENS_ICONS[l]}
                    {t(`impactModel.lenses.${l}`)}
                  </Button>
                ))}
              </div>
            )}

            {/* Compact lens regeneration panel - top */}
            <Card className="border-dashed border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Generate with Analytical Lens
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {availableLenses.filter(l => l !== 'neutral').map((l) => {
                        const hasVariant = (data.narrativeCache?.lensVariants?.[l]?.length ?? 0) > 0;
                        return (
                          <Button
                            key={l}
                            size="sm"
                            variant={selectedLensForGen === l ? "default" : "outline"}
                            className={`h-7 text-xs gap-1 ${hasVariant ? 'ring-1 ring-green-500/50' : ''}`}
                            onClick={() => setSelectedLensForGen(l)}
                          >
                            {LENS_ICONS[l]}
                            {t(`impactModel.lenses.${l}`)}
                            {hasVariant && <Check className="h-3 w-3 text-green-500" />}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-end gap-2 w-full sm:w-auto">
                    <div className="flex-1 sm:w-48">
                      <Input
                        placeholder="Custom instructions (optional)"
                        value={lensInstructions}
                        onChange={(e) => setLensInstructions(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={handleLensGenerate}
                      disabled={isNarrating || selectedLensForGen === 'neutral'}
                    >
                      {isNarrating ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Generate
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {data.generationMeta?.generatedAt && (
            <p className="text-xs text-muted-foreground">
              Generated {new Date(data.generationMeta.generatedAt).toLocaleString()} using {data.generationMeta.model || 'AI'}
            </p>
          )}

          <div className="space-y-4 max-w-3xl">
            {blocks.map((block, index) => (
              <Card key={block.id} className={`overflow-hidden ${!block.included ? 'opacity-60' : ''}`}>
                <CardHeader className="py-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-5">{index + 1}.</span>
                      <CardTitle className="text-base">{block.title}</CardTitle>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs capitalize">
                        {(block.type || 'content').replace(/_/g, ' ')}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {block.evidenceTier}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(block.contentMd) }}
                  />
                  {block.kpis && block.kpis.length > 0 && (
                    <div className="mt-3 pt-3 border-t flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {block.kpis.length} KPI{block.kpis.length > 1 ? 's' : ''} referenced
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {block.kpis.map(k => k.name).join(', ')}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {coBenefits.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">{t('impactModel.coBenefitsTitle')}</h2>
              </div>
              <p className="text-muted-foreground mb-6">{t('impactModel.coBenefitsDescription')}</p>
              <div className="space-y-4 max-w-3xl">
                {coBenefits.map((cb) => (
                  <Card key={cb.name}>
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-base mb-1">{cb.name}</h3>
                          <p className="text-sm text-muted-foreground">{cb.description}</p>
                          {cb.estimatedValue && (
                            <div className="mt-2 text-sm">
                              <span className="text-muted-foreground">Estimated value: </span>
                              <span className="font-medium">{cb.estimatedValue}</span>
                            </div>
                          )}
                          {cb.where && cb.where.length > 0 && (
                            <div className="mt-1 text-sm">
                              <span className="text-muted-foreground">Where: </span>
                              <span className="font-medium">{cb.where.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Card className="border-dashed border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Regenerate with a Different Lens
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableLenses.filter(l => l !== 'neutral').map((l) => {
                      const hasVariant = (data.narrativeCache?.lensVariants?.[l]?.length ?? 0) > 0;
                      return (
                        <Button
                          key={l}
                          size="sm"
                          variant={selectedLensForGen === l ? "default" : "outline"}
                          className={`h-7 text-xs gap-1 ${hasVariant ? 'ring-1 ring-green-500/50' : ''}`}
                          onClick={() => setSelectedLensForGen(l)}
                        >
                          {LENS_ICONS[l]}
                          {t(`impactModel.lenses.${l}`)}
                          {hasVariant && <Check className="h-3 w-3 text-green-500" />}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-end gap-2 w-full sm:w-auto">
                  <div className="flex-1 sm:w-48">
                    <Input
                      placeholder="Custom instructions (optional)"
                      value={lensInstructions}
                      onChange={(e) => setLensInstructions(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={handleLensGenerate}
                    disabled={isNarrating || selectedLensForGen === 'neutral'}
                  >
                    {isNarrating ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Generate
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={onFinalize} size="lg">
              <Check className="h-4 w-4 mr-2" />
              {t('impactModel.finalize')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CurateStep({
  data,
  onUpdate,
  onRegenerateBlock,
  isRegenerating
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
  onRegenerateBlock: (block: NarrativeBlock, prompt: string) => Promise<void>;
  isRegenerating: string | null;
}) {
  const { t } = useTranslation();
  const [regenerateModalBlock, setRegenerateModalBlock] = useState<NarrativeBlock | null>(null);
  const [regeneratePrompt, setRegeneratePrompt] = useState('');
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  const blocks = data.narrativeCache.base || [];
  const coBenefits = data.coBenefits || [];

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;
    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    onUpdate({
      narrativeCache: {
        ...data.narrativeCache,
        base: newBlocks,
      },
    });
  };

  const handleRegenerateSubmit = async () => {
    if (!regenerateModalBlock) return;
    await onRegenerateBlock(regenerateModalBlock, regeneratePrompt);
    setRegenerateModalBlock(null);
    setRegeneratePrompt('');
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'HIGH': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'MEDIUM': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getCategoryIcon = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes('health')) return '🏥';
    if (cat.includes('economic') || cat.includes('financial')) return '💰';
    if (cat.includes('social') || cat.includes('community')) return '👥';
    if (cat.includes('environment') || cat.includes('ecological')) return '🌿';
    if (cat.includes('climate')) return '🌡️';
    if (cat.includes('biodiversity')) return '🦋';
    if (cat.includes('water')) return '💧';
    return '✨';
  };

  if (blocks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Edit3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{t('impactModel.noNarrativeYet')}</p>
          <p className="text-sm mt-2">{t('impactModel.returnToSetup')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Narrative Blocks Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Edit3 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">{t('impactModel.narrativeBlocks')}</h2>
        </div>
        <p className="text-muted-foreground mb-6">{t('impactModel.curateDescription')}</p>
        
        <div className="space-y-6 max-w-3xl">
          {blocks.map((block, index) => (
            <Card 
              key={block.id} 
              className={`overflow-hidden transition-all ${block.included ? 'border-primary/20 shadow-sm' : 'opacity-60 border-dashed'}`}
            >
              {/* Block Header */}
              <div className="flex items-start gap-4 p-5 bg-gradient-to-r from-muted/50 to-transparent border-b">
                <Checkbox 
                  checked={block.included}
                  onCheckedChange={(checked) => {
                    const updatedBlocks = blocks.map(b => 
                      b.id === block.id ? { ...b, included: !!checked } : b
                    );
                    onUpdate({
                      narrativeCache: {
                        ...data.narrativeCache,
                        base: updatedBlocks,
                      },
                    });
                  }}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold leading-tight">{block.title}</h3>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-xs capitalize">
                      {(block.type || 'content').replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {block.evidenceTier}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveBlock(index, 'up')}
                    disabled={index === 0}
                    className="h-8 w-8 p-0"
                    title={t('impactModel.moveUp')}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => moveBlock(index, 'down')}
                    disabled={index === blocks.length - 1}
                    className="h-8 w-8 p-0"
                    title={t('impactModel.moveDown')}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingBlockId(editingBlockId === block.id ? null : block.id)}
                    className="h-8 w-8 p-0"
                    title="Edit"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRegenerateModalBlock(block);
                      setRegeneratePrompt('');
                    }}
                    disabled={isRegenerating === block.id}
                    className="h-8 w-8 p-0"
                    title={t('impactModel.regenerateBlock')}
                  >
                    {isRegenerating === block.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* KPIs/Metrics - Prominent Display */}
              {block.kpis && block.kpis.length > 0 && (
                <div className="px-5 py-4 bg-primary/5 border-b">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                    Key Metrics
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {block.kpis.map((kpi, i) => (
                      <div key={i} className="bg-white dark:bg-gray-900 rounded-lg p-3 shadow-sm border">
                        <p className="text-xs text-muted-foreground mb-1">{kpi.name}</p>
                        <p className="text-lg font-bold text-primary">
                          {kpi.valueRange}
                          <span className="text-sm font-normal text-muted-foreground ml-1">{kpi.unit}</span>
                        </p>
                        {kpi.confidence && (
                          <Badge variant="outline" className="text-[10px] mt-1">{kpi.confidence}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Block Content */}
              <div className="p-5">
                {editingBlockId === block.id ? (
                  <Textarea
                    value={block.contentMd}
                    onChange={(e) => {
                      const updatedBlocks = blocks.map(b => 
                        b.id === block.id ? { ...b, contentMd: e.target.value } : b
                      );
                      onUpdate({
                        narrativeCache: {
                          ...data.narrativeCache,
                          base: updatedBlocks,
                        },
                      });
                    }}
                    className="min-h-[200px] text-sm font-mono"
                    placeholder="Enter narrative content..."
                  />
                ) : (
                  <div 
                    className="prose prose-sm max-w-none dark:prose-invert leading-relaxed text-[15px] [&>p:first-child]:mt-0"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(block.contentMd) }}
                  />
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Co-Benefits Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">{t('impactModel.coBenefitsTitle')}</h2>
        </div>
        <p className="text-muted-foreground mb-6">{t('impactModel.coBenefitsDescription')}</p>
        
        <div className="space-y-4 max-w-3xl">
          {coBenefits.map((cb) => (
            <Card 
              key={cb.id} 
              className={`overflow-hidden transition-all ${cb.included ? 'shadow-sm' : 'opacity-50 border-dashed'}`}
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <Checkbox 
                    checked={cb.included}
                    onCheckedChange={(checked) => {
                      const updated = coBenefits.map(c => 
                        c.id === cb.id ? { ...c, included: !!checked } : c
                      );
                      onUpdate({ coBenefits: updated });
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getCategoryIcon(cb.category)}</span>
                        <div>
                          <h4 className="font-semibold text-base">{cb.title}</h4>
                          <Badge variant="outline" className="text-xs mt-1 capitalize">
                            {cb.category.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                      <Badge className={`shrink-0 ${getConfidenceColor(cb.confidence)}`}>
                        {cb.confidence}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      {cb.description}
                    </p>
                    
                    {(cb.whoBenefits?.length > 0 || cb.where?.length > 0) && (
                      <div className="flex flex-wrap gap-4 text-sm pt-3 border-t">
                        {cb.whoBenefits?.length > 0 && (
                          <div>
                            <span className="text-muted-foreground">Who benefits: </span>
                            <span className="font-medium">{cb.whoBenefits.join(', ')}</span>
                          </div>
                        )}
                        {cb.where?.length > 0 && (
                          <div>
                            <span className="text-muted-foreground">Where: </span>
                            <span className="font-medium">{cb.where.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Regenerate Modal */}
      {regenerateModalBlock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                {t('impactModel.regenerateBlock')}
              </CardTitle>
              <CardDescription>
                {regenerateModalBlock.title}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm">{t('impactModel.regenerateInstructions')}</Label>
                <Textarea
                  placeholder={t('impactModel.regenerateInstructionsPlaceholder')}
                  value={regeneratePrompt}
                  onChange={(e) => setRegeneratePrompt(e.target.value)}
                  className="min-h-[100px] mt-2"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRegenerateModalBlock(null)}>
                  {t('common.cancel')}
                </Button>
                <Button 
                  onClick={handleRegenerateSubmit}
                  disabled={!regeneratePrompt || isRegenerating === regenerateModalBlock.id}
                >
                  {isRegenerating === regenerateModalBlock.id ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      {t('impactModel.regenerating')}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t('impactModel.regenerateBlock')}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ExportStep({ 
  data,
  onUpdate,
  onPushToOperations,
  onPushToBusinessModel,
  cityName,
  funderName
}: { 
  data: ImpactModelData;
  onUpdate: (d: Partial<ImpactModelData>) => void;
  onPushToOperations: () => void;
  onPushToBusinessModel: () => void;
  cityName: string;
  funderName: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [previewMode, setPreviewMode] = useState<'markdown' | 'json'>('markdown');
  const lenses: LensType[] = ['neutral', 'climate', 'social', 'financial', 'institutional'];

  const availableLenses = lenses.filter(lens => {
    if (lens === 'neutral') return data.narrativeCache.base && data.narrativeCache.base.length > 0;
    return data.narrativeCache.lensVariants[lens]?.length > 0;
  });

  const getBlocksForLens = (lens: LensType): NarrativeBlock[] => {
    if (lens === 'neutral') return data.narrativeCache.base?.filter(b => b.included) || [];
    return data.narrativeCache.lensVariants[lens]?.filter(b => b.included) || [];
  };

  const includedBlocks = getBlocksForLens(data.selectedLens);
  const includedCoBenefits = data.coBenefits.filter(cb => cb.included);

  const generateMarkdown = () => {
    let md = `# ${cityName} - Impact & Co-Benefits Narrative\n\n`;
    md += `**Funder:** ${funderName}\n`;
    md += `**Lens:** ${data.selectedLens}\n`;
    md += `**Generated:** ${data.generationMeta?.generatedAt ? new Date(data.generationMeta.generatedAt).toLocaleString() : 'Unknown'}\n`;
    md += `**Version:** v1\n\n`;
    md += `---\n\n`;
    
    includedBlocks.forEach(block => {
      md += `## ${block.title}\n\n`;
      md += `*Evidence Tier: ${block.evidenceTier}*\n\n`;
      md += `${block.contentMd}\n\n`;
      if (block.kpis?.length) {
        md += `**Key Metrics:**\n`;
        block.kpis.forEach(kpi => {
          const rangeStr = kpi.valueRange && typeof kpi.valueRange === 'object' ? `${(kpi.valueRange as any).low}–${(kpi.valueRange as any).high}` : String(kpi.valueRange || '');
          md += `- ${kpi.name}: ${rangeStr} ${kpi.unit} (${kpi.confidence})\n`;
        });
        md += `\n`;
      }
    });

    if (includedCoBenefits.length > 0) {
      md += `## Co-Benefits\n\n`;
      includedCoBenefits.forEach(cb => {
        md += `### ${cb.title}\n`;
        md += `*${cb.category} | ${cb.confidence} Confidence | ${cb.evidenceTier}*\n\n`;
        md += `${cb.description}\n\n`;
      });
    }

    return md;
  };

  const generateExportJSON = () => {
    return {
      meta: {
        city: cityName,
        funder: funderName,
        lens: data.selectedLens,
        generatedAt: data.generationMeta?.generatedAt,
        version: 'v1',
      },
      narrativeBlocks: includedBlocks,
      coBenefits: includedCoBenefits,
      downstreamSignals: data.downstreamSignals,
    };
  };

  const handleExportMarkdown = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cityName.replace(/\s+/g, '-').toLowerCase()}-impact-narrative.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t('impactModel.exportSuccess'), description: t('impactModel.markdownExported') });
  };

  const handleExportJSON = () => {
    const exportData = generateExportJSON();
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cityName.replace(/\s+/g, '-').toLowerCase()}-impact-model.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t('impactModel.exportSuccess'), description: t('impactModel.jsonExported') });
  };

  const handleCopyToClipboard = async () => {
    try {
      const content = previewMode === 'markdown' ? generateMarkdown() : JSON.stringify(generateExportJSON(), null, 2);
      await navigator.clipboard.writeText(content);
      toast({ title: t('impactModel.copied'), description: t('impactModel.copiedToClipboard') });
    } catch (err) {
      toast({ title: t('common.error'), description: t('impactModel.copyFailed'), variant: 'destructive' });
    }
  };

  const opsSignals = data.downstreamSignals.operations || [];
  const bmSignals = data.downstreamSignals.businessModel || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('impactModel.exportTitle')}
          </CardTitle>
          <CardDescription>{t('impactModel.exportDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-3">{t('impactModel.exportSummary')}</h4>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('impactModel.city')}:</span>
                <p className="font-medium">{cityName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('impactModel.funder')}:</span>
                <p className="font-medium">{funderName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('impactModel.lensToExport')}:</span>
                <div className="flex gap-1 mt-1">
                  {availableLenses.map(lens => (
                    <Button
                      key={lens}
                      variant={data.selectedLens === lens ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7 px-2 flex items-center gap-1"
                      onClick={() => onUpdate({ selectedLens: lens })}
                    >
                      {LENS_ICONS[lens]}
                      <span className="capitalize">{lens}</span>
                    </Button>
                  ))}
                </div>
                {availableLenses.length > 1 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('impactModel.selectLensToExport')}
                  </p>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">{t('impactModel.version')}:</span>
                <p className="font-medium">v1</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <span className="text-muted-foreground text-sm">{t('impactModel.includedBlocks')}:</span>
              <div className="flex flex-wrap gap-1 mt-2">
                {includedBlocks.map((block) => (
                  <Badge key={block.id} variant="secondary" className="text-xs">{block.title}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {includedBlocks.length} {t('impactModel.blocks')}, {includedCoBenefits.length} {t('impactModel.coBenefitsLabel')}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Button variant="outline" onClick={handleExportMarkdown} className="h-auto py-4 flex-col items-center">
              <FileText className="h-6 w-6 mb-2" />
              <p className="font-medium">{t('impactModel.exportMarkdown')}</p>
              <p className="text-xs text-muted-foreground">{t('impactModel.downloadAsMd')}</p>
            </Button>
            <Button variant="outline" onClick={handleExportJSON} className="h-auto py-4 flex-col items-center">
              <Download className="h-6 w-6 mb-2" />
              <p className="font-medium">{t('impactModel.exportJSON')}</p>
              <p className="text-xs text-muted-foreground">{t('impactModel.downloadWithMeta')}</p>
            </Button>
            <Button variant="outline" onClick={handleCopyToClipboard} className="h-auto py-4 flex-col items-center">
              <Copy className="h-6 w-6 mb-2" />
              <p className="font-medium">{t('impactModel.copyClipboard')}</p>
              <p className="text-xs text-muted-foreground">{t('impactModel.pasteAnywhere')}</p>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('impactModel.preview')}</CardTitle>
          <CardDescription>{t('impactModel.previewDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as 'markdown' | 'json')}>
            <TabsList>
              <TabsTrigger value="markdown">Markdown</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="markdown" className="mt-4">
              <ScrollArea className="h-[400px] border rounded-lg p-4 bg-muted/20">
                <pre className="text-xs font-mono whitespace-pre-wrap">{generateMarkdown()}</pre>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="json" className="mt-4">
              <ScrollArea className="h-[400px] border rounded-lg p-4 bg-muted/20">
                <pre className="text-xs font-mono whitespace-pre-wrap">{JSON.stringify(generateExportJSON(), null, 2)}</pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('impactModel.downstreamSignals')}</CardTitle>
          <CardDescription>{t('impactModel.signalsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-medium">{t('impactModel.operationsSignals')}</h4>
                <p className="text-sm text-muted-foreground">{opsSignals.length} {t('impactModel.signalsReady')}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onPushToOperations}
                disabled={opsSignals.length === 0}
              >
                {t('impactModel.pushToOps')}
              </Button>
            </div>
            {opsSignals.slice(0, 3).map(signal => (
              <div key={signal.id} className="text-sm py-1 border-t">
                <span className="font-medium">{signal.title}</span>
                <span className="text-muted-foreground ml-2">({signal.timeHorizon})</span>
              </div>
            ))}
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-medium">{t('impactModel.businessModelSignals')}</h4>
                <p className="text-sm text-muted-foreground">{bmSignals.length} {t('impactModel.signalsReady')}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onPushToBusinessModel}
                disabled={bmSignals.length === 0}
              >
                {t('impactModel.pushToBM')}
              </Button>
            </div>
            {bmSignals.slice(0, 3).map(signal => (
              <div key={signal.id} className="text-sm py-1 border-t">
                <span className="font-medium">{signal.title}</span>
                <span className="text-muted-foreground ml-2">({signal.confidence})</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ImpactModelPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  const { isSampleMode } = useSampleData();
  const { context, loadContext, updateModule } = useProjectContext();
  const { toast } = useToast();
  const { setPageContext } = useChatState();
  
  // Separate navigation persistence from domain data
  const { 
    navigationState: savedNavState, 
    updateNavigationState, 
    navigationRestored 
  } = useNavigationPersistence({
    projectId,
    moduleName: 'impactModel',
  });
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('setup');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isQuantifying, setIsQuantifying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [localData, setLocalData] = useState<ImpactModelData>(getDefaultImpactModelData());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [dataHydrated, setDataHydrated] = useState(false);

  useEffect(() => {
    const stepLabels: Record<WizardStep, string> = {
      setup: 'Configure Inputs',
      quantify: 'Quantify Impacts',
      narrate: 'Generate & Refine Narrative',
    };
    const stepIndex = WIZARD_STEPS.indexOf(currentStep);
    const hasNarratives = (localData.narrativeCache?.base?.length ?? 0) > 0;
    
    setPageContext({
      moduleName: 'Impact Model',
      currentStep: stepLabels[currentStep],
      stepNumber: stepIndex,
      totalSteps: WIZARD_STEPS.length,
      viewState: isGenerating ? 'generating' : (hasNarratives ? 'has-narratives' : 'empty'),
      additionalInfo: {
        hasNarratives,
        interventionCount: localData.interventionBundles?.length || 0,
        isGenerating,
      }
    });
  }, [currentStep, isGenerating, localData.narrativeCache?.base?.length, localData.interventionBundles?.length, setPageContext]);

  useEffect(() => {
    return () => setPageContext(null);
  }, [setPageContext]);

  const hydrateFromDB = useCallback(async () => {
    if (!projectId) return;
    const dbProjectId = (isSampleMode || isSampleRoute) ? 'sample-porto-alegre-project' : projectId;
    
    try {
      const res = await fetch(`/api/projects/${dbProjectId}/blocks/impact_model`);
      if (res.ok) {
        const result = await res.json();
        if (result?.data) {
          const defaults = getDefaultImpactModelData();
          const rawData = result.data;
          
          const normalizedCoBenefits = (rawData.coBenefits || []).map((cb: unknown, idx: number) => normalizeCoBenefit(cb, idx));
          const rawSignals = rawData.downstreamSignals || {};
          const normalizedSignals = {
            operations: (rawSignals.operations || []).map((s: unknown, i: number) => normalizeSignalCard(s, 'ops', i)),
            businessModel: (rawSignals.businessModel || []).map((s: unknown, i: number) => normalizeSignalCard(s, 'bm', i)),
            mrv: (rawSignals.mrv || []).map((s: unknown, i: number) => normalizeSignalCard(s, 'mrv', i)),
            implementors: (rawSignals.implementors || []).map((s: unknown, i: number) => normalizeSignalCard(s, 'impl', i)),
          };
          
          const freshData: ImpactModelData = {
            ...defaults,
            ...rawData,
            narrativeCache: {
              ...defaults.narrativeCache,
              ...(rawData.narrativeCache || {}),
              lensVariants: {
                ...defaults.narrativeCache.lensVariants,
                ...(rawData.narrativeCache?.lensVariants || {}),
              },
            },
            coBenefits: normalizedCoBenefits,
            downstreamSignals: normalizedSignals,
          };
          setLocalData(freshData);
          console.log('[ImpactModel] Hydrated from database');
          
          // Navigation is handled by useNavigationPersistence hook — do NOT set currentStep here
        }
      } else if (res.status === 404) {
        console.log('[ImpactModel] Block not found in DB, using local state');
      }
      setDataHydrated(true);
    } catch (err) {
      console.error('[ImpactModel] DB hydration failed:', err);
      setDataHydrated(true);
    }
  }, [projectId, isSampleMode, isSampleRoute]);

  // Restore navigation from dedicated hook — only after data is hydrated to prevent jitter
  useEffect(() => {
    if (navigationRestored && dataHydrated && savedNavState?.currentStep !== undefined) {
      const stepIndex = savedNavState.currentStep;
      if (stepIndex >= 0 && stepIndex < WIZARD_STEPS.length) {
        setCurrentStep(WIZARD_STEPS[stepIndex]);
      }
    }
  }, [navigationRestored, dataHydrated]);

  // Load data on mount
  useEffect(() => {
    if (projectId) {
      loadContext(projectId);
      hydrateFromDB();
    }
  }, [projectId, loadContext, hydrateFromDB]);

  // Persist navigation using dedicated hook (completely separate from domain data)
  useEffect(() => {
    if (!navigationRestored || !dataHydrated) return;
    const newStepIndex = WIZARD_STEPS.indexOf(currentStep);
    updateNavigationState({ currentStep: newStepIndex });
  }, [currentStep, navigationRestored, dataHydrated, updateNavigationState]);

  useEffect(() => {
    if (context?.impactModel) {
      const defaults = getDefaultImpactModelData();
      setLocalData({
        ...defaults,
        ...context.impactModel,
        narrativeCache: {
          ...defaults.narrativeCache,
          ...(context.impactModel.narrativeCache || {}),
          lensVariants: {
            ...defaults.narrativeCache.lensVariants,
            ...(context.impactModel.narrativeCache?.lensVariants || {}),
          },
        },
        downstreamSignals: {
          ...defaults.downstreamSignals,
          ...(context.impactModel.downstreamSignals || {}),
        },
      });
    }
  }, [context?.impactModel]);

  // Listen for AI-triggered block updates and re-hydrate
  useEffect(() => {
    const handleBlockUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ blockType: string; moduleName: string; data: unknown }>;
      if (customEvent.detail?.blockType === 'impact_model') {
        console.log('[ImpactModel] Received nbs-block-updated event, re-hydrating...');
        hydrateFromDB();
      }
    };
    window.addEventListener('nbs-block-updated', handleBlockUpdate);
    return () => window.removeEventListener('nbs-block-updated', handleBlockUpdate);
  }, [hydrateFromDB]);

  const handleUpdate = (updates: Partial<ImpactModelData>) => {
    const updated = { ...localData, ...updates, status: 'DRAFT' as const };
    setLocalData(updated);
    updateModule('impactModel', updated);
  };

  const handleExplicitSave = async () => {
    if (!projectId) return;
    
    setIsSaving(true);
    try {
      const dbProjectId = (isSampleMode || isSampleRoute) ? 'sample-porto-alegre-project' : projectId;
      const res = await fetch(`/api/projects/${dbProjectId}/blocks/impact_model`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          data: localData, 
          status: localData.status || 'DRAFT', 
          actor: 'user' 
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Save failed:', errorData);
        throw new Error(errorData.message || 'Failed to save');
      }
      
      setLastSaved(new Date());
      toast({ 
        title: t('common.saved'), 
        description: t('impactModel.savedToDatabase'),
      });
    } catch (error) {
      console.error('Explicit save error:', error);
      toast({ 
        title: t('common.error'), 
        description: t('impactModel.saveFailed'),
        variant: 'destructive' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuantify = async () => {
    setIsQuantifying(true);
    try {
      const zonesForAI = buildZonesForAI(true);

      const dbProjectId = (isSampleMode || isSampleRoute) ? 'sample-porto-alegre-project' : projectId;

      const response = await fetch('/api/impact-model/quantify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: dbProjectId,
          selectedZones: zonesForAI,
          interventionBundles: localData.interventionBundles || [],
          funderPathway: funderPathway,
          projectName: context?.projectName || 'Urban Climate Resilience Initiative',
          cityName: context?.cityName || 'Porto Alegre',
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to quantify impacts');
      }

      handleUpdate({ quantifiedImpacts: result, status: 'DRAFT' });

      toast({
        title: t('impactModel.quantify.success'),
        description: `${result.impactGroups?.length || 0} ${t('impactModel.quantify.impactGroupsGenerated')}, ${result.evidenceContext?.chunksUsed || 0} ${t('impactModel.quantify.evidenceChunks')}`,
      });
    } catch (error: any) {
      console.error('Quantify error:', error);
      toast({
        title: t('common.error'),
        description: error?.message || t('impactModel.quantify.failed'),
        variant: 'destructive',
      });
    } finally {
      setIsQuantifying(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const zonesForAI = buildZonesForAI(false);

      const response = await fetch('/api/impact-model/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedZones: zonesForAI,
          interventionBundles: localData.interventionBundles || [],
          funderPathway: funderPathway,
          projectName: context?.projectName || 'Urban Climate Resilience Initiative',
          cityName: context?.cityName || 'Porto Alegre',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate narrative');
      }

      const result = await response.json();
      
      const normalized = normalizeAIResponse(result);

      // Build complete state preserving user inputs, replacing generated content
      const fullUpdatedData: ImpactModelData = {
        ...localData,
        // Preserve user-configured fields
        interventionBundles: localData.interventionBundles,
        selectedLens: localData.selectedLens,
        // Replace with newly generated content
        narrativeCache: {
          base: normalized.narrativeBlocks,
          lensVariants: { neutral: [], climate: [], social: [], financial: [], institutional: [] },
        },
        coBenefits: normalized.coBenefits,
        downstreamSignals: normalized.downstreamSignals,
        generationMeta: {
          generatedAt: new Date().toISOString(),
          model: 'GPT-5.2',
        },
        status: 'DRAFT',
      };
      
      setLocalData(fullUpdatedData);
      updateModule('impactModel', fullUpdatedData);

      // Auto-save to database after generation
      const dbProjectId = (isSampleMode || isSampleRoute) ? 'sample-porto-alegre-project' : projectId;
      if (!dbProjectId) {
        console.error('[ImpactModel] No project ID available for auto-save');
        return;
      }
      
      try {
        const saveRes = await fetch(`/api/projects/${dbProjectId}/blocks/impact_model`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            data: fullUpdatedData, 
            status: 'DRAFT', 
            actor: 'user' 
          }),
        });
        if (saveRes.ok) {
          setLastSaved(new Date());
          console.log('[ImpactModel] Auto-saved after generation');
        } else {
          console.error('[ImpactModel] Auto-save failed with status:', saveRes.status);
          toast({ 
            title: t('common.warning'), 
            description: t('impactModel.autoSaveFailed'),
            variant: 'destructive' 
          });
        }
      } catch (saveErr) {
        console.error('[ImpactModel] Auto-save failed:', saveErr);
        toast({ 
          title: t('common.warning'), 
          description: t('impactModel.autoSaveFailed'),
          variant: 'destructive' 
        });
      }

      toast({ title: t('impactModel.generationComplete'), description: t('impactModel.narrativeReady') });
    } catch (error) {
      console.error('Narrative generation error:', error);
      toast({ 
        title: t('common.error'), 
        description: t('impactModel.generationFailed'),
        variant: 'destructive' 
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNarrate = async (lens?: LensType, lensInstructions?: string) => {
    if (!localData.quantifiedImpacts) {
      toast({
        title: t('common.error'),
        description: t('impactModel.narrate.noQuantifiedData'),
        variant: 'destructive',
      });
      return;
    }

    const isLensGeneration = lens && lens !== 'neutral';
    setIsGenerating(true);

    try {
      const zonesForAI = buildZonesForAI(true);

      const response = await fetch('/api/impact-model/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantifiedImpacts: localData.quantifiedImpacts,
          selectedZones: zonesForAI,
          interventionBundles: localData.interventionBundles || [],
          funderPathway: funderPathway,
          projectName: context?.projectName || 'Urban Climate Resilience Initiative',
          cityName: context?.cityName || 'Porto Alegre',
          projectId: (isSampleMode || isSampleRoute) ? 'sample-porto-alegre-project' : projectId,
          ...(isLensGeneration ? { lens, lensInstructions } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate narrative from KPIs');
      }

      const result = await response.json();
      
      const normalized = normalizeAIResponse(result);

      let updatedNarrativeCache;
      if (isLensGeneration) {
        updatedNarrativeCache = {
          ...localData.narrativeCache,
          lensVariants: {
            ...(localData.narrativeCache?.lensVariants || { neutral: [], climate: [], social: [], financial: [], institutional: [] }),
            [lens]: normalized.narrativeBlocks,
          },
        };
      } else {
        updatedNarrativeCache = {
          base: normalized.narrativeBlocks,
          lensVariants: { neutral: [], climate: [], social: [], financial: [], institutional: [] },
        };
      }

      const fullUpdatedData: ImpactModelData = {
        ...localData,
        interventionBundles: localData.interventionBundles,
        selectedLens: isLensGeneration ? lens : 'neutral',
        quantifiedImpacts: localData.quantifiedImpacts,
        narrativeCache: updatedNarrativeCache,
        coBenefits: normalized.coBenefits,
        downstreamSignals: normalized.downstreamSignals,
        generationMeta: {
          generatedAt: new Date().toISOString(),
          model: 'GPT-5.2',
        },
        status: 'DRAFT',
      };

      setLocalData(fullUpdatedData);
      updateModule('impactModel', fullUpdatedData);

      // Auto-save to database
      const dbProjectId = (isSampleMode || isSampleRoute) ? 'sample-porto-alegre-project' : projectId;
      if (dbProjectId) {
        try {
          const saveRes = await fetch(`/api/projects/${dbProjectId}/blocks/impact_model`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: fullUpdatedData,
              status: 'DRAFT',
              actor: 'user'
            }),
          });
          if (saveRes.ok) {
            setLastSaved(new Date());
            console.log('[ImpactModel] Auto-saved after narration');
          }
        } catch (saveErr) {
          console.error('[ImpactModel] Auto-save after narrate failed:', saveErr);
        }
      }

      toast({ title: t('impactModel.generationComplete'), description: t('impactModel.narrativeReady') });
    } catch (error) {
      console.error('Narrate from KPIs error:', error);
      toast({
        title: t('common.error'),
        description: t('impactModel.generationFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateBlock = async (block: NarrativeBlock, customPrompt: string) => {
    setIsRegenerating(block.id);
    
    try {
      const response = await fetch('/api/impact-model/regenerate-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block,
          customPrompt,
          projectContext: {
            cityName: context?.cityName || 'Porto Alegre',
            projectName: context?.projectName || 'Urban Climate Resilience Initiative',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate block');
      }

      const result = await response.json();
      
      const updatedBlocks = (localData.narrativeCache?.base || []).map(b => 
        b.id === block.id ? { ...result.block, id: block.id } : b
      );
      
      const defaults = getDefaultImpactModelData();
      handleUpdate({
        narrativeCache: {
          ...defaults.narrativeCache,
          ...(localData.narrativeCache || {}),
          base: updatedBlocks,
        },
      });

      toast({ title: t('impactModel.blockRegenerated'), description: t('impactModel.blockRegeneratedDesc') });
    } catch (error) {
      console.error('Block regeneration error:', error);
      toast({ 
        title: t('common.error'), 
        description: t('impactModel.regenerationFailed'),
        variant: 'destructive' 
      });
    } finally {
      setIsRegenerating(null);
    }
  };

  const handlePushToOperations = () => {
    toast({ title: t('impactModel.signalsPushed'), description: t('impactModel.opsSignalsPushed') });
  };

  const handlePushToBusinessModel = () => {
    toast({ title: t('impactModel.signalsPushed'), description: t('impactModel.bmSignalsPushed') });
  };

  const cityName = context?.cityName || 'Porto Alegre';
  const funderName = context?.funderSelection?.funderName || sampleFunderSelection.funderName || 'Green Climate Fund';
  const targetFunders = context?.funderSelection?.targetFunders ?? sampleFunderSelection.targetFunders ?? [];
  const fundingPlanNextName = context?.funderSelection?.fundingPlan?.selectedFunderNextName;
  const targetFunderName = fundingPlanNextName
    ? fundingPlanNextName
    : targetFunders.length > 0
      ? targetFunders.map(f => f.fundName).join(', ')
      : funderName;

  // Detect if using real data or sample data
  const hasRealSiteData = context?.siteExplorer?.selectedZones && context.siteExplorer.selectedZones.length > 0;
  const usingSampleData = !hasRealSiteData;
  
  const rawZones = hasRealSiteData ? context.siteExplorer!.selectedZones : sampleSiteExplorer.selectedZones;
  const siteExplorerZones = rawZones.map(zone => {
    if (typeof zone === 'string') {
      return { zoneId: zone, name: zone, hazardType: 'FLOOD' as const };
    }
    return zone;
  });

  const buildZonesForAI = useCallback((includePortfolio = false) => {
    const bundleNameMap = new Map((localData.interventionBundles || []).map((b: any) => [b.id, b.name]));
    return siteExplorerZones.map((zone: any, idx: number) => {
      const fallbackName = zone.zoneId?.replace(/zone_(\d+)/i, 'Zone $1') || `Zone ${idx + 1}`;
      const base: any = {
        zoneId: zone.zoneId,
        zoneName: bundleNameMap.get(zone.zoneId) || zone.zoneName || zone.name || fallbackName,
        hazardType: zone.hazardType,
        riskScore: 'riskScore' in zone ? zone.riskScore : 0.5,
        area: 'area' in zone ? zone.area : undefined,
        interventionType: 'interventionType' in zone ? zone.interventionType : undefined,
      };
      if (includePortfolio) {
        base.interventionPortfolio = ('interventionPortfolio' in zone ? (zone as any).interventionPortfolio || [] : []).map((site: any) => ({
          interventionId: site.interventionId,
          interventionName: site.interventionName,
          category: site.category,
          estimatedArea: site.estimatedArea,
          areaUnit: site.areaUnit,
          estimatedCost: site.estimatedCost,
          impacts: site.impacts,
          assetName: site.assetName,
          assetType: site.assetType,
        }));
      }
      return base;
    });
  }, [siteExplorerZones, localData.interventionBundles]);

  const funderPathway = context?.funderSelection?.pathway ?? sampleFunderSelection.pathway;

  const projectName = context?.projectName || 'Urban Climate Resilience Initiative';

  const canProceed = () => {
    switch (currentStep) {
      case 'setup':
        return (localData.interventionBundles?.length ?? 0) > 0;
      case 'quantify':
        return !!localData.quantifiedImpacts;
      case 'narrate':
        return true;
      default:
        return true;
    }
  };

  const handleGenerateAndProceed = async () => {
    setIsGenerating(true);
    await handleGenerate();
    setCurrentStep('narrate');
  };

  const currentStepIndex = WIZARD_STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / WIZARD_STEPS.length) * 100;

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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Lightbulb className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{t('impactModel.title')}</h1>
                <p className="text-muted-foreground">{t('impactModel.subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastSaved && (
                <span className="text-xs text-muted-foreground">
                  Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExplicitSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
          <Progress value={progress} className="h-2 mt-4" />
        </div>

        <StepIndicator currentStep={currentStep} steps={WIZARD_STEPS} onStepClick={setCurrentStep} />

        {/* Generation Modal - shows during both quantifying and generating */}
        <GenerationModal 
          isOpen={isGenerating || isQuantifying} 
          estimatedTime={isQuantifying ? "20-40 seconds" : "45-90 seconds"}
        />

        <div className="mb-6">
          {(!navigationRestored || !dataHydrated) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {currentStep === 'setup' && (
                <SetupStep
                  data={localData}
                  onUpdate={handleUpdate}
                  siteExplorerZones={siteExplorerZones}
                  usingSampleData={usingSampleData}
                  cityName={cityName}
                  projectName={projectName}
                  targetFunderName={targetFunderName}
                />
              )}
              {currentStep === 'quantify' && (
                <QuantifyStep
                  data={localData}
                  onUpdate={handleUpdate}
                  isQuantifying={isQuantifying}
                  onQuantify={handleQuantify}
                  siteExplorerZones={siteExplorerZones}
                />
              )}
              {currentStep === 'narrate' && (
                <NarrateStep
                  data={localData}
                  onUpdate={handleUpdate}
                  isNarrating={isGenerating}
                  onNarrate={handleNarrate}
                  onFinalize={() => {
                    handleUpdate({ status: 'READY' });
                    toast({ title: t('impactModel.saved'), description: t('impactModel.savedDescription') });
                  }}
                />
              )}
            </>
          )}
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(WIZARD_STEPS[currentStepIndex - 1])}
            disabled={currentStepIndex === 0 || isGenerating}
          >
            {t('common.previous')}
          </Button>
          {currentStepIndex < WIZARD_STEPS.length - 1 ? (
            <Button
              onClick={() => {
                if (currentStep === 'quantify' && !localData.narrativeCache?.base?.length) {
                  setCurrentStep('narrate');
                  handleNarrate();
                } else {
                  setCurrentStep(WIZARD_STEPS[currentStepIndex + 1]);
                }
              }}
              disabled={!canProceed() || isGenerating}
            >
              {currentStep === 'setup' 
                ? t('impactModel.quantifyImpact') 
                : currentStep === 'quantify'
                  ? (localData.narrativeCache?.base?.length 
                    ? t('common.continue')
                    : t('impactModel.generateNarrative'))
                  : t('common.continue')}
            </Button>
          ) : (
            <Button onClick={() => {
              handleUpdate({ status: 'READY' });
              toast({ title: t('impactModel.saved'), description: t('impactModel.savedDescription') });
            }}>
              <Check className="h-4 w-4 mr-2" />
              {t('impactModel.finalize')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
