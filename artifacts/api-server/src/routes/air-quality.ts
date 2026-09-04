import { Router, type IRouter } from "express";
import {
  GetAirQualitySummaryResponse,
  GetPredictionGridQueryParams,
  GetPredictionGridResponse,
  GetStationParams,
  GetStationResponse,
  ListHotspotsResponse,
  ListMeasurementsQueryParams,
  ListMeasurementsResponse,
  ListStationsResponse,
} from "@workspace/api-zod";

type Pollutant = "PM25" | "PM10" | "NO2" | "O3";

export type Station = {
  id: string;
  name: string;
  area: string;
  latitude: number;
  longitude: number;
  status: "active" | "delayed";
  lastUpdated: string;
  pm25: number;
  pm10: number;
  no2: number;
  o3: number;
  dataQualityScore: number;
};

const POSITIONING_STATEMENT =
  "AirGrid does not claim to know the real pollution level everywhere. It estimates it, tells you how confident it is, and always shows you which number is real.";

const generatedAt = "2026-09-04T08:30:00.000Z";

export const stations: Station[] = [
  {
    id: "stn-connaught",
    name: "Connaught Place",
    area: "Central Delhi",
    latitude: 28.6315,
    longitude: 77.2167,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 86,
    pm10: 162,
    no2: 48,
    o3: 32,
    dataQualityScore: 96,
  },
  {
    id: "stn-anand",
    name: "Anand Vihar",
    area: "East Delhi",
    latitude: 28.6469,
    longitude: 77.3152,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 148,
    pm10: 252,
    no2: 71,
    o3: 24,
    dataQualityScore: 93,
  },
  {
    id: "stn-rohini",
    name: "Rohini",
    area: "Northwest Delhi",
    latitude: 28.7495,
    longitude: 77.0565,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 72,
    pm10: 136,
    no2: 41,
    o3: 38,
    dataQualityScore: 89,
  },
  {
    id: "stn-punjabi",
    name: "Punjabi Bagh",
    area: "West Delhi",
    latitude: 28.6683,
    longitude: 77.1217,
    status: "delayed",
    lastUpdated: "2026-09-04T07:45:00.000Z",
    pm25: 102,
    pm10: 191,
    no2: 57,
    o3: 29,
    dataQualityScore: 72,
  },
  {
    id: "stn-ashram",
    name: "Sri Aurobindo Marg",
    area: "South Delhi",
    latitude: 28.5355,
    longitude: 77.203,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 58,
    pm10: 112,
    no2: 35,
    o3: 45,
    dataQualityScore: 94,
  },
  {
    id: "stn-najafgarh",
    name: "Najafgarh",
    area: "Southwest Delhi",
    latitude: 28.6092,
    longitude: 76.9798,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 64,
    pm10: 123,
    no2: 38,
    o3: 42,
    dataQualityScore: 84,
  },
  {
    id: "stn-noida",
    name: "Sector 62",
    area: "Noida",
    latitude: 28.627,
    longitude: 77.372,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 119,
    pm10: 218,
    no2: 63,
    o3: 27,
    dataQualityScore: 91,
  },
  {
    id: "stn-gurugram",
    name: "IMT Manesar",
    area: "Gurugram",
    latitude: 28.3515,
    longitude: 76.936,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 77,
    pm10: 148,
    no2: 44,
    o3: 39,
    dataQualityScore: 86,
  },
  {
    id: "stn-kochi-central",
    name: "Kochi Central",
    area: "Kochi",
    latitude: 9.967,
    longitude: 76.282,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 42,
    pm10: 78,
    no2: 24,
    o3: 34,
    dataQualityScore: 94,
  },
  {
    id: "stn-kalamassery",
    name: "Kalamassery",
    area: "Ernakulam",
    latitude: 10.053,
    longitude: 76.318,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 61,
    pm10: 108,
    no2: 35,
    o3: 30,
    dataQualityScore: 91,
  },
  {
    id: "stn-edappally",
    name: "Edappally",
    area: "Kochi",
    latitude: 10.025,
    longitude: 76.308,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 68,
    pm10: 121,
    no2: 39,
    o3: 28,
    dataQualityScore: 92,
  },
  {
    id: "stn-vyttila",
    name: "Vyttila",
    area: "Kochi",
    latitude: 9.967,
    longitude: 76.318,
    status: "delayed",
    lastUpdated: "2026-09-04T07:50:00.000Z",
    pm25: 56,
    pm10: 96,
    no2: 31,
    o3: 31,
    dataQualityScore: 75,
  },
  {
    id: "stn-aluva",
    name: "Aluva",
    area: "Ernakulam",
    latitude: 10.108,
    longitude: 76.352,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 45,
    pm10: 82,
    no2: 22,
    o3: 36,
    dataQualityScore: 87,
  },
  {
    id: "stn-kakkanad",
    name: "Kakkanad",
    area: "Kochi",
    latitude: 10.016,
    longitude: 76.349,
    status: "active",
    lastUpdated: generatedAt,
    pm25: 89,
    pm10: 149,
    no2: 48,
    o3: 25,
    dataQualityScore: 90,
  },
];

