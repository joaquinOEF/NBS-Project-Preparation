import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import { Check, X, MapPin, Pencil, Crosshair, Loader2, Trash2 } from 'lucide-react';
import { TILE_LAYERS, OSM_LAYERS, SPATIAL_QUERIES } from '@shared/geospatial-layers';
import type { OpenMapParams, SelectedAsset, SampledPoint, MapSelectionResult, MapSelectionMode } from '@shared/concept-note-schema';
import { sampleRasterAtPoint, geometryCentroid, latLngToTilePixel, fetchTilePixels, samplePixel, decodePixelNumeric } from '@/lib/valueTileUtils';
import { buildSpatialQueryLayer } from '@/lib/spatialQueryBuilder';
import ValueTooltip from './ValueTooltip';

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
  const spatialQueryRefs = useRef<Record<string, L.GeoJSON>>({});
  const zonesLayerRef = useRef<L.GeoJSON | null>(null);
  const customMarkersRef = useRef<L.Layer[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  const [sampledPoints, setSampledPoints] = useState<SampledPoint[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'point' | 'polygon'>('off');
  // Show polygon instruction when in polygon draw mode
  const polygonHelp = drawMode === 'polygon' ? 'Click to place vertices. Double-click to close.' : '';
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initializing map...');

  const selectionMode = params.selectionMode;

  // Get enabled tile layer defs for ValueTooltip
  const enabledTileLayerDefs = (params.tileLayers || [])
    .map(id => TILE_LAYERS.find(l => l.id === id))
    .filter(Boolean) as typeof TILE_LAYERS;

  // ── Initialize map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      center: [-30.03, -51.22], // Porto Alegre
      zoom: 11,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 17 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Load boundary + fit bounds ──────────────────────────────────────────────
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

  // ── Load requested layers ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    (async () => {
      // Tile layers
      for (const tileId of params.tileLayers || []) {
        const layerDef = TILE_LAYERS.find(l => l.id === tileId);
        if (!layerDef) continue;
        setLoadingStatus(`Loading ${layerDef.name}...`);
        const tl = L.tileLayer(`/api/geospatial/tiles/${layerDef.tileLayerId}/{z}/{x}/{y}.png`, {
          opacity: 0.7, maxNativeZoom: 15, maxZoom: 19, minZoom: 8, errorTileUrl: '',
        });
        tl.addTo(map);
        tileLayerRefs.current[tileId] = tl;
      }

      // OSM layers
      for (const osmId of params.layers || []) {
        const osmDef = OSM_LAYERS.find(l => l.id === osmId);
        if (!osmDef) continue;
        setLoadingStatus(`Fetching ${osmDef.name}...`);
        try {
          const res = await fetch(osmDef.endpoint);
          if (!res.ok) continue;
          const geojson = await res.json();

          const layer = L.geoJSON(geojson, {
            style: { color: osmDef.color, weight: 1.5, fillColor: osmDef.color, fillOpacity: 0.3, opacity: 0.7 },
            pointToLayer: (_f, latlng) => L.circleMarker(latlng, {
              radius: 6, color: osmDef.color, fillColor: osmDef.color, fillOpacity: 0.6, weight: 1.5,
            }),
            onEachFeature: (feature, layer) => {
              const p = feature.properties || {};
              const name = p.name || p.amenity || p.leisure || p.natural || 'Feature';

              // Make OSM features clickable for selection
              if (selectionMode === 'assets' || selectionMode === 'composite') {
                (layer as any).on('click', async () => {
                  const centroid = geometryCentroid(feature.geometry);
                  if (!centroid) return;

                  // Sample raster values at centroid
                  const rasterValues: Record<string, number> = {};
                  for (const tileId of params.tileLayers || []) {
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
                    // Toggle — remove if already selected
                    const existing = prev.findIndex(a => a.type === 'osm' && a.name === asset.name && a.source === asset.source);
                    if (existing >= 0) return prev.filter((_, i) => i !== existing);
                    return [...prev, asset];
                  });
                });

                // Hover cursor
                (layer as any).on('mouseover', () => { map.getContainer().style.cursor = 'pointer'; });
                (layer as any).on('mouseout', () => { map.getContainer().style.cursor = ''; });
              }

              // Tooltip
              const type = p.amenity || p.leisure || p.natural || p.landuse || '';
              const label = [name, type].filter(Boolean).join('<br/>');
              layer.bindTooltip(label || 'OSM Feature', { sticky: true });
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
              style: { color: '#1e293b', weight: 2, fillOpacity: 0, dashArray: '4 2' },
              onEachFeature: (feature, layer) => {
                const p = feature.properties || {};
                layer.bindTooltip(`<strong>${p.zoneId}</strong><br/>${p.typologyLabel} — ${p.interventionType?.replace(/_/g, ' ')}`, { sticky: true });

                (layer as any).on('click', () => {
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
                    if (existing >= 0) return prev.filter((_, i) => i !== existing);
                    return [...prev, asset];
                  });
                });

                (layer as any).on('mouseover', () => {
                  (layer as any).setStyle({ weight: 3, color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.15 });
                });
                (layer as any).on('mouseout', () => {
                  zonesLayerRef.current?.resetStyle(layer as any);
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
          if (result) {
            result.layer.addTo(map);
            spatialQueryRefs.current[sqId] = result.layer;
          }
        } catch {}
      }

      setLoading(false);
    })();
  }, [mapReady]);

  // ── Click-to-sample mode ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (selectionMode !== 'sample') return;
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
        // Add marker
        const marker = L.circleMarker([lat, lng], {
          radius: 6, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2,
        });
        const tooltipLines = Object.entries(values).map(([k, v]) => `${k}: <strong>${v.toFixed(3)}</strong>`);
        marker.bindTooltip(tooltipLines.join('<br/>'), { permanent: true, direction: 'top' });
        marker.addTo(map);
        customMarkersRef.current.push(marker);

        setSampledPoints(prev => [...prev, { lat, lng, values }]);
      }
    };

    map.on('click', handleClick);
    map.getContainer().style.cursor = 'crosshair';

    return () => {
      map.off('click', handleClick);
      map.getContainer().style.cursor = '';
    };
  }, [mapReady, selectionMode]);

  // ── Custom draw (point/polygon) mode ─────────────────────────────────────────
  const polygonPointsRef = useRef<L.LatLng[]>([]);
  const polygonPreviewRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!mapReady || !mapRef.current || (drawMode !== 'point' && drawMode !== 'polygon')) return;
    const map = mapRef.current;

    const handleClick = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      if (drawMode === 'point') {
        // Sample raster values
        const rasterValues: Record<string, number> = {};
        for (const tileId of params.tileLayers || []) {
          const tileDef = TILE_LAYERS.find(l => l.id === tileId);
          if (!tileDef?.valueEncoding?.urlTemplate) continue;
          const val = await sampleRasterAtPoint(lat, lng, tileDef.valueEncoding, 11);
          if (val !== null) rasterValues[tileDef.name] = val;
        }

        const marker = L.circleMarker([lat, lng], {
          radius: 8, color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.8, weight: 2,
        });
        marker.bindTooltip('Custom site', { permanent: false });
        marker.addTo(map);
        customMarkersRef.current.push(marker);

        const asset: SelectedAsset = {
          type: 'custom',
          name: `Custom point (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          coordinates: [lat, lng],
          properties: {},
          rasterValues,
        };
        setSelectedAssets(prev => [...prev, asset]);
        setDrawMode('off');
      }

      if (drawMode === 'polygon') {
        polygonPointsRef.current.push(e.latlng);
        // Update preview polyline
        if (polygonPreviewRef.current) map.removeLayer(polygonPreviewRef.current);
        if (polygonPointsRef.current.length >= 2) {
          polygonPreviewRef.current = L.polyline(
            [...polygonPointsRef.current, polygonPointsRef.current[0]],
            { color: '#8b5cf6', weight: 2, dashArray: '4 4' }
          ).addTo(map);
        }
        // Add vertex marker
        const vm = L.circleMarker([lat, lng], { radius: 4, color: '#8b5cf6', fillColor: '#fff', fillOpacity: 1, weight: 2 });
        vm.addTo(map);
        customMarkersRef.current.push(vm);
      }
    };

    const handleDblClick = async (e: L.LeafletMouseEvent) => {
      if (drawMode !== 'polygon' || polygonPointsRef.current.length < 3) return;
      e.originalEvent.preventDefault();

      // Close polygon
      const coords = polygonPointsRef.current.map(p => [p.lng, p.lat] as [number, number]);
      coords.push(coords[0]); // close ring
      const geometry = { type: 'Polygon' as const, coordinates: [coords] };

      // Remove preview
      if (polygonPreviewRef.current) { map.removeLayer(polygonPreviewRef.current); polygonPreviewRef.current = null; }

      // Draw final polygon
      const poly = L.polygon(polygonPointsRef.current, {
        color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.3, weight: 2,
      });
      poly.addTo(map);
      customMarkersRef.current.push(poly);

      // Centroid + raster sample
      const centroid = geometryCentroid(geometry);
      const rasterValues: Record<string, number> = {};
      if (centroid) {
        for (const tileId of params.tileLayers || []) {
          const tileDef = TILE_LAYERS.find(l => l.id === tileId);
          if (!tileDef?.valueEncoding?.urlTemplate) continue;
          const val = await sampleRasterAtPoint(centroid[0], centroid[1], tileDef.valueEncoding, 11);
          if (val !== null) rasterValues[tileDef.name] = val;
        }
      }

      const asset: SelectedAsset = {
        type: 'custom',
        name: `Custom area (${polygonPointsRef.current.length} vertices)`,
        geometry,
        coordinates: centroid || [polygonPointsRef.current[0].lat, polygonPointsRef.current[0].lng],
        properties: {},
        rasterValues,
      };
      setSelectedAssets(prev => [...prev, asset]);

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
  }, [mapReady, drawMode]);

  // ── Confirm handler ─────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    const enabledLayers = [
      ...(params.layers || []),
      ...(params.tileLayers || []),
      ...(params.spatialQueries || []),
    ];

    onConfirm({
      selectionMode,
      selectedAssets,
      sampledPoints,
      enabledLayers,
    });
  }, [selectedAssets, sampledPoints, selectionMode, params, onConfirm]);

  const removeAsset = (index: number) => {
    setSelectedAssets(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setSelectedAssets([]);
    setSampledPoints([]);
    for (const marker of customMarkersRef.current) {
      mapRef.current?.removeLayer(marker);
    }
    customMarkersRef.current = [];
  };

  const totalSelections = selectedAssets.length + sampledPoints.length;

  return (
    <div className="flex flex-col h-full bg-background border rounded-lg overflow-hidden">
      {/* Header with prompt */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{params.prompt}</p>
          <p className="text-[10px] text-muted-foreground">
            {polygonHelp || (selectionMode === 'assets' ? 'Click features to select' : selectionMode === 'sample' ? 'Click to sample values' : selectionMode === 'composite' ? 'Select zones + assets' : 'Click zone boundaries')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          {(selectionMode === 'assets' || selectionMode === 'composite') && (
            <div className="flex items-center gap-1">
              <Button
                variant={drawMode === 'point' ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={() => setDrawMode(drawMode === 'point' ? 'off' : 'point')}
              >
                <MapPin className="w-3 h-3" />
                Point
              </Button>
              <Button
                variant={drawMode === 'polygon' ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={() => setDrawMode(drawMode === 'polygon' ? 'off' : 'polygon')}
              >
                <Pencil className="w-3 h-3" />
                Area
              </Button>
            </div>
          )}
          {totalSelections > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={clearAll}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0">
          <ValueTooltip mapRef={mapRef} enabledLayers={enabledTileLayerDefs} mapReady={mapReady} />
        </div>
        {loading && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-[1000]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {loadingStatus}
            </div>
          </div>
        )}
      </div>

      {/* Selection list */}
      {totalSelections > 0 && (
        <div className="border-t px-3 py-1.5 max-h-24 overflow-y-auto">
          <div className="flex flex-wrap gap-1">
            {selectedAssets.map((asset, i) => (
              <Badge key={i} variant="secondary" className="text-[9px] h-5 gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${asset.type === 'zone' ? 'bg-blue-500' : asset.type === 'custom' ? 'bg-purple-500' : 'bg-emerald-500'}`} />
                {asset.name.length > 25 ? asset.name.slice(0, 23) + '...' : asset.name}
                {asset.rasterValues && Object.keys(asset.rasterValues).length > 0 && (
                  <span className="text-emerald-500 text-[8px]">
                    {Object.entries(asset.rasterValues).map(([, v]) => v.toFixed(2)).join(', ')}
                  </span>
                )}
                <button onClick={() => removeAsset(i)}><X className="w-2.5 h-2.5" /></button>
              </Badge>
            ))}
            {sampledPoints.map((pt, i) => (
              <Badge key={`sp-${i}`} variant="secondary" className="text-[9px] h-5 gap-1">
                <Crosshair className="w-2.5 h-2.5 text-red-500" />
                ({pt.lat.toFixed(3)}, {pt.lng.toFixed(3)})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 p-2.5 border-t bg-background">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs gap-1 flex-1"
          onClick={handleConfirm}
          disabled={totalSelections === 0}
        >
          <Check className="w-3 h-3" />
          Confirm {totalSelections} selection{totalSelections !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}
