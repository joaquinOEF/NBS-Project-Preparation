import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { TestApi } from './helpers/testApi';
import { staleMapReasons, publicationPins, orgTables, buildMapsZip, type MapsManifest } from '../server/services/publicationPackage';
import { buildPublicationWorkbook } from '../server/services/publicationXlsx';

// "DADOS DA PUBLICAÇÃO (ZIP)" — the Rede's package, built live (refine
// rede-publication-download-2026-11-16). Pins move on prod between deploys, so
// the tables follow the records at the click; the maps are the last upload and
// the package says when a pin moved since. Points are public places.

const MERCADO = { lat: -30.0273, lng: -51.2280 };
const REDENCAO = { lat: -30.0380, lng: -51.2150 };

test.describe('which maps are out of date', () => {
  const live = publicationPins([
    { memberId: 'a', orgName: 'A', neighborhood: 'Centro', site: { _site_lat: MERCADO.lat, _site_lng: MERCADO.lng } },
    { memberId: 'b', orgName: 'B', neighborhood: 'Bom Jesus', site: {}, memberSite: null },
  ]);
  const manifest = (pins: MapsManifest['pins']): MapsManifest => ({ renderedAt: '2026-11-16T12:00:00Z', blobKey: 'k', pins });

  test('a pin of record wins; no pin means "approx" (the map uses the bairro centroid)', () => {
    expect(live[0]).toMatchObject({ lat: MERCADO.lat, lng: MERCADO.lng, approx: false });
    expect(live[1]).toMatchObject({ lat: null, approx: true, bairro: 'Bom Jesus' });
  });
  test('same pins → nothing; moved, joined, left → each said by name', () => {
    expect(staleMapReasons(manifest(live), live)).toEqual([]);
    expect(staleMapReasons(manifest([{ ...live[0], lat: MERCADO.lat + 0.00005 }, live[1]]), live)).toEqual([]); // ~5 m is the same place
    expect(staleMapReasons(manifest([{ ...live[0], lat: REDENCAO.lat }, live[1]]), live)).toEqual(['A (ponto mudou)']);
    expect(staleMapReasons(manifest([live[0]]), live)).toEqual(['B (entrou depois dos mapas)']);
    expect(staleMapReasons(manifest([...live, { ...live[1], memberId: 'c', org: 'C' }]), live)).toEqual(['C (saiu da rede)']);
    expect(staleMapReasons(null, live)).toEqual(['nenhum mapa foi enviado ainda']);
  });
});

test.describe('the workbook and the maps-only ZIP (20 Nov 2026)', () => {
  const orgs = [{ memberId: 'a', orgName: 'A', neighborhood: 'Centro', site: { _site_lat: MERCADO.lat, _site_lng: MERCADO.lng } }];

  test('the income header says it is the ~300 m tracts, not the bairro, and every tab is there', async () => {
    const zip = await JSZip.loadAsync(await buildPublicationWorkbook(orgTables(orgs as any), { cohortName: 'T', stamp: 'agora' }));
    const book = await zip.file('xl/workbook.xml')!.async('string');
    for (const tab of ['Leia-me', 'Organizações', 'Em volta (300 m)', 'Bairros', 'Soluções SbN']) expect(book).toContain(`name="${tab}"`);
    const strings = await zip.file('xl/sharedStrings.xml')!.async('string');
    expect(strings).toContain('setores a até ~300 m, NÃO o bairro');
    expect(strings).toContain('Bairro inteiro — renda típica do responsável');
  });

  test('the maps ZIP carries the upload minus its manifest, with a LEIA-ME that flags a moved pin', async () => {
    const live = publicationPins(orgs as any);
    const up = new JSZip();
    up.file('mapa_inundacao_atual.png', 'x'); up.file('mapa_inundacao_2050.png', 'x'); up.file('manifest.json', '{}');
    const manifest: MapsManifest = { renderedAt: '2026-11-20T12:00:00Z', blobKey: 'k', pins: [{ ...live[0], lat: REDENCAO.lat }] };
    const out = await JSZip.loadAsync(await buildMapsZip({ manifest, zip: await up.generateAsync({ type: 'nodebuffer' }) }, live));
    expect(Object.keys(out.files).sort()).toEqual(['LEIA-ME.txt', 'mapa_inundacao_2050.png', 'mapa_inundacao_atual.png']);
    expect(await out.file('LEIA-ME.txt')!.async('string')).toContain('A (ponto mudou)');
  });
});

