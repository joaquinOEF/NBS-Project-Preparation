import { test, expect } from '@playwright/test';
import { buildConceptNote } from '../shared/concept-note';
import { buildRoadmap } from '../shared/w3-roadmap';
import { buildDossier } from '../shared/w3-dossier';
import { renderConceptNoteHtml } from '../server/services/conceptNotePrint';
import { renderRoadmapHtml } from '../server/services/roadmapPrint';

// TWO DOCUMENTS, TWO JOBS — and until now neither said which it was.
//
// An organisation closed Encontro 3 and downloaded "Biovaletas.pdf" and
// "Biovaletas · Colégio Caldas Junior.pdf" (JVP, 2026-09-07). Nothing on either
// page named the document or its reader; both ended with the same seven
// numbered steps and the same open items; and the UI called one of them a
// "nota de conceito — para financiador ou prefeitura", which it is not: it
// carries our own readings and the named gaps, and a funder-facing note is
// written FROM it by someone who decides what to leave out.

const base = (over: Record<string, any> = {}) => ({
  site: {
    bairro: 'Partenon', site_name: 'Colégio Caldas Junior', current_use: 'paved',
    land_tenure: 'formal-agreement', site_worry: 'heat, enxurrada', site_area_m2: '2900',
    _site_lat: '-30.07', _site_lng: '-51.17',
    ...(over.site ?? {}),
  },
  org: { org_name: 'CEA Bom Jesus', contact_name: 'Maria Santos', contact_role: 'Coordenadora' },
  solutions: ['biovaletas'],
  areaM2: 2900,
  w3: {
    chosen_solutions: 'biovaletas', construction_model: 'partner-led', project_timeframe: '1-ano',
    justification_why_here: 'Porque é para onde a água vai.',
    ...(over.w3 ?? {}),
  },
  cohort: [],
});

test.describe('the documents know what they are', () => {
  test('each names itself, its reader, and its own file', () => {
    const note = buildConceptNote(base() as any, 'pt');
    const roadmap = buildRoadmap(base() as any, 'pt');

    expect(note.docLabel).toBe('Resumo do Projeto');
    expect(note.docAudience).toContain('coordenação');

    const noteHtml = renderConceptNoteHtml(note, 'pt');
    const planHtml = renderRoadmapHtml(roadmap, 'pt');

    // The <title> is what a browser writes on the PDF, so it is the file's name
    // in a downloads folder. "Biovaletas.pdf" told nobody anything.
    expect(noteHtml).toContain('<title>Resumo do Projeto — Biovaletas');
    expect(planHtml).toContain('<title>Plano de Trabalho — Biovaletas');
    // And on the page itself, above the title.
    expect(noteHtml).toContain('Resumo do Projeto');
    expect(planHtml).toContain('Plano de Trabalho');
    // The old promise is gone: this document is not addressed to a funder.
    expect(noteHtml).not.toContain('para financiador ou prefeitura');
  });

  test('the steps belong to the plan, and are not reprinted in the summary', () => {
    const note = buildConceptNote(base() as any, 'pt');
    const roadmap = buildRoadmap(base() as any, 'pt');
    const pend = note.sections.find(s => s.id === 'pendencias')!;
    const text = pend.paragraphs.map(p => p.text).join('\n');

    // The plan still carries them, numbered, with an owner each.
    expect(roadmap.steps.length).toBeGreaterThan(2);
    // The summary carries none of them — it used to reprint all seven verbatim.
    for (const step of roadmap.steps) {
      expect(text).not.toContain(step.title);
    }
    // It says where they are instead.
    expect(text).toContain('plano de trabalho');
    // What stays is what is still MISSING, which is this section's job.
    expect(pend.title).toBe('Pendências');
    expect(text).toContain('Quem carrega este projeto');
  });

  test('two worries named are two worries resolved, not one unrecognised string', () => {
    // `site_worry` holds a LIST. Looking the whole string up as a key matched
    // nothing, so an organisation that named heat AND enxurrada got no evidence
    // instruction for either — and a gap telling it the worry was "a família e
    // não o mecanismo", about a string naming two mechanisms.
    const d = buildDossier(base() as any, 'pt');
    const gather = d.items.filter(i => i.list === 'gather').map(i => i.text).join('\n');
    expect(gather).toContain('Registrar por onde a água entra');   // enxurrada
    expect(gather).toContain('ao meio-dia');                        // heat
    expect(d.gaps.join('\n')).not.toContain('é a família e não o mecanismo');

    // A legacy family id still raises it — that is the case it was written for
    // — and names only the entry that is actually a family.
    const legacy = buildDossier(base({ site: { site_worry: 'flood, heat' } }) as any, 'pt');
    const gap = legacy.gaps.find(g => /família e não o mecanismo/.test(g));
    expect(gap).toBeTruthy();
    expect(gap).toContain('"flood"');
    expect(gap).not.toContain('heat');
    expect(legacy.items.filter(i => i.list === 'gather').map(i => i.text).join('\n')).toContain('ao meio-dia');
  });
});
