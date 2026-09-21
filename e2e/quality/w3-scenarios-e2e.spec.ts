import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { TestApi } from '../helpers/testApi';

// ENCONTRO 3, END TO END, AS THREE REAL ORGANISATIONS — with screenshots.
//
// Opt-in (W3_SCENARIOS=1): it wants the file-reading passes LIVE, so run it
// against a dev server started with the real model key and the fake CHAT model
// (the flow deterministic, the reading real). docs/e2e-testing.md.
//
// The driver never guesses where it is: it reads the question the SERVER has on
// record (`_pending_asks_json`, the answer contract) and answers it in character.
//   A · Caldas Junior — a school with seven files (the E3 kit, minus the README)
//   B · Vila Nova     — one PDF and one photo, no site chosen yet (the square)
//   C · Encosta Viva  — nothing to share, a slope, in a hurry, "não sei" a lot

const SHOTS = process.env.W3_SHOTS ?? path.join(os.homedir(), 'Downloads', 'cougar-e3-scenarios');
const KIT = path.join(os.homedir(), 'Downloads', 'cougar-kit-teste-e3-caldas-junior');
const W2KIT = path.join(process.cwd(), 'docs', 'w2-test-kit');

type Act = { tap: string } | { type: string } | { upload: string[] } | { chooseSolution: string } | { stop: true };
interface Scenario {
  key: string;
  title: string;
  seed: Array<[string, string, string]>;
  files: string[];
  criteria: string[];
  tests: string[];
  who: Record<string, string>;
  hardest: Record<string, string | { own: string }>;
  react: Record<string, string>;
  digAnswers: string[];
  policy?: (q: string, labels: string[], ctx: Ctx) => Act | null;
}
interface Ctx { tested: string[]; current: string | null; digIdx: number; step: number; shotCards: string[] }

const S = (rows: Array<[string, string, string]>) => rows.map(([sectionId, field, value]) => ({ sectionId, field, value }));

