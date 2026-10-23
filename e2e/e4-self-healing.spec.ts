import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { worriesPicked, addressSaid, partnersSaid, e4Suggestions } from '../shared/e4-suggestions';

// SELF-HEALING IN ENCONTRO 4 (round 3, H1 — 23 Oct 2026). What they already
// told us comes back ONCE, as one card, when we are confident they'd accept it;
// a less certain guess is asked on its own; nothing is written until confirmed.

const u = (content: string) => ({ role: 'user', content });

test.describe('what counts as already said', () => {
  test('worries: an answers card or tapped chips; partners only when named as such; the last address wins', () => {
    expect(worriesPicked([u(JSON.stringify({ kind: 'answers', pairs: [{ question: 'O que mais preocupa no lugar?', answer: 'Calor, O barranco, Inundação, Enxurrada' }] }))]).sort())
      .toEqual(['enxurrada', 'heat', 'inundacao', 'landslide']);
    expect(worriesPicked([u('🌡️ Calor'), u('💧 Alagamento')]).sort()).toEqual(['alagamento', 'heat']);
    // A sentence that merely mentions heat is not a pick.
    expect(worriesPicked([u('o calor aqui é forte mas o problema é outro')])).toEqual([]);
    expect(partnersSaid([u('A gente faz isso em parceria com a Escola Estadual Leopoldina e com o posto.')])).toEqual(['Escola Estadual Leopoldina']);
    expect(partnersSaid([u('a escola do lado sempre ajuda')])).toEqual([]);
    expect(addressSaid([u('fica na Rua das Flores 12'), u('corrigindo: Av. Assis Brasil 3000')], {})).toBe('Av. Assis Brasil 3000');
    expect(addressSaid([u('fica na Rua das Flores 12')], { site_address: 'Rua Tal 5' })).toBe('Rua Tal 5');
  });

  test('confidence: a house-number match goes in the card; a street alone is asked on its own', () => {
    const base = { site: { site_worry: 'alagamento' }, type: {}, messages: [u('🌡️ Calor')], hasPlace: false };
    const precise = e4Suggestions({ ...base, place: { lat: -30.03, lng: -51.2, label: 'Rua das Flores, 12', precise: true } });
    expect(precise.find(x => x.key === 'lugar')!.confidence).toBe('high');
    const street = e4Suggestions({ ...base, place: { lat: -30.03, lng: -51.2, label: 'Rua das Flores', precise: false } });
    expect(street.find(x => x.key === 'lugar')!.confidence).toBe('medium');
    // Lost worries come back as the union, valid ids only.
    expect(precise.find(x => x.key === 'preocupacoes')!.writes.intervention_site!.site_worry).toBe('alagamento,heat');
    // An item taken off the card stays off.
    expect(e4Suggestions({ ...base, type: { _e4_recap_skip: 'preocupacoes' } }).some(x => x.key === 'preocupacoes')).toBe(false);
    // Already answered: nothing to offer.
    expect(e4Suggestions({ ...base, type: { _e4_problem_ok: 'yes' } }).some(x => x.key === 'preocupacoes')).toBe(false);
  });
});

async function chat(request: APIRequestContext, cboId: string, message: string, turnKind = 'chip') {
  const r = await request.post(`/api/cbo/${cboId}/chat`, { data: { message, lang: 'pt', turnKind } });
  const ev = (await r.text()).split('\n\n').filter(b => b.startsWith('data:')).map(b => { try { return JSON.parse(b.slice(5)); } catch { return null; } }).filter(Boolean);
  const ask = ev.filter((e: any) => e.type === 'ask_user').pop();
  return { ev, q: String(ask?.question ?? ''), labels: (ask?.options ?? []).map((o: any) => o.label) as string[] };
}
const fields = async (request: APIRequestContext, cboId: string, section: string) => {
  const j: any = await (await request.get(`/api/cbo/${cboId}`)).json();
  return Object.fromEntries(Object.entries((j.state ?? j).sections?.[section]?.fields ?? {}).map(([k, v]: any) => [k, String(v?.value ?? '')])) as Record<string, string>;
};

async function seeded(page: any, address: string) {
  const api = new TestApi(page.request);
  test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
  const { cboId } = await api.newSession();
  await api.seedState(cboId, { phase: 4, language: 'pt', sections: [
    { sectionId: 'org_profile', field: 'org_name', value: 'Coletivo Teste' },
    { sectionId: 'intervention_site', field: 'bairro', value: 'Restinga' },
    { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
    { sectionId: 'intervention_site', field: 'site_address', value: address },
    { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
    { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'jardins-de-chuva' },
    { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 80, who: 'nos', testedAt: 'x' }]) },
    { sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 80, date: '2026-10-20', recordedAt: 'x' }) },
  ] });
  // Said before Encontro 4 opened: a worry chip and a partner.
  await chat(page.request, cboId, '🌡️ Calor', 'text');
  await chat(page.request, cboId, 'Fazemos isso em parceria com a Escola Estadual Leopoldina.', 'text');
  return cboId;
}

