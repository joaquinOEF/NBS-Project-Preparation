"""Print hazard maps for the Rede SCbN POA publication — official data only.

Landslide and flood = SGB/CPRM susceptibility (Carta de suscetibilidade, 2015),
one map each (Julia Caon Froeder, 24 Nov 2026, refine
cougar-sgb-hazard-maps-2026-11-24): the ARVC landslide layer is classed
relative to the city and painted 36% of it "alta/muito alta", flat centre
included; SGB is the source Civil Defence uses. Landslide shows média + alta
(baixa = the rest, left uncoloured) with the SGB mass-movement sectors; flood
shows SGB's single layer (streams and Guaíba together) with the May 2024
Guaíba level as a line. See docs/sgb-suscetibilidade.md.

Heat = PLAC/ARVC threat for TWO periods — the reference period 1995–2014 ("atual") and
2050 — on ONE shared scale per hazard (p2–p98 over both periods, five classes),
so the change between them is visible (Julia, 20 Nov 2026), the SMAMUS Guaíba
contour of the May 2024 peak, and the network's organisations numbered north → south. Decided 10 Nov 2026 (refine
rede-maps-official-2026-11-10); JVP: official data only, never our own index.

Not run by hand: scripts/publication-maps.ts fetches the live pins, prepares
<work> (org_points.json, fonts/, osm/water_rel.json) and uploads the result.

Usage: python3 render.py <work> <repo>/client/public/sample-data <repo>/client/public/arvc-official [hazard…]
Needs numpy, matplotlib, shapely, pillow.
"""
import json, math, os, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import PathPatch, Rectangle, Polygon as MPoly, Circle, FancyArrow
from matplotlib.path import Path
from matplotlib.colors import ListedColormap, BoundaryNorm
from shapely.geometry import shape, Polygon, MultiPolygon, LineString, box, Point
from shapely.ops import linemerge, polygonize, unary_union, transform

S, SD = sys.argv[1], sys.argv[2]
OUT = f'{S}/maps'
os.makedirs(OUT, exist_ok=True)

# ── fonts ────────────────────────────────────────────────────────────────────
for f in ('Inter-Regular', 'Inter-Medium', 'Inter-SemiBold'):
    fm.fontManager.addfont(f'{S}/fonts/{f}.ttf')
plt.rcParams['font.family'] = 'Inter'
plt.rcParams['pdf.fonttype'] = 42  # embed TrueType so text stays editable

# ── projection (EPSG:3857) ───────────────────────────────────────────────────
R = 6378137.0
def merc(lng, lat):
    x = math.radians(lng) * R
    y = R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y
def merc_geom(g):
    return transform(lambda x, y, z=None: (np.radians(np.asarray(x)) * R,
                     R * np.log(np.tan(np.pi / 4 + np.radians(np.asarray(y)) / 2))), g)

# ── vector data ──────────────────────────────────────────────────────────────
bd = json.load(open(f'{SD}/porto-alegre-boundary.json'))
city = merc_geom(shape(bd['boundaryGeoJson']['geometry']))
lng0, lat0, lng1, lat1 = bd['bbox']

nz = json.load(open(f'{SD}/porto-alegre-neighborhood-zones.json'))
bairros = {f['properties']['neighbourhoodName']: shape(f['geometry']) for f in nz['geoJson']['features']}
bairros_m = [merc_geom(g) for g in bairros.values()]

sw = json.load(open(f'{SD}/porto-alegre-surface-water.json'))
water_polys = [merc_geom(shape(f['geometry'])) for f in sw['geoJson']['features'] if f['geometry']['type'] == 'Polygon']
rv = json.load(open(f'{SD}/porto-alegre-rivers.json'))
river_lines = [merc_geom(shape(f['geometry'])) for f in rv['geoJson']['features']
               if f['properties'].get('waterway') in ('river', 'canal')]

