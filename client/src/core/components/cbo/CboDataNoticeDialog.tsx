// CboDataNoticeDialog — the plain-language "Seus dados" answer to the
// extraction fear Antonia surfaced at the 2026-07-16 biweekly: orgs have seen
// outsiders collect their data and deliver nothing, and were asking "what are
// you going to do with that?" and "does the platform stop in December?".
// This is the short honest version, always reachable from the chat header.
// Since 23 Oct 2026 the full term (shared/data-term.ts) is accepted in the
// platform, and this dialog links to it and shows the organisation's record.
//
// Copy rule: nothing here may say more or less than the term. Each section
// below is a summary of the term's own section; when the term gets a new
// version, re-read these against it (e2e/data-term.spec.ts checks the names).

import { ExternalLink, ShieldCheck } from 'lucide-react';
import { DATA_TERM, type DataTermStatus } from '@shared/data-term';
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
        p: 'Você e as equipes que apoiam o programa (Vila Flores, Open Earth Foundation, Pyxera Global e Bankers without Boundaries). As outras organizações da rede não veem. Nada é vendido, e o projeto de vocês só é mostrado a um financiador com o seu consentimento por escrito.',
      },
      {
        h: 'Pra que usamos',
        p: 'Pra montar o projeto de vocês, enxergar sinergias com outros projetos da rede e preparar uma captação conjunta. Pra financiadores e parceiros, só números da rede como um todo.',
      },
      {
        h: 'Até quando',
        p: 'O acesso está garantido até pelo menos 31 de dezembro de 2026. Se precisar terminar antes, vocês serão avisadas com pelo menos um mês de antecedência e poderão exportar tudo.',
      },
      {
        h: 'Seus direitos',
        p: 'A qualquer momento você pode baixar tudo (botão de exportar aqui em cima) ou pedir à equipe do Vila Flores pra corrigir ou apagar os dados da sua organização. O projeto continua sendo de vocês.',
      },
    ],
    footer: 'Esta é a versão curta.',
    readFull: 'Ler o termo completo',
    acceptedBy: 'Aceito em {date} por {name}',
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
        p: 'You and the teams supporting the programme (Vila Flores, Open Earth Foundation, Pyxera Global and Bankers without Boundaries). Other organisations in the network do not see it. Nothing is sold, and your project is only shown to a funder with your written consent.',
      },
      {
        h: 'What we use it for',
        p: 'To build your project, spot synergies with other projects in the network and prepare joint fundraising. Funders and partners only get figures about the network as a whole.',
      },
      {
        h: 'For how long',
        p: 'Access is guaranteed until at least 31 December 2026. If it ever has to end sooner, you will be told at least a month in advance and can export everything.',
      },
      {
        h: 'Your rights',
        p: 'At any time you can download everything (the export button above) or ask the Vila Flores team to correct or delete your organization’s data. The project stays yours.',
      },
    ],
    footer: 'This is the short version.',
    readFull: 'Read the full term (Portuguese)',
    acceptedBy: 'Accepted on {date} by {name}',
  },
};

export function CboDataNoticeDialog({
  open,
  onOpenChange,
  lang,
  accepted = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: 'pt' | 'en';
  /** The organisation's acceptance of the current version, when there is one. */
  accepted?: DataTermStatus['accepted'];
}) {
  const s = STRINGS[lang];
  // The test seam reports acceptance without a record (empty name) — say nothing then.
  const record = accepted?.name
    ? s.acceptedBy
      .replace('{date}', new Date(accepted.at).toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-GB'))
      .replace('{name}', accepted.name)
    : null;
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
          <div className='space-y-1 border-t border-border pt-2 text-[12px] text-muted-foreground'>
            <p className='m-0'>
              {s.footer}{' '}
              <a href='/termo-de-dados' target='_blank' rel='noreferrer'
                className='inline-flex items-center gap-1 font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400'
                data-testid='cbo-data-notice-full-term'>
                {s.readFull} (v{DATA_TERM.version})<ExternalLink className='h-3 w-3' />
              </a>
            </p>
            {record && <p className='m-0' data-testid='cbo-data-notice-accepted'>{record}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
