"""
Run the ARVC recovery across every city-wide hazard figure.

Each figure is its own image at its own scale, so the affine is re-fitted per
figure from that figure's printed graticule. Nothing is assumed to carry over
from the heat map except the palette (all six share the ColorBrewer Reds ramp
and the same four non-data categories).

Every figure is scored before its output is trusted: the official municipal
boundary is rasterised through the fitted affine and compared against the
figure's own "Não se Aplica" grey, which is painted only outside the
municipality. A good fit puts data inside the boundary and grey outside.
"""
import json
import os
import subprocess
import sys
from collections import defaultdict

import numpy as np
from PIL import Image, ImageDraw
from pyproj import Transformer

SCRATCH = os.environ.get('ARVC_WORKDIR', os.path.join(os.getcwd(), '.arvc-work'))
REPO = os.getcwd()
PDF = f'{SCRATCH}/ARVC_POA.pdf'
CELL = 250.0

FWD = Transformer.from_crs('EPSG:4326', 'EPSG:31982', always_xy=True)
INV = Transformer.from_crs('EPSG:31982', 'EPSG:4326', always_xy=True)

RAMP = np.array([(253,245,239),(253,226,213),(251,194,170),(252,158,127),(251,123,90),
                 (244,85,62),(227,46,40),(194,22,24),(157,13,19),(102,0,13)], float)
NONDATA = np.array([(226,226,226),(198,226,242),(45,104,56),(166,209,162),
                    (128,128,128),(0,0,0),(90,90,90),(180,180,180)], float)
GREY_NA = np.array([226,226,226], float)
CLASS_NAMES = ['Muito Baixa','Baixa','Média','Alta','Muito Alta']
MAX_DIST = 42.0

# The panels share a 5 km graticule but NOT a common extent — the flood map is
# taller than the heat map. So only the SPACING is assumed; the absolute tick
# values are solved per figure (see solve_offset).
TICK_M = 5000.0

FIGURES = [
    ('flood_risk_2050',      85, 'Risco - Inundação Fluvial'),
    ('landslide_risk_2050',  93, 'Risco - Deslizamento'),
    ('heat_risk_2050',      100, 'Risco - Ondas de Calor'),
    ('drought_risk_2050',   106, 'Risco - Secas Meteorológicas'),
    ('arbovirus_risk_2050', 111, 'Risco - Vetores de Arboviroses'),
    ('storm_risk_2050',     117, 'Risco - Tempestades'),
]

_boundary = None
def boundary_rings():
    global _boundary
    if _boundary is None:
        d = json.load(open(f'{REPO}/client/public/sample-data/porto-alegre-boundary.json'))
        _boundary = d['boundaryGeoJson']['geometry']['coordinates']
    return _boundary


def extract_figure(page):
    """Largest embedded image on the page — the map itself."""
    out = f'{SCRATCH}/fig_p{page}'
    subprocess.run(['pdfimages', '-png', '-f', str(page), '-l', str(page), PDF, out],
                   check=True, capture_output=True)
    best, best_px = None, 0
    for f in sorted(os.listdir(SCRATCH)):
        if not f.startswith(f'fig_p{page}-'):
            continue
        p = f'{SCRATCH}/{f}'
        w, h = Image.open(p).size
        if w * h > best_px:
            best, best_px = p, w * h
    return best


def tick_centres(gray, lo, hi, axis):
    """Centres of the axis-label text blocks in the given strip."""
    strip = gray[lo:hi, :] if axis == 'x' else gray[:, lo:hi]
    hits = (strip < 128).sum(0 if axis == 'x' else 1) > 0
    runs, cur, out = [], [], None
    idx = np.nonzero(hits)[0]
    for i in idx:
        if cur and i - cur[-1] > 8:
            runs.append(cur); cur = []
        cur.append(i)
    if cur:
        runs.append(cur)
    return [ (r[0]+r[-1])/2 for r in runs if len(r) > 25 ]


def regular_run(centres):
    """Longest evenly-spaced subsequence, searched from EVERY starting index.

    The earlier version always started at index 0, so one stray text block above
    the first real tick shifted the whole anchor and silently corrupted the fit
    (the flood panel came out 34.9 x 31.5 m/px instead of 33.2 x 29.9, and the
    municipality landed several km south).
    """
    if len(centres) < 3:
        raise ValueError(f'only {len(centres)} tick candidates')
    spacing = float(np.median(np.diff(centres)))
    best = []
    for start in range(len(centres)):
        run = [start]
        for i in range(start + 1, len(centres)):
            if abs((centres[i] - centres[run[-1]]) - spacing) <= 0.15 * spacing:
                run.append(i)
        if len(run) > len(best):
            best = run
    if len(best) < 4:
        raise ValueError(f'only {len(best)} evenly-spaced ticks')
    return [centres[i] for i in best], spacing


