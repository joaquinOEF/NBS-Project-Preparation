import { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Check, MapPin, Layers, X, BarChart3, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { TILE_LAYERS, TILE_LAYER_GROUPS, OSM_LAYERS, SPATIAL_QUERIES, LOCAL_RISK_LAYERS, REFERENCE_LAYERS, type TileLayerDef } from '@shared/geospatial-layers';
import ValueTooltip from './ValueTooltip';
import { buildSpatialQueryLayer } from '@/lib/spatialQueryBuilder';

// ============================================================================
// TYPES
// ============================================================================

interface ZoneProperties {
  zoneId: string;
  typologyLabel: string;
  primaryHazard: string;
  secondaryHazard?: string;
  interventionType: string;
  meanFlood: number;
  meanHeat: number;
  meanLandslide: number;
  maxFlood: number;
  maxHeat: number;
  maxLandslide: number;
  populationSum: number;
  areaKm2: number;
  cellCount: number;
}

interface GridCellMetrics {
  flood_score: number | null;
  heat_score: number | null;
  landslide_score: number | null;
  imperv_pct: number | null;
  canopy_pct: number | null;
  pop_density: number | null;
  dist_river_m: number | null;
  elevation_mean: number | null;
  green_pct: number | null;
}

export interface ZoneAggregation {
  zoneId: string;
  primaryHazard: string;
  interventionType: string;
  areaKm2: number;
  population: number;
  meanFloodScore: number;
  meanHeatScore: number;
  meanLandslideScore: number;
  avgImperviousness: number;
  avgCanopy: number;
  avgDistRiver: number;
}

export interface SelectionSummary {
  zones: ZoneAggregation[];
  totalArea: number;
  totalPopulation: number;
  interventionTypes: string[];
  primaryHazards: string[];
}

type RiskLayer = 'flood' | 'heat' | 'landslide';

interface ConceptNoteMapProps {
  onConfirm?: (summary: SelectionSummary, description: string) => void;
  isActive: boolean;
}

// ============================================================================
// COLORS
// ============================================================================

const RISK_COLORS: Record<RiskLayer, { low: string; high: string }> = {
  flood: { low: '#dbeafe', high: '#1d4ed8' },
  heat: { low: '#fee2e2', high: '#dc2626' },
  landslide: { low: '#fef3c7', high: '#d97706' },
};

function interpolateColor(low: string, high: string, t: number): string {
  const parse = (hex: string) => [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  const [r1,g1,b1] = parse(low);
  const [r2,g2,b2] = parse(high);
  const r = Math.round(r1 + (r2-r1)*t);
  const g = Math.round(g1 + (g2-g1)*t);
  const b = Math.round(b1 + (b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}

function getHazardBadgeColor(type: string | null | undefined): string {
  if (!type) return 'bg-gray-100 text-gray-700';
  if (type.includes('FLOOD')) return 'bg-blue-100 text-blue-700';
  if (type.includes('HEAT')) return 'bg-red-100 text-red-700';
  if (type.includes('LANDSLIDE')) return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-700';
}

// ============================================================================
// MAP COMPONENT
// ============================================================================

export default function ConceptNoteMap({ onConfirm, isActive }: ConceptNoteMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const gridLayerRef = useRef<L.GeoJSON | null>(null);
  const zonesLayerRef = useRef<L.GeoJSON | null>(null);
  const zoneLabelMarkersRef = useRef<L.Marker[]>([]);

  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [zoneData, setZoneData] = useState<ZoneProperties[]>([]);
  const [hoveredZone, setHoveredZone] = useState<ZoneProperties | null>(null);
  const [hoveredCell, setHoveredCell] = useState<GridCellMetrics | null>(null);
  const [activeLayer, setActiveLayer] = useState<RiskLayer>('flood');
  const [showGrid, setShowGrid] = useState(false); // Off by default — use 250m tile layers instead
  const [showZones, setShowZones] = useState(false); // Off by default — use 250m layers instead
  const [enabledTileLayers, setEnabledTileLayers] = useState<Set<string>>(new Set());
  const [enabledOsmLayers, setEnabledOsmLayers] = useState<Set<string>>(new Set());
  const [enabledSpatialQueries, setEnabledSpatialQueries] = useState<Set<string>>(new Set());
  const [loadingSpatialQueries, setLoadingSpatialQueries] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);
  const tileLayerRefs = useRef<Record<string, L.TileLayer>>({});
  const osmLayerRefs = useRef<Record<string, L.GeoJSON>>({});
  const spatialQueryRefs = useRef<Record<string, L.GeoJSON>>({});

  // Enabled tile layer defs for ValueTooltip
  const enabledTileLayerDefs = useMemo(
    () => TILE_LAYERS.filter(l => enabledTileLayers.has(l.id)),
    [enabledTileLayers]
  );

  // Load all data
  useEffect(() => {
    if (!isActive) return;

    async function loadData() {
      try {
        const [boundaryRes, zonesRes, gridRes] = await Promise.all([
          fetch('/sample-data/porto-alegre-boundary.json'),
          fetch('/sample-data/porto-alegre-zones.json'),
          fetch('/sample-data/porto-alegre-grid.json'),
        ]);
        const boundaryData = await boundaryRes.json();
        const zonesData = await zonesRes.json();
        const gridData = await gridRes.json();

        if (!mapContainerRef.current) return;

        // Init map
        if (!mapRef.current) {
          const map = L.map(mapContainerRef.current, {
            zoomControl: false,
            attributionControl: false,
          });
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 17 }).addTo(map);
          L.control.zoom({ position: 'bottomright' }).addTo(map);
          mapRef.current = map;
          setMapReady(true);
        }

        const map = mapRef.current;

        // Boundary
        if (boundaryData.boundaryGeoJson) {
          const bl = L.geoJSON(boundaryData.boundaryGeoJson, {
            style: { color: '#94a3b8', weight: 2, fillOpacity: 0.02, dashArray: '6 3' },
          }).addTo(map);
          map.fitBounds(bl.getBounds(), { padding: [20, 20] });
        }

        // Grid cells — colored by risk score
        // Clean up existing grid layer first (prevents duplicates on re-mount)
        if (gridLayerRef.current && map.hasLayer(gridLayerRef.current)) {
          map.removeLayer(gridLayerRef.current);
          gridLayerRef.current = null;
        }
        if (gridData.geoJson) {
          const gridLayer = L.geoJSON(gridData.geoJson, {
            style: (feature) => {
              const m = feature?.properties?.metrics;
              if (!m) return { fillOpacity: 0 };
              const score = m.flood_score ?? 0;
              return {
                color: 'transparent',
                weight: 0,
                fillColor: interpolateColor(RISK_COLORS.flood.low, RISK_COLORS.flood.high, score),
                fillOpacity: 0, // Grid starts hidden; showGrid effect controls visibility
              };
            },
            onEachFeature: (feature, layer) => {
              layer.on({
                mouseover: () => setHoveredCell(feature.properties?.metrics),
                mouseout: () => setHoveredCell(null),
              });
            },
          });
          gridLayer.addTo(map);
          gridLayerRef.current = gridLayer;
        }

        // Zones — outlined, clickable
        // IMPORTANT: clean up any existing zone layers first (prevents duplicates on re-mount)
        if (zonesLayerRef.current && map.hasLayer(zonesLayerRef.current)) {
          map.removeLayer(zonesLayerRef.current);
        }
        for (const m of zoneLabelMarkersRef.current) {
          if (map.hasLayer(m)) map.removeLayer(m);
        }
        zonesLayerRef.current = null;
        zoneLabelMarkersRef.current = [];

        setZoneData(zonesData.zones || []);
        if (zonesData.geoJson) {
          const labels: L.Marker[] = [];
          const zonesLayer = L.geoJSON(zonesData.geoJson, {
            style: () => ({
              color: '#1e293b',
              weight: 2,
              fillColor: 'transparent',
              fillOpacity: 0,
              dashArray: '4 2',
            }),
            onEachFeature: (feature, layer) => {
              const props = feature.properties as ZoneProperties;
              if (!props?.zoneId) return;

              // Zone label — collect now, add to map after
              const center = (layer as any).getBounds?.()?.getCenter?.();
              if (center) {
                labels.push(L.marker(center, {
                  icon: L.divIcon({
                    className: 'zone-label',
                    html: `<div style="background:white;border:1px solid #cbd5e1;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.1)">${props.zoneId.replace('zone_', 'Z')}</div>`,
                    iconSize: [0, 0],
                    iconAnchor: [20, 10],
                  }),
                }));
              }

              layer.on({
                click: () => {
                  setSelectedZones(prev => {
                    const next = new Set(prev);
                    next.has(props.zoneId) ? next.delete(props.zoneId) : next.add(props.zoneId);
                    return next;
                  });
                },
                mouseover: () => {
                  setHoveredZone(props);
                  (layer as any).setStyle({ weight: 3, color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.15 });
                },
                mouseout: () => {
                  setHoveredZone(null);
                  zonesLayerRef.current?.resetStyle(layer as any);
                },
              });
            },
          });
          zonesLayer.addTo(map);
          zonesLayerRef.current = zonesLayer;
          // Add labels to map and track them
          for (const m of labels) m.addTo(map);
          zoneLabelMarkersRef.current = labels;
        }
      } catch (e) {
        console.error('[map] Load error:', e);
      }
    }

    loadData();
  }, [isActive]);

  // Update grid coloring when layer changes
  useEffect(() => {
    if (!gridLayerRef.current) return;
    gridLayerRef.current.eachLayer((layer: any) => {
      const m = layer.feature?.properties?.metrics;
      if (!m) return;
      const scoreKey = `${activeLayer}_score` as keyof GridCellMetrics;
      const score = (m[scoreKey] as number) ?? 0;
      layer.setStyle({
        fillColor: interpolateColor(RISK_COLORS[activeLayer].low, RISK_COLORS[activeLayer].high, score),
        fillOpacity: showGrid && score > 0.05 ? 0.5 : 0,
      });
    });
  }, [activeLayer, showGrid]);

  // Toggle zones: remove/add BOTH the GeoJSON layer AND label markers individually
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const zl = zonesLayerRef.current;
    const labels = zoneLabelMarkersRef.current;

    if (showZones) {
      if (zl && !map.hasLayer(zl)) zl.addTo(map);
      for (const m of labels) { if (!map.hasLayer(m)) m.addTo(map); }
    } else {
      if (zl && map.hasLayer(zl)) map.removeLayer(zl);
      for (const m of labels) { if (map.hasLayer(m)) map.removeLayer(m); }
    }
  }, [showZones]);

  // Update zone outlines when selection changes
  useEffect(() => {
    if (!zonesLayerRef.current) return;
    zonesLayerRef.current.eachLayer((layer: any) => {
      const zid = layer.feature?.properties?.zoneId;
      if (!zid) return;
      const sel = selectedZones.has(zid);
      layer.setStyle({
        color: sel ? '#1d4ed8' : '#1e293b',
        weight: sel ? 3 : 2,
        fillColor: sel ? '#3b82f6' : 'transparent',
        fillOpacity: sel ? 0.2 : 0,
        dashArray: sel ? undefined : '4 2',
      });
    });
  }, [selectedZones]);

  // Resize
  useEffect(() => {
    if (isActive && mapRef.current) setTimeout(() => mapRef.current?.invalidateSize(), 100);
  }, [isActive]);

  // Toggle evidence tile layers — map operations outside state setter
  const toggleTileLayer = (layerDef: TileLayerDef) => {
    const map = mapRef.current;
    if (!map) return;

    const isCurrentlyEnabled = enabledTileLayers.has(layerDef.id);

    if (isCurrentlyEnabled) {
      // Remove from map
      const existing = tileLayerRefs.current[layerDef.id];
      if (existing) {
        map.removeLayer(existing);
        delete tileLayerRefs.current[layerDef.id];
      }
      setEnabledTileLayers(prev => { const next = new Set(prev); next.delete(layerDef.id); return next; });
    } else {
      // Add to map — local risk tiles use /tiles/ path, S3 tiles use proxy
      const isLocal = layerDef.tileLayerId.startsWith('_local_');
      const urlTemplate = isLocal
        ? `/tiles/${layerDef.tileLayerId.replace('_local_', '')}/{z}/{x}/{y}.png`
        : `/api/geospatial/tiles/${layerDef.tileLayerId}/{z}/{x}/{y}.png`;
      const tl = L.tileLayer(urlTemplate, {
        opacity: 0.7,
        maxNativeZoom: isLocal ? 14 : 15,
        maxZoom: 19,
        minZoom: isLocal ? 10 : 8,
        errorTileUrl: '',
        className: isLocal ? 'risk-tile-layer' : '',
      });
      tl.addTo(map);
      tileLayerRefs.current[layerDef.id] = tl;
      setEnabledTileLayers(prev => { const next = new Set(prev); next.add(layerDef.id); return next; });
    }
  };

  const toggleOsmLayer = async (osmLayer: typeof OSM_LAYERS[0]) => {
    const map = mapRef.current;
    if (!map) return;

    const isEnabled = enabledOsmLayers.has(osmLayer.id);

    if (isEnabled) {
      const existing = osmLayerRefs.current[osmLayer.id];
      if (existing) {
        map.removeLayer(existing);
        delete osmLayerRefs.current[osmLayer.id];
      }
      setEnabledOsmLayers(prev => { const next = new Set(prev); next.delete(osmLayer.id); return next; });
    } else {
      try {
        const res = await fetch(osmLayer.endpoint);
        if (!res.ok) return;
        const geojson = await res.json();

        const layer = L.geoJSON(geojson, {
          style: { color: osmLayer.color, weight: 1.5, fillColor: osmLayer.color, fillOpacity: 0.3, opacity: 0.7 },
          pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
            radius: 5, color: osmLayer.color, fillColor: osmLayer.color, fillOpacity: 0.6, weight: 1,
          }),
          onEachFeature: (feature, layer) => {
            const p = feature.properties || {};
            const name = p.name ? `<strong>${p.name}</strong>` : '';
            const type = p.amenity || p.leisure || p.natural || p.landuse || '';
            const label = [name, type].filter(Boolean).join('<br/>') || 'OSM Feature';
            layer.bindTooltip(label, { sticky: true });
          },
        });
        layer.addTo(map);
        osmLayerRefs.current[osmLayer.id] = layer;
        setEnabledOsmLayers(prev => { const next = new Set(prev); next.add(osmLayer.id); return next; });
      } catch {
        // silently skip failed fetch
      }
    }
  };

  const toggleSpatialQuery = async (query: typeof SPATIAL_QUERIES[0]) => {
    const map = mapRef.current;
    if (!map) return;

    const isEnabled = enabledSpatialQueries.has(query.id);

    if (isEnabled) {
      const existing = spatialQueryRefs.current[query.id];
      if (existing) {
        map.removeLayer(existing);
        delete spatialQueryRefs.current[query.id];
      }
      setEnabledSpatialQueries(prev => { const next = new Set(prev); next.delete(query.id); return next; });
    } else {
      setLoadingSpatialQueries(prev => { const next = new Set(prev); next.add(query.id); return next; });
      try {
        const result = await buildSpatialQueryLayer(query);
        if (result) {
          result.layer.addTo(map);
          spatialQueryRefs.current[query.id] = result.layer;
          setEnabledSpatialQueries(prev => { const next = new Set(prev); next.add(query.id); return next; });
        }
      } catch {
        // silently skip
      } finally {
        setLoadingSpatialQueries(prev => { const next = new Set(prev); next.delete(query.id); return next; });
      }
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  // Build aggregation from selected zones
  const selectionSummary: SelectionSummary | null = selectedZones.size > 0 ? (() => {
    const zones: ZoneAggregation[] = zoneData
      .filter(z => selectedZones.has(z.zoneId))
      .map(z => ({
        zoneId: z.zoneId,
        primaryHazard: z.primaryHazard,
        interventionType: z.interventionType,
        areaKm2: z.areaKm2,
        population: z.populationSum,
        meanFloodScore: z.meanFlood,
        meanHeatScore: z.meanHeat,
        meanLandslideScore: z.meanLandslide,
        avgImperviousness: 0, // would need grid cell aggregation
        avgCanopy: 0,
        avgDistRiver: 0,
      }));
    return {
      zones,
      totalArea: zones.reduce((s, z) => s + z.areaKm2, 0),
      totalPopulation: zones.reduce((s, z) => s + z.population, 0),
      interventionTypes: Array.from(new Set(zones.map(z => z.interventionType))),
      primaryHazards: Array.from(new Set(zones.map(z => z.primaryHazard))),
    };
  })() : null;

  const handleConfirm = () => {
    if (!selectionSummary) return;
    // Build a rich description for the agent
    const lines = [`Selected ${selectionSummary.zones.length} intervention zones:`];
    for (const z of selectionSummary.zones) {
      lines.push(`- ${z.zoneId}: ${z.primaryHazard} risk, ${z.areaKm2.toFixed(1)} km², population ${z.population.toLocaleString()}, intervention: ${z.interventionType.replace(/_/g, ' ')}, flood score ${z.meanFloodScore.toFixed(2)}, heat score ${z.meanHeatScore.toFixed(2)}`);
    }
    lines.push(`Total: ${selectionSummary.totalArea.toFixed(1)} km², ${selectionSummary.totalPopulation.toLocaleString()} people`);
    lines.push(`Hazards: ${selectionSummary.primaryHazards.join(', ')}`);
    lines.push(`Interventions: ${selectionSummary.interventionTypes.map(t => t.replace(/_/g, ' ')).join(', ')}`);
    onConfirm?.(selectionSummary, lines.join('\n'));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center justify-end gap-1.5 p-2 border-b bg-background">
        {(() => {
          const hotspotLayer = LOCAL_RISK_LAYERS.find(l => l.id === 'risk_composite_hotspot');
          if (!hotspotLayer) return null;
          const isOn = enabledTileLayers.has(hotspotLayer.id);
          return (
            <button onClick={() => toggleTileLayer(hotspotLayer)}
              className={`px-2 py-0.5 rounded text-xs transition-all ${isOn ? 'bg-purple-100 text-purple-800 font-medium' : 'text-muted-foreground hover:bg-muted'}`}>
              Hotspots
            </button>
          );
        })()}
        <button
          onClick={() => setShowZones(!showZones)}
          className={`px-2 py-0.5 rounded text-xs transition-all ${showZones ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
        >
          <MapPin className="w-3.5 h-3.5 inline mr-1" />Zones
        </button>
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`px-2 py-0.5 rounded text-xs transition-all ${showGrid ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
        >
          <BarChart3 className="w-3.5 h-3.5 inline mr-1" />Grid
        </button>
      </div>

      {/* Legend — only when grid is visible */}
      {showGrid && (
      <div className="flex items-center gap-2 px-3 py-1 border-b bg-muted/30 text-[10px] text-muted-foreground">
        <span>Low</span>
        <div className="flex h-2 flex-1 max-w-[80px] rounded-sm overflow-hidden">
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map(t => (
            <div key={t} className="flex-1" style={{ backgroundColor: interpolateColor(RISK_COLORS[activeLayer].low, RISK_COLORS[activeLayer].high, t) }} />
          ))}
        </div>
        <span>High ({activeLayer})</span>
      </div>
      )}

      {/* Evidence Layers Panel */}
      {(enabledTileLayers.size > 0 || enabledOsmLayers.size > 0) && (
        <div className="flex items-center gap-1 px-3 py-1 border-b bg-muted/30 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Active:</span>
          {Array.from(enabledTileLayers).map(id => {
            const layer = TILE_LAYERS.find(l => l.id === id);
            return layer ? (
              <Badge key={id} variant="secondary" className="text-[9px] h-4 gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: layer.color }} />
                {layer.name.length > 20 ? layer.name.slice(0, 18) + '…' : layer.name}
                <button onClick={() => toggleTileLayer(layer)}><X className="w-2.5 h-2.5" /></button>
              </Badge>
            ) : null;
          })}
          {Array.from(enabledOsmLayers).map(id => {
            const layer = OSM_LAYERS.find(l => l.id === id);
            return layer ? (
              <Badge key={id} variant="secondary" className="text-[9px] h-4 gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: layer.color }} />
                {layer.name}
                <button onClick={() => toggleOsmLayer(layer)}><X className="w-2.5 h-2.5" /></button>
              </Badge>
            ) : null;
          })}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Map */}
        <div ref={mapContainerRef} className="flex-1 min-h-0 relative">
          <ValueTooltip mapRef={mapRef} enabledLayers={enabledTileLayerDefs} mapReady={mapReady} />
        </div>

        {/* Layer sidebar — collapsible */}
        <div className="w-48 border-l overflow-y-auto bg-background text-xs">
          <div className="p-2 border-b">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3" /> Evidence Layers
            </p>
            <p className="text-[9px] text-muted-foreground">{TILE_LAYERS.filter(l => l.available).length} layers available</p>
          </div>
          {/* Risk Analysis (250m) — individual risk layers (not composite hotspot) */}
          <div className="border-b">
            <button onClick={() => toggleGroup('risk_analysis')}
              className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 transition-colors">
              <span className="text-[10px] font-medium">Risk Analysis (250m)</span>
              <div className="flex items-center gap-1">
                {LOCAL_RISK_LAYERS.filter(l => l.id !== 'risk_composite_hotspot' && enabledTileLayers.has(l.id)).length > 0 && (
                  <span className="text-[9px] bg-primary/10 text-primary px-1 rounded">
                    {LOCAL_RISK_LAYERS.filter(l => l.id !== 'risk_composite_hotspot' && enabledTileLayers.has(l.id)).length}
                  </span>
                )}
                {expandedGroups.has('risk_analysis') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </div>
            </button>
            {expandedGroups.has('risk_analysis') && (
              <div className="px-1 pb-1 space-y-0.5">
                {LOCAL_RISK_LAYERS.filter(l => l.id !== 'risk_composite_hotspot').map(layer => {
                  const isOn = enabledTileLayers.has(layer.id);
                  return (
                    <button key={layer.id} onClick={() => toggleTileLayer(layer)}
                      className={`w-full text-left px-1.5 py-1 rounded text-[10px] flex items-center gap-1.5 transition-all ${
                        isOn ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                      }`}>
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: isOn ? layer.color : '#d1d5db' }} />
                      <span className="truncate">{layer.name}</span>
                      {layer.hasValueTiles && <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0 ml-auto" title="Values on hover" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {TILE_LAYER_GROUPS.map(group => {
            const groupLayers = TILE_LAYERS.filter(l => l.group === group.id && l.available);
            if (groupLayers.length === 0) return null;
            const isExpanded = expandedGroups.has(group.id);
            const activeCount = groupLayers.filter(l => enabledTileLayers.has(l.id)).length;
            return (
              <div key={group.id} className="border-b">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-[10px] font-medium">{group.label}</span>
                  <div className="flex items-center gap-1">
                    {activeCount > 0 && <span className="text-[9px] bg-primary/10 text-primary px-1 rounded">{activeCount}</span>}
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-1 pb-1 space-y-0.5">
                    {groupLayers.map(layer => {
                      const isOn = enabledTileLayers.has(layer.id);
                      return (
                        <button
                          key={layer.id}
                          onClick={() => toggleTileLayer(layer)}
                          className={`w-full text-left px-1.5 py-1 rounded text-[10px] flex items-center gap-1.5 transition-all ${
                            isOn ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: isOn ? layer.color : '#d1d5db' }} />
                          <span className="truncate">{layer.name}</span>
                          {layer.hasValueTiles && <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0 ml-auto" title="Values on hover" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {/* Reference Data (OSM + Census + Flood) */}
          <div className="border-b">
            <button
              onClick={() => toggleGroup('reference_data')}
              className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 transition-colors"
            >
              <span className="text-[10px] font-medium">Reference Data</span>
              <div className="flex items-center gap-1">
                {enabledOsmLayers.size > 0 && <span className="text-[9px] bg-primary/10 text-primary px-1 rounded">{enabledOsmLayers.size}</span>}
                {expandedGroups.has('reference_data') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </div>
            </button>
            {expandedGroups.has('reference_data') && (
              <div className="px-1 pb-1 space-y-0.5">
                {/* Census & vulnerability layers */}
                {REFERENCE_LAYERS.map(layer => {
                  const isOn = enabledOsmLayers.has(layer.id);
                  return (
                    <button
                      key={layer.id}
                      onClick={async () => {
                        const map = mapRef.current;
                        if (!map) return;
                        if (isOn) {
                          const existing = osmLayerRefs.current[layer.id];
                          if (existing) { map.removeLayer(existing); delete osmLayerRefs.current[layer.id]; }
                          setEnabledOsmLayers(prev => { const n = new Set(prev); n.delete(layer.id); return n; });
                        } else {
                          try {
                            const res = await fetch(layer.dataPath);
                            if (!res.ok) return;
                            const rawData = await res.json();
                            const geojson = rawData.geoJson || rawData;
                            const lyr = L.geoJSON(geojson, {
                              style: (feature) => {
                                const p = feature?.properties || {};
                                // Census: color by poverty rate (darker = higher poverty)
                                if (p.poverty_rate != null) {
                                  const pov = p.poverty_rate;
                                  const r = Math.round(100 + pov * 800); // 100-255
                                  const g = Math.round(50 - pov * 50);   // 50-0
                                  const b = Math.round(180 - pov * 80);  // 180-100
                                  return { color: `rgb(${Math.min(255,r)},${Math.max(0,g)},${Math.max(0,b)})`, weight: 1.5, fillColor: `rgb(${Math.min(255,r)},${Math.max(0,g)},${Math.max(0,b)})`, fillOpacity: 0.15 + pov * 3, opacity: 0.8 };
                                }
                                return { color: layer.color, weight: 1.5, fillColor: layer.color, fillOpacity: 0.3, opacity: 0.7 };
                              },
                              onEachFeature: (f, l) => {
                                const p = f.properties || {};
                                const name = p.neighbourhood_name || p.settlement_name || p.event || 'Feature';
                                const detail = p.poverty_rate != null ? `Poverty: ${(p.poverty_rate * 100).toFixed(1)}%` : p.event_date || '';
                                l.bindTooltip(`<strong>${name}</strong>${detail ? '<br/>' + detail : ''}`, { sticky: true });
                              },
                            });
                            lyr.addTo(map);
                            osmLayerRefs.current[layer.id] = lyr;
                            setEnabledOsmLayers(prev => { const n = new Set(prev); n.add(layer.id); return n; });
                          } catch {}
                        }
                      }}
                      className={`w-full text-left px-1.5 py-1 rounded text-[10px] flex items-center gap-1.5 transition-all ${
                        isOn ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: isOn ? layer.color : '#d1d5db' }} />
                      <span className="truncate">{layer.name}</span>
                    </button>
                  );
                })}
                {/* OSM layers */}
                {OSM_LAYERS.map(layer => {
                  const isOn = enabledOsmLayers.has(layer.id);
                  return (
                    <button
                      key={layer.id}
                      onClick={() => toggleOsmLayer(layer)}
                      className={`w-full text-left px-1.5 py-1 rounded text-[10px] flex items-center gap-1.5 transition-all ${
                        isOn ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: isOn ? layer.color : '#d1d5db' }} />
                      <span className="truncate">{layer.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Spatial Queries */}
          <div className="border-b">
            <button
              onClick={() => toggleGroup('spatial_queries')}
              className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 transition-colors"
            >
              <span className="text-[10px] font-medium">Spatial Queries</span>
              <div className="flex items-center gap-1">
                {enabledSpatialQueries.size > 0 && <span className="text-[9px] bg-primary/10 text-primary px-1 rounded">{enabledSpatialQueries.size}</span>}
                {expandedGroups.has('spatial_queries') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </div>
            </button>
            {expandedGroups.has('spatial_queries') && (
              <div className="px-1 pb-1 space-y-0.5">
                {SPATIAL_QUERIES.map(query => {
                  const isOn = enabledSpatialQueries.has(query.id);
                  const isLoading = loadingSpatialQueries.has(query.id);
                  return (
                    <button
                      key={query.id}
                      onClick={() => toggleSpatialQuery(query)}
                      disabled={isLoading}
                      className={`w-full text-left px-1.5 py-1 rounded text-[10px] flex items-center gap-1.5 transition-all ${
                        isOn ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                      } ${isLoading ? 'opacity-60' : ''}`}
                    >
                      {isLoading ? (
                        <Loader2 className="w-2 h-2 animate-spin shrink-0" />
                      ) : (
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: isOn ? query.color : '#d1d5db' }} />
                      )}
                      <span className="truncate">{query.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hover info */}
      {(hoveredZone || hoveredCell) && (
        <div className="absolute bottom-20 left-3 right-3 z-[1000] pointer-events-none">
          <div className="bg-background/95 backdrop-blur border rounded-lg shadow-lg p-2.5 text-xs max-w-sm">
            {hoveredZone && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{hoveredZone.zoneId}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getHazardBadgeColor(hoveredZone.primaryHazard)}`}>
                    {hoveredZone.primaryHazard}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
                  <div>Flood: <span className="text-foreground">{(hoveredZone.meanFlood * 100).toFixed(0)}%</span></div>
                  <div>Heat: <span className="text-foreground">{(hoveredZone.meanHeat * 100).toFixed(0)}%</span></div>
                  <div>Area: <span className="text-foreground">{hoveredZone.areaKm2.toFixed(1)} km²</span></div>
                  <div>Pop: <span className="text-foreground">{hoveredZone.populationSum.toLocaleString()}</span></div>
                </div>
                <div className="text-muted-foreground mt-0.5">
                  Intervention: {hoveredZone.interventionType.replace(/_/g, ' ')}
                </div>
              </>
            )}
            {!hoveredZone && hoveredCell && (
              <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-muted-foreground">
                <div>Flood: <span className="text-foreground">{((hoveredCell.flood_score ?? 0) * 100).toFixed(0)}%</span></div>
                <div>Heat: <span className="text-foreground">{((hoveredCell.heat_score ?? 0) * 100).toFixed(0)}%</span></div>
                <div>Imperv: <span className="text-foreground">{((hoveredCell.imperv_pct ?? 0) * 100).toFixed(0)}%</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selection bar */}
      <div className="p-2.5 border-t bg-background">
        {selectedZones.size === 0 ? (
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Click zone boundaries to select intervention areas
          </p>
        ) : (
          <div className="space-y-2">
            {/* Selected zone badges */}
            <div className="flex flex-wrap gap-1">
              {Array.from(selectedZones).map(id => {
                const zone = zoneData.find(z => z.zoneId === id);
                return (
                  <Badge key={id} variant="secondary" className="text-[10px] h-5 gap-1">
                    {id.replace('zone_', 'Z')}
                    {zone && <span className={`px-1 rounded ${getHazardBadgeColor(zone.primaryHazard)} text-[9px]`}>{zone.primaryHazard}</span>}
                    <button onClick={() => setSelectedZones(prev => { const n = new Set(prev); n.delete(id); return n; })}>
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                );
              })}
            </div>

            {/* Summary stats */}
            {selectionSummary && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{selectionSummary.totalArea.toFixed(1)} km²</span>
                <span>{selectionSummary.totalPopulation.toLocaleString()} people</span>
                <span>{selectionSummary.zones.length} zone{selectionSummary.zones.length > 1 ? 's' : ''}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setSelectedZones(new Set())} className="h-7 text-xs">
                Clear
              </Button>
              <Button size="sm" onClick={handleConfirm} className="h-7 text-xs gap-1 flex-1">
                <Check className="w-3 h-3" /> Confirm {selectedZones.size} zone{selectedZones.size > 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
