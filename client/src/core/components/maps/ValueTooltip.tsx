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
            const decoded = decodePixelDisplay(r, g, b, a, enc);
            if (decoded === null) continue;

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
