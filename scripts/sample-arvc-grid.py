#!/usr/bin/env python3
"""
Build client/public/sample-data/porto-alegre-grid-250m.json from the official
ARVC rasters, in the exact schema generate-neighborhood-zones.ts already consumes.

WHY THIS EXISTS
The 250 m grid is gitignored by design (.gitignore:9, "run generate-grid-250m.ts
to create") — it is a 4 MB build artifact, correctly kept out of the repo.

The problem is that the two scripts which build it, generate-grid-250m.ts and
sample-catalog-risk.ts, both sample S3 rasters at z=13, and those tiles return 403
from outside the deploy environment. So in practice the grid could not be rebuilt,
and generate-neighborhood-zones.ts silently fell back to the 1 km grid — producing
something other than what the product ships, with no error.

This script rebuilds the same artifact from files on disk instead, so the zones
can be regenerated anywhere the ARVC rasters are available.

WHAT EACH METRIC MAPS TO
    <hz>_hazard         ameaça      THREAT_<HZ>_370_2050
    <hz>_exposure       exposição   EXPO_POP          (one surface, shared — theirs)
    <hz>_vulnerability  vulnerab.   <HZ>_VULN
    <hz>_risk           risco       RISK_<HZ>_370_2050
    <hz>_score          = _risk, matching the convention in sample-catalog-risk.ts

Cell values are the MEAN of the 29 m pixels inside the cell. The decision about
whether a bairro is represented by the mean or the peak of its cells belongs in
generate-neighborhood-zones.ts, not here — see the P90 note there.

Usage:
    .venv-geo/bin/python scripts/sample-arvc-grid.py [--src DIR] [--cell 250]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import rasterio
from rasterio.warp import transform as warp_pts
from rasterio.warp import transform_geom as transform_geom_g

HAZARDS = {
    'flood': ('THREAT_FLOOD_370_2050', 'FLOOD_VULN', 'RISK_FLOOD_370_2050'),
    'heat': ('THREAT_HEAT_370_2050', 'HEATWAVE_VUL', 'RISK_HEAT_370_2050'),
    'landslide': ('THREAT_LANDS_370_2050', 'LANDS_VULN', 'RISK_LANDS_370_2050'),
}
GRID_CRS = 'EPSG:31982'   # SIRGAS 2000 / UTM 22S — matches the ARVC reconstruction grid


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.expanduser('~/Downloads/PORTO_ALEGRE_ARVC_2023'))
    ap.add_argument('--cell', type=float, default=250.0)
    args = ap.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(root, 'client', 'public', 'sample-data', 'porto-alegre-grid-250m.json')
    tif = lambda b: os.path.join(args.src, f'PORTO_ALEGRE_RS_{b}.tif')

    # FLOOD_VULN is scored across the whole municipality, so its footprint is the
    # municipal extent — a ready-made clip that needs no boundary file.
    with rasterio.open(tif('FLOOD_VULN')) as d:
        muni = ~d.read(1, masked=True).mask
        transform, crs, res = d.transform, d.crs, d.res[0]
        H, W = d.height, d.width
        west, south, east, north = d.bounds

    # Cell centres on a 250 m lattice in GRID_CRS, keeping only those whose centre
    # lands inside the municipality.
    xs_ll, ys_ll = warp_pts(crs.to_string(), GRID_CRS,
                            [west, east, west, east], [south, south, north, north])
    e0, e1 = min(xs_ll), max(xs_ll)
    n0, n1 = min(ys_ll), max(ys_ll)
    ec = np.arange(np.floor(e0 / args.cell) * args.cell, e1 + args.cell, args.cell)
    nc = np.arange(np.floor(n0 / args.cell) * args.cell, n1 + args.cell, args.cell)
    EE, NN = np.meshgrid(ec + args.cell / 2, nc + args.cell / 2)
    EE, NN = EE.ravel(), NN.ravel()
    px, py = warp_pts(GRID_CRS, crs.to_string(), EE.tolist(), NN.tolist())
    inv = ~transform
    cols, rows = inv * (np.array(px), np.array(py))
    ok = (cols >= 0) & (cols < W) & (rows >= 0) & (rows < H)
    ci, ri = cols[ok].astype(int), rows[ok].astype(int)
    inside = muni[ri, ci]
    keep = np.where(ok)[0][inside]
    cols, rows = cols[keep], rows[keep]
    lon, lat = warp_pts(GRID_CRS, 'EPSG:4326', EE[keep].tolist(), NN[keep].tolist())
    n_cells = len(keep)
    print(f'{n_cells} cells of {args.cell:.0f} m inside the municipality')

    half = args.cell / 2.0 / res
    bands: dict[str, np.ndarray] = {}

    def block_mean(base: str) -> np.ndarray:
        with rasterio.open(tif(base)) as d:
            a = d.read(1, masked=True)
        out = np.full(n_cells, np.nan)
        for k, (c, r) in enumerate(zip(cols, rows)):
            c0, c1 = max(0, int(round(c - half))), min(W, int(round(c + half)))
            r0, r1 = max(0, int(round(r - half))), min(H, int(round(r + half)))
            if c1 <= c0 or r1 <= r0:
                continue
            w = a[r0:r1, c0:c1]
            if w.count():
                out[k] = float(w.mean())
        return out

    bands['exposure'] = block_mean('EXPO_POP')

    # ── Observed May 2024 inundation ─────────────────────────────────────────
    # ARVC's flood layer is "inundação FLUVIAL" — the arroios. The May 2024
    # catastrophe was the Guaíba rising, a different mechanism, and 41% of the
    # observed extent falls outside ARVC's flood footprint. Ranking on ARVC flood
    # alone put Navegantes (100% flooded in 2024), Anchieta (96%), Humaitá (89%)
    # and Arquipélago (70%, and 18,520 people in SGB-surveyed risk sectors) in the
    # LOW class with priority 0.
    #
    # So the observed extent is carried as its own per-cell term. It is evidence,
    # not a model: Planet SkySat, 2024-05-06, already shipped in this repo.
    obs_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            'client', 'public', 'sample-data', 'porto-alegre-flood-2024.json')
    obs = json.load(open(obs_path, encoding='utf-8'))
    og = [f['geometry'] for f in obs['geoJson']['features']]
    with rasterio.open(tif('FLOOD_VULN')) as d:
        from rasterio.features import geometry_mask
        gg = [transform_geom_g('EPSG:4326', d.crs.to_string(), g) for g in og]
        flooded = geometry_mask(gg, out_shape=(d.height, d.width),
                                transform=d.transform, invert=True)
    obs_frac = np.zeros(n_cells)
    for k, (c, r) in enumerate(zip(cols, rows)):
        c0, c1 = max(0, int(round(c - half))), min(W, int(round(c + half)))
        r0, r1 = max(0, int(round(r - half))), min(H, int(round(r + half)))
        if c1 > c0 and r1 > r0:
            obs_frac[k] = float(flooded[r0:r1, c0:c1].mean())
    bands['flood_observed_2024'] = obs_frac
    print(f'  sampled flood_observed_2024   '
          f'({int((obs_frac > 0).sum())} cells touched by the 2024 flood)')
    for hz, (a, v, r) in HAZARDS.items():
        for name, base in (('hazard', a), ('vulnerability', v), ('risk', r)):
            bands[f'{hz}_{name}'] = block_mean(base)
            print(f'  sampled {hz}_{name:14s} '
                  f'({int(np.isfinite(bands[f"{hz}_{name}"]).sum())} cells with data)')

    features = []
    for k in range(n_cells):
        m: dict[str, float] = {}
        for hz in HAZARDS:
            haz = bands[f'{hz}_hazard'][k]
            vul = bands[f'{hz}_vulnerability'][k]
            rsk = bands[f'{hz}_risk'][k]
            exp = bands['exposure'][k]
            m[f'{hz}_hazard'] = 0.0 if not np.isfinite(haz) else round(float(haz), 4)
            m[f'{hz}_exposure'] = 0.0 if not np.isfinite(exp) else round(float(exp), 4)
            m[f'{hz}_vulnerability'] = 0.0 if not np.isfinite(vul) else round(float(vul), 4)
            m[f'{hz}_risk'] = 0.0 if not np.isfinite(rsk) else round(float(rsk), 4)
            m[f'{hz}_score'] = m[f'{hz}_risk']
        m['flood_observed_2024'] = round(float(bands['flood_observed_2024'][k]), 4)
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [round(lon[k], 6), round(lat[k], 6)]},
            'properties': {'id': f'cell_{k}', 'centroid': [round(lon[k], 6), round(lat[k], 6)],
                           'metrics': m},
        })

    payload = {
        'source': 'PLAC Porto Alegre — ARVC (produto P3), rasters supplied by SMAMUS 2026-08-11',
        'cellSizeM': args.cell,
        'crs': GRID_CRS,
        'scenario': 'SSP3-7.0, 2050 (2041–2060)',
        'note': ('Cell values are the mean of the 29 m ARVC pixels inside the cell. '
                 'Bairro-level aggregation (mean vs peak) is decided in '
                 'generate-neighborhood-zones.ts, not here.'),
        'geoJson': {'type': 'FeatureCollection', 'features': features},
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    print(f'\nwrote {out_path}  ({os.path.getsize(out_path)/1e6:.2f} MB, {n_cells} cells)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
