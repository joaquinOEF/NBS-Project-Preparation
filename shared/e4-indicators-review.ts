// The indicator menu as a review sheet, in Portuguese — what Robson reads and
// corrects once, instead of reviewing every pre-note. Pure, so the spec can
// compare it to the committed copy.
import { NBS_SOLUTIONS } from './nbs-catalog';
import { INDICATORS, SOLUTION_INDICATORS, INDICATOR_MENU_REVIEW, indicatorMenu } from './e4-indicators';

const WHO = { organizacao: 'a organização', tecnico: 'técnico' } as const;
const KIND = { pessoas: 'Pessoas', entrega: 'Entrega', efeito: 'Efeito' } as const;
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');

export function reviewSheetMarkdown(): string {
  const out: string[] = [];
  out.push('# Indicadores da pré-nota — folha de revisão');
  out.push('');
  out.push('<!-- Gerado por scripts/e4-indicators-review.ts a partir de shared/e4-indicators.ts. Não editar à mão. -->');
  out.push('');
  out.push(
    'Cada pré-nota do Encontro 4 traz de 2 a 4 indicadores: **famílias atendidas**, **o que foi construído** ' +
      '(área ou unidades) e **um ou dois efeitos** que a própria organização escolhe na pergunta ' +
      '“O que vocês querem ver mudar?”. Esta folha é a lista inteira, por solução. Ela é revisada uma vez, ' +
      'aqui, e não nota por nota.',
  );
  out.push('');
  out.push(
    INDICATOR_MENU_REVIEW
      ? `**Revisado por ${INDICATOR_MENU_REVIEW.reviewedBy} em ${INDICATOR_MENU_REVIEW.on}.**`
      : '**Situação: ainda não revisado.** Até a revisão, as notas imprimem os indicadores como “proposta técnica, a revisar”.',
  );
  out.push('');
  out.push('Para revisar: risque o que não serve, escreva ao lado o que falta, e marque cada solução como ok.');
  out.push('');
  out.push('## Os indicadores');
  out.push('');
  out.push('| Indicador | Tipo | Unidade | Quem mede | Como | Linha de base |');
  out.push('|---|---|---|---|---|---|');
  for (const d of Object.values(INDICATORS)) {
    out.push(`| ${cell(d.pt.label)} | ${KIND[d.kind]} | ${cell(d.pt.unit)} | ${WHO[d.measurer]} | ${cell(d.pt.how)} | ${cell(d.pt.baseline)} |`);
  }
  out.push('');
  out.push('## Por solução');
  out.push('');
  out.push('Efeitos = as opções da pergunta “O que vocês querem ver mudar?”. Pessoas e entrega entram sempre.');
  out.push('');
  out.push('| Solução | Entrega | Efeitos que a organização pode escolher | Ok? |');
  out.push('|---|---|---|---|');
  for (const s of NBS_SOLUTIONS) {
    const menu = indicatorMenu(s.id, { areaM2: 100, units: 10 }, 'pt');
    const delivery = menu.filter(i => i.kind === 'entrega').map(i => i.label).join(' · ') || '—';
    const effects = SOLUTION_INDICATORS[s.id].effects.map(id => INDICATORS[id].pt.label).join(' · ');
    out.push(`| ${cell(s.pt.label)} | ${cell(delivery)} | ${cell(effects)} | ☐ |`);
  }
  out.push('');
  return out.join('\n');
}
