import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { ArrowLeft, Lightbulb, Settings, Sparkles, Edit3, Eye, Download, Check, ChevronDown, ChevronUp, Plus, Trash2, RefreshCw } from 'lucide-react';
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
  siteExplorerZones 
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
  siteExplorerZones: any[];
}) {
  const { t } = useTranslation();
  
  const handleWeightChange = (key: keyof PrioritizationWeights, value: number) => {
    onUpdate({
      prioritizationWeights: {
        ...data.prioritizationWeights,
        [key]: value,
      },
    });
  };

  const handleResetWeights = () => {
    onUpdate({
      prioritizationWeights: { ...data.inheritedWeights },
    });
  };

  const hasModifiedWeights = Object.keys(data.prioritizationWeights).some(
    key => data.prioritizationWeights[key as keyof PrioritizationWeights] !== 
           data.inheritedWeights[key as keyof PrioritizationWeights]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {t('impactModel.prioritizationWeights')}
              </CardTitle>
              <CardDescription>{t('impactModel.weightsDescription')}</CardDescription>
            </div>
            {hasModifiedWeights && (
              <Button variant="outline" size="sm" onClick={handleResetWeights}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('impactModel.resetToDefault')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <WeightSlider
            label={t('impactModel.weights.floodRiskReduction')}
            value={data.prioritizationWeights.floodRiskReduction}
            onChange={(v) => handleWeightChange('floodRiskReduction', v)}
            inherited={data.inheritedWeights.floodRiskReduction}
          />
          <WeightSlider
            label={t('impactModel.weights.heatReduction')}
            value={data.prioritizationWeights.heatReduction}
            onChange={(v) => handleWeightChange('heatReduction', v)}
            inherited={data.inheritedWeights.heatReduction}
          />
          <WeightSlider
            label={t('impactModel.weights.landslideRiskReduction')}
            value={data.prioritizationWeights.landslideRiskReduction}
            onChange={(v) => handleWeightChange('landslideRiskReduction', v)}
            inherited={data.inheritedWeights.landslideRiskReduction}
          />
          <WeightSlider
            label={t('impactModel.weights.socialEquity')}
            value={data.prioritizationWeights.socialEquity}
            onChange={(v) => handleWeightChange('socialEquity', v)}
            inherited={data.inheritedWeights.socialEquity}
          />
          <WeightSlider
            label={t('impactModel.weights.costCertainty')}
            value={data.prioritizationWeights.costCertainty}
            onChange={(v) => handleWeightChange('costCertainty', v)}
            inherited={data.inheritedWeights.costCertainty}
          />
          <WeightSlider
            label={t('impactModel.weights.biodiversityWaterQuality')}
            value={data.prioritizationWeights.biodiversityWaterQuality}
            onChange={(v) => handleWeightChange('biodiversityWaterQuality', v)}
            inherited={data.inheritedWeights.biodiversityWaterQuality}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('impactModel.interventionBundles')}</CardTitle>
          <CardDescription>{t('impactModel.bundlesDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {siteExplorerZones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('impactModel.noZonesSelected')}</p>
              <p className="text-sm mt-2">{t('impactModel.selectZonesFirst')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {siteExplorerZones.map((zone, index) => (
                <div key={zone.zoneId || index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={data.interventionBundles.some(b => b.id === (zone.zoneId || `zone-${index}`))}
                      onCheckedChange={(checked) => {
                        const zoneId = zone.zoneId || `zone-${index}`;
                        if (checked) {
                          onUpdate({
                            interventionBundles: [
                              ...data.interventionBundles,
                              {
                                id: zoneId,
                                name: zone.name || `Zone ${index + 1}`,
                                objective: '',
                                targetHazards: [zone.hazardType || 'FLOOD'],
                                interventions: [],
                                locations: [{ zoneId, name: zone.name || '', geometryType: 'polygon' }],
                                capexRange: { low: 0, high: 0 },
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
                      <p className="font-medium text-sm">{zone.name || `Zone ${index + 1}`}</p>
                      <div className="flex gap-2 mt-1">
                        {zone.hazardType && (
                          <Badge variant="outline" className="text-xs">{zone.hazardType}</Badge>
                        )}
                        {zone.interventionType && (
                          <Badge variant="secondary" className="text-xs">{zone.interventionType}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {zone.riskScore && (
                    <span className="text-sm text-muted-foreground">Risk: {(zone.riskScore * 100).toFixed(0)}%</span>
                  )}
                </div>
              ))}
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
  isGenerating 
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  const { t } = useTranslation();
  
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
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">{t('impactModel.contextSummary')}</h4>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('impactModel.selectedBundles')}:</span>
                <span>{data.interventionBundles.filter(b => b.enabled).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('impactModel.targetHazards')}:</span>
                <span>{Array.from(new Set(data.interventionBundles.flatMap(b => b.targetHazards))).join(', ') || '-'}</span>
              </div>
            </div>
          </div>

          <Button 
            onClick={onGenerate} 
            disabled={isGenerating || data.interventionBundles.length === 0}
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

          {data.narrativeCache.base && data.narrativeCache.base.length > 0 && (
            <div className="mt-6 p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <Check className="h-5 w-5" />
                <span className="font-medium">{t('impactModel.narrativeGenerated')}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {data.narrativeCache.base.length} {t('impactModel.blocksGenerated')}, {' '}
                {data.coBenefits.length} {t('impactModel.coBenefitsGenerated')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CurateStep({ 
  data, 
  onUpdate 
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
}) {
  const { t } = useTranslation();
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  const toggleBlock = (id: string) => {
    setExpandedBlocks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const blocks = data.narrativeCache.base || [];
  const coBenefits = data.coBenefits || [];

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
        <CardContent className="space-y-3">
          {blocks.map((block) => (
            <Collapsible 
              key={block.id} 
              open={expandedBlocks.has(block.id)}
              onOpenChange={() => toggleBlock(block.id)}
            >
              <div className="border rounded-lg">
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Checkbox 
                      checked={block.included}
                      onClick={(e) => e.stopPropagation()}
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
                    />
                    <div className="text-left">
                      <p className="font-medium text-sm">{block.title}</p>
                      <Badge variant="outline" className="text-xs mt-1">{block.type.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>
                  {expandedBlocks.has(block.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CollapsibleTrigger>
                <CollapsibleContent className="p-3 pt-0 border-t">
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
                    className="min-h-[150px] mt-2"
                  />
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary">{block.evidenceTier}</Badge>
                    {block.kpis?.map((kpi, i) => (
                      <Badge key={i} variant="outline">{kpi.name}: {kpi.valueRange}</Badge>
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
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
              <div key={cb.id} className={`p-3 border rounded-lg ${cb.included ? '' : 'opacity-50'}`}>
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
    </div>
  );
}

function LensesStep({ 
  data, 
  onUpdate 
}: { 
  data: ImpactModelData; 
  onUpdate: (d: Partial<ImpactModelData>) => void;
}) {
  const { t } = useTranslation();
  const lenses: LensType[] = ['neutral', 'climate', 'social', 'financial', 'institutional'];

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
          <Tabs value={data.selectedLens} onValueChange={(v) => onUpdate({ selectedLens: v as LensType })}>
            <TabsList className="grid w-full grid-cols-5">
              {lenses.map((lens) => (
                <TabsTrigger key={lens} value={lens} className="text-xs">
                  {t(`impactModel.lenses.${lens}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {lenses.map((lens) => (
              <TabsContent key={lens} value={lens} className="mt-4">
                <div className="p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-medium mb-2">{t(`impactModel.lenses.${lens}`)}</h4>
                  <p className="text-sm text-muted-foreground">{t(`impactModel.lensDescriptions.${lens}`)}</p>
                  
                  {data.narrativeCache.lensVariants[lens]?.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {data.narrativeCache.lensVariants[lens].map((block) => (
                        <div key={block.id} className="p-3 bg-background border rounded">
                          <p className="font-medium text-sm">{block.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{block.contentMd}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground italic">
                      {lens === 'neutral' ? t('impactModel.useBaseNarrative') : t('impactModel.lensNotGenerated')}
                    </p>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function ExportStep({ 
  data,
  onPushToOperations,
  onPushToBusinessModel 
}: { 
  data: ImpactModelData;
  onPushToOperations: () => void;
  onPushToBusinessModel: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const generateMarkdown = () => {
    const blocks = data.narrativeCache.base?.filter(b => b.included) || [];
    const coBenefits = data.coBenefits.filter(cb => cb.included);
    
    let md = `# Impact Narrative\n\n`;
    md += `*Generated: ${data.generationMeta?.generatedAt || 'Unknown'}*\n\n`;
    
    blocks.forEach(block => {
      md += `## ${block.title}\n\n`;
      md += `${block.contentMd}\n\n`;
      if (block.kpis?.length) {
        md += `**KPIs:**\n`;
        block.kpis.forEach(kpi => {
          md += `- ${kpi.name}: ${kpi.valueRange} ${kpi.unit}\n`;
        });
        md += `\n`;
      }
    });

    if (coBenefits.length > 0) {
      md += `## Co-Benefits\n\n`;
      coBenefits.forEach(cb => {
        md += `### ${cb.title}\n`;
        md += `*${cb.category} | ${cb.confidence} Confidence*\n\n`;
        md += `${cb.description}\n\n`;
      });
    }

    return md;
  };

  const handleExportMarkdown = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'impact-narrative.md';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t('impactModel.exportSuccess'), description: t('impactModel.markdownExported') });
  };

  const handleExportJSON = () => {
    const exportData = {
      generatedAt: data.generationMeta?.generatedAt,
      narrativeBlocks: data.narrativeCache.base?.filter(b => b.included),
      coBenefits: data.coBenefits.filter(cb => cb.included),
      downstreamSignals: data.downstreamSignals,
      weights: data.prioritizationWeights,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'impact-model-export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t('impactModel.exportSuccess'), description: t('impactModel.jsonExported') });
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
          <div className="grid gap-3 md:grid-cols-2">
            <Button variant="outline" onClick={handleExportMarkdown} className="h-auto py-4">
              <div className="text-left">
                <p className="font-medium">{t('impactModel.exportMarkdown')}</p>
                <p className="text-xs text-muted-foreground">{t('impactModel.exportMarkdownDesc')}</p>
              </div>
            </Button>
            <Button variant="outline" onClick={handleExportJSON} className="h-auto py-4">
              <div className="text-left">
                <p className="font-medium">{t('impactModel.exportJSON')}</p>
                <p className="text-xs text-muted-foreground">{t('impactModel.exportJSONDesc')}</p>
              </div>
            </Button>
          </div>
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
          model: 'GPT-4.1',
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

  const handlePushToOperations = () => {
    toast({ title: t('impactModel.signalsPushed'), description: t('impactModel.opsSignalsPushed') });
  };

  const handlePushToBusinessModel = () => {
    toast({ title: t('impactModel.signalsPushed'), description: t('impactModel.bmSignalsPushed') });
  };

  const rawZones = context?.siteExplorer?.selectedZones ?? sampleSiteExplorer.selectedZones;
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
            <SetupStep data={localData} onUpdate={handleUpdate} siteExplorerZones={siteExplorerZones} />
          )}
          {currentStep === 'generate' && (
            <GenerateStep data={localData} onUpdate={handleUpdate} onGenerate={handleGenerate} isGenerating={isGenerating} />
          )}
          {currentStep === 'curate' && (
            <CurateStep data={localData} onUpdate={handleUpdate} />
          )}
          {currentStep === 'lenses' && (
            <LensesStep data={localData} onUpdate={handleUpdate} />
          )}
          {currentStep === 'export' && (
            <ExportStep 
              data={localData} 
              onPushToOperations={handlePushToOperations}
              onPushToBusinessModel={handlePushToBusinessModel}
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
