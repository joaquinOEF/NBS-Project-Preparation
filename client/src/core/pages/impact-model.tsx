import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useParams, Link } from 'wouter';
import DOMPurify from 'dompurify';
import { ArrowLeft, Lightbulb, Settings, Sparkles, Edit3, Eye, Download, Check, ChevronDown, ChevronUp, Plus, Trash2, RefreshCw, Copy, FileText, Clock, AlertCircle, Scale, Thermometer, Users, TrendingUp, Building2, Info, Droplets, Mountain, Loader2 } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { Progress } from '@/core/components/ui/progress';
import { Slider } from '@/core/components/ui/slider';
import { Label } from '@/core/components/ui/label';
import { Checkbox } from '@/core/components/ui/checkbox';
import { Textarea } from '@/core/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/core/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/core/components/ui/collapsible';
import { ScrollArea } from '@/core/components/ui/scroll-area';
import { useTranslation } from 'react-i18next';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useProjectContext, ImpactModelData, PrioritizationWeights, LensType, InterventionBundle, NarrativeBlock, CoBenefitCard, SignalCard, sampleSiteExplorer, sampleFunderSelection } from '@/core/contexts/project-context';
import { useToast } from '@/core/hooks/use-toast';

type WizardStep = 'setup' | 'curate' | 'lenses' | 'export';

const WIZARD_STEPS: WizardStep[] = ['setup', 'curate', 'lenses', 'export'];

const GENERATION_PHRASES = [
  'Estimating project impact',
  'Connecting co-benefits with expected impact',
  'Generating your impact narrative',
  'Analyzing intervention synergies',
  'Building funding-aligned recommendations'
];

const DEFAULT_WEIGHTS: PrioritizationWeights = {
  floodRiskReduction: 4,
  heatReduction: 4,
  landslideRiskReduction: 3,
  socialEquity: 5,
  costCertainty: 3,
  biodiversityWaterQuality: 4,
};

