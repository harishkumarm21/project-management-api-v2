import express from "express";

import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { authRouter } from "./modules/auth/auth.routes.js";

const app = express();

app.use(express.json());

app.use("/api/v1/auth", authRouter);

app.use(notFound);

app.use(errorHandler);

export default app;