// Teaching copy + croqui illustrations for the six NBS_INTERVENTION_TYPES.
//
// Shown by NbsTypeStrip (collapsed card) and NbsTypeSheet ("Saber mais").
// Design record + rationale: docs/nbs-type-content-model.md
//
// Two rules govern everything here:
//
//   1. Plain syntax, full substance. Short sentences, concrete verbs, no
//      bureaucratic fog — AND real cost ranges, real tenure rules, the actual
//      body you have to write to, and an honest answer about mosquitoes. We
//      simplify the grammar. We never simplify the content.
//
//   2. Teach the term, don't hide it. E2 exists to `criar repertório` — to give
//      a CBO leader the words to argue their case with a technician at SMAMUS.
//      Each section opens with the real term, glossed once, then uses it.
//
// Numbers we could not source to a Brazilian reference carry `estimated: true`
// and render a visible "estimado" marker. No unmarked placeholder ships.
//
// ⚠️ DEP does not exist. Porto Alegre's Departamento de Esgotos Pluviais was
// extinguished in 2017 (LC 817/2017); drainage sits with DMAE. Many sources
// online are stale on this.

import type { NbsInterventionTypeId } from './cbo-schema';

/** Who can actually build it — the third card chip. Not cost: at community
 *  scale all six are affordable, and the binding constraint is permitting,
 *  land-tenure standing, and a credible maintenance owner. */
export type NbsDelivery = 'mutirao' | 'parceria' | 'licenca';

/** Which composition the croqui uses, following where the mechanism lives. */
export type NbsDrawingKind = 'cutaway' | 'before-after' | 'surface';

export type NbsCostBand = 'baixo' | 'medio' | 'alto';

export interface NbsRequirement {
  label: string;
  value: string;
  /** Renders an "estimado" marker — figure is inferred, not sourced to Brazil. */
  estimated?: boolean;
}

export interface NbsTypeCopy {
  /** One promise, present tense. The card's only prose. */
  benefit: string;
  /** The technical term, defined once. */
  gloss: string;
  antesCaption: string;
  depoisCaption: string;
  changes: string[];
  requirements: NbsRequirement[];
  cost: string;
  costEstimated?: boolean;
  /** The honest failure mode, including mosquitoes where relevant. */
  failure: string;
  /** Names the sibling type most likely to be confused with this one. */
  notThis: string;
  example: string;
  altBefore: string;
  altAfter: string;
}

export interface NbsTypeContent {
  delivery: NbsDelivery;
  drawing: NbsDrawingKind;
  costBand: NbsCostBand;
  pt: NbsTypeCopy;
  en: NbsTypeCopy;
}

/** `/assets/nbs/types/<id>.jpg` and `<id>--before.jpg` — both always exist. */
export function nbsIllustration(
  id: NbsInterventionTypeId,
  state: 'before' | 'after'
): string {
  return `/assets/nbs/types/${id}${state === 'before' ? '--before' : ''}.jpg`;
}

