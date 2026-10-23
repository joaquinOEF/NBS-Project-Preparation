// ============================================================================
// The Rede's data term — accepted in the platform, not signed (23 Oct 2026)
// ============================================================================
//
// Vila Flores, 23 Oct: the organisations will not sign the Portuguese data
// term; they accept it in the platform instead. The text below is the agreed
// document verbatim ("20261020_RedeSCbNPOA_Termo_Dados_Privacidade_Plataforma_
// PT_v3", Versão 1.0), including Section 10, which itself defines the
// mechanism: tick "Li e concordo…", click "Aceitar", and the platform keeps
// name, organisation, date and time, and version.
//
// Rules (docs/data-term.md):
//   · One acceptance per organisation per version — the person accepts "em
//     nome da organização". A new version is a new entry here, and every
//     organisation sees the gate again (Section 10, last paragraph).
//   · Never edit a published version's text. The stored hash would stop
//     matching what the organisation was shown; add a version instead.
//   · Portuguese only: this is the text the coalition agreed.
//
// Nothing here may carry contact details — the repo is public.

export interface DataTermSection {
  h: string;
  /** Paragraphs; a paragraph that is an array is a bullet list. */
  body: Array<string | string[]>;
}

export interface DataTermVersion {
  version: string;
  /** As printed at the foot of the term. */
  dated: string;
  title: string;
  network: string;
  intro: string;
  sections: DataTermSection[];
  /** Section 10's own wording — the checkbox must say exactly this. */
  checkbox: string;
}

