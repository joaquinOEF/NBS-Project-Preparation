import { test, expect } from '@playwright/test';
import {
  CONTEXT_SOURCES, MODEL_PASSES, undeclaredPairs, contextGaps,
  type ContextSource,
} from '../shared/context-sources';
import * as fs from 'node:fs';

// ⚠️ DECLINING A SOURCE IS LEGITIMATE. FORGETTING ONE IS NOT.
//
// The failure this guards is a silence, not a bug: a pass that never consumes a
// source nobody remembered it could have. No stack trace, no failing test, no
// angry user — the output is merely thinner than it could have been, and thinner
// in a way only someone holding the whole record can see. Four of the five
// passes were in that state when this file was written, including the one whose
// job is to find what a cohort has in common.
//
// See docs/context-first.md.

test.describe('every model pass declares what it does with every source', () => {
  test('⚠️ nothing is left undecided', () => {
    // Adding a source to the catalogue forces every pass to say something about
    // it. That is the whole mechanism — the check exists to make a new source
    // impossible to add quietly.
    const undeclared = undeclaredPairs();
    expect(
      undeclared,
      undeclared.map(u => `${u.pass} has not decided about "${u.source}"`).join('\n'),
    ).toEqual([]);
  });

  test('a refusal carries its reason, and the reason is a sentence', () => {
    // "declines: true" is a silence with better manners. What makes a refusal
    // reviewable is why — a reader six months from now has to be able to
    // disagree with it.
    for (const p of MODEL_PASSES) {
      for (const [source, use] of Object.entries(p.sources) as Array<[ContextSource, any]>) {
        if (use.state === 'uses') continue;
        expect(use.because?.length ?? 0, `${p.id} · ${source}`).toBeGreaterThan(25);
      }
    }
  });

  test('every pass points at a file that exists', () => {
    for (const p of MODEL_PASSES) {
      expect(fs.existsSync(p.file), `${p.id} → ${p.file}`).toBe(true);
      expect(p.purpose.length, p.id).toBeGreaterThan(20);
    }
  });

  test('every source in the catalogue is described, not just named', () => {
    for (const [id, description] of Object.entries(CONTEXT_SOURCES)) {
      expect(description.length, id).toBeGreaterThan(20);
    }
  });

  test('the gaps are reported — loudly, and without failing the suite', () => {
    // ⚠️ Deliberately NOT an assertion that the list is empty. A gap is a
    // backlog item, and a red suite that everyone learns to ignore protects
    // nothing. What matters is that the number is printed on every run and
    // cannot drift upward unnoticed.
    const gaps = contextGaps();
    console.log(`\n[context-first] ${gaps.length} fonte(s) que um passe deveria usar e ainda não usa:`);
    for (const g of gaps) console.log(`  · ${g.pass} ← ${g.source}: ${g.because}`);
    // The ratchet: this number may fall freely and may only rise deliberately.
    // The ratchet, lowered as gaps close: 13 → 10 when the synergy pass gained
    // the concept notes, the knowledge slice and the documents themselves.
    // 13 → 10 (the synergy pass gained the cohort's own artefacts) → 7 (photos
    // and documents reach the concept note pre-digested as observations).
    // 13 → 10 (the cohort's own artefacts) → 7 (photos and documents,
    // pre-digested) → 6 (the cohort layer, as counts through an allowlist) → 5
    // (the concept note carries those counts too, which is where a funder
    // actually reads the programme's argument) → 4 (the advisor reads the
    // approval routes and the funding landscape, so a "gap" it names is a gap
    // against what a body actually requires).
    // → 0. The W2 ranker reads the chat and the documents properly, and the
    // synergy pass reads the photographs the only way it safely can: as the
    // advisor's pre-digested observations. Zero is not "finished" — it means
    // every pass has DECIDED about every source, which is all this was ever
    // asking for.
    expect(gaps.length, 'gaps rose — either close it or change the ceiling on purpose').toBeLessThanOrEqual(0);
  });

  test('the pass that finds what a cohort shares reads what the cohort produced', () => {
    // Was JVP’s hypothesis and a named gap: the concept notes never reached the
    // synergy pass, though section 7’s approval routes and the funding paths are
    // precisely the pooling material. Closed — and asserted so it stays closed.
    const synergy = MODEL_PASSES.find(p => p.id === 'synergyReport')!;
    expect(synergy.sources.artefacts.state).toBe('uses');
    expect(synergy.sources.knowledge.state).toBe('uses');
    expect(synergy.sources.docFullText.state).toBe('uses');
  });
});

