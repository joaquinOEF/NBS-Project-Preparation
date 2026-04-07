import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Card, CardContent } from '@/core/components/ui/card';
import {
  Check, HelpCircle, ChevronRight, ArrowLeft, Camera, Loader2,
  Droplets, Thermometer, TreePine, DollarSign, AlertTriangle, MapPin, Clock,
} from 'lucide-react';
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

// Section labels and icons for the detail panel
const SECTION_CONFIG: Record<string, { icon: typeof Droplets; label: string; labelPt: string }> = {
  description: { icon: TreePine, label: 'What is it?', labelPt: 'O que é?' },
  how_it_works: { icon: Droplets, label: 'How it works', labelPt: 'Como funciona' },
  key_performance_indicators_kpis: { icon: Check, label: 'Key numbers', labelPt: 'Números-chave' },
  costs: { icon: DollarSign, label: 'Costs', labelPt: 'Custos' },
  climate_benefits: { icon: Thermometer, label: 'Climate benefits', labelPt: 'Benefícios climáticos' },
  optimal_site_conditions: { icon: MapPin, label: 'Best site conditions', labelPt: 'Condições ideais do local' },
  typical_scale_and_timeline: { icon: Clock, label: 'Scale & timeline', labelPt: 'Escala e prazo' },
  risks_and_failure_modes: { icon: AlertTriangle, label: 'Risks to watch', labelPt: 'Riscos a observar' },
  brazilian_and_latin_american_examples: { icon: MapPin, label: 'Brazilian examples', labelPt: 'Exemplos brasileiros' },
};

const DETAIL_SECTION_ORDER = [
  'description', 'how_it_works', 'key_performance_indicators_kpis', 'costs',
  'climate_benefits', 'optimal_site_conditions', 'typical_scale_and_timeline',
  'risks_and_failure_modes', 'brazilian_and_latin_american_examples',
];