const getDefaultImpactModelData = (): ImpactModelData => ({
  status: 'NOT_STARTED',
  prioritizationWeights: { ...DEFAULT_WEIGHTS },
  inheritedWeights: { ...DEFAULT_WEIGHTS },
  interventionBundles: [],
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

function StepIndicator({ currentStep, steps }: { currentStep: WizardStep; steps: WizardStep[] }) {
  const { t } = useTranslation();
  const currentIndex = steps.indexOf(currentStep);
  
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;
        
        return (
          <div key={step} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors
              ${isActive ? 'bg-amber-500 text-white' : isCompleted ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
              {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
            </div>
            <span className={`ml-2 text-sm ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
              {t(`impactModel.steps.${step}`)}
            </span>
            {index < steps.length - 1 && (
              <div className={`w-8 h-0.5 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WeightSlider({ 
  label, 
  value, 
  onChange, 
  inherited,
  description 
}: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void; 
  inherited: number;
  description?: string;
}) {
  const isModified = value !== inherited;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-2">
          {isModified && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">
              Modified
            </Badge>
          )}
          <span className="text-sm font-medium w-6 text-right">{value}</span>
        </div>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={1}
        max={5}
        step={1}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Low</span>
        <span>High</span>
      </div>
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
  funderName
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
  siteExplorerZones: any[];
  usingSampleData: boolean;
  cityName: string;
  projectName: string;
  funderName: string;
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

  const formatZoneName = (zone: any, index: number) => {
    if (zone.zoneName) return zone.zoneName;
    if (zone.name) return zone.name;
    if (zone.zoneId) {
      const match = zone.zoneId.match(/zone_(\d+)/i);
      if (match) {
        return `Zone ${match[1]}`;
      }
      return zone.zoneId.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
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
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('impactModel.funder')}</p>
                  <p className="text-sm font-medium">{funderName}</p>
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
          <div className="space-y-6">
            {siteExplorerZones.map((zone, index) => {
              const zoneId = zone.zoneId || `zone-${index}`;
              const zoneName = formatZoneName(zone, index);
              const isSelected = data.interventionBundles.some(b => b.id === zoneId);
              const interventions = zone.interventionPortfolio || [];
              const zonePopulation = zone.populationSum ? zone.populationSum.toLocaleString() : null;
              const zoneArea = zone.areaKm2 || zone.area;
              
              return (
                <Card 
                  key={zoneId} 
                  className={`overflow-hidden transition-all ${isSelected ? 'ring-2 ring-primary/50 border-primary' : 'hover:border-primary/30'}`}
                >
                  {/* Zone Header */}
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
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
                          className="mt-1"
                        />
                        <div className="space-y-2">
                          <div>
                            <h3 className="text-lg font-semibold">{zoneName}</h3>
                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                              {zoneArea && <span>{zoneArea.toLocaleString()} km²</span>}
                              {zonePopulation && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" />
                                    {zonePopulation} residents
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(zone.hazardType || zone.primaryHazard) && (
                              <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5">
                                {getHazardIcon(zone.hazardType || zone.primaryHazard)}
                                <span>{(zone.hazardType || zone.primaryHazard).replace(/_/g, ' ')}</span>
                              </Badge>
                            )}
                            {zone.secondaryHazard && (
                              <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-2.5 opacity-70">
                                {getHazardIcon(zone.secondaryHazard)}
                                <span>{zone.secondaryHazard.replace(/_/g, ' ')}</span>
                              </Badge>
                            )}
                            {zone.interventionType && (
                              <Badge variant="secondary" className="py-1 px-2.5">
                                {formatInterventionType(zone.interventionType)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {zone.riskScore && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Risk Level</p>
                            <p className={`text-lg font-semibold ${zone.riskScore > 0.7 ? 'text-red-600' : zone.riskScore > 0.4 ? 'text-amber-600' : 'text-green-600'}`}>
                              {(zone.riskScore * 100).toFixed(0)}%
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {/* Interventions - Always Visible */}
                  <CardContent className="pt-0 pb-6">
                    {interventions.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-muted-foreground">
                            {interventions.length} {interventions.length === 1 ? 'Intervention' : 'Interventions'} Planned
                          </p>
                        </div>
                        <div className="space-y-4">
                          {interventions.map((intervention: any) => {
                            const impacts = intervention.impacts || {};
                            const hasHighImpact = Object.values(impacts).some(v => v === 'high');
                            
                            return (
                              <div 
                                key={intervention.interventionId || intervention.id} 
                                className="p-5 bg-muted/30 rounded-xl border border-border/50"
                              >
                                <div className="space-y-4">
                                  {/* Intervention Header */}
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                      <h4 className="font-semibold text-base">{intervention.interventionName || intervention.name}</h4>
                                      {intervention.category && (
                                        <p className="text-sm text-muted-foreground">
                                          {intervention.category.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                        </p>
                                      )}
                                    </div>
                                    {hasHighImpact && (
                                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 shrink-0">
                                        <TrendingUp className="h-3 w-3 mr-1" />
                                        High Impact
                                      </Badge>
                                    )}
                                  </div>

                                  {/* Intervention Details Grid */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {intervention.estimatedCost && (
                                      <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Estimated Cost</p>
                                        <p className="font-medium">{formatCost(intervention.estimatedCost)}</p>
                                      </div>
                                    )}
                                    {intervention.estimatedArea && (
                                      <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Coverage Area</p>
                                        <p className="font-medium">{intervention.estimatedArea} {intervention.areaUnit || 'ha'}</p>
                                      </div>
                                    )}
                                    {intervention.assetName && (
                                      <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">Target Asset</p>
                                        <p className="font-medium">{intervention.assetName}</p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Impact Indicators */}
                                  {intervention.impacts && (
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
                                      {intervention.impacts.flood && (
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${getImpactLevel(intervention.impacts.flood).color}`}>
                                          <Droplets className="h-3.5 w-3.5" />
                                          Flood: {intervention.impacts.flood}
                                        </div>
                                      )}
                                      {intervention.impacts.heat && (
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${getImpactLevel(intervention.impacts.heat).color}`}>
                                          <Thermometer className="h-3.5 w-3.5" />
                                          Heat: {intervention.impacts.heat}
                                        </div>
                                      )}
                                      {intervention.impacts.landslide && intervention.impacts.landslide !== 'low' && (
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${getImpactLevel(intervention.impacts.landslide).color}`}>
                                          <Mountain className="h-3.5 w-3.5" />
                                          Landslide: {intervention.impacts.landslide}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Notes if available */}
                                  {intervention.notes && (
                                    <div className="pt-2 border-t border-border/30">
                                      <p className="text-sm text-muted-foreground italic">{intervention.notes}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-muted-foreground bg-muted/20 rounded-lg">
                        <p className="text-sm">{t('impactModel.noInterventionsInZone')}</p>
                        <p className="text-xs mt-1 opacity-70">Add interventions in the Site Explorer</p>
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
  const escaped = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
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
  return DOMPurify.sanitize(`<p class="my-3">${html}</p>`);
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
                    className="prose prose-sm max-w-none dark:prose-invert leading-relaxed text-[15px]"
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

const LENS_ICONS: Record<LensType, ReactNode> = {
  neutral: <Scale className="h-4 w-4" />,
  climate: <Thermometer className="h-4 w-4" />,
  social: <Users className="h-4 w-4" />,
  financial: <TrendingUp className="h-4 w-4" />,
  institutional: <Building2 className="h-4 w-4" />,
};

function LensesStep({ 
  data, 
  onUpdate,
  onGenerateLens,
  isGeneratingLens
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
  onGenerateLens: (lens: LensType, customInstructions?: string) => Promise<void>;
  isGeneratingLens: LensType | null;
}) {
  const { t } = useTranslation();
  const [customInstructions, setCustomInstructions] = useState<Record<string, string>>({});
  const lenses: LensType[] = ['neutral', 'climate', 'social', 'financial', 'institutional'];

  const hasBaseNarrative = data.narrativeCache.base && data.narrativeCache.base.length > 0;

  const getBlocksForLens = (lens: LensType): NarrativeBlock[] => {
    if (lens === 'neutral') return data.narrativeCache.base || [];
    return data.narrativeCache.lensVariants[lens] || [];
  };

  const generateHeadlineSummary = (blocks: NarrativeBlock[]): string => {
    if (blocks.length === 0) return '';
    const execSummary = blocks.find(b => b.type === 'summary');
    if (execSummary) {
      const firstParagraph = execSummary.contentMd.split('\n\n')[0];
      return firstParagraph.substring(0, 200) + (firstParagraph.length > 200 ? '...' : '');
    }
    return blocks[0]?.contentMd.substring(0, 150) + '...' || '';
  };

  if (!hasBaseNarrative) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{t('impactModel.generateFirst')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">{t('impactModel.analyticalLenses')}</h2>
        </div>
        <p className="text-muted-foreground">{t('impactModel.lensesDescription')}</p>
      </div>

      {/* Lens Tabs */}
      <Tabs value={data.selectedLens} onValueChange={(v) => onUpdate({ selectedLens: v as LensType })} className="max-w-3xl">
        <TabsList className="grid w-full grid-cols-5 mb-6">
          {lenses.map((lens) => {
            const hasVariant = lens === 'neutral' || (data.narrativeCache.lensVariants[lens]?.length > 0);
            return (
              <TabsTrigger key={lens} value={lens} className="text-xs relative flex items-center gap-1.5">
                {LENS_ICONS[lens]}
                <span className="hidden sm:inline">{t(`impactModel.lenses.${lens}`)}</span>
                {hasVariant && lens !== 'neutral' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {lenses.map((lens) => {
          const lensBlocks = getBlocksForLens(lens);
          const hasLensContent = lensBlocks.length > 0;
          const headlineSummary = generateHeadlineSummary(lensBlocks);

          return (
            <TabsContent key={lens} value={lens} className="mt-0">
              <div className="space-y-6 max-w-3xl">
                {/* Lens Header Card */}
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-primary/10 rounded-xl">
                        <div className="scale-125">{LENS_ICONS[lens]}</div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold">{t(`impactModel.lenses.${lens}`)} Lens</h3>
                        <p className="text-sm text-muted-foreground mt-1">{t(`impactModel.lensHeadlines.${lens}`)}</p>
                        
                        {hasLensContent && headlineSummary && (
                          <div className="mt-4 p-4 bg-white/50 dark:bg-gray-900/50 rounded-lg border">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t('impactModel.narrativeHeadline')}</p>
                            <p className="text-sm leading-relaxed italic">"{headlineSummary}"</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Lens Content */}
                {lens === 'neutral' ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <Check className="h-4 w-4" />
                      <span className="text-sm font-medium">{t('impactModel.baseNarrativeAvailable')}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{t('impactModel.neutralIsBase')}</p>
                    
                    <div className="space-y-4 mt-6">
                      {data.narrativeCache.base?.map((block) => (
                        <Card key={block.id} className="overflow-hidden">
                          <CardHeader className="pb-3 bg-muted/30">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{block.title}</CardTitle>
                              <div className="flex gap-2">
                                <Badge variant="outline" className="text-xs capitalize">{(block.type || 'content').replace(/_/g, ' ')}</Badge>
                                <Badge variant="secondary" className="text-xs">{block.evidenceTier}</Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-4">
                            {block.kpis && block.kpis.length > 0 && (
                              <div className="mb-4 pb-4 border-b">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  {block.kpis.map((kpi, i) => (
                                    <div key={i} className="bg-primary/5 rounded-lg p-3">
                                      <p className="text-xs text-muted-foreground">{kpi.name}</p>
                                      <p className="text-lg font-bold text-primary">
                                        {kpi.valueRange}
                                        <span className="text-sm font-normal text-muted-foreground ml-1">{kpi.unit}</span>
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div 
                              className="prose prose-sm max-w-none dark:prose-invert leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(block.contentMd) }}
                            />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : hasLensContent ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <Check className="h-4 w-4" />
                        <span className="text-sm font-medium">{t('impactModel.lensGenerated')}</span>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline"
                        disabled={isGeneratingLens === lens}
                        onClick={() => onGenerateLens(lens, customInstructions[lens])}
                      >
                        <RefreshCw className={`h-3 w-3 mr-2 ${isGeneratingLens === lens ? 'animate-spin' : ''}`} />
                        {t('impactModel.regenerateLens')}
                      </Button>
                    </div>
                    
                    <div className="space-y-4 mt-6">
                      {lensBlocks.map((block) => (
                        <Card key={block.id} className="overflow-hidden">
                          <CardHeader className="pb-3 bg-muted/30">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{block.title}</CardTitle>
                              <div className="flex gap-2">
                                <Badge variant="outline" className="text-xs capitalize">{(block.type || 'content').replace(/_/g, ' ')}</Badge>
                                <Badge variant="secondary" className="text-xs">{block.evidenceTier}</Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-4">
                            {block.kpis && block.kpis.length > 0 && (
                              <div className="mb-4 pb-4 border-b">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  {block.kpis.map((kpi, i) => (
                                    <div key={i} className="bg-primary/5 rounded-lg p-3">
                                      <p className="text-xs text-muted-foreground">{kpi.name}</p>
                                      <p className="text-lg font-bold text-primary">
                                        {kpi.valueRange}
                                        <span className="text-sm font-normal text-muted-foreground ml-1">{kpi.unit}</span>
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div 
                              className="prose prose-sm max-w-none dark:prose-invert leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(block.contentMd) }}
                            />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-6 space-y-4">
                      <p className="text-sm text-muted-foreground italic">{t('impactModel.lensNotGenerated')}</p>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('impactModel.customInstructions')}</Label>
                        <Textarea
                          placeholder={t('impactModel.customInstructionsPlaceholder')}
                          value={customInstructions[lens] || ''}
                          onChange={(e) => setCustomInstructions(prev => ({ ...prev, [lens]: e.target.value }))}
                          className="min-h-[80px] mt-2 text-sm"
                        />
                      </div>
                      <Button 
                        onClick={() => onGenerateLens(lens, customInstructions[lens])}
                        disabled={isGeneratingLens === lens}
                        className="w-full sm:w-auto"
                      >
                        {isGeneratingLens === lens ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            {t('impactModel.generatingLens')}
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            {t('impactModel.generateLensVersion')}
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
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
          md += `- ${kpi.name}: ${kpi.valueRange} ${kpi.unit} (${kpi.confidence})\n`;
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
      weights: data.prioritizationWeights,
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
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('setup');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [isGeneratingLens, setIsGeneratingLens] = useState<LensType | null>(null);
  const [localData, setLocalData] = useState<ImpactModelData>(getDefaultImpactModelData());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const hydrateFromDB = useCallback(async () => {
    if (!projectId) return;
    const dbProjectId = (isSampleMode || isSampleRoute) ? 'sample-porto-alegre-project' : projectId;
    
    try {
      const res = await fetch(`/api/projects/${dbProjectId}/blocks/impact_model`);
      if (res.ok) {
        const result = await res.json();
        if (result?.data) {
          const defaults = getDefaultImpactModelData();
          const freshData: ImpactModelData = {
            ...defaults,
            ...result.data,
            narrativeCache: {
              ...defaults.narrativeCache,
              ...(result.data.narrativeCache || {}),
              lensVariants: {
                ...defaults.narrativeCache.lensVariants,
                ...(result.data.narrativeCache?.lensVariants || {}),
              },
            },
            downstreamSignals: {
              ...defaults.downstreamSignals,
              ...(result.data.downstreamSignals || {}),
            },
          };
          setLocalData(freshData);
          console.log('[ImpactModel] Hydrated from database');
        }
      } else if (res.status === 404) {
        console.log('[ImpactModel] Block not found in DB, using local state');
      }
    } catch (err) {
      console.error('[ImpactModel] DB hydration failed:', err);
    }
  }, [projectId, isSampleMode, isSampleRoute]);

  useEffect(() => {
    if (projectId) {
      loadContext(projectId);
      hydrateFromDB();
    }
  }, [projectId, loadContext, hydrateFromDB]);

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

  const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const zonesForAI = siteExplorerZones.map(zone => ({
        zoneId: zone.zoneId,
        hazardType: zone.hazardType,
        riskScore: 'riskScore' in zone ? zone.riskScore : 0.5,
        area: 'area' in zone ? zone.area : undefined,
        interventionType: 'interventionType' in zone ? zone.interventionType : undefined,
      }));

      const response = await fetch('/api/impact-model/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedZones: zonesForAI,
          interventionBundles: localData.interventionBundles || [],
          funderPathway: funderPathway,
          prioritizationWeights: localData.prioritizationWeights || DEFAULT_WEIGHTS,
          projectName: context?.projectName || 'Urban Climate Resilience Initiative',
          cityName: context?.cityName || 'Porto Alegre',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate narrative');
      }

      const result = await response.json();

      // Build complete state preserving user inputs, replacing generated content
      const fullUpdatedData: ImpactModelData = {
        ...localData,
        // Preserve user-configured fields
        prioritizationWeights: localData.prioritizationWeights,
        inheritedWeights: localData.inheritedWeights,
        interventionBundles: localData.interventionBundles,
        selectedLens: localData.selectedLens,
        // Replace with newly generated content
        narrativeCache: {
          base: result.narrativeBlocks || [],
          lensVariants: { neutral: [], climate: [], social: [], financial: [], institutional: [] },
        },
        coBenefits: result.coBenefits || [],
        downstreamSignals: result.downstreamSignals || { operations: [], businessModel: [], mrv: [], implementors: [] },
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
            weights: localData.prioritizationWeights || DEFAULT_WEIGHTS,
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

  const handleGenerateLens = async (lens: LensType, customInstructions?: string) => {
    if (lens === 'neutral' || !localData.narrativeCache?.base) return;
    
    setIsGeneratingLens(lens);
    
    try {
      const response = await fetch('/api/impact-model/generate-lens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lens,
          baseNarrativeBlocks: localData.narrativeCache?.base || [],
          funderPathway: funderPathway,
          customInstructions,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate lens variant');
      }

      const result = await response.json();
      
      const defaults = getDefaultImpactModelData();
      handleUpdate({
        narrativeCache: {
          ...defaults.narrativeCache,
          ...(localData.narrativeCache || {}),
          lensVariants: {
            ...defaults.narrativeCache.lensVariants,
            ...(localData.narrativeCache?.lensVariants || {}),
            [lens]: result.narrativeBlocks || [],
          },
        },
      });

      toast({ title: t('impactModel.lensGeneratedSuccess'), description: t('impactModel.lensGeneratedDesc') });
    } catch (error) {
      console.error('Lens generation error:', error);
      toast({ 
        title: t('common.error'), 
        description: t('impactModel.lensGenerationFailed'),
        variant: 'destructive' 
      });
    } finally {
      setIsGeneratingLens(null);
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

  const funderPathway = context?.funderSelection?.pathway ?? sampleFunderSelection.pathway;

  const projectName = context?.projectName || 'Urban Climate Resilience Initiative';

  const canProceed = () => {
    switch (currentStep) {
      case 'setup':
        return (localData.interventionBundles?.length ?? 0) > 0;
      case 'curate':
      case 'lenses':
        return true;
      case 'export':
        return true;
      default:
        return true;
    }
  };

  const handleGenerateAndProceed = async () => {
    setIsGenerating(true);
    await handleGenerate();
    setCurrentStep('curate');
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

        <StepIndicator currentStep={currentStep} steps={WIZARD_STEPS} />

        {/* Generation Modal */}
        <GenerationModal 
          isOpen={isGenerating} 
          estimatedTime="30-60 seconds"
        />

        <div className="mb-6">
          {currentStep === 'setup' && (
            <SetupStep 
              data={localData} 
              onUpdate={handleUpdate} 
              siteExplorerZones={siteExplorerZones} 
              usingSampleData={usingSampleData}
              cityName={cityName}
              projectName={projectName}
              funderName={funderName}
            />
          )}
          {currentStep === 'curate' && (
            <CurateStep 
              data={localData} 
              onUpdate={handleUpdate}
              onRegenerateBlock={handleRegenerateBlock}
              isRegenerating={isRegenerating}
            />
          )}
          {currentStep === 'lenses' && (
            <LensesStep 
              data={localData} 
              onUpdate={handleUpdate}
              onGenerateLens={handleGenerateLens}
              isGeneratingLens={isGeneratingLens}
            />
          )}
          {currentStep === 'export' && (
            <ExportStep 
              data={localData} 
              onUpdate={handleUpdate}
              onPushToOperations={handlePushToOperations}
              onPushToBusinessModel={handlePushToBusinessModel}
              cityName={cityName}
              funderName={funderName}
            />
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
          {currentStep === 'setup' ? (
            <div className="flex gap-2">
              {localData.narrativeCache?.base && localData.narrativeCache.base.length > 0 ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleGenerateAndProceed}
                    disabled={!canProceed() || isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('impactModel.generating')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        {t('impactModel.regenerateNarrative')}
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => setCurrentStep('curate')}
                    disabled={isGenerating}
                  >
                    {t('impactModel.continueWithExisting')}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleGenerateAndProceed}
                  disabled={!canProceed() || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('impactModel.generating')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {t('impactModel.generateNarrative')}
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : currentStepIndex < WIZARD_STEPS.length - 1 ? (
            <Button
              onClick={() => setCurrentStep(WIZARD_STEPS[currentStepIndex + 1])}
              disabled={!canProceed()}
            >
              {t('common.continue')}
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