// ── The funding landscape, as the workshop taught it ────────────────────────
// "Como Desbloquear Financiamento para SbN em Nível Local — Do Piloto ao
// Portfólio", COUGAR · PxG ↔ OEF ↔ BwB, 26 de agosto de 2026. The workshop told
// eighteen organisations, once, in a room. The record already holds what decides
// eligibility for most of it.
import { FUNDING_PATHS, fundingMatches, FUNDING_CAVEAT, AGGREGATION_ARGUMENT } from '../shared/funding-sources';
import { buildConceptNote } from '../shared/concept-note';
import { buildContextMarkdown } from '../server/services/contextBundle';

test.describe('the funding landscape reaches the organisation', () => {
  const org = (extra: Record<string, string>) => ({
    site: { bairro: 'Partenon', site_name: 'Pátio', _site_lat: '-30.05', _site_lng: '-51.19',
      current_use: 'paved', land_tenure: 'formal-agreement', site_worry: 'alagamento',
      site_story: 'Alaga.', site_knowledge_depth: 'strong', site_area_m2: '400' },
    org: { org_name: 'Org', contact_name: 'Ana', ...extra },
    solutions: ['hortas-urbanas'],
    w3: { construction_model: 'mutirao', intervention_units: '2' },
  }) as any;

  const funding = (extra: Record<string, string>) =>
    buildConceptNote(org(extra), 'pt').sections.find(s => s.id === 'financiamento')!;

  test('⚠️ a closed call is never presented as an option', () => {
    // Sending an organisation to a door that is not there is worse than naming
    // no door: the deck's own caveat, and it travels with every path.
    const text = funding({}).paragraphs.map(p => p.text).join(' ');
    expect(text).toContain(FUNDING_CAVEAT.pt);
    for (const p of FUNDING_PATHS.filter(x => x.status !== 'aberta')) {
      if (!text.includes(p.name)) continue;
      expect(text, p.name).toMatch(/confirmar antes de preparar/);
    }
  });

  test('the record decides eligibility, and the barrier is named', () => {
    // ⚠️ The consulting the deck asks for: match what the organisation already
    // told us against what the deck says, and say which criterion blocks it.
    const novice = funding({ has_cnpj: 'Ainda não' }).paragraphs.map(p => p.text).join(' ');
    expect(novice).toMatch(/Fora de alcance por enquanto/);
    expect(novice).toMatch(/exige hist[óo]rico comprovado/);
    expect(novice).toMatch(/o registro n[ãa]o indica CNPJ/);

    const veteran = funding({ has_cnpj: 'Sim, temos CNPJ', funding_history: 'yes' })
      .paragraphs.map(p => p.text).join(' ');
    expect(veteran).toMatch(/j[áa] executou projeto financiado, que é o hist[óo]rico comprovado/);
    expect(veteran).toContain('BNDES Periferias Verdes');
  });

  test('a fund whose calls do not reach this state is not offered', () => {
    // The deck is explicit: "Nenhuma chamada confirmada cobriu o Rio Grande do
    // Sul, o Pampa ou o bioma Mata Atlântica."
    const ecos = fundingMatches({ hasTrackRecord: true }).find(m => m.path.id === 'fundo-ecos')!;
    expect(ecos.blocked).toBe(true);
    expect(ecos.fit).toMatch(/Cerrado, Caatinga e Amaz[ôo]nia Legal/);
  });

  test('the aggregation argument travels with the note', () => {
    // A note asking for R$ 20–40k reads as too small to process until the reader
    // knows it is one of eighteen in a pipeline. That is the programme's own
    // reason for existing and it belongs in the document, not only in a slide.
    expect(funding({}).paragraphs.map(p => p.text)).toContain(AGGREGATION_ARGUMENT.pt);
  });

  test('every funding line says where it came from', () => {
    for (const p of funding({}).paragraphs) {
      expect(p.sources.join(' ')).toMatch(/oficina de financiamento COUGAR/);
    }
  });

  test('the deck vocabulary is the document vocabulary', () => {
    // The workshop and the document have to say the same words, or an
    // organisation has to translate between them.
    const text = funding({}).paragraphs.map(p => p.text).join(' ')
      + ' ' + FUNDING_PATHS.map(p => p.notePt).join(' ');
    // ⚠️ Matched as forms, not as substrings: "edital" pluralises to "editais",
    // which does not contain it. The first version of this check failed against
    // a document that used the word correctly.
    for (const [label, re] of [
      ['não reembolsável', /n[ãa]o reembols[áa]ve(l|is)/i],
      ['edital', /edita(l|is)/i],
      ['Termo de Fomento', /Termo de Fomento/i],
      ['contrapartida', /contrapartida/i],
      ['histórico comprovado', /hist[óo]rico comprovado/i],
    ] as Array<[string, RegExp]>) {
      expect(re.test(text), label).toBe(true);
    }
  });

  test('the context bundle carries it as programme knowledge, not as their record', () => {
    // ⚠️ An agent handed only one organisation's answers can summarise them; it
    // cannot advise. What turns the folder into advice is the material the
    // organisation does not have. See docs/context-first.md.
    const md = buildContextMarkdown({
      orgName: 'Org', state: null, messages: [], docs: [], generatedAt: '2026-09-03',
    });
    expect(md).toContain('## Base de conhecimento do programa');
    expect(md).toMatch(/não é o registro desta organização/);
    expect(md).toMatch(/n[ãa]o reembols[áa]veis/i);
    expect(md).toContain('BNDES Periferias Verdes');
    expect(md).toContain(FUNDING_CAVEAT.pt);
  });
});

