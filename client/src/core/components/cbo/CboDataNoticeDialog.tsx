// CboDataNoticeDialog — the plain-language "Seus dados" answer to the
// extraction fear Antonia surfaced at the 2026-07-16 biweekly: orgs have seen
// outsiders collect their data and deliver nothing, and were asking "what are
// you going to do with that?" and "does the platform stop in December?".
// This is the short honest version, always reachable from the chat header;
// the full data terms are being drafted with the coordination (Ana) and will
// replace the closing line's promise when confirmed.
//
// Copy rule: nothing here may promise what the coalition hasn't agreed to —
// the "até quando" wording was written to be true under the current plan and
// must be re-checked when the terms doc lands.

import { ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/core/components/ui/dialog';

const STRINGS = {
  pt: {
    title: 'Seus dados são seus',
    sections: [
      {
        h: 'O que acontece com o que você escreve aqui?',
        p: 'Vira o perfil e o projeto da SUA organização — material de trabalho de vocês e da coordenação da rede. Não é pesquisa sobre vocês.',
      },
      {
        h: 'Quem vê',
        p: 'Você e a equipe de coordenação da rede (Vila Flores, OEF e Pyxera Global). Nada é vendido nem compartilhado fora da rede sem combinar com vocês.',
      },
      {
        h: 'Pra que usamos',
        p: 'Pra montar o projeto de vocês, enxergar projetos parecidos dentro da rede e preparar propostas de financiamento com esses dados.',
      },
      {
        h: 'Até quando',
        p: 'A plataforma acompanha a preparação dos projetos — o trabalho não termina em dezembro. Se algo for mudar no acesso, vocês serão avisadas com antecedência.',
      },
      {
        h: 'Seus direitos',
        p: 'A qualquer momento você pode baixar tudo (botão de exportar aqui em cima) ou pedir pra coordenação corrigir ou apagar os dados da sua organização.',
      },
    ],
    footer:
      'Um termo completo está sendo preparado junto com a coordenação — esta é a versão curta e honesta.',
  },
  en: {
    title: 'Your data is yours',
    sections: [
      {
        h: 'What happens with what you write here?',
        p: "It becomes YOUR organization's profile and project — working material for you and the network's coordination. It is not research about you.",
      },
      {
        h: 'Who sees it',
        p: 'You and the network coordination team (Vila Flores, OEF and Pyxera Global). Nothing is sold or shared outside the network without agreeing with you first.',
      },
      {
        h: 'What we use it for',
        p: 'To build your project, spot similar projects across the network, and prepare funding proposals with this data.',
      },
      {
        h: 'For how long',
        p: 'The platform follows the projects through preparation — the work does not end in December. If access is ever going to change, you will be told in advance.',
      },
      {
        h: 'Your rights',
        p: 'At any time you can download everything (the export button above) or ask the coordination to correct or delete your organization’s data.',
      },
    ],
    footer:
      'A full terms document is being prepared with the coordination — this is the short, honest version.',
  },
};

export function CboDataNoticeDialog({
  open,
  onOpenChange,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: 'pt' | 'en';
}) {
  const s = STRINGS[lang];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='max-h-[85vh] max-w-md overflow-y-auto'
        data-testid='cbo-data-notice-dialog'
      >
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <ShieldCheck className='h-5 w-5 text-emerald-600' />
            {s.title}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          {s.sections.map(sec => (
            <section key={sec.h} className='space-y-0.5'>
              <h4 className='m-0 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground'>
                {sec.h}
              </h4>
              <p className='m-0 text-[13.5px] leading-relaxed'>{sec.p}</p>
            </section>
          ))}
          <p className='m-0 border-t border-border pt-2 text-[11px] italic text-muted-foreground'>
            {s.footer}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
