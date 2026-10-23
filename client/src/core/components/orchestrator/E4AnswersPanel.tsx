/**
 * "O que ainda falta" — Encontro 4's questions, answered by the coordination.
 *
 * 22 Oct decision (JVP): pressing "Levar ao Encontro 4" opens this right after
 * the confirmation, so whoever skipped the organisation can put down what they
 * already know — from the visit, from a call. Everything is optional, and says
 * so: what is left blank, the organisation answers in its own Encontro 4. The
 * same form sits in Documentos for any organisation in Encontro 4, so "deixar
 * para depois" can also mean the coordination coming back after a call.
 *
 * The options are the chat's own (shared/e4-options.ts) and the answers land in
 * the fields the chat writes (POST …/e4-answers), so the chat does not ask
 * them; the page marks them "registrado pela coordenação" and the organisation
 * confirms them in Encontro 4's one check at the end.
 */
import type { E4Suggestion } from '@shared/e4-suggestions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASEMAPS } from '@/core/lib/basemaps';
import { Button } from '@/core/components/ui/button';
import { getSolution, NBS_SOLUTIONS } from '@shared/nbs-catalog';
import { SOLUTION_COSTS } from '@shared/w3-sizing';
import { WORRY_SUBTYPES } from '@shared/site-knowledge';
import { impactChips } from '@shared/e4-indicators';
import { BUILD, MAINTAIN, CONTRIBUTION, PARTNERS, COORD_KEYS, type CoordKey } from '@shared/e4-options';
import { VisitFiles } from './CboProfileSummary';

interface View {
  phase: number;
  skipped: boolean;
  closed: boolean;
  values: Record<CoordKey, string>;
  siteName: string;
  open: CoordKey[];
  byCoordination: CoordKey[];
  suggested: string[];
  /** What the organisation already told us that would fill a gap (prefill only). */
  suggestions?: E4Suggestion[];
}

interface Draft {
  solutionId?: string;
  size?: string;
  lat?: number;
  lng?: number;
  siteName?: string;
  problem?: string;
  context?: string;
  beneficiarios?: string;
  mudancas?: string[];
  quemFaz?: string;
  quemCuida?: string;
  contrib?: string[];
  contribText?: string;
  partners?: string[];
  partnersText?: string;
}

const POA: [number, number] = [-30.03, -51.2];

