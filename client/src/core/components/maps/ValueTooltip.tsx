import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import type { TileLayerDef } from "@shared/geospatial-layers";
import {
  latLngToTilePixel,
  fetchTilePixels,
  samplePixel,
  decodePixelDisplay,
} from "@/lib/valueTileUtils";

interface Props {
  mapRef: React.RefObject<L.Map | null>;
  enabledLayers: TileLayerDef[];
  mapReady: boolean;
}

// ── Mixed-cell composition for mechanism layers ──────────────────────────────
// The mechanism rasters only store the dominant class; for "Mixed" pixels the
// server reduces the per-cell GeoJSON to [bbox, tied labels] per mixed cell
// (/api/geospatial/mechanism-mix/:hazard, ~100–350 KB per hazard). Loaded once
// per hazard when a mechanism layer is enabled; module-level so all maps share
// it. Cells absent from the index (IDW gap-fill) show plain "Mixed".
interface MixCell { b: [number, number, number, number]; m: string[] }
const mixIndexCache = new Map<string, Promise<MixCell[]>>();

function loadMixIndex(hazard: string): Promise<MixCell[]> {
  let promise = mixIndexCache.get(hazard);
  if (!promise) {
    promise = fetch(`/api/geospatial/mechanism-mix/${hazard}`)
      .then(r => (r.ok ? r.json() : { cells: [] }))
      .then(d => d.cells ?? [])
      .catch(() => {
        mixIndexCache.delete(hazard); // let a later hover retry
        return [];
      });
    mixIndexCache.set(hazard, promise);
  }
  return promise;
}

function lookupMixedComposition(cells: MixCell[], lat: number, lng: number): string[] | null {
  for (const cell of cells) {
    const [w, s, e, n] = cell.b;
    if (lng >= w && lng <= e && lat >= s && lat <= n) return cell.m;
  }
  return null;
}

interface TooltipState {
  x: number;
  y: number;
  lines: { label: string; value: string; unit?: string; color: string }[];
}

export default function ValueTooltip({ mapRef, enabledLayers, mapReady }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeValueLayers = enabledLayers.filter(
    (l) => l.hasValueTiles && l.valueEncoding?.urlTemplate
  );

  // Prefetch the mixed-composition index as soon as a mechanism layer is on,
  // so the first "Mixed" hover doesn't wait on the network.
  const activeMechanismHazards = activeValueLayers
    .map((l) => l.mechanismHazard)
    .filter((h): h is NonNullable<typeof h> => !!h)
    .join(",");
  useEffect(() => {
    for (const hazard of activeMechanismHazards.split(",").filter(Boolean)) {
      loadMixIndex(hazard);
    }
  }, [activeMechanismHazards]);

  const handleMouseMove = useCallback(
    async (e: L.LeafletMouseEvent) => {
      const map = mapRef.current;
      if (!map || activeValueLayers.length === 0) {
        setTooltip(null);
        return;
      }

      const screenX = e.containerPoint.x;
      const screenY = e.containerPoint.y;

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(async () => {
        const { lat, lng } = e.latlng;
        const rawZ = Math.round(map.getZoom());
        const sampleZ = Math.max(10, Math.min(15, rawZ));
        const { tileX, tileY, px, py } = latLngToTilePixel(lat, lng, sampleZ);

        const lines: TooltipState["lines"] = [];

        for (const layer of activeValueLayers) {
          const enc = layer.valueEncoding!;
          const tileUrl = enc.urlTemplate!
            .replace("{z}", String(sampleZ))
            .replace("{x}", String(tileX))
            .replace("{y}", String(tileY));

          try {
            const imgData = await fetchTilePixels(tileUrl);
            if (!imgData) continue;

            const [r, g, b, a] = samplePixel(imgData, px, py);
            let decoded = decodePixelDisplay(r, g, b, a, enc);
            if (decoded === null) continue;

            // Mechanism layers: expand "Mixed" into its tied mechanisms.
            if (decoded === "Mixed" && layer.mechanismHazard) {
              const mix = lookupMixedComposition(
                await loadMixIndex(layer.mechanismHazard),
                lat,
                lng
              );
              if (mix) decoded = `Mixed (${mix.join(" + ")})`;
            }

            lines.push({
              label: layer.name,
              value: decoded,
              unit: enc.type === "categorical" ? undefined : enc.unit,
              color: layer.color,
            });
          } catch {
            // silently skip failed tiles
          }
        }

        if (lines.length > 0) {
          setTooltip({ x: screenX, y: screenY, lines });
        } else {
          setTooltip(null);
        }
      }, 120);
    },
    [activeValueLayers, mapRef]
  );

  const handleMouseOut = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setTooltip(null);
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseOut);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseout", handleMouseOut);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mapReady, mapRef, handleMouseMove, handleMouseOut]);

  if (!tooltip || tooltip.lines.length === 0) return null;

  const containerWidth = mapRef.current?.getContainer()?.offsetWidth ?? window.innerWidth;
  const flipLeft = tooltip.x > containerWidth * 0.65;
  const offsetX = flipLeft ? -12 : 14;

  return (
    <div
      style={{
        position: "absolute",
        left: tooltip.x + offsetX,
        top: tooltip.y - 12,
        transform: flipLeft ? "translateX(-100%)" : "none",
        pointerEvents: "none",
        zIndex: 2000,
      }}
      className="bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-xl px-2.5 py-2 min-w-[140px] max-w-[220px] backdrop-blur-sm"
    >
      {tooltip.lines.map((line, i) => (
        <div key={i} className={i > 0 ? "mt-1.5 pt-1.5 border-t border-zinc-800" : ""}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: line.color }} />
            <span className="text-[9px] text-zinc-400 leading-none truncate">{line.label}</span>
          </div>
          <div className="flex items-baseline gap-1 pl-3">
            <span className="text-sm font-semibold text-white leading-none">{line.value}</span>
            {line.unit && (
              <span className="text-[9px] text-emerald-400 leading-none">{line.unit}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
