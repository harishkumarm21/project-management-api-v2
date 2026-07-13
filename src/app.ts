import express from "express";

import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { sendSuccess } from "./utils/api-response.js";

const app = express();

app.use(express.json());

app.use("/health", (_req, res) => {
  sendSuccess({ res, message: "Api is working", statusCode: 200, data: {} });
})

app.use("/api/v1/auth", authRouter);

app.use(notFound);

app.use(errorHandler);

export default app;