const SCENARIOS: Scenario[] = [
  {
    key: 'A-caldas-junior-7-arquivos',
    title: 'Caldas Junior — escola, 7 arquivos',
    seed: [
      ['org_profile', 'org_name', 'APM Colégio Caldas Junior'], ['org_profile', 'contact_name', 'Denise Moura'],
      ['intervention_site', 'site_name', 'Pátio dos fundos do Colégio Caldas Junior'], ['intervention_site', 'bairro', 'Partenon'],
      ['intervention_site', '_site_lat', '-30.0582'], ['intervention_site', '_site_lng', '-51.1598'],
      ['intervention_site', 'current_use', 'paved'], ['intervention_site', 'land_tenure', 'formal-agreement'],
      ['intervention_site', 'site_worry', 'heat, enxurrada'], ['intervention_site', 'nbs_interest', 'verde-urbano, aguas-pluviais'],
      ['intervention_site', 'site_story', 'O pátio é todo cimentado e no verão ninguém fica lá fora. Quando chove forte a água desce da quadra e fica parada dois, três dias no canto dos fundos.'],
      ['intervention_site', 'site_knowledge_depth', 'strong'], ['intervention_site', 'site_area_m2', '2900'], ['intervention_site', 'site_area_source', 'drawn'],
    ],
    files: ['01-foto-aerea-colegio-caldas-junior.jpg', '02-croqui-do-patio.png', '03-relatorio-visita-tecnica-2026-09-18.pdf', '04-orcamento-piso-drenante-2025.pdf', '05-ata-reuniao-pais-e-mestres-2026-08-27.pdf', '06-cardapio-cantina-setembro.pdf', '07-observacoes-da-direcao.txt'].map(f => path.join(KIT, f)),
    criteria: ['Dar pra fazer com a nossa gente', 'Resolver mais o problema'],
    tests: ['Escola verde', 'Jardins de chuva', 'Teto verde'],
    who: { 'Escola verde': 'A gente, em mutirão', 'Jardins de chuva': 'A gente, com um parceiro técnico', 'Teto verde': 'Teria que contratar', '*': 'A gente, com um parceiro técnico' },
    hardest: { 'Escola verde': { own: 'A direção só libera obra nas férias de janeiro — é pouco tempo pra fazer tudo.' }, 'Jardins de chuva': 'O estudo técnico', 'Teto verde': 'O custo', '*': 'Cuidar depois' },
    react: { 'Escola verde': 'Faz sentido pra gente', 'Jardins de chuva': 'Faz sentido pra gente', 'Teto verde': 'Não é pra gente', '*': 'Ainda não sabemos' },
    digAnswers: ['O vizinho dos fundos é um prédio de três andares, e o muro tem uns quatro metros — a água do telhado dele cai no nosso canto.', 'São umas oito turmas no recreio da manhã e seis à tarde.'],
  },
  {
    key: 'B-vila-nova-1-pdf',
    title: 'Vila Nova — associação cultural, 1 PDF + 1 foto',
    seed: [
      ['org_profile', 'org_name', 'Associação Cultural Vila Nova'], ['org_profile', 'contact_name', 'Rita Camargo'],
      ['intervention_site', 'site_name', 'Praça em frente à escola'], ['intervention_site', 'bairro', 'Vila Nova'],
      ['intervention_site', '_site_lat', '-30.1196'], ['intervention_site', '_site_lng', '-51.2067'],
      ['intervention_site', 'current_use', 'paved'], ['intervention_site', 'land_tenure', 'public-informal'],
      ['intervention_site', 'site_worry', 'heat'], ['intervention_site', 'nbs_interest', 'verde-urbano'],
      ['intervention_site', 'site_story', 'A praça é cimentada, sem uma árvore. De tarde as crianças da escola não conseguem ficar ali, o chão queima.'],
      ['intervention_site', 'site_knowledge_depth', 'partial'],
    ],
    files: [path.join(W2KIT, 'org-3-vila-nova', 'nota-area-de-atuacao-vila-nova.pdf'), path.join(W2KIT, 'org-3-vila-nova', 'fotos', '01-a-praca-hoje.jpg')],
    criteria: ['Resolver mais o problema'],
    tests: ['Corredores verdes', 'Parque naturalizado'],
    who: { '*': 'A gente, com um parceiro técnico' },
    hardest: { '*': 'Conseguir a autorização' },
    react: { 'Corredores verdes': 'Faz sentido pra gente', '*': 'Ainda não sabemos' },
    digAnswers: ['A praça é da prefeitura; a escola usa no recreio e a feira de sábado ocupa metade dela.', 'Ninguém rega hoje — a associação teria que organizar isso.'],
  },
  {
    key: 'C-encosta-viva-sem-arquivos',
    title: 'Encosta Viva — coletivo informal, nada pra mandar',
    seed: [
      ['org_profile', 'org_name', 'Coletivo Encosta Viva'], ['org_profile', 'contact_name', 'Jeferson Rocha'],
      ['intervention_site', 'site_name', 'Barranco atrás das últimas casas da rua'], ['intervention_site', 'bairro', 'Morro da Cruz'],
      ['intervention_site', '_site_lat', '-30.0632'], ['intervention_site', '_site_lng', '-51.1771'],
      ['intervention_site', 'current_use', 'vegetated'], ['intervention_site', 'land_tenure', 'public-informal'],
      ['intervention_site', 'site_worry', 'landslide'], ['intervention_site', 'nbs_interest', 'encostas-e-solo'],
      ['intervention_site', 'site_knowledge_depth', 'thin'],
    ],
    files: [],
    criteria: ['Custar pouco', 'Depender de pouca autorização'],
    tests: ['Grade viva', 'Muro de arrimo verde'],
    who: { '*': 'A gente, em mutirão', 'Muro de arrimo verde': 'Hoje ninguém — teria que achar' },
    hardest: { '*': 'O custo' },
    react: { 'Grade viva': 'Faz sentido pra gente', 'Muro de arrimo verde': 'Não é pra gente', '*': 'Ainda não sabemos' },
    digAnswers: [],
  },
];