const pollutantMeta: Record<Pollutant, { key: keyof Station; unit: string }> = {
  PM25: { key: "pm25", unit: "µg/m³" },
  PM10: { key: "pm10", unit: "µg/m³" },
  NO2: { key: "no2", unit: "ppb" },
  O3: { key: "o3", unit: "ppb" },
};

const seededHotspots = [
  {
    id: "hot-anand-spike",
    area: "Anand Vihar",
    latitude: 28.6469,
    longitude: 77.3152,
    pollutant: "PM25" as const,
    value: 148,
    baseline: 92,
    kind: "spike" as const,
    severity: "critical" as const,
    detectedAt: generatedAt,
  },
  {
    id: "hot-noida-persistent",
    area: "Sector 62, Noida",
    latitude: 28.627,
    longitude: 77.372,
    pollutant: "PM25" as const,
    value: 119,
    baseline: 88,
    kind: "persistent" as const,
    severity: "high" as const,
    detectedAt: generatedAt,
  },
  {
    id: "hot-punjabi-spike",
    area: "Punjabi Bagh",
    latitude: 28.6683,
    longitude: 77.1217,
    pollutant: "PM25" as const,
    value: 102,
    baseline: 76,
    kind: "spike" as const,
    severity: "elevated" as const,
    detectedAt: generatedAt,
  },
  {
    id: "hot-kakkanad-persistent",
    area: "Kakkanad, Kochi",
    latitude: 10.016,
    longitude: 76.349,
    pollutant: "PM25" as const,
    value: 89,
    baseline: 54,
    kind: "persistent" as const,
    severity: "high" as const,
    detectedAt: generatedAt,
  },
];

// Hotspots are derived from the current station feed on every request.
// The seeded records above are retained only as historical/demo fixtures and
// are not returned by the live hotspot endpoint.
function detectHotspots() {
  const regions = stations.reduce((groups, station) => {
    const key = station.latitude < 15 ? "kochi" : "delhi";
    const values = groups.get(key) ?? [];
    values.push(station.pm25);
    groups.set(key, values);
    return groups;
  }, new Map<string, number[]>());
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  return stations.flatMap((station) => {
    const key = station.latitude < 15 ? "kochi" : "delhi";
    const regionalBaseline = median(regions.get(key) ?? [station.pm25]);
    const ratio = station.pm25 / Math.max(regionalBaseline, 1);
    if (ratio < 1.2) return [];
    return [{
      id: `detected-${station.id}`,
      area: station.area === "Kochi" ? `${station.name}, Kochi` : station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      pollutant: "PM25" as const,
      value: station.pm25,
      baseline: Number(regionalBaseline.toFixed(1)),
      kind: ratio >= 1.45 ? "spike" as const : "persistent" as const,
      severity: ratio >= 1.6 ? "critical" as const : ratio >= 1.4 ? "high" as const : "elevated" as const,
      detectedAt: new Date().toISOString(),
    }];
  });
}

function valueFor(station: Station, pollutant: Pollutant): number {
  return station[pollutantMeta[pollutant].key] as number;
}

function distanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusKm = 6371;
  const latA = (latitudeA * Math.PI) / 180;
  const latB = (latitudeB * Math.PI) / 180;
  const deltaLat = ((latitudeB - latitudeA) * Math.PI) / 180;
  const deltaLongitude = ((longitudeB - longitudeA) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function idwEstimate(
  latitude: number,
  longitude: number,
  pollutant: Pollutant,
) {
  const ranked = stations
    .map((station) => ({
      station,
      distance: distanceKm(
        latitude,
        longitude,
        station.latitude,
        station.longitude,
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);

  const exact = ranked.find((item) => item.distance < 0.05);
  if (exact) {
    return {
      value: Number(valueFor(exact.station, pollutant).toFixed(1)),
      dataQualityScore: exact.station.dataQualityScore,
    };
  }

  const weighted = ranked.reduce(
    (result, item) => {
      const weight = 1 / Math.max(item.distance, 0.1) ** 2;
      result.weightedValue += weight * valueFor(item.station, pollutant);
      result.totalWeight += weight;
      return result;
    },
    { weightedValue: 0, totalWeight: 0 },
  );
  const nearestDistance = ranked[0]?.distance ?? 20;
  const nearestQuality = ranked[0]?.station.dataQualityScore ?? 60;
  const distanceQuality = Math.max(25, 100 - nearestDistance * 9);
  const quality = Math.round(Math.min(nearestQuality, distanceQuality));

  return {
    value: Number((weighted.weightedValue / weighted.totalWeight).toFixed(1)),
    dataQualityScore: quality,
  };
}

function measurementsFor(station: Station, pollutant: Pollutant): Array<{
  stationId: string;
  timestamp: string;
  pollutant: Pollutant;
  value: number;
  unit: string;
  source: "measured";
}> {
  const current = valueFor(station, pollutant);
  const offsets = [-11, -8, -5, -2, 0];
  return offsets.map((offset, index) => ({
    stationId: station.id,
    timestamp: new Date(Date.parse(generatedAt) + offset * 60 * 60 * 1000)
      .toISOString(),
    pollutant,
    value: Number(
      (current * (0.84 + index * 0.035) + (station.id.length % 3)).toFixed(1),
    ),
    unit: pollutantMeta[pollutant].unit,
    source: "measured" as const,
  }));
}

function readPollutant(value: unknown): Pollutant {
  return value === "PM10" || value === "NO2" || value === "O3" ? value : "PM25";
}

const router: IRouter = Router();

router.get("/air-quality/summary", (_req, res) => {
  const pm25Values = stations.map((station) => station.pm25);
  const data = {
    city: "Delhi NCR",
    provider: "demo" as const,
    providerLabel: "Deterministic demo data",
    stationCount: stations.length,
    measuredCount: stations.length * 4,
    estimatedCellCount: 144,
    hotspotCount: detectHotspots().length,
    averagePm25: Number(
      (pm25Values.reduce((sum, value) => sum + value, 0) / pm25Values.length).toFixed(1),
    ),
    maxPm25: Math.max(...pm25Values),
    updatedAt: generatedAt,
    hotspots: detectHotspots(),
    positioningStatement: POSITIONING_STATEMENT,
  };
  res.json(GetAirQualitySummaryResponse.parse(data));
});

router.get("/air-quality/stations", (_req, res) => {
  res.json(ListStationsResponse.parse(stations));
});

router.get("/air-quality/stations/:stationId", (req, res) => {
  const { stationId } = GetStationParams.parse(req.params);
  const station = stations.find((candidate) => candidate.id === stationId);
  if (!station) {
    res.status(404).json({ error: "Station not found" });
    return;
  }
  const data = {
    station,
    recentMeasurements: measurementsFor(station, "PM25"),
  };
  res.json(GetStationResponse.parse(data));
});

router.get("/air-quality/measurements", (req, res) => {
  const { pollutant } = ListMeasurementsQueryParams.parse(req.query);
  const selectedPollutant = readPollutant(pollutant);
  const measurements = stations.flatMap((station) =>
    measurementsFor(station, selectedPollutant),
  );
  res.json(ListMeasurementsResponse.parse(measurements));
});

router.get("/air-quality/predictions/grid", (req, res) => {
  const { pollutant } = GetPredictionGridQueryParams.parse(req.query);
  const selectedPollutant = readPollutant(pollutant);
  const cells = [
    { latitude: 28.33, longitude: 76.92 },
    { latitude: 9.86, longitude: 76.19 },
  ].flatMap((origin) => Array.from({ length: 12 }, (_, row) =>
    Array.from({ length: 12 }, (_, column) => {
      const latitude = origin.latitude + row * 0.04;
      const longitude = origin.longitude + column * 0.04;
      return {
        latitude: Number(latitude.toFixed(4)),
        longitude: Number(longitude.toFixed(4)),
        ...idwEstimate(latitude, longitude, selectedPollutant),
      };
    }),
  ).flat());
  const data = {
    pollutant: selectedPollutant,
    unit: pollutantMeta[selectedPollutant].unit,
    method: "idw" as const,
    cells,
    generatedAt,
  };
  res.json(GetPredictionGridResponse.parse(data));
});

router.get("/air-quality/hotspots", (_req, res) => {
  res.json(ListHotspotsResponse.parse(detectHotspots()));
});

export default router;
