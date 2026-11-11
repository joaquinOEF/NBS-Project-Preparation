import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { projectCard } from '../shared/preportfolio';

// A PROJECT'S JOINT PROPOSAL (JVP, 10 Nov 2026 — J1 C, J2 A, J3 A).
//
// Ksa Rosa and the Cooperativa 20 de Novembro want ONE project: a green
// corridor along Av. Farrapos. The project session keeps the beats that carry
// the joint reasoning (why together, each one's scenarios) and then runs
// Encontro 4 itself, on the joint solution, ending on ONE proposta inicial —
// the same page an organisation produces, plus "As organizações e por que
// juntas". The place is both members' own points; Ksa Rosa (no pin on prod,
// only an address) is offered the address-geocode "É aqui?" inside the
// project, and confirming writes HER record. On the pre-portfolio the project
// is one unit, with the joint budget, and the members' own proposals are
// background — never summed.
//
// Seeded from the real prod shapes (10 Nov 2026).

const COOP = 'Cooperativa 20 de Novembro';
const KSA = 'Ksa Rosa';
const field = (sectionId: string, f: string, value: string) => ({ sectionId, field: f, value });

const COOP_SECTIONS = [
  field('org_profile', 'org_name', COOP),
  field('intervention_site', 'bairro', 'Floresta'),
  field('intervention_site', 'site_name', 'Garagem Popéia'),
  field('intervention_site', '_site_lat', '-30.0273'),
  field('intervention_site', '_site_lng', '-51.2171'),
  field('intervention_site', 'site_worry', 'alagamento'),
  field('intervention_type', 'solution_tests_json', JSON.stringify([
    { solutionId: 'hortas-urbanas', reaction: 'faz-sentido', areaM2: 60, testedAt: '2026-10-01T12:00:00Z' },
    { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 80, testedAt: '2026-10-01T12:10:00Z' },
  ])),
  field('intervention_type', 'chosen_solutions', 'hortas-urbanas,jardins-de-chuva'),
  field('intervention_type', '_e3_closed', 'yes'),
];
const KSA_SECTIONS = [
  field('org_profile', 'org_name', KSA),
  field('intervention_site', 'bairro', 'Floresta'),
  field('intervention_site', 'site_address', 'Voluntários da Pátria 1039, Floresta, Porto Alegre'),
  field('intervention_site', 'site_worry', 'alagamento'),
  // First-era Encontro 3: names in chosen_solutions, no tests JSON; one off the catalogue.
  field('intervention_type', 'chosen_solutions', 'captacao-agua-da-chuva, compostagem, cozinha-comunitaria-biodigestor, aquecedor-solar'),
];

/** Every way our bairro index used to reach a page (e2e/cougar-e2-official-hazard.spec.ts). */
const BAIRRO_INDEX = [/percentil/i, /em média/i, /média do bairro/i, /entre os \d+% mais expostos/i, /mais expostos a/i];