// ── The cohort pass, now reading what the cohort produced ───────────────────
import { analyseSynergies, synergyFactsFrom } from '../shared/w3-synergies';

test.describe('what a cohort has in common, from what Encontro 3 concluded', () => {
  const member = (id: string, over: any = {}) => ({
    id, orgName: `Org ${id.toUpperCase()}`, bairro: 'Partenon', siteName: 'X', hasSite: true,
    tenure: 'public-informal', currentUse: 'paved', worry: 'alagamento',
    familias: ['aguas-pluviais'], solutions: ['hortas-urbanas'], roles: [],
    priorCollaboration: null, priorCollaborationDetail: null, nbsExperience: null,
    fundingScale: null, biggestBudget: null, maturityScore: 5, verdict: 'needs_permission',
    studyNeeds: [], bodies: ['SMAMUS'], docCount: 0, started: true,
    ownWords: { story: 'Alaga.', whyHere: null, baseline: null }, docs: [], correctionsPt: null,
    approvalInstruments: ['Termo de Permissão de Uso'],
    fundingOpen: [], fundingBlocked: ['Teia de Soluções'],
    ...over,
  });

  test('the same instrument across organisations is one conversation, not seven', () => {
    const a = analyseSynergies([member('a'), member('b'), member('c')] as any);
    expect(a.pooledInstruments).toEqual([
      { instrument: 'Termo de Permissão de Uso', memberIds: ['a', 'b', 'c'] },
    ]);
  });

  test('⚠️ the same funding barrier is the aggregation argument, in numbers', () => {
    // The programme-level finding no organisation can reach alone — and the
    // answer to it is exactly what the 26 August workshop spent an hour on.
    const a = analyseSynergies([member('a'), member('b'), member('c', { fundingBlocked: [] })] as any);
    expect(a.sharedFundingBarriers).toEqual([
      { path: 'Teia de Soluções', memberIds: ['a', 'b'] },
    ]);
  });

  test('a barrier only one organisation has is not a cohort finding', () => {
    const a = analyseSynergies([member('a'), member('b', { fundingBlocked: [] })] as any);
    expect(a.sharedFundingBarriers).toEqual([]);
  });

  test('the facts are derived from the record, not passed in by hand', () => {
    // ⚠️ Same projection the coordinator's button uses. The eligibility criteria
    // are the funding deck's; what decides them was already in the record.
    const sections: any = {
      org_profile: { fields: { has_cnpj: { value: 'Ainda não' } } },
      intervention_site: { fields: { land_tenure: { value: 'public-informal' }, bairro: { value: 'Partenon' } } },
      intervention_type: { fields: { chosen_solutions: { value: 'hortas-urbanas' } } },
      impact_monitoring: { fields: {} },
      operations_sustain: { fields: {} },
    };
    const f = synergyFactsFrom(sections);
    expect(f.approvalInstruments).toContain('Termo de Permissão de Uso');
    expect(f.fundingBlocked.join(' ')).toMatch(/Teia de Soluções/);
    expect(f.fundingBlocked.join(' ')).toMatch(/BNDES/);
  });
});

