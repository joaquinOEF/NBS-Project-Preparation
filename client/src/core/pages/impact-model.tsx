import { useState, useEffect, type ReactNode } from 'react';
import { useParams, Link } from 'wouter';
import { ArrowLeft, Lightbulb, Settings, Sparkles, Edit3, Eye, Download, Check, ChevronDown, ChevronUp, Plus, Trash2, RefreshCw, Copy, FileText, Clock, AlertCircle, Scale, Thermometer, Users, TrendingUp, Building2, Info } from 'lucide-react';
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
import { useProjectContext, ImpactModelData, PrioritizationWeights, LensType, InterventionBundle, NarrativeBlock, CoBenefitCard, SignalCard, sampleSiteExplorer, sampleFunderSelection } from '@/core/contexts/project-context';
import { useToast } from '@/core/hooks/use-toast';

type WizardStep = 'setup' | 'generate' | 'curate' | 'lenses' | 'export';

const WIZARD_STEPS: WizardStep[] = ['setup', 'generate', 'curate', 'lenses', 'export'];

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
  usingSampleData
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
  siteExplorerZones: any[];
  usingSampleData: boolean;
}) {
  const { t } = useTranslation();
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  
  const toggleZoneExpansion = (zoneId: string) => {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
      }
      return next;
    });
  };

  const formatCost = (cost: { min: number; max: number; unit: string }) => {
    const formatNum = (n: number) => {
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
      return n.toString();
    };
    return `${cost.unit} ${formatNum(cost.min)} - ${formatNum(cost.max)}`;
  };

  return (
    <div className="space-y-6">
      {usingSampleData && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800">
          <CardContent className="py-4">
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('impactModel.interventionBundles')}
          </CardTitle>
          <CardDescription>{t('impactModel.bundlesDescriptionExpanded')}</CardDescription>
        </CardHeader>
        <CardContent>
          {siteExplorerZones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('impactModel.noZonesSelected')}</p>
              <p className="text-sm mt-2">{t('impactModel.selectZonesFirst')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {siteExplorerZones.map((zone, index) => {
                const zoneId = zone.zoneId || `zone-${index}`;
                const zoneName = zone.zoneName || zone.name || `Zone ${index + 1}`;
                const isSelected = data.interventionBundles.some(b => b.id === zoneId);
                const isExpanded = expandedZones.has(zoneId);
                const interventions = zone.interventionPortfolio || [];
                
                return (
                  <div key={zoneId} className={`border rounded-lg overflow-hidden transition-colors ${isSelected ? 'border-primary bg-primary/5' : ''}`}>
                    <div 
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleZoneExpansion(zoneId)}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              onUpdate({
                                interventionBundles: [
                                  ...data.interventionBundles,
                                  {
                                    id: zoneId,
                                    name: zoneName,
                                    objective: '',
                                    targetHazards: [zone.hazardType || zone.primaryHazard || 'FLOOD'],
                                    interventions: interventions.map((i: any) => i.interventionId || i.id),
                                    locations: [{ zoneId, name: zoneName, geometryType: 'polygon' }],
                                    capexRange: { 
                                      low: interventions.reduce((sum: number, i: any) => sum + (i.estimatedCost?.min || 0), 0),
                                      high: interventions.reduce((sum: number, i: any) => sum + (i.estimatedCost?.max || 0), 0),
                                    },
                                    enabled: true,
                                  },
                                ],
                              });
                            } else {
                              onUpdate({
                                interventionBundles: data.interventionBundles.filter(b => b.id !== zoneId),
                              });
                            }
                          }}
                        />
                        <div>
                          <p className="font-medium">{zoneName}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {(zone.hazardType || zone.primaryHazard) && (
                              <Badge variant="outline" className="text-xs">{zone.hazardType || zone.primaryHazard}</Badge>
                            )}
                            {zone.interventionType && (
                              <Badge variant="secondary" className="text-xs">{zone.interventionType.replace(/_/g, ' ')}</Badge>
                            )}
                            {interventions.length > 0 && (
                              <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                {interventions.length} {t('impactModel.interventions')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {zone.riskScore && (
                          <span className="text-sm text-muted-foreground">Risk: {(zone.riskScore * 100).toFixed(0)}%</span>
                        )}
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                    
                    {isExpanded && interventions.length > 0 && (
                      <div className="border-t bg-muted/30 p-4">
                        <p className="text-sm font-medium mb-3 text-muted-foreground">{t('impactModel.zoneInterventions')}</p>
                        <div className="space-y-2">
                          {interventions.map((intervention: any) => (
                            <div key={intervention.interventionId || intervention.id} className="p-3 bg-background rounded-lg border">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium text-sm">{intervention.interventionName || intervention.name}</p>
                                  <div className="flex gap-2 mt-1 flex-wrap">
                                    {intervention.category && (
                                      <Badge variant="outline" className="text-xs">{intervention.category.replace(/_/g, ' ')}</Badge>
                                    )}
                                    {intervention.estimatedCost && (
                                      <Badge variant="secondary" className="text-xs">
                                        {formatCost(intervention.estimatedCost)}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {intervention.impacts && (
                                  <div className="flex gap-1">
                                    {intervention.impacts.flood && (
                                      <Badge className={`text-xs ${intervention.impacts.flood === 'high' ? 'bg-blue-100 text-blue-800' : intervention.impacts.flood === 'medium' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                                        Flood
                                      </Badge>
                                    )}
                                    {intervention.impacts.heat && (
                                      <Badge className={`text-xs ${intervention.impacts.heat === 'high' ? 'bg-orange-100 text-orange-800' : intervention.impacts.heat === 'medium' ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-600'}`}>
                                        Heat
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {isExpanded && interventions.length === 0 && (
                      <div className="border-t bg-muted/30 p-4">
                        <p className="text-sm text-muted-foreground text-center py-4">
                          {t('impactModel.noInterventionsInZone')}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GenerateStep({ 
  data, 
  onUpdate,
  onGenerate,
  isGenerating,
  cityName,
  funderName,
  onContinueToCuration
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  cityName: string;
  funderName: string;
  onContinueToCuration: () => void;
}) {
  const { t } = useTranslation();
  const hasPreviousGeneration = data.narrativeCache.base && data.narrativeCache.base.length > 0;
  const enabledBundles = data.interventionBundles.filter(b => b.enabled);
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            {t('impactModel.generateNarrative')}
          </CardTitle>
          <CardDescription>{t('impactModel.generateDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg space-y-4">
            <h4 className="font-medium">{t('impactModel.generationSummary')}</h4>
            
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t('impactModel.city')}:</span>
                <p className="font-medium">{cityName}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('impactModel.funder')}:</span>
                <p className="font-medium">{funderName}</p>
              </div>
            </div>

            <div>
              <span className="text-muted-foreground text-sm">{t('impactModel.selectedProjects')} ({enabledBundles.length}):</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {enabledBundles.map((bundle) => (
                  <Badge key={bundle.id} variant="secondary" className="text-xs">
                    {bundle.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm pt-2 border-t">
              <div className="text-center">
                <span className="text-muted-foreground">{t('impactModel.weights.floodRiskReduction').split(' ')[0]}:</span>
                <p className="font-medium">{data.prioritizationWeights.floodRiskReduction}/5</p>
              </div>
              <div className="text-center">
                <span className="text-muted-foreground">{t('impactModel.weights.heatReduction').split(' ')[0]}:</span>
                <p className="font-medium">{data.prioritizationWeights.heatReduction}/5</p>
              </div>
              <div className="text-center">
                <span className="text-muted-foreground">{t('impactModel.weights.socialEquity').split(' ')[0]}:</span>
                <p className="font-medium">{data.prioritizationWeights.socialEquity}/5</p>
              </div>
            </div>
          </div>

          {hasPreviousGeneration && (
            <div className="p-4 border rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                <Clock className="h-5 w-5" />
                <span className="font-medium">{t('impactModel.previousGeneration')}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {t('impactModel.generatedOn')} {data.generationMeta?.generatedAt ? new Date(data.generationMeta.generatedAt).toLocaleString() : 'Unknown'} 
                {' • '}{data.narrativeCache.base?.length} {t('impactModel.blocks')}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onContinueToCuration}>
                  {t('impactModel.continueToCuration')}
                </Button>
                <Button variant="ghost" size="sm" onClick={onGenerate} disabled={isGenerating}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('impactModel.regenerate')}
                </Button>
              </div>
            </div>
          )}

          {!hasPreviousGeneration && (
            <Button 
              onClick={onGenerate} 
              disabled={isGenerating || enabledBundles.length === 0}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t('impactModel.generating')}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t('impactModel.generateWithAI')}
                </>
              )}
            </Button>
          )}

          {enabledBundles.length === 0 && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{t('impactModel.selectProjectsFirst')}</span>
            </div>
          )}
        </CardContent>
      </Card>
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

  if (blocks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Edit3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{t('impactModel.noNarrativeYet')}</p>
          <p className="text-sm mt-2">{t('impactModel.goToGenerate')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            {t('impactModel.narrativeBlocks')}
          </CardTitle>
          <CardDescription>{t('impactModel.curateDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {blocks.map((block, index) => (
            <div 
              key={block.id} 
              className={`border rounded-lg overflow-hidden transition-all ${block.included ? 'border-primary/30' : 'opacity-60 border-dashed'}`}
            >
              <div className="flex items-start gap-3 p-4 bg-muted/30">
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
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-base">{block.title}</h4>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{block.type.replace(/_/g, ' ')}</Badge>
                        <Badge variant="secondary" className="text-xs">{block.evidenceTier}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
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
                </div>
              </div>
              <div className="p-4 border-t">
                <div className="prose prose-sm max-w-none dark:prose-invert">
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
                    className="min-h-[120px] text-sm border-0 focus-visible:ring-0 p-0 resize-none"
                    placeholder="Enter narrative content..."
                  />
                </div>
                {block.kpis && block.kpis.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                    {block.kpis.map((kpi, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {kpi.name}: {kpi.valueRange} {kpi.unit}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('impactModel.coBenefitsTitle')}</CardTitle>
          <CardDescription>{t('impactModel.coBenefitsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {coBenefits.map((cb) => (
              <div key={cb.id} className={`p-3 border rounded-lg transition-opacity ${cb.included ? '' : 'opacity-50'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <Checkbox 
                      checked={cb.included}
                      onCheckedChange={(checked) => {
                        const updated = coBenefits.map(c => 
                          c.id === cb.id ? { ...c, included: !!checked } : c
                        );
                        onUpdate({ coBenefits: updated });
                      }}
                    />
                    <div>
                      <p className="font-medium text-sm">{cb.title}</p>
                      <Badge variant="outline" className="text-xs mt-1">{cb.category}</Badge>
                    </div>
                  </div>
                  <Badge variant={cb.confidence === 'HIGH' ? 'default' : cb.confidence === 'MEDIUM' ? 'secondary' : 'outline'}>
                    {cb.confidence}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{cb.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {t('impactModel.analyticalLenses')}
          </CardTitle>
          <CardDescription>{t('impactModel.lensesDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasBaseNarrative ? (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('impactModel.generateFirst')}</p>
            </div>
          ) : (
            <Tabs value={data.selectedLens} onValueChange={(v) => onUpdate({ selectedLens: v as LensType })}>
              <TabsList className="grid w-full grid-cols-5">
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
              {lenses.map((lens) => (
                <TabsContent key={lens} value={lens} className="mt-4">
                  <div className="p-4 bg-muted/30 rounded-lg space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        {LENS_ICONS[lens]}
                      </div>
                      <div>
                        <h4 className="font-medium">{t(`impactModel.lenses.${lens}`)}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{t(`impactModel.lensHeadlines.${lens}`)}</p>
                      </div>
                    </div>
                    
                    {lens === 'neutral' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                          <Check className="h-4 w-4" />
                          <span className="text-sm font-medium">{t('impactModel.baseNarrativeAvailable')}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{t('impactModel.neutralIsBase')}</p>
                        <ScrollArea className="h-[300px] mt-4">
                          <div className="space-y-2 pr-4">
                            {data.narrativeCache.base?.map((block) => (
                              <div key={block.id} className="p-3 bg-background border rounded">
                                <p className="font-medium text-sm">{block.title}</p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{block.contentMd}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : data.narrativeCache.lensVariants[lens]?.length > 0 ? (
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
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-2 pr-4">
                            {data.narrativeCache.lensVariants[lens].map((block) => (
                              <div key={block.id} className="p-3 bg-background border rounded">
                                <p className="font-medium text-sm">{block.title}</p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{block.contentMd}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground italic">{t('impactModel.lensNotGenerated')}</p>
                        <div>
                          <Label className="text-xs text-muted-foreground">{t('impactModel.customInstructions')}</Label>
                          <Textarea
                            placeholder={t('impactModel.customInstructionsPlaceholder')}
                            value={customInstructions[lens] || ''}
                            onChange={(e) => setCustomInstructions(prev => ({ ...prev, [lens]: e.target.value }))}
                            className="min-h-[60px] mt-1 text-sm"
                          />
                        </div>
                        <Button 
                          onClick={() => onGenerateLens(lens, customInstructions[lens])}
                          disabled={isGeneratingLens === lens}
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
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
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
  const { routePrefix } = useSampleRoute();
  const { context, loadContext, updateModule } = useProjectContext();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState<WizardStep>('setup');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [isGeneratingLens, setIsGeneratingLens] = useState<LensType | null>(null);
  const [localData, setLocalData] = useState<ImpactModelData>(getDefaultImpactModelData());

  useEffect(() => {
    if (projectId) {
      loadContext(projectId);
    }
  }, [projectId, loadContext]);

  useEffect(() => {
    if (context?.impactModel) {
      setLocalData(context.impactModel);
    }
  }, [context?.impactModel]);

  const handleUpdate = (updates: Partial<ImpactModelData>) => {
    const updated = { ...localData, ...updates, status: 'DRAFT' as const };
    setLocalData(updated);
    updateModule('impactModel', updated);
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
          interventionBundles: localData.interventionBundles,
          funderPathway: funderPathway,
          prioritizationWeights: localData.prioritizationWeights,
          projectName: context?.projectName || 'Urban Climate Resilience Initiative',
          cityName: context?.cityName || 'Porto Alegre',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate narrative');
      }

      const result = await response.json();

      handleUpdate({
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
      });

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
            weights: localData.prioritizationWeights,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate block');
      }

      const result = await response.json();
      
      const updatedBlocks = (localData.narrativeCache.base || []).map(b => 
        b.id === block.id ? { ...result.block, id: block.id } : b
      );
      
      handleUpdate({
        narrativeCache: {
          ...localData.narrativeCache,
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
    if (lens === 'neutral' || !localData.narrativeCache.base) return;
    
    setIsGeneratingLens(lens);
    
    try {
      const response = await fetch('/api/impact-model/generate-lens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lens,
          baseNarrativeBlocks: localData.narrativeCache.base,
          funderPathway: funderPathway,
          customInstructions,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate lens variant');
      }

      const result = await response.json();
      
      handleUpdate({
        narrativeCache: {
          ...localData.narrativeCache,
          lensVariants: {
            ...localData.narrativeCache.lensVariants,
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

  const canProceed = () => {
    switch (currentStep) {
      case 'setup':
        return localData.interventionBundles.length > 0;
      case 'generate':
        return localData.narrativeCache.base && localData.narrativeCache.base.length > 0;
      case 'curate':
      case 'lenses':
        return true;
      case 'export':
        return true;
      default:
        return true;
    }
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
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Lightbulb className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('impactModel.title')}</h1>
              <p className="text-muted-foreground">{t('impactModel.subtitle')}</p>
            </div>
          </div>
          <Progress value={progress} className="h-2 mt-4" />
        </div>

        <StepIndicator currentStep={currentStep} steps={WIZARD_STEPS} />

        <div className="mb-6">
          {currentStep === 'setup' && (
            <SetupStep data={localData} onUpdate={handleUpdate} siteExplorerZones={siteExplorerZones} usingSampleData={usingSampleData} />
          )}
          {currentStep === 'generate' && (
            <GenerateStep 
              data={localData} 
              onUpdate={handleUpdate} 
              onGenerate={handleGenerate} 
              isGenerating={isGenerating}
              cityName={cityName}
              funderName={funderName}
              onContinueToCuration={() => setCurrentStep('curate')}
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
            disabled={currentStepIndex === 0}
          >
            {t('common.previous')}
          </Button>
          {currentStepIndex < WIZARD_STEPS.length - 1 ? (
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
