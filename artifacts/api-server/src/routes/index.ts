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