// ── The cohort layer: counts, never names ──────────────────────────────────
import { cohortLines, peerFrom, type CohortPeer } from '../server/services/cohortContext';

test.describe('what the group has in common, without naming anyone', () => {
  const peer = (over: Partial<CohortPeer> = {}): CohortPeer => ({
    bairro: 'Partenon', worry: 'alagamento',
    studyNeeds: ['um teste de infiltração do solo'],
    approvalInstruments: ['Termo de Adoção'],
    fundingBlocked: ['Teia de Soluções'],
    solutions: ['jardins-de-chuva'],
    ...over,
  });

  test('⚠️ no name, no quote, no site reaches another organisation', () => {
    // The only input that leaves an organisation's own record. An allowlist,
    // never a spread: the last time a peer-facing view was a denylist over a
    // member object, a `review` field and its reviewer reached a partner.
    const lines = cohortLines(peer(), [peer(), peer()]).join(' ');
    expect(lines).not.toMatch(/Associação|Rede |Coletivo|Grupo /);
    expect(lines).toMatch(/2 outras organizações/);
    // Counts, and what they are counting.
    expect(lines).toMatch(/mesmo estudo: um teste de infiltração do solo/);
    expect(lines).toMatch(/mesmo instrumento de aprovação \(Termo de Adoção\)/);
    expect(lines).toMatch(/mesma barreira de financiamento \(Teia de Soluções\)/);
  });

  test('only what THIS organisation shares is reported', () => {
    // A study nobody else needs says nothing useful to it, and listing the
    // group's every need would be the spread this avoids, in prose.
    const mine = peer({ studyNeeds: ['uma avaliação geotécnica'], fundingBlocked: [], approvalInstruments: [] });
    const lines = cohortLines(mine, [peer(), peer()]).join(' ');
    expect(lines).not.toMatch(/infiltração/);
    expect(lines).not.toMatch(/Teia de Soluções/);
    // The bairro and the risk it does share still come through.
    expect(lines).toMatch(/mesmo bairro \(Partenon\)/);
  });

  test('an organisation alone in the cohort is told nothing', () => {
    expect(cohortLines(peer(), [])).toEqual([]);
  });

  test('the allowlist is the type — peerFrom carries six fields and no more', () => {
    // Adding a field here has to be a deliberate act, because this type is
    // added to often and a spread would leak whatever lands in it next.
    const p = peerFrom(
      { studyNeeds: ['x'], approvalInstruments: ['y'], fundingBlocked: ['z'], solutions: ['s'] } as any,
      'Partenon', 'alagamento',
    );
    expect(Object.keys(p).sort()).toEqual(
      ['approvalInstruments', 'bairro', 'fundingBlocked', 'solutions', 'studyNeeds', 'worry'],
    );
  });

  test('it stays bounded — a context, not a list nobody reads', () => {
    const many = Array.from({ length: 30 }, () => peer());
    expect(cohortLines(peer(), many).length).toBeLessThanOrEqual(6);
  });

  test('⚠️ it speaks the language of the document it lands on', () => {
    // These lines used to be advisor-only context, where Portuguese in, English
    // out is fine — the advisor rewrites. They now reach the concept note
    // itself, and the note printed in English is the one a funder reads.
    const en = cohortLines(peer(), [peer(), peer()], 'en').join(' ');
    expect(en).toMatch(/2 other organisations/);
    expect(en).toMatch(/need the same study/);
    expect(en).not.toMatch(/organizações|mesmo|barreira/);
  });
});

