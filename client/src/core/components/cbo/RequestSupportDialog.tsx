// RequestSupport — async escalation form available to every CBO across all
// encontros. Surfaces as a button in the chat header (more prominent for the
// needs-help path). On submit, writes a SupportRequest to cohort_members and
// notifies the orchestrator (visible as a pending-count chip on their card).
//
// Spec: knowledge/runs/2026-05-15-encontros-curriculum/_paths/two-path-triage.md

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/components/ui/dialog';
import { Button } from '@/core/components/ui/button';
import { Textarea } from '@/core/components/ui/textarea';
import { Users, HelpCircle, Network, Wallet, Loader2 } from 'lucide-react';
import type { SupportRequestType } from '@shared/cohort-schema';

type OptionDef = {
  value: SupportRequestType;
  icon: React.ComponentType<{ className?: string }>;
  pt: { label: string; hint: string };
  en: { label: string; hint: string };
};

const OPTIONS: OptionDef[] = [
  {
    value: 'coordinator-chat',
    icon: Users,
    pt: { label: 'Conversa com a coordenadora', hint: 'Falar com a coordenadora sobre dúvidas, decisões ou bloqueios.' },
    en: { label: 'Chat with the coordinator', hint: 'Talk to your coordinator about questions, decisions, or blockers.' },
  },
  {
    value: 'oef-technical',
    icon: HelpCircle,
    pt: { label: 'Pergunta técnica pra equipe OEF', hint: 'Algo técnico sobre SbN, impacto, dimensionamento.' },
    en: { label: 'Technical question for OEF', hint: 'Something technical about NBS, impact, sizing.' },
  },
  {
    value: 'cbo-connection',
    icon: Network,
    pt: { label: 'Conexão com outro CBO', hint: 'Conhecer alguém que já fez algo parecido no Brasil.' },
    en: { label: 'Connect with another CBO', hint: 'Meet someone who has done something similar in Brazil.' },
  },
  {
    value: 'finance-partners',
    icon: Wallet,
    pt: { label: 'Finanças / parceiros', hint: 'Dúvidas sobre financiamento, editais, parceiros locais.' },
    en: { label: 'Finance / partners', hint: 'Funding, grants, local partners.' },
  },
];

export function RequestSupportDialog({
  open,
  onOpenChange,
  memberSlug,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The CBO's slug — submit endpoint is /api/cbo-member/:slug/support-request */
  memberSlug: string;
  /** Called after a successful POST so the parent can refresh state / toast. */
  onSubmitted?: (req: { id: string; type: SupportRequestType }) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const [selectedType, setSelectedType] = useState<SupportRequestType | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; type: SupportRequestType } | null>(null);

  const reset = () => {
    setSelectedType(null);
    setMessage('');
    setSubmitting(false);
    setSubmitted(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    if (!selectedType) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/cbo-member/${memberSlug}/support-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, message: message.trim() || undefined }),
      });
      if (!r.ok) throw new Error('submit failed');
      const data = await r.json();
      setSubmitted({ id: data.entry.id, type: data.entry.type });
      onSubmitted?.({ id: data.entry.id, type: data.entry.type });
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('cbo.support.submittedTitle', { defaultValue: 'Pedido enviado' })}</DialogTitle>
              <DialogDescription className="pt-1.5">
                {t('cbo.support.submittedBody', {
                  defaultValue: 'A coordenadora vai entrar em contato em até 2 dias úteis. Você pode continuar trabalhando aqui — quando ela responder, você vai ver no chat.',
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button onClick={() => handleOpenChange(false)} className="bg-emerald-600 hover:bg-emerald-700">
                {t('cbo.support.close', { defaultValue: 'Fechar' })}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('cbo.support.title', { defaultValue: 'Pedir apoio' })}</DialogTitle>
              <DialogDescription className="pt-1.5">
                {t('cbo.support.lead', {
                  defaultValue: 'Sem pressa. Conta o que você precisa — a coordenadora responde em até 2 dias úteis.',
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 mt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t('cbo.support.typeLabel', { defaultValue: 'Tipo de apoio' })}
              </p>
              <div className="space-y-1.5">
                {OPTIONS.map(opt => {
                  const isActive = selectedType === opt.value;
                  const Icon = opt.icon;
                  const copy = opt[lang];
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedType(opt.value)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3 ${
                        isActive
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-500'
                          : 'border-foreground/10 hover:border-foreground/20 hover:bg-muted/50'
                      }`}
                      data-testid={`support-option-${opt.value}`}
                    >
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{copy.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{copy.hint}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5 mt-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t('cbo.support.messageLabel', { defaultValue: 'Mensagem (opcional)' })}
              </p>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('cbo.support.messagePlaceholder', { defaultValue: 'Conta um pouco mais se quiser…' }) as string}
                rows={3}
                maxLength={2000}
                className="resize-none text-sm"
              />
            </div>

            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
                {t('cbo.support.cancel', { defaultValue: 'Cancelar' })}
              </Button>
              <Button
                onClick={submit}
                disabled={!selectedType || submitting}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="support-submit"
              >
                {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {t('cbo.support.submit', { defaultValue: 'Enviar pedido' })}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
