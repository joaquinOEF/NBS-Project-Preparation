"""
WHO LIVES WHERE THE CITY FLOODED AND WHERE IT IS AT RISK — Porto Alegre, city-wide.

Crosses the 2022 Census tracts (knowledge/porto-alegre/census-2022) with four
official layers and writes knowledge/porto-alegre/census-2022/exposure.json:

  - cota2024  SMAMUS Guaíba contours up to the May 2024 peak (5,35 m)
  - planet    observed flood extent, Planet SkySat 6 May 2024 (zenodo 14662897)
  - sgb       SGB/CPRM Setorização de Risco (sectors surveyed on the ground)
  - arroios   PLAC/ARVC flood threat 2050, two highest of five classes
              (relative stretch p2–p98, the same classes the printed maps use)

A tract counts in proportion to the share of its area inside the layer (for the
ARVC raster: the share of its pixels in the top two classes). Race and income
are IBGE's tract figures: pretos + pardos over people (withheld tracts left
out), and the people-weighted median of each tract's average household-head
income ("renda típica").

Run by hand when a layer changes:
  python3 scripts/city-exposure-stats.py      (needs numpy, shapely, pillow)

Read by shared/city-climate-context.ts (pre-note lines) and summarised for the
model in knowledge/porto-alegre/disaster-history-and-climate-justice.md.
"""
import json, gzip, math, os, collections
import numpy as np
from PIL import Image
from shapely.geometry import shape
from shapely.ops import unary_union, transform
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = f'{ROOT}/knowledge/porto-alegre/census-2022'
rd = lambda p: json.load(gzip.open(p)) if p.endswith('.gz') else json.load(open(p))

stats = rd(f'{K}/stats.json.gz')
tracts = rd(f'{K}/tracts.geojson.gz')['features']
geoms = [shape(f['geometry']).buffer(0) for f in tracts]
lat0 = -30.05; kx, ky = 111320 * math.cos(math.radians(lat0)), 110540
P = lambda g: transform(lambda x, y, z=None: (np.asarray(x) * kx, np.asarray(y) * ky), g)
gm = [P(g) for g in geoms]
tree = STRtree(gm)

def area_share(polys):
    u = P(unary_union(polys)); out = np.zeros(len(gm))
    for i in tree.query(u):
        out[i] = gm[i].intersection(u).area / gm[i].area if gm[i].area else 0
    return out

cotas = rd(f'{ROOT}/knowledge/porto-alegre/city/layers/cotas-inundacao.geojson.gz')['features']
COTA = max(f['properties']['contourmax'] for f in cotas if f['properties']['contourmax'] <= 535)
share = {
    'cota2024': area_share([shape(f['geometry']).buffer(0) for f in cotas if f['properties']['contourmax'] <= COTA]),
    'planet': area_share([shape(f['geometry']).buffer(0) for f in rd(f'{ROOT}/client/public/sample-data/porto-alegre-flood-2024.json')['geoJson']['features']]),
    'sgb': area_share([shape(f['geometry']).buffer(0) for f in rd(f'{ROOT}/knowledge/official-risk/porto-alegre/sgb-setorizacao.json')['features'] if f.get('geometry')]),
}
man = rd(f'{ROOT}/client/public/arvc-official/manifest.json')['layers']
lid = 'arvc_off_threat_flood_2050'
a = np.asarray(Image.open(f'{ROOT}/client/public/arvc-official/{lid}.value.png').convert('RGB')).astype(np.int32)
v = np.where((a[..., 1] == 0) & (a[..., 2] == 0), a[..., 0] / 254.0, np.nan)
(s, w), (n, e) = man[lid]['bounds']; H, W = v.shape
edges = np.linspace(np.nanpercentile(v, 2), np.nanpercentile(v, 98), 6)
arr = np.zeros(len(geoms))
for i, g in enumerate(geoms):
    x0, y0, x1, y1 = g.bounds
    sub = v[max(int((n - y1) / (n - s) * H), 0):int(math.ceil((n - y0) / (n - s) * H)) + 1,
            max(int((x0 - w) / (e - w) * W), 0):int(math.ceil((x1 - w) / (e - w) * W)) + 1]
    sub = sub[~np.isnan(sub)]
    arr[i] = (sub >= edges[3]).mean() if sub.size else 0
share['arroios2050'] = arr

rows = []
for i, f in enumerate(tracts):
    st = stats.get(f['properties']['s'], {})
    rows.append({'b': f['properties']['b'], 'p': st.get('p') or 0, 'pp': st.get('pp'), 'r': st.get('r'), **{k: float(share[k][i]) for k in share}})

def wmedian(pairs):
    pairs = sorted((x, wt) for x, wt in pairs if x is not None and wt > 0)
    tot = sum(wt for _, wt in pairs); acc = 0
    for x, wt in pairs:
        acc += wt
        if acc >= tot / 2: return round(x)
    return None

def profile(weight):
    ppl = sum(r['p'] * weight(r) for r in rows)
    known = [r for r in rows if r['pp'] is not None]
    bb = sum(r['pp'] * weight(r) for r in known) / max(1e-9, sum(r['p'] * weight(r) for r in known))
    return {'people': round(ppl), 'shareOfCity': round(ppl / city_people, 3), 'blackOrBrownShare': round(bb, 3),
            'incomeMedian': wmedian([(r['r'], r['p'] * weight(r)) for r in rows])}

city_people = sum(r['p'] for r in rows)
out = {
    'computedAt': '2026-11-16',
    'script': 'scripts/city-exposure-stats.py',
    'sources': {
        'census': 'IBGE, Censo Demográfico 2022, por setor censitário (via GeoReDUS/CEM-USP)',
        'cota2024': f'SMAMUS, Cotas de inundação do Guaíba (cota de {COTA / 100:.2f} m, pico de maio de 2024)',
        'planet': 'Planet SkySat, extensão observada da inundação em 6/5/2024 (zenodo.org/records/14662897)',
        'sgb': 'SGB/CPRM, Setorização de Risco Geológico',
        'arroios2050': 'PLAC/ARVC 2023, ameaça de inundação fluvial (arroios), cenário 2050, classes alta e muito alta',
    },
    'city': profile(lambda r: 1),
    'layers': {k: profile(lambda r, k=k: r[k]) for k in share},
}
ranked = sorted([r for r in rows if r['r'] is not None and r['p'] > 0], key=lambda r: r['r'])
tot = sum(r['p'] for r in ranked); acc = 0; q = [[] for _ in range(5)]
for r in ranked:
    q[min(4, int(5 * acc / tot))].append(r); acc += r['p']
out['incomeQuintiles'] = [{
    'quintile': i + 1, 'incomeFrom': round(g[0]['r']), 'incomeTo': round(g[-1]['r']),
    **{f'{k}Share': round(sum(r['p'] * r[k] for r in g) / sum(r['p'] for r in g), 4) for k in share},
    'blackOrBrownShare': round(sum(r['pp'] or 0 for r in g) / sum(r['p'] for r in g), 3),
} for i, g in enumerate(q)]
by = collections.defaultdict(lambda: collections.Counter())
for r in rows:
    by[r['b']]['people'] += r['p']
    for k in share: by[r['b']][k] += r['p'] * r[k]
out['bairros'] = sorted([{'bairro': b, 'people': c['people'], **{k: round(c[k]) for k in share}} for b, c in by.items() if c['people']],
                        key=lambda x: -x['cota2024'])
dest = f'{K}/exposure.json'
json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
print('wrote', dest, '·', {k: out['layers'][k]['people'] for k in share})
