import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyLinks, planLinksKey } from '../server/services/planLinks';
import { loadPlanCorpus, corpusVersion, parseCsv } from '../server/services/planCorpus';

// WHERE A COMMUNITY PROJECT MEETS THE CITY'S PLANS (server/services/planLinks.ts).
// A connection prints only with a passage that is really in the document; the
// corpus is whatever is in knowledge/porto-alegre/plans plus the desk research;
// a new document makes every stored reading stale.

const DOCS = [{ id: 'plan:plac.md', title: 'Plano de Ação Climática', owner: 'SMAMUS', kind: 'plano' as const, text: 'A meta 4.2 prevê ampliar a infiltração da água da chuva em áreas urbanas consolidadas, com prioridade para bairros com alagamento recorrente.' }];

test.describe('plan links — only what the document says', () => {
  test('a passage must be in the document; an unknown document or an invented number is dropped', () => {
    const { kept, dropped } = verifyLinks([
      { docId: 'plan:plac.md', relation: 'alinha', connection: 'Os jardins de chuva ampliam a infiltração num bairro com alagamento recorrente.', passage: 'ampliar a infiltração da água da chuva em áreas urbanas consolidadas' },
      { docId: 'plan:plac.md', relation: 'alinha', connection: 'Atende a meta.', passage: 'reduzir em 30% as áreas alagáveis até 2030, segundo o plano' },
      { docId: 'plan:nao-existe.md', relation: 'complementa', connection: 'x', passage: 'qualquer coisa com mais de vinte caracteres' },
      { docId: 'plan:plac.md', relation: 'alinha', connection: 'Contribui com 30% da meta 4.2.', passage: 'A meta 4.2 prevê ampliar a infiltração da água da chuva' },
    ], DOCS, 'ORGANIZAÇÃO: Ksa Rosa');
    expect(kept.map(k => k.connection)).toEqual(['Os jardins de chuva ampliam a infiltração num bairro com alagamento recorrente.']);
    expect(kept[0]).toMatchObject({ title: 'Plano de Ação Climática', owner: 'SMAMUS' });
    expect(dropped.join(' | ')).toMatch(/trecho não está/);
    expect(dropped.join(' | ')).toMatch(/documento desconhecido/);
    expect(dropped.join(' | ')).toMatch(/número fora dos fatos \(30\)/);
  });

  test('the corpus: front matter, the initiatives sheet (contacts never sent), and a version that moves', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'plans-'));
    mkdirSync(path.join(root, 'plans'));
    writeFileSync(path.join(root, 'existing-plans.md'), '---\nsource: x\n---\n# Porto Alegre - Existing Plans\n\nPMSB text.');
    writeFileSync(path.join(root, 'plans', 'README.md'), 'ignored');
    writeFileSync(path.join(root, 'plans', 'plac.md'), '---\ntitle: "Plano de Ação Climática"\nowner: "SMAMUS"\nkind: plano\n---\nTexto do plano.');
    writeFileSync(path.join(root, 'plans', 'iniciativas.csv'),
      'nome;quem executa;tipo;bairro;contato;observação\n"Horta da Vila; fundos";Coletivo X;iniciativa comunitária;Floresta;(51) 9999-0000;ativa\nVerde Engenharia;empresa;empresa;Centro;contato@x.com;"faz telhados verdes, ""desde 2019"""\n');
    const docs = loadPlanCorpus(root);
    // Files in name order: iniciativas.csv before plac.md.
    expect(docs.map(d => d.title)).toEqual(['Porto Alegre - Existing Plans', 'Horta da Vila; fundos', 'Verde Engenharia', 'Plano de Ação Climática']);
    expect(docs[3]).toMatchObject({ owner: 'SMAMUS', kind: 'plano' });
    expect(docs[2].kind).toBe('empresa');
    expect(docs.map(d => d.text).join('\n'), 'a contact never reaches the model').not.toMatch(/9999|contato@x/);
    expect(docs[2].text).toContain('faz telhados verdes, "desde 2019"');
    const v1 = corpusVersion(docs);
    writeFileSync(path.join(root, 'plans', 'regenera.md'), '---\ntitle: "Regenera RS"\n---\nNovo.');
    expect(corpusVersion(loadPlanCorpus(root)), 'a new document makes the readings stale').not.toBe(v1);
    expect(planLinksKey('f', 'a')).not.toBe(planLinksKey('f', 'b'));
    expect(parseCsv('a,b\n"1,5",2\n')).toEqual([['a', 'b'], ['1,5', '2']]);
  });
});
