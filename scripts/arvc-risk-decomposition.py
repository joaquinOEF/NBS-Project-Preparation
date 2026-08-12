#!/usr/bin/env python3
"""
Why do the ARVC risk maps for different hazards look like the same map?

This started as a visual observation — official heat risk and official landslide
risk are hard to tell apart on screen — and the answer turns out to be arithmetic
rather than anything to do with Porto Alegre.

Risk is a geometric mean:

    R = ∛(A × E × V)   =>   log R = (log A + log E + log V) / 3

so log R is a plain sum, its variance decomposes, and the covariance between two
hazards' risk comes from whatever terms they SHARE. Measure the three variances
and you know which term is driving the answer.

Measured at 29 m over ~223k cells where all terms are present and positive:

    log exposure       var 0.80      <-- ONE surface, shared by all six hazards
    log vulnerability  var 0.077
    log ameaça         var 0.014

Exposure carries ~90% of the variance. Not because it matters more, but because
it is the only term whose values span orders of magnitude: exposure runs
0.0018–0.998 while ameaça sits in a narrow band around 0.4–0.88. Both were
normalised to 0–1, which hides the difference completely.

The consequence, and it is severe:

    corr(heat ameaça, landslide ameaça)   = -0.33   opposite geographies
    corr(heat risco,  landslide risco)    = +0.90   nearly the same map

Their hazard layers disagree about where danger is — heat in the dense northern
core, landslide on the southern hillsides — and the composite erases that,
because both get multiplied by the same population surface.

WHAT DOES NOT FIX IT: substituting our own exposure and vulnerability. Ours have
log-variance 2.34 and 1.38 — three times theirs — and they are bairro constants,
so they are the *same* multiplier for every hazard. The hybrid comes out at +0.99,
worse than what we started with.

WHAT DOES: putting the three terms on comparable footing before combining them.
Percentile-ranking each within the analysed cells equalises the variances by
construction and takes heat-vs-landslide from +0.90 to +0.45, while still
weighting toward where people are (corr with exposure stays at +0.66).

That +0.45 is not a failure to separate them — it is real shared signal. Both
hazards genuinely are worse where more vulnerable people live. The point is that
the hazard term can now be seen at all.

Usage:
    .venv-geo/bin/python scripts/arvc-risk-decomposition.py [--src DIR]
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import rasterio

PAIRS = [
    ('heat', 'THREAT_HEAT_370_2050', 'HEATWAVE_VUL', 'RISK_HEAT_370_2050'),
    ('landslide', 'THREAT_LANDS_370_2050', 'LANDS_VULN', 'RISK_LANDS_370_2050'),
    ('flood', 'THREAT_FLOOD_370_2050', 'FLOOD_VULN', 'RISK_FLOOD_370_2050'),
    ('storm', 'THREAT_STORM_370_2050', 'STORM_VULN', 'RISK_STORM_370_2050'),
    ('drought', 'THREAT_DROUGHT_370_2050', 'DROUGHT_VUL', 'RISK_DROUGHT_370_2050'),
    ('arbovirus', 'THREAT_DISEASE_370_2050', 'DISEASE_VULN', 'RISK_DISEASE_370_2050'),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.expanduser('~/Downloads/PORTO_ALEGRE_ARVC_2023'))
    args = ap.parse_args()
    rd = lambda n: rasterio.open(
        os.path.join(args.src, f'PORTO_ALEGRE_RS_{n}.tif')).read(1, masked=True)

    E = rd('EXPO_POP')
    layers = {k: (rd(a), rd(v), rd(r)) for k, a, v, r in PAIRS}

    # Common footprint: every term present and strictly positive, so logs exist.
    m = ~E.mask & (np.asarray(E) > 0)
    for a, v, r in layers.values():
        m &= ~a.mask & ~v.mask & ~r.mask & (np.asarray(a) > 0) & (np.asarray(v) > 0)
    print(f'cells with every term present and positive: {int(m.sum()):,}\n')

    # ── 1. Which term actually drives the composite? ─────────────────────────
    print('LOG-VARIANCE OF EACH TERM  (a geometric mean is won by the widest spread)')
    le = np.log(np.asarray(E)[m])
    print(f'  {"exposure — SHARED by all six":34s} {le.var():.4f}   '
          f'range {np.asarray(E)[m].min():.4f}–{np.asarray(E)[m].max():.4f}')
    for k, (a, v, _) in layers.items():
        la, lv = np.log(np.asarray(a)[m]), np.log(np.asarray(v)[m])
        share = le.var() / (le.var() + la.var() + lv.var())
        print(f'  {"ameaça " + k:34s} {la.var():.4f}   '
              f'vulnerability {lv.var():.4f}   -> exposure is {share:.0%} of the total')

    # ── 2. What that does to hazard discrimination ───────────────────────────
    def pr(x):
        """Percentile rank in [0,1] within the analysed cells."""
        v = np.asarray(x)[m]
        o = np.argsort(v, kind='stable')
        r = np.empty(len(v))
        r[o] = np.arange(len(v))
        return r / (len(v) - 1)

    corr = lambda x, y: float(np.corrcoef(x, y)[0, 1])
    pE = pr(E)
    ranked = {k: (pr(a), pr(v)) for k, (a, v, _) in layers.items()}
    print('\nHAZARD DISCRIMINATION — correlation between two hazards\' surfaces')
    print(f'{"pair":24s} {"ameaça":>9s} {"their risco":>12s} {"rank-balanced":>14s}')
    keys = list(layers)
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            ka, kb = keys[i], keys[j]
            a1, v1, r1 = layers[ka]
            a2, v2, r2 = layers[kb]
            pa1, pv1 = ranked[ka]
            pa2, pv2 = ranked[kb]
            c_haz = corr(np.asarray(a1)[m], np.asarray(a2)[m])
            c_risk = corr(np.asarray(r1)[m], np.asarray(r2)[m])
            c_bal = corr(np.cbrt(pa1 * pE * pv1), np.cbrt(pa2 * pE * pv2))
            flag = '  <-- erased' if (c_risk - abs(c_haz)) > 0.5 else ''
            print(f'{ka + " / " + kb:24s} {c_haz:+9.2f} {c_risk:+12.2f} {c_bal:+14.2f}{flag}')

    print('\nDoes the rank-balanced version still point at people?')
    for k in ('heat', 'landslide'):
        a, v, r = layers[k]
        pa, pv = ranked[k]
        print(f'  {k:10s} corr(their risco, exposure) = '
              f'{corr(np.asarray(r)[m], np.asarray(E)[m]):+.2f}   '
              f'corr(rank-balanced, exposure) = {corr(np.cbrt(pa * pE * pv), pE):+.2f}')
    print('\nYes — still weighted toward population, just no longer dominated by it.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