# OSM water relations (Lago Guaíba, Delta do Jacuí, Gravataí …) — assembled multipolygons
def relation_to_geom(e):
    outers, inners = [], []
    for m in e.get('members', []):
        if m['type'] != 'way' or 'geometry' not in m: continue
        ls = LineString([(p['lon'], p['lat']) for p in m['geometry']])
        (inners if m.get('role') == 'inner' else outers).append(ls)
    def poly(lines):
        if not lines: return None
        return unary_union(list(polygonize(linemerge(lines))))
    o, i = poly(outers), poly(inners)
    if o is None or o.is_empty: return None
    return o.difference(i) if i is not None and not i.is_empty else o
osm = json.load(open(f'{S}/osm/water_rel.json'))
for e in osm['elements']:
    if e['type'] == 'relation' and e.get('tags', {}).get('water') in ('lake', 'river', 'lagoon', 'reservoir', 'canal'):
        g = relation_to_geom(e)
        if g is not None and not g.is_empty:
            water_polys.append(merc_geom(g))
water = unary_union([w.buffer(0) for w in water_polys])

# ── organisations ────────────────────────────────────────────────────────────
SHORT = {
    'Cooperativa Habitacional do Trabalho 20 de Novembro': 'Cooperativa 20 de Novembro',
    'Instituto de Estudos Culturais e Ambientais': 'Inst. de Estudos Culturais e Ambientais',
}
orgs = []
for o in json.load(open(f'{S}/org_points.json')):
    if 'vila flores' in o['org'].lower(): continue
    lat, lng, approx = o['lat'], o['lng'], bool(o.get('approx'))
    note = 'endereço (nível de rua)' if approx else 'registro'
    if lat is None:
        # The roster's bairro may list several ("Navegantes, Farrapos, Humaitá"): the first one the layer knows.
        g = next((bairros[b.strip()] for b in str(o['bairro']).split(',') if b.strip() in bairros), None)
        if g is None: continue
        c = g.centroid if g.contains(g.centroid) else g.representative_point()
        lng, lat, approx, note = c.x, c.y, True, f'centróide do bairro {o["bairro"]}'
    orgs.append(dict(name=SHORT.get(o['org'], o['org']), full=o['org'], lat=lat, lng=lng,
                     approx=approx, note=note, bairro=o['bairro']))
assert orgs, 'no organisations in org_points.json'
orgs.sort(key=lambda o: -o['lat'])  # number north → south
for i, o in enumerate(orgs, 1):
    o['n'] = i
    o['x'], o['y'] = merc(o['lng'], o['lat'])
# The numbering, for the tables (organizacoes.csv numbers as the maps do).
json.dump([{'org': o['full'], 'n': o['n']} for o in orgs], open(f'{OUT}/numbers.json', 'w'), ensure_ascii=False)


# ════════════════════════════════════════════════════════════════════════════
# OFFICIAL-DATA VERSION — ARVC/PLAC ameaça (atual + 2050) + SMAMUS Guaíba cota + SGB sectors
# usage: see the docstring at the top
# ════════════════════════════════════════════════════════════════════════════
import textwrap
from PIL import Image
ARVC = sys.argv[3]
# The two periods printed. 'historical' is the PLAC's reference period — what
# the publication calls "atual". Only 2050 has a 24-bit .value.png; the display
# PNG is paletted with the pixel index = round(value × 254) and 255 = nodata
# (scripts/build-arvc-official.py), so it decodes to the same values.
WINDOWS = ('historical', '2050')
WINDOW_SLUG = {'historical': 'atual', '2050': '2050'}
WINDOW_PT = {'historical': 'período atual (referência 1995–2014)', '2050': 'cenário 2050 do PLAC (2041–2060, SSP3-7.0)'}
WINDOW_SHORT = {'historical': 'atual (1995–2014)', '2050': '2050'}
man = json.load(open(f'{ARVC}/manifest.json'))