def fit_scale(img):
    """Pixel size in metres, from the graticule spacing alone."""
    g = img.mean(2)
    H, W = g.shape
    dark = g < 120
    cols = [c for c in range(W) if dark[:, c].sum() > H * 0.30]
    rows = [r for r in range(H) if dark[r, :].sum() > W * 0.50]
    L, B = min(cols), max(rows)
    xs, _ = regular_run(tick_centres(g, B + 7, min(B + 62, H), 'x'))
    ys, _ = regular_run(tick_centres(g, max(L - 92, 0), L - 4, 'y'))
    def slope(pix):
        pix = np.array(pix, float)
        k = np.arange(len(pix))
        A = np.vstack([k, np.ones(len(k))]).T
        (m, b), *_ = np.linalg.lstsq(A, pix, rcond=None)
        resid = float(np.abs(A @ [m, b] - pix).max())
        return m, resid
    px_per_tick_x, rx = slope(xs)
    px_per_tick_y, ry = slope(ys)
    mx = TICK_M / px_per_tick_x           # metres per pixel, easting increases right
    my = -TICK_M / px_per_tick_y          # northing DEcreases downward
    resid_m = max(rx * abs(mx), ry * abs(my))
    return mx, my, xs[0], ys[0], resid_m


def _boundary_lonlat_utm():
    pts = []
    for poly in boundary_rings():
        for ring in poly:
            for lon, lat in ring[::3]:
                pts.append(FWD.transform(lon, lat))
    return np.array(pts)


def solve_offset(img, mx, my, x0_px, y0_px):
    """Absolute tick values for the anchor tick.

    Scored against the municipal outline the figure actually DRAWS: project the
    official boundary and ask what share of its vertices land on a dark pixel.
    That is far more discriminating than comparing grey areas — the previous
    area-based score accepted a fit that was kilometres out, because most of the
    page is non-grey either way.
    """
    H, W, _ = img.shape
    g = img.mean(2)
    dark = g < 150
    # 3x3 dilation so a 1 px outline still catches a vertex that lands beside it
    pad = np.pad(dark, 1)
    near = np.zeros_like(dark)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            near |= pad[dy:dy+H, dx:dx+W]
    utm = _boundary_lonlat_utm()
    best = None
    for xv in np.arange(455000, 495001, TICK_M):
        for yv in np.arange(6670000, 6705001, TICK_M):
            bx = xv - mx * x0_px
            by = yv - my * y0_px
            px = ((utm[:, 0] - bx) / mx).astype(int)
            py = ((utm[:, 1] - by) / my).astype(int)
            ok = (px >= 0) & (px < W) & (py >= 0) & (py < H)
            if ok.mean() < 0.95:
                continue
            hit = near[py[ok], px[ok]].mean()
            if best is None or hit > best[0]:
                best = (hit, bx, by)
    if best is None or best[0] < 0.5:
        raise ValueError(f'no offset placed the boundary on the drawn outline '
                         f'(best hit rate {best[0] if best else 0:.2f})')
    return best[1], best[2], best[0], best[0]


def fit_affine(img):
    mx, my, x0, y0, resid = fit_scale(img)
    bx, by, hit, _ = solve_offset(img, mx, my, x0, y0)
    return mx, bx, my, by, resid, hit


def boundary_mask(mx, bx, my, by, H, W):
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for poly in boundary_rings():
        for i, ring in enumerate(poly):
            pts = []
            for lon, lat in ring:
                e, n = FWD.transform(lon, lat)
                pts.append(((e - bx) / mx, (n - by) / my))
            if len(pts) >= 3:
                d.polygon(pts, fill=255 if i == 0 else 0)
    return np.asarray(m) > 0


def verify(img, inside):
    """Two independent checks on the fitted affine.

    'Não se Aplica' grey is the neighbouring municipalities' land, so EVERY grey
    pixel must fall outside the boundary. That is the discriminating test. (An
    earlier version scored "what fraction of everything outside is grey", which
    is meaningless — most of "outside" is the Guaíba and the white page margin,
    and it flagged every figure including ones that were provably correct.)
    """
    grey = np.linalg.norm(img - GREY_NA, axis=2) <= 18
    inside_nongrey = (~grey & inside).sum() / max(inside.sum(), 1)
    grey_outside = (grey & ~inside).sum() / max(grey.sum(), 1)
    return inside_nongrey, grey_outside


