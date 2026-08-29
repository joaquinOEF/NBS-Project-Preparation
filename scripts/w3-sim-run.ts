import { run, mkState } from './w3-sim';

const E = 'Vamos começar o Encontro 3.';

async function main() {
// ── 1 · Sarandi: the richest W2 record. Public land + rain garden.
await run('1 · HORTA RAÍZES DO SARANDI — W2 completo, terreno público, jardim de chuva',
  mkState({
    org_profile: { org_name: 'Horta Raízes do Sarandi', contact_name: 'Marlene Duarte', prior_project_scale: 'funded' },
    intervention_site: {
      bairro: 'Sarandi', site_name: 'Terreno ao lado da horta', _site_lat: '-30.0906', _site_lng: '-51.1726',
      current_use: 'abandoned', land_tenure: 'public-informal', site_worry: 'alagamento',
      site_story: 'Quando chove forte a água entra pelo fundo e fica dias parada.',
      site_knowledge_depth: 'strong', nbs_interest: 'aguas-pluviais',
    },
  }), [
    { msg: E },
    { msg: 'É isso ✓', kind: 'chip' },
    { msg: 'Jardins de chuva', kind: 'chip' },
    { msg: 'Desenhar no mapa', kind: 'chip' },
    { msg: 'Map selection (composite mode):\n- [zone] Sarandi: FLOOD risk, flood: 80%, heat: 40%, landslide: 5%\n- [custom] Área desenhada (5 vertices) (drawn area) at (-30.0906, -51.1726) · 500 m²\nTotal: 2 assets, 0 sampled points', kind: 'map' },
    { msg: 'É o único terreno livre do quarteirão e é onde a água toda desce.' },
    { msg: 'Terra batida com entulho, sem drenagem. Depois da chuva fica poça três dias.' },
    { msg: 'Parceria com a prefeitura', kind: 'chip' },
    { msg: 'A cada três meses', kind: 'chip' },
    { msg: 'Ainda não sabemos', kind: 'chip' },
    { msg: 'Só essa por enquanto', kind: 'chip' },
  ]);

// ── 2 · Encosta Viva: never marked a place.
await run('2 · COLETIVO ENCOSTA VIVA — sem lugar marcado, encosta',
  mkState({
    org_profile: { org_name: 'Coletivo Encosta Viva', contact_name: 'Antônia Reis' },
    intervention_site: { bairro: 'Glória', site_worry: 'landslide', site_knowledge_depth: 'thin' },
  }), [
    { msg: E },
    { msg: 'Seguir sem o lugar', kind: 'chip' },
    { msg: 'Ver todas as soluções', kind: 'chip' },
    { msg: 'Grade viva', kind: 'chip' },
    { msg: 'Ainda não sei o tamanho', kind: 'chip' },
    { msg: 'Prefiro pular', kind: 'chip' },
    { msg: 'O barranco fica logo atrás das casas e desce um pouco a cada chuva.' },
    { msg: 'Voluntários da comunidade', kind: 'chip' },
    { msg: 'Todo mês', kind: 'chip' },
    { msg: 'Ainda não sabemos', kind: 'chip' },
    { msg: 'Só essa por enquanto', kind: 'chip' },
  ]);

// ── 3 · Vila Nova: school yard, per-project pricing.
await run('3 · ASSOCIAÇÃO CULTURAL VILA NOVA — pátio de escola, horta',
  mkState({
    org_profile: { org_name: 'Associação Cultural Vila Nova', contact_name: 'Jussara Lima' },
    intervention_site: {
      bairro: 'Vila Nova', site_name: 'Pátio da EMEF Nossa Senhora', _site_lat: '-30.13', _site_lng: '-51.22',
      current_use: 'paved', land_tenure: 'public-informal', site_worry: 'heat',
      site_story: 'O pátio é todo cimento, as crianças não têm sombra nenhuma no recreio.',
      site_knowledge_depth: 'strong', nbs_interest: 'agricultura-urbana, verde-urbano',
    },
  }), [
    { msg: E },
    { msg: 'É isso ✓', kind: 'chip' },
    { msg: 'Hortas urbanas', kind: 'chip' },
    { msg: 'É o pátio da escola do bairro, onde as crianças já passam todo dia.' },
    { msg: 'Metade cimento, metade terra pisada. Só tem uma árvore no canto.' },
    { msg: 'Parceria com a prefeitura', kind: 'chip' },
    { msg: 'Todo mês', kind: 'chip' },
    { msg: 'Editais e projetos', kind: 'chip' },
    { msg: 'Só essa por enquanto', kind: 'chip' },
  ]);

// ── 4 · Partenon: own land, legacy worry id, wants two solutions.
await run('4 · REDE PARTENON — terreno próprio, worry legado "flood", duas soluções',
  mkState({
    org_profile: { org_name: 'Rede Partenon', contact_name: 'Cléber Assis', prior_project_scale: 'funded' },
    intervention_site: {
      bairro: 'Partenon', site_name: 'Terreno da sede', _site_lat: '-30.07', _site_lng: '-51.15',
      current_use: 'vegetated', land_tenure: 'private-owned', site_worry: 'flood',
      site_story: 'A água desce com força da rua de cima e leva a terra toda.',
      site_knowledge_depth: 'strong', nbs_interest: 'aguas-pluviais, agricultura-urbana',
    },
  }), [
    { msg: E },
    { msg: 'É isso ✓', kind: 'chip' },
    { msg: 'Hortas urbanas', kind: 'chip' },
    { msg: 'É onde a gente já planta há seis anos e onde a água desce.' },
    { msg: 'Terreno com mato alto e um barranco de dois metros no fundo.' },
    // ⚠️ typed, not tapped: the chip is correctly absent on own land, and this
    // is the path that used to write it anyway.
    { msg: 'Parceria com a prefeitura', kind: 'chip' },
    { msg: 'A gente mesmo', kind: 'chip' },
    { msg: 'Todo mês', kind: 'chip' },
    { msg: 'Recursos próprios', kind: 'chip' },
    { msg: 'Levar mais uma solução', kind: 'chip' },
    { msg: 'Biovaletas', kind: 'chip' },
  ]);

// ── 5 · A thin W2: bairro only, nothing else. The most common real state.
await run('5 · GRUPO MISTURAÍ — W2 magro: só o bairro, sem relato, sem interesse marcado',
  mkState({
    org_profile: { org_name: 'Grupo Misturaí' },
    intervention_site: { bairro: 'Rubem Berta' },
  }), [
    { msg: E },
    { msg: 'Seguir sem o lugar', kind: 'chip' },
    { msg: 'Jardins de chuva', kind: 'chip' },
    { msg: 'Ainda não sei o tamanho', kind: 'chip' },
    { msg: 'Prefiro pular', kind: 'chip' },
    { msg: 'Prefiro pular', kind: 'chip' },
    { msg: 'A gente mesmo', kind: 'chip' },
    { msg: 'Uma vez por ano', kind: 'chip' },
    { msg: 'Ainda não sabemos', kind: 'chip' },
    { msg: 'Só essa por enquanto', kind: 'chip' },
  ]);

// ── 6 · A licenca slope solution, in English, on own land.
await run('6 · SLOPE COLLECTIVE (en) — own land, retaining wall, licenca solution',
  mkState({
    org_profile: { org_name: 'Slope Collective', contact_name: 'Dora Neves' },
    intervention_site: {
      bairro: 'Lomba do Pinheiro', site_name: 'Barranco atrás da sede', _site_lat: '-30.11', _site_lng: '-51.10',
      current_use: 'slope', land_tenure: 'private-owned', site_worry: 'landslide',
      site_story: 'The slope behind the building sheds earth every heavy rain.',
      site_knowledge_depth: 'strong', nbs_interest: 'encostas-e-solo',
    },
  }, 'en'), [
    { msg: "Let's start Encontro 3." },
    { msg: "That's it ✓", kind: 'chip' },
    { msg: 'Green retaining wall', kind: 'chip' },
    { msg: "I don't know the size yet", kind: 'chip' },
    { msg: 'The houses above us are right on the edge of it.' },
    { msg: 'Bare earth, two metres high, nothing planted.' },
    { msg: 'Community volunteers', kind: 'chip' },
    { msg: 'Quarterly', kind: 'chip' },
    { msg: 'Not decided yet', kind: 'chip' },
    { msg: 'Just this one for now', kind: 'chip' },
  ], 'en');
}
main();
