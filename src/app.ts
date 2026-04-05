import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import authRoutes from "./routes/auth.routes.js";
import routes from "./routes/index.routes.js";
import "./types/express-augment.js";

export function createApp() {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());
  app.use(authRoutes);
  app.use(routes);
  app.use(errorHandler);
  return app;
}