def run(label, page, title):
    png = extract_figure(page)
    img = np.asarray(Image.open(png).convert('RGB')).astype(float)
    H, W, _ = img.shape
    mx, bx, my, by, resid, hit = fit_affine(img)
    inside = boundary_mask(mx, bx, my, by, H, W)
    ing, outg = verify(img, inside)
    status = 'OK' if (hit > 0.80 and ing > 0.85 and outg > 0.90) else 'CHECK'
    print(f'{label:<20} p{page:<4} {W}x{H}  px={mx:5.2f}x{abs(my):5.2f} m  '
          f'resid={resid:5.1f} m  outline-hit={hit*100:5.1f}%  data-in={ing*100:5.1f}%  grey-out={outg*100:5.1f}%  [{status}]')
    if status != 'OK':
        return None

    flat = img.reshape(-1, 3)
    dr = np.linalg.norm(flat[:, None, :] - RAMP[None, :, :], axis=2)
    dn = np.linalg.norm(flat[:, None, :] - NONDATA[None, :, :], axis=2)
    step = dr.argmin(1)
    isramp = (dr.min(1) <= MAX_DIST) & (dr.min(1) < dn.min(1))
    val = np.where(isramp, step / 9.0, np.nan).reshape(H, W)
    val = np.where(inside, val, np.nan)

    yy, xx = np.nonzero(~np.isnan(val))
    e = mx * xx + bx
    n = my * yy + by
    e0 = np.floor(e.min() / CELL) * CELL
    n1 = np.ceil(n.max() / CELL) * CELL
    gx = ((e - e0) // CELL).astype(int)
    gy = ((n1 - n) // CELL).astype(int)
    nx = gx.max() + 1
    key = gy * nx + gx
    v = val[yy, xx]
    csum = np.bincount(key, weights=v)
    ccnt = np.bincount(key)
    good = np.nonzero(ccnt >= 15)[0]

    feats = []
    for k in good:
        cy, cx = divmod(int(k), nx)
        mean = csum[k] / ccnt[k]
        E0, N1 = e0 + cx * CELL, n1 - cy * CELL
        ring = [[round(c, 6) for c in INV.transform(x, y)] for x, y in
                [(E0, N1), (E0+CELL, N1), (E0+CELL, N1-CELL), (E0, N1-CELL)]]
        feats.append({'type': 'Feature',
                      'properties': {f'{label}_value': round(float(mean), 3),
                                     f'{label}_class': CLASS_NAMES[min(int(round(mean*9))//2, 4)],
                                     'n_px': int(ccnt[k])},
                      'geometry': {'type': 'Polygon', 'coordinates': [ring + [ring[0]]]}})

    json.dump({'type': 'FeatureCollection', 'name': f'arvc_{label}_grid250',
               'provenance': {'derived': True, 'figure_page': page, 'title': title,
                              'source': 'ARVC / PLAC Porto Alegre — WayCarbon, ICLEI, Ludovino, Ecofinance',
                              'note': 'Reconstruction from a published map figure. Not the official dataset.',
                              'affine_residual_m': round(resid, 1),
                              'qa_inside_with_data_pct': round(ing*100, 1),
                              'qa_outside_grey_pct': round(outg*100, 1)},
               'features': feats},
              open(f'{SCRATCH}/arvc_{label}_grid250.geojson', 'w'), ensure_ascii=False)

    np.save(f'{SCRATCH}/arvc_{label}_val.npy', val)
    with open(f'{SCRATCH}/arvc_{label}_affine.json', 'w') as f:
        json.dump({'mx': mx, 'bx': bx, 'my': my, 'by': by, 'png': png}, f)
    print(f'{"":<20}      -> {len(feats):,} cells, '
          f'{(~np.isnan(val)).sum()/inside.sum()*100:.0f}% of municipal area has a value')
    return label


if __name__ == '__main__':
    print(f'{"layer":<20} {"page":<5} {"size":<11} {"pixel":<17} {"fit":<13} '
          f'{"QA in":<13} {"QA out"}')
    print('-' * 108)
    done = [run(*f) for f in FIGURES]
    print('\nrecovered:', [d for d in done if d])
