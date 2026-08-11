#!/usr/bin/env python3
"""
Compare the official ARVC rasters against the layers this app currently treats as
primary, at the granularity the product actually uses: the 94 IBGE bairros.

Why bairros and not cells. The CBO flow and the orchestrator view never read a
raster value at a point (with one exception, the landslide hazard sample). They
read `meanFlood`/`meanHeat`/`meanLandslide` off
client/public/sample-data/porto-alegre-neighborhood-zones.json and rank bairros by
them. So a cell-level correlation would answer a question nobody asks; what
matters is whether the two sources put the same neighbourhoods at the top.

Reads the source GeoTIFFs directly rather than the built PNGs, so this is a check
on the DATA, independent of the rendering pipeline.

Usage:
    .venv-geo/bin/python scripts/compare-arvc-sources.py [--src DIR] [--json OUT]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import rasterio
from rasterio.mask import mask as rio_mask
from rasterio.warp import transform_geom

ZONES = 'client/public/sample-data/porto-alegre-neighborhood-zones.json'

# our bairro property  ->  official raster basename
PAIRS = [
    ('flood', 'hazard', 'meanFloodHazard', 'THREAT_FLOOD_370_2050'),
    ('heat', 'hazard', 'meanHeatHazard', 'THREAT_HEAT_370_2050'),
    ('landslide', 'hazard', 'meanLandslideHazard', 'THREAT_LANDS_370_2050'),
    ('flood', 'risk', 'meanFloodRisk', 'RISK_FLOOD_370_2050'),
    ('heat', 'risk', 'meanHeatRisk', 'RISK_HEAT_370_2050'),
    ('landslide', 'risk', 'meanLandslideRisk', 'RISK_LANDS_370_2050'),
]

ALL_RISK = {
    'flood': 'RISK_FLOOD_370_2050', 'landslide': 'RISK_LANDS_370_2050',
    'heat': 'RISK_HEAT_370_2050', 'storm': 'RISK_STORM_370_2050',
    'drought': 'RISK_DROUGHT_370_2050', 'arbovirus': 'RISK_DISEASE_370_2050',
}


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra = np.argsort(np.argsort(a))
    rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def zonal_means(tif: str, geoms_ll: list, how: str = 'scored') -> np.ndarray:
    """Aggregate the raster inside each bairro polygon.

    `how` matters more than it looks, and getting it wrong inverts a conclusion:

      'scored' — mean over the cells the source actually scored. This is the
                 municipality's own statistic, but for a masked layer like flood
                 it answers "how bad is it WHERE it floods", so a bairro with one
                 high-risk sliver scores high.
      'area'   — sum over the whole bairro area, treating unscored cells as 0.
                 This answers "how much flood risk does this bairro carry", which
                 is what our meanFloodRisk column measures.

    Comparing our 'area'-style column against their 'scored' statistic produced a
    spurious NEGATIVE correlation for flood. Both are reported below.
    """
    out = np.full(len(geoms_ll), np.nan)
    with rasterio.open(tif) as d:
        for i, g in enumerate(geoms_ll):
            gg = transform_geom('EPSG:4326', d.crs.to_string(), g)
            try:
                arr, _ = rio_mask(d, [gg], crop=True, filled=False, nodata=d.nodata)
            except ValueError:
                continue  # polygon does not overlap the raster at all
            v = arr[0]
            total = v.size
            vv = v[~v.mask] if np.ma.isMaskedArray(v) else v[v != d.nodata]
            if not vv.size:
                if how == 'area':
                    out[i] = 0.0
                continue
            out[i] = float(vv.sum()) / total if how == 'area' else float(np.mean(vv))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.expanduser('~/Downloads/PORTO_ALEGRE_ARVC_2023'))
    ap.add_argument('--json', default=None)
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    doc = json.load(open(os.path.join(root, ZONES), encoding='utf-8'))
    zones = doc['zones']
    feats = {f['properties'].get('zoneId') or f['properties'].get('NOME'): f
             for f in doc['geoJson']['features']}

    names, geoms, ours = [], [], {k: [] for _, _, k, _ in PAIRS}
    for z in zones:
        f = feats.get(z['zoneId'])
        if not f:
            continue
        names.append(z['neighbourhoodName'])
        geoms.append(f['geometry'])
        for _, _, key, _ in PAIRS:
            ours[key].append(z.get(key, 0.0) or 0.0)
    for k in ours:
        ours[k] = np.array(ours[k], dtype=float)
    print(f'{len(names)} bairros matched to geometry\n')

    tif = lambda b: os.path.join(args.src, f'PORTO_ALEGRE_RS_{b}.tif')
    report = {'bairros': len(names), 'pairs': [], 'cross': {}}

    print('=' * 96)
    print('OURS vs OFFICIAL — per bairro (n = %d)' % len(names))
    print('=' * 96)
    print('NOTE: our flood and landslide columns are zero in many bairros '
          '(see "nonzero" below);')
    print('      a near-degenerate column cannot carry a meaningful correlation.\n')
    print(f"{'layer':22s} {'nonzero':>8s} {'rho(scored)':>12s} {'rho(area-wt)':>13s} "
          f"{'top15 (area-wt)':>16s}")
    for hz, comp, key, base in PAIRS:
        a = ours[key]
        nz = int((a > 0).sum())
        res = {}
        for how in ('scored', 'area'):
            off = zonal_means(tif(base), geoms, how)
            m = np.isfinite(off) & np.isfinite(a)
            res[how] = dict(pearson=float(np.corrcoef(a[m], off[m])[0, 1]),
                            spearman=spearman(a[m], off[m]),
                            official_mean=float(off[m].mean()), off=off)
        off_a = res['area']['off']
        ta = set(np.array(names)[np.argsort(-a)][:15])
        tb = set(np.array(names)[np.argsort(-np.nan_to_num(off_a, nan=-1))][:15])
        ov = len(ta & tb)
        print(f'{hz+" "+comp:22s} {nz:5d}/94 {res["scored"]["spearman"]:12.3f} '
              f'{res["area"]["spearman"]:13.3f} {ov:>13d}/15')
        report['pairs'].append(dict(
            hazard=hz, component=comp, ours_nonzero_bairros=nz,
            spearman_scored=res['scored']['spearman'], spearman_areaweighted=res['area']['spearman'],
            pearson_areaweighted=res['area']['pearson'],
            ours_mean=float(a.mean()), official_mean_scored=res['scored']['official_mean'],
            top15_overlap=ov, ours_top15=sorted(ta), official_top15=sorted(tb)))

    # ── Is each source's "risk" actually telling hazards apart? ───────────────
    # If risk_A and risk_B correlate at ~0.9 across bairros, then the composite is
    # being driven by the terms the hazards SHARE (exposure and vulnerability),
    # and the hazard term is barely moving the answer. That matters because the
    # whole product ranks neighbourhoods by hazard-specific risk.
    print('\n' + '=' * 96)
    print('CROSS-HAZARD CORRELATION OF THE RISK COMPOSITES')
    print('(high off-diagonal = the composite is exposure×vulnerability-driven,')
    print(' i.e. it barely distinguishes one hazard from another)')
    print('=' * 96)

    off_risk = {hz: zonal_means(tif(b), geoms) for hz, b in ALL_RISK.items()}
    keys = list(ALL_RISK)
    print('\nOFFICIAL ARVC (6 hazards):')
    print('           ' + ''.join(f'{k[:6]:>9s}' for k in keys))
    offd = []
    for i, a in enumerate(keys):
        row = f'{a[:10]:11s}'
        for j, b in enumerate(keys):
            m = np.isfinite(off_risk[a]) & np.isfinite(off_risk[b])
            c = float(np.corrcoef(off_risk[a][m], off_risk[b][m])[0, 1])
            row += f'{c:9.2f}'
            if i < j:
                offd.append(c)
        print(row)
    print(f'  mean off-diagonal: {np.mean(offd):.3f}')

    ourk = ['meanFloodRisk', 'meanHeatRisk', 'meanLandslideRisk']
    print('\nOURS (3 hazards):')
    print('           ' + ''.join(f'{k[4:-4][:6]:>9s}' for k in ourk))
    ourd = []
    for i, a in enumerate(ourk):
        row = f'{a[4:-4][:10]:11s}'
        for j, b in enumerate(ourk):
            c = float(np.corrcoef(ours[a], ours[b])[0, 1])
            row += f'{c:9.2f}'
            if i < j:
                ourd.append(c)
        print(row)
    print(f'  mean off-diagonal: {np.mean(ourd):.3f}')

    report['cross'] = dict(official_mean_offdiag=float(np.mean(offd)),
                           ours_mean_offdiag=float(np.mean(ourd)))

    # ── Footprint ────────────────────────────────────────────────────────────
    print('\n' + '=' * 96)
    print('FOOTPRINT — where each source says the analysis applies')
    print('=' * 96)
    for hz, b in ALL_RISK.items():
        with rasterio.open(tif(b)) as d:
            a = d.read(1, masked=True)
            print(f'  official {hz:10s} scored on {a.count():7d} of {a.size:7d} cells '
                  f'({100*a.count()/a.size:5.1f}% of the raster window)')
    report['note'] = ('Official risk rasters are masked to populated cells; ours are computed '
                      'across the whole municipal window, so "no risk" and "nobody there" are '
                      'the same colour in ours and different in theirs.')

    # ── What do the flood layers actually mean? ──────────────────────────────
    # Ours and theirs put almost disjoint sets of bairros at the top for flood.
    # Rather than declare one wrong, ask the only impartial witness in the repo:
    # the observed extent of the May 2024 inundation. ARVC models "inundação
    # FLUVIAL" — arroio/river flooding — while the 2024 catastrophe was the
    # Guaíba rising. If the two are modelling different mechanisms, that is a
    # scope difference to surface, not a bug to fix.
    obs_path = os.path.join(root, 'client/public/sample-data/porto-alegre-flood-2024.json')
    if os.path.exists(obs_path):
        from rasterio.features import geometry_mask
        print('\n' + '=' * 96)
        print('FLOOD — checked against the observed May 2024 inundation')
        print('=' * 96)
        obs = json.load(open(obs_path, encoding='utf-8'))
        og = [f['geometry'] for f in obs['geoJson']['features']]
        # FLOOD_VULN is scored across the entire municipality, so its footprint is
        # a ready-made municipal clip. Without it the raster's bounding box counts
        # flooding in Canoas and Eldorado do Sul against a POA-only layer, which
        # understates the match badly (16% vs the true 59%).
        with rasterio.open(tif('FLOOD_VULN')) as v:
            muni = ~v.read(1, masked=True).mask
        with rasterio.open(tif('THREAT_FLOOD_370_2050')) as r:
            gg = [transform_geom('EPSG:4326', r.crs.to_string(), g) for g in og]
            obsm = geometry_mask(gg, out_shape=(r.height, r.width),
                                 transform=r.transform, invert=True)
            fluvial = ~r.read(1, masked=True).mask
        o, f_ = obsm & muni, fluvial & muni
        ov = int((o & f_).sum())
        print(f'  observed 2024 inundation, inside POA : {int(o.sum()):7d} cells '
              f'({100*o.sum()/muni.sum():.1f}% of the city)')
        print(f'  ARVC fluvial-flood layer, inside POA : {int(f_.sum()):7d} cells '
              f'({100*f_.sum()/muni.sum():.1f}% of the city)')
        print(f'  -> {100*ov/o.sum():.1f}% of what actually flooded is inside ARVC\'s flood layer')
        print(f'  -> {100*(o & ~f_).sum()/o.sum():.1f}% of the observed event lies OUTSIDE it '
              f'(mostly the Guaíba margin — a different mechanism)')
        report['flood_2024'] = dict(
            observed_cells=int(o.sum()), arvc_cells=int(f_.sum()), overlap_cells=ov,
            pct_observed_covered=round(100 * ov / o.sum(), 1),
            pct_observed_missed=round(100 * (o & ~f_).sum() / o.sum(), 1))

    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f'\nwrote {args.json}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