def load_arvc(h, window):
    lid = f'arvc_off_threat_{h}_{window}'
    meta = man['layers'][lid]
    if os.path.exists(f'{ARVC}/{lid}.value.png'):
        a = np.asarray(Image.open(f'{ARVC}/{lid}.value.png').convert('RGB')).astype(np.int32)
        valid = (a[..., 1] == 0) & (a[..., 2] == 0)       # nodata = (255,255,255)
        v = np.where(valid, a[..., 0] / 254.0, np.nan).astype(np.float32)
    else:
        im = Image.open(f'{ARVC}/{lid}.png')
        assert im.mode == 'P', f'{lid}.png is not paletted — cannot read values from it'
        idx = np.asarray(im).astype(np.int32)
        v = np.where(idx < 255, idx / 254.0, np.nan).astype(np.float32)
    (s, w), (n, e) = meta['bounds']
    x0, y0 = merc(w, s); x1, y1 = merc(e, n)
    return v, (x0, x1, y0, y1), meta, lid

YLORRD = ['#FFFFB2', '#FECC5C', '#FD8D3C', '#F03B20', '#BD0026']  # HAZARD_TILE_RAMP
CLASS_NAMES = ['muito baixa', 'baixa', 'média', 'alta', 'muito alta']
WATER, WATER_EDGE, RIVER = '#dfe6ec', '#b4c3cf', '#9fb3c3'
CITY_FILL = '#f3f3f1'; BAIRRO = '#a3a3a0'; BOUNDARY = '#2b2b2b'; INK = '#1f1f1f'
FLOOD24 = '#08306b'; SGB_COL = '#1a1a1a'

# SMAMUS "Cotas de inundação do Guaíba (10 cm a 6 m)": nested cumulative contours
# (each polygon = everything below that Guaíba level). Take the contour closest to,
# and not above, the May 2024 peak of 5,35 m, clipped to the municipality.
import gzip
COTA_FILE = sys.argv[3].replace('client/public/arvc-official', 'knowledge/porto-alegre/city/layers/cotas-inundacao.geojson.gz')
cotas = json.load(gzip.open(COTA_FILE))['features']
COTA_CM = max(f['properties']['contourmax'] for f in cotas if f['properties']['contourmax'] <= 535)
flood24 = unary_union([merc_geom(shape(f['geometry'])).buffer(0) for f in cotas
                       if f['properties']['contourmax'] <= COTA_CM]).intersection(city)
COTA_TXT = f'{COTA_CM / 100:.2f}'.replace('.', ',')
# SGB/CPRM sectors — mass-movement types only (primary typology tipolo_g1)
SGB_TYPES = {'Deslizamento', 'Queda', 'Corrida de massa'}
sgb_all = json.load(open(ARVC.replace('client/public/arvc-official', 'knowledge/official-risk/porto-alegre/sgb-setorizacao.json')))['features']
sgb = [merc_geom(shape(f['geometry'])) for f in sgb_all if f['properties'].get('tipolo_g1') in SGB_TYPES]
# SGB/CPRM susceptibility (scripts/build-sgb-suscetibilidade.py), one feature per class.
def load_susc(slug):
    fc = json.load(open(ARVC.replace('client/public/arvc-official', f'knowledge/official-risk/porto-alegre/sgb-suscetibilidade-{slug}.json')))
    return {f['properties']['classe']: merc_geom(shape(f['geometry'])).buffer(0).intersection(city) for f in fc['features']}
SUSC_SRC = 'SGB/CPRM — Carta de suscetibilidade a movimentos gravitacionais de massa e inundação, Porto Alegre, 2015 (1:70.000)'

