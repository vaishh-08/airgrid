import { Router, type IRouter } from "express";
import healthRouter from "./health";
import airQualityRouter from "./air-quality";
import { generateHistoricalMeasurements } from "../data/historical";
import { loadValidationStatus } from "../data/validation-loader";
import { ListHistoricalMeasurementsQueryParams, ListHistoricalMeasurementsResponse, GetValidationStatusResponse } from "@workspace/api-zod";
import { stations } from "./air-quality";

const router: IRouter = Router();

router.use(healthRouter);
router.use(airQualityRouter);

const historicalMeasurements = generateHistoricalMeasurements(stations);

type LiveCity = { name: string; latitude: number; longitude: number };
const liveCities: Record<string, LiveCity> = {
  kochi: { name: "Kochi", latitude: 9.9312, longitude: 76.2673 },
  ernakulam: { name: "Ernakulam", latitude: 9.9816, longitude: 76.2999 },
  bengaluru: { name: "Bengaluru", latitude: 12.9716, longitude: 77.5946 },
  delhi: { name: "Delhi", latitude: 28.6139, longitude: 77.209 },
  mumbai: { name: "Mumbai", latitude: 19.076, longitude: 72.8777 },
};

async function jsonOrError(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`upstream returned ${response.status}`);
  return response.json();
}

type OpenMeteoCurrent = {
  latitude: number;
  longitude: number;
  current?: { pm2_5?: number; pm10?: number; wind_speed_10m?: number; wind_direction_10m?: number };
};

function indiaGridPoints() {
  const points: Array<{ latitude: number; longitude: number }> = [];
  for (let latitude = 8.5; latitude <= 33.5; latitude += 2.5) {
    for (let longitude = 69.5; longitude <= 92.5; longitude += 2.5) points.push({ latitude, longitude });
  }
  return points;
}

router.get("/live-map", async (_req, res) => {
  const points = indiaGridPoints();
  const latitude = points.map((point) => point.latitude).join(",");
  const longitude = points.map((point) => point.longitude).join(",");
  const [air, weather] = await Promise.allSettled([
    jsonOrError(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm2_5,pm10`),
    jsonOrError(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=wind_speed_10m,wind_direction_10m`),
  ]);
  const airValues = air.status === "fulfilled" ? (Array.isArray(air.value) ? air.value : [air.value]) as OpenMeteoCurrent[] : [];
  const weatherValues = weather.status === "fulfilled" ? (Array.isArray(weather.value) ? weather.value : [weather.value]) as OpenMeteoCurrent[] : [];
  const cells = points.map((point, index) => ({
    ...point,
    pm25: airValues[index]?.current?.pm2_5 ?? null,
    pm10: airValues[index]?.current?.pm10 ?? null,
    windSpeed: weatherValues[index]?.current?.wind_speed_10m ?? null,
    windDirection: weatherValues[index]?.current?.wind_direction_10m ?? null,
    source: "Open-Meteo (modelled)",
  })).filter((cell) => cell.pm25 !== null || cell.windSpeed !== null);
  res.json({ fetchedAt: new Date().toISOString(), cells, errors: { air: air.status === "rejected", weather: weather.status === "rejected" } });
});

router.get("/live-stations", async (_req, res) => {
  const key = process.env.OPENAQ_API_KEY;
  if (!key) {
    res.json({ stations: [], unavailable: "OPENAQ_API_KEY is not configured" });
    return;
  }
  const lookups = await Promise.allSettled(Object.values(liveCities).map(async (city) => {
    const payload = await jsonOrError(`https://api.openaq.org/v3/locations?limit=2&coordinates=${city.latitude},${city.longitude}&radius=50000`, { headers: { "X-API-Key": key } }) as { results?: Array<{ id: number; name: string; coordinates?: { latitude: number; longitude: number }; provider?: { name?: string }; datetimeLast?: { utc?: string } }> };
    return (payload.results ?? []).map((station) => ({ id: station.id, name: station.name, latitude: station.coordinates?.latitude, longitude: station.coordinates?.longitude, provider: station.provider?.name ?? "OpenAQ", lastUpdated: station.datetimeLast?.utc ?? null, source: "OpenAQ (measured station)" })).filter((station) => station.latitude !== undefined && station.longitude !== undefined);
  }));
  const stations = lookups.flatMap((lookup) => lookup.status === "fulfilled" ? lookup.value : []);
  res.json({ stations, fetchedAt: new Date().toISOString() });
});

router.get("/live-data", async (req, res) => {
  const city = liveCities[String(req.query.city ?? "kochi").toLowerCase()] ?? liveCities.kochi;
  const params = `latitude=${city.latitude}&longitude=${city.longitude}`;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?${params}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m`;
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?${params}&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;
  const [weather, air] = await Promise.allSettled([jsonOrError(weatherUrl), jsonOrError(airUrl)]);
  const openAqKey = process.env.OPENAQ_API_KEY;
  const openAq = openAqKey
    ? await jsonOrError(`https://api.openaq.org/v3/locations?limit=1&coordinates=${city.latitude},${city.longitude}&radius=25000`, { headers: { "X-API-Key": openAqKey } }).then(value => ({ value })).catch(error => ({ error: error instanceof Error ? error.message : "lookup failed" }))
    : undefined;
  res.json({
    city,
    fetchedAt: new Date().toISOString(),
    weather: weather.status === "fulfilled" ? { value: weather.value } : { error: weather.reason instanceof Error ? weather.reason.message : "weather lookup failed" },
    air: air.status === "fulfilled" ? { value: air.value } : { error: air.reason instanceof Error ? air.reason.message : "air-quality lookup failed" },
    openAq: openAqKey ? openAq : { unavailable: "OPENAQ_API_KEY is not configured" },
  });
});

router.get("/air-quality/history", (req, res) => {
  const { stationId } = ListHistoricalMeasurementsQueryParams.parse(req.query);
  const data = stationId
    ? historicalMeasurements.filter((measurement) => measurement.stationId === stationId)
    : historicalMeasurements;
  res.json(ListHistoricalMeasurementsResponse.parse(data));
});

router.get("/validation", (_req, res) => {
  res.json(GetValidationStatusResponse.parse(loadValidationStatus()));
});

export default router;
