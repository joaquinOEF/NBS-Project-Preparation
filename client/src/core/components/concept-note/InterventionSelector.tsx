import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Card, CardContent } from '@/core/components/ui/card';
import { Check, HelpCircle, ChevronDown, ChevronUp, Camera } from 'lucide-react';
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

// Hazard → which intervention types address it (with weight)
const HAZARD_WEIGHTS: Record<string, Record<NbsInterventionTypeId, number>> = {
  flood: { 'bioswales-rain-gardens': 0.9, 'flood-parks': 1.0, 'wetland-restoration': 0.95, 'green-corridors': 0.3, 'green-roofs-walls': 0.4, 'urban-forests': 0.3 },
  heat: { 'green-corridors': 0.9, 'green-roofs-walls': 0.85, 'urban-forests': 1.0, 'bioswales-rain-gardens': 0.2, 'flood-parks': 0.3, 'wetland-restoration': 0.2 },
  landslide: { 'urban-forests': 0.9, 'green-corridors': 0.7, 'bioswales-rain-gardens': 0.3, 'flood-parks': 0.1, 'green-roofs-walls': 0.1, 'wetland-restoration': 0.2 },
};

export default function InterventionSelector({ params, onConfirm, onCancel }: Props) {
  const { i18n } = useTranslation();
  const isPt = i18n.resolvedLanguage === 'pt';
  const [selected, setSelected] = useState<Set<NbsInterventionTypeId>>(() => {
    if (params.preSelectedType) return new Set([params.preSelectedType]);
    return new Set();
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const multiSelect = params.multiSelect ?? true; // default to multi-select
  const maxRecs = params.maxRecommendations ?? 2;

  // Calculate relevance scores for each type
  const typeScores = useMemo(() => {
    const scores = new Map<NbsInterventionTypeId, number>();

    // If agent passed explicit recommendations, use those as primary ranking
    if (params.recommendedTypes && params.recommendedTypes.length > 0) {
      for (const type of NBS_INTERVENTION_TYPES) {
        const idx = params.recommendedTypes.indexOf(type.id);
        scores.set(type.id, idx >= 0 ? 1000 - idx : 0); // recommended types get high scores in order
      }
      return scores;
    }

    // Otherwise, score based on hazards
    if (!params.siteHazards) {
      for (const type of NBS_INTERVENTION_TYPES) scores.set(type.id, 0);
      return scores;
    }

    const { flood, heat, landslide } = params.siteHazards;
    for (const type of NBS_INTERVENTION_TYPES) {
      const score = (HAZARD_WEIGHTS.flood[type.id] || 0) * flood
        + (HAZARD_WEIGHTS.heat[type.id] || 0) * heat
        + (HAZARD_WEIGHTS.landslide[type.id] || 0) * landslide;
      scores.set(type.id, score);
    }
    return scores;
  }, [params.siteHazards, params.recommendedTypes]);

  // Sort types by score (highest first)
  const sortedTypes = useMemo(() => {
    return [...NBS_INTERVENTION_TYPES].sort((a, b) =>
      (typeScores.get(b.id) || 0) - (typeScores.get(a.id) || 0)
    );
  }, [typeScores]);

  // Only top N types get "Recommended" badge
  const recommendedSet = useMemo(() => {
    const sorted = [...typeScores.entries()].sort((a, b) => b[1] - a[1]);
    const topN = sorted.slice(0, maxRecs).filter(([, score]) => score > 0);
    return new Set(topN.map(([id]) => id));
  }, [typeScores, maxRecs]);

  const toggleSelect = (id: NbsInterventionTypeId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!multiSelect) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    const types = NBS_INTERVENTION_TYPES.filter(t => selected.has(t.id));
    const first = types[0];
    onConfirm({
      interventionTypes: types.map(t => t.id),
      labels: types.map(t => t.label),
      primaryBenefits: types.map(t => t.primaryBenefit),
      knowledgeFiles: types.map(t => t.knowledgeFile),
      interventionType: first.id,
      label: first.label,
      primaryBenefit: first.primaryBenefit,
      knowledgeFile: first.knowledgeFile,
    });
  };

  const handleHelpMe = () => {
    onConfirm({
      interventionTypes: [],
      labels: ['I don\'t know — help me decide'],
      primaryBenefits: [],
      knowledgeFiles: [],
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
        <div className="flex flex-wrap gap-2 mt-2">
          {params.siteHazards && params.siteHazards.flood > 0.3 && (
            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
              🌊 {isPt ? 'Inundação' : 'Flood'}: {(params.siteHazards.flood * 100).toFixed(0)}%
            </Badge>
          )}
          {params.siteHazards && params.siteHazards.heat > 0.3 && (
            <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">
              🔥 {isPt ? 'Calor' : 'Heat'}: {(params.siteHazards.heat * 100).toFixed(0)}%
            </Badge>
          )}
          {params.siteHazards && params.siteHazards.landslide > 0.3 && (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
              ⛰️ {isPt ? 'Deslizamento' : 'Landslide'}: {(params.siteHazards.landslide * 100).toFixed(0)}%
            </Badge>
          )}
          {multiSelect && (
            <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">
              {isPt ? 'Pode escolher mais de um' : 'You can select multiple'}
            </Badge>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedTypes.map((type) => {
          const isRec = recommendedSet.has(type.id);
          const isSelected = selected.has(type.id);
          const isExpanded = expandedId === type.id;
          const score = typeScores.get(type.id) || 0;
          const cs = type.caseStudy;

          return (
            <Card
              key={type.id}
              className={`cursor-pointer transition-all overflow-hidden ${
                isSelected
                  ? 'ring-2 ring-green-500 border-green-500'
                  : isRec
                    ? 'hover:border-green-300 hover:shadow-md'
                    : 'opacity-70 hover:opacity-90'
              }`}
              onClick={() => toggleSelect(type.id)}
            >
              {/* Real photo */}
              <div className="h-36 relative overflow-hidden bg-muted">
                <img
                  src={cs.image}
                  alt={`${cs.project} — ${cs.city}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                {isRec && (
                  <Badge className="absolute top-2 right-2 bg-green-600 text-[10px]">
                    {isPt ? 'Recomendado' : 'Recommended'}
                  </Badge>
                )}
                {isSelected && (
                  <div className="absolute top-2 left-2 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
                  <span className="text-[10px] text-white/90 bg-black/40 px-1.5 py-0.5 rounded">
                    📍 {cs.city}
                  </span>
                  <span className="text-4xl">{type.emoji}</span>
                </div>
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

                {/* Expandable real case study */}
                {params.showCaseStudies !== false && (
                  <div className="mt-2">
                    <button
                      className="text-[11px] text-green-700 hover:text-green-900 flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(isExpanded ? null : type.id);
                      }}
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isPt ? 'Ver exemplo real' : 'See real example'}: {cs.project}
                    </button>
                    {isExpanded && (
                      <div className="mt-2 p-3 bg-muted/50 rounded-md text-xs space-y-2 border border-muted">
                        <div>
                          <p className="font-semibold text-foreground">{cs.project}</p>
                          <p className="text-muted-foreground">{cs.city}</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{isPt ? 'Resultados' : 'Outcomes'}:</p>
                          <p className="text-muted-foreground">{cs.outcome}</p>
                        </div>
                        <div className="flex gap-4">
                          <div>
                            <p className="font-medium text-foreground">{isPt ? 'Custo' : 'Cost'}:</p>
                            <p className="text-muted-foreground">{cs.cost}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{isPt ? 'Prazo' : 'Timeline'}:</p>
                            <p className="text-muted-foreground">{cs.timeline}</p>
                          </div>
                        </div>
                        <p className="text-[9px] text-muted-foreground/60 flex items-center gap-1">
                          <Camera className="w-3 h-3" /> {cs.photoCredit}
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
          {selected.size > 0 && (
            <span className="text-xs text-muted-foreground">
              {selected.size === 1
                ? NBS_INTERVENTION_TYPES.find(t => selected.has(t.id))?.label
                : `${selected.size} ${isPt ? 'selecionados' : 'selected'}`}
            </span>
          )}
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            disabled={selected.size === 0}
            onClick={handleConfirm}
          >
            <Check className="w-4 h-4 mr-1" />
            {isPt ? 'Confirmar' : 'Confirm'}{selected.size > 1 ? ` (${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