HAZ = {
    # "enchente" is not the name of a risk (Julia, 20 Nov): the file says inundação.
    'inundacao': dict(sgb='inundacao', title='Suscetibilidade a inundação',
        subtitle='Porto Alegre · inundação pelos arroios e pelo Guaíba (SGB/CPRM), e o nível do Guaíba na cheia de maio de 2024 (' + COTA_TXT + ' m, SMAMUS)',
        classes=['Baixa', 'Média', 'Alta'], colors=['#c6dbef', '#6baed6', '#08519c'],
        nodata='sem suscetibilidade a inundação mapeada',
        extra_src='Cotas de inundação do Guaíba — SMAMUS'),
    'ilhas_de_calor': dict(arvc='heat', title='Ameaça de ondas de calor',
        subtitle='Porto Alegre · ondas de calor, {period}',
        ramp_label='ondas de calor, PLAC/ARVC', nodata='sem dado', extra_src=None),
    'deslizamentos': dict(sgb='movimento-de-massa', title='Suscetibilidade a deslizamentos',
        subtitle='Porto Alegre · suscetibilidade a deslizamentos (SGB/CPRM) e setores de risco mapeados em campo (SGB)',
        classes=['Média', 'Alta'], colors=['#fd8d3c', '#bd0026'],
        nodata='suscetibilidade baixa',
        extra_src='SGB — Setorização de Risco (2022)'),
}
SUSC = {hz: load_susc(c['sgb']) for hz, c in HAZ.items() if 'sgb' in c}
FLOOD24_LINE = '#d7301f'
def windows_for(hz): return (None,) if 'sgb' in HAZ[hz] else WINDOWS
# Every map is drawn twice: with the organisations on it, and without (same
# file names under NO_ORGS_DIR) — asked for on 27 Nov 2026, to use the maps alone.
NO_ORGS_DIR = 'sem_organizacoes'
os.makedirs(f'{OUT}/{NO_ORGS_DIR}', exist_ok=True)
def out_base(hz, window, with_orgs=True):
    return (OUT if with_orgs else f'{OUT}/{NO_ORGS_DIR}') + f'/mapa_{hz}' + (f'_{WINDOW_SLUG[window]}' if window else '')

def fmt(x): return f'{x:.2f}'.replace('.', ',')

def geom_to_path(g):
    verts, codes = [], []
    polys = [g] if isinstance(g, Polygon) else list(getattr(g, 'geoms', []))
    for p in polys:
        if not isinstance(p, Polygon) or p.is_empty: continue
        for ring in [p.exterior, *p.interiors]:
            c = np.asarray(ring.coords)
            verts += c.tolist(); codes += [Path.MOVETO] + [Path.LINETO] * (len(c) - 2) + [Path.CLOSEPOLY]
    return Path(verts, codes) if verts else None

def fit_extent(cx, cy, w, h, aspect):
    if w / h < aspect: w = h * aspect
    else: h = w / aspect
    return cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2

_EDGES = {}
def classes_for(h):
    # ONE linear stretch per hazard, over the 2nd–98th percentile of BOTH periods
    # together — so "atual" and 2050 share a legend and the change shows as colour
    # (a per-period stretch would paint both maps the same). p2–p98 instead of
    # min–max so a few outliers (e.g. landslide zeros) don't squeeze the city into
    # one or two classes; ends are open (≤ / ≥).
    if h not in _EDGES:
        v = np.concatenate([load_arvc(h, w)[0].ravel() for w in WINDOWS])
        lo, hi = np.nanpercentile(v, [2, 98])
        _EDGES[h] = [float(lo + k * (hi - lo) / 5) for k in range(6)]
    return _EDGES[h]