export default function InterventionSelector({ params, onConfirm, onCancel }: Props) {
  const { i18n } = useTranslation();
  const isPt = i18n.resolvedLanguage === 'pt';
  const [selected, setSelected] = useState<Set<NbsInterventionTypeId>>(() => {
    if (params.preSelectedType) return new Set([params.preSelectedType]);
    return new Set();
  });
  const multiSelect = params.multiSelect ?? true;
  const maxRecs = params.maxRecommendations ?? 2;

  // Detail panel state
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailSections, setDetailSections] = useState<Record<string, string> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('description');

  // Fetch detail content when opening a card
  const openDetail = useCallback(async (id: string) => {
    setDetailId(id);
    setDetailLoading(true);
    setActiveSection('description');
    try {
      const lang = isPt ? 'pt' : 'en';
      const res = await fetch(`/api/knowledge/interventions/${id}?lang=${lang}`);
      if (res.ok) {
        const data = await res.json();
        setDetailSections(data.sections);
      }
    } catch { /* ignore */ }
    setDetailLoading(false);
  }, []);

  // Calculate relevance scores for each type
  const typeScores = useMemo(() => {
    const scores = new Map<NbsInterventionTypeId, number>();
    if (params.recommendedTypes && params.recommendedTypes.length > 0) {
      for (const type of NBS_INTERVENTION_TYPES) {
        const idx = params.recommendedTypes.indexOf(type.id);
        scores.set(type.id, idx >= 0 ? 1000 - idx : 0);
      }
      return scores;
    }
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

  const sortedTypes = useMemo(() => {
    return [...NBS_INTERVENTION_TYPES].sort((a, b) =>
      (typeScores.get(b.id) || 0) - (typeScores.get(a.id) || 0)
    );
  }, [typeScores]);

  const recommendedSet = useMemo(() => {
    const sorted = [...typeScores.entries()].sort((a, b) => b[1] - a[1]);
    const topN = sorted.slice(0, maxRecs).filter(([, score]) => score > 0);
    return new Set(topN.map(([id]) => id));
  }, [typeScores, maxRecs]);

  const toggleSelect = (id: NbsInterventionTypeId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { if (!multiSelect) next.clear(); next.add(id); }
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
      interventionType: first.id, label: first.label,
      primaryBenefit: first.primaryBenefit, knowledgeFile: first.knowledgeFile,
    });
  };

  const handleHelpMe = () => {
    onConfirm({
      interventionTypes: [], labels: ['I don\'t know — help me decide'],
      primaryBenefits: [], knowledgeFiles: [],
      interventionType: '' as NbsInterventionTypeId, label: 'I don\'t know — help me decide',
      primaryBenefit: '', knowledgeFile: '',
    });
  };

  const detailType = detailId ? NBS_INTERVENTION_TYPES.find(t => t.id === detailId) : null;

  // ── Detail panel view ──────────────────────────────────────────────────────
  if (detailId && detailType) {
    const isSelected = selected.has(detailType.id);
    const cs = detailType.caseStudy;
    return (
      <div className="flex flex-col h-full">
        {/* Detail header with photo */}
        <div className="relative">
          <div className="h-40 relative overflow-hidden bg-muted">
            <img src={cs.image} alt={cs.project} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <button
              onClick={() => { setDetailId(null); setDetailSections(null); }}
              className="absolute top-3 left-3 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            {recommendedSet.has(detailType.id) && (
              <Badge className="absolute top-3 right-3 bg-green-600 text-[10px]">
                {isPt ? 'Recomendado' : 'Recommended'}
              </Badge>
            )}
            <div className="absolute bottom-3 left-3 right-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>{detailType.emoji}</span> {detailType.label}
              </h2>
              <p className="text-xs text-white/80 mt-0.5">{detailType.description}</p>
              <p className="text-[10px] text-white/60 mt-1">📍 {cs.city} — {cs.project}</p>
            </div>
          </div>
        </div>

        {/* Section tabs */}
        <div className="border-b bg-background overflow-x-auto">
          <div className="flex px-2 gap-0 min-w-max">
            {DETAIL_SECTION_ORDER.filter(key => !detailSections || detailSections[key]).map(key => {
              const cfg = SECTION_CONFIG[key];
              if (!cfg) return null;
              const Icon = cfg.icon;
              return (
                <button key={key} onClick={() => setActiveSection(key)}
                  className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1 ${
                    activeSection === key ? 'border-green-600 text-green-700' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}>
                  <Icon className="w-3 h-3" />
                  {isPt ? cfg.labelPt : cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto p-4">
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailSections && detailSections[activeSection] ? (
            <div className="prose prose-sm max-w-none text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {detailSections[activeSection]}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isPt ? 'Conteúdo não disponível.' : 'Content not available.'}
            </p>
          )}

          {/* Case study summary card at bottom */}
          {activeSection === 'brazilian_and_latin_american_examples' && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-xs space-y-1">
              <p className="font-semibold text-green-800">{cs.project} — {cs.city}</p>
              <p className="text-green-700">{cs.outcome}</p>
              <div className="flex gap-4 mt-1">
                <span className="text-green-600"><strong>{isPt ? 'Custo' : 'Cost'}:</strong> {cs.cost}</span>
                <span className="text-green-600"><strong>{isPt ? 'Prazo' : 'Timeline'}:</strong> {cs.timeline}</span>
              </div>
              <p className="text-[9px] text-green-500 flex items-center gap-1 mt-1">
                <Camera className="w-3 h-3" /> {cs.photoCredit}
              </p>
            </div>
          )}
        </div>

        {/* Detail footer */}
        <div className="p-3 border-t bg-background flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => { setDetailId(null); setDetailSections(null); }}>
            <ArrowLeft className="w-3 h-3 mr-1" />
            {isPt ? 'Voltar' : 'Back'}
          </Button>
          <Button
            size="sm"
            className={isSelected ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'}
            onClick={() => { toggleSelect(detailType.id); setDetailId(null); setDetailSections(null); }}
          >
            <Check className="w-4 h-4 mr-1" />
            {isSelected
              ? (isPt ? 'Selecionado' : 'Selected')
              : (isPt ? 'Selecionar este tipo' : 'Select this type')}
          </Button>
        </div>
      </div>
    );
  }

  // ── Card list view ─────────────────────────────────────────────────────────
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
          const cs = type.caseStudy;

          return (
            <Card
              key={type.id}
              className={`transition-all overflow-hidden ${
                isSelected
                  ? 'ring-2 ring-green-500 border-green-500'
                  : isRec
                    ? 'hover:border-green-300 hover:shadow-md'
                    : 'opacity-70 hover:opacity-90'
              }`}
            >
              {/* Real photo — clicking opens detail */}
              <div
                className="h-36 relative overflow-hidden bg-muted cursor-pointer"
                onClick={() => openDetail(type.id)}
              >
                <img src={cs.image} alt={`${cs.project} — ${cs.city}`} className="w-full h-full object-cover" loading="lazy" />
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
                  <span className="text-[10px] text-white/90 bg-black/40 px-1.5 py-0.5 rounded">📍 {cs.city}</span>
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

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-2.5">
                  <Button
                    variant="outline" size="sm" className="text-[11px] h-7 flex-1"
                    onClick={(e) => { e.stopPropagation(); openDetail(type.id); }}
                  >
                    {isPt ? 'Saiba mais' : 'Learn more'}
                    <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                  <Button
                    size="sm"
                    className={`text-[11px] h-7 ${isSelected ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(type.id); }}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    {isSelected ? (isPt ? 'Selecionado' : 'Selected') : (isPt ? 'Selecionar' : 'Select')}
                  </Button>
                </div>
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
          <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={selected.size === 0} onClick={handleConfirm}>
            <Check className="w-4 h-4 mr-1" />
            {isPt ? 'Confirmar' : 'Confirm'}{selected.size > 1 ? ` (${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