// ── The programme's argument, on the page a funder reads ───────────────────
import { conceptNoteFacts, acceptAuthored, claimedOrgCounts } from '../shared/concept-note';
import { buildPrompt } from '../server/services/w3Advisor';

test.describe('the cohort reaches the concept note', () => {
  const LINES = [
    '2 outras organizações do grupo precisam do mesmo estudo: um teste de infiltração do solo. Isso é contratável em conjunto.',
    '3 outras organizações esbarram na mesma barreira de financiamento (Teia de Soluções). É exatamente o caso que a agregação num portfólio resolve.',
  ];
  const input = (cohort: string[] = LINES) => ({
    site: { site_lat: '-30.05', site_lng: '-51.20', bairro: 'Partenon', land_tenure: 'public-informal', site_worry: 'alagamento' },
    org: { org_name: 'Associação Teste' },
    solutions: ['jardins-de-chuva'],
    areaM2: 500,
    w3: { construction_model: 'mutirao' },
    cohort,
  });

  test('the counts are on the page, under a citation that says they are counts', () => {
    // ⚠️ The one fact an organisation cannot reach from inside its own record,
    // and the reason there is a programme rather than eighteen applications.
    const note = buildConceptNote(input(), 'pt');
    const funding = note.sections.find(s => s.id === 'financiamento')!;
    const text = funding.paragraphs.map(p => p.text).join(' ');
    expect(text).toMatch(/não chega sozinho/);
    expect(text).toMatch(/mesmo estudo: um teste de infiltração do solo/);
    const cited = funding.paragraphs.find(p => /não chega sozinho/.test(p.text))!.sources.join(' ');
    expect(cited).toMatch(/sem identificação/);
  });

  test('an organisation alone in its cohort gets no such paragraph — not an empty one', () => {
    const note = buildConceptNote(input([]), 'pt');
    const text = note.sections.find(s => s.id === 'financiamento')!.paragraphs.map(p => p.text).join(' ');
    expect(text).not.toMatch(/não chega sozinho/);
    expect(conceptNoteFacts(input([]) as any, 'pt').cohort).toEqual([]);
  });

  test('⚠️ the counts are numbers the writing pass may then use', () => {
    // The number guard drops any figure absent from the fact base. If the
    // cohort counts did not enter it, a sentence making the programme's
    // argument would be rejected for citing a number nobody handed it — the
    // rejection being silent, which is the failure mode this whole file is
    // about.
    const note = buildConceptNote(input(), 'pt');
    const src = note.sections.find(s => s.id === 'financiamento')!
      .paragraphs.find(p => /não chega sozinho/.test(p.text))!.sources[0];
    const out = acceptAuthored(note, [{
      section: 'resumo',
      text: 'O projeto não chega sozinho: 2 outras organizações do grupo precisam do mesmo teste de infiltração, o que torna o estudo contratável de uma vez só.',
      sources: [src],
    }], 'pt');
    expect(out.rejected, JSON.stringify(out.rejected)).toHaveLength(0);
    expect(out.accepted).toBe(1);
  });

  test('⚠️ a count of other organisations that nobody made is dropped — in words too', () => {
    // Found in a live run, not in a test: handed counts of 2 and 3, the writing
    // pass wrote "outras oito organizações". Every digit check passed it —
    // "oito" has no digits — and the sentence is a claim about organisations
    // that never saw the page it appears on.
    const note = buildConceptNote(input(), 'pt');
    const src = note.sections.find(s => s.id === 'financiamento')!
      .paragraphs.find(p => /não chega sozinho/.test(p.text))!.sources[0];
    const out = acceptAuthored(note, [
      { section: 'resumo', text: 'Outras oito organizações do mesmo grupo esbarram nas mesmas barreiras de financiamento identificadas aqui.', sources: [src] },
      { section: 'resumo', text: 'Outras 3 organizações do grupo esbarram na mesma barreira de financiamento, o que torna a inscrição conjunta mais eficiente.', sources: [src] },
    ], 'pt');
    expect(out.accepted).toBe(1);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0].why).toMatch(/contagem de organizações/);
  });

  test('the guard reads counts, not every numeral in the sentence', () => {
    // ⚠️ Deliberately narrow. "As duas soluções combinadas atuam sobre essa
    // superfície" is a true, useful sentence, and a blanket word-number rule
    // would throw it away for a cardinality nobody needs to source.
    expect(claimedOrgCounts('As duas soluções combinadas atuam sobre essa superfície.')).toEqual([]);
    expect(claimedOrgCounts('três outras organizações precisam do mesmo estudo')).toEqual(['3']);
    expect(claimedOrgCounts('1 outra organização trabalha no mesmo bairro')).toEqual(['1']);
    expect(claimedOrgCounts('seven other organisations hit the same barrier')).toEqual(['7']);
  });

  test('⚠️ the advisor is handed how an approval actually happens, and what money exists', () => {
    // The pass whose job includes naming what a funder or the municipality will
    // ask was doing it from general knowledge — which yields plausible gaps
    // rather than this cohort's real ones. Both routes and all eight funding
    // paths now reach it, the funding side matched against this organisation.
    const prompt = buildPrompt({
      state: {
        sections: {
          intervention_site: { fields: { bairro: { value: 'Partenon' } } },
          org_profile: { fields: { has_cnpj: { value: 'nao' } } },
        },
      } as any,
      orgName: 'Associação Teste',
      messages: [], docs: [], photos: [], cohort: [],
      questionCtx: {
        solutions: [], familias: [], tenure: 'public-informal', currentUse: '', siteName: '',
        worry: 'alagamento', areaM2: 0, hasFundingHistory: false, needsStudy: false,
      } as any,
    });
    // The channel and the stated processing time, not a paraphrase of them.
    expect(prompt).toMatch(/apoiepoa@portoalegre\.rs\.gov\.br/);
    expect(prompt).toMatch(/30 dias/);
    // And what the money actually requires of THIS organisation.
    expect(prompt).toMatch(/CENÁRIO DE FINANCIAMENTO/);
    expect(prompt).toMatch(/CNPJ/i);
  });

  test('⚠️ and a peer named in authored prose still has nowhere to come from', () => {
    // Structural, not a filter: no peer name is ever in the fact base, so an
    // invented one is an invented noun — which the number guard cannot catch.
    // What CAN be asserted is that the layer itself carries none.
    const facts = conceptNoteFacts(input() as any, 'pt');
    expect(facts.cohort.join(' ')).not.toMatch(/Associação|Coletivo|Rede /);
  });
});