def draw_map(ax, hz, window, ext, badge_r_pt, show_furniture=True, fig=None, with_orgs=True):
    cfg = HAZ[hz]
    ax.set_xlim(ext[0], ext[1]); ax.set_ylim(ext[2], ext[3]); ax.set_aspect('equal'); ax.set_axis_off()
    ax.add_patch(Rectangle((ext[0], ext[2]), ext[1] - ext[0], ext[3] - ext[2], fc='white', ec='none', zorder=0))
    view = box(ext[0], ext[2], ext[1], ext[3])
    city_path = geom_to_path(city)
    ax.add_patch(PathPatch(city_path, fc=CITY_FILL, ec='none', zorder=1))
    if 'sgb' in cfg:
        for c, col in zip(cfg['classes'], cfg['colors']):
            p = geom_to_path(SUSC[hz].get(c, Polygon()))
            if p: ax.add_patch(PathPatch(p, fc=col, ec='none', lw=0, zorder=2))
    else:
        v, rext, meta, _ = load_arvc(cfg['arvc'], window)
        edges = classes_for(cfg['arvc'])
        cls = np.clip(np.digitize(v, edges[1:5]), 0, 4).astype(float)
        cls[~np.isfinite(v)] = np.nan
        cmap = ListedColormap(YLORRD); cmap.set_bad((0, 0, 0, 0))
        im = ax.imshow(np.ma.masked_invalid(cls), extent=rext, cmap=cmap, vmin=-0.5, vmax=4.5,
                       interpolation='nearest', zorder=2)
        im.set_clip_path(PathPatch(city_path, transform=ax.transData))
    wp = geom_to_path(water.intersection(view))
    if wp: ax.add_patch(PathPatch(wp, fc=WATER, ec=WATER_EDGE, lw=0.25, zorder=3))
    for ln in river_lines:
        if ln.intersects(view):
            c = np.asarray(ln.coords); ax.plot(c[:, 0], c[:, 1], color=RIVER, lw=0.35, zorder=3, solid_capstyle='round')
    for g in bairros_m:
        p = geom_to_path(g)
        if p: ax.add_patch(PathPatch(p, fc='none', ec=BAIRRO, lw=0.28, zorder=4))
    if hz == 'inundacao':
        p = geom_to_path(flood24)
        ax.add_patch(PathPatch(p, fc='none', ec='white', lw=1.6, zorder=6))
        ax.add_patch(PathPatch(p, fc='none', ec=FLOOD24_LINE, lw=0.8, zorder=6.1))
    if hz == 'deslizamentos':
        for g in sgb:
            p = geom_to_path(g)
            if p:
                ax.add_patch(PathPatch(p, fc='none', ec='white', lw=1.8, zorder=6))
                ax.add_patch(PathPatch(p, fc='none', ec=SGB_COL, lw=0.8, zorder=6.1))
    ax.add_patch(PathPatch(city_path, fc='none', ec=BOUNDARY, lw=0.9, zorder=7))
    fig = fig or ax.figure
    ax_w_pt = ax.get_position().width * fig.get_figwidth() * 72
    upp = (ext[1] - ext[0]) / ax_w_pt
    r = badge_r_pt * upp
    if not with_orgs:
        if show_furniture: add_north_and_scale(ax, ext, upp)
        return
    pos = np.array([[o['x'], o['y']] for o in orgs], float); anchor = pos.copy()
    min_d = 2.35 * r
    for _ in range(400):
        moved = False
        for i in range(len(pos)):
            for j in range(i + 1, len(pos)):
                d = pos[j] - pos[i]; dist = np.hypot(*d)
                if dist < min_d:
                    if dist < 1e-6: d = np.array([1.0, 0.3]); dist = np.hypot(*d)
                    push = (min_d - dist) / 2 * d / dist
                    pos[i] -= push; pos[j] += push; moved = True
        if not moved: break
    for o, (bx, by), (axx, ayy) in zip(orgs, pos, anchor):
        disp = np.hypot(bx - axx, by - ayy)
        if disp > 0.3 * r:
            vv = np.array([bx - axx, by - ayy]) / disp
            ax.plot([axx, bx - vv[0] * r], [ayy, by - vv[1] * r], color=INK, lw=0.6, zorder=9)
            ax.add_patch(Circle((axx, ayy), 0.22 * r, fc=INK if not o['approx'] else 'white', ec=INK, lw=0.6, zorder=10))
        if o['approx']:
            ax.add_patch(Circle((bx, by), r, fc='white', ec=INK, lw=1.1, ls=(0, (2.2, 1.4)), zorder=11)); col = INK
        else:
            ax.add_patch(Circle((bx, by), r, fc=INK, ec='white', lw=0.9, zorder=11)); col = 'white'
        ax.text(bx, by - 0.04 * r, str(o['n']), ha='center', va='center', fontsize=badge_r_pt * 1.02,
                fontweight='semibold', color=col, zorder=12)
    if show_furniture: add_north_and_scale(ax, ext, upp)