/** Click to place the pin; drag the map to look around. */
function PinPicker({ at, onPick }: { at: [number, number] | null; onPick: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer(BASEMAPS.light.url, { attribution: BASEMAPS.light.attribution, maxZoom: 19, maxNativeZoom: BASEMAPS.light.maxNativeZoom }).addTo(m);
    L.tileLayer(BASEMAPS.light.labelsUrl!, { maxZoom: 19, maxNativeZoom: BASEMAPS.light.maxNativeZoom }).addTo(m);
    m.setView(at ?? POA, at ? 16 : 11);
    m.on('click', (e: L.LeafletMouseEvent) => pick.current(e.latlng.lat, e.latlng.lng));
    map.current = m;
    // The drawer animates open: measure again once it has its width.
    const h = setTimeout(() => m.invalidateSize(), 250);
    return () => { clearTimeout(h); m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!at) { pin.current?.remove(); pin.current = null; return; }
    if (!pin.current) {
      pin.current = L.marker(at, {
        icon: L.divIcon({ className: '', html: '<div data-testid="e4a-pin" style="width:18px;height:18px;border-radius:50%;background:#0b3fb3;box-shadow:0 0 0 3px #fff,0 1px 4px rgba(0,0,0,.4)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      }).addTo(m);
    } else pin.current.setLatLng(at);
  }, [at]);
  return <div ref={el} style={{ height: 200 }} className="w-full overflow-hidden rounded-md border border-border/70" data-testid="e4a-map" />;
}

function Chips({ options, selected, onToggle, testid }: { options: Array<{ id: string; label: string }>; selected: string[]; onToggle: (id: string) => void; testid: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id} type="button" onClick={() => onToggle(o.id)} data-testid={`${testid}-${o.id}`} aria-pressed={on}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] ${on ? 'border-[#0b3fb3] bg-[#0b3fb3] text-white' : 'border-border bg-background hover:bg-muted/50'}`}
          >
            {on && <Check className="mr-0.5 inline h-3 w-3" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function E4AnswersPanel({
  cohortSlug, memberId, reloadKey, mode, onSaved, onLeave,
}: {
  cohortSlug: string;
  memberId: string;
  reloadKey: number;
  /** 'skip': right after "Levar ao Encontro 4", open. 'documents': a card in Documentos, folded. */
  mode: 'skip' | 'documents';
  onSaved?: () => void;
  /** "Deixar o resto para a organização" — skip mode only. */
  onLeave?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'pt';
  const base = `/api/cohort/${cohortSlug}/member/${memberId}`;
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [unfolded, setUnfolded] = useState(mode === 'skip');
  const [editing, setEditing] = useState<CoordKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${base}/e4-answers`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (!cancelled) setView(d); })
      .catch(() => { if (!cancelled) setView(null); });
    return () => { cancelled = true; };
  }, [base, reloadKey]);

  const set = (patch: Partial<Draft>) => { setDraft(d => ({ ...d, ...patch })); setSavedCount(null); };
  // A suggestion fills the form; the coordination still saves it (shared/e4-suggestions.ts).
  const useSuggestion = (x: E4Suggestion) => {
    const site = x.writes.intervention_site ?? {}, type = x.writes.intervention_type ?? {};
    if (x.key === 'lugar' && site._site_lat) { set({ lat: Number(site._site_lat), lng: Number(site._site_lng), ...(site.site_name ? { siteName: site.site_name } : {}) }); setEditing(e => e.includes('place') ? e : [...e, 'place']); }
    if (x.key === 'preocupacoes' && site.site_worry) { set({ problem: site.site_worry }); setEditing(e => e.includes('problem') ? e : [...e, 'problem']); }
    if (x.key === 'quem-faz' && type.construction_model) { set({ quemFaz: type.construction_model }); setEditing(e => e.includes('quem-faz-obra') ? e : [...e, 'quem-faz-obra']); }
    if (x.key === 'parceiros' && type.e4_partners) { set({ partnersText: type.e4_partners }); setEditing(e => e.includes('parceiros') ? e : [...e, 'parceiros']); }
  };
  const toggle = (list: string[] | undefined, id: string) => (list ?? []).includes(id) ? (list ?? []).filter(x => x !== id) : [...(list ?? []), id];

  const solId = draft.solutionId || view?.values.solution || '';
  const byUnits = !!solId && SOLUTION_COSTS[solId]?.basis === 'unit';
  const worry = draft.problem || view?.values.problem || '';
  const sizeNum = Number(draft.size || view?.values.size || 0) || undefined;
  const changeChips = useMemo(
    () => (solId ? impactChips(solId, worry, byUnits ? { units: sizeNum } : { areaM2: sizeNum }, lang) : []),
    [solId, worry, byUnits, sizeNum, lang],
  );
  const solutionOptions = useMemo(() => {
    const first = (view?.suggested ?? []).map(id => getSolution(id)).filter(Boolean) as typeof NBS_SOLUTIONS;
    const rest = NBS_SOLUTIONS.filter(s => !first.some(f => f.id === s.id));
    return { first, rest };
  }, [view?.suggested]);

  if (!view) return mode === 'skip' ? <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div> : null;
  if (view.phase < 4) return null;
  // Nothing left to answer and nothing the coordination answered: Documentos stays as it was.
  if (mode === 'documents' && !view.open.length && !view.byCoordination.length) return null;

  const label = (id: string) => { const s = getSolution(id); return s ? (lang === 'pt' ? s.pt.label : s.en.label) : id; };
  const opt = <T extends { pt: string; en: string }>(o: T) => (lang === 'pt' ? o.pt : o.en);
  const shown = (k: CoordKey): string => {
    const v = view.values[k];
    if (!v) return '';
    switch (k) {
      case 'solution': return label(v);
      case 'size': return byUnits ? v : `${Number(v).toLocaleString('pt-BR')} m²`;
      case 'place': return [view.siteName, t('cboView.e4aPinned', { defaultValue: 'marcado no mapa' })].filter(Boolean).join(' · ');
      case 'problem': return v.split(',').map(w => { const x = WORRY_SUBTYPES.find(y => y.id === w.trim()); return x ? opt(x) : w; }).join(', ');
      case 'mudancas': return v.split(',').map(id => changeChips.find(c => c.indicatorId === id)?.label ?? id).join('; ');
      case 'quem-faz-obra': { const b = BUILD.find(x => x.id === v); return b ? opt(b) : v; }
      case 'quem-cuida': { const m = MAINTAIN.find(x => x.id === v); return m ? opt(m) : v; }
      default: return v;
    }
  };
  const answered = (k: CoordKey) => !view.open.includes(k);
  const isOpen = (k: CoordKey) => !answered(k) || editing.includes(k);

  const TITLES: Record<CoordKey, string> = {
    solution: t('cboView.e4aSolution', { defaultValue: 'Qual solução vira a proposta inicial?' }),
    size: t('cboView.e4aSize', { defaultValue: 'Mais ou menos de que tamanho?' }),
    place: t('cboView.e4aPlace', { defaultValue: 'Onde fica o lugar?' }),
    problem: t('cboView.e4aProblem', { defaultValue: 'Qual é o problema principal que a solução enfrenta?' }),
    beneficiarios: t('cboView.e4aBenef', { defaultValue: 'Quem é atingido, e quantas famílias, mais ou menos?' }),
    mudancas: t('cboView.e4aChanges', { defaultValue: 'O que querem ver mudar em um ano?' }),
    'quem-faz-obra': t('cboView.e4aBuild', { defaultValue: 'Quem faria a obra?' }),
    'quem-cuida': t('cboView.e4aMaintain', { defaultValue: 'Depois da obra, quem cuida no dia a dia?' }),
    contrapartida: t('cboView.e4aContrib', { defaultValue: 'O que a organização já tem para colocar?' }),
    parceiros: t('cboView.e4aPartners', { defaultValue: 'Com quem já conversaram sobre o projeto?' }),
  };

  const field = (k: CoordKey) => {
    switch (k) {
      case 'solution': return (
        <select value={draft.solutionId ?? ''} onChange={e => set({ solutionId: e.target.value || undefined })} data-testid="e4a-input-solution"
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12.5px]">
          <option value="">{t('cboView.e4aNoAnswer', { defaultValue: '— deixar para a organização —' })}</option>
          {solutionOptions.first.length > 0 && (
            <optgroup label={t('cboView.e4aSuggested', { defaultValue: 'Da visita, do Encontro 3 ou pela preocupação deles' }) as string}>
              {solutionOptions.first.map(s => <option key={s.id} value={s.id}>{label(s.id)}</option>)}
            </optgroup>
          )}
          <optgroup label={t('cboView.e4aCatalogue', { defaultValue: 'Catálogo' }) as string}>
            {solutionOptions.rest.map(s => <option key={s.id} value={s.id}>{label(s.id)}</option>)}
          </optgroup>
        </select>
      );
      case 'size': return solId ? (
        <div className="flex items-center gap-2">
          <input type="number" min={1} inputMode="numeric" value={draft.size ?? ''} onChange={e => set({ size: e.target.value })} data-testid="e4a-input-size"
            className="h-8 w-28 rounded-md border border-border bg-background px-2 text-[12.5px]" />
          <span className="text-[12px] text-muted-foreground">{byUnits ? (lang === 'pt' ? SOLUTION_COSTS[solId]?.unitPluralPt : SOLUTION_COSTS[solId]?.unitPluralEn) : 'm²'}</span>
        </div>
      ) : <p className="text-[11.5px] italic text-muted-foreground">{t('cboView.e4aSizeNeedsSolution', { defaultValue: 'Depende da solução — escolha uma acima, ou deixe para a organização.' })}</p>;
      case 'place': {
        const cur = view.values.place ? view.values.place.split(',').map(Number) as [number, number] : null;
        const at: [number, number] | null = draft.lat != null && draft.lng != null ? [draft.lat, draft.lng] : cur;
        return (
          <div className="space-y-1.5">
            <PinPicker at={at} onPick={(lat, lng) => set({ lat, lng })} />
            <p className="text-[11px] text-muted-foreground">{t('cboView.e4aPlaceHint', { defaultValue: 'Toque no mapa para marcar o lugar.' })}</p>
            <input value={draft.siteName ?? ''} onChange={e => set({ siteName: e.target.value })} placeholder={t('cboView.e4aSiteName', { defaultValue: 'Nome do lugar (ex.: pátio da sede)' }) as string}
              data-testid="e4a-input-sitename" className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12.5px]" />
          </div>
        );
      }
      case 'problem': return (
        // Several worries can be on record (Encontro 2 is multi-select); a tap toggles one.
        <Chips testid="e4a-problem" selected={draft.problem ? draft.problem.split(',') : []} onToggle={id => { const cur = draft.problem ? draft.problem.split(',') : []; const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]; set({ problem: next.length ? next.join(',') : undefined }); }}
          options={WORRY_SUBTYPES.filter(w => w.id !== 'other').map(w => ({ id: w.id, label: opt(w) }))} />
      );
      case 'beneficiarios': return (
        <textarea rows={2} value={draft.beneficiarios ?? ''} onChange={e => set({ beneficiarios: e.target.value })} data-testid="e4a-input-beneficiarios"
          placeholder={t('cboView.e4aBenefPh', { defaultValue: 'ex.: umas 40 famílias da rua de baixo, e as crianças da creche' }) as string}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] leading-snug" />
      );
      case 'mudancas': return changeChips.length ? (
        <Chips testid="e4a-changes" selected={draft.mudancas ?? []} onToggle={id => set({ mudancas: toggle(draft.mudancas, id) })}
          options={changeChips.map(c => ({ id: c.indicatorId, label: c.label }))} />
      ) : <p className="text-[11.5px] italic text-muted-foreground">{t('cboView.e4aChangesNeedsSolution', { defaultValue: 'As opções dependem da solução — escolha uma acima, ou deixe para a organização.' })}</p>;
      case 'quem-faz-obra': return (
        <Chips testid="e4a-build" selected={draft.quemFaz ? [draft.quemFaz] : []} onToggle={id => set({ quemFaz: draft.quemFaz === id ? undefined : id })}
          options={BUILD.map(b => ({ id: b.id, label: opt(b) }))} />
      );
      case 'quem-cuida': return (
        <Chips testid="e4a-maintain" selected={draft.quemCuida ? [draft.quemCuida] : []} onToggle={id => set({ quemCuida: draft.quemCuida === id ? undefined : id })}
          options={MAINTAIN.map(m => ({ id: m.id, label: opt(m) }))} />
      );
      case 'contrapartida': return (
        <div className="space-y-1.5">
          <Chips testid="e4a-contrib" selected={draft.contrib ?? []} onToggle={id => set({ contrib: toggle(draft.contrib, id) })}
            options={CONTRIBUTION.map(c => ({ id: slug(c.pt), label: opt(c) }))} />
          <input value={draft.contribText ?? ''} onChange={e => set({ contribText: e.target.value })} data-testid="e4a-input-contrib"
            placeholder={t('cboView.e4aOther', { defaultValue: 'Outra coisa, nas palavras deles' }) as string}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12.5px]" />
        </div>
      );
      case 'parceiros': return (
        <div className="space-y-1.5">
          <Chips testid="e4a-partners" selected={draft.partners ?? []} onToggle={id => set({ partners: toggle(draft.partners, id) })}
            options={PARTNERS.map(p => ({ id: slug(p.pt), label: opt(p) }))} />
          <input value={draft.partnersText ?? ''} onChange={e => set({ partnersText: e.target.value })} data-testid="e4a-input-partners"
            placeholder={t('cboView.e4aPartnersPh', { defaultValue: 'Nomes, se souber' }) as string}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12.5px]" />
        </div>
      );
    }
  };

  const answers = () => {
    const contrib = [...CONTRIBUTION.filter(c => draft.contrib?.includes(slug(c.pt))).map(opt), draft.contribText?.trim()].filter(Boolean).join('; ');
    // Written as the chat writes a tapped partner: lower case, inside a sentence.
    const partners = [...PARTNERS.filter(p => draft.partners?.includes(slug(p.pt))).map(p => opt(p).toLowerCase()), draft.partnersText?.trim()].filter(Boolean).join('; ');
    return {
      ...(draft.solutionId ? { solutionId: draft.solutionId } : {}),
      ...(Number(draft.size) > 0 ? { size: Number(draft.size) } : {}),
      ...(draft.lat != null && draft.lng != null ? { lat: draft.lat, lng: draft.lng } : {}),
      ...(draft.siteName?.trim() ? { siteName: draft.siteName.trim() } : {}),
      ...(draft.problem ? { problem: draft.problem } : {}),
      ...(draft.context?.trim() ? { context: draft.context.trim() } : {}),
      ...(draft.beneficiarios?.trim() ? { beneficiarios: draft.beneficiarios.trim() } : {}),
      ...(draft.mudancas?.length ? { mudancas: draft.mudancas } : {}),
      ...(draft.quemFaz ? { quemFaz: draft.quemFaz } : {}),
      ...(draft.quemCuida ? { quemCuida: draft.quemCuida } : {}),
      ...(contrib ? { contrapartida: contrib } : {}),
      ...(partners ? { parceiros: partners } : {}),
    };
  };
  const pending = Object.keys(answers()).length;

  const save = async () => {
    setBusy(true); setFailed(false);
    const body = answers();
    const r = await fetch(`${base}/e4-answers`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: body }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setFailed(true); return; }
    const d = await r.json();
    setView(d);
    setDraft({});
    setEditing([]);
    setSavedCount(Object.keys(body).filter(k => k !== 'context' && k !== 'siteName').length);
    onSaved?.();
  };

  const openCount = view.open.length;
  return (
    <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${mode === 'skip' ? 'border-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-border/70 bg-card'}`} data-testid={`e4-answers-${mode}`}>
      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => mode === 'documents' && setUnfolded(u => !u)} data-testid="e4-answers-toggle">
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold">
            {t('cboView.e4aTitle', { defaultValue: 'O que ainda falta' })}{openCount ? ` (${openCount})` : ''}
          </span>
          <span className="block text-[11.5px] leading-snug text-muted-foreground" data-testid="e4-answers-optional">
            {t('cboView.e4aOptional', { defaultValue: 'Tudo aqui é opcional. Responda só o que já sabe — da visita, de uma conversa. O que ficar em branco, a organização responde no Encontro 4 dela, e o que vocês responderem aparece na proposta como registrado pela coordenação, para a organização conferir.' })}
          </span>
        </span>
        {mode === 'documents' && (unfolded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />)}
      </button>

      {unfolded && (
        <>
          {(view.suggestions ?? []).length > 0 && (
            <div className="rounded-md border border-sky-200 bg-sky-50/60 px-2.5 py-2 text-[12px] dark:border-sky-900 dark:bg-sky-950/30" data-testid="e4a-suggestions">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">{lang === 'pt' ? 'Do que a organização já contou' : 'From what the organisation already told us'}</span>
                <button type="button" className="text-[11.5px] font-medium text-sky-800 hover:underline dark:text-sky-300" onClick={() => (view.suggestions ?? []).forEach(useSuggestion)} data-testid="e4a-suggestions-all">
                  {lang === 'pt' ? 'Usar todas' : 'Use all'}
                </button>
              </div>
              <ul className="m-0 space-y-1 pl-0">
                {(view.suggestions ?? []).map(x => (
                  <li key={x.key} className="flex list-none items-start justify-between gap-2">
                    <span className="min-w-0">{lang === 'pt' ? x.pt : x.en}{x.confidence === 'medium' ? (lang === 'pt' ? ' (aproximado)' : ' (approximate)') : ''}<span className="block text-[10.5px] text-muted-foreground">{lang === 'pt' ? x.sourcePt : x.sourceEn}</span></span>
                    <button type="button" className="shrink-0 text-[11.5px] font-medium text-sky-800 hover:underline dark:text-sky-300" onClick={() => useSuggestion(x)} data-testid={`e4a-suggestion-${x.key}`}>{lang === 'pt' ? 'Usar' : 'Use'}</button>
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-1 text-[10.5px] text-muted-foreground">{lang === 'pt' ? '"Usar" só preenche o formulário — nada é salvo até "Salvar respostas".' : '"Use" only fills the form — nothing is saved until "Save answers".'}</p>
            </div>
          )}
          {COORD_KEYS.map(k => (
            <div key={k} className="border-t border-border/50 pt-2 space-y-1" data-testid={`e4a-item-${k}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12.5px] font-semibold">{TITLES[k]}</span>
                {!answered(k) && <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{t('cboView.e4aOptionalTag', { defaultValue: 'opcional' })}</span>}
                {view.byCoordination.includes(k) && <span className="text-[10.5px] text-amber-700">{t('cboView.e4aByCoord', { defaultValue: 'registrado pela coordenação' })}</span>}
              </div>
              {isOpen(k) ? field(k) : (
                <p className="flex items-baseline justify-between gap-2 text-[12px] text-muted-foreground" data-testid={`e4a-answered-${k}`}>
                  <span className="min-w-0">{shown(k) || t('cboView.e4aAnswered', { defaultValue: 'respondido' })}</span>
                  <button type="button" className="shrink-0 text-[11px] underline-offset-2 hover:underline" onClick={() => setEditing(e => [...e, k])} data-testid={`e4a-change-${k}`}>
                    {t('cboView.e4aChange', { defaultValue: 'Alterar' })}
                  </button>
                </p>
              )}
            </div>
          ))}

          {/* Not a question of Encontro 4's: the coordination's own context, read like any file. */}
          <div className="border-t border-border/50 pt-2 space-y-1.5" data-testid="e4a-item-context">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] font-semibold">{t('cboView.e4aContext', { defaultValue: 'Algo mais que a coordenação sabe?' })}</span>
              <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{t('cboView.e4aOptionalTag', { defaultValue: 'opcional' })}</span>
            </div>
            <textarea rows={2} value={draft.context ?? ''} onChange={e => set({ context: e.target.value })} data-testid="e4a-input-context"
              placeholder={t('cboView.e4aContextPh', { defaultValue: 'O que vocês viram ou ouviram sobre o lugar, o grupo, o que já fizeram. Entra em todas as leituras, como da coordenação.' }) as string}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] leading-snug" />
            <VisitFiles cohortSlug={cohortSlug} memberId={memberId} onChanged={onSaved}
              title={t('cboView.e4aFiles', { defaultValue: 'Arquivos da coordenação' }) as string}
              hint={t('cboView.e4aFilesHint', { defaultValue: 'Relatório, fotos, um croqui. Cada arquivo é lido e entra na proposta inicial e no pré-portfólio, como da coordenação.' }) as string} />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
            <Button size="sm" className="h-8 text-xs" disabled={busy || pending === 0} onClick={save} data-testid="e4-answers-save">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t('cboView.e4aSave', { defaultValue: 'Salvar respostas' })}
            </Button>
            {mode === 'skip' && onLeave && (
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={onLeave} data-testid="e4-answers-leave">
                {pending || savedCount
                  ? t('cboView.e4aLeaveRest', { defaultValue: 'Deixar o resto para a organização' })
                  : t('cboView.e4aLeaveAll', { defaultValue: 'Deixar tudo para a organização' })}
              </Button>
            )}
            {savedCount !== null && (
              <span className="text-[11.5px] text-emerald-700" data-testid="e4-answers-saved">
                {t('cboView.e4aSaved', { defaultValue: 'Salvo ✓ — o que ficou em branco, a organização responde no Encontro 4.' })}
              </span>
            )}
            {failed && <span className="text-[11.5px] text-destructive">{t('cboView.technicalNoteFailed', { defaultValue: 'Não salvou — tenta de novo' })}</span>}
          </div>
        </>
      )}
    </div>
  );
}