test.describe('Encontro 4, live', () => {
  test('one card, one tap: place, worries, who builds and partners — and those questions are not asked again', async ({ page }) => {
    test.setTimeout(120_000);
    const cboId = await seeded(page, 'Rua das Flores 123, Restinga');
    let s = await chat(page.request, cboId, 'Vamos começar o Encontro 4.', 'text');
    s = await chat(page.request, cboId, 'É essa ✓');
    s = await chat(page.request, cboId, 'Isso ✓');
    expect(s.q).toMatch(/^Pelo que vocês já contaram, dá pra adiantar:/);
    for (const line of ['o lugar:', 'o que preocupa: alagamento, calor', 'quem faz a obra: nós, em mutirão', 'com quem já trabalharam: Escola Estadual Leopoldina']) expect(s.q).toContain(line);
    expect(s.labels).toEqual(['Está certo ✓', 'Corrigir uma', 'Responder uma por uma']);
    s = await chat(page.request, cboId, 'Está certo ✓');
    const site = await fields(page.request, cboId, 'intervention_site');
    const type = await fields(page.request, cboId, 'intervention_type');
    expect(site._site_lat).toBeTruthy();
    expect(site.site_worry).toBe('alagamento,heat');
    expect(type.construction_model).toBe('mutirao');
    expect(type.e4_partners).toContain('Escola Estadual Leopoldina');
    expect(s.q, 'no place or problem question after the card').not.toMatch(/marcado no mapa|problema principal/);
    // Walk on: who builds and partners are never asked.
    const asked: string[] = [s.q];
    for (let i = 0; i < 8 && !/Confere|Pode fechar|fechar/.test(s.q); i++) {
      const pick = s.labels.find(l => /Não sei|Ninguém|Nada|Pode fechar|Está certo/.test(l)) ?? s.labels[0];
      s = await chat(page.request, cboId, pick ?? 'Não sei dizer', 'chip');
      asked.push(s.q);
    }
    expect(asked.join('\n')).not.toMatch(/Quem faria a obra|quem faz a obra\?|Com quem vocês já conversaram/i);
  });

  test('"Corrigir uma" takes one off; that one is asked later on its own', async ({ page }) => {
    test.setTimeout(120_000);
    const cboId = await seeded(page, 'Rua das Flores 123, Restinga');
    await chat(page.request, cboId, 'Vamos começar o Encontro 4.', 'text');
    await chat(page.request, cboId, 'É essa ✓');
    let s = await chat(page.request, cboId, 'Isso ✓');
    s = await chat(page.request, cboId, 'Corrigir uma');
    expect(s.labels).toContain('Com quem já trabalharam');
    s = await chat(page.request, cboId, 'Com quem já trabalharam');
    expect(s.q).toMatch(/^Pelo que vocês já contaram/);
    expect(s.q).not.toContain('Escola Estadual Leopoldina');
    s = await chat(page.request, cboId, 'Está certo ✓');
    expect((await fields(page.request, cboId, 'intervention_type')).e4_partners ?? '').toBe('');
  });

  test('an address without a house number is a guess: asked on its own, "É aqui?"', async ({ page }) => {
    test.setTimeout(120_000);
    const cboId = await seeded(page, 'Rua das Flores, Restinga');
    await chat(page.request, cboId, 'Vamos começar o Encontro 4.', 'text');
    await chat(page.request, cboId, 'É essa ✓');
    let s = await chat(page.request, cboId, 'Isso ✓');
    expect(s.q).not.toContain('o lugar:'); // not in the card
    if (/^Pelo que vocês já contaram/.test(s.q)) s = await chat(page.request, cboId, 'Está certo ✓');
    expect(s.q).toMatch(/o lugar fica por aqui: .*É aqui\?/s);
    s = await chat(page.request, cboId, 'Isso ✓');
    expect((await fields(page.request, cboId, 'intervention_site'))._site_lat).toBeTruthy();
  });

  test('the coordination sees the same suggestions to prefill its form — nothing saved by itself', async ({ page }) => {
    test.setTimeout(90_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Sugestões ${tag}`)).cohort;
    await api.createCoordinator({ email: `sugg-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Coletivo Teste', withSession: true, unlockedPhases: [1, 2, 3, 4] })).member;
    await api.seedState(m.cboStateId, { phase: 4, language: 'pt', sections: [
      { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
      { sectionId: 'intervention_site', field: 'site_address', value: 'Rua das Flores 123' },
    ] });
    await chat(page.request, m.cboStateId, '🌡️ Calor', 'text');
    const view = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${m.id}/e4-answers`)).json();
    expect(view.suggestions.map((x: any) => x.key).sort()).toEqual(['lugar', 'preocupacoes']);
    expect((await fields(page.request, m.cboStateId, 'intervention_site')).site_worry).toBe('alagamento');
  });
});
