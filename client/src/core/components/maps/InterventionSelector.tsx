import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Card, CardContent } from '@/core/components/ui/card';
import {
  Check, HelpCircle, ChevronDown, ChevronRight, ArrowLeft, Camera, Loader2,
  Droplets, Thermometer, TreePine, DollarSign, AlertTriangle, MapPin, Clock,
} from 'lucide-react';
import {
  NBS_INTERVENTION_TYPES,
  getLocalizedNbsType,
  type OpenInterventionSelectorParams,
  type InterventionSelectorResult,
  type NbsInterventionTypeId,
} from '@shared/cbo-schema';
import {
  NBS_FAMILIAS,
  NBS_SOLUTIONS,
  getFamilia,
  getSolution,
  nbsSolutionPhoto,
  solutionsForFamilia,
  type NbsFamiliaId,
  type NbsSolution,
} from '@shared/nbs-catalog';

// Two-level selector (família → variante, catalog in shared/nbs-catalog.ts).
// The recommendation happens at the FAMÍLIA level — hazards and the agent's
// guidance can support that reliably; the specific variant depends on terrain,
// tenure and politics the platform can't know, so it stays the org's choice.
// Variants mapped to one of the six deep-content types keep the "Saiba mais"
// knowledge panel; the confirm result carries both the chosen solutions and
// the mapped legacy types so downstream knowledge-file flows keep working.

interface Props {
  params: OpenInterventionSelectorParams;
  onConfirm: (result: InterventionSelectorResult) => void;
  onCancel: () => void;
}

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

const DELIVERY_SHORT: Record<'pt' | 'en', Record<string, string>> = {
  pt: { mutirao: 'mutirão', parceria: 'parceria', licenca: 'licença' },
  en: { mutirao: 'mutirão', parceria: 'partnership', licenca: 'licence' },
};

