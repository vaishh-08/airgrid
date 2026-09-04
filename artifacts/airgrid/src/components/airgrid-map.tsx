import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, Loader2, MapPin, LocateFixed } from "lucide-react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Hotspot, PredictionGrid, Station } from "@workspace/api-client-react";

type AirGridMapProps = {
  stations: Station[];
  hotspots: Hotspot[];
  grid?: PredictionGrid;
  onStationSelect: (stationId: string) => void;
};

const DEMO_AREAS = [
  { minLat: 28.2, maxLat: 28.85, minLon: 76.7, maxLon: 77.55 },
  { minLat: 9.82, maxLat: 10.36, minLon: 76.12, maxLon: 76.68 },
];
const KNOWN_CITIES: Record<string, [number, number]> = {
  kochi: [76.2673, 9.9312], ernakulam: [76.2999, 9.9816],
  bengaluru: [77.5946, 12.9716], bangalore: [77.5946, 12.9716],
  delhi: [77.209, 28.6139], mumbai: [72.8777, 19.076],
};

type PointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, string | number>;
};

type PointFeatureCollection = {
  type: "FeatureCollection";
  features: PointFeature[];
};

type LiveMapCell = { latitude: number; longitude: number; pm25: number | null; pm10: number | null; windSpeed: number | null; windDirection: number | null; source: string };
type LiveMapPayload = { fetchedAt: string; cells: LiveMapCell[]; errors: { air: boolean; weather: boolean } };
type LiveStation = { id: number; name: string; latitude: number; longitude: number; provider: string; lastUpdated: string | null; source: string };

function isCovered(latitude: number, longitude: number) {
  return DEMO_AREAS.some((area) => latitude >= area.minLat && latitude <= area.maxLat && longitude >= area.minLon && longitude <= area.maxLon);
}

function hasWebGlContext() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

