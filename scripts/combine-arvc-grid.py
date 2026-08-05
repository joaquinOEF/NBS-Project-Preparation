"""Emit all six recovered ARVC hazards on ONE shared 250 m grid.

Six self-contained GeoJSONs would ship ~5.3 MB of near-identical geometry to the
browser (there is no gzip middleware on this server). They are the same grid, so
the geometry is written once with a stable cell id and each hazard contributes
only an {id: value} map. Same information, ~1/4 the bytes, and it makes
"compare two hazards on the same cell" a lookup instead of a spatial join.
"""
import json
import numpy as np
from pyproj import Transformer

import os
S = os.environ.get('ARVC_WORKDIR', os.path.join(os.getcwd(), '.arvc-work'))
INV = Transformer.from_crs('EPSG:31982', 'EPSG:4326', always_xy=True)

CELL = 250.0
E0, N1 = 462000.0, 6692000.0     # fixed origin so every hazard shares cell ids
NX = 152

HAZ = ['flood_risk_2050', 'landslide_risk_2050', 'heat_risk_2050',
       'drought_risk_2050', 'arbovirus_risk_2050', 'storm_risk_2050']

cells = {}
values = {}
for lab in HAZ:
    val = np.load(f'{S}/arvc_{lab}_val.npy')
    aff = json.load(open(f'{S}/arvc_{lab}_affine.json'))
    mx, bx, my, by = aff['mx'], aff['bx'], aff['my'], aff['by']
    yy, xx = np.nonzero(~np.isnan(val))
    e = mx * xx + bx
    n = my * yy + by
    gx = ((e - E0) // CELL).astype(int)
    gy = ((N1 - n) // CELL).astype(int)
    keep = (gx >= 0) & (gx < NX) & (gy >= 0)
    gx, gy = gx[keep], gy[keep]
    key = gy * NX + gx
    v = val[yy, xx][keep]
    csum = np.bincount(key, weights=v)
    ccnt = np.bincount(key)
    good = np.nonzero(ccnt >= 15)[0]
    m = {}
    for k in good:
        m[int(k)] = round(float(csum[k] / ccnt[k]), 3)
        cells[int(k)] = True
    values[lab] = m
    print(f'{lab:<20} {len(m):>5} cells')

ids = sorted(cells)
feats = []
for k in ids:
    gy, gx = divmod(k, NX)
    e = E0 + gx * CELL
    n = N1 - gy * CELL
    ring = [[round(c, 5) for c in INV.transform(x, y)] for x, y in
            [(e, n), (e + CELL, n), (e + CELL, n - CELL), (e, n - CELL)]]
    feats.append({'type': 'Feature', 'id': k,
                  'properties': {'id': k},
                  'geometry': {'type': 'Polygon', 'coordinates': [ring + [ring[0]]]}})

out = {
    'grid': {'crs': 'EPSG:31982', 'cell_m': CELL, 'origin_e': E0, 'origin_n': N1, 'nx': NX,
             'note': 'cell id = gy * nx + gx, gy counted south from origin_n'},
    'provenance': {
        'derived': True,
        'headline': 'RECONSTRUCTION — not the official ARVC dataset.',
        'method': ('Each published ARVC map figure was georeferenced from its own printed '
                   'SIRGAS 2000 / UTM 22S graticule (max residual ~16 m, verified against the '
                   'official municipal boundary), the printed colours were matched back to the '
                   '10-step ColorBrewer Reds legend, and the per-pixel values were averaged to '
                   'this 250 m grid. Values carry classification error and must not be cited as '
                   'WayCarbon/ICLEI output.'),
        'source_document': ('P3 — Análise de Riscos e Vulnerabilidade Climáticas, '
                            'Plano de Ação Climática de Porto Alegre (2023)'),
        'source_authors': 'WayCarbon, ICLEI, Ludovino Lopes Advogados, Ecofinance',
        'source_url': ('https://prefeitura.poa.br/sites/default/files/usu_doc/sites/smamus/'
                       'PMPOA23A_231116_P3_Relatorio_ARVC_V2.0_logos%20(1).pdf'),
        'regenerate_with': 'scripts/extract-arvc-figures.py',
        'value_scale': '0 = Muito Baixa … 1 = Muito Alta',
        'coverage_note': ('The ARVC masks water, parks and áreas verdes out of its own index. '
                          'A cell with no value was masked at source — it is NOT low risk.'),
    },
    'hazards': values,
    'cells': {'type': 'FeatureCollection', 'features': feats},
}
p = f'{S}/arvc-poa.json'
json.dump(out, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
import os
print(f'\n{len(feats)} shared cells -> {p} ({os.path.getsize(p)/1024:.0f} KB)')
