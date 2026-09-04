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

const DEMO_BOUNDS = {
  minLat: 28.2,
  maxLat: 28.85,
  minLon: 76.7,
  maxLon: 77.55,
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

function isCovered(latitude: number, longitude: number) {
  return (
    latitude >= DEMO_BOUNDS.minLat &&
    latitude <= DEMO_BOUNDS.maxLat &&
    longitude >= DEMO_BOUNDS.minLon &&
    longitude <= DEMO_BOUNDS.maxLon
  );
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
    };

    if (map.isStyleLoaded()) syncMapData();
    else map.once("load", syncMapData);
    return () => {
      map.off("load", syncMapData);
    };
  }, [stations, hotspots, grid, onStationSelect]);

  async function searchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || !mapRef.current) return;
    setSearching(true);
    setSearchError("");
    try {
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
    <div className="relative overflow-hidden rounded-xl border border-[#1d4543] bg-[#102c2b]">
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
      </div>
      {searchError && (
        <p className="absolute left-5 top-[4.7rem] z-10 rounded-lg bg-[#102c2b]/95 px-3 py-2 text-xs text-[#ffd9c7]">
          {searchError}
        </p>
      )}
      {outsideCoverage && (
        <div className="absolute bottom-4 left-4 right-4 z-10 flex items-start gap-2 rounded-xl border border-[#ffd48a]/30 bg-[#102c2b]/90 px-3 py-2.5 text-xs text-white shadow-lg backdrop-blur sm:left-auto sm:max-w-sm">
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