import type { Station } from "../routes/air-quality";

export type HistoricalMeasurement = {
  stationId: string;
  timestamp: string;
  pm25: number;
  pm10: number;
  source: "demo";
};

function seededNoise(day: number, hour: number, stationIndex: number) {
  const value = Math.sin((day * 97 + hour * 31 + stationIndex * 17 + 42) * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function diurnalFactor(hour: number) {
  if (hour < 5) return 0.76 + hour * 0.012;
  if (hour < 10) return 0.84 + (hour - 5) * 0.055;
  if (hour < 16) return 1.08 - (hour - 10) * 0.012;
  if (hour < 21) return 1.01 + (hour - 16) * 0.045;
  return 1.23 - (hour - 21) * 0.075;
}

export function generateHistoricalMeasurements(
  stations: readonly Station[],
): HistoricalMeasurement[] {
  const start = Date.parse("2026-08-29T00:00:00.000Z");
  const readings: HistoricalMeasurement[] = [];

  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const [stationIndex, station] of stations.entries()) {
        const persistentLift =
          station.id === "stn-anand" ? 1.18 : station.id === "stn-noida" ? 1.08 : 1;
        const occasionalSpike =
          (day === 2 && hour === 8 && station.id === "stn-anand") ||
          (day === 5 && hour === 19 && station.id === "stn-punjabi")
            ? 1.42
            : 1;
        const factor =
          diurnalFactor(hour) *
          persistentLift *
          occasionalSpike *
          (1 + seededNoise(day, hour, stationIndex) * 0.035);
        readings.push({
          stationId: station.id,
          timestamp: new Date(start + (day * 24 + hour) * 60 * 60 * 1000).toISOString(),
          pm25: Number(Math.max(8, station.pm25 * factor).toFixed(1)),
          pm10: Number(Math.max(16, station.pm10 * factor).toFixed(1)),
          source: "demo",
        });
      }
    }
  }

  return readings;
}