import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Check, MapPin, Layers, X } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface ZoneFeature {
  zoneId: string;
  typologyLabel: string;
  primaryHazard: string;
  interventionType: string;
  meanFlood: number;
  meanHeat: number;
  meanLandslide: number;
  populationSum: number;
  areaKm2: number;
  cellCount: number;
}

interface MapConfig {
  layers?: string[];
  selectableZones?: boolean;
  highlightAreas?: string[];
}

interface ConceptNoteMapProps {
  onSelectZones?: (zones: string[]) => void;
  onConfirm?: (zones: string[]) => void;
  mapConfig?: MapConfig;
  isActive: boolean;
}

// ============================================================================
// COLORS
// ============================================================================

function getHazardColor(type: string): string {
  switch (type) {
    case 'FLOOD': return '#3b82f6';      // blue
    case 'HEAT': return '#ef4444';        // red
    case 'LANDSLIDE': return '#f59e0b';   // amber
    case 'FLOOD_HEAT': return '#8b5cf6';  // purple
    default: return '#6b7280';            // gray
  }
}

function getRiskOpacity(meanScore: number): number {
  return Math.max(0.2, Math.min(0.7, meanScore));
}

// ============================================================================
// MAP COMPONENT
// ============================================================================

export default function ConceptNoteMap({ onSelectZones, onConfirm, mapConfig, isActive }: ConceptNoteMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const zonesLayerRef = useRef<L.GeoJSON | null>(null);

  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [zones, setZones] = useState<ZoneFeature[]>([]);
  const [hoveredZone, setHoveredZone] = useState<ZoneFeature | null>(null);
  const [activeLayer, setActiveLayer] = useState<'flood' | 'heat' | 'landslide'>('flood');
  const [dataLoaded, setDataLoaded] = useState(false);

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const [boundaryRes, zonesRes] = await Promise.all([
          fetch('/sample-data/porto-alegre-boundary.json'),
          fetch('/sample-data/porto-alegre-zones.json'),
        ]);
        const boundaryData = await boundaryRes.json();
        const zonesData = await zonesRes.json();

        if (!mapContainerRef.current) return;

        // Initialize map
        if (!mapRef.current) {
          const map = L.map(mapContainerRef.current, {
            zoomControl: false,
            attributionControl: false,
          });

          // CartoDB Positron tiles (clean, light)
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 17,
          }).addTo(map);

          // Zoom control bottom-right
          L.control.zoom({ position: 'bottomright' }).addTo(map);

          mapRef.current = map;
        }

        const map = mapRef.current;

        // Fit to boundary
        if (boundaryData.boundaryGeoJson) {
          const boundaryLayer = L.geoJSON(boundaryData.boundaryGeoJson, {
            style: { color: '#94a3b8', weight: 2, fillOpacity: 0.03, dashArray: '6 3' },
          });
          boundaryLayer.addTo(map);
          map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });
        }

        // Store zone data
        setZones(zonesData.zones || []);

        // Add zones as clickable polygons
        if (zonesData.geoJson) {
          const zonesLayer = L.geoJSON(zonesData.geoJson, {
            style: (feature) => {
              const props = feature?.properties;
              if (!props) return {};
              const hazard = props.typologyLabel || props.primaryHazard;
              const score = activeLayer === 'flood' ? props.meanFlood
                : activeLayer === 'heat' ? props.meanHeat
                : props.meanLandslide;
              return {
                color: getHazardColor(hazard),
                weight: 2,
                fillColor: getHazardColor(hazard),
                fillOpacity: getRiskOpacity(score || 0.3),
              };
            },
            onEachFeature: (feature, layer) => {
              const props = feature.properties;
              if (!props?.zoneId) return;

              layer.on({
                click: () => {
                  setSelectedZones(prev => {
                    const next = new Set(prev);
                    if (next.has(props.zoneId)) {
                      next.delete(props.zoneId);
                    } else {
                      next.add(props.zoneId);
                    }
                    return next;
                  });
                },
                mouseover: () => {
                  setHoveredZone(props);
                  (layer as any).setStyle({ weight: 3, fillOpacity: 0.8 });
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
        }

        setDataLoaded(true);
      } catch (e) {
        console.error('[concept-note-map] Failed to load data:', e);
      }
    }

    if (isActive) loadData();
  }, [isActive]);

  // Update zone styling when selection or layer changes
  useEffect(() => {
    if (!zonesLayerRef.current) return;

    zonesLayerRef.current.eachLayer((layer: any) => {
      const props = layer.feature?.properties;
      if (!props?.zoneId) return;

      const isSelected = selectedZones.has(props.zoneId);
      const hazard = props.typologyLabel || props.primaryHazard;
      const score = activeLayer === 'flood' ? props.meanFlood
        : activeLayer === 'heat' ? props.meanHeat
        : props.meanLandslide;

      layer.setStyle({
        color: isSelected ? '#1d4ed8' : getHazardColor(hazard),
        weight: isSelected ? 3 : 2,
        fillColor: isSelected ? '#3b82f6' : getHazardColor(hazard),
        fillOpacity: isSelected ? 0.5 : getRiskOpacity(score || 0.3),
      });
    });

    onSelectZones?.(Array.from(selectedZones));
  }, [selectedZones, activeLayer]);

  // Invalidate map size when tab becomes active
  useEffect(() => {
    if (isActive && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 100);
    }
  }, [isActive]);

  const handleConfirm = () => {
    const zoneNames = zones
      .filter(z => selectedZones.has(z.zoneId))
      .map(z => {
        const hazard = z.primaryHazard.toLowerCase();
        return `${z.zoneId} (${hazard}, ${z.areaKm2.toFixed(1)} km², pop: ${z.populationSum.toLocaleString()})`;
      });
    onConfirm?.(zoneNames);
  };

  const handleClear = () => setSelectedZones(new Set());

  return (
    <div className="flex flex-col h-full">
      {/* Layer toggle */}
      <div className="flex items-center gap-1.5 p-2 border-b bg-background">
        <Layers className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground mr-1">Risk layer:</span>
        {(['flood', 'heat', 'landslide'] as const).map((layer) => (
          <button
            key={layer}
            onClick={() => setActiveLayer(layer)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
              activeLayer === layer
                ? layer === 'flood' ? 'bg-blue-100 text-blue-700'
                  : layer === 'heat' ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {layer === 'flood' ? 'Flood' : layer === 'heat' ? 'Heat' : 'Landslide'}
          </button>
        ))}
      </div>

      {/* Map */}
      <div ref={mapContainerRef} className="flex-1 min-h-0" />

      {/* Hover info */}
      {hoveredZone && (
        <div className="absolute bottom-20 left-3 right-3 z-[1000] pointer-events-none">
          <div className="bg-background/95 backdrop-blur border rounded-lg shadow-lg p-2.5 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">{hoveredZone.zoneId}</span>
              <Badge variant="outline" className="text-[10px] h-4">
                {hoveredZone.primaryHazard}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-muted-foreground">
              <div>Flood: <span className="text-foreground font-medium">{(hoveredZone.meanFlood * 100).toFixed(0)}%</span></div>
              <div>Heat: <span className="text-foreground font-medium">{(hoveredZone.meanHeat * 100).toFixed(0)}%</span></div>
              <div>Area: <span className="text-foreground font-medium">{hoveredZone.areaKm2.toFixed(1)} km²</span></div>
            </div>
            <div className="text-muted-foreground mt-0.5">
              Pop: {hoveredZone.populationSum.toLocaleString()} · Intervention: {hoveredZone.interventionType.replace(/_/g, ' ')}
            </div>
          </div>
        </div>
      )}

      {/* Selection bar */}
      <div className="p-2.5 border-t bg-background">
        {selectedZones.size === 0 ? (
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Click zones on the map to select intervention areas
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1">{selectedZones.size} zone{selectedZones.size > 1 ? 's' : ''} selected</p>
              <div className="flex flex-wrap gap-1">
                {Array.from(selectedZones).map(id => {
                  const zone = zones.find(z => z.zoneId === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-[10px] h-5 gap-0.5">
                      {id}
                      <button onClick={() => setSelectedZones(prev => { const n = new Set(prev); n.delete(id); return n; })}>
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 text-xs">
                Clear
              </Button>
              <Button size="sm" onClick={handleConfirm} className="h-7 text-xs gap-1">
                <Check className="w-3 h-3" /> Confirm
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