async function pending(request: APIRequestContext, cboId: string): Promise<{ question: string; labels: string[]; actions: Record<string, string> } | null> {
  const j = await (await request.get(`/api/cbo/${cboId}`)).json();
  const f = (j.state ?? j).sections?.intervention_type?.fields ?? {};
  try {
    const p = JSON.parse(f._pending_asks_json?.value || '{}');
    const a = p.asks?.[p.asks.length - 1];
    if (!a) return null;
    return { question: a.question, labels: a.options.map((o: any) => o.label), actions: Object.fromEntries(a.options.map((o: any) => [o.label, o.action ?? ''])) };
  } catch { return null; }
}

async function idle(page: Page, settle = 900) {
  await expect.poll(async () => page.evaluate(async (ms) => {
    const el = document.querySelector('[data-testid="cbo-stream-status"]');
    const quiet = () => el?.getAttribute('data-streaming') === 'false';
    if (!quiet()) return false;
    await new Promise(r => setTimeout(r, ms));
    return quiet();
  }, settle), { timeout: 150_000, intervals: [400] }).toBe(true);
}

function decide(sc: Scenario, q: string, labels: string[], ctx: Ctx): Act {
  const has = (l: string) => labels.includes(l);
  const first = (re: RegExp) => labels.find(l => re.test(l));
  const cur = ctx.current ?? '*';
  const pick = <T,>(m: Record<string, T>) => m[cur] ?? m['*'];

  if (q === 'Confere?') return { tap: 'É isso ✓' };
  if (q === 'Falta mandar alguma coisa?') return sc.files.length ? { upload: sc.files } : { tap: 'Seguir sem' };
  if (q === 'Tem mais algum pra mandar?') return { tap: 'Pronto, pode seguir' };
  if (q === 'Qual delas pesa mais no dia a dia?') return { tap: first(/^🌡️|Calor/) ?? labels[0] };
  if (/O que pesa mais\?/.test(q)) return { tap: sc.criteria[0] };
  if (/Mais uma coisa que pesa\?/.test(q)) return { tap: sc.criteria[1] && has(sc.criteria[1]) ? sc.criteria[1] : 'Pronto, é isso' };
  if (/testar (primeiro|agora)\?/.test(q)) {
    const want = sc.tests.find(t => !ctx.tested.includes(t));
    if (!want) return { tap: 'Ver todas as soluções' };
    ctx.current = want;
    return has(want) ? { tap: want } : { chooseSolution: want };
  }
  if (q === 'Qual delas?') { const want = sc.tests.find(t => !ctx.tested.includes(t))!; ctx.current = want; return has(want) ? { tap: want } : { tap: labels[0] }; }
  if (q === 'Querem testar antes de comparar?') {
    const offered = labels.find(l => l !== 'Ver a comparação');
    if (sc.key.startsWith('A') && offered && !ctx.tested.includes(offered)) { ctx.current = offered; sc.tests.push(offered); return { tap: offered }; }
    return { tap: 'Ver a comparação' };
  }
  if (q === 'Ainda é esse o tamanho?' || q === 'Quer marcar agora?' || q === 'Como prefere?') {
    const roof = first(/^Usar .* m² — .*(telhado|laje|cobertura)/i);
    const ground = first(/^Usar .* m² — /);
    if (cur === 'Teto verde' && roof) return { tap: roof };
    if (ground && cur !== 'Teto verde') return { tap: ground };
    if (has('Confere ✓') && cur !== 'Teto verde') return { tap: 'Confere ✓' };
    if (sc.key.startsWith('C')) return { tap: first(/não sei/i) ?? labels[labels.length - 1] };
    return { type: cur === 'Teto verde' ? 'uns 20 por 15 metros de laje' : 'uns 30 por 25 metros' };
  }
  if (/^(Quantos|Quantas) /.test(q)) return { tap: sc.key.startsWith('C') ? (first(/não sei/i) ?? labels[0]) : (labels.find(l => /^\d+$/.test(l) && +l > 1) ?? labels[0]) };
  if (q === 'Vocês já têm esse estudo?') return { tap: 'Sim, já temos esse estudo' };
  if (/quem faria\?/.test(q)) return { tap: pick(sc.who) };
  if (/o que mais pega/.test(q)) {
    const h = pick(sc.hardest);
    if (typeof h === 'object') return { type: h.own };
    return { tap: has(h) ? h : (first(/custo/i) ?? labels[0]) };
  }
  if (q === 'Vendo isso, o que vocês acham?') { if (ctx.current) ctx.tested.push(ctx.current); return { tap: pick(sc.react) }; }
  if (q === 'Quando quiser:') {
    const a = sc.digAnswers[ctx.digIdx++];
    return a ? { type: a } : { tap: 'Prefiro pular' };
  }
  if (q === 'E agora?') {
    if (has('Fechar o Encontro 3 ✓')) return { stop: true };
    return ctx.tested.length < sc.tests.length ? { tap: 'Testar outra solução' } : { tap: 'Ver a comparação' };
  }
  // A solution's own decisive-detail question, a rough size, anything else: in character.
  if (sc.key.startsWith('C')) return { tap: first(/não sei|ainda não/i) ?? labels[0] };
  return { tap: labels.find(l => !/não sei|ainda não|ver todas/i.test(l)) ?? labels[0] };
}

