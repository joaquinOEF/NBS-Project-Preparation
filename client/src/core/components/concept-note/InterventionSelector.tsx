import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Card, CardContent } from '@/core/components/ui/card';
import { Check, HelpCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import {
  NBS_INTERVENTION_TYPES,
  type OpenInterventionSelectorParams,
  type InterventionSelectorResult,
  type NbsInterventionTypeId,
} from '@shared/cbo-schema';

interface Props {
  params: OpenInterventionSelectorParams;
  onConfirm: (result: InterventionSelectorResult) => void;
  onCancel: () => void;
}

// Placeholder images — will be replaced with real case study photos
const PLACEHOLDER_GRADIENTS: Record<string, string> = {
  'bioswales-rain-gardens': 'from-emerald-400 to-teal-600',
  'flood-parks': 'from-blue-400 to-cyan-600',
  'green-corridors': 'from-green-500 to-emerald-700',
  'green-roofs-walls': 'from-lime-400 to-green-600',
  'urban-forests': 'from-green-600 to-emerald-800',
  'wetland-restoration': 'from-teal-500 to-blue-700',
};

// Hazard → which intervention types address it
const HAZARD_RELEVANCE: Record<string, NbsInterventionTypeId[]> = {
  flood: ['bioswales-rain-gardens', 'flood-parks', 'wetland-restoration'],
  heat: ['green-corridors', 'green-roofs-walls', 'urban-forests'],
  landslide: ['urban-forests', 'green-corridors'],
};

export default function InterventionSelector({ params, onConfirm, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.resolvedLanguage === 'pt';
  const [selected, setSelected] = useState<NbsInterventionTypeId | null>(params.preSelectedType || null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [helpMode, setHelpMode] = useState(false);

  // Sort types by relevance to site hazards
  const sortedTypes = useMemo(() => {
    if (!params.siteHazards) return [...NBS_INTERVENTION_TYPES];
    const { flood, heat, landslide } = params.siteHazards;
    return [...NBS_INTERVENTION_TYPES].sort((a, b) => {
      const scoreA = (HAZARD_RELEVANCE.flood?.includes(a.id) ? flood : 0)
        + (HAZARD_RELEVANCE.heat?.includes(a.id) ? heat : 0)
        + (HAZARD_RELEVANCE.landslide?.includes(a.id) ? landslide : 0);
      const scoreB = (HAZARD_RELEVANCE.flood?.includes(b.id) ? flood : 0)
        + (HAZARD_RELEVANCE.heat?.includes(b.id) ? heat : 0)
        + (HAZARD_RELEVANCE.landslide?.includes(b.id) ? landslide : 0);
      return scoreB - scoreA;
    });
  }, [params.siteHazards]);

  // Check if a type is relevant to the site hazards
  const isRelevant = (typeId: NbsInterventionTypeId): boolean => {
    if (!params.siteHazards) return true;
    const { flood, heat, landslide } = params.siteHazards;
    return (HAZARD_RELEVANCE.flood?.includes(typeId) && flood > 0.3)
      || (HAZARD_RELEVANCE.heat?.includes(typeId) && heat > 0.3)
      || (HAZARD_RELEVANCE.landslide?.includes(typeId) && landslide > 0.3);
  };

  const handleConfirm = () => {
    if (!selected) return;
    const type = NBS_INTERVENTION_TYPES.find(t => t.id === selected);
    if (!type) return;
    onConfirm({
      interventionType: type.id,
      label: type.label,
      primaryBenefit: type.primaryBenefit,
      knowledgeFile: type.knowledgeFile,
    });
  };

  const handleHelpMe = () => {
    // Send "I don't know" as the result — agent will enter guidance mode
    onConfirm({
      interventionType: '' as NbsInterventionTypeId,
      label: 'I don\'t know — help me decide',
      primaryBenefit: '',
      knowledgeFile: '',
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <h3 className="text-sm font-semibold text-foreground">{params.prompt}</h3>
        {params.siteHazards && (
          <div className="flex gap-2 mt-2">
            {params.siteHazards.flood > 0.3 && (
              <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                🌊 {isPt ? 'Risco de inundação' : 'Flood risk'}: {(params.siteHazards.flood * 100).toFixed(0)}%
              </Badge>
            )}
            {params.siteHazards.heat > 0.3 && (
              <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">
                🔥 {isPt ? 'Risco de calor' : 'Heat risk'}: {(params.siteHazards.heat * 100).toFixed(0)}%
              </Badge>
            )}
            {params.siteHazards.landslide > 0.3 && (
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                ⛰️ {isPt ? 'Risco de deslizamento' : 'Landslide risk'}: {(params.siteHazards.landslide * 100).toFixed(0)}%
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedTypes.map((type) => {
          const relevant = isRelevant(type.id);
          const isSelected = selected === type.id;
          const isExpanded = expandedId === type.id;
          const gradient = PLACEHOLDER_GRADIENTS[type.id] || 'from-gray-400 to-gray-600';

          return (
            <Card
              key={type.id}
              className={`cursor-pointer transition-all overflow-hidden ${
                isSelected
                  ? 'ring-2 ring-green-500 border-green-500'
                  : relevant
                    ? 'hover:border-green-300 hover:shadow-md'
                    : 'opacity-60 hover:opacity-80'
              }`}
              onClick={() => setSelected(type.id)}
            >
              {/* Image placeholder — gradient with emoji */}
              <div className={`h-28 bg-gradient-to-br ${gradient} relative flex items-center justify-center`}>
                <span className="text-4xl">{type.emoji}</span>
                {relevant && params.siteHazards && (
                  <Badge className="absolute top-2 right-2 bg-green-600 text-[10px]">
                    {isPt ? 'Recomendado' : 'Recommended'}
                  </Badge>
                )}
                {isSelected && (
                  <div className="absolute top-2 left-2 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
                {type.caseStudy && (
                  <span className="absolute bottom-2 left-2 text-[10px] text-white/80 bg-black/30 px-1.5 py-0.5 rounded">
                    📍 {type.caseStudy.city}
                  </span>
                )}
              </div>

              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold">{type.label}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 italic">
                      {isPt ? 'Ex' : 'e.g.'}: {type.example}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] ml-2 shrink-0">
                    {type.primaryBenefit === 'adaptation' ? (isPt ? 'Adaptação' : 'Adaptation')
                      : type.primaryBenefit === 'both' ? (isPt ? 'Ambos' : 'Both')
                      : (isPt ? 'Mitigação' : 'Mitigation')}
                  </Badge>
                </div>

                {/* Expandable case study section */}
                {params.showCaseStudies && type.caseStudy && (
                  <div className="mt-2">
                    <button
                      className="text-[11px] text-green-700 hover:text-green-900 flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(isExpanded ? null : type.id);
                      }}
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isPt ? 'Ver exemplo real' : 'See real example'}: {type.caseStudy.project}
                    </button>
                    {isExpanded && (
                      <div className="mt-2 p-2 bg-muted/50 rounded-md text-xs text-muted-foreground space-y-1">
                        <p><strong>{type.caseStudy.project}</strong> — {type.caseStudy.city}</p>
                        <p className="text-[10px]">
                          {isPt
                            ? 'Clique em "Confirmar" para ver detalhes completos, custos e indicadores deste tipo de intervenção.'
                            : 'Click "Confirm" to see full details, costs, and indicators for this intervention type.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* "I don't know" card */}
        <Card
          className="cursor-pointer hover:border-amber-300 hover:shadow-md transition-all border-dashed"
          onClick={handleHelpMe}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <HelpCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-amber-800">
                {isPt ? 'Não sei — me ajude a decidir' : "I don't know — help me decide"}
              </h4>
              <p className="text-xs text-muted-foreground">
                {isPt
                  ? 'Vou te fazer algumas perguntas sobre seu local e problemas para recomendar a melhor opção'
                  : "I'll ask a few questions about your site and problems to recommend the best option"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="p-3 border-t bg-background flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {isPt ? 'Cancelar' : 'Cancel'}
        </Button>
        <div className="flex items-center gap-2">
          {selected && (
            <span className="text-xs text-muted-foreground">
              {NBS_INTERVENTION_TYPES.find(t => t.id === selected)?.label}
            </span>
          )}
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            disabled={!selected}
            onClick={handleConfirm}
          >
            <Check className="w-4 h-4 mr-1" />
            {isPt ? 'Confirmar' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}
