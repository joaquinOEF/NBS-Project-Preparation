import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Check, X, MapPin, Pencil, Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import { TILE_LAYERS, OSM_LAYERS, SPATIAL_QUERIES } from '@shared/geospatial-layers';
import type { OpenMapParams, SelectedAsset, SampledPoint, MapSelectionResult } from '@shared/concept-note-schema';
import { sampleRasterAtPoint, geometryCentroid } from '@/lib/valueTileUtils';
import { buildSpatialQueryLayer } from '@/lib/spatialQueryBuilder';
import ValueTooltip from './ValueTooltip';

// OSM type → visual config
const OSM_VISUALS: Record<string, { emoji: string; label: string }> = {
  osm_parks: { emoji: '🌳', label: 'Park' },
  osm_schools: { emoji: '🏫', label: 'School' },
  osm_hospitals: { emoji: '🏥', label: 'Hospital' },
  osm_wetlands: { emoji: '💧', label: 'Wetland' },
};

interface Props {
  params: OpenMapParams;
  onConfirm: (result: MapSelectionResult) => void;
  onCancel: () => void;
}

export default function MapMicroapp({ params, onConfirm, onCancel }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tileLayerRefs = useRef<Record<string, L.TileLayer>>({});
  const osmLayerRefs = useRef<Record<string, L.GeoJSON>>({});
  const zonesLayerRef = useRef<L.GeoJSON | null>(null);
  const customMarkersRef = useRef<L.Layer[]>([]);
  const selectedHighlightsRef = useRef<Map<string, L.Layer>>(new Map());

  const [mapReady, setMapReady] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  const [sampledPoints, setSampledPoints] = useState<SampledPoint[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'point' | 'polygon'>('off');
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');
  const [enabledTiles, setEnabledTiles] = useState<Set<string>>(new Set());

  const selectionMode = params.selectionMode;
  const polygonHelp = drawMode === 'polygon' ? 'Click to place vertices. Double-click to close.' : '';

  // Tile layers that are actually toggled on (for ValueTooltip)
  const enabledTileLayerDefs = Array.from(enabledTiles)
    .map(id => TILE_LAYERS.find(l => l.id === id))
    .filter(Boolean) as typeof TILE_LAYERS;

  // ── Initialize map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      center: [-30.03, -51.22],
      zoom: 11,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 17 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    setMapReady(true);

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Load boundary ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    (async () => {
      try {
        const res = await fetch('/sample-data/porto-alegre-boundary.json');
        const data = await res.json();
        if (data.boundaryGeoJson) {
          const bl = L.geoJSON(data.boundaryGeoJson, {
            style: { color: '#94a3b8', weight: 2, fillOpacity: 0.02, dashArray: '6 3' },
          }).addTo(map);
          map.fitBounds(bl.getBounds(), { padding: [20, 20] });
        }
      } catch {}
    })();
  }, [mapReady]);

  // ── Load OSM layers + zones (NOT tile layers — those are toggled manually) ──
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    (async () => {
      // OSM layers — visually distinct markers
      for (const osmId of params.layers || []) {
        const osmDef = OSM_LAYERS.find(l => l.id === osmId);
        if (!osmDef) continue;
        const visual = OSM_VISUALS[osmId] || { emoji: '📍', label: 'Feature' };
        setLoadingStatus(`Fetching ${osmDef.name}...`);
        try {
          const res = await fetch(osmDef.endpoint);
          if (!res.ok) continue;
          const geojson = await res.json();

          const layer = L.geoJSON(geojson, {
            style: { color: osmDef.color, weight: 2, fillColor: osmDef.color, fillOpacity: 0.25, opacity: 0.8 },
            pointToLayer: (_f, latlng) => {
              // Use divIcon with emoji for points — much more visible
              const icon = L.divIcon({
                html: `<div style="font-size:16px;text-align:center;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">${visual.emoji}</div>`,
                className: '',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              });
              return L.marker(latlng, { icon });
            },
            onEachFeature: (feature, featureLayer) => {
              const p = feature.properties || {};
              const name = p.name || p.amenity || p.leisure || p.natural || visual.label;

              // Tooltip with type label
              featureLayer.bindTooltip(
                `<div style="font-size:11px"><strong>${visual.emoji} ${name}</strong><br/><span style="color:#888">${visual.label}</span></div>`,
                { sticky: true }
              );

              // Click to select (assets/composite mode)
              if (selectionMode === 'assets' || selectionMode === 'composite') {
                (featureLayer as any).on('click', async (e: any) => {
                  L.DomEvent.stopPropagation(e); // Don't trigger map click
                  const centroid = geometryCentroid(feature.geometry);
                  if (!centroid) return;

                  // Sample raster values at centroid (from tiles that are toggled ON)
                  const rasterValues: Record<string, number> = {};
                  for (const tileId of Array.from(enabledTiles)) {
                    const tileDef = TILE_LAYERS.find(l => l.id === tileId);
                    if (!tileDef?.valueEncoding?.urlTemplate) continue;
                    const val = await sampleRasterAtPoint(centroid[0], centroid[1], tileDef.valueEncoding, 11);
                    if (val !== null) rasterValues[tileDef.name] = val;
                  }

                  const asset: SelectedAsset = {
                    type: 'osm',
                    source: osmId,
                    name: typeof name === 'string' ? name : String(name),
                    geometry: feature.geometry,
                    coordinates: centroid,
                    properties: p,
                    rasterValues,
                  };

                  setSelectedAssets(prev => {
                    const key = `osm:${osmId}:${asset.name}:${centroid[0].toFixed(4)}`;
                    const existing = prev.findIndex(a => a.type === 'osm' && `osm:${a.source}:${a.name}:${a.coordinates[0].toFixed(4)}` === key);
                    if (existing >= 0) {
                      // Deselect — remove highlight
                      selectedHighlightsRef.current.get(key)?.remove();
                      selectedHighlightsRef.current.delete(key);
                      return prev.filter((_, i) => i !== existing);
                    }
                    // Select — add highlight ring
                    const highlight = L.circleMarker([centroid[0], centroid[1]], {
                      radius: 14, color: '#fff', fillColor: osmDef.color, fillOpacity: 0.3, weight: 3,
                    }).addTo(map);
                    selectedHighlightsRef.current.set(key, highlight);
                    return [...prev, asset];
                  });
                });

                (featureLayer as any).on('mouseover', () => { map.getContainer().style.cursor = 'pointer'; });
                (featureLayer as any).on('mouseout', () => { map.getContainer().style.cursor = ''; });
              }
            },
          });
          layer.addTo(map);
          osmLayerRefs.current[osmId] = layer;
        } catch {}
      }

      // Zones (for zones/composite mode)
      if (selectionMode === 'zones' || selectionMode === 'composite') {
        setLoadingStatus('Loading intervention zones...');
        try {
          const res = await fetch('/sample-data/porto-alegre-zones.json');
          const data = await res.json();
          if (data.geoJson) {
            const zonesLayer = L.geoJSON(data.geoJson, {
              style: { color: '#1e293b', weight: 2, fillColor: 'transparent', fillOpacity: 0, dashArray: '4 2' },
              onEachFeature: (feature, featureLayer) => {
                const p = feature.properties || {};
                const hazardColor = p.primaryHazard === 'FLOOD' ? '#3b82f6' : p.primaryHazard === 'HEAT' ? '#ef4444' : '#a16207';
                featureLayer.bindTooltip(
                  `<div style="font-size:11px"><strong>${p.zoneId}</strong><br/><span style="color:${hazardColor}">${p.typologyLabel}</span> — ${(p.interventionType || '').replace(/_/g, ' ')}<br/>${p.areaKm2?.toFixed(1)} km² · ${p.populationSum?.toLocaleString() || '?'} people</div>`,
                  { sticky: true }
                );

                (featureLayer as any).on('click', (e: any) => {
                  L.DomEvent.stopPropagation(e);
                  const centroid = geometryCentroid(feature.geometry);
                  if (!centroid) return;

                  const asset: SelectedAsset = {
                    type: 'zone',
                    source: 'intervention_zones',
                    name: p.zoneId,
                    geometry: feature.geometry,
                    coordinates: centroid,
                    properties: p,
                  };

                  setSelectedAssets(prev => {
                    const existing = prev.findIndex(a => a.type === 'zone' && a.name === asset.name);
                    if (existing >= 0) {
                      // Deselect — reset style
                      (featureLayer as any).setStyle({ color: '#1e293b', weight: 2, fillColor: 'transparent', fillOpacity: 0, dashArray: '4 2' });
                      return prev.filter((_, i) => i !== existing);
                    }
                    // Select — highlight polygon
                    (featureLayer as any).setStyle({ color: '#1d4ed8', weight: 3, fillColor: '#3b82f6', fillOpacity: 0.2, dashArray: undefined });
                    return [...prev, asset];
                  });
                });

                (featureLayer as any).on('mouseover', () => {
                  const isSelected = selectedAssets.some(a => a.type === 'zone' && a.name === p.zoneId);
                  if (!isSelected) (featureLayer as any).setStyle({ weight: 3, color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.1 });
                });
                (featureLayer as any).on('mouseout', () => {
                  const isSelected = selectedAssets.some(a => a.type === 'zone' && a.name === p.zoneId);
                  if (!isSelected) (featureLayer as any).setStyle({ color: '#1e293b', weight: 2, fillColor: 'transparent', fillOpacity: 0, dashArray: '4 2' });
                });
              },
            });
            zonesLayer.addTo(map);
            zonesLayerRef.current = zonesLayer;
          }
        } catch {}
      }

      // Spatial queries
      for (const sqId of params.spatialQueries || []) {
        const queryDef = SPATIAL_QUERIES.find(q => q.id === sqId);
        if (!queryDef) continue;
        setLoadingStatus(`Running ${queryDef.name}...`);
        try {
          const result = await buildSpatialQueryLayer(queryDef);
          if (result) result.layer.addTo(map);
        } catch {}
      }

      setLoading(false);
    })();
  }, [mapReady]);

  // ── Toggle tile layer on/off ────────────────────────────────────────────────
  const toggleTileLayer = useCallback((tileId: string) => {
    const map = mapRef.current;
    if (!map) return;
    const existing = tileLayerRefs.current[tileId];
    if (existing) {
      map.removeLayer(existing);
      delete tileLayerRefs.current[tileId];
      setEnabledTiles(prev => { const n = new Set(prev); n.delete(tileId); return n; });
    } else {
      const layerDef = TILE_LAYERS.find(l => l.id === tileId);
      if (!layerDef) return;
      const tl = L.tileLayer(`/api/geospatial/tiles/${layerDef.tileLayerId}/{z}/{x}/{y}.png`, {
        opacity: 0.6, maxNativeZoom: 15, maxZoom: 19, minZoom: 8, errorTileUrl: '',
      });
      tl.addTo(map);
      tileLayerRefs.current[tileId] = tl;
      setEnabledTiles(prev => new Set(prev).add(tileId));
    }
  }, []);

  // ── Click-to-sample mode ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || selectionMode !== 'sample') return;
    const map = mapRef.current;

    const handleClick = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const values: Record<string, number> = {};
      const layersToSample = params.sampleLayers || params.tileLayers || [];
      for (const tileId of layersToSample) {
        const tileDef = TILE_LAYERS.find(l => l.id === tileId);
        if (!tileDef?.valueEncoding?.urlTemplate) continue;
        const val = await sampleRasterAtPoint(lat, lng, tileDef.valueEncoding, 11);
        if (val !== null) values[tileDef.name] = val;
      }
      if (Object.keys(values).length > 0) {
        const marker = L.circleMarker([lat, lng], { radius: 6, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2 });
        marker.bindTooltip(Object.entries(values).map(([k, v]) => `${k}: <strong>${v.toFixed(3)}</strong>`).join('<br/>'), { permanent: true, direction: 'top' });
        marker.addTo(map);
        customMarkersRef.current.push(marker);
        setSampledPoints(prev => [...prev, { lat, lng, values }]);
      }
    };

    map.on('click', handleClick);
    map.getContainer().style.cursor = 'crosshair';
    return () => { map.off('click', handleClick); map.getContainer().style.cursor = ''; };
  }, [mapReady, selectionMode]);

  // ── Custom draw (point/polygon) mode ───────────────────────────────────────
  const polygonPointsRef = useRef<L.LatLng[]>([]);
  const polygonPreviewRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!mapReady || !mapRef.current || (drawMode !== 'point' && drawMode !== 'polygon')) return;
    const map = mapRef.current;

    const handleClick = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      if (drawMode === 'point') {
        const rasterValues: Record<string, number> = {};
        for (const tileId of Array.from(enabledTiles)) {
          const tileDef = TILE_LAYERS.find(l => l.id === tileId);
          if (!tileDef?.valueEncoding?.urlTemplate) continue;
          const val = await sampleRasterAtPoint(lat, lng, tileDef.valueEncoding, 11);
          if (val !== null) rasterValues[tileDef.name] = val;
        }
        const marker = L.circleMarker([lat, lng], { radius: 8, color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.8, weight: 2 });
        marker.bindTooltip('Custom site', { permanent: false });
        marker.addTo(map);
        customMarkersRef.current.push(marker);
        setSelectedAssets(prev => [...prev, {
          type: 'custom', name: `Custom point (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          coordinates: [lat, lng], properties: {}, rasterValues,
        }]);
        setDrawMode('off');
      }

      if (drawMode === 'polygon') {
        polygonPointsRef.current.push(e.latlng);
        if (polygonPreviewRef.current) map.removeLayer(polygonPreviewRef.current);
        if (polygonPointsRef.current.length >= 2) {
          polygonPreviewRef.current = L.polyline(
            [...polygonPointsRef.current, polygonPointsRef.current[0]],
            { color: '#8b5cf6', weight: 2, dashArray: '4 4' }
          ).addTo(map);
        }
        const vm = L.circleMarker([lat, lng], { radius: 4, color: '#8b5cf6', fillColor: '#fff', fillOpacity: 1, weight: 2 });
        vm.addTo(map);
        customMarkersRef.current.push(vm);
      }
    };

    const handleDblClick = async (e: L.LeafletMouseEvent) => {
      if (drawMode !== 'polygon' || polygonPointsRef.current.length < 3) return;
      e.originalEvent.preventDefault();
      const coords = polygonPointsRef.current.map(p => [p.lng, p.lat] as [number, number]);
      coords.push(coords[0]);
      const geometry = { type: 'Polygon' as const, coordinates: [coords] };
      if (polygonPreviewRef.current) { map.removeLayer(polygonPreviewRef.current); polygonPreviewRef.current = null; }
      const poly = L.polygon(polygonPointsRef.current, { color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.3, weight: 2 });
      poly.addTo(map);
      customMarkersRef.current.push(poly);
      const centroid = geometryCentroid(geometry);
      const rasterValues: Record<string, number> = {};
      if (centroid) {
        for (const tileId of Array.from(enabledTiles)) {
          const tileDef = TILE_LAYERS.find(l => l.id === tileId);
          if (!tileDef?.valueEncoding?.urlTemplate) continue;
          const val = await sampleRasterAtPoint(centroid[0], centroid[1], tileDef.valueEncoding, 11);
          if (val !== null) rasterValues[tileDef.name] = val;
        }
      }
      setSelectedAssets(prev => [...prev, {
        type: 'custom', name: `Custom area (${polygonPointsRef.current.length} vertices)`,
        geometry, coordinates: centroid || [polygonPointsRef.current[0].lat, polygonPointsRef.current[0].lng],
        properties: {}, rasterValues,
      }]);
      polygonPointsRef.current = [];
      setDrawMode('off');
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);
    map.doubleClickZoom.disable();
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
      map.doubleClickZoom.enable();
      map.getContainer().style.cursor = '';
      polygonPointsRef.current = [];
      if (polygonPreviewRef.current) { map.removeLayer(polygonPreviewRef.current); polygonPreviewRef.current = null; }
    };
  }, [mapReady, drawMode, enabledTiles]);

  // ── Confirm ─────────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    onConfirm({
      selectionMode,
      selectedAssets,
      sampledPoints,
      enabledLayers: [...(params.layers || []), ...Array.from(enabledTiles), ...(params.spatialQueries || [])],
    });
  }, [selectedAssets, sampledPoints, selectionMode, params, onConfirm, enabledTiles]);

  const removeAsset = (index: number) => setSelectedAssets(prev => prev.filter((_, i) => i !== index));

  const clearAll = () => {
    setSelectedAssets([]);
    setSampledPoints([]);
    for (const marker of customMarkersRef.current) mapRef.current?.removeLayer(marker);
    customMarkersRef.current = [];
    selectedHighlightsRef.current.forEach(hl => hl.remove());
    selectedHighlightsRef.current.clear();
    // Reset zone styles
    zonesLayerRef.current?.eachLayer((layer: any) => {
      zonesLayerRef.current?.resetStyle(layer);
    });
  };

  const totalSelections = selectedAssets.length + sampledPoints.length;
  const availableTileLayers = (params.tileLayers || []).map(id => TILE_LAYERS.find(l => l.id === id)).filter(Boolean) as typeof TILE_LAYERS;

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex-1 min-w-0 mr-2">
          <p className="text-xs font-medium leading-tight">{params.prompt}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {polygonHelp || (selectionMode === 'assets' ? 'Click features to select' : selectionMode === 'sample' ? 'Click to sample values' : selectionMode === 'composite' ? 'Select zones + click assets' : 'Click zone boundaries')}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(selectionMode === 'assets' || selectionMode === 'composite') && (
            <>
              <Button variant={drawMode === 'point' ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] gap-1 px-2"
                onClick={() => setDrawMode(drawMode === 'point' ? 'off' : 'point')}>
                <MapPin className="w-3 h-3" /> Point
              </Button>
              <Button variant={drawMode === 'polygon' ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] gap-1 px-2"
                onClick={() => setDrawMode(drawMode === 'polygon' ? 'off' : 'polygon')}>
                <Pencil className="w-3 h-3" /> Area
              </Button>
            </>
          )}
          {totalSelections > 0 && (
            <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={clearAll}><Trash2 className="w-3 h-3" /></Button>
          )}
        </div>
      </div>

      {/* Tile layer toggle chips */}
      {availableTileLayers.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1 border-b bg-muted/20 overflow-x-auto shrink-0">
          <span className="text-[9px] text-muted-foreground shrink-0">Layers:</span>
          {availableTileLayers.map(layer => {
            const isOn = enabledTiles.has(layer.id);
            return (
              <button
                key={layer.id}
                onClick={() => toggleTileLayer(layer.id)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-all shrink-0 ${
                  isOn ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {isOn ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                {layer.name.length > 20 ? layer.name.slice(0, 18) + '…' : layer.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Map — fills remaining space */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0">
          <ValueTooltip mapRef={mapRef} enabledLayers={enabledTileLayerDefs} mapReady={mapReady} />
        </div>
        {loading && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center z-[1000]">
            <div className="bg-background border rounded-lg px-4 py-3 shadow-lg flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {loadingStatus}
            </div>
          </div>
        )}
      </div>

      {/* Selection list */}
      {totalSelections > 0 && (
        <div className="border-t px-3 py-1.5 max-h-20 overflow-y-auto shrink-0">
          <div className="flex flex-wrap gap-1">
            {selectedAssets.map((asset, i) => {
              const visual = asset.source ? OSM_VISUALS[asset.source] : null;
              return (
                <Badge key={i} variant="secondary" className="text-[9px] h-5 gap-1">
                  {asset.type === 'zone' ? '📍' : asset.type === 'custom' ? '✏️' : visual?.emoji || '📌'}
                  <span className="max-w-[120px] truncate">{asset.name}</span>
                  {asset.rasterValues && Object.keys(asset.rasterValues).length > 0 && (
                    <span className="text-emerald-500 text-[8px]">
                      {Object.values(asset.rasterValues).map(v => v.toFixed(2)).join(' ')}
                    </span>
                  )}
                  <button onClick={() => removeAsset(i)}><X className="w-2.5 h-2.5" /></button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-t bg-background shrink-0">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-7 text-xs gap-1 flex-1" onClick={handleConfirm} disabled={totalSelections === 0}>
          <Check className="w-3 h-3" /> Confirm {totalSelections} selection{totalSelections !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}