export default function InterventionSelector({ params, onConfirm, onCancel }: Props) {
  const { i18n } = useTranslation();
  const isPt = i18n.resolvedLanguage === 'pt';
  const lang: 'pt' | 'en' = isPt ? 'pt' : 'en';
  const multiSelect = params.multiSelect ?? true;
  const maxRecs = params.maxRecommendations ?? 2;

  // Selection is at the SOLUTION level. Legacy preSelectedType maps to the
  // canonical variant of that type (the first catalog solution carrying it).
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (params.preSelectedType) {
      const canonical = NBS_SOLUTIONS.find(s => s.legacyTypeId === params.preSelectedType);
      if (canonical) return new Set([canonical.id]);
    }
    return new Set();
  });

  // Detail panel state — operates on the mapped deep-content type, but tracks
  // which solution opened it so "Selecionar" selects that variant.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailSolutionId, setDetailSolutionId] = useState<string | null>(null);
  const [detailSections, setDetailSections] = useState<Record<string, string> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('description');

  const openDetail = useCallback(async (typeId: string, solutionId: string) => {
    setDetailId(typeId);
    setDetailSolutionId(solutionId);
    setDetailLoading(true);
    setActiveSection('description');
    try {
      const res = await fetch(`/api/knowledge/interventions/${typeId}?lang=${lang}`);
      if (res.ok) {
        const data = await res.json();
        setDetailSections(data.sections);
      }
    } catch { /* ignore */ }
    setDetailLoading(false);
  }, [lang]);

  const closeDetail = () => { setDetailId(null); setDetailSolutionId(null); setDetailSections(null); };

  // Família relevance: explicit recommendedFamilias > legacy recommendedTypes
  // (mapped through the catalog) > site hazards × the família hazard profile.
  const familiaScores = useMemo(() => {
    const scores = new Map<NbsFamiliaId, number>();
    for (const f of NBS_FAMILIAS) scores.set(f.id, 0);

    if (params.recommendedFamilias && params.recommendedFamilias.length > 0) {
      params.recommendedFamilias.forEach((id, idx) => {
        if (scores.has(id as NbsFamiliaId)) scores.set(id as NbsFamiliaId, 1000 - idx);
      });
      return scores;
    }
    if (params.recommendedTypes && params.recommendedTypes.length > 0) {
      params.recommendedTypes.forEach((typeId, idx) => {
        const familia = NBS_SOLUTIONS.find(s => s.legacyTypeId === typeId)?.familiaId;
        if (familia && (scores.get(familia) ?? 0) === 0) scores.set(familia, 1000 - idx);
      });
      return scores;
    }
    if (params.siteHazards) {
      const { flood, heat, landslide } = params.siteHazards;
      for (const f of NBS_FAMILIAS) {
        scores.set(f.id, f.hazards.flood * flood + f.hazards.heat * heat + f.hazards.landslide * landslide);
      }
    }
    return scores;
  }, [params.recommendedFamilias, params.recommendedTypes, params.siteHazards]);

  const recommendedFamiliaSet = useMemo(() => {
    const sorted = Array.from(familiaScores.entries()).sort((a, b) => b[1] - a[1]);
    return new Set(sorted.slice(0, maxRecs).filter(([, s]) => s > 0).map(([id]) => id));
  }, [familiaScores, maxRecs]);

  const sortedFamilias = useMemo(
    () => [...NBS_FAMILIAS].sort((a, b) => (familiaScores.get(b.id) || 0) - (familiaScores.get(a.id) || 0)),
    [familiaScores]
  );

  // Recommended famílias start open; with no recommendation signal, all open
  // (browsing mode). Others collapse to keep 27 variants scannable.
  const [expanded, setExpanded] = useState<Set<NbsFamiliaId>>(() => {
    const rec = new Set<NbsFamiliaId>();
    const sorted = Array.from(familiaScores.entries()).sort((a, b) => b[1] - a[1]);
    sorted.slice(0, maxRecs).filter(([, s]) => s > 0).forEach(([id]) => rec.add(id));
    if (rec.size === 0) return new Set(NBS_FAMILIAS.map(f => f.id));
    if (params.preSelectedType) {
      const familia = NBS_SOLUTIONS.find(s => s.legacyTypeId === params.preSelectedType)?.familiaId;
      if (familia) rec.add(familia);
    }
    return rec;
  });

  const toggleExpanded = (id: NbsFamiliaId) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { if (!multiSelect) next.clear(); next.add(id); }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    const solutions = NBS_FAMILIAS.flatMap(f => solutionsForFamilia(f.id)).filter(s => selected.has(s.id));
    const mappedTypes = Array.from(new Set(solutions.map(s => s.legacyTypeId).filter(Boolean))) as NbsInterventionTypeId[];
    const types = NBS_INTERVENTION_TYPES.filter(t => mappedTypes.includes(t.id));
    const familias = Array.from(new Set(solutions.map(s => getFamilia(s.familiaId)?.[lang].label).filter(Boolean))) as string[];
    const first = types[0];
    onConfirm({
      interventionTypes: types.map(t => t.id),
      labels: solutions.map(s => s[lang].label),
      primaryBenefits: types.map(t => t.primaryBenefit),
      knowledgeFiles: types.map(t => t.knowledgeFile),
      solutionIds: solutions.map(s => s.id),
      familias,
      interventionType: (first?.id ?? '') as NbsInterventionTypeId,
      label: solutions[0]?.[lang].label ?? '',
      primaryBenefit: first?.primaryBenefit ?? '',
      knowledgeFile: first?.knowledgeFile ?? '',
    });
  };

  const handleHelpMe = () => {
    const helpLabel = isPt ? 'Não sei — me ajude a decidir' : 'I don\'t know — help me decide';
    onConfirm({
      interventionTypes: [], labels: [helpLabel],
      primaryBenefits: [], knowledgeFiles: [],
      solutionIds: [], familias: [],
      interventionType: '' as NbsInterventionTypeId, label: helpLabel,
      primaryBenefit: '', knowledgeFile: '',
    });
  };

  const detailTypeRaw = detailId ? NBS_INTERVENTION_TYPES.find(t => t.id === detailId) : null;
  const detailType = detailTypeRaw ? getLocalizedNbsType(detailTypeRaw, lang) : null;
  const detailSolution = detailSolutionId ? getSolution(detailSolutionId) : undefined;

  // ── Detail panel view (deep content of the mapped type) ────────────────────
  if (detailId && detailType) {
    const isSelected = detailSolutionId ? selected.has(detailSolutionId) : false;
    const cs = detailType.caseStudy;
    return (
      <div className="flex flex-col h-full">
        {/* Detail header with photo */}
        <div className="relative">
          <div className="h-40 relative overflow-hidden bg-muted">
            <img src={cs.image} alt={cs.project} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <button
              onClick={closeDetail}
              className="absolute top-3 left-3 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="absolute bottom-3 left-3 right-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>{detailType.emoji}</span> {detailSolution ? detailSolution[lang].label : detailType.label}
              </h2>
              <p className="text-xs text-white/80 mt-0.5">
                {detailSolution ? detailSolution[lang].whatItIs : detailType.description}
              </p>
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
          <Button variant="outline" size="sm" onClick={closeDetail}>
            <ArrowLeft className="w-3 h-3 mr-1" />
            {isPt ? 'Voltar' : 'Back'}
          </Button>
          {detailSolutionId && (
            <Button
              size="sm"
              className={isSelected ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'}
              onClick={() => { toggleSelect(detailSolutionId); closeDetail(); }}
            >
              <Check className="w-4 h-4 mr-1" />
              {isSelected
                ? (isPt ? 'Selecionado' : 'Selected')
                : (isPt ? 'Selecionar esta solução' : 'Select this solution')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Solution row (variant inside an open família) ──────────────────────────
  const renderSolution = (solution: NbsSolution) => {
    const isSelected = selected.has(solution.id);
    return (
      <Card
        key={solution.id}
        data-testid={`selector-solution-${solution.id}`}
        className={`overflow-hidden transition-all ${isSelected ? 'ring-2 ring-green-500 border-green-500' : ''}`}
      >
        <CardContent className="p-2.5 flex gap-2.5">
          <div className="w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
            <img
              src={nbsSolutionPhoto(solution.id)}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-semibold leading-tight">{solution[lang].label}</h4>
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
              {solution[lang].whatItIs}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="rounded-[3px] bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {DELIVERY_SHORT[lang][solution.delivery]}
              </span>
              {solution.legacyTypeId && (
                <button
                  type="button"
                  className="text-[10.5px] font-medium text-green-700 hover:underline dark:text-green-400"
                  onClick={() => openDetail(solution.legacyTypeId!, solution.id)}
                >
                  {isPt ? 'Saiba mais' : 'Learn more'}
                  <ChevronRight className="w-3 h-3 inline" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center">
            <Button
              size="sm"
              data-testid={`selector-select-${solution.id}`}
              className={`text-[11px] h-7 ${isSelected ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'}`}
              onClick={() => toggleSelect(solution.id)}
            >
              <Check className="w-3 h-3" />
              <span className="sr-only sm:not-sr-only sm:ml-1">
                {isSelected ? (isPt ? 'Selecionado' : 'Selected') : (isPt ? 'Selecionar' : 'Select')}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Família list view ───────────────────────────────────────────────────────
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
          {params.siteHazards && params.siteHazards.landslide > 0.2 && (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
              ⛰️ {isPt ? 'Terreno em encosta' : 'Slope-prone terrain'}: {(params.siteHazards.landslide * 100).toFixed(0)}%
            </Badge>
          )}
          {multiSelect && (
            <Badge variant="outline" className="text-[10px] border-green-300 text-green-700">
              {isPt ? 'Pode escolher mais de um' : 'You can select multiple'}
            </Badge>
          )}
        </div>
      </div>

      {/* Famílias with their variants */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedFamilias.map(familia => {
          const isRec = recommendedFamiliaSet.has(familia.id);
          const isOpen = expanded.has(familia.id);
          const solutions = solutionsForFamilia(familia.id);
          const selectedHere = solutions.filter(s => selected.has(s.id)).length;
          return (
            <div key={familia.id} className={isRec ? '' : 'opacity-90'}>
              <button
                type="button"
                data-testid={`selector-familia-${familia.id}`}
                aria-expanded={isOpen}
                onClick={() => toggleExpanded(familia.id)}
                className="w-full flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-green-300"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: familia.color }} />
                <span className="text-[13px] font-semibold leading-tight">{familia[lang].label}</span>
                {isRec && (
                  <Badge className="bg-green-600 text-[9.5px] shrink-0">
                    {isPt ? 'Recomendado' : 'Recommended'}
                  </Badge>
                )}
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground shrink-0">
                  {selectedHere > 0 ? `${selectedHere}/` : ''}{solutions.length}
                </span>
              </button>
              {isOpen && (
                <div className="mt-2 space-y-2 pl-2">
                  <p className="text-[11px] text-muted-foreground px-1">{familia[lang].description}</p>
                  {solutions.map(renderSolution)}
                </div>
              )}
            </div>
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
        <Button variant="outline" size="sm" onClick={onCancel} data-testid="intervention-cancel">
          {isPt ? 'Cancelar' : 'Cancel'}
        </Button>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-xs text-muted-foreground">
              {selected.size === 1
                ? getSolution(Array.from(selected)[0])?.[lang].label
                : `${selected.size} ${isPt ? 'selecionados' : 'selected'}`}
            </span>
          )}
          <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={selected.size === 0} onClick={handleConfirm} data-testid="selector-confirm">
            <Check className="w-4 h-4 mr-1" />
            {isPt ? 'Confirmar' : 'Confirm'}{selected.size > 1 ? ` (${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
