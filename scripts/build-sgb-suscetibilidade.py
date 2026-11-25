"""SGB susceptibility for Porto Alegre → committed GeoJSON (one file per process).

Source: Serviço Geológico do Brasil (CPRM), "Carta de suscetibilidade a
movimentos gravitacionais de massa e inundação — município de Porto Alegre - RS"
(2015, 1:70.000, field-validated 2012–2014). RIGEO handle doc/15106, file
`sig_portoalegre_rs.zip` (172 MB, not committed):
  https://rigeo.sgb.gov.br/server/api/core/bitstreams/ec8769c4-4b0b-4d97-a122-a2932773494b/content

Why this and not the PLAC/ARVC threat rasters (Julia Caon Froeder, Rede SCbN,
24 Nov 2026): the ARVC landslide layer is classed relative to the city, so 36%
of Porto Alegre read "alta/muito alta" — flat Centro Histórico included — while
SGB, the agency Civil Defence works with, rates 1.7% of the city high. SGB's
flood layer also covers the streams AND the Guaíba in one surface, where ARVC
models the streams only. See docs/sgb-suscetibilidade.md.

Output: knowledge/official-risk/porto-alegre/sgb-suscetibilidade-{movimento-de-massa,inundacao}.json
— one feature per class, dissolved, simplified ~3 m, EPSG:4326, coordinates at
6 decimals. Movimento de massa keeps Alta and Média only: SGB classes the WHOLE
municipality, so Baixa is simply the rest (84.6% of the city, 360 KB of
geometry that says nothing). Inundação keeps all three; outside them SGB maps no
flood susceptibility.

Usage: python3 scripts/build-sgb-suscetibilidade.py <sig_portoalegre_rs.zip or unzipped dir>
Needs pyshp, pyproj, shapely.
"""
import json, os, sys, tempfile, zipfile
import shapefile
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union

SRC = sys.argv[1]
if SRC.endswith('.zip'):
    tmp = tempfile.mkdtemp()
    with zipfile.ZipFile(SRC) as z:
        for n in z.namelist():
            if n.startswith('Suscetibilidade/'): z.extract(n, tmp)
    SRC = tmp
OUT = os.path.join(os.path.dirname(__file__), '..', 'knowledge', 'official-risk', 'porto-alegre')
to4326 = Transformer.from_crs(31982, 4326, always_xy=True).transform  # .prj: SIRGAS 2000 / UTM 22S
SOURCE = ('Serviço Geológico do Brasil (SGB/CPRM) — Carta de suscetibilidade a movimentos '
          'gravitacionais de massa e inundação, Porto Alegre - RS, 2015, 1:70.000')
ORDER = {'Alta': 3, 'Média': 2, 'Baixa': 1}

def rnd(o):
    if isinstance(o, float): return round(o, 6)
    if isinstance(o, (list, tuple)): return [rnd(x) for x in o]
    return o

for shp, slug, process in (('Movimento_de_Massa_A', 'movimento-de-massa', 'movimento de massa'),
                           ('Inundacao_A', 'inundacao', 'inundação')):
    r = shapefile.Reader(os.path.join(SRC, 'Suscetibilidade', shp), encoding='latin1')
    by = {}
    for sr in r.shapeRecords():
        by.setdefault(sr.record['CLASSE'], []).append(shape(sr.shape.__geo_interface__).buffer(0))
    feats = []
    for cls in sorted(by, key=lambda c: -ORDER[c]):
        if slug == 'movimento-de-massa' and cls == 'Baixa': continue  # = the rest of the municipality
        g = transform(to4326, unary_union(by[cls])).simplify(0.00003, preserve_topology=True).buffer(0)
        feats.append({'type': 'Feature', 'properties': {'classe': cls, 'nivel': ORDER[cls], 'processo': process},
                      'geometry': rnd(mapping(g))})
    fc = {'type': 'FeatureCollection', 'source': SOURCE, 'features': feats,
          'rest': 'Baixa' if slug == 'movimento-de-massa' else None}
    path = os.path.join(OUT, f'sgb-suscetibilidade-{slug}.json')
    with open(path, 'w') as f: json.dump(fc, f, ensure_ascii=False, separators=(',', ':'))
    print(path, f'{os.path.getsize(path) / 1e6:.2f} MB', {c: len(v) for c, v in by.items()})
