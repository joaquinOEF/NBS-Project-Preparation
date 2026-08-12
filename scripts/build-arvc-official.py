#!/usr/bin/env python3
"""
Turn the official ARVC GeoTIFFs into web artifacts.

WHAT THIS REPLACES CONCEPTUALLY (but does not delete): scripts/extract-arvc-figures.py
recovered these same surfaces by colour-matching the printed figures in the PDF,
because that was all we had. On 2026-08-11 SMAMUS sent the actual rasters, so the
reconstruction is now only of historical interest — see docs/arvc-official.md for
the measured gap between the two.

The source rasters are float32, continuous 0-1, 29.13 m, EPSG:31997
(SIRGAS 1995 / UTM 22S — note: NOT 31982/SIRGAS 2000, which is what the report's
prose claims). Each ships with a QGIS .qml written by WayCarbon; that file is the
authoritative colour ramp, so we read it rather than inventing our own palette.

What ships (one artifact per layer, so nothing can drift out of sync):

    client/public/arvc-official/<id>.png   +   .../manifest.json

A 29 m colour overlay warped to EPSG:3857, rendered with the layer's own QML
ramp, alpha 0 where the source has nodata. Drawn with L.imageOverlay — no tile
pyramid, no tile server, full native detail.

There is deliberately NO separate values file. PNG is lossless and the ramp is a
known monotonic function of value, so the client recovers the number by matching
the pixel back through the same 256-entry LUT written into the manifest
(`shared/arvc-official.ts:decodeArvcValue`). A parallel values JSON would have
cost ~4 MB and been one more thing to keep in step with the pixels.

`--values-out PATH` still writes a 250 m value grid, on the SAME grid spec as the
PDF reconstruction in knowledge/official-risk/porto-alegre/arvc-poa.json, so the
two can be compared cell-for-cell without resampling either. That is an analysis
artifact — it is not served to the client. See scripts/compare-arvc-sources.py.

Usage:
    .venv-geo/bin/python scripts/build-arvc-official.py [--src DIR] [--skip-png]
                                                        [--values-out PATH]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, asdict

import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling, transform_bounds
from PIL import Image

# --------------------------------------------------------------------------
# Layer taxonomy
# --------------------------------------------------------------------------
# The filenames encode component/hazard/period, but not consistently: the
# vulnerability rasters use three different spellings of the same word
# (DISEASE_VULN, DROUGHT_VUL, HEATWAVE_VUL) and the hazard token for landslide
# is LANDS in risk/threat but LANDS in vulnerability too, while arbovirus is
# DISEASE everywhere except the report, which calls it "vetores de arboviroses".
# So the mapping is written out by hand rather than parsed.

HAZARDS = {
    'flood':     dict(pt='Inundação Fluvial',        en='River flood'),
    'landslide': dict(pt='Deslizamento',              en='Landslide'),
    'heat':      dict(pt='Ondas de Calor',            en='Heat wave'),
    'drought':   dict(pt='Secas Meteorológicas',      en='Meteorological drought'),
    'arbovirus': dict(pt='Vetores de Arboviroses',    en='Arbovirus vectors'),
    'storm':     dict(pt='Tempestades',               en='Storm'),
}

# period token in filename -> (id, label). The metadata XML defines the windows:
# historical = 1995-2014, 2030 = 2021-2040, 2050 = 2041-2060, scenario SSP3-7.0.
PERIODS = {
    'HIS_2004': ('historical', 'Historical (1995–2014)'),
    '370_2030': ('2030',       '2030 (2021–2040, SSP3-7.0)'),
    '370_2050': ('2050',       '2050 (2041–2060, SSP3-7.0)'),
}

THREAT_TOKEN = {'flood': 'FLOOD', 'landslide': 'LANDS', 'heat': 'HEAT',
                'drought': 'DROUGHT', 'arbovirus': 'DISEASE', 'storm': 'STORM'}
RISK_TOKEN = dict(THREAT_TOKEN)
VULN_FILE = {
    'flood': 'FLOOD_VULN', 'landslide': 'LANDS_VULN', 'heat': 'HEATWAVE_VUL',
    'drought': 'DROUGHT_VUL', 'arbovirus': 'DISEASE_VULN', 'storm': 'STORM_VULN',
}


@dataclass
class Layer:
    id: str
    file: str
    component: str          # threat | vulnerability | exposure | risk
    hazard: str | None      # None for exposure
    period: str | None      # None for vulnerability/exposure (they are static)
    name_en: str
    name_pt: str


def build_catalog() -> list[Layer]:
    out: list[Layer] = []

    # Exposure — shared by every hazard, no period dimension.
    out.append(Layer('arvc_off_exposure_population', 'EXPO_POP', 'exposure', None, None,
                     'Population exposure', 'Índice de exposição da população total'))
    out.append(Layer('arvc_off_exposure_black_population', 'EXPO_POP_NEGRA', 'exposure', None, None,
                     'Black population exposure', 'Índice de exposição da população negra'))

    for hz, names in HAZARDS.items():
        # Vulnerability — one static surface per hazard, no period dimension.
        out.append(Layer(f'arvc_off_vulnerability_{hz}', VULN_FILE[hz], 'vulnerability', hz, None,
                         f'{names["en"]} vulnerability', f'Vulnerabilidade — {names["pt"]}'))
        for tok, (pid, plabel) in PERIODS.items():
            out.append(Layer(f'arvc_off_threat_{hz}_{pid}', f'THREAT_{THREAT_TOKEN[hz]}_{tok}',
                             'threat', hz, pid,
                             f'{names["en"]} hazard — {plabel}', f'Ameaça — {names["pt"]} — {plabel}'))
            out.append(Layer(f'arvc_off_risk_{hz}_{pid}', f'RISK_{RISK_TOKEN[hz]}_{tok}',
                             'risk', hz, pid,
                             f'{names["en"]} risk — {plabel}', f'Risco — {names["pt"]} — {plabel}'))
    return out


# --------------------------------------------------------------------------
# QML colour ramp
# --------------------------------------------------------------------------

def read_qml_ramp(qml_path: str) -> list[tuple[float, tuple[int, int, int]]]:
    """The <item> stops out of a QGIS singlebandpseudocolor style.

    WayCarbon set colorRampType="INTERPOLATED" but labelled the items as
    half-open bins ("[0.2:0.4["). We honour the type, not the labels: the
    underlying data really is continuous, and a 5-step posterisation would throw
    away the very resolution that makes these files better than the PDF. The
    labels are still used, verbatim, for the legend.
    """
    root = ET.parse(qml_path).getroot()
    stops: list[tuple[float, tuple[int, int, int]]] = []
    for item in root.iter('item'):
        c = item.get('color')
        v = item.get('value')
        if c is None or v is None:
            continue
        c = c.lstrip('#')
        stops.append((float(v), (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))))
    stops.sort(key=lambda s: s[0])
    if not stops:
        raise ValueError(f'no colour stops in {qml_path}')
    return stops


# Palette index 255 is reserved for "no data", so values quantise to 0..254.
# That is what makes the PNG a lossless value carrier: index = round(value * 254),
# and the client inverts it with the same constant.
VALUE_LEVELS = 255          # indices 0..254
NODATA_INDEX = 255


def ramp_lut(stops, n: int = VALUE_LEVELS) -> np.ndarray:
    """n x 3 uint8 lookup over the 0..1 domain, linearly interpolated."""
    xs = np.array([s[0] for s in stops], dtype=float)
    cs = np.array([s[1] for s in stops], dtype=float)
    grid = np.linspace(0.0, 1.0, n)
    lut = np.empty((n, 3), dtype=np.uint8)
    for ch in range(3):
        lut[:, ch] = np.clip(np.interp(grid, xs, cs[:, ch]), 0, 255).astype(np.uint8)
    return lut


# --------------------------------------------------------------------------
# Raster -> PNG overlay
# --------------------------------------------------------------------------

def render_png(src_path: str, qml_path: str, out_png: str, max_dim: int = 2400):
    """Warp to EPSG:3857 and colour it with the layer's own ramp.

    Returns (bounds_latlng, stats). Bounds are what L.imageOverlay needs:
    [[south, west], [north, east]].
    """
    with rasterio.open(src_path) as d:
        dst_crs = 'EPSG:3857'
        transform, width, height = calculate_default_transform(
            d.crs, dst_crs, d.width, d.height, *d.bounds)

        # Cap the long edge. Native is ~929x1283; the warp inflates it a little.
        # 2400 keeps every 29 m cell distinguishable without a 10 MB PNG.
        scale = min(1.0, max_dim / max(width, height))
        if scale < 1.0:
            transform = transform * rasterio.Affine.scale(1 / scale, 1 / scale)
            width = int(width * scale)
            height = int(height * scale)

        vals = np.full((height, width), np.nan, dtype=np.float32)
        reproject(
            source=rasterio.band(d, 1), destination=vals,
            src_transform=d.transform, src_crs=d.crs,
            dst_transform=transform, dst_crs=dst_crs,
            src_nodata=d.nodata, dst_nodata=np.nan,
            resampling=Resampling.bilinear)

        # Bilinear bleeds across the nodata edge, which would paint a soft halo
        # of invented values over the Guaíba. Warp the validity mask separately
        # with nearest and intersect, so the footprint stays exactly the source's.
        src_valid = (d.read(1) != d.nodata).astype(np.uint8)
        mask = np.zeros((height, width), dtype=np.uint8)
        reproject(
            source=src_valid, destination=mask,
            src_transform=d.transform, src_crs=d.crs,
            dst_transform=transform, dst_crs=dst_crs,
            resampling=Resampling.nearest)

        west, south, east, north = rasterio.transform.array_bounds(height, width, transform)

    valid = (mask == 1) & np.isfinite(vals)
    stops = read_qml_ramp(qml_path)
    lut = ramp_lut(stops)

    # Paletted PNG, not RGBA. Two reasons, both load-bearing:
    #   - size. The repo's CLAUDE.md records that PNGs over ~500 KB have caused
    #     `git push` to fail with HTTP 400. RGBA put the biggest layer at 648 KB;
    #     8-bit indexed puts every layer comfortably under that.
    #   - exactness. The pixel IS the quantised value, so the client recovers the
    #     number by reading the index rather than nearest-matching a colour — no
    #     ambiguity where a ramp doubles back or flattens.
    idx = np.where(
        valid,
        np.clip((np.nan_to_num(vals, nan=0.0) * (VALUE_LEVELS - 1)).round(), 0, VALUE_LEVELS - 1),
        NODATA_INDEX,
    ).astype(np.uint8)

    palette = np.zeros((256, 3), dtype=np.uint8)
    palette[:VALUE_LEVELS] = lut
    palette[NODATA_INDEX] = (0, 0, 0)

    img = Image.fromarray(idx, mode='P')
    img.putpalette(palette.reshape(-1).tolist())
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    img.save(out_png, optimize=True, transparency=NODATA_INDEX)

    w, s, e, n = transform_bounds(dst_crs, 'EPSG:4326', west, south, east, north)
    v = vals[valid]
    stats = dict(
        min=float(v.min()), max=float(v.max()), mean=float(v.mean()),
        valid_px=int(valid.sum()), width=width, height=height,
        legend=[{'value': sv, 'color': '#%02X%02X%02X' % c} for sv, c in stops],
    )
    return [[s, w], [n, e]], stats


# --------------------------------------------------------------------------
# Raster -> 250 m value grid
# --------------------------------------------------------------------------

GRID = dict(crs='EPSG:31982', cell_m=250.0, origin_e=462000.0, origin_n=6692000.0, nx=152,
            note='cell id = gy * nx + gx, gy counted south from origin_n')

PROVENANCE = dict(
    derived=False,
    headline='OFFICIAL — the ARVC rasters as delivered by SMAMUS.',
    received='2026-08-11, from SMAMUS (Secretaria Municipal do Meio Ambiente, Urbanismo e '
             'Sustentabilidade), Prefeitura Municipal de Porto Alegre.',
    source_document='P3 — Análise de Riscos e Vulnerabilidade Climáticas, '
                    'Plano de Ação Climática de Porto Alegre (2023)',
    source_authors='WayCarbon, ICLEI América do Sul, Ludovino Lopes Advogados, Ecofinance',
    commissioned_by='Banco Mundial / Prefeitura Municipal de Porto Alegre',
    source_crs='EPSG:31997 (SIRGAS 1995 / UTM 22S)',
    native_resolution_m=29.1321579,
    scenario='SSP3-7.0 (CMIP6 AR6). GCM ensemble: MIROC6, MRI-ESM2-0, NorESM2-MM, GFDL-ESM4, '
             'ACCESS-ESM1-5, IPSL-CM6A-LR. Windows: historical 1995–2014, 2030 = 2021–2040, '
             '2050 = 2041–2060.',
    method='R = ∛(ameaça × exposição × vulnerabilidade), per IPCC AR5/AR6. Reproduced from the '
           'delivered A/E/V rasters to a mean absolute error of 0.0035 (r = 0.997), so the '
           'components and the composite are mutually consistent.',
    attribution='Prefeitura Municipal de Porto Alegre / SMAMUS — Plano de Ação Climática, '
                'produto P3 (WayCarbon, ICLEI, Ludovino Lopes Advogados, Ecofinance)',
    encoding=dict(
        format='8-bit paletted PNG in EPSG:3857',
        value='value = paletteIndex / 254, for indices 0..254',
        nodata_index=NODATA_INDEX,
        value_levels=VALUE_LEVELS,
    ),
)


def grid_values(src_path: str, cell_ids: np.ndarray, cols: np.ndarray, rows: np.ndarray,
                half_px: float) -> dict[str, float]:
    """Block-mean the raster over each 250 m cell."""
    with rasterio.open(src_path) as d:
        arr = d.read(1, masked=True)
        H, W = arr.shape
    out: dict[str, float] = {}
    for cid, c, r in zip(cell_ids, cols, rows):
        c0, c1 = max(0, int(round(c - half_px))), min(W, int(round(c + half_px)))
        r0, r1 = max(0, int(round(r - half_px))), min(H, int(round(r + half_px)))
        if c1 <= c0 or r1 <= r0:
            continue
        win = arr[r0:r1, c0:c1]
        if win.count() == 0:
            continue
        out[str(int(cid))] = round(float(win.mean()), 4)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.expanduser('~/Downloads/PORTO_ALEGRE_ARVC_2023'))
    ap.add_argument('--skip-png', action='store_true')
    ap.add_argument('--values-out', default=None,
                    help='optional 250 m value grid for offline comparison; not served')
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    png_dir = os.path.join(root, 'client', 'public', 'arvc-official')
    values_path = args.values_out

    catalog = build_catalog()
    print(f'{len(catalog)} layers to build from {args.src}')

    cell_ids = cols = rows = None
    half_px = 0.0
    if values_path:
        cell_ids, cols, rows, half_px = build_grid_index(args.src)

    manifest, values = {}, {}
    for i, L in enumerate(catalog, 1):
        tif = os.path.join(args.src, f'PORTO_ALEGRE_RS_{L.file}.tif')
        qml = os.path.join(args.src, f'PORTO_ALEGRE_RS_{L.file}.qml')
        if not os.path.exists(tif):
            print(f'  !! MISSING {L.file}', file=sys.stderr)
            return 1

        entry = asdict(L)
        if not args.skip_png:
            bounds, stats = render_png(tif, qml, os.path.join(png_dir, f'{L.id}.png'))
            entry['bounds'] = bounds
            entry['stats'] = stats
        if values_path:
            values[L.id] = grid_values(tif, cell_ids, cols, rows, half_px)
        manifest[L.id] = entry
        n = f"cells={len(values[L.id]):5d}" if values_path else ''
        print(f'  [{i:2d}/{len(catalog)}] {L.id:44s} {n}')

    if values_path:
        used = sorted({int(k) for v in values.values() for k in v})
        payload = dict(grid=GRID, provenance=PROVENANCE, cell_ids=used, values=values)
        os.makedirs(os.path.dirname(os.path.abspath(values_path)), exist_ok=True)
        with open(values_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
        print(f'\nvalues -> {values_path}  '
              f'({os.path.getsize(values_path)/1e6:.2f} MB, {len(used)} cells)')

    if not args.skip_png:
        man_path = os.path.join(png_dir, 'manifest.json')
        with open(man_path, 'w', encoding='utf-8') as f:
            json.dump(dict(provenance=PROVENANCE, layers=manifest), f,
                      ensure_ascii=False, indent=2)
        tot = sum(os.path.getsize(os.path.join(png_dir, f)) for f in os.listdir(png_dir)
                  if f.endswith('.png'))
        print(f'pngs   -> {png_dir}  ({tot/1e6:.2f} MB total, {len(catalog)} layers)')
    return 0


def build_grid_index(src: str):
    """Cell centres of the shared 250 m grid, as (col, row) in the raster."""
    ref = os.path.join(src, 'PORTO_ALEGRE_RS_RISK_HEAT_370_2050.tif')
    with rasterio.open(ref) as d:
        ref_crs, ref_transform, ref_res = d.crs, d.transform, d.res[0]
        rw, rh = d.width, d.height
    from rasterio.warp import transform as warp_pts
    nx = GRID['nx']
    ny = int(np.ceil(rh * ref_res / GRID['cell_m'])) + 4
    gx, gy = np.meshgrid(np.arange(nx), np.arange(ny))
    gx, gy = gx.ravel(), gy.ravel()
    E = GRID['origin_e'] + (gx + 0.5) * GRID['cell_m']
    N = GRID['origin_n'] - (gy + 0.5) * GRID['cell_m']
    xs, ys = warp_pts(GRID['crs'], ref_crs, E.tolist(), N.tolist())
    cols, rows = (~ref_transform) * (np.array(xs), np.array(ys))
    inside = (cols >= 0) & (cols < rw) & (rows >= 0) & (rows < rh)
    cell_ids = (gy * nx + gx)[inside]
    cols, rows = cols[inside], rows[inside]
    half_px = GRID['cell_m'] / 2.0 / ref_res
    print(f'grid: {len(cell_ids)} candidate cells inside the raster footprint')
    return cell_ids, cols, rows, half_px


if __name__ == '__main__':
    sys.exit(main())