def add_north_and_scale(ax, ext, upp):
    w = ext[1] - ext[0]; h = ext[3] - ext[2]
    x0 = ext[0] + 0.06 * w; y0 = ext[2] + 0.05 * h
    lat_c = math.degrees(2 * math.atan(math.exp((ext[2] + ext[3]) / 2 / R)) - math.pi / 2)
    seg = 1000 / math.cos(math.radians(lat_c)); bh = 5 * upp
    for i in range(5):
        ax.add_patch(Rectangle((x0 + i * seg, y0), seg, bh, fc=INK if i % 2 == 0 else 'white', ec=INK, lw=0.6, zorder=20))
    for i, lab in [(0, '0'), (1, '1'), (2, '2'), (5, '5 km')]:
        ax.text(x0 + i * seg, y0 + bh + 3 * upp, lab, ha='center', va='bottom', fontsize=7, color=INK, zorder=20)
    nx, ny = x0 + 0.6 * seg, y0 + 32 * upp; ah = 22 * upp; aw = 7 * upp
    ax.add_patch(MPoly([[nx, ny + ah], [nx - aw, ny], [nx, ny + 0.3 * ah]], closed=True, fc=INK, ec=INK, lw=0.6, zorder=20))
    ax.add_patch(MPoly([[nx, ny + ah], [nx + aw, ny], [nx, ny + 0.3 * ah]], closed=True, fc='white', ec=INK, lw=0.6, zorder=20))
    ax.text(nx, ny + ah + 3 * upp, 'N', ha='center', va='bottom', fontsize=9, fontweight='semibold', color=INK, zorder=20)

A4W, A4H = 2480 / 300, 3508 / 300
cxm, cym = merc((lng0 + lng1) / 2, (lat0 + lat1) / 2)
x0m, y0m = merc(lng0, lat0); x1m, y1m = merc(lng1, lat1)
CW, CH = (x1m - x0m), (y1m - y0m)

def source_line(cfg):
    parts = [('Fonte: ' + SUSC_SRC) if 'sgb' in cfg else 'Fonte: Prefeitura de Porto Alegre / SMAMUS — Análise de Riscos e Vulnerabilidades Climáticas (ARVC) do PLAC, 2023']
    if cfg['extra_src']: parts.append(cfg['extra_src'])
    return '; '.join(parts) + '. Limites: IBGE. Água: ©\u00a0OpenStreetMap.'