async function chat(request: APIRequestContext, cboId: string, message: string, turnKind = 'chip'): Promise<any[]> {
  const r = await request.post(`/api/cbo/${cboId}/chat`, { data: { message, lang: 'pt', turnKind } });
  expect(r.ok(), `chat ${message}`).toBe(true);
  const text = await r.text();
  return text.split('\n\n').map(b => b.trim()).filter(b => b.startsWith('data:')).map(b => { try { return JSON.parse(b.slice(5).trim()); } catch { return null; } }).filter(Boolean);
}
/** One templated turn — the project's or its Encontro 4's, never the model's — ending on a question. */
async function step(request: APIRequestContext, cboId: string, message: string, turnKind = 'chip') {
  const events = await chat(request, cboId, message, turnKind);
  const done = events.filter(e => e.type === 'done').pop();
  expect(String(done?.summary ?? ''), `"${message}" is templated`).toMatch(/Project checkpoint|E4 checkpoint/);
  const asks = events.filter(e => e.type === 'ask_user');
  expect(asks.length, `"${message}" ends on a question`).toBeGreaterThan(0);
  const ask = asks[asks.length - 1];
  return { events, ask, question: String(ask.question), labels: (ask.options ?? []).map((o: any) => String(o.label)) as string[] };
}
const stateOf = async (request: APIRequestContext, cboId: string) => {
  const j: any = await (await request.get(`/api/cbo/${cboId}`)).json();
  return j.state ?? j;
};
const fieldOf = (st: any, sec: string, f: string) => String(st?.sections?.[sec]?.fields?.[f]?.value ?? '');
const pageText = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test.describe('projects — the joint proposal (Encontro 4 for a project)', () => {
  test.use({ locale: 'pt-BR' });

  test('door → why → scenarios → Encontro 4 → Ksa Rosa\'s place from her address → one check → the joint card; the board counts it once', async ({ page }) => {
    test.setTimeout(240_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const r = page.request;
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Farrapos ${tag}`)).cohort;
    await api.createCoordinator({ email: `farrapos-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const ksa = (await api.inviteMember(cohort.id, { orgName: KSA, neighborhood: 'Floresta', withSession: true })).member;
    const coop = (await api.inviteMember(cohort.id, { orgName: COOP, neighborhood: 'Floresta', withSession: true })).member;
    await api.seedState(ksa.cboStateId, { phase: 4, language: 'pt', sections: KSA_SECTIONS });
    await api.seedState(coop.cboStateId, { phase: 4, language: 'pt', sections: COOP_SECTIONS });
    const project = await api.createProject(cohort.coordinatorSlug, { title: 'Corredor verde da Av. Farrapos', memberIds: [ksa.id, coop.id] });
    const P = project.cboStateId as string;

    // The members' OWN proposals, before the project — the board must not add these up later.
    const ownBefore = await (await r.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio?lang=pt`)).json();
    const coopOwn = ownBefore.orgs.find((o: any) => o.memberId === coop.id);
    expect(coopOwn?.budget, "the Cooperativa's own proposal is priced (its liked test)").toBeTruthy();

    // ── The door and the project's own beats ──────────────────────────────
    let s = await step(r, P, 'Vamos começar o projeto.', 'system');
    expect(s.labels).toContain('Confere ✓');
    s = await step(r, P, 'Confere ✓');
    expect(s.labels).toContain('Montar o projeto');
    s = await step(r, P, 'Montar o projeto');
    expect(s.question).toMatch(/por que essas organizações fazem esse projeto juntas/);
    s = await step(r, P, 'As duas ficam na Farrapos e querem um corredor verde ligando a Garagem Popéia à casa da Ksa, com água da chuva e jardins.', 'text');
    expect(s.question).toMatch(/O que junta o projeto/);
    const frame = s.labels.find(l => /Floresta/.test(l)) ?? 'Outra coisa';
    s = await step(r, P, frame);
    if (frame === 'Outra coisa') s = await step(r, P, 'O corredor da Farrapos', 'text');
    expect(s.question).toBe(`Da ${KSA}, o que entra no projeto?`);
    expect(s.labels, 'a first-era record is offered what it chose').toContain('Captação de água da chuva');
    s = await step(r, P, 'Captação de água da chuva');
    expect(s.question).toBe(`Da ${COOP}, o que entra no projeto?`);
    s = await step(r, P, 'Jardins de chuva');

    // ── Encontro 4, for the joint solution ─────────────────────────────────
    expect(s.events.filter(e => e.type === 'chat').map(e => e.content).join(' ')).toMatch(/proposta inicial conjunta/);
    expect(s.question).toBe('Qual solução vira a proposta conjunta?');
    expect(s.labels).toEqual(expect.arrayContaining(['Captação de água da chuva', 'Jardins de chuva']));
    s = await step(r, P, 'Jardins de chuva');
    // The size the Cooperativa tested it at, offered — the corridor is bigger.
    expect(s.question).toMatch(/\*\*Jardins de chuva\*\*, com \*\*80 m²\*\*. Continua esse tamanho\?/);
    s = await step(r, P, 'Mudou');
    expect(s.question).toMatch(/Mais ou menos de que tamanho/);
    s = await step(r, P, '40 por 3', 'text');
    // J2: the member without a pin, by name, from HER address.
    expect(s.question).toMatch(new RegExp(`O lugar da \\*\\*${KSA}\\*\\* ainda não está marcado no mapa. Pelo endereço que ela deu, fica por aqui: \\*\\*Voluntários da Pátria,? 1039`)); // with or without the comma IBGE's CNEFE label carries (#648)
    // W2 (10 Nov): the place is required — for every member, no skip chip.
    expect(s.labels).toEqual(['Isso ✓', 'Marcar o lugar agora']);
    // An old "Seguir sem o lugar" still on screen is read, and the place asked again.
    s = await step(r, P, 'Seguir sem o lugar');
    expect(s.question).toMatch(/O lugar da \*\*Ksa Rosa\*\*/);

    // ── A reload mid-way lands on the same question (in the browser) ──────
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const thread = page.getByTestId('cbo-chat-thread');
    await page.goto(`/cbo-profile?p=${project.capabilityToken}`);
    await expect(chip('Isso ✓')).toBeVisible({ timeout: 30_000 });
    await expect(thread.getByText('ainda não está marcado no mapa', { exact: false }).last()).toBeVisible();
    await page.reload();
    await expect(chip('Isso ✓')).toBeVisible({ timeout: 30_000 });
    await expect(chip('Marcar o lugar agora')).toBeVisible();
    await expect(chip('Seguir sem o lugar')).toHaveCount(0);
    // A return line (what the page sends on a fresh open) re-asks it exactly too.
    s = await step(r, P, 'Vamos começar o projeto.', 'system');
    expect(s.question).toMatch(/O lugar da \*\*Ksa Rosa\*\*/);
    await page.reload();
    await chip('Isso ✓').click();
    await expect(thread.getByText('continua sendo', { exact: false }).last()).toBeVisible({ timeout: 20_000 });

    // Ksa Rosa's OWN record now has the pin, marked as from her address.
    const ksaState = await stateOf(r, ksa.cboStateId);
    expect(fieldOf(ksaState, 'intervention_site', '_site_lat')).not.toBe('');
    expect(fieldOf(ksaState, 'intervention_site', '_site_from_address')).toBe('yes');
    // …and the project's state holds no pin of its own.
    expect(fieldOf(await stateOf(r, P), 'intervention_site', '_site_lat')).toBe('');

    // ── The problem, the gaps, the one check ──────────────────────────────
    s = await step(r, P, 'Vamos começar o projeto.', 'system');
    expect(s.question).toMatch(/continua sendo/);
    s = await step(r, P, 'Isso ✓');
    const draft = s.events.find(e => e.type === 'show_prenote')?.prenote;
    expect(draft, 'the joint draft appears at once').toBeTruthy();
    for (let i = 0; i < 14 && !/Está bom assim|Confere tudo/.test(s.question); i++) {
      const q = s.question;
      if (/quem sofre mais/.test(q)) s = await step(r, P, 'Umas 60 famílias ao longo da avenida', 'text');
      else if (/querem ver mudar/.test(q)) {
        // A doubt goes to the model (fake), and the encontro's own question comes back after it.
        await api.scriptCbo(P, [[{ op: 'say', text: 'A linha de base é como está hoje, antes da obra.' }]]);
        const ev = await chat(r, P, 'O que é linha de base?', 'text');
        expect(ev.some(e => e.type === 'chat' && /linha de base é como está hoje/.test(e.content ?? '')), 'the model answered').toBe(true);
        const back = ev.filter(e => e.type === 'ask_user').pop();
        expect(String(back?.question ?? ''), 'the beat comes back after the model').toMatch(/querem ver mudar/);
        s = await step(r, P, s.labels[0]);
      }
      else if (/Continua\?|É isso\?|Entram como parceiros/.test(q)) s = await step(r, P, 'Isso ✓');
      else if (/colocar no projeto/.test(q)) s = await step(r, P, 'Mutirão das duas organizações', 'text');
      else if (/Com quem vocês já conversaram/.test(q)) s = await step(r, P, 'Vila Flores e a escola da Farrapos', 'text');
      else s = await step(r, P, s.labels[0]);
    }
    expect(s.question).toMatch(/Está bom assim|Confere tudo/);
    s = await step(r, P, s.labels[0]);

    // ── The chat ends on the joint proposal card ──────────────────────────
    const last = s.events.filter(e => e.type === 'show_prenote').pop()?.prenote;
    expect(last, 'the close shows the page').toBeTruthy();
    expect(fieldOf(await stateOf(r, P), 'intervention_type', '_e4_closed')).toBe('yes');
    expect(last.solution).toMatchObject({ id: 'jardins-de-chuva', areaM2: 120 });
    expect(last.joint.members.map((m: any) => m.orgName)).toEqual([KSA, COOP]);
    expect(last.orgName).toBe(`${KSA} e ${COOP}`);
    expect(last.title).toBe('Jardins de chuva · Corredor verde da Av. Farrapos');
    const juntas = last.sections[0];
    expect(juntas.id).toBe('juntas');
    expect(juntas.title).toBe('As organizações e por que juntas');
    const juntasText = juntas.lines.map((l: any) => l.text).join(' ');
    expect(juntasText).toContain(`**${KSA}**`);
    expect(juntasText).toContain(`**${COOP}** — Garagem Popéia`);
    expect(juntasText).toContain('Traz ao projeto: Captação de água da chuva');
    expect(juntasText).toContain('corredor verde ligando a Garagem Popéia');
    // Both points' city-map facts, each said of whose place.
    const territorio = last.sections.find((x: any) => x.id === 'territorio');
    expect(territorio, 'the city maps section').toBeTruthy();
    const terr = territorio.lines.map((l: any) => l.text).join(' ');
    expect(terr).toContain(`(${COOP})`);
    expect(terr).toContain(`(${KSA})`);
    // The census around both points — once, as one block.
    expect(last.sections.filter((x: any) => x.id === 'entorno').length).toBeLessThanOrEqual(1);
    const all = JSON.stringify(last);
    for (const re of BAIRRO_INDEX) expect(all, `no bairro index: ${re}`).not.toMatch(re);
    expect(last.budget.find((b: any) => b.kind === 'obra').value).toMatch(/R\$/);

    // The same card in the browser, last in the thread, with its print link.
    await page.reload();
    const card = page.getByTestId('cbo-prenote').last();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('As organizações e por que juntas');
    await expect(card).toContainText(KSA);
    await expect(card).toContainText(COOP);
    await expect(card.getByTestId('prenote-print')).toHaveAttribute('href', `/api/cbo/${P}/prenote?lang=pt`);
    await expect(chip('Mudar algo')).toBeVisible();

    // The printed page — the card's link and the project's own route say the same.
    for (const url of [`/api/cbo/${P}/prenote?lang=pt`, `/api/project/${project.id}/prenote?lang=pt`]) {
      const res = await r.get(url);
      expect(res.ok(), url).toBe(true);
      const text = pageText(await res.text());
      expect(text).toContain('As organizações e por que juntas');
      expect(text).toContain(KSA);
      expect(text).toContain(COOP);
      expect(text).toContain('Garagem Popéia');
      for (const re of BAIRRO_INDEX) expect(text, `${url}: ${re}`).not.toMatch(re);
      expect(text, 'written register').not.toMatch(/\bvocês\b/i);
    }

    // "Mudar algo" reopens one part — never a member's pin from the shared room.
    s = await step(r, P, 'Mudar algo');
    expect(s.labels).not.toContain('O lugar no mapa');
    expect(s.labels).toContain('O que querem ver mudar');
    s = await step(r, P, 'O que querem ver mudar');
    expect(s.question).toMatch(/querem ver mudar/);
    s = await step(r, P, s.labels[0]);
    expect(s.question).toMatch(/Está bom assim|Confere tudo/);
    s = await step(r, P, s.labels[0]);
    expect(fieldOf(await stateOf(r, P), 'intervention_type', '_e4_closed')).toBe('yes');
    expect(s.events.filter(e => e.type === 'show_prenote').length, 'closes on the card again').toBe(1);

    // ── J3: the pre-portfolio sees ONE unit, the joint budget, nothing summed twice ──
    const board = await (await r.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio?lang=pt`)).json();
    const units = board.orgs.filter((o: any) => o.unit?.kind === 'joint');
    expect(units).toHaveLength(1);
    const unit = units[0];
    expect(unit.unit.projectId).toBe(project.id);
    expect(unit.unit.orgNames).toEqual([KSA, COOP]);
    expect(unit.solutionLabel).toBe('Jardins de chuva');
    expect(unit.budget).toEqual(last.total);
    // The members are not on the board on their own any more…
    expect(board.orgs.filter((o: any) => o.memberId === coop.id)).toHaveLength(0);
    expect(board.orgs.filter((o: any) => [ksa.id, coop.id].includes(o.memberId))).toHaveLength(1);
    // …their own proposals are background, shown and not added.
    expect(unit.unit.background.map((b: any) => b.orgName)).toEqual([KSA, COOP]);
    expect(unit.unit.background.find((b: any) => b.memberId === coop.id).budget).toEqual(coopOwn.budget);
    const card2 = projectCard([unit.memberId], board.orgs);
    expect(card2.budget).toEqual(last.total);
    expect(card2.budget!.low, 'the joint budget, not the joint plus the Cooperativa\'s own').toBeLessThan(last.total.low + coopOwn.budget.low);
    // Said as a joint project (not "uma organização só"), and both places on the board's map.
    expect(card2.reason).toBe(`Projeto conjunto: ${KSA} + ${COOP}`);
    expect(card2.places.map(p => p.label)).toEqual([KSA, COOP]);
    // The print says it is the organisations' joint proposal, not "uma página por organização".
    const print = await (await r.get(`/api/cbo/${P}/prenote?lang=pt`)).text();
    expect(print).toContain('Proposta conjunta das organizações');
    expect(print).not.toContain('Uma página por organização');
    // The census over both points, each tract once: never more people than the two points counted apart.
    expect(unit.censusTracts && Object.keys(unit.censusTracts).length).toBeTruthy();
  });
});