test.describe('Encontro 3 end to end — three organisations', () => {
  test.skip(!process.env.W3_SCENARIOS, 'opt-in: W3_SCENARIOS=1 against a dev server with the live model key');
  test.use({ viewport: { width: 1360, height: 960 }, locale: 'pt-BR' });

  for (const sc of SCENARIOS) {
    test(sc.title, async ({ page, request }) => {
      test.setTimeout(20 * 60_000);
      const dir = path.join(SHOTS, sc.key);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const log: string[] = [];
      const api = new TestApi(request);
      expect((await api.ping()).fakeModel).toBe(true);

      await page.goto('/cbo-profile');
      const marker = page.getByTestId('cbo-stream-status');
      await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
      const cboId = (await marker.getAttribute('data-cbo-id'))!;
      await api.seedState(cboId, { phase: 3, language: 'pt', sections: S(sc.seed) });
      await page.reload();
      await expect(marker).toHaveAttribute('data-cbo-id', cboId, { timeout: 30_000 });

      const ctx: Ctx = { tested: [], current: null, digIdx: 0, step: 0, shotCards: [] };
      const shot = async (name: string) => {
        ctx.step++;
        await page.getByTestId('cbo-chat-thread').evaluate(el => el.scrollTo({ top: el.scrollHeight }));
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(dir, `${String(ctx.step).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.png`) });
      };
      // The chat thread is its own scroll area: an element taller than the window
      // renders cut. Grow the window until it holds the element, capture, restore.
      const whole = async (loc: ReturnType<Page['locator']>, file: string) => {
        if (!(await loc.count())) return;
        const h = await loc.evaluate(el => el.getBoundingClientRect().height).catch(() => 0);
        await page.setViewportSize({ width: 1360, height: Math.min(8000, Math.ceil(h) + 500) });
        await page.waitForTimeout(300);
        await loc.scrollIntoViewIfNeeded();
        await loc.screenshot({ path: path.join(dir, file) }).catch(() => {});
        await page.setViewportSize({ width: 1360, height: 960 });
        await page.waitForTimeout(200);
      };
      const input = page.getByTestId('cbo-chat-input');
      const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label.replace(/"/g, '\\"')}"]`).last();

      await input.fill('Vamos começar o Encontro 3.');
      await input.press('Enter');
      await idle(page);
      await shot('abertura');

      const t0 = Date.now();
      let closed = false;
      for (let turn = 0; turn < 70 && !closed; turn++) {
        const p = await pending(request, cboId);
        if (!p) { await shot('sem-pergunta'); log.push(`turn ${turn}: no pending question — stop`); break; }
        const act = decide(sc, p.question, p.labels, ctx);
        log.push(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s · ❓ ${p.question.slice(0, 70)} → ${JSON.stringify(act).slice(0, 110)}`);
        if ('stop' in act) break;
        if ('upload' in act) {
          const chooser = page.waitForEvent('filechooser');
          await chip('📎 Mandar agora').click();
          await (await chooser).setFiles(act.upload);
          // Every file acknowledged, then the one question at the end.
          await expect.poll(async () => (await pending(request, cboId))?.question, { timeout: 180_000 }).toBe('Tem mais algum pra mandar?');
          await idle(page);
          await shot('arquivos-recebidos');
          continue;
        }
        if ('chooseSolution' in act) {
          await chip('Ver todas as soluções').click();
          await idle(page);
          const opt = page.getByTestId('cbo-solution-options').last();
          const card = opt.locator(`[data-testid^="solution-option-"]`, { hasText: act.chooseSolution }).first();
          await card.click();
          const id = (await card.getAttribute('data-testid'))!.replace('solution-option-', '');
          await page.getByTestId(`solution-choose-${id}`).click();
        } else if ('type' in act) {
          await input.fill(act.type);
          await input.press('Enter');
        } else {
          await chip(act.tap).click();
        }
        await idle(page);
        const q = p.question;
        const label = /testar (primeiro|agora)/.test(q) ? `prateleira-${ctx.current}` : /quem faria/.test(q) ? `quem-faria-${ctx.current}` : /mais pega/.test(q) ? `o-que-pega-${ctx.current}` : /Vendo isso/.test(q) ? `reacao-${ctx.tested[ctx.tested.length - 1]}` : q;
        await shot(label);
        // The test card, whole, the moment it appears.
        const cards = page.locator('[data-testid^="cbo-solution-test-"]');
        if (/quem faria/.test((await pending(request, cboId))?.question ?? '') && !ctx.shotCards.includes(ctx.current ?? '')) {
          ctx.shotCards.push(ctx.current ?? '');
          await whole(cards.last(), `${String(ctx.step).padStart(2, '0')}b-cartao-${(ctx.current ?? 'x').replace(/\s+/g, '-')}.png`);
        }
        if (await page.getByTestId('cbo-comparison').count()) {
          const pp = await pending(request, cboId);
          if (pp?.labels.includes('Fechar o Encontro 3 ✓')) {
            const cmp = page.getByTestId('cbo-comparison').last();
            await whole(cmp, `${String(ctx.step).padStart(2, '0')}c-comparacao-inteira.png`);
            // The printed comparison, as the organisation downloads it.
            const href = await cmp.getByTestId('comparison-print').getAttribute('href');
            if (href) {
              const pdf = await page.context().newPage();
              await pdf.setViewportSize({ width: 1100, height: 1400 });
              await pdf.goto(href);
              await pdf.screenshot({ path: path.join(dir, `${String(ctx.step).padStart(2, '0')}d-comparacao-impressa.png`), fullPage: true });
              await pdf.close();
            }
            await chip('Fechar o Encontro 3 ✓').click();
            await idle(page);
            await shot('fechamento');
            closed = true;
          }
        }
      }

      const j = await (await request.get(`/api/cbo/${cboId}`)).json();
      const st = j.state ?? j;
      const tf = st.sections.intervention_type.fields;
      const notes = (() => { try { return JSON.parse(tf._document_notes_json?.value || '{}'); } catch { return {}; } })();
      const summary = {
        scenario: sc.title, cboId, seconds: Math.round((Date.now() - t0) / 1000), closed: tf._e3_closed?.value === 'yes',
        criteria: tf.choice_criteria?.value ?? null,
        tests: JSON.parse(tf.solution_tests_json?.value || '[]'),
        documentNotes: (notes.notes ?? []).length, measures: (notes.measures ?? []).map((m: any) => `${m.labelPt} ${m.m2} m²`),
        advice: tf._advice_json?.value ? 'yes' : 'no',
        dig: (() => { try { return JSON.parse(tf.dig_json?.value || '[]').map((d: any) => ({ q: d.askPt.slice(0, 90), answered: d.answer !== undefined })); } catch { return []; } })(),
        scores: (st.maturityScores ?? []).map((m: any) => `${m.metric}=${m.score}`),
        health: st.metadata?.health ?? [],
      };
      fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
      fs.writeFileSync(path.join(dir, 'turns.txt'), log.join('\n'));
      console.log(`\n══ ${sc.title}\n${log.join('\n')}\n${JSON.stringify(summary, null, 1).slice(0, 1500)}`);
      expect(summary.closed, 'the encontro reached its close').toBe(true);
    });
  }
});
