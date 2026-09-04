import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type ValidationRow = {
  timestamp: number;
  stationId: string | null;
  actual: number;
};

export type ValidationStatus = {
  status: "not_loaded" | "loaded";
  message: string;
  datasetLabel: string;
  filename: string | null;
  rowCount: number | null;
  trainingRows: number | null;
  validationRows: number | null;
  mae: number | null;
  rmse: number | null;
  r2: number | null;
};

function findDataset() {
  const configured = process.env["AIRGRID_VALIDATION_CSV"];
  const candidates = [
    configured,
    resolve(process.cwd(), "backend/data/real_historical.csv"),
    resolve(process.cwd(), "../../backend/data/real_historical.csv"),
    resolve(process.cwd(), "artifacts/api-server/backend/data/real_historical.csv"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate));
}

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], names: string[]) {
  const wanted = names.map(normaliseHeader);
  return headers.findIndex((header) => wanted.includes(normaliseHeader(header)));
}

function parseCsv(content: string): ValidationRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  const timestampIndex = findColumn(headers, ["timestamp", "datetime", "date", "time"]);
  const stationIndex = findColumn(headers, ["station", "stationid", "site", "siteid", "location"]);
  const pm25Index = findColumn(headers, ["pm25", "pm2.5", "pm2_5", "particulatematter25"]);
  const pm10Index = findColumn(headers, ["pm10", "particulatematter10"]);
  if (timestampIndex < 0 || (pm25Index < 0 && pm10Index < 0)) return [];
  const valueIndex = pm25Index >= 0 ? pm25Index : pm10Index;

  return lines.slice(1).flatMap((line) => {
    const columns = line.split(",").map((column) => column.trim().replace(/^"|"$/g, ""));
    const timestamp = Date.parse(columns[timestampIndex] ?? "");
    const actual = Number(columns[valueIndex] ?? "");
    if (!Number.isFinite(timestamp) || !Number.isFinite(actual)) return [];
    return [{
      timestamp,
      stationId: stationIndex >= 0 ? (columns[stationIndex] || null) : null,
      actual,
    }];
  });
}

export function loadValidationStatus(): ValidationStatus {
  const datasetPath = findDataset();
  if (!datasetPath) {
    return {
      status: "not_loaded",
      message: "No real validation dataset loaded yet",
      datasetLabel: "No real validation dataset loaded yet",
      filename: null,
      rowCount: null,
      trainingRows: null,
      validationRows: null,
      mae: null,
      rmse: null,
      r2: null,
    };
  }

  const rows = parseCsv(readFileSync(datasetPath, "utf8")).sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  if (rows.length < 5) {
    return {
      status: "not_loaded",
      message: "The real validation dataset needs at least five valid rows",
      datasetLabel: "Real dataset needs more valid rows",
      filename: datasetPath.split("/").pop() ?? "real_historical.csv",
      rowCount: rows.length,
      trainingRows: null,
      validationRows: null,
      mae: null,
      rmse: null,
      r2: null,
    };
  }

  const splitIndex = Math.max(1, Math.floor(rows.length * 0.8));
  const trainingRows = rows.slice(0, splitIndex);
  const validationRows = rows.slice(splitIndex);
  const stationBaselines = new Map<string, number>();
  trainingRows.forEach((row) => {
    if (row.stationId) stationBaselines.set(row.stationId, row.actual);
  });
  const trainingMean =
    trainingRows.reduce((sum, row) => sum + row.actual, 0) / trainingRows.length;
  const predictions = validationRows.map((row) =>
    row.stationId ? (stationBaselines.get(row.stationId) ?? trainingMean) : trainingMean,
  );
  const errors = validationRows.map((row, index) => predictions[index] - row.actual);
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
  const mean = validationRows.reduce((sum, row) => sum + row.actual, 0) / validationRows.length;
  const totalSquares = validationRows.reduce((sum, row) => sum + (row.actual - mean) ** 2, 0);
  const residualSquares = validationRows.reduce((sum, _row, index) => sum + errors[index] ** 2, 0);

  return {
    status: "loaded",
    message: "Metrics computed from a chronological 80/20 split; held-out rows never form predictions",
    datasetLabel: `Validation — real historical data (source: ${datasetPath.split("/").pop() ?? "real_historical.csv"})`,
    filename: datasetPath.split("/").pop() ?? "real_historical.csv",
    rowCount: rows.length,
    trainingRows: trainingRows.length,
    validationRows: validationRows.length,
    mae: Number(mae.toFixed(2)),
    rmse: Number(rmse.toFixed(2)),
    r2: Number((totalSquares === 0 ? 0 : 1 - residualSquares / totalSquares).toFixed(3)),
  };
}