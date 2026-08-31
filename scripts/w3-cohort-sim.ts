// ============================================================================
// FOUR ORGANISATIONS, ONE COHORT — W3 end to end, then the portfolio pass
// ============================================================================
// scripts/w3-sim.ts drives one organisation at a time and stops at its hoja de
// ruta. This one runs four with deliberately different capacities and different
// PATHS through the same engine, and then does what nothing had simulated: it
// takes the states W3 actually wrote and runs the portfolio analysis over them,
// through the same pure mapping the coordinator's button uses.
//
// That join is where a defect hides in silence. The analysis reads
// `intervention_type.chosen_solutions`, `intervention_site.role_preference`,
// `impact_monitoring.baseline_condition`; W3 writes them. Rename either side and
// nothing throws — the report just comes back thinner, and a coordinator reads
// "sem local marcado" about an organisation that marked one.
//
//   npx tsx scripts/w3-cohort-sim.ts
//
// The value is in READING it: four capacities, four paths, one grouping.
// ============================================================================
import { serveE3Checkpoint } from '../server/services/cboE3Checkpoint';
import { mkState } from './w3-sim';
import { analyseSynergies, synergyFactsFrom, type SynergyMember } from '../shared/w3-synergies';
import { buildDossier, portfolioState } from '../shared/w3-dossier';

const normChip = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

interface Turn { msg: string; kind?: string }
interface Org {
  id: string;
  name: string;
  /** One line on why this profile exists — capacity, path, what it stresses. */
  profile: string;
  /** Roster facts the coordinator holds, not the org: W2 answers + uploads. */
  roster: { priorCollaboration?: string | null; maturityScore: number; docCount: number };
  excluded?: boolean;
  state: any;
  turns: Turn[];
}