export default function AirGridMap({
  stations,
  hotspots,
  grid,
  onStationSelect,
}: AirGridMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [outsideCoverage, setOutsideCoverage] = useState(false);
  const [mapMode, setMapMode] = useState<"maplibre" | "leaflet">("maplibre");
  const [satellite, setSatellite] = useState(false);
  const [liveMap, setLiveMap] = useState<LiveMapPayload | null>(null);
  const [showModel, setShowModel] = useState(true);
  const [showWind, setShowWind] = useState(true);
  const [liveMapError, setLiveMapError] = useState(false);
  const [liveStations, setLiveStations] = useState<LiveStation[]>([]);
  const [showRisk, setShowRisk] = useState(true);
  const [caseStatus, setCaseStatus] = useState<'unassigned' | 'assigned' | 'verified' | 'actioned'>('unassigned');
  const [liveOnly, setLiveOnly] = useState(() => window.localStorage.getItem("airgrid-data-mode") === "live");

  useEffect(() => {
    const onModeChange = (event: Event) => setLiveOnly((event as CustomEvent<"live" | "demo">).detail === "live");
    window.addEventListener("airgrid-data-mode", onModeChange);
    return () => window.removeEventListener("airgrid-data-mode", onModeChange);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/live-stations").then((response) => response.ok ? response.json() as Promise<{ stations?: LiveStation[] }> : Promise.reject()).then((payload) => { if (active) setLiveStations(payload.stations ?? []); }).catch(() => { if (active) setLiveStations([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/live-map");
        if (!response.ok) throw new Error("Live map unavailable");
        const payload = await response.json() as LiveMapPayload;
        if (active) { setLiveMap(payload); setLiveMapError(false); }
      } catch {
        if (active) setLiveMapError(true);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    let map: MapLibreMap;
    try {
      if (!hasWebGlContext()) throw new Error("WebGL unavailable");
      map = new maplibregl.Map({
        container: mapContainer.current,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [78.9629, 20.5937],
        zoom: 4.2,
        attributionControl: false,
      });
    } catch {
      setMapMode("leaflet");
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("moveend", () => {
      const center = map.getCenter();
      setOutsideCoverage(!isCovered(center.lat, center.lng));
    });
    map.on("load", () => {
      setOutsideCoverage(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncMapData = () => {
      const stationGeoJson: PointFeatureCollection = {
        type: "FeatureCollection",
        features: stations.map((station) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [station.longitude, station.latitude] },
          properties: { id: station.id, name: station.name, pm25: station.pm25 },
        })),
      };
      const hotspotGeoJson: PointFeatureCollection = {
        type: "FeatureCollection",
        features: hotspots.map((hotspot) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [hotspot.longitude, hotspot.latitude] },
          properties: { area: hotspot.area, value: hotspot.value, severity: hotspot.severity },
        })),
      };
      const gridGeoJson: PointFeatureCollection = {
        type: "FeatureCollection",
        features: (grid?.cells ?? []).map((cell) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [cell.longitude, cell.latitude] },
          properties: { value: cell.value, quality: cell.dataQualityScore },
        })),
      };

      const upsertSource = (
        id: string,
        data: PointFeatureCollection,
      ) => {
        const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (source) source.setData(data as never);
        else map.addSource(id, { type: "geojson", data: data as never });
      };

      upsertSource("airgrid-estimates", gridGeoJson);
      upsertSource("airgrid-stations", stationGeoJson);
      upsertSource("airgrid-hotspots", hotspotGeoJson);

      if (!map.getLayer("airgrid-estimate-cells")) {
        map.addLayer({
          id: "airgrid-estimate-cells",
          type: "circle",
          source: "airgrid-estimates",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 22, 9, 38, 13, 50],
            "circle-blur": 1,
            "circle-opacity": 0.62,
            "circle-color": [
              "interpolate",
              ["linear"],
              ["get", "value"],
              20,
              "#20b486",
              65,
              "#edbd4a",
              110,
              "#ee6b55",
              160,
              "#c43d58",
            ],
          },
        });
      }
      if (!map.getLayer("airgrid-station-points")) {
        map.addLayer({
          id: "airgrid-station-points",
          type: "circle",
          source: "airgrid-stations",
          paint: {
            "circle-radius": 7,
            "circle-color": "#42d3a1",
            "circle-stroke-color": "#102c2b",
            "circle-stroke-width": 2,
          },
        });
        map.on("click", "airgrid-station-points", (event) => {
          const feature = event.features?.[0];
          const id = feature?.properties?.id;
          if (id) onStationSelect(String(id));
        });
        map.on("mouseenter", "airgrid-station-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "airgrid-station-points", () => {
          map.getCanvas().style.cursor = "";
        });
      }
      if (!map.getLayer("airgrid-hotspot-points")) {
        map.addLayer({
          id: "airgrid-hotspot-points",
          type: "circle",
          source: "airgrid-hotspots",
          paint: {
            "circle-radius": 9,
            "circle-color": "#f05a59",
            "circle-stroke-color": "#fff1df",
            "circle-stroke-width": 2,
            "circle-opacity": 0.95,
          },
        });
      }
      map.setLayoutProperty("airgrid-estimate-cells", "visibility", liveOnly ? "none" : "visible");
      map.setLayoutProperty("airgrid-station-points", "visibility", liveOnly ? "none" : "visible");
      map.setLayoutProperty("airgrid-hotspot-points", "visibility", liveOnly ? "none" : "visible");
    };

    if (map.isStyleLoaded()) syncMapData();
    else map.once("load", syncMapData);
    return () => {
      map.off("load", syncMapData);
    };
  }, [stations, hotspots, grid, onStationSelect, liveOnly]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !liveMap) return;
    const syncLiveLayers = () => {
      const model: PointFeatureCollection = { type: "FeatureCollection", features: liveMap.cells.filter((cell) => cell.pm25 !== null).map((cell) => ({ type: "Feature", geometry: { type: "Point", coordinates: [cell.longitude, cell.latitude] }, properties: { pm25: cell.pm25 ?? 0, source: cell.source } })) };
      const wind: PointFeatureCollection = { type: "FeatureCollection", features: liveMap.cells.filter((cell) => cell.windSpeed !== null && cell.windDirection !== null).map((cell) => ({ type: "Feature", geometry: { type: "Point", coordinates: [cell.longitude, cell.latitude] }, properties: { speed: cell.windSpeed ?? 0, direction: ((cell.windDirection ?? 0) + 180) % 360 } })) };
      const upsert = (id: string, data: PointFeatureCollection) => {
        const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (source) source.setData(data as never); else map.addSource(id, { type: "geojson", data: data as never });
      };
      upsert("airgrid-live-model", model);
      upsert("airgrid-wind", wind);
      if (!map.getLayer("airgrid-live-model-cells")) map.addLayer({ id: "airgrid-live-model-cells", type: "circle", source: "airgrid-live-model", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 22, 7, 42], "circle-blur": 0.75, "circle-opacity": 0.54, "circle-color": ["interpolate", ["linear"], ["get", "pm25"], 0, "#45d9a5", 15, "#e6c257", 35, "#ed855d", 60, "#d94b63"] } }, map.getLayer("airgrid-estimate-cells") ? "airgrid-estimate-cells" : undefined);
      if (!map.getLayer("airgrid-wind-arrows")) map.addLayer({ id: "airgrid-wind-arrows", type: "symbol", source: "airgrid-wind", layout: { "text-field": "➜", "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 18], "text-rotate": ["get", "direction"], "text-rotation-alignment": "map", "text-keep-upright": false }, paint: { "text-color": "#f8f5ec", "text-halo-color": "#102c2b", "text-halo-width": 1.5, "text-opacity": 0.9 } });
      map.setLayoutProperty("airgrid-live-model-cells", "visibility", showModel ? "visible" : "none");
      map.setLayoutProperty("airgrid-wind-arrows", "visibility", showWind ? "visible" : "none");
    };
    if (map.isStyleLoaded()) syncLiveLayers(); else map.once("load", syncLiveLayers);
    return () => { map.off("load", syncLiveLayers); };
  }, [liveMap, showModel, showWind]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applySatellite = () => {
      if (!map.getSource("airgrid-satellite")) {
        map.addSource("airgrid-satellite", {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          attribution: "Esri, Maxar, Earthstar Geographics",
        });
      }
      if (!map.getLayer("airgrid-satellite-layer")) {
        map.addLayer({ id: "airgrid-satellite-layer", type: "raster", source: "airgrid-satellite", paint: { "raster-opacity": 0.92 } }, map.getLayer("airgrid-estimate-cells") ? "airgrid-estimate-cells" : undefined);
      }
      map.setLayoutProperty("airgrid-satellite-layer", "visibility", satellite ? "visible" : "none");
    };
    if (map.isStyleLoaded()) applySatellite();
    else map.once("load", applySatellite);
    return () => { map.off("load", applySatellite); };
  }, [satellite]);

  async function searchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || !mapRef.current) return;
    setSearching(true);
    setSearchError("");
    try {
      const known = KNOWN_CITIES[trimmed.toLowerCase()];
      if (known) {
        mapRef.current.flyTo({ center: known, zoom: 11.5, essential: true });
        return;
      }
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=1`,
      );
      if (!response.ok) throw new Error("Search unavailable");
      const payload = (await response.json()) as {
        features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
      };
      const coordinates = payload.features?.[0]?.geometry?.coordinates;
      if (!coordinates) {
        setSearchError("No location found. Try a city or neighborhood.");
        return;
      }
      mapRef.current.flyTo({ center: coordinates, zoom: 11, essential: true });
    } catch {
      setSearchError("Location search is unavailable right now.");
    } finally {
      setSearching(false);
    }
  }

  function resetToIndia() {
    mapRef.current?.flyTo({ center: [78.9629, 20.5937], zoom: 4.2, essential: true });
  }

  if (mapMode === "leaflet") {
    return (
      <LeafletFallback
        stations={stations}
        hotspots={hotspots}
        grid={grid}
        onStationSelect={onStationSelect}
      />
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-[#102c2b] shadow-2xl">
      <div className="absolute left-4 right-16 top-4 z-10 flex flex-col gap-2 sm:right-20 sm:flex-row">
        <form
          onSubmit={searchLocation}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/15 bg-[#102c2b]/90 p-1.5 shadow-lg backdrop-blur"
        >
          <Search className="ml-2 h-4 w-4 shrink-0 text-white/55" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a city or neighborhood"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-white/45"
            aria-label="Search a city or neighborhood"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#42d3a1] px-3 py-2 text-xs font-bold text-[#102c2b] disabled:opacity-50"
            disabled={searching}
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </button>
        </form>
        <button
          type="button"
          onClick={resetToIndia}
          className="hidden items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#102c2b]/90 px-3 text-xs font-semibold text-white shadow-lg backdrop-blur sm:flex"
          title="Reset to India"
        >
          <LocateFixed className="h-4 w-4 text-[#42d3a1]" />
          India
        </button>
        <button type="button" onClick={() => setSatellite((value) => !value)} className="hidden items-center justify-center rounded-xl border border-white/15 bg-[#102c2b]/90 px-3 text-xs font-semibold text-white shadow-lg backdrop-blur sm:flex" title="Toggle satellite imagery">
          {satellite ? "Map" : "Satellite"}
        </button>
        <button type="button" onClick={() => setShowModel((value) => !value)} className="hidden items-center justify-center rounded-xl border border-white/15 bg-[#102c2b]/90 px-3 text-xs font-semibold text-white shadow-lg backdrop-blur sm:flex" title="Toggle modelled pollution grid">
          {showModel ? "Hide PM" : "Show PM"}
        </button>
        <button type="button" onClick={() => setShowWind((value) => !value)} className="hidden items-center justify-center rounded-xl border border-white/15 bg-[#102c2b]/90 px-3 text-xs font-semibold text-white shadow-lg backdrop-blur sm:flex" title="Toggle wind direction arrows">
          {showWind ? "Hide wind" : "Show wind"}
        </button>
      </div>
      {searchError && (
        <p className="absolute left-5 top-[4.7rem] z-10 rounded-lg bg-[#102c2b]/95 px-3 py-2 text-xs text-[#ffd9c7]">
          {searchError}
        </p>
      )}
      <div className="absolute bottom-4 left-4 z-10 max-w-sm rounded-xl border border-white/15 bg-[#102c2b]/80 px-3 py-2.5 text-xs text-white shadow-lg backdrop-blur">
        <strong>{liveOnly ? 'Live India PM2.5 surface' : 'India PM2.5 surface'}</strong> · Open-Meteo modelled · wind arrows show downwind direction
        {liveMapError && <span className="block pt-1 text-[#ffd48a]">Live map unavailable — retaining last successful surface when available.</span>}
      </div>
      {outsideCoverage && !liveMap && (
        <div className="absolute bottom-16 left-4 right-4 z-10 flex items-start gap-2 rounded-xl border border-[#ffd48a]/30 bg-[#102c2b]/90 px-3 py-2.5 text-xs text-white shadow-lg backdrop-blur sm:left-auto sm:max-w-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ffd48a]" />
          <span>
            <strong>Outside demo coverage</strong> — showing nearest available estimate.
          </span>
        </div>
      )}
      <div ref={mapContainer} className="h-[560px] w-full sm:h-[640px]" />
    </div>
  );
}

function LeafletFallback({
  stations,
  hotspots,
  grid,
  onStationSelect,
}: AirGridMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [outsideCoverage, setOutsideCoverage] = useState(true);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = L.map(mapContainer.current, {
      center: [20.5937, 78.9629],
      zoom: 4.2,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on("moveend", () => {
      const center = map.getCenter();
      setOutsideCoverage(!isCovered(center.lat, center.lng));
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });
    (grid?.cells ?? []).forEach((cell) => {
      const color = cell.value > 110 ? "#c43d58" : cell.value > 65 ? "#edbd4a" : "#20b486";
      L.circleMarker([cell.latitude, cell.longitude], {
        radius: 18,
        color,
        fillColor: color,
        fillOpacity: 0.28,
        opacity: 0,
      }).addTo(map);
    });
    stations.forEach((station) => {
      L.circleMarker([station.latitude, station.longitude], {
        radius: 6,
        color: "#102c2b",
        weight: 2,
        fillColor: "#42d3a1",
        fillOpacity: 1,
      })
        .bindTooltip(`${station.name} · measured`)
        .on("click", () => onStationSelect(station.id))
        .addTo(map);
    });
    hotspots.forEach((hotspot) => {
      L.circleMarker([hotspot.latitude, hotspot.longitude], {
        radius: 8,
        color: "#fff1df",
        weight: 2,
        fillColor: "#f05a59",
        fillOpacity: 0.95,
      })
        .bindTooltip(`${hotspot.area} · hotspot`)
        .addTo(map);
    });
  }, [stations, hotspots, grid, onStationSelect]);

  async function searchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || !mapRef.current) return;
    setSearching(true);
    setSearchError("");
    try {
      const known = KNOWN_CITIES[trimmed.toLowerCase()];
      if (known) {
        mapRef.current.flyTo([known[1], known[0]], 11.5, { animate: true });
        return;
      }
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=1`,
      );
      if (!response.ok) throw new Error("Search unavailable");
      const payload = (await response.json()) as {
        features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
      };
      const coordinates = payload.features?.[0]?.geometry?.coordinates;
      if (!coordinates) {
        setSearchError("No location found. Try a city or neighborhood.");
        return;
      }
      mapRef.current.flyTo([coordinates[1], coordinates[0]], 11, { animate: true });
    } catch {
      setSearchError("Location search is unavailable right now.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#1d4543] bg-[#102c2b]">
      <div className="absolute left-4 right-4 top-4 z-[1000] flex flex-col gap-2 sm:right-20 sm:flex-row">
        <form
          onSubmit={searchLocation}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/15 bg-[#102c2b]/90 p-1.5 shadow-lg backdrop-blur"
        >
          <Search className="ml-2 h-4 w-4 shrink-0 text-white/55" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a city or neighborhood"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-white/45"
            aria-label="Search a city or neighborhood"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#42d3a1] px-3 py-2 text-xs font-bold text-[#102c2b] disabled:opacity-50"
            disabled={searching}
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => mapRef.current?.flyTo([20.5937, 78.9629], 4.2)}
          className="hidden items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#102c2b]/90 px-3 text-xs font-semibold text-white shadow-lg backdrop-blur sm:flex"
        >
          <LocateFixed className="h-4 w-4 text-[#42d3a1]" />
          India
        </button>
      </div>
      {searchError && (
        <p className="absolute left-5 top-[4.7rem] z-[1000] rounded-lg bg-[#102c2b]/95 px-3 py-2 text-xs text-[#ffd9c7]">
          {searchError}
        </p>
      )}
      {outsideCoverage && (
        <div className="absolute bottom-4 left-4 right-4 z-[1000] flex items-start gap-2 rounded-xl border border-[#ffd48a]/30 bg-[#102c2b]/90 px-3 py-2.5 text-xs text-white shadow-lg backdrop-blur sm:left-auto sm:max-w-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ffd48a]" />
          <span>
            <strong>Outside demo coverage</strong> — showing nearest available estimate.
          </span>
        </div>
      )}
      <div ref={mapContainer} className="h-[560px] w-full sm:h-[640px]" />
    </div>
  );
}