export const NBS_TYPE_CONTENT: Record<NbsInterventionTypeId, NbsTypeContent> = {
  'bioswales-rain-gardens': {
    delivery: 'mutirao',
    drawing: 'cutaway',
    costBand: 'baixo',
    pt: {
      benefit: 'A chuva entra na terra em vez de correr pra rua.',
      gloss:
        'Biovaleta — uma canaleta com plantas que faz a água da chuva entrar na terra.',
      antesCaption: 'Hoje: a chuva corre pela rua e o bueiro entope.',
      depoisCaption: 'Depois: a água entra na terra e some em poucas horas.',
      changes: [
        'A rua alaga menos e sobra menos lama.',
        'As plantas filtram a água suja que vem do asfalto.',
        'A calçada fica mais verde e mais fresca.',
      ],
      requirements: [
        {
          label: 'Espaço',
          value:
            'um jardim de 4 a 15 m², ou uma canaleta de 20 a 40 m ao longo da quadra',
        },
        {
          label: 'Chão',
          value:
            'a água precisa entrar entre 7 e 200 mm por hora, e o lençol freático tem que estar 1 m abaixo do fundo',
        },
        {
          label: 'Dono do terreno',
          value:
            'mais fácil no pátio de uma escola, igreja ou associação. Na calçada, passa pela SMAMUS e pelo DMAE',
        },
        {
          label: 'Tempo',
          value:
            '4 a 12 semanas de projeto e licença. A obra em si é 1 dia de mutirão',
        },
        {
          label: 'Quem cuida',
          value:
            'os vizinhos. Tirar lixo e areia da entrada 1 a 2 vezes por ano, e depois de toda chuva forte',
        },
      ],
      cost: 'Um jardim de chuva de 10 a 15 m² feito em mutirão custa cerca de R$ 4 mil a R$ 12 mil só de material.',
      costEstimated: true,
      failure:
        'Entope. Onde o caminhão de lixo não passa, o lixo e a areia tapam a entrada e a água deixa de infiltrar. Regra de ouro: tem que secar em até 48 horas. O mosquito da dengue precisa de uns 3 dias de água parada pra virar larva — se a água some antes, não vira criadouro.',
      notThis:
        'Não é o banhado. Aqui a água passa e some no chão — ela não fica.',
      example:
        'Belo Horizonte, Barreiro: o 1º jardim de chuva feito em mutirão com moradores, em frente a uma escola (2025).',
      altBefore:
        'Rua de bairro com meio-fio inteiro. A chuva corre pela sarjeta e empoça sobre um bueiro entupido de folhas e lixo.',
      altAfter:
        'A mesma rua com uma canaleta plantada, rebaixada abaixo da calçada. O chão está aberto em corte, mostrando camadas de terra e brita, e setas de água entrando na terra.',
    },
    en: {
      benefit: 'Rain soaks into the ground instead of running down the street.',
      gloss:
        'Bioswale — a planted channel that lets rainwater soak into the ground.',
      antesCaption: 'Today: rain runs down the street and the drain clogs.',
      depoisCaption: 'After: the water soaks in and is gone within hours.',
      changes: [
        'The street floods less, and there is less mud.',
        'Plants filter the dirty water coming off the asphalt.',
        'The sidewalk gets greener and cooler.',
      ],
      requirements: [
        {
          label: 'Space',
          value: 'a 4–15 m² garden, or a 20–40 m channel along the block',
        },
        {
          label: 'Ground',
          value:
            'water must soak in at 7–200 mm per hour, and the water table must sit 1 m below the base',
        },
        {
          label: 'Land',
          value:
            'easiest in a school, church or association yard. On the sidewalk it goes through SMAMUS and DMAE',
        },
        {
          label: 'Time',
          value:
            '4–12 weeks of design and permitting. The build itself is one mutirão day',
        },
        {
          label: 'Who maintains it',
          value:
            'the neighbours. Clear litter and silt from the inlet 1–2× a year, and after every heavy rain',
        },
      ],
      cost: 'A 10–15 m² rain garden built in a mutirão costs roughly R$ 4,000 to R$ 12,000 in materials.',
      costEstimated: true,
      failure:
        'It clogs. Where refuse collection does not reach, litter and silt block the inlet and water stops infiltrating. Golden rule: it must drain within 48 hours. Dengue mosquitoes need about 3 days of standing water to hatch — if the water is gone before that, it cannot breed.',
      notThis:
        'Not a wetland. Here the water passes through and soaks away — it does not stay.',
      example:
        'Belo Horizonte, Barreiro: the first rain garden built in a mutirão with residents, outside a school (2025).',
      altBefore:
        'A neighbourhood street with an unbroken curb. Rain runs along the gutter and pools over a storm drain choked with leaves and litter.',
      altAfter:
        'The same street with a planted channel recessed below the sidewalk. The ground is cut open to show soil and gravel layers, with arrows of water soaking downward.',
    },
  },

  'flood-parks': {
    delivery: 'parceria',
    drawing: 'before-after',
    costBand: 'medio',
    pt: {
      benefit:
        'Uma praça que vira bacia na chuva e volta a ser praça no dia seguinte.',
      gloss:
        'Bacia de detenção — um fundo rebaixado que guarda a enchente por algumas horas e depois esvazia.',
      antesCaption:
        'Hoje: a praça é plana. A chuva escorre pra rua e entra nas casas.',
      depoisCaption:
        'Depois: a praça é uma bacia rasa. A água fica ali e escoa devagar.',
      changes: [
        'A água para na praça, não dentro da sua casa.',
        'No tempo seco continua quadra, caminho e sombra.',
        'Bacia aberta custa 3 a 7 vezes menos que a enterrada.',
      ],
      requirements: [
        {
          label: 'Espaço',
          value:
            '200 a 1.000 m². A bacia é 5 a 10% da área de cimento que ela recebe',
        },
        {
          label: 'Chão',
          value:
            '1,2 m entre o fundo e o lençol freático, e 3 m de distância das casas',
        },
        {
          label: 'Dono do terreno',
          value:
            'praça pública. Associação de bairro pode adotar pelo Termo de Adoção (Lei 12.583/2019)',
        },
        {
          label: 'Quem autoriza',
          value: 'SMAMUS, e o DMAE analisa a entrada e a saída da água',
        },
        {
          label: 'Tempo',
          value:
            '2 a 5 meses de projeto e licença. Obra de dias a poucas semanas',
        },
        {
          label: 'Quem cuida',
          value: 'roçada, tirar lixo, e desassorear a entrada 1 vez por ano',
        },
      ],
      cost: 'Bacia aberta de 500 m² (uns 400 m³): R$ 60 mil a R$ 150 mil. Fuja da bacia enterrada — a da Praça Celso Luft, aqui em Porto Alegre, custou R$ 1,4 milhão.',
      costEstimated: true,
      failure:
        'Vira depósito de lixo entre uma chuva e outra — esse é o fim mais comum. Se a saída entope, fica água parada. Tem que esvaziar em até 48 horas. Bacia seca bem feita não cria dengue. Bacia abandonada, sim.',
      notThis:
        'Não é o banhado. A bacia fica seca quase o ano todo, e tem quadra e caminho dentro dela.',
      example:
        'Porto Alegre já tem bacias abertas, como a da Av. Polônia — mas nenhuma feita pela comunidade. A sua seria a primeira.',
      altBefore:
        'Uma praça de bairro totalmente plana debaixo de chuva forte. A água escorre pra rua em volta e bate nas portas das casas de tijolo. Moradores atravessam com água pelos tornozelos.',
      altAfter:
        'A mesma praça rebaixada em bacia de grama com degraus. A água fica na bacia, as traves de futebol aparecem acima dela, e os moradores olham secos da borda.',
    },
    en: {
      benefit:
        'A square that becomes a basin in the rain, and a square again the next day.',
      gloss:
        'Detention basin — a lowered floor that holds the flood for a few hours, then empties.',
      antesCaption:
        'Today: the square is flat. Rain runs into the street and into houses.',
      depoisCaption:
        'After: the square is a shallow basin. Water stays there and drains slowly.',
      changes: [
        'The water stops in the square, not inside your house.',
        'In dry weather it stays a pitch, a path and shade.',
        'An open basin costs 3–7× less than a buried one.',
      ],
      requirements: [
        {
          label: 'Space',
          value:
            '200–1,000 m². The basin is 5–10% of the paved area draining into it',
        },
        {
          label: 'Ground',
          value:
            '1.2 m between the floor and the water table, and 3 m clear of buildings',
        },
        {
          label: 'Land',
          value:
            'a public square. A neighbourhood association can adopt it (Termo de Adoção, Lei 12.583/2019)',
        },
        {
          label: 'Who approves',
          value: 'SMAMUS, with DMAE reviewing the inlet and outlet',
        },
        {
          label: 'Time',
          value:
            '2–5 months of design and permitting. Construction takes days to a few weeks',
        },
        {
          label: 'Who maintains it',
          value: 'mowing, litter removal, and de-silting the inlet once a year',
        },
      ],
      cost: 'An open 500 m² basin (about 400 m³): R$ 60,000 to R$ 150,000. Avoid the buried kind — Porto Alegre’s Praça Celso Luft basin cost R$ 1.4 million.',
      costEstimated: true,
      failure:
        'It becomes a rubbish dump between storms — the most common ending. If the outlet clogs, water sits. It must empty within 48 hours. A well-built dry basin does not breed dengue. An abandoned one does.',
      notThis:
        'Not a wetland. The basin is dry almost all year, and has a pitch and a path in it.',
      example:
        'Porto Alegre already has open basins, such as Av. Polônia — but none built by a community. Yours would be the first.',
      altBefore:
        'A completely flat neighbourhood square in heavy rain. Water sheets into the surrounding streets and laps at the doorways of brick houses. Residents wade ankle-deep.',
      altAfter:
        'The same square regraded into a terraced grass bowl. Water is held in the bowl, goalposts stand above it, and residents watch from the dry rim.',
    },
  },

  'green-corridors': {
    delivery: 'parceria',
    drawing: 'surface',
    costBand: 'medio',
    pt: {
      benefit:
        'Uma fita de árvores que liga dois verdes e faz sombra no caminho.',
      gloss:
        'Corredor verde — uma linha contínua de árvores que liga uma área verde a outra.',
      antesCaption:
        'Hoje: rua sem árvore. O asfalto ferve e ninguém anda a pé.',
      depoisCaption:
        'Depois: fileira de árvores, sombra, e caminho até a praça.',
      changes: [
        'Sombra — 96 de cada 100 moradores dizem que é o que mais querem.',
        'A rua fica de 2 a 8 graus mais fresca.',
        'Bicho, semente e abelha passam de um verde pro outro.',
      ],
      requirements: [
        {
          label: 'Espaço',
          value:
            'uns 300 m de rua, cerca de 40 árvores. Cada cova precisa de 1,5 m² de chão sem cimento',
        },
        {
          label: 'Onde não pode',
          value:
            'rua sem meio-fio; a menos de 7 m da esquina, 4 m do poste, 2 m da boca de lobo',
        },
        {
          label: 'Quem autoriza',
          value:
            'a rua é pública. Plantar sem autorização da SMAMUS é proibido. A associação pede pela via “Instituições”',
        },
        {
          label: 'Muda',
          value:
            'o Viveiro Municipal pode doar. Embaixo do fio, só árvore pequena, até 6 m',
        },
        {
          label: 'Tempo',
          value:
            'pedido feito depois de agosto costuma só sair em maio do ano seguinte. Plante entre maio e agosto',
        },
        {
          label: 'Quem cuida',
          value:
            'rega semanal nos 2 primeiros verões. A SMAMUS não rega árvore de rua',
        },
      ],
      cost: 'R$ 250 a R$ 500 por árvore já plantada, com berço, tutor e protetor de metal até o 3º ano. As mudas podem sair de graça do Viveiro Municipal.',
      costEstimated: true,
      failure:
        'Sem rega, morre. Em Porto Alegre, 25% das mudas morrem nos 6 primeiros meses e mais 15% no segundo ano. O vandalismo leva 20% no primeiro ano. Árvore grande embaixo do fio vira poda feia todo ano. E a roçadeira decepa muda nova.',
      notThis:
        'Não é a floresta urbana. O corredor é uma linha que liga dois verdes.',
      example:
        'O novo Plano Diretor de Porto Alegre prevê plantio de árvores em área pública pela própria comunidade.',
      altBefore:
        'Rua de bairro sem nenhuma árvore ao meio-dia. O canteiro central é uma faixa de concreto rachado com mato seco. Carros estacionados, e uma pessoa se encolhe na sombra fina do muro.',
      altAfter:
        'A mesma rua com um canteiro central plantado de ipês floridos, um caminho de pedestres e ciclistas na sombra, seguindo até uma área verde ao fundo.',
    },
    en: {
      benefit:
        'A ribbon of trees linking two green places, with shade along the way.',
      gloss:
        'Green corridor — a continuous line of trees connecting one green area to another.',
      antesCaption:
        'Today: a street with no trees. The asphalt bakes and nobody walks.',
      depoisCaption: 'After: a row of trees, shade, and a path to the square.',
      changes: [
        'Shade — 96 in 100 residents say it is what they want most.',
        'The street runs 2–8 degrees cooler.',
        'Animals, seeds and bees move from one green patch to the next.',
      ],
      requirements: [
        {
          label: 'Space',
          value:
            'about 300 m of street, roughly 40 trees. Each pit needs 1.5 m² of unpaved ground',
        },
        {
          label: 'Where you cannot',
          value:
            'streets with no curb; within 7 m of a corner, 4 m of a pole, 2 m of a storm drain',
        },
        {
          label: 'Who approves',
          value:
            'the street is public. Planting without SMAMUS authorisation is illegal. Associations apply via the “Instituições” route',
        },
        {
          label: 'Saplings',
          value:
            'the Viveiro Municipal may donate them. Under power lines, only small species, up to 6 m',
        },
        {
          label: 'Time',
          value:
            'requests after August are usually only served the following May. Plant between May and August',
        },
        {
          label: 'Who maintains it',
          value:
            'weekly watering through the first two summers. SMAMUS does not water street trees',
        },
      ],
      cost: 'R$ 250 to R$ 500 per planted tree, including the pit, stake and metal guard through year three. Saplings may be free from the Viveiro Municipal.',
      costEstimated: true,
      failure:
        'Without watering, they die. In Porto Alegre 25% of saplings die in the first six months and another 15% in the second year. Vandalism takes 20% in year one. A large tree under a power line means an ugly pruning every year. And mowing crews decapitate young saplings.',
      notThis:
        'Not an urban forest. A corridor is a line linking two green places.',
      example:
        'Porto Alegre’s new Plano Diretor provides for community tree planting on public land.',
      altBefore:
        'A treeless neighbourhood street at midday. The central median is a strip of cracked concrete and dry weeds. Cars are parked along it and one person hugs the thin shade of a wall.',
      altAfter:
        'The same street with a planted median of flowering ipê trees, a walking and cycling path in the shade, running toward a green area in the distance.',
    },
  },

  'green-roofs-walls': {
    delivery: 'mutirao',
    drawing: 'cutaway',
    costBand: 'baixo',
    pt: {
      benefit: 'Planta em cima da laje: casa mais fresca e menos água na rua.',
      gloss:
        'Telhado verde — uma camada fina de planta sobre a laje. Não é horta, e não precisa de terra.',
      antesCaption:
        'Hoje: a laje pelada esquenta e a chuva desce direto pra rua.',
      depoisCaption:
        'Depois: uma camada fina de planta refresca a casa e segura parte da chuva.',
      changes: [
        'A casa fica bem mais fresca. Menos ventilador, menos ar-condicionado.',
        'Parte da chuva fica no telhado em vez de descer pro asfalto.',
        'A laje dura mais, protegida do sol.',
      ],
      requirements: [
        { label: 'Espaço', value: '30 a 60 m² de laje plana' },
        {
          label: 'Peso',
          value:
            'atenção: laje de casa costuma aguentar só 100 kg por m². Telhado verde com terra pesa 70 a 170 kg/m² molhado',
        },
        {
          label: 'Por isso',
          value:
            'sem cálculo de engenheiro, use o método hidropônico (manta de bidim sobre a telha). Ele quase não pesa e não mexe na impermeabilização',
        },
        {
          label: 'Dono do terreno',
          value:
            'é a sua casa. Não precisa de licença. Se for com terra, precisa de ART ou RRT de um engenheiro',
        },
        { label: 'Tempo', value: 'um fim de semana de mutirão' },
        {
          label: 'Quem cuida',
          value: 'tirar mato todo mês no verão e manter o ralo limpo',
        },
        {
          label: 'Bônus',
          value: 'IPTU Verde (LC 974/2023): 3% a 10% de desconto no IPTU',
        },
      ],
      cost: 'Método bidim: cerca de R$ 5 por m² de material — uns R$ 150 a R$ 300 no total. Com terra e manta: R$ 1,5 mil a R$ 6 mil. Sistema comprado pronto: R$ 150 a R$ 350 por m².',
      failure:
        'Se a impermeabilização falhar, infiltra e a laje mofa por dentro. Terra encharcada pesa demais e racha a laje. Foi exatamente por isso que o Teto Verde Favela, no Parque Arará (RJ), criou o método de bidim que não toca na manta.',
      notThis: 'É o único dos seis que não fica no chão.',
      example:
        'Teto Verde Favela, Rio de Janeiro: Luis Cassiano cobriu mais de 20 lajes a R$ 5 o metro, sem dinheiro de fora.',
      altBefore:
        'Uma casa comum de tijolo à vista com a laje plana pelada, manchada e rachada, batendo sol forte.',
      altAfter:
        'A mesma casa com um tapete baixo de plantas na laje e uma parede verde na fachada. O canto do telhado está aberto em corte, mostrando a manta, a camada de drenagem e o substrato.',
    },
    en: {
      benefit:
        'Plants on the roof slab: a cooler house and less water in the street.',
      gloss:
        'Green roof — a thin layer of plants over the slab. Not a vegetable garden, and it needs no soil.',
      antesCaption:
        'Today: the bare slab bakes, and rain runs straight into the street.',
      depoisCaption:
        'After: a thin layer of plants cools the house and holds part of the rain.',
      changes: [
        'The house gets much cooler. Less fan, less air conditioning.',
        'Part of the rain stays on the roof instead of hitting the asphalt.',
        'The slab lasts longer, shielded from the sun.',
      ],
      requirements: [
        { label: 'Space', value: '30–60 m² of flat slab' },
        {
          label: 'Weight',
          value:
            'careful: a house slab usually carries only 100 kg per m². A soil-based green roof weighs 70–170 kg/m² when saturated',
        },
        {
          label: 'So',
          value:
            'without an engineer’s calculation, use the hydroponic method (a bidim mat over the tiles). It weighs almost nothing and never touches the waterproofing',
        },
        {
          label: 'Land',
          value:
            'it is your own house. No permit needed. With soil, you need an engineer’s ART or RRT',
        },
        { label: 'Time', value: 'one mutirão weekend' },
        {
          label: 'Who maintains it',
          value: 'weed monthly in summer, and keep the drain clear',
        },
        {
          label: 'Bonus',
          value: 'IPTU Verde (LC 974/2023): a 3–10% property-tax discount',
        },
      ],
      cost: 'Bidim method: about R$ 5 per m² in materials — roughly R$ 150 to R$ 300 in total. With soil and a membrane: R$ 1,500 to R$ 6,000. A ready-made commercial system: R$ 150 to R$ 350 per m².',
      failure:
        'If the waterproofing fails, water seeps in and the slab moulds from below. Saturated soil weighs too much and cracks the slab. That is exactly why Teto Verde Favela, in Parque Arará (Rio), invented the bidim method that never touches the membrane.',
      notThis: 'It is the only one of the six that is not on the ground.',
      example:
        'Teto Verde Favela, Rio de Janeiro: Luis Cassiano has covered more than 20 roofs at R$ 5 per metre, with no outside funding.',
      altBefore:
        'An ordinary exposed-brick house with a bare, stained, cracked flat slab baking in hard sun.',
      altAfter:
        'The same house with a low mat of plants on the slab and a living wall on the facade. The roof corner is cut open, showing the membrane, drainage layer and substrate.',
    },
  },

  'urban-forests': {
    delivery: 'mutirao',
    drawing: 'surface',
    costBand: 'medio',
    pt: {
      benefit: 'Um terreno baldio vira mata fechada em 2 a 3 anos.',
      gloss: 'Floresta de bolso — mata nativa bem densa num terreno pequeno.',
      antesCaption: 'Hoje: terreno baldio com entulho, mato seco e lixo.',
      depoisCaption:
        'Depois: mata fechada, sombra, e um caminho de terra por dentro.',
      changes: [
        'Sombra e ar mais fresco — o que os moradores mais pedem.',
        'O chão para de escorrer e passa a beber a chuva.',
        'Volta passarinho, abelha e bicho pequeno.',
      ],
      requirements: [
        {
          label: 'Espaço',
          value:
            '100 a 500 m². Planta-se de 3 a 5 mudas por m² (método Miyawaki)',
        },
        {
          label: 'Chão',
          value:
            'análise e preparo do solo é obrigatório, e é o maior custo depois das mudas',
        },
        {
          label: 'Dono do terreno',
          value:
            'praça ou área verde pública, pelo Termo de Adoção. A SMAMUS escolhe as espécies e o local',
        },
        {
          label: 'Muda',
          value: 'se o Viveiro Municipal tiver a espécie, ela pode ser doada',
        },
        {
          label: 'Tempo',
          value: 'o plantio é 1 dia de mutirão. A mata fecha em 2 a 3 anos',
        },
        {
          label: 'Quem cuida',
          value:
            '2 anos de rega, capina e controle de formiga. Sem isso, vira mato de novo',
        },
      ],
      cost: 'R$ 100 a R$ 230 por m². Uma floresta de 300 m² com 900 mudas fica em R$ 30 mil a R$ 70 mil, já contando os 2 anos de cuidado.',
      costEstimated: true,
      failure:
        'A formiga cortadeira é o inimigo número 1 — ela derruba a muda nova. Use porta-iscas: corta o custo do controle em até 80%. Depois vêm a seca dos 2 primeiros verões, a roçadeira da prefeitura, e o capim. Conte com replantar 15% a 25% no primeiro ano.',
      notThis: 'Não é o corredor verde. A floresta é um bloco onde você entra.',
      example:
        'Porto Alegre já tem a 1ª Floresta de Bolso: 600 m², 850 árvores nativas, na Praia de Belas (2025).',
      altBefore:
        'Terreno baldio entre duas casas de tijolo: chão seco e rachado, entulho, um sofá jogado, mato seco e sacolas presas numa cerca caída.',
      altAfter:
        'O mesmo terreno tomado por mata nativa densa. Na frente, cinco moradores plantam mudas com carrinho de mão, enxada e mudas em saquinhos.',
    },
    en: {
      benefit: 'A vacant lot becomes closed forest in 2 to 3 years.',
      gloss: 'Pocket forest — dense native woodland on a small plot.',
      antesCaption: 'Today: a vacant lot with rubble, dry weeds and litter.',
      depoisCaption:
        'After: closed forest, shade, and an earth path through it.',
      changes: [
        'Shade and cooler air — what residents ask for most.',
        'The ground stops shedding water and starts drinking it.',
        'Birds, bees and small animals come back.',
      ],
      requirements: [
        {
          label: 'Space',
          value: '100–500 m². Planted at 3–5 saplings per m² (Miyawaki method)',
        },
        {
          label: 'Ground',
          value:
            'soil testing and preparation is mandatory, and is the largest cost after the saplings',
        },
        {
          label: 'Land',
          value:
            'a public square or green area, via the Termo de Adoção. SMAMUS chooses the species and the site',
        },
        {
          label: 'Saplings',
          value:
            'if the Viveiro Municipal stocks the species, it may donate them',
        },
        {
          label: 'Time',
          value: 'planting is one mutirão day. The canopy closes in 2–3 years',
        },
        {
          label: 'Who maintains it',
          value:
            'two years of watering, weeding and ant control. Without that it reverts to scrub',
        },
      ],
      cost: 'R$ 100 to R$ 230 per m². A 300 m² forest with 900 saplings runs R$ 30,000 to R$ 70,000, including two years of care.',
      costEstimated: true,
      failure:
        'Leaf-cutter ants are enemy number one — they strip young saplings. Use bait stations: they cut control costs by up to 80%. Then come drought in the first two summers, the council’s mowing crew, and grass. Expect to replant 15–25% in year one.',
      notThis: 'Not a green corridor. A forest is a block you walk into.',
      example:
        'Porto Alegre already has its first Floresta de Bolso: 600 m², 850 native trees, at Praia de Belas (2025).',
      altBefore:
        'A vacant lot between two brick houses: dry cracked earth, rubble, a dumped sofa, dead weeds and plastic bags caught in a sagging fence.',
      altAfter:
        'The same lot filled with dense native forest. In the foreground five residents plant saplings with a wheelbarrow, a hoe and nursery bags.',
    },
  },

  'wetland-restoration': {
    delivery: 'licenca',
    drawing: 'before-after',
    costBand: 'alto',
    pt: {
      benefit:
        'O banhado volta: segura a cheia, filtra a água e traz bicho de volta.',
      gloss:
        'Banhado — água rasa e permanente, com taboa e junco crescendo dentro dela.',
      antesCaption:
        'Hoje: arroio sujo, barranco pelado, pneu e cano de esgoto.',
      depoisCaption:
        'Depois: água rasa com taboa e junco, garça, e uma passarela na margem.',
      changes: [
        'O banhado segura a cheia antes de ela chegar nas casas.',
        'As plantas limpam a água — tiram cerca de 80% da sujeira orgânica.',
        'Volta peixe, garça e libélula.',
      ],
      requirements: [
        {
          label: 'São duas coisas',
          value:
            'recuperar um banhado que já existe (barato) ou construir um jardim filtrante (caro). Não confunda',
        },
        {
          label: 'Espaço',
          value: '500 a 2.000 m² pra recuperar. 200 a 400 m² pra construir',
        },
        {
          label: 'Água',
          value:
            'precisa de água chegando o ano todo — arroio, nascente ou lençol alto. Sem água, seca e morre',
        },
        {
          label: 'Dono do terreno',
          value:
            'quase sempre APP. Diga recuperação, não construção: recuperar APP degradada é permitido e até incentivado',
        },
        {
          label: 'Quem autoriza',
          value:
            'SMAMUS (licenciamentoambiental@portoalegre.rs.gov.br). Obra dentro de APP precisa de licença completa e pode subir pra SEMA-RS',
        },
        {
          label: 'Tempo',
          value:
            '1 a 4 meses pra recuperar. 3 a 9 meses só de licença pra construir',
        },
        {
          label: 'Quem cuida',
          value:
            'tirar invasoras 2 a 4 vezes por ano, tirar lixo, cortar a taboa velha 1 a 2 vezes por ano',
        },
      ],
      cost: 'Recuperar 2.000 m²: R$ 20 mil a R$ 120 mil. Construir jardim filtrante: R$ 540 a R$ 1.410 por m² — 200 m² já passa de R$ 100 mil. Recuperar rende muito mais metro por real.',
      costEstimated: true,
      failure:
        'O medo do mosquito é justo, e a resposta é o desenho. O Aedes da dengue põe ovo em vasilha pequena e limpa, perto de casa — banhado grande, com peixe e água correndo, é péssimo lugar pra ele. O que dá mosquito é água parada, suja e cheia de lixo, ou seja, banhado abandonado. Mantenha a água correndo, os peixes vivos, o lixo fora e a taboa velha cortada. O risco maior nem é o mosquito: é virar depósito de lixo e depois ser aterrado.',
      notThis:
        'Não é o parque de retenção. Aqui a água fica sempre, com taboa e junco dentro dela.',
      example:
        'Retomada Kaingang Gãh Ré, Morro Santana: restauração liderada pela comunidade, com apoio do Fundo Casa “Reconstruir RS”.',
      altBefore:
        'Margem de arroio degradada: um filete de água suja entre barrancos pelados, pneus, plástico, um cano de concreto despejando esgoto, e um único urubu.',
      altAfter:
        'A mesma margem restaurada em banhado: água rasa tomada de taboa e junco, aguapé boiando, garças pescando, e moradores numa passarela de madeira.',
    },
    en: {
      benefit:
        'The wetland comes back: it holds the flood, filters the water, and brings wildlife home.',
      gloss:
        'Banhado — shallow, permanent water with cattail and rush growing up out of it.',
      antesCaption:
        'Today: a dirty stream, bare banks, tyres and a sewage pipe.',
      depoisCaption:
        'After: shallow water with cattail and rush, herons, and a boardwalk along the bank.',
      changes: [
        'The wetland holds the flood before it reaches the houses.',
        'The plants clean the water — removing about 80% of organic pollution.',
        'Fish, herons and dragonflies return.',
      ],
      requirements: [
        {
          label: 'These are two things',
          value:
            'restoring an existing wetland (cheap) or building a treatment wetland (expensive). Do not confuse them',
        },
        {
          label: 'Space',
          value: '500–2,000 m² to restore. 200–400 m² to build',
        },
        {
          label: 'Water',
          value:
            'it needs water arriving all year — a stream, a spring, or a high water table. Without water it dries and dies',
        },
        {
          label: 'Land',
          value:
            'almost always APP. Say restoration, not construction: restoring degraded APP is permitted and even encouraged',
        },
        {
          label: 'Who approves',
          value:
            'SMAMUS (licenciamentoambiental@portoalegre.rs.gov.br). Building inside APP needs full licensing and may escalate to SEMA-RS',
        },
        {
          label: 'Time',
          value:
            '1–4 months to restore. 3–9 months of licensing alone to build',
        },
        {
          label: 'Who maintains it',
          value:
            'pull invasives 2–4× a year, remove litter, cut back old cattail 1–2× a year',
        },
      ],
      cost: 'Restoring 2,000 m²: R$ 20,000 to R$ 120,000. Building a treatment wetland: R$ 540 to R$ 1,410 per m² — 200 m² already exceeds R$ 100,000. Restoration buys far more square metres per real.',
      costEstimated: true,
      failure:
        'The fear of mosquitoes is fair, and the answer is the design. Dengue’s Aedes lays its eggs in small, clean containers near houses — a large wetland with fish and moving water is terrible habitat for it. What breeds mosquitoes is stagnant, dirty, litter-filled water: an abandoned wetland. Keep the water moving, the fish alive, the litter out and the old cattail cut. The bigger risk is not the mosquito: it is becoming a dump, and then being filled in.',
      notThis:
        'Not a flood park. Here the water stays, always, with cattail and rush growing in it.',
      example:
        'Retomada Kaingang Gãh Ré, Morro Santana: community-led restoration, supported by Fundo Casa’s “Reconstruir RS”.',
      altBefore:
        'A degraded stream margin: a trickle of dirty water between bare eroded banks, tyres, plastic, a concrete pipe discharging sewage, and a single scavenging bird.',
      altAfter:
        'The same margin restored into a wetland: shallow water threaded with cattail and rush, floating water hyacinth, herons wading, and residents on a wooden boardwalk.',
    },
  },
};

export function getNbsTypeContent(
  id: NbsInterventionTypeId,
  lang: 'pt' | 'en'
) {
  const entry = NBS_TYPE_CONTENT[id];
  return { ...entry, copy: lang === 'pt' ? entry.pt : entry.en };
}