test.describe('the coordinator downloads it', () => {
  test('tables from the live pins, the city context, the 27 solutions; maps uploaded and then flagged when a pin moves; test copies stay out', async ({ page }) => {
    const api = new TestApi(page.request);
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Publicação ${tag}`)).cohort;
    await api.createCoordinator({ email: `pub-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const seed = async (orgName: string, pin: { lat: number; lng: number }) => {
      const m = (await api.inviteMember(cohort.id, { orgName, neighborhood: 'Centro Histórico', withSession: true })).member;
      await api.seedState(m.cboStateId, { phase: 4, language: 'pt', sections: [
        { sectionId: 'intervention_site', field: 'site_lat', value: String(pin.lat) },
        { sectionId: 'intervention_site', field: 'site_lng', value: String(pin.lng) },
        { sectionId: 'intervention_site', field: 'site_address', value: 'Largo Glênio Peres — Centro Histórico' },
        { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
      ] });
      return m;
    };
    const real = await seed('Coletivo do Mercado', MERCADO);
    const copy = await seed('Cópia de teste', REDENCAO);
    const base = `/api/cohort/${cohort.coordinatorSlug}`;
    // A test copy (or an org that left) is out of the portfolio — and of the publication.
    expect((await page.request.patch(`${base}/member/${copy.id}/portfolio`, { data: { exclude: true } })).status()).toBe(200);

    const st0 = await (await page.request.get(`${base}/publication/status`)).json();
    expect(st0).toEqual({ orgs: 1, maps: null });

    const read = async () => {
      const r = await page.request.get(`${base}/publication.zip`);
      expect(r.status()).toBe(200);
      expect(r.headers()['content-disposition']).toMatch(/dados-da-publicacao-\d{4}-\d{2}-\d{2}\.zip/);
      return JSZip.loadAsync(await r.body());
    };
    const z = await read();
    const names = Object.keys(z.files);
    for (const n of ['LEIA-ME.txt', 'organizacoes.csv', 'dados_por_organizacao_300m.csv', 'contexto_porto_alegre/contexto_desastres_e_injustica_climatica.txt',
      'contexto_porto_alegre/bairros_exposicao_e_perfil.csv', 'solucoes_SbN/27_solucoes_SbN.html', 'solucoes_SbN/27_solucoes_textos.csv']) expect(names).toContain(n);
    expect(names.filter(n => n.startsWith('solucoes_SbN/fotos_das_solucoes/') && !z.files[n].dir).length).toBe(27);
    const orgs = await z.file('organizacoes.csv')!.async('string');
    expect(orgs).toContain('Coletivo do Mercado');
    expect(orgs).toContain('Largo Glênio Peres');
    expect(orgs).not.toContain('Cópia de teste');
    const t300 = await z.file('dados_por_organizacao_300m.csv')!.async('string');
    const [head, row] = t300.replace(/^﻿/, '').trim().split('\n');
    const cols = head.split(',');
    const cell = (k: string) => row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map(x => x.replace(/,$/, '').replace(/^"|"$/g, ''))[cols.indexOf(k)];
    expect(Number(cell('moradores_300m'))).toBeGreaterThan(100);
    expect(cell('mancha_de_inundacao_guaiba')).toMatch(/cota de .* m do Guaíba/);
    expect(cell('bairro_censo')).toBeTruthy();                   // their bairro's row, on the same line (B1 note)
    expect(Number(cell('bairro_moradores'))).toBeGreaterThan(Number(cell('moradores_300m')) / 10);
    expect(cols.join(',')).not.toMatch(/pret|pard/);             // race only by city and bairro
    expect(await z.file('LEIA-ME.txt')!.async('string')).toContain('ainda não há mapas enviados');

    // The maps arrive with the pins they were drawn from.
    const pins = (await (await page.request.get(`${base}/publication/pins`)).json()).pins;
    expect(pins).toHaveLength(1);
    const maps = new JSZip();
    maps.file('mapa_inundacao_atual.png', Buffer.from('png'));
    maps.file('numbers.json', '[]');
    maps.file('manifest.json', JSON.stringify({ renderedAt: new Date().toISOString(), pins: pins.map((p: any) => ({ ...p, n: 1 })) }));
    const bad = await page.request.post(`${base}/publication/maps`, { headers: { 'content-type': 'application/zip' }, data: Buffer.from('not a zip') });
    expect(bad.status()).toBe(400);
    const up = await page.request.post(`${base}/publication/maps`, { headers: { 'content-type': 'application/zip' }, data: await maps.generateAsync({ type: 'nodebuffer' }) });
    test.skip(up.status() === 503, 'no blob storage in this environment');
    expect(up.status()).toBe(200);
    expect((await (await page.request.get(`${base}/publication/status`)).json()).maps.stale).toEqual([]);
    const z2 = await read();
    expect(Object.keys(z2.files)).toContain('mapas/mapa_inundacao_atual.png');
    expect(Object.keys(z2.files)).toContain('dados_da_publicacao.xlsx');
    // The maps alone, and the tables as a workbook — their own buttons.
    const onlyMaps = await page.request.get(`${base}/publication/maps.zip`);
    expect(onlyMaps.status()).toBe(200);
    expect(Object.keys((await JSZip.loadAsync(await onlyMaps.body())).files)).toEqual(expect.arrayContaining(['mapa_inundacao_atual.png', 'LEIA-ME.txt']));
    const xlsx = await page.request.get(`${base}/publication.xlsx`);
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
    expect(Object.keys(z2.files)).not.toContain('mapas/manifest.json');
    expect(await z2.file('LEIA-ME.txt')!.async('string')).toMatch(/com os pontos atuais de todas as organizações/);

    // The pin moves on prod (no deploy): the button and the LEIA-ME say so.
    await api.seedState(real.cboStateId, { sections: [
      { sectionId: 'intervention_site', field: 'site_lat', value: String(REDENCAO.lat) },
      { sectionId: 'intervention_site', field: 'site_lng', value: String(REDENCAO.lng) },
    ] });
    expect((await (await page.request.get(`${base}/publication/status`)).json()).maps.stale).toEqual(['Coletivo do Mercado (ponto mudou)']);
    expect(await (await read()).file('LEIA-ME.txt')!.async('string')).toMatch(/DESATUALIZADOS: Coletivo do Mercado \(ponto mudou\)/);
  });

  test('the button sits beside "Todos os perfis"', async ({ page }) => {
    const api = new TestApi(page.request);
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Botão ${tag}`)).cohort;
    await api.createCoordinator({ email: `pubbtn-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    await api.inviteMember(cohort.id, { orgName: 'Org Botão', neighborhood: 'Centro Histórico', withSession: true });
    await page.goto('/orchestrator');
    const link = page.getByTestId('link-publication-zip');
    await expect(link).toBeVisible({ timeout: 20_000 });
    await expect(link).toHaveAttribute('href', `/api/cohort/${cohort.coordinatorSlug}/publication.zip`);
    await expect(page.getByTestId('link-all-profiles')).toBeVisible();
    await expect(page.getByTestId('publication-maps-warning')).toContainText(/sem mapas|no maps/);
  });
});