def render_with_legend(hz, window, with_orgs=True):
    cfg = HAZ[hz]
    edges = classes_for(cfg['arvc']) if 'arvc' in cfg else None
    fig = plt.figure(figsize=(A4W, A4H), dpi=300); fig.patch.set_facecolor('white')
    L, Rm = 0.45, 0.45
    map_bottom, map_top = 3.28, A4H - 1.25
    axw, axh = A4W - L - Rm, map_top - map_bottom
    ax = fig.add_axes([L / A4W, map_bottom / A4H, axw / A4W, axh / A4H])
    ext = fit_extent(cxm, cym, CW * 1.04, CH * 1.04, axw / axh)
    draw_map(ax, hz, window, ext, badge_r_pt=6.2, fig=fig, with_orgs=with_orgs)
    fig.add_artist(Rectangle((L / A4W, map_bottom / A4H), axw / A4W, axh / A4H, transform=fig.transFigure,
                             fc='none', ec='#c9c9c6', lw=0.5))
    fig.text(L / A4W, (A4H - 0.62) / A4H, cfg['title'] + (f" — {WINDOW_SHORT[window]}" if window else ''), fontsize=20, fontweight='semibold', color=INK, va='baseline')
    sub = textwrap.wrap(cfg['subtitle'].format(period=WINDOW_PT.get(window, '')), 112)
    for k, line in enumerate(sub):
        fig.text(L / A4W, (A4H - 0.93 - k * 0.17) / A4H, line, fontsize=9.5, color='#555', va='baseline')
    H = 2.45
    lg = fig.add_axes([L / A4W, 0.62 / A4H, axw / A4W, H / A4H]); lg.set_axis_off()
    lg.set_xlim(0, axw); lg.set_ylim(0, H)
    sw_w, sw_h, top = 0.62, 0.18, H - 0.52
    if 'sgb' in cfg:
        lg.text(0, H - 0.05, 'Suscetibilidade', fontsize=10, fontweight='semibold', color=INK, va='top')
        lg.text(1.12, H - 0.07, 'SGB/CPRM, 2015', fontsize=7.5, color=INK, va='top')
        lg.text(0, H - 0.32, 'classes da carta de suscetibilidade do SGB (validada em campo)', fontsize=7, color='#555', va='top')
        names = (['baixa'] if hz == 'deslizamentos' else []) + [c.lower() for c in cfg['classes']]
        cols = ([CITY_FILL] if hz == 'deslizamentos' else []) + cfg['colors']
        for i, (c, n) in enumerate(zip(cols, names)):
            lg.add_patch(Rectangle((i * sw_w, top - sw_h), sw_w, sw_h, fc=c, ec='white' if c != CITY_FILL else '#bbb', lw=0.8 if c != CITY_FILL else 0.4))
            lg.text(i * sw_w + sw_w / 2, top - sw_h - 0.06, n, ha='center', va='top', fontsize=7, color=INK)
    else:
        lg.text(0, H - 0.05, 'Ameaça', fontsize=10, fontweight='semibold', color=INK, va='top')
        lg.text(0.68, H - 0.07, cfg['ramp_label'], fontsize=7.5, color=INK, va='top')
        lg.text(0, H - 0.32, 'mais baixa → mais alta · mesma escala em atual e 2050', fontsize=7, color='#555', va='top')
        for i, (c, n) in enumerate(zip(YLORRD, CLASS_NAMES)):
            lg.add_patch(Rectangle((i * sw_w, top - sw_h), sw_w, sw_h, fc=c, ec='white', lw=0.8))
            lg.text(i * sw_w + sw_w / 2, top - sw_h - 0.06, n, ha='center', va='top', fontsize=7, color=INK)
            rng = f'≤ {fmt(edges[1])}' if i == 0 else f'≥ {fmt(edges[4])}' if i == 4 else f'{fmt(edges[i])}–{fmt(edges[i + 1])}'
            lg.text(i * sw_w + sw_w / 2, top - sw_h - 0.21, rng, ha='center', va='top',
                    fontsize=6.2, color='#666')
    rows = []
    if hz == 'inundacao':
        rows.append(('line24', f'nível do Guaíba a {COTA_TXT} m (cheia de maio de 2024), SMAMUS'))
        rows.append(('nodata', cfg['nodata'])); rows.append(('water', 'água (Guaíba, rios, lagos)'))
    else:
        if hz == 'deslizamentos':
            rows.append(('sgb', 'setores de risco alto / muito alto mapeados em campo (SGB)'))
            rows.append(('water', 'água (Guaíba, rios, lagos)'))
        else:
            rows.append(('nodata+water', None))
    if with_orgs: rows.append(('markers', None))
    yy = top - sw_h - 0.52
    for kind, label in rows:
        if kind == 'line24':
            lg.plot([0, 0.26], [yy, yy], color=FLOOD24_LINE, lw=1.2)
        elif kind == 'sgb':
            lg.add_patch(Rectangle((0, yy - 0.075), 0.26, 0.15, fc='white', ec=SGB_COL, lw=0.9))
        elif kind == 'nodata':
            lg.add_patch(Rectangle((0, yy - 0.065), 0.26, 0.13, fc=CITY_FILL, ec='#bbb', lw=0.4))
        elif kind == 'water':
            lg.add_patch(Rectangle((0, yy - 0.065), 0.26, 0.13, fc=WATER, ec=WATER_EDGE, lw=0.4))
        elif kind == 'nodata+water':
            lg.add_patch(Rectangle((0, yy - 0.065), 0.26, 0.13, fc=CITY_FILL, ec='#bbb', lw=0.4))
            lg.text(0.34, yy, cfg['nodata'], fontsize=7, va='center', color=INK)
            lg.add_patch(Rectangle((1.62, yy - 0.065), 0.26, 0.13, fc=WATER, ec=WATER_EDGE, lw=0.4))
            lg.text(1.96, yy, 'água (Guaíba, rios, lagos)', fontsize=7, va='center', color=INK)
        elif kind == 'markers':
            lg.add_patch(Circle((0.13, yy), 0.085, fc=INK, ec='white', lw=0.8))
            lg.text(0.13, yy - 0.004, '1', ha='center', va='center', fontsize=6, color='white', fontweight='semibold')
            lg.text(0.34, yy, 'organização da rede', fontsize=7, va='center', color=INK)
            lg.add_patch(Circle((1.75, yy), 0.085, fc='white', ec=INK, lw=1.0, ls=(0, (2.2, 1.4))))
            lg.text(1.75, yy - 0.004, '2', ha='center', va='center', fontsize=6, color=INK, fontweight='semibold')
            lg.text(1.96, yy, 'localização aproximada', fontsize=7, va='center', color=INK)
        if label and kind != 'nodata+water':
            lg.text(0.34, yy, label, fontsize=7, va='center', color=INK, linespacing=1.25)
        yy -= 0.235 + (0.09 if label and '\n' in label else 0)
    note = 'Atual = 1995–2014; 2050 = 2041–2060, SSP3-7.0. Classes iguais entre os percentis 2 e 98 dos dois períodos.'
    if hz == 'inundacao':
        note = ('Suscetibilidade: o quanto o terreno favorece a inundação (relevo e drenagem), sem cenário climático. '
                'A linha do Guaíba inclui áreas atrás de diques. Alagamento por chuva (drenagem) não está mapeado.')
    elif hz == 'deslizamentos':
        note = ('Suscetibilidade: o quanto o terreno favorece deslizamentos (declividade, solo, geologia), sem cenário climático. '
                'Setor de risco: área com moradias ameaçadas vistoriada pelo SGB; fora de um setor não quer dizer sem risco.')
    for k, line in enumerate(textwrap.wrap(note, 140)):
        lg.text(0, min(yy + 0.02, 0.36) - k * 0.13, line, fontsize=6.2, color='#666', va='center')
    if with_orgs:
        ox = 3.3
        lg.text(ox, H - 0.05, 'Organizações da Rede SCbN POA', fontsize=10, fontweight='semibold', color=INK, va='top')
        colw = 1.72
        for i, o in enumerate(orgs):
            col, row = divmod(i, 6)
            x = ox + col * colw; y = H - 0.42 - row * 0.255
            lg.text(x + 0.17, y, f'{o["n"]}', ha='right', va='center', fontsize=7.5, fontweight='semibold', color=INK)
            lg.text(x + 0.25, y, o['name'] + (' *' if o['approx'] else ''), va='center', fontsize=7.5, color=INK)
        lg.text(ox, H - 0.42 - 6 * 0.255 + 0.05, '* localização aproximada', fontsize=6.5, color='#666', va='center')
    lines = textwrap.wrap(source_line(cfg), 150)
    for k, line in enumerate(lines):
        fig.text(L / A4W, (0.42 - k * 0.14) / A4H, line, fontsize=6.8, color='#555', va='baseline')
    base = out_base(hz, window, with_orgs)
    fig.savefig(base + '.png', dpi=300, facecolor='white')
    fig.savefig(base + '.pdf', dpi=300, facecolor='white')
    plt.close(fig)

def render_bare(hz, window, with_orgs=True):
    fig = plt.figure(figsize=(A4W, A4H), dpi=300)
    ax = fig.add_axes([0, 0, 1, 1])
    ext = fit_extent(cxm, cym, CW * 1.06, CH * 1.06, A4W / A4H)
    draw_map(ax, hz, window, ext, badge_r_pt=7.0, fig=fig, with_orgs=with_orgs)
    fig.savefig(out_base(hz, window, with_orgs) + '_sem_legenda.png', dpi=300, facecolor='white')
    plt.close(fig)

if __name__ == '__main__':
    print('sgb mass-movement sectors:', len(sgb), 'of', len(sgb_all))
    for hz in (sys.argv[4:] or list(HAZ)):
        if 'arvc' in HAZ[hz]: print(hz, 'edges (both periods)', [round(e, 3) for e in classes_for(HAZ[hz]['arvc'])])
        for window in windows_for(hz):
            for with_orgs in (True, False):
                render_with_legend(hz, window, with_orgs); render_bare(hz, window, with_orgs)
            print('done', hz, window)
