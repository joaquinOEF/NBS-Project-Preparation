// CommunityAnchoringComposer — inline chat form for E2 Beat 3c.
// 3 short free-text fields (lead / volunteers / beneficiaries) + chip
// multi-select for engagement methods. Replaces the fallback sequential
// ask_user calls in the E2 skill markdown.
//
// On confirm, posts a structured chat message that the agent parses to fill:
//   community_anchoring_lead, community_volunteers, community_beneficiaries,
//   community_engagement_methods[]

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/core/components/ui/textarea';
import { Check } from 'lucide-react';

export type EngagementMethod =
  | 'assembleias'
  | 'oficinas'
  | 'mutiroes'
  | 'conversas'
  | 'outras';

const METHODS: Array<{
  id: EngagementMethod;
  pt: { label: string; hint: string };
  en: { label: string; hint: string };
}> = [
  {
    id: 'assembleias',
    pt: { label: 'Assembleias / reuniões', hint: 'Encontros regulares' },
    en: { label: 'Assemblies / meetings', hint: 'Regular gatherings' },
  },
  {
    id: 'oficinas',
    pt: { label: 'Oficinas educativas', hint: 'Formação, capacitação' },
    en: { label: 'Workshops', hint: 'Education, training' },
  },
  {
    id: 'mutiroes',
    pt: { label: 'Mutirões', hint: 'Trabalho voluntário coletivo' },
    en: { label: 'Volunteer work', hint: 'Collective voluntary work' },
  },
  {
    id: 'conversas',
    pt: { label: 'Conversas informais', hint: 'Boca a boca, vizinhança' },
    en: { label: 'Informal conversations', hint: 'Word of mouth, neighbors' },
  },
  {
    id: 'outras',
    pt: { label: 'Outras formas', hint: '' },
    en: { label: 'Other ways', hint: '' },
  },
];

export type CommunityAnchoringResult = {
  lead: string;
  volunteers: string;
  beneficiaries: string;
  methods: EngagementMethod[];
};

export function CommunityAnchoringComposer({
  prompt,
  onConfirm,
}: {
  prompt: string;
  onConfirm: (result: CommunityAnchoringResult) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const [lead, setLead] = useState('');
  const [volunteers, setVolunteers] = useState('');
  const [beneficiaries, setBeneficiaries] = useState('');
  const [methods, setMethods] = useState<Set<EngagementMethod>>(new Set());

  const toggleMethod = (id: EngagementMethod) => {
    setMethods(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Confirm needs at least the lead OR the beneficiaries — that's the minimum
  // useful signal. Methods alone don't tell us who's anchored.
  const canConfirm = lead.trim().length > 0 || beneficiaries.trim().length > 0;

  return (
    <div className="rounded-lg border border-foreground/10 bg-card p-4 space-y-3" data-testid="community-anchoring">
      <p className="text-sm font-medium leading-snug">{prompt}</p>

      <div className="space-y-2.5">
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t('cbo.anchoring.leadLabel', { defaultValue: 'Lideranças' })}
          </label>
          <Textarea
            value={lead}
            onChange={(e) => setLead(e.target.value)}
            placeholder={t('cbo.anchoring.leadPlaceholder', {
              defaultValue: 'Quem puxa o trabalho? Ex: "Sandra, D. Maria, eu mesma"',
            }) as string}
            rows={1}
            maxLength={400}
            className="text-sm resize-none min-h-[36px]"
            data-testid="anchoring-lead"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t('cbo.anchoring.volunteersLabel', { defaultValue: 'Voluntários' })}
          </label>
          <Textarea
            value={volunteers}
            onChange={(e) => setVolunteers(e.target.value)}
            placeholder={t('cbo.anchoring.volunteersPlaceholder', {
              defaultValue: 'Quantas pessoas, com que frequência? Ex: "~8 voluntárias, mutirão mensal"',
            }) as string}
            rows={1}
            maxLength={400}
            className="text-sm resize-none min-h-[36px]"
            data-testid="anchoring-volunteers"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t('cbo.anchoring.beneficiariesLabel', { defaultValue: 'Moradores diretamente atendidos' })}
          </label>
          <Textarea
            value={beneficiaries}
            onChange={(e) => setBeneficiaries(e.target.value)}
            placeholder={t('cbo.anchoring.beneficiariesPlaceholder', {
              defaultValue: 'Quem é beneficiado? Ex: "12 famílias na Rua Flores, ~40 crianças"',
            }) as string}
            rows={1}
            maxLength={400}
            className="text-sm resize-none min-h-[36px]"
            data-testid="anchoring-beneficiaries"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          {t('cbo.anchoring.methodsLabel', { defaultValue: 'Como vocês se organizam' })}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map(m => {
            const isOn = methods.has(m.id);
            const copy = m[lang];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMethod(m.id)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  isOn
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                    : 'border-foreground/15 text-foreground/70 hover:border-foreground/30 hover:bg-muted/50'
                }`}
                title={copy.hint || undefined}
                data-testid={`anchoring-method-${m.id}`}
              >
                {copy.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={() => onConfirm({
            lead: lead.trim(),
            volunteers: volunteers.trim(),
            beneficiaries: beneficiaries.trim(),
            methods: Array.from(methods),
          })}
          disabled={!canConfirm}
          className={`text-sm font-medium px-4 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors ${
            canConfirm
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
          data-testid="anchoring-confirm"
        >
          <Check className="w-3.5 h-3.5" />
          {t('cbo.anchoring.confirm', { defaultValue: 'Confirmar' })}
        </button>
      </div>
    </div>
  );
}
