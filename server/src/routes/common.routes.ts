import { Router } from "express";
import { getProvincesController, getFilterOptionsController } from "../controllers/common.controllers.js";
import databaseService from '../services/database.services.js';
import { wrapAsync } from '../utils/handlers.js';

const commonRouter = Router();

commonRouter.get("/provinces", getProvincesController);
commonRouter.get("/filter-options", getFilterOptionsController);
commonRouter.get('/universities', wrapAsync(async (_req: any, res: any) => {
  const result = await databaseService.universities.find({}, { projection: { _id: 0, code: 1, name: 1, domains: 1 } }).sort({ name: 1 }).toArray();
  res.json({ result });
}));

export default commonRouter;