const V1_0: DataTermVersion = {
  version: '1.0',
  dated: 'outubro de 2026',
  network: 'Rede SCbN POA',
  title: 'Termo de Dados e Privacidade da Plataforma',
  intro:
    'Este é o termo completo que anunciamos na plataforma. Ele explica, em linguagem simples, o que acontece com as informações que a sua organização registra aqui, quem tem acesso a elas e por quanto tempo você pode contar com a plataforma. Vale para todas as organizações da Rede SCbN POA que usam a plataforma.',
  sections: [
    {
      h: '1. O que você constrói e compartilha aqui',
      body: [
        'Na plataforma, você constrói o seu projeto passo a passo, da ideia inicial até o desenho completo. Você desenvolve o perfil da sua organização (incluindo informações públicas do seu site), a sua localização e o contexto da sua comunidade, as suas necessidades de financiamento e de apoio, e atualiza o desenho e o andamento do seu projeto conforme ele toma forma. Isso é material de trabalho de vocês e da coordenação da rede. Não é pesquisa sobre vocês.',
      ],
    },
    {
      h: '2. Como usamos essas informações',
      body: [
        'Usamos essas informações para:',
        [
          'Montar o projeto de vocês e identificar sinergias com os demais projetos da rede, encontrando oportunidades de combinar ou agregar projetos e construir uma estratégia conjunta de captação de recursos para todo o portfólio;',
          'Formar um panorama compartilhado e atualizado das necessidades da rede, para que possamos planejar o apoio a todas as organizações;',
          'Prestar contas sobre o portfólio geral de projetos a financiadores e parceiros, sempre de forma agregada (ver Seção 3).',
        ],
      ],
    },
    {
      h: '3. O que nunca faremos sem o seu consentimento por escrito',
      body: [
        'Não compartilharemos o seu projeto específico, os dados da sua organização nem a descrição da sua ideia de projeto com nenhum financiador, investidor ou terceiro fora do programa, seja para captação de recursos, seja para qualquer outra finalidade, sem antes consultar você e obter o seu consentimento por escrito. Nada é vendido, em nenhuma hipótese.',
        'Podemos compartilhar informações agregadas e não identificáveis sobre a rede como um todo (por exemplo, “12 projetos da rede trabalham com mitigação de enchentes”) sem consultar você a cada vez, porque isso não expõe os seus dados individuais nem identifica o seu projeto. Se em algum momento quisermos destacar o seu projeto especificamente, pelo nome, junto a um financiador, em um relatório ou em qualquer outro lugar, consultaremos você antes e pediremos o seu consentimento por escrito.',
      ],
    },
    {
      h: '4. Quem vê as suas informações',
      body: [
        'As suas informações ficam visíveis para as pessoas das equipes que apoiam diretamente o programa: Vila Flores, Open Earth Foundation, Pyxera Global, Bankers without Boundaries e as pessoas designadas por elas. Elas não ficam visíveis para as demais organizações da rede, além do que você escolher compartilhar nos encontros coletivos.',
      ],
    },
    {
      h: '5. Por quanto tempo você terá acesso à plataforma',
      body: [
        'A plataforma acompanha a preparação dos projetos, e o trabalho não termina em dezembro. O seu acesso está garantido, no mínimo, até 31 de dezembro de 2026. Se o programa continuar depois dessa data, esperamos estender o acesso na mesma medida, e confirmaremos isso com você com antecedência.',
        'Caso o acesso precise ser encerrado para a sua organização antes dessa data, avisaremos com pelo menos um mês de antecedência, e você poderá exportar as informações do seu projeto diretamente da plataforma antes do encerramento.',
      ],
    },
    {
      h: '6. Os seus direitos sobre os seus dados',
      body: [
        'A qualquer momento você pode baixar tudo o que registrou, pelo botão de exportar na própria plataforma. Para corrigir ou apagar os dados da sua organização, fale com a equipe do Vila Flores, que encaminha o pedido à Open Earth Foundation, responsável pela operação da plataforma.',
      ],
    },
    {
      h: '7. O seu projeto continua sendo seu',
      body: [
        'Nada neste termo transfere a titularidade do seu projeto ou da sua ideia para a Open Earth Foundation, a Pyxera Global, o Vila Flores, o Bankers without Boundaries ou qualquer outra parte. Você segue livre para levar o seu projeto adiante, buscar financiamento para ele e compartilhá-lo com outras pessoas fora da rede a qualquer momento.',
      ],
    },
    {
      h: '8. O compromisso de quem coordena a rede',
      body: [
        'As organizações que coordenam o programa assinaram entre si um acordo de uso de dados. Nesse acordo, todas as signatárias se comprometem a usar e compartilhar as informações registradas aqui apenas das formas descritas nas Seções 2, 3 e 4 deste termo. Os compromissos de operação da plataforma, descritos nas Seções 5 e 6, são da Open Earth Foundation, que opera a plataforma e é a única parte capaz de executá-los. O acordo é assinado pelo Vila Flores, pela Open Earth Foundation, pela Pyxera Global, pelas pessoas por ela contratadas e pelo Bankers without Boundaries. Você pode pedir uma cópia dele à equipe do Vila Flores a qualquer momento.',
      ],
    },
    {
      h: '9. Dúvidas ou preocupações',
      body: [
        'Se algo neste termo não estiver claro, ou se em algum momento você sentir que os seus dados foram usados de forma diferente do que está escrito aqui, fale com a equipe do Vila Flores. Ela é o ponto de contato da rede, leva a questão às demais organizações que assinaram o acordo, e todas se comprometem a tratar o assunto com rapidez.',
      ],
    },
    {
      h: '10. Ciência e concordância',
      body: [
        'Este termo fica disponível na plataforma para consulta a qualquer momento. Ao marcar a opção “Li e concordo com o Termo de Dados e Privacidade da Plataforma” e clicar em “Aceitar”, a pessoa que usa a plataforma em nome da sua organização confirma que está autorizada a fazê-lo e registra a ciência e a concordância da organização com os compromissos descritos acima. A plataforma guarda o registro de cada aceite: o nome de quem aceitou, a organização, a data e a hora, e a versão do termo.',
        'A Pyxera Global, as pessoas por ela contratadas e o Bankers without Boundaries não são parte deste termo: os compromissos deles com as organizações estão no acordo de uso de dados descrito na Seção 8.',
        'Se este termo for alterado, avisaremos você na plataforma e pediremos um novo aceite antes que as mudanças passem a valer para a sua organização.',
      ],
    },
  ],
  checkbox: 'Li e concordo com o Termo de Dados e Privacidade da Plataforma',
};

/** Newest first. A new version goes on top; published ones are never edited. */
export const DATA_TERM_VERSIONS: DataTermVersion[] = [V1_0];
export const DATA_TERM: DataTermVersion = DATA_TERM_VERSIONS[0];

/** The exact text an organisation is shown, as one string — what the stored
 *  hash is taken over, so a record proves which words were on the screen. */
export function dataTermPlainText(v: DataTermVersion = DATA_TERM): string {
  const parts = [v.network, v.title, v.intro];
  for (const s of v.sections) {
    parts.push(s.h);
    for (const b of s.body) parts.push(Array.isArray(b) ? b.map(x => `• ${x}`).join('\n') : b);
  }
  parts.push(`Versão ${v.version}, ${v.dated}`);
  return parts.join('\n\n');
}

/** What the org page and the board learn about an organisation's acceptance. */
export interface DataTermStatus {
  version: string;
  accepted: { name: string; role: string; at: string } | null;
}

export const DATA_TERM_NAME_MAX = 120;
