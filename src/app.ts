import express from "express";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import authRoutes from "./routes/auth.routes.js";
import fileRoutes from "./routes/file.routes.js";
import routes from "./routes/index.routes.js";
import "./types/express-augment.js";

export function createApp() {
  const app = express();
  app.use(corsMiddleware);
  app.use(requestLogger);
  app.use(express.json());
  app.use(authRoutes);
  app.use(fileRoutes);
  app.use(routes);
  app.use(errorHandler);
  return app;
}
