// Generates the test PDF fixture(s) used by the doc-first walkthrough.
// Run from the repo root:  node e2e/fixtures/generate-fixtures.mjs
// (Needs @playwright/test installed; uses Chromium's HTML→PDF.)
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// A realistic 1-page project proposal for the persona org. The facts match
// e2e/helpers/userSim.ts so the doc-first flow can be asserted against them.
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  body { font-family: Georgia, serif; margin: 48px; color:#222; line-height:1.5; }
  h1 { font-size: 22px; margin-bottom: 2px; } h2 { font-size: 15px; margin-top: 22px; color:#2a6a3a; }
  .meta { color:#555; font-size: 13px; } ul { margin: 6px 0; }
</style></head><body>
  <h1>Proposta de Projeto — Horta Comunitária Cascata</h1>
  <div class="meta">Bairro Cascata · Porto Alegre/RS · Associação comunitária sem fins lucrativos · Fundada em 2018</div>

  <h2>Quem somos</h2>
  <p>A <strong>Horta Comunitária Cascata</strong> é uma associação comunitária do bairro Cascata, em Porto Alegre,
  fundada em 2018. Nossa missão é <strong>cultivar alimento agroecológico e reduzir os alagamentos</strong> no território.
  Somos uma equipe de cerca de <strong>12 pessoas</strong> — 8 voluntárias e 4 com bolsa — coordenada por moradoras do bairro.</p>

  <h2>O que já fizemos</h2>
  <ul>
    <li>Canteiros elevados de cultivo agroecológico</li>
    <li>Sistema de captação e retenção de água da chuva</li>
    <li>Mutirões comunitários e oficinas de educação ambiental</li>
  </ul>
  <p>O terreno é <strong>cedido pela prefeitura em regime de comodato</strong>. Já realizamos um projeto em
  <strong>parceria com órgão público</strong> e temos experiência prática com soluções baseadas na natureza.</p>

  <h2>O que queremos</h2>
  <p>Queremos <strong>ampliar a horta</strong> e construir uma <strong>área de retenção de água</strong> para
  reduzir os alagamentos que afetam as famílias da comunidade do bairro.</p>
</body></html>`;

const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.setContent(html, { waitUntil: 'networkidle' });
const out = join(here, 'horta-cascata-proposal.pdf');
await p.pdf({ path: out, format: 'A4', printBackground: true });
await b.close();
console.log('wrote', out);
