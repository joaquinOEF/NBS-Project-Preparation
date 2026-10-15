/**
 * The pre-portfolio board's map: every organisation with a place, coloured and
 * numbered by the project it sits in on the board. Redrawn on every move — it
 * is the geography half of the arrangement, so a coordinator sees a project
 * stretch across the city the moment a card lands in the wrong column.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASEMAPS } from '@/core/lib/basemaps';
import type { PortfolioOrg } from '@shared/preportfolio';

export const PROJECT_COLORS = ['#24493a', '#c2410c', '#1d4ed8', '#7c3aed', '#b45309', '#0f766e', '#be123c', '#4d7c0f'];

export function PreportfolioMap({ orgs, groups }: { orgs: PortfolioOrg[]; groups: Array<{ id: string; memberIds: string[] }> }) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const userMoved = useRef(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer(BASEMAPS.light.url, { attribution: BASEMAPS.light.attribution, maxZoom: 19, maxNativeZoom: BASEMAPS.light.maxNativeZoom }).addTo(m);
    L.tileLayer(BASEMAPS.light.labelsUrl!, { maxZoom: 19, maxNativeZoom: BASEMAPS.light.maxNativeZoom }).addTo(m);
    m.setView([-30.03, -51.2], 12);
    layer.current = L.layerGroup().addTo(m);
    // A person's gesture, not a programmatic fit.
    el.current.addEventListener('pointerdown', () => { userMoved.current = true; });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, lg = layer.current;
    if (!m || !lg) return;
    lg.clearLayers();
    const pts: L.LatLngExpression[] = [];
    groups.forEach((g, gi) => {
      const color = PROJECT_COLORS[gi % PROJECT_COLORS.length];
      for (const id of g.memberIds) {
        const o = orgs.find(x => x.memberId === id);
        if (!o || o.lat == null || o.lng == null) continue;
        pts.push([o.lat, o.lng]);
        L.marker([o.lat, o.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div data-testid="pf-map-pin" style="width:22px;height:22px;border-radius:50%;background:${color};color:#fff;font:700 11px/22px system-ui;text-align:center;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.4)">${gi + 1}</div>`,
            iconSize: [22, 22], iconAnchor: [11, 11],
          }),
        }).bindTooltip(`${o.orgName}${o.solutionLabel ? ` · ${o.solutionLabel}` : ''}`, { direction: 'top', offset: [0, -12] }).addTo(lg);
      }
    });
    // Fit once — after that the coordinator's own zoom is theirs to keep.
    // Fitted after layout settles (the board grows around the map after it
    // mounts), and again on every change until the coordinator moves the map —
    // after that, their view is theirs to keep.
    if (pts.length && !userMoved.current) {
      const h = requestAnimationFrame(() => {
        m.invalidateSize();
        m.fitBounds(L.latLngBounds(pts), { padding: [44, 44], maxZoom: 15 });
      });
      return () => cancelAnimationFrame(h);
    }
  }, [orgs, groups]);

  return <div ref={el} style={{ height: 260 }} className="w-full overflow-hidden rounded-xl border border-border/70" data-testid="preportfolio-map" />;
}
