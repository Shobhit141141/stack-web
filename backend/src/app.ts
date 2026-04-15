import express from "express";
import { corsMiddleware } from "./middleware/cors.middleware.js";
import { errorHandler } from "./middleware/error-handler.middleware.js";
import { requestLogger } from "./middleware/request-logger.middleware.js";
import routes from "./routes/index.routes.js";
import "./types/express-augment.js";

const app = express();
app.use(corsMiddleware);
app.use(requestLogger);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(routes);
app.use(errorHandler);

// export the configured express app instance
export default app;