async function drive(org: Org) {
  const state = org.state;
  const events: any[] = [];
  const problems: string[] = [];
  const deps = {
    writeFields: (sectionId: string, fields: Record<string, string>) => {
      for (const [k, v] of Object.entries(fields)) {
        state.sections[sectionId].fields[k] = { value: v, confidence: 'high', source: 'user' };
      }
    },
    recordCheckpoint: () => {},
    normChip,
  };

  console.log(`\n${'═'.repeat(78)}\n${org.name}\n  ${org.profile}\n${'═'.repeat(78)}`);
  for (const t of org.turns) {
    const before = events.length;
    const served = await serveE3Checkpoint('sim', t.msg, state, (e: any) => events.push(e), 'pt', t.kind ?? 'text', deps as any);
    // A turn the engine does not serve falls through to the model, which in a
    // deployment with no key means the organisation gets nothing back.
    if (!served) problems.push(`turno não servido: "${t.msg}"`);
    const asks = events.slice(before).filter(e => e.type === 'ask_user');
    const chat = events.slice(before).filter(e => e.type === 'chat');
    const head = asks[0]?.question ?? chat[chat.length - 1]?.content ?? '(silêncio)';
    console.log(`  👤 ${t.msg}\n     → ${String(head).split('\n')[0].slice(0, 96)}`);
  }

  const site = Object.fromEntries(Object.entries(state.sections.intervention_site.fields).map(([k, v]: any) => [k, String(v.value ?? '')]));
  const type = Object.fromEntries(Object.entries(state.sections.intervention_type.fields).map(([k, v]: any) => [k, String(v.value ?? '')]));
  const solutions = (type.chosen_solutions ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const areaM2 = Number(site.site_area_m2) || 0;
  const dossier = buildDossier({
    site,
    org: Object.fromEntries(Object.entries(state.sections.org_profile.fields).map(([k, v]: any) => [k, String(v.value ?? '')])),
    solutions,
    ...(areaM2 ? { areaM2 } : {}),
    w3: {
      ...type,
      ...Object.fromEntries(Object.entries(state.sections.impact_monitoring.fields).map(([k, v]: any) => [k, String(v.value ?? '')])),
      ...Object.fromEntries(Object.entries(state.sections.operations_sustain.fields).map(([k, v]: any) => [k, String(v.value ?? '')])),
    },
  }, 'pt');
  const verdict = portfolioState(dossier.verdicts);
  const roadmap = events.filter(e => e.type === 'show_roadmap').pop()?.roadmap;

  console.log(`\n  ── saiu do Encontro 3 com ──`);
  console.log(`     soluções   : ${solutions.join(' + ') || '(nenhuma)'}`);
  console.log(`     área       : ${areaM2 ? `${areaM2.toLocaleString('pt-BR')} m²` : '(não sabe ainda)'}`);
  console.log(`     veredito   : ${verdict ?? '(nenhum)'}${dossier.verdicts[0]?.unblockedBy ? ` — destrava com: ${dossier.verdicts[0].unblockedBy}` : ''}`);
  console.log(`     capacidade : ${dossier.capacity.grade} (${dossier.capacity.because.join('; ') || 'nada declarado'})`);
  console.log(`     hoja de ruta: ${roadmap ? `${roadmap.steps.length} passos, ${roadmap.open.length} em aberto` : '⚠️ NÃO PRODUZIDA'}`);
  console.log(`     lacunas    : ${dossier.gaps.length}`);
  if (problems.length) console.log(`     ⚠️  ${problems.join('\n     ⚠️  ')}`);

  const facts = synergyFactsFrom(state.sections);
  const member: SynergyMember & { excluded: boolean } = {
    id: org.id,
    orgName: org.name,
    bairro: site.bairro || null,
    worry: site.site_worry || null,
    priorCollaboration: org.roster.priorCollaboration ?? null,
    maturityScore: org.roster.maturityScore,
    docCount: org.roster.docCount,
    verdict,
    started: true,
    docs: [],
    ...facts,
    excluded: !!org.excluded,
  };
  return { member, problems, verdict, facts };
}

// ── The four ────────────────────────────────────────────────────────────────
const ORGS: Org[] = [
  {
    id: 'humaita-rede',
    name: 'Rede Solidária Humaitá',
    profile: 'ALTA capacidade — já executou com verba, experiência prévia em SbN, terreno público sem documento, marca a área no mapa e leva DUAS soluções.',
    roster: { priorCollaboration: 'sim', maturityScore: 9, docCount: 4 },
    state: mkState({
      org_profile: {
        org_name: 'Rede Solidária Humaitá', contact_name: 'Marlene Duarte',
        prior_project_scale: 'funded', nbs_experience: 'yes', biggest_project_budget: 'R$ 180.000',
      },
      intervention_site: {
        bairro: 'Humaitá', site_name: 'Praça do fundo da vila', _site_lat: '-30.0125', _site_lng: '-51.2010',
        current_use: 'abandoned', land_tenure: 'public-informal', site_worry: 'alagamento',
        site_story: 'A praça vira lago quando chove. A água fica dias e volta pelas casas do fundo.',
        site_knowledge_depth: 'strong', nbs_interest: 'aguas-pluviais, verde-urbano',
        role_preference: 'Receber e administrar recursos, Escrever o projeto',
        prior_collaboration_detail: 'já fez projeto com o grupo das Mães do Humaitá',
      },
    }),
    turns: [
      { msg: 'Vamos começar o Encontro 3.' },
      { msg: 'É isso ✓', kind: 'chip' },
      { msg: 'Jardins de chuva', kind: 'chip' },
      { msg: 'Desenhar no mapa', kind: 'chip' },
      { msg: 'Map selection (composite mode):\n- [zone] Humaitá: FLOOD risk, flood: 85%, heat: 45%, landslide: 3%\n- [custom] Área desenhada (6 vertices) (drawn area) at (-30.0125, -51.2010) · 820 m²\nTotal: 2 assets, 0 sampled points', kind: 'map' },
      { msg: 'Mutirão com apoio técnico', kind: 'chip' },
      { msg: 'É a única área livre da vila e é onde toda a água do quarteirão se junta.' },
      { msg: 'Terra batida com entulho, sem escoamento nenhum. Depois da chuva fica poça uma semana.' },
      { msg: 'Faz sentido', kind: 'chip' },
      { msg: '1 ano', kind: 'chip' },
      { msg: 'Com uma universidade ou parceiro', kind: 'chip' },
      { msg: 'A gente mesmo', kind: 'chip' },
      { msg: 'A cada três meses', kind: 'chip' },
      { msg: 'Editais e projetos', kind: 'chip' },
      { msg: 'Levar mais uma solução', kind: 'chip' },
      { msg: 'Biovaletas', kind: 'chip' },
    ],
  },
  {
    id: 'humaita-maes',
    name: 'Mães do Humaitá',
    profile: 'BAIXA capacidade — nunca executou com verba, sem experiência em SbN, mesmo bairro que a Rede (eixo território) e mesmo arranjo de terreno. Não sabe o tamanho.',
    roster: { priorCollaboration: 'sim', maturityScore: 4, docCount: 0 },
    state: mkState({
      org_profile: { org_name: 'Mães do Humaitá', contact_name: 'Cleuza Prates' },
      intervention_site: {
        bairro: 'Humaitá', site_name: 'Pátio ao lado da creche', _site_lat: '-30.0140', _site_lng: '-51.2035',
        current_use: 'paved', land_tenure: 'public-informal', site_worry: 'alagamento',
        site_story: 'O pátio da creche alaga e as crianças ficam sem sair por dias.',
        site_knowledge_depth: 'strong', nbs_interest: 'agricultura-urbana',
        role_preference: 'Executar / implementar',
      },
    }),
    turns: [
      { msg: 'Vamos começar o Encontro 3.' },
      { msg: 'É isso ✓', kind: 'chip' },
      { msg: 'Hortas urbanas', kind: 'chip' },
      { msg: 'Ainda não sei o tamanho', kind: 'chip' },
      { msg: 'Mutirão', kind: 'chip' },
      { msg: 'Porque é onde as crianças já ficam todo dia e onde a água entra primeiro.' },
      { msg: 'Cimento quebrado, uma horta pequena num canto que a gente já cuida.' },
      { msg: '6 meses', kind: 'chip' },
      { msg: 'A gente mesmo', kind: 'chip' },
      { msg: 'Voluntários da comunidade', kind: 'chip' },
      { msg: 'Todo mês', kind: 'chip' },
      { msg: 'Ainda não sabemos', kind: 'chip' },
      { msg: 'Só essa por enquanto', kind: 'chip' },
    ],
  },
  {
    id: 'santa-teresa',
    name: 'Coletivo Morro Santa Teresa',
    profile: 'MÉDIA capacidade — terreno próprio, encosta, empresa contratada, solução que precisa de licença (o caminho que exige estudo antes de qualquer obra).',
    roster: { priorCollaboration: null, maturityScore: 6, docCount: 2 },
    state: mkState({
      org_profile: {
        org_name: 'Coletivo Morro Santa Teresa', contact_name: 'Vilmar Souza',
        prior_project_scale: 'small', nbs_experience: 'no',
      },
      intervention_site: {
        bairro: 'Santa Teresa', site_name: 'Barranco atrás do galpão', _site_lat: '-30.0790', _site_lng: '-51.2280',
        current_use: 'slope', land_tenure: 'private-owned', site_worry: 'enxurrada',
        site_story: 'A água desce da rua de cima com força e come o barranco. Já levou parte do muro.',
        site_knowledge_depth: 'strong', nbs_interest: 'encostas-e-solo',
        role_preference: 'Testar em escala piloto',
      },
    }),
    turns: [
      { msg: 'Vamos começar o Encontro 3.' },
      { msg: 'É isso ✓', kind: 'chip' },
      { msg: 'Muro de arrimo verde', kind: 'chip' },
      { msg: 'Ainda não sei o tamanho', kind: 'chip' },
      { msg: 'Empresa contratada', kind: 'chip' },
      { msg: 'Porque se o barranco ceder é o galpão e as duas casas de baixo.' },
      { msg: 'Terra exposta de uns três metros, sem nada plantado, com sulco de água no meio.' },
      { msg: '2 anos', kind: 'chip' },
      { msg: 'Ninguém ainda', kind: 'chip' },
      { msg: 'Empresa contratada', kind: 'chip' },
      { msg: 'A cada três meses', kind: 'chip' },
      { msg: 'Recursos próprios', kind: 'chip' },
      { msg: 'Só essa por enquanto', kind: 'chip' },
    ],
  },
  {
    id: 'cavalhada',
    name: 'Ação Cavalhada',
    profile: 'SEM LUGAR MARCADO — mesmo mecanismo de risco que Santa Teresa, noutro território (eixo mecanismo). Segue sem o lugar e não sabe o tamanho.',
    roster: { priorCollaboration: null, maturityScore: 3, docCount: 0 },
    state: mkState({
      org_profile: { org_name: 'Ação Cavalhada', contact_name: 'Rosana Petry' },
      intervention_site: {
        bairro: 'Cavalhada', site_worry: 'enxurrada', land_tenure: 'public-informal',
        site_knowledge_depth: 'thin',
      },
    }),
    turns: [
      { msg: 'Vamos começar o Encontro 3.' },
      { msg: 'Seguir sem o lugar', kind: 'chip' },
      { msg: 'Ver todas as soluções', kind: 'chip' },
      { msg: 'Grade viva', kind: 'chip' },
      { msg: 'Ainda não sei o tamanho', kind: 'chip' },
      { msg: 'Mutirão', kind: 'chip' },
      { msg: 'Prefiro pular', kind: 'chip' },
      { msg: 'A rua vira rio quando chove e leva a terra das casas do fim da linha.' },
      { msg: '2 anos', kind: 'chip' },
      { msg: 'Ninguém ainda', kind: 'chip' },
      { msg: 'Voluntários da comunidade', kind: 'chip' },
      { msg: 'Uma vez por ano', kind: 'chip' },
      { msg: 'Ainda não sabemos', kind: 'chip' },
      { msg: 'Só essa por enquanto', kind: 'chip' },
    ],
  },
  {
    id: 'vila-flores-teste',
    name: 'Vila Flores (teste)',
    profile: 'A ORGANIZAÇÃO DE TESTE — mesmo bairro que a Rede, dados plausíveis. Existe para provar que o filtro do portfólio a mantém fora da análise e no quadro.',
    roster: { priorCollaboration: null, maturityScore: 5, docCount: 0 },
    excluded: true,
    state: mkState({
      org_profile: { org_name: 'Vila Flores (teste)', contact_name: 'Teste', prior_project_scale: 'funded', nbs_experience: 'yes' },
      intervention_site: {
        bairro: 'Humaitá', site_name: 'Teste', _site_lat: '-30.0130', _site_lng: '-51.2020',
        current_use: 'abandoned', land_tenure: 'public-informal', site_worry: 'alagamento',
        site_knowledge_depth: 'strong', nbs_interest: 'aguas-pluviais',
      },
    }),
    turns: [
      { msg: 'Vamos começar o Encontro 3.' },
      { msg: 'É isso ✓', kind: 'chip' },
      { msg: 'Jardins de chuva', kind: 'chip' },
      { msg: 'Ainda não sei o tamanho', kind: 'chip' },
      { msg: 'Mutirão', kind: 'chip' },
      { msg: 'Teste.' },
      { msg: 'Teste.' },
      { msg: '6 meses', kind: 'chip' },
      { msg: 'A gente mesmo', kind: 'chip' },
      { msg: 'A gente mesmo', kind: 'chip' },
      { msg: 'Todo mês', kind: 'chip' },
      { msg: 'Ainda não sabemos', kind: 'chip' },
      { msg: 'Só essa por enquanto', kind: 'chip' },
    ],
  },
];

async function main() {
  const results = [];
  for (const org of ORGS) results.push(await drive(org));

  // An invited organisation that never answered. Three of the ten in the
  // hand-written report were exactly this, and the analysis must count it
  // without ever grouping it.
  const neverStarted: SynergyMember = {
    id: 'nunca-entrou', orgName: 'Associação Ponta Grossa', bairro: 'Ponta Grossa',
    siteName: null, hasSite: false, tenure: null, currentUse: null, worry: null,
    familias: [], solutions: [], roles: [], priorCollaboration: null, priorCollaborationDetail: null,
    nbsExperience: null, fundingScale: null, biggestBudget: null, maturityScore: 0, verdict: null,
    studyNeeds: [], bodies: [], docCount: 0, started: false,
    ownWords: { story: null, whyHere: null, baseline: null }, docs: [], correctionsPt: null,
  };

  // The same filter the route applies, in the same place: the test org stays on
  // the roster and out of the analysis.
  const all = [...results.map(r => r.member), neverStarted];
  const analysed = all.filter((m: any) => !m.excluded);
  const a = analyseSynergies(analysed as SynergyMember[]);

  console.log(`\n\n${'█'.repeat(78)}\n██  PORTFÓLIO DA REDE — o que o botão "mapear sinergias" calcula\n${'█'.repeat(78)}`);
  console.log(`\n  no quadro: ${all.length} organizações · fora da análise: ${all.length - analysed.length} · com dados: ${a.members.length}`);
  const excludedNames = (all as any[]).filter(m => m.excluded).map(m => m.orgName);
  console.log(`  ${excludedNames.length ? `fora: ${excludedNames.join(', ')}` : 'nenhuma exclusão'}`);
  const leaked = a.members.some(m => excludedNames.includes(m.orgName));
  console.log(`  ${leaked ? '❌ A ORGANIZAÇÃO DE TESTE VAZOU PARA A ANÁLISE' : '✅ organização de teste fora da análise'}`);

  console.log(`\n  ── AGRUPAMENTOS (${a.groups.length}) ──`);
  for (const g of a.groups) {
    const names = g.memberIds.map(id => a.members.find(m => m.id === id)?.orgName ?? id);
    console.log(`\n  [${g.axis}] ${g.key}\n     ${names.join(' + ')}`);
    for (const b of g.becausePt) console.log(`     · ${b}`);
    for (const c of g.complementsPt) console.log(`     + ${c}`);
  }
  const axes = new Set(a.groups.map(g => g.axis));
  console.log(`\n  eixos usados: ${Array.from(axes).join(', ') || '(nenhum)'}`);

  console.log(`\n  ── ONDE CONTRATAR JUNTO ECONOMIZA ──`);
  for (const p of a.pooledStudies) console.log(`  💰 ${p.need}\n       ${p.memberIds.map(id => a.members.find(m => m.id === id)?.orgName).join(', ')}`);
  for (const p of a.pooledBodies) console.log(`  🏛  ${p.body}: ${p.memberIds.map(id => a.members.find(m => m.id === id)?.orgName).join(', ')}`);
  if (!a.pooledStudies.length && !a.pooledBodies.length) console.log('  (nada em comum)');

  console.log(`\n  ── PAPÉIS TRANSVERSAIS ──`);
  for (const t of a.transversal) console.log(`  · [${t.kind}] ${t.notePt}`);

  console.log(`\n  ── DENOMINADORES COMUNS ──`);
  for (const c of a.commonPt) console.log(`  · ${c}`);

  console.log(`\n  ── LACUNAS ──`);
  for (const g of a.gapsPt) console.log(`  ! ${g}`);

  // What a silent join failure looks like: facts that came back empty for an
  // organisation that plainly answered.
  console.log(`\n  ── A JUNÇÃO W3 → PORTFÓLIO (o que a análise leu de cada uma) ──`);
  for (const r of results) {
    const f: any = r.facts;
    const missing = [
      f.solutions.length ? '' : 'soluções',
      f.roles.length ? '' : 'papéis',
      f.ownWords.whyHere ? '' : 'por que aqui',
      f.ownWords.baseline ? '' : 'como está hoje',
      f.familias.length ? '' : 'famílias',
      f.tenure ? '' : 'posse',
    ].filter(Boolean);
    console.log(`  ${r.member.orgName}: ${f.solutions.length} solução(ões), ${f.studyNeeds.length} estudo(s), ${f.bodies.length} órgão(s)${missing.length ? `  ⚠️ vazio: ${missing.join(', ')}` : ''}`);
  }

  const problems = results.flatMap(r => r.problems.map(p => `${r.member.orgName}: ${p}`));
  console.log(`\n  ── PROBLEMAS ──\n  ${problems.length ? problems.join('\n  ') : '(nenhum turno caiu fora do motor)'}`);
}
main();